const configuredOrigins = [
  "https://dressupsesh.studio",
  "https://dressupsesh.com",
  "https://www.dressupsesh.com",
];

export type StudioUser = { id: string; email?: string; owner: boolean; aal: "aal1" | "aal2" };
export type StudioAccess = {
  allowed: boolean;
  reason?: string;
  reservation_id?: number;
  owner?: boolean;
  plan?: string;
  items_used?: number;
  item_limit?: number | null;
  items_remaining?: number | null;
  current_item_started?: boolean;
  operation?: string;
  operation_used?: number;
  operation_limit?: number | null;
  paid?: boolean;
  access_suspended?: boolean;
  subscription_status?: string | null;
  current_period_end?: string | null;
  cancel_at_period_end?: boolean;
  purchased_creative_credits?: number;
  background_remaining?: number | null;
  copy_remaining?: number | null;
  creative_remaining?: number | null;
  bonus_background_credits?: number;
  bonus_copy_credits?: number;
  bonus_creative_credits?: number;
};

export class StudioAccessError extends Error {
  access: StudioAccess;
  constructor(access: StudioAccess) {
    super(access.reason || "ACCESS_DENIED");
    this.access = access;
  }
}

export function corsHeaders(request: Request) {
  const origin = request.headers.get("origin") || "";
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Expose-Headers": "X-Studio-Items-Remaining, X-Studio-Owner",
    "Vary": "Origin",
  };
  if (configuredOrigins.includes(origin)) headers["Access-Control-Allow-Origin"] = origin;
  return headers;
}

function parseDefaultKey(value: string | undefined) {
  if (!value) return "";
  try {
    const parsed = JSON.parse(value);
    return String(parsed?.default || Object.values(parsed || {})[0] || "");
  } catch {
    return value;
  }
}

export function projectConfig() {
  const projectUrl = Deno.env.get("SUPABASE_URL") || "";
  const publishableKey = parseDefaultKey(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS")) || Deno.env.get("SUPABASE_ANON_KEY") || "";
  const secretKey = parseDefaultKey(Deno.env.get("SUPABASE_SECRET_KEYS")) || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!projectUrl || !publishableKey || !secretKey) throw new Error("NOT_CONFIGURED");
  return { projectUrl, publishableKey, secretKey };
}

export async function requireUser(request: Request): Promise<StudioUser> {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) throw new Error("UNAUTHORIZED");
  const { projectUrl, publishableKey, secretKey } = projectConfig();
  const response = await fetch(`${projectUrl}/auth/v1/user`, { headers: { Authorization: authorization, apikey: publishableKey } });
  if (!response.ok) throw new Error("UNAUTHORIZED");
  const user = await response.json();
  if (!user?.id) throw new Error("UNAUTHORIZED");
  const profileResponse = await fetch(`${projectUrl}/rest/v1/studio_profiles?id=eq.${encodeURIComponent(String(user.id))}&select=plan&limit=1`, {
    headers: { Authorization: `Bearer ${secretKey}`, apikey: secretKey },
  });
  if (!profileResponse.ok) throw new Error("ACCESS_SERVICE_ERROR");
  const profiles = await profileResponse.json();

  let aal: "aal1" | "aal2" = "aal1";
  try {
    const token = authorization.slice(7);
    const encoded = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const payload = JSON.parse(atob(encoded.padEnd(Math.ceil(encoded.length / 4) * 4, "=")));
    if (payload?.aal === "aal2") aal = "aal2";
  } catch {
    aal = "aal1";
  }
  return {
    id: String(user.id),
    email: String(user.email || ""),
    owner: profiles?.[0]?.plan === "owner",
    aal,
  };
}

export async function requireOwner(request: Request) {
  const user = await requireUser(request);
  if (!user.owner || user.aal !== "aal2") throw new Error("FORBIDDEN");
  return user;
}

async function rpc(name: string, body: Record<string, unknown>) {
  const { projectUrl, secretKey } = projectConfig();
  const response = await fetch(`${projectUrl}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: { apikey: secretKey, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    console.error(`Studio RPC ${name} failed`, response.status, JSON.stringify(payload).slice(0, 800));
    throw new Error("ACCESS_SERVICE_ERROR");
  }
  return payload;
}

export async function membershipRefundStatus(user: StudioUser): Promise<{ blocked: boolean }> {
  const status = await rpc("studio_membership_refund_status", { p_user_id: user.id });
  if (!status || typeof status.blocked !== "boolean") throw new Error("ACCESS_SERVICE_ERROR");
  return status;
}

export async function getStudioAccess(user: StudioUser, clientItemId?: string | null): Promise<StudioAccess> {
  const access = await rpc("studio_authorize_operation", {
    p_user_id: user.id,
    p_is_owner: user.owner,
    p_client_item_id: clientItemId || null,
    p_operation: null,
  }) as StudioAccess;
  if (!access?.allowed) throw new StudioAccessError(access || { allowed: false, reason: "ACCESS_SERVICE_ERROR" });
  return access;
}

export async function reserveStudioUsage(
  user: StudioUser,
  clientItemId: string,
  operation: string,
  clientPhotoId?: string | null,
): Promise<StudioAccess> {
  const access = await rpc("studio_authorize_operation", {
    p_user_id: user.id,
    p_is_owner: user.owner,
    p_client_item_id: clientItemId,
    p_operation: operation,
  }) as StudioAccess;
  if (!access?.allowed || !access.reservation_id) throw new StudioAccessError(access || { allowed: false, reason: "ACCESS_SERVICE_ERROR" });
  if (clientPhotoId) {
    await rpc("studio_attach_usage_identity", {
      p_user_id: user.id,
      p_reservation_id: access.reservation_id,
      p_client_photo_id: clientPhotoId,
    }).catch((error) => console.error("Studio usage identity could not be recorded", error));
  }
  return access;
}

export async function completeStudioUsage(
  user: StudioUser,
  reservationId: number,
  options: {
    success: boolean;
    provider?: string | null;
    model?: string | null;
    estimatedCostMicros?: number | null;
    pricingVersion?: string | null;
    providerUsage?: unknown;
  },
) {
  const completed = await rpc("studio_complete_usage", {
    p_user_id: user.id,
    p_reservation_id: reservationId,
    p_success: options.success,
    p_provider: options.provider || null,
    p_model: options.model || null,
    p_estimated_cost_micros: options.estimatedCostMicros ?? null,
    p_provider_usage: options.providerUsage ?? null,
  });
  if (completed && options.pricingVersion) {
    await rpc("studio_record_usage_pricing", {
      p_user_id: user.id,
      p_reservation_id: reservationId,
      p_pricing_version: options.pricingVersion,
    }).catch((error) => console.error("Studio usage pricing version could not be recorded", error));
  }
  return completed;
}

export function errorResponse(error: unknown, headers: Record<string, string>) {
  const access = error instanceof StudioAccessError ? error.access : undefined;
  const code = access?.reason || (error instanceof Error ? error.message : "UNKNOWN");
  const status = code === "UNAUTHORIZED" ? 401
    : ["FORBIDDEN", "ACCESS_DISABLED"].includes(code) ? 403
    : ["SUBSCRIPTION_REQUIRED", "ALREADY_SUBSCRIBED", "REFUNDED_SUBSCRIPTION_ACTIVE", "NO_BILLING_ACCOUNT"].includes(code) ? 409
    : ["TRIAL_EXHAUSTED", "SUBSCRIPTION_REFUNDED"].includes(code) ? 402
    : ["OPERATION_LIMIT", "ITEM_LIMIT"].includes(code) ? 429
    : ["INVALID_ITEM", "INVALID_OPERATION"].includes(code) ? 400
    : ["NOT_CONFIGURED", "ACCESS_SERVICE_ERROR"].includes(code) ? 503
    : 500;
  const message = code === "SUBSCRIPTION_REFUNDED"
    ? "Your membership was refunded. Subscribe to continue using Studio."
    : code === "REFUNDED_SUBSCRIPTION_ACTIVE"
      ? "Your membership was refunded. Open Manage billing to cancel the existing subscription, then subscribe again."
    : code === "TRIAL_EXHAUSTED"
    ? "You’ve completed your three free listings. Subscribe to continue with monthly tool credits."
    : code === "ITEM_LIMIT"
      ? "Your listing allowance is exhausted."
    : code === "OPERATION_LIMIT"
      ? "You’ve reached the included limit for that tool. Add creative credits or wait for the next billing period."
      : code === "SUBSCRIPTION_REQUIRED"
        ? "Subscribe to the Private Beta before adding creative credits."
        : code === "ALREADY_SUBSCRIBED"
          ? "This account already has an active subscription."
          : code === "NO_BILLING_ACCOUNT"
            ? "No billing account was found for this Studio account."
      : status === 503
        ? "This service is temporarily unavailable. Please try again shortly."
        : status < 500
          ? "You do not have access to this studio."
          : "The request could not be completed.";
  return new Response(JSON.stringify({ error: message, code, access }), {
    status,
    headers: { ...headers, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}



