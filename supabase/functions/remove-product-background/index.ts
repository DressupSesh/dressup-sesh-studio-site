import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {
  completeStudioUsage,
  corsHeaders,
  errorResponse,
  requireUser,
  reserveStudioUsage,
  type StudioAccess,
  type StudioUser,
} from "../_shared/security.ts";
import {
  REPLICATE_PRICING_VERSION,
  replicateL40SCostMicros,
} from "../_shared/provider-costs.ts";

const modelName = "recraft-ai/recraft-remove-background";
const predictionEndpoint = `https://api.replicate.com/v1/models/${modelName}/predictions`;
const allowedOutputHosts = ["replicate.delivery", "pbxt.replicate.delivery"];

function json(data: Record<string, unknown>, status: number, headers: Record<string, string>) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...headers, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function validImage(file: File) {
  return /^(image\/png|image\/jpeg|image\/webp)$/i.test(file.type) && file.size <= 4 * 1024 * 1024;
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

async function sha256Hex(bytes: Uint8Array) {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function safeOutputUrl(value: unknown): URL | null {
  // Providers can return one file, a URL object, or a list of files.
  if (Array.isArray(value)) {
    for (const entry of value.slice(0, 16)) {
      if (Array.isArray(entry)) continue;
      const url = safeOutputUrl(entry);
      if (url) return url;
    }
    return null;
  }
  const candidate = typeof value === "string"
    ? value
    : value && typeof value === "object" && "url" in value
      ? String((value as { url: unknown }).url)
      : "";
  if (!candidate) return null;
  try {
    const url = new URL(candidate.trim());
    const allowed = !url.username && !url.password && (!url.port || url.port === "443") && url.protocol === "https:" && allowedOutputHosts.some((host) =>
      url.hostname === host || url.hostname.endsWith(`.${host}`)
    );
    return allowed ? url : null;
  } catch {
    return null;
  }
}

async function predictionResult(initial: Record<string, unknown>, token: string) {
  let prediction = initial;
  for (let attempt = 0; attempt < 10; attempt += 1) {
    if (prediction.output) return prediction;
    if (["failed", "canceled"].includes(String(prediction.status || ""))) return prediction;
    const getUrl = String((prediction.urls as Record<string, unknown> | undefined)?.get || "");
    if (!getUrl) return prediction;
    await new Promise((resolve) => setTimeout(resolve, 1000));
    const response = await fetch(getUrl, { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) return prediction;
    prediction = await response.json();
  }
  return prediction;
}

function retryDelay(response: Response, payload: Record<string, unknown>, attempt: number) {
  const retryAfter = Number(response.headers.get("retry-after") || "");
  if (Number.isFinite(retryAfter) && retryAfter > 0) return Math.min(35000, retryAfter * 1000);
  const detail = String(payload.detail || payload.error || "");
  const seconds = Number(detail.match(/(?:~|in\s+)(\d+)\s*s(?:econds?)?/i)?.[1] || "");
  if (Number.isFinite(seconds) && seconds > 0) return Math.min(35000, seconds * 1000 + 500);
  return [2000, 5000, 11000][attempt] || 11000;
}

async function createPrediction(token: string, body: Record<string, unknown>) {
  let lastResponse: Response | null = null;
  let lastPayload: Record<string, unknown> = {};
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await fetch(predictionEndpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Prefer: "wait=45",
        "Cancel-After": "60s",
      },
      body: JSON.stringify(body),
    });
    const payload = await response.json().catch(() => ({}));
    lastResponse = response;
    lastPayload = payload;
    if (response.status !== 429 || attempt === 3) return { response, payload };
    await new Promise((resolve) => setTimeout(resolve, retryDelay(response, payload, attempt)));
  }
  return { response: lastResponse!, payload: lastPayload };
}

Deno.serve(async (request: Request) => {
  const cors = corsHeaders(request);
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405, headers: cors });

  let user: StudioUser | null = null;
  let access: StudioAccess | null = null;
  let reservationId = 0;
  let reservationCompleted = false;
  let inputSha256 = "";
  try {
    user = await requireUser(request);
    const token = Deno.env.get("REPLICATE_API_TOKEN");
    if (!token) {
      return json({ error: "Background cleanup is temporarily unavailable." }, 503, cors);
    }

    const form = await request.formData();
    const clientItemId = String(form.get("client_item_id") || "").trim();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(clientItemId)) {
      return json({ error: "Start a new item and try again." }, 400, cors);
    }
    const clientPhotoId = String(form.get("client_photo_id") || "").trim();
    if (clientPhotoId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(clientPhotoId)) {
      return json({ error: "Reload the Studio and try this photo again." }, 400, cors);
    }
    const imageValue = form.get("image");
    if (!(imageValue instanceof File) || !imageValue.size) {
      return json({ error: "Add a product photo first." }, 400, cors);
    }
    if (!validImage(imageValue)) {
      return json({ error: "Cleanup photos must be JPG, PNG or WEBP files no larger than 4 MB." }, 415, cors);
    }
    const bytes = new Uint8Array(await imageValue.arrayBuffer());
    inputSha256 = await sha256Hex(bytes);
    const dataUri = `data:${imageValue.type};base64,${bytesToBase64(bytes)}`;

    access = await reserveStudioUsage(user, clientItemId, "background_remove", clientPhotoId || null);
    reservationId = Number(access.reservation_id || 0);

    const { response, payload } = await createPrediction(token, {
      input: { image: dataUri },
    });
    if (!response.ok) {
      await completeStudioUsage(user, reservationId, {
        success: false,
        provider: "replicate",
        model: modelName,
        pricingVersion: REPLICATE_PRICING_VERSION,
        providerUsage: { status: response.status, prediction_id: payload?.id || null, input_sha256: inputSha256 },
      });
      reservationCompleted = true;
      console.error("Replicate create prediction error", response.status, JSON.stringify(payload).slice(0, 1200));
      const message = response.status === 429
        ? "The background cleanup service is busy. Wait a moment and try again."
        : "Background cleanup is temporarily unavailable. Please try again shortly.";
      return json({ error: message }, response.status, cors);
    }

    let prediction = await predictionResult(payload, token);
    // A completed initial response may not yet carry the usable output.
    // Re-read this prediction, never create another chargeable prediction.
    if (prediction.status === "succeeded" && !safeOutputUrl(prediction.output) && /^[a-zA-Z0-9_-]+$/.test(String(prediction.id || ""))) {
      for (let attempt = 0; attempt < 3; attempt++) {
        const latest = await fetch(`https://api.replicate.com/v1/predictions/${prediction.id}`, {
          headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10000),
        });
        if (latest.ok) prediction = await latest.json();
        if (safeOutputUrl(prediction.output)) break;
        if (attempt < 2) await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    if (["failed", "canceled"].includes(String(prediction.status || ""))) {
      await completeStudioUsage(user, reservationId, {
        success: false,
        provider: "replicate",
        model: modelName,
        estimatedCostMicros: replicateL40SCostMicros(prediction.metrics),
        pricingVersion: REPLICATE_PRICING_VERSION,
        providerUsage: { prediction_id: prediction.id || null, status: prediction.status || null, metrics: prediction.metrics || null, input_sha256: inputSha256 },
      });
      reservationCompleted = true;
      console.error("Replicate prediction failed", JSON.stringify(prediction).slice(0, 1200));
      return json({ error: "The background remover could not process this photo. Try another angle or crop." }, 422, cors);
    }
    const outputUrl = safeOutputUrl(prediction.output);
    if (!outputUrl) {
      await completeStudioUsage(user, reservationId, {
        success: false,
        provider: "replicate",
        model: modelName,
        estimatedCostMicros: replicateL40SCostMicros(prediction.metrics),
        pricingVersion: REPLICATE_PRICING_VERSION,
        providerUsage: { prediction_id: prediction.id || null, status: prediction.status || null, input_sha256: inputSha256,
          output_shape: Array.isArray(prediction.output) ? "array" : typeof prediction.output,
          output_host: (() => { try { return new URL(typeof prediction.output === "string" ? prediction.output : String((prediction.output as {url?:unknown})?.url || "")).hostname; } catch { return null; } })(),
          error: prediction.status === "succeeded" ? "UNSUPPORTED_OUTPUT" : "OUTPUT_PENDING" },
      });
      reservationCompleted = true;
      return prediction.status === "succeeded"
        ? json({ error: "Your photo was processed, but the finished image could not be retrieved. Please retry this photo.", code: "UNSUPPORTED_OUTPUT" }, 502, cors)
        : json({ error: "The background remover is still processing this photo. Please try again shortly.", code: "OUTPUT_PENDING" }, 504, cors);
    }

    const outputResponse = await fetch(outputUrl, { redirect: "error", signal: AbortSignal.timeout(20000) });
    if (!outputResponse.ok) throw new Error("OUTPUT_FETCH_FAILED");
    const outputType = outputResponse.headers.get("content-type") || "image/png";
    if (!outputType.startsWith("image/")) throw new Error("INVALID_OUTPUT_TYPE");
    const output = await outputResponse.arrayBuffer();
    if (!output.byteLength || output.byteLength > 20 * 1024 * 1024) throw new Error("INVALID_OUTPUT_SIZE");

    await completeStudioUsage(user, reservationId, {
      success: true,
      provider: "replicate",
      model: modelName,
      estimatedCostMicros: replicateL40SCostMicros(prediction.metrics),
      pricingVersion: REPLICATE_PRICING_VERSION,
      providerUsage: { prediction_id: prediction.id || null, status: prediction.status || null, metrics: prediction.metrics || null, input_sha256: inputSha256 },
    });
    reservationCompleted = true;

    return new Response(output, {
      status: 200,
      headers: {
        ...cors,
        "Content-Type": outputType,
        "Cache-Control": "no-store",
        "Content-Disposition": "inline; filename=clean-product.png",
        "X-Studio-Items-Remaining": access?.items_remaining == null ? "unlimited" : String(access.items_remaining),
        "X-Studio-Owner": access?.owner ? "true" : "false",
      },
    });
  } catch (error) {
    if (user && reservationId && !reservationCompleted) {
      await completeStudioUsage(user, reservationId, {
        success: false,
        provider: "replicate",
        model: modelName,
        pricingVersion: REPLICATE_PRICING_VERSION,
        providerUsage: { error: error instanceof Error ? error.message : "UNKNOWN", input_sha256: inputSha256 || null },
      }).catch((completionError) => console.error("remove-product-background usage completion error", completionError));
    }
    console.error("remove-product-background error", error);
    return errorResponse(error, cors);
  }
});

