import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const config = window.DRESSUP_CONFIG || {};
const configured = Boolean(config.supabaseUrl && config.supabasePublishableKey);
const supabase = configured ? createClient(config.supabaseUrl, config.supabasePublishableKey) : null;
const PENDING_AUTH_ACTION_KEY = "dressupSeshPendingAuthAction";
const PENDING_CONFIRMATION_EMAIL_KEY = "dressupSeshPendingConfirmationEmail";

function readSessionValue(key) {
  try {
    return window.sessionStorage.getItem(key) || "";
  } catch {
    return "";
  }
}

function writeSessionValue(key, value) {
  try {
    if (value) window.sessionStorage.setItem(key, value);
    else window.sessionStorage.removeItem(key);
  } catch {
    // The flow still works when browser storage is unavailable.
  }
}

const requestedAuthIntent = new URLSearchParams(window.location.search).get("intent");
const state = {
  photos: [],
  clientItemId: crypto.randomUUID(),
  access: null,
  background: "white",
  processing: false,
  processedCount: 0,
  processingTotal: 0,
  session: null,
  creativeType: "on_body",
  creativeReference: null,
  creativeReferenceUrl: "",
  creativeResults: [],
  creativeGenerating: false,
  listingGenerating: false,
  editorPhotoId: null,
  editorImage: null,
  editorOriginalCanvas: null,
  editorMode: "remove",
  editorStrokes: [],
  editorDrawing: false,
  editorCurrentStroke: null,
  editorZoom: 1,
  editorBaseDisplayWidth: 0,
  editorPanStart: null,
  pendingConfirmationEmail: readSessionValue(PENDING_CONFIRMATION_EMAIL_KEY),
  pendingAuthAction: requestedAuthIntent === "subscribe" ? "subscribe" : readSessionValue(PENDING_AUTH_ACTION_KEY),
  checkoutContinuing: false
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const elements = {
  input: $("#file-input"), dropzone: $("#dropzone"), grid: $("#photo-grid"),
  count: $("#photo-count"), actionBar: $("#action-bar"), process: $("#process-button"), clearAll: $("#clear-all"),
  studioIntro: $("#studio-intro"), goalTracker: $("#goal-tracker"), goalTrackerCopy: $("#goal-tracker-copy"),
  photosTabStatus: $("#photos-tab-status"), listingTabStatus: $("#listing-tab-status"), creativeTabStatus: $("#creative-tab-status"),
  saveAllAssets: $("#save-all-assets"), copyButton: $("#copy-all-global"),
  listingPanel: $("#listing-panel"), photosPanel: $("#photos-panel"), creativePanel: $("#creative-panel"),
  emptyListing: $("#empty-listing"), listingLayout: $("#listing-layout"), sourceStrip: $("#source-strip"),
  listingButton: $("#listing-button"), listingNote: $("#listing-note"), listingAdditional: $("#listing-additional-info"), listingOutput: $("#listing-output"),
  outputPlaceholder: $("#output-placeholder"), listingError: $("#listing-error"),
  authButton: $("#auth-button"), authDialog: $("#auth-dialog"), authForm: $("#auth-form"),
  authTitle: $("#auth-title"), authDescription: $("#auth-description"), signupButton: $("#signup-button"),
  authEmail: $("#auth-email"), authPassword: $("#auth-password"), authMessage: $("#auth-message"),
  loginGate: $("#login-gate"), gateSignIn: $("#gate-signin"), gateCreate: $("#gate-create"), gateMessage: $("#gate-message"),
  forgotPasswordButton: $("#forgot-password-button"), resendButton: $("#resend-button"),
  usagePill: $("#usage-pill"), planButton: $("#plan-button"), paywallDialog: $("#paywall-dialog"),
  paywallSubscribe: $("#paywall-subscribe"),
  billingDialog: $("#billing-dialog"), billingClose: $("#billing-close"), billingPlanTitle: $("#billing-plan-title"),
  billingSummary: $("#billing-summary"), billingItems: $("#billing-items"), billingCredits: $("#billing-credits"),
  billingSubscribe: $("#billing-subscribe"), billingAddCredits: $("#billing-add-credits"), billingManage: $("#billing-manage"),
  billingMessage: $("#billing-message"), billingProWaitlist: $("#billing-pro-waitlist"), proWaitlistForm: $("#pro-waitlist-form"),
  proWaitlistEmail: $("#pro-waitlist-email"), proWaitlistMessage: $("#pro-waitlist-message"),
  emptyCreative: $("#empty-creative"), creativeLayout: $("#creative-layout"), creativeSourceStrip: $("#creative-source-strip"),
  creativeReference: $("#creative-reference"), referencePicker: $("#reference-picker"), referencePreview: $("#reference-preview"),
  referenceImage: $("#reference-image"), removeReference: $("#remove-reference"), creativeInstructions: $("#creative-instructions"),
  creativeGenerate: $("#creative-generate"), creativeOutput: $(".creative-output"), creativePlaceholder: $("#creative-placeholder"),
  creativeResults: $("#creative-results"), creativeCount: $("#creative-count"), creativeSaveAll: $("#creative-save-all"), creativeError: $("#creative-error"),
  editorDialog: $("#photo-editor-dialog"), editorStage: $("#photo-editor-stage"), editorCanvas: $("#photo-editor-canvas"), editorBrush: $("#editor-brush-size"),
  editorBrushOutput: $("#editor-brush-output"), editorUndo: $("#editor-undo"), editorReset: $("#editor-reset"),
  editorRemove: $("#editor-mode-remove"), editorRestore: $("#editor-mode-restore"), editorMove: $("#editor-mode-move"),
  editorZoom: $("#editor-zoom"), editorZoomOutput: $("#editor-zoom-output"), editorZoomOut: $("#editor-zoom-out"), editorZoomIn: $("#editor-zoom-in"),
  editorCancel: $("#editor-cancel"), editorApply: $("#editor-apply")
};
const authCaptcha = window.DRESSUP_TURNSTILE?.create('auth-turnstile', {
  action: 'studio_auth',
  onError: message => { elements.authMessage.textContent = message; }
}) || { enabled: false, getToken: () => undefined, reset: () => {} };

function getCaptchaToken(captcha, messageElement) {
  const token = captcha.getToken();
  if (captcha.enabled && !token) {
    messageElement.textContent = 'Complete the security check, then try again.';
    return null;
  }
  return token;
}

function setPendingAuthAction(action = "") {
  state.pendingAuthAction = action === "subscribe" ? "subscribe" : "";
  writeSessionValue(PENDING_AUTH_ACTION_KEY, state.pendingAuthAction);
}

function updateAuthDialogCopy() {
  const subscribing = state.pendingAuthAction === "subscribe";
  elements.authTitle.textContent = subscribing ? "Create your account to subscribe" : "Sign in to your studio";
  elements.authDescription.textContent = subscribing
    ? "Create an account or sign in. After email confirmation, we’ll take you directly to secure checkout."
    : "Use an existing account or create one to process your first three items free.";
  elements.signupButton.textContent = subscribing ? "CREATE ACCOUNT & CONTINUE" : "CREATE FREE ACCOUNT";
}

function captchaFailureMessage(error) {
  const message = String(error?.message || "");
  return /captcha|invalid-input-response/i.test(message)
    ? "The security check expired. Complete the new check, then try again."
    : message;
}

const creativeLabels = {
  on_body: "GENERATE ON-THE-BODY PHOTO",
  ghost: "GENERATE GHOST MANNEQUIN",
  influencer: "GENERATE INFLUENCER POST",
  editorial: "GENERATE EDITORIAL IMAGE"
};

if (configured) {
  $("#connection-pill").classList.add("online");
  $("#connection-copy").textContent = "Listing connection ready";
}

function applyAccess(access) {
  if (!access) return;
  state.access = access;
  const subscribed = Boolean(access.owner || access.paid);
  document.body.classList.toggle("subscribed-studio", subscribed);
  elements.goalTracker.classList.toggle("hidden", !subscribed);
  elements.usagePill.classList.remove("hidden");
  if (access.owner) {
    elements.usagePill.textContent = "UNLIMITED ACCESS";
  } else if (access.paid) {
    const remaining = Math.max(0, Number(access.items_remaining || 0));
    elements.usagePill.textContent = `${remaining} ITEM${remaining === 1 ? "" : "S"} LEFT`;
  } else {
    const remaining = Math.max(0, Number(access.items_remaining || 0));
    elements.usagePill.textContent = `${remaining} FREE ITEM${remaining === 1 ? "" : "S"} LEFT`;
  }
  renderBilling(access);
  updateWorkflowSignals();
}

function setTabStatus(element, status, label) {
  if (!element) return;
  element.dataset.status = status || "";
  element.parentElement?.setAttribute("aria-label", label);
}

function updateWorkflowSignals() {
  const hasPhotos = state.photos.length > 0;
  const productPhotos = state.photos.filter((photo) => photo.preview && !photo.referenceOnly && !photo.error);
  const photosReady = productPhotos.length > 0 && productPhotos.every((photo) => Boolean(photo.resultBlob));
  const listingReady = Boolean(elements.listingOutput.textContent.trim());
  const creativeReady = state.creativeResults.length > 0;

  setTabStatus(
    elements.photosTabStatus,
    state.processing ? "processing" : photosReady ? "ready" : "",
    `Photo Cleanup${state.processing ? ": processing" : photosReady ? ": assets ready" : ": nothing ready yet"}`
  );
  setTabStatus(
    elements.listingTabStatus,
    state.listingGenerating ? "processing" : listingReady ? "ready" : "",
    `Listing Copy${state.listingGenerating ? ": processing" : listingReady ? ": assets ready" : ": nothing ready yet"}`
  );
  setTabStatus(
    elements.creativeTabStatus,
    state.creativeGenerating ? "processing" : creativeReady ? "ready" : "",
    `Creative Images${state.creativeGenerating ? ": processing" : creativeReady ? ": assets ready" : ": nothing ready yet"}`
  );

  let goal = "Add product photos";
  if (state.processing) goal = "Clean the uploaded photos";
  else if (hasPhotos && !photosReady) goal = "Remove the photo backgrounds";
  else if (photosReady && !listingReady) goal = "Create the listing copy";
  else if (state.listingGenerating) goal = "Finish the listing copy";
  else if (listingReady && !creativeReady) goal = "Create a campaign image or save the item";
  else if (state.creativeGenerating) goal = "Finish the campaign image";
  else if (photosReady && listingReady) goal = "Save all assets and start the next item";
  elements.goalTrackerCopy.textContent = goal;

  const hasSavableAssets = hasPhotos || listingReady || creativeReady;
  elements.saveAllAssets.disabled = !hasSavableAssets || state.processing || state.creativeGenerating || state.listingGenerating;
  elements.copyButton.disabled = !listingReady;
}

function renderBilling(access = state.access) {
  if (!access) return;
  const paid = Boolean(access.paid);
  const owner = Boolean(access.owner);
  const remaining = owner ? "∞" : Math.max(0, Number(access.items_remaining || 0));
  const credits = Math.max(0, Number(access.purchased_creative_credits || 0));
  elements.billingItems.textContent = String(remaining);
  elements.billingCredits.textContent = String(credits);
  elements.billingPlanTitle.textContent = owner ? "Studio Owner" : paid ? "Private Beta" : "Free Studio Trial";
  elements.billingSummary.textContent = owner
    ? "Unlimited Studio access is active."
    : paid
      ? access.cancel_at_period_end
        ? `Your plan remains active through ${formatBillingDate(access.current_period_end)}.`
        : "Your monthly allowance includes 20 items, 25 copy generations and 25 creative images."
      : "Three complete items are included. Subscribe whenever you are ready to keep listing.";
  elements.billingSubscribe.classList.toggle("hidden", owner || paid);
  elements.billingAddCredits.classList.toggle("hidden", owner || !paid);
  elements.billingManage.classList.toggle("hidden", owner || !paid);
}

function formatBillingDate(value) {
  if (!value) return "the end of your billing period";
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? "the end of your billing period" : date.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });
}

function showPaywall() {
  if (!elements.paywallDialog.open) elements.paywallDialog.showModal();
}

function handleApiProblem(problem = {}) {
  if (problem.access) applyAccess(problem.access);
  if (problem.code === "TRIAL_EXHAUSTED") showPaywall();
  if (problem.code === "ITEM_LIMIT") openBilling("You’ve used the 20 items included in this billing period.");
  if (problem.code === "OPERATION_LIMIT" && problem.access?.operation === "creative_image" && state.access?.paid) {
    openBilling("You’ve used the creative images included this month. Add 10 more whenever you need them.");
  }
}

async function verifyStudioSession(session) {
  if (!configured || !session) return null;
  try {
    const query = new URLSearchParams({ client_item_id: state.clientItemId });
    const response = await fetch(`${config.supabaseUrl}/functions/v1/create-listing?${query}`, {
      method: "GET",
      headers: {
        apikey: config.supabasePublishableKey,
        Authorization: `Bearer ${session.access_token}`
      }
    });
    if (!response.ok) return null;
    const data = await response.json();
    return data.access || null;
  } catch {
    return null;
  }
}

async function refreshAccess() {
  if (!state.session) return null;
  const access = await verifyStudioSession(state.session);
  if (access) applyAccess(access);
  return access;
}

async function refreshSession(session) {
  document.body.classList.add("auth-pending");
  const access = await verifyStudioSession(session);
  state.session = access ? session : null;
  state.access = access;
  const locked = !state.session;
  document.body.classList.toggle("studio-locked", locked);
  document.body.classList.remove("auth-pending");
  elements.authButton.textContent = state.session ? "SIGN OUT" : "SIGN IN";
  elements.authButton.classList.toggle("signed-in", Boolean(state.session));
  elements.usagePill.classList.toggle("hidden", !state.session);
  elements.planButton.classList.toggle("hidden", !state.session);
  if (access) applyAccess(access);
  else {
    document.body.classList.remove("subscribed-studio");
    elements.goalTracker.classList.add("hidden");
  }
  elements.gateMessage.textContent = session && !access
    ? "We couldn’t verify this account. Please sign in again."
    : "Try three complete items free, or sign in to continue.";
  if (configured) $("#connection-copy").textContent = state.session ? "Studio ready" : "Sign in required";
  render();
  if (state.session) void continuePendingCheckout();
}

async function invokeStudioFunction(name, body = {}) {
  if (!state.session) throw new Error("SIGN_IN_REQUIRED");
  const response = await fetch(`${config.supabaseUrl}/functions/v1/${name}`, {
    method: "POST",
    headers: {
      apikey: config.supabasePublishableKey,
      Authorization: `Bearer ${state.session.access_token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || "The request could not be completed.");
    error.code = data.code;
    throw error;
  }
  return data;
}

async function beginCheckout(functionName, button) {
  const original = button.textContent;
  button.disabled = true;
  button.textContent = "OPENING CHECKOUT…";
  elements.billingMessage.textContent = "";
  try {
    const data = await invokeStudioFunction(functionName);
    if (!data.url) throw new Error("Checkout did not return a link.");
    window.location.assign(data.url);
  } catch (error) {
    elements.billingMessage.textContent = error.message || "Checkout could not be opened.";
    if (!elements.billingDialog.open) elements.billingDialog.showModal();
    button.disabled = false;
    button.textContent = original;
  }
}

async function continuePendingCheckout() {
  if (!state.session || state.pendingAuthAction !== "subscribe" || state.checkoutContinuing) return;
  state.checkoutContinuing = true;
  setPendingAuthAction("");
  if (elements.authDialog.open) elements.authDialog.close();
  await beginCheckout("create-checkout-session", elements.billingSubscribe);
  state.checkoutContinuing = false;
}

async function joinProWaitlist(email, button, messageElement) {
  if (!configured) {
    messageElement.textContent = "The waitlist is temporarily unavailable.";
    return false;
  }
  if (!email) {
    messageElement.textContent = "Add an email address to join the waitlist.";
    return false;
  }
  const original = button.textContent;
  button.disabled = true;
  button.textContent = "JOINING…";
  messageElement.textContent = "";
  try {
    const response = await fetch(`${config.supabaseUrl}/functions/v1/join-studio-waitlist`, {
      method: "POST",
      headers: { apikey: config.supabasePublishableKey, "Content-Type": "application/json" },
      body: JSON.stringify({ email })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "We could not add your email.");
    messageElement.textContent = "You’re on the Bulk Listing Pro list.";
    return true;
  } catch (error) {
    messageElement.textContent = error.message || "Please try again.";
    return false;
  } finally {
    button.disabled = false;
    button.textContent = original;
  }
}

function openBilling(message = "") {
  renderBilling();
  elements.billingMessage.textContent = message;
  if (!elements.billingDialog.open) elements.billingDialog.showModal();
}

if (supabase) {
  const { data } = await supabase.auth.getSession();
  await refreshSession(data.session);
  supabase.auth.onAuthStateChange((_event, session) => { void refreshSession(session); });
} else {
  await refreshSession(null);
}

const billingReturn = new URLSearchParams(window.location.search).get("billing");
if (billingReturn && state.session) {
  if (billingReturn === "cancelled") {
    openBilling("Checkout was cancelled. Nothing was charged.");
    const cleanUrl = new URL(window.location.href);
    cleanUrl.searchParams.delete("billing");
    history.replaceState({}, "", cleanUrl);
  } else {
    const successMessage = billingReturn === "credits-success"
      ? "Payment received. Your 10 creative images are being added now."
      : "Subscription received. Your Private Beta access is being activated now.";
    openBilling(successMessage);
    for (const delay of [500, 1200, 2400]) {
      await new Promise((resolve) => setTimeout(resolve, delay));
      await refreshAccess();
      if (billingReturn === "credits-success" && Number(state.access?.purchased_creative_credits || 0) > 0) break;
      if (billingReturn === "subscription-success" && state.access?.paid) break;
    }
    elements.billingMessage.textContent = billingReturn === "credits-success"
      ? "Your creative pack is ready."
      : state.access?.paid
        ? "Your Private Beta plan is active."
        : successMessage;
    const cleanUrl = new URL(window.location.href);
    cleanUrl.searchParams.delete("billing");
    history.replaceState({}, "", cleanUrl);
  }
}

const passwordResetReturn = new URLSearchParams(window.location.search).get("password-reset");
if (passwordResetReturn === "success") {
  elements.authMessage.textContent = "Password updated. Sign in with your new password.";
  if (!elements.authDialog.open) elements.authDialog.showModal();
  const cleanUrl = new URL(window.location.href);
  cleanUrl.searchParams.delete("password-reset");
  history.replaceState({}, "", cleanUrl);
}

function photoId(file) {
  return `${file.name}-${file.size}-${file.lastModified}-${crypto.randomUUID()}`;
}

function resultFileName(photo, index) {
  const originalName = photo.originalFile?.name || photo.file.name || `photo-${index + 1}`;
  const baseName = originalName.replace(/\.[^.]+$/, "").replace(/[^a-z0-9._-]+/gi, "-").replace(/^-|-$/g, "");
  return `clean-${String(index + 1).padStart(2, "0")}-${baseName || "photo"}.png`;
}

function referenceFileName(photo, index, source = photo.originalFile || photo.file) {
  const originalName = source?.name || photo.originalFile?.name || photo.file.name || `photo-${index + 1}`;
  const safeName = originalName.replace(/[^a-z0-9._-]+/gi, "-").replace(/^-|-$/g, "");
  return `reference-${String(index + 1).padStart(2, "0")}-${safeName || `photo-${index + 1}`}`;
}

function originalFileName(photo, index, source = photo.originalFile || photo.file) {
  const originalName = source?.name || `photo-${index + 1}`;
  const safeName = originalName.replace(/[^a-z0-9._-]+/gi, "-").replace(/^-|-$/g, "");
  return `original-${String(index + 1).padStart(2, "0")}-${safeName || `photo-${index + 1}`}`;
}

function recordMimeType(blob, filename) {
  if (blob.type) return blob.type;
  const extension = filename.split(".").pop()?.toLowerCase();
  return ({
    jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp",
    gif: "image/gif", heic: "image/heic", heif: "image/heif"
  })[extension] || "application/octet-stream";
}

function isHeicFile(file) {
  return /\.(heic|heif)$/i.test(file.name) || /^image\/hei(c|f)$/i.test(file.type);
}

async function convertHeicFile(file) {
  if (typeof window.heic2any !== "function") {
    throw new Error("The iPhone photo converter did not load.");
  }
  const converted = await window.heic2any({
    blob: file,
    toType: "image/jpeg",
    quality: 0.96
  });
  const blob = Array.isArray(converted) ? converted[0] : converted;
  const baseName = file.name.replace(/\.(heic|heif)$/i, "") || "iphone-photo";
  return new File([blob], `${baseName}.jpg`, {
    type: "image/jpeg",
    lastModified: file.lastModified
  });
}

async function preparePhoto(photo) {
  try {
    if (isHeicFile(photo.file)) {
      photo.status = "converting";
      photo.statusLabel = "preparing iPhone photo";
      render();
      photo.file = await convertHeicFile(photo.file);
    }
    photo.preview = URL.createObjectURL(photo.file);
    photo.status = "ready";
    photo.statusLabel = "ready";
  } catch (error) {
    photo.status = "error";
    photo.statusLabel = "try again";
    photo.error = "This iPhone photo couldn’t be converted. Please export it as JPEG and try again.";
    console.error("HEIC conversion failed", error);
  }
  render();
}

function addFiles(fileList) {
  const incoming = [...fileList].filter((file) => file.type.startsWith("image/") || /\.hei(c|f)$/i.test(file.name));
  const remaining = Math.max(0, 20 - state.photos.length);
  const additions = incoming.slice(0, remaining).map((file) => ({
    id: photoId(file),
    originalFile: file,
    file,
    normalizedFile: null,
    preview: "",
    status: isHeicFile(file) ? "converting" : "preparing",
    statusLabel: isHeicFile(file) ? "preparing iPhone photo" : "preparing",
    referenceOnly: false,
    cleanBaseBlob: null,
    editInstructions: [],
    resultUrl: "",
    error: ""
  }));
  state.photos.push(...additions);
  render();
  additions.forEach((photo) => { void preparePhoto(photo); });
}

function removePhoto(id) {
  const photo = state.photos.find((item) => item.id === id);
  if (photo) {
    URL.revokeObjectURL(photo.preview);
    if (photo.resultUrl) URL.revokeObjectURL(photo.resultUrl);
  }
  state.photos = state.photos.filter((item) => item.id !== id);
  render();
}

function toggleReferenceOnly(id) {
  if (state.processing || state.creativeGenerating) return;
  const photo = state.photos.find((item) => item.id === id);
  if (!photo?.preview) return;
  photo.referenceOnly = !photo.referenceOnly;
  photo.error = "";
  photo.status = photo.referenceOnly ? "reference" : photo.resultBlob ? "complete" : "ready";
  photo.statusLabel = photo.referenceOnly ? "reference only" : photo.resultBlob ? "ready" : "ready";
  render();
}

function removeCreativeReference() {
  if (state.creativeReferenceUrl) URL.revokeObjectURL(state.creativeReferenceUrl);
  state.creativeReference = null;
  state.creativeReferenceUrl = "";
  elements.creativeReference.value = "";
  elements.referenceImage.removeAttribute("src");
  elements.referencePreview.classList.add("hidden");
  elements.referencePicker.classList.remove("hidden");
}

function resetCreativeOutput() {
  state.creativeResults.forEach((result) => URL.revokeObjectURL(result.url));
  state.creativeResults = [];
  elements.creativeResults.innerHTML = "";
  elements.creativeResults.classList.add("hidden");
  elements.creativeSaveAll.classList.add("hidden");
  elements.creativeSaveAll.disabled = true;
  elements.creativeSaveAll.textContent = "SAVE ALL CREATIVE TO PHOTOS";
  elements.creativeCount.textContent = "";
  elements.creativePlaceholder.classList.remove("hidden");
  elements.creativeError.textContent = "";
  elements.creativeError.classList.add("hidden");
}

function renderCreativeResults() {
  const hasResults = state.creativeResults.length > 0;
  elements.creativePlaceholder.classList.toggle("hidden", hasResults);
  elements.creativeResults.classList.toggle("hidden", !hasResults);
  elements.creativeSaveAll.classList.toggle("hidden", !hasResults);
  elements.creativeSaveAll.disabled = !hasResults || state.creativeGenerating;
  elements.creativeSaveAll.textContent = hasResults
    ? `SAVE ALL CREATIVE TO PHOTOS · ${state.creativeResults.length}`
    : "SAVE ALL CREATIVE TO PHOTOS";
  elements.creativeCount.textContent = hasResults
    ? `${state.creativeResults.length} IMAGE${state.creativeResults.length === 1 ? "" : "S"} KEPT`
    : "";
  elements.creativeResults.innerHTML = state.creativeResults.map((result) => `
    <article class="creative-result-card">
      <img src="${result.url}" alt="Generated ${result.label}">
      <div class="creative-result-meta">
        <span>${result.label.toUpperCase()} · ${String(result.sequence).padStart(2, "0")}</span>
        <div class="output-actions">
          <button type="button" data-save-creative="${result.id}">SAVE TO PHOTOS</button>
          <a href="${result.url}" download="${result.filename}">DOWNLOAD</a>
        </div>
      </div>
    </article>`).join("");
  $$('[data-save-creative]').forEach((button) => button.addEventListener("click", () => {
    const result = state.creativeResults.find((item) => item.id === button.dataset.saveCreative);
    if (!result) return;
    void saveBlobToDevice(result.blob, result.filename, `Dressup Sesh ${result.label}`);
  }));
}

function clearAllPhotos() {
  if (!state.photos.length || state.processing || state.creativeGenerating) return;
  if (!window.confirm("Clear this item and start a new one?")) return;
  state.photos.forEach((photo) => {
    if (photo.preview) URL.revokeObjectURL(photo.preview);
    if (photo.resultUrl) URL.revokeObjectURL(photo.resultUrl);
  });
  state.photos = [];
  state.clientItemId = crypto.randomUUID();
  state.processedCount = 0;
  removeCreativeReference();
  resetCreativeOutput();
  elements.creativeInstructions.value = "";
  elements.listingOutput.textContent = "";
  elements.listingAdditional.value = "";
  elements.listingOutput.classList.add("hidden");
  elements.outputPlaceholder.classList.remove("hidden");
  elements.copyButton.disabled = true;
  elements.listingError.classList.add("hidden");
  elements.input.value = "";
  $("[data-tab='photos']").click();
  window.scrollTo({ top: 0, behavior: "smooth" });
  render();
  void refreshAccess();
}

function render() {
  const hasPhotos = state.photos.length > 0;
  const usablePhotos = state.photos.filter((photo) => photo.preview && (!photo.error || photo.resultBlob));
  const productPhotos = usablePhotos.filter((photo) => !photo.referenceOnly);
  const pendingCleanupPhotos = productPhotos.filter((photo) => !photo.resultBlob);
  const isPreparing = state.photos.some((photo) => photo.status === "converting" || photo.status === "preparing");
  elements.grid.classList.toggle("hidden", !hasPhotos);
  elements.actionBar.classList.toggle("hidden", !hasPhotos);
  elements.count.classList.toggle("hidden", !hasPhotos);
  elements.count.textContent = `${state.photos.length} PHOTO${state.photos.length === 1 ? "" : "S"}`;
  elements.process.disabled = !configured || !state.session || !pendingCleanupPhotos.length || state.processing || isPreparing;
  elements.clearAll.disabled = state.processing || state.creativeGenerating;
  elements.process.textContent = state.processing
    ? `PROCESSING ${state.processedCount + 1} OF ${state.processingTotal}…`
    : isPreparing
      ? "PREPARING IPHONE PHOTOS…"
      : pendingCleanupPhotos.length
        ? `REMOVE BACKGROUNDS · ${pendingCleanupPhotos.length}`
        : "ALL PHOTOS READY";
  elements.emptyListing.classList.toggle("hidden", hasPhotos);
  elements.listingLayout.classList.toggle("hidden", !hasPhotos);
  elements.listingButton.disabled = !configured || !state.session || !usablePhotos.length || isPreparing;
  elements.listingNote.classList.toggle("hidden", configured && Boolean(state.session));
  elements.listingNote.textContent = configured ? "Sign in to activate listing generation." : "Listing generation is temporarily unavailable.";
  elements.emptyCreative.classList.toggle("hidden", hasPhotos);
  elements.creativeLayout.classList.toggle("hidden", !hasPhotos);
  elements.creativeGenerate.disabled = !configured || !state.session || !productPhotos.length || isPreparing || state.creativeGenerating;
  elements.creativeGenerate.textContent = state.creativeGenerating ? "GENERATING…" : creativeLabels[state.creativeType];
  elements.creativeSaveAll.disabled = !state.creativeResults.length || state.creativeGenerating;
  elements.creativeOutput.classList.toggle("generating", state.creativeGenerating);
  const listingSources = selectPhotosForRequest(usablePhotos, 8, true);
  const creativeSources = selectPhotosForRequest(usablePhotos, 6, false);

  elements.grid.innerHTML = state.photos.map((photo, index) => `
    <article class="photo-card">
      <div class="photo-frame ${state.background === "transparent" ? "checker" : ""}">
        ${(photo.referenceOnly ? photo.preview : photo.resultUrl || photo.preview)
          ? `<img src="${photo.referenceOnly ? photo.preview : photo.resultUrl || photo.preview}" alt="Uploaded product view ${index + 1}">`
          : `<div class="photo-preparing">Preparing<br>iPhone photo…</div>`}
        <span class="photo-status ${photo.referenceOnly ? "reference" : photo.status}">${photo.referenceOnly ? "reference only" : photo.statusLabel || photo.status}</span>
        <button class="remove" data-remove="${photo.id}" aria-label="Remove photo ${index + 1}">×</button>
      </div>
      <div class="photo-meta"><strong>PHOTO ${String(index + 1).padStart(2, "0")}</strong>
      ${photo.referenceOnly
        ? `<span>UNCHANGED</span>`
        : photo.resultUrl
        ? `<span class="photo-actions"><button type="button" data-retry="${photo.id}">${photo.editInstructions?.length ? "RETRY + KEEP EDITS" : "REPROCESS"}</button><button type="button" data-edit="${photo.id}">EDIT</button><a href="${photo.resultUrl}" download="${resultFileName(photo, index)}">DOWNLOAD</a></span>`
        : photo.error
          ? `<button class="photo-retry" type="button" data-retry="${photo.id}" ${state.processing ? "disabled" : ""}>TRY AGAIN</button>`
          : `<span>${Math.max(1, Math.round(photo.file.size / 1024))} KB</span>`}</div>
      <button class="reference-toggle ${photo.referenceOnly ? "selected" : ""}" type="button" data-reference-only="${photo.id}" ${!photo.preview || state.processing || state.creativeGenerating ? "disabled" : ""}>${photo.referenceOnly ? "REFERENCE ONLY ✓" : "MARK REFERENCE ONLY"}</button>
      ${photo.error ? `<p class="error-text">${photo.error}</p>` : ""}
    </article>`).join("") + (state.photos.length < 20 ? `<button class="add-card" id="add-more"><span>＋</span>Add more</button>` : "");

  elements.sourceStrip.innerHTML = listingSources.map((photo, index) =>
    `<img class="${photo.referenceOnly ? "reference-source" : ""}" src="${photo.preview}" alt="${photo.referenceOnly ? "Reference-only" : "Product"} listing source ${index + 1}" title="${photo.referenceOnly ? "Reference Only" : "Product photo"}">`).join("") +
    (usablePhotos.length > listingSources.length ? `<span>+${usablePhotos.length - listingSources.length}</span>` : "");

  elements.creativeSourceStrip.innerHTML = creativeSources.map((photo, index) =>
    `<img class="${photo.referenceOnly ? "reference-source" : ""}" src="${photo.preview}" alt="${photo.referenceOnly ? "Reference-only" : "Product"} creative source ${index + 1}" title="${photo.referenceOnly ? "Reference Only" : "Product photo"}">`).join("") +
    (usablePhotos.length > creativeSources.length ? `<span>+${usablePhotos.length - creativeSources.length}</span>` : "");

  $$('[data-remove]').forEach((button) => button.addEventListener("click", () => removePhoto(button.dataset.remove)));
  $$('[data-edit]').forEach((button) => button.addEventListener("click", () => { void openPhotoEditor(button.dataset.edit); }));
  $$('[data-retry]').forEach((button) => button.addEventListener("click", () => { void processSinglePhoto(button.dataset.retry); }));
  $$('[data-reference-only]').forEach((button) => button.addEventListener("click", () => toggleReferenceOnly(button.dataset.referenceOnly)));
  $("#add-more")?.addEventListener("click", () => elements.input.click());
  updateWorkflowSignals();
}

function canvasToPng(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Could not save this edit.")), "image/png", 1);
  });
}

function drawEditorStroke(context, stroke, originalCanvas = state.editorOriginalCanvas, background = state.background) {
  if (!stroke?.points?.length) return;
  context.save();
  const restoring = stroke.mode === "restore";
  context.globalCompositeOperation = restoring || background === "white" ? "source-over" : "destination-out";
  context.lineCap = "round";
  context.lineJoin = "round";
  context.lineWidth = stroke.size;
  const paint = restoring
    ? context.createPattern(originalCanvas, "no-repeat")
    : "#ffffff";
  context.strokeStyle = paint;
  context.fillStyle = paint;
  if (stroke.points.length === 1) {
    context.beginPath();
    context.arc(stroke.points[0].x, stroke.points[0].y, stroke.size / 2, 0, Math.PI * 2);
    context.fill();
  } else {
    context.beginPath();
    context.moveTo(stroke.points[0].x, stroke.points[0].y);
    stroke.points.slice(1).forEach((point) => context.lineTo(point.x, point.y));
    context.stroke();
  }
  context.restore();
}

function normalizeEditorStrokes(strokes, width, height) {
  const scale = Math.max(width, height);
  return strokes.map((stroke) => ({
    mode: stroke.mode,
    size: stroke.size / scale,
    points: stroke.points.map((point) => ({ x: point.x / width, y: point.y / height }))
  }));
}

function denormalizeEditorStrokes(strokes, width, height) {
  const scale = Math.max(width, height);
  return (strokes || []).map((stroke) => ({
    mode: stroke.mode,
    size: stroke.size * scale,
    points: stroke.points.map((point) => ({ x: point.x * width, y: point.y * height }))
  }));
}

async function applySavedPhotoEdits(photo, cleanBlob) {
  if (!photo.editInstructions?.length) return cleanBlob;
  const cleanImage = await createImageBitmap(cleanBlob);
  const originalImage = await createImageBitmap(photo.file);
  const canvas = document.createElement("canvas");
  canvas.width = cleanImage.width;
  canvas.height = cleanImage.height;
  const originalCanvas = document.createElement("canvas");
  originalCanvas.width = canvas.width;
  originalCanvas.height = canvas.height;
  originalCanvas.getContext("2d").drawImage(originalImage, 0, 0, canvas.width, canvas.height);
  const context = canvas.getContext("2d");
  context.drawImage(cleanImage, 0, 0);
  denormalizeEditorStrokes(photo.editInstructions, canvas.width, canvas.height)
    .forEach((stroke) => drawEditorStroke(context, stroke, originalCanvas, state.background));
  cleanImage.close();
  originalImage.close();
  return canvasToPng(canvas);
}

function redrawPhotoEditor() {
  if (!state.editorImage) return;
  const canvas = elements.editorCanvas;
  const context = canvas.getContext("2d");
  context.globalCompositeOperation = "source-over";
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.drawImage(state.editorImage, 0, 0);
  state.editorStrokes.forEach((stroke) => drawEditorStroke(context, stroke));
}

function editorPoint(event) {
  const rect = elements.editorCanvas.getBoundingClientRect();
  return {
    x: Math.max(0, Math.min(elements.editorCanvas.width, (event.clientX - rect.left) * (elements.editorCanvas.width / rect.width))),
    y: Math.max(0, Math.min(elements.editorCanvas.height, (event.clientY - rect.top) * (elements.editorCanvas.height / rect.height)))
  };
}

function beginEditorStroke(event) {
  if (!state.editorImage) return;
  event.preventDefault();
  if (state.editorMode === "move") {
    state.editorPanStart = {
      x: event.clientX,
      y: event.clientY,
      left: elements.editorStage.scrollLeft,
      top: elements.editorStage.scrollTop
    };
    elements.editorStage.classList.add("panning");
    elements.editorCanvas.setPointerCapture?.(event.pointerId);
    return;
  }
  const rect = elements.editorCanvas.getBoundingClientRect();
  const scale = elements.editorCanvas.width / rect.width;
  const stroke = {
    mode: state.editorMode,
    size: Number(elements.editorBrush.value) * scale,
    points: [editorPoint(event)]
  };
  state.editorDrawing = true;
  state.editorCurrentStroke = stroke;
  state.editorStrokes.push(stroke);
  elements.editorCanvas.setPointerCapture?.(event.pointerId);
  drawEditorStroke(elements.editorCanvas.getContext("2d"), stroke);
}

function continueEditorStroke(event) {
  if (state.editorMode === "move" && state.editorPanStart) {
    event.preventDefault();
    elements.editorStage.scrollLeft = state.editorPanStart.left - (event.clientX - state.editorPanStart.x);
    elements.editorStage.scrollTop = state.editorPanStart.top - (event.clientY - state.editorPanStart.y);
    return;
  }
  if (!state.editorDrawing || !state.editorCurrentStroke) return;
  event.preventDefault();
  const previous = state.editorCurrentStroke.points.at(-1);
  const current = editorPoint(event);
  state.editorCurrentStroke.points.push(current);
  drawEditorStroke(elements.editorCanvas.getContext("2d"), {
    mode: state.editorCurrentStroke.mode,
    size: state.editorCurrentStroke.size,
    points: [previous, current]
  });
}

function endEditorStroke(event) {
  if (state.editorPanStart) {
    event.preventDefault();
    state.editorPanStart = null;
    elements.editorStage.classList.remove("panning");
    elements.editorCanvas.releasePointerCapture?.(event.pointerId);
    return;
  }
  if (!state.editorDrawing) return;
  event.preventDefault();
  state.editorDrawing = false;
  state.editorCurrentStroke = null;
  elements.editorCanvas.releasePointerCapture?.(event.pointerId);
}

function releasePhotoEditor() {
  state.editorImage?.close?.();
  state.editorPhotoId = null;
  state.editorImage = null;
  state.editorOriginalCanvas = null;
  state.editorMode = "remove";
  state.editorStrokes = [];
  state.editorDrawing = false;
  state.editorCurrentStroke = null;
  state.editorZoom = 1;
  state.editorBaseDisplayWidth = 0;
  state.editorPanStart = null;
  elements.editorCanvas.style.removeProperty("width");
  elements.editorStage.classList.remove("moving", "panning");
}

function closePhotoEditor() {
  if (elements.editorDialog.open) elements.editorDialog.close();
  else releasePhotoEditor();
}

async function openPhotoEditor(photoId) {
  const photo = state.photos.find((item) => item.id === photoId);
  if (!photo?.resultBlob || state.processing) return;
  releasePhotoEditor();
  state.editorPhotoId = photoId;
  state.editorImage = await createImageBitmap(photo.cleanBaseBlob || photo.resultBlob);
  elements.editorCanvas.width = state.editorImage.width;
  elements.editorCanvas.height = state.editorImage.height;
  const originalImage = await createImageBitmap(photo.file);
  state.editorOriginalCanvas = document.createElement("canvas");
  state.editorOriginalCanvas.width = state.editorImage.width;
  state.editorOriginalCanvas.height = state.editorImage.height;
  state.editorOriginalCanvas.getContext("2d").drawImage(
    originalImage,
    0,
    0,
    state.editorOriginalCanvas.width,
    state.editorOriginalCanvas.height
  );
  originalImage.close();
  state.editorStrokes = denormalizeEditorStrokes(photo.editInstructions, elements.editorCanvas.width, elements.editorCanvas.height);
  setEditorMode("remove");
  redrawPhotoEditor();
  elements.editorDialog.showModal();
  requestAnimationFrame(() => {
    state.editorBaseDisplayWidth = Math.min(elements.editorCanvas.width, Math.max(1, elements.editorStage.clientWidth));
    setEditorZoom(1, false);
    elements.editorStage.scrollTo({ top: 0, left: 0 });
  });
}

function setEditorMode(mode) {
  state.editorMode = ["remove", "restore", "move"].includes(mode) ? mode : "remove";
  elements.editorRemove.classList.toggle("selected", state.editorMode === "remove");
  elements.editorRestore.classList.toggle("selected", state.editorMode === "restore");
  elements.editorMove.classList.toggle("selected", state.editorMode === "move");
  elements.editorStage.classList.toggle("moving", state.editorMode === "move");
}

function setEditorZoom(value, keepCenter = true) {
  if (!state.editorBaseDisplayWidth) return;
  const nextZoom = Math.max(1, Math.min(4, Number(value) || 1));
  const stage = elements.editorStage;
  const centerX = stage.scrollLeft + stage.clientWidth / 2;
  const centerY = stage.scrollTop + stage.clientHeight / 2;
  const previousZoom = state.editorZoom || 1;
  state.editorZoom = nextZoom;
  elements.editorCanvas.style.width = `${Math.round(state.editorBaseDisplayWidth * nextZoom)}px`;
  elements.editorZoom.value = String(Math.round(nextZoom * 100));
  elements.editorZoomOutput.textContent = `${Math.round(nextZoom * 100)}%`;
  if (keepCenter) {
    requestAnimationFrame(() => {
      stage.scrollLeft = centerX * (nextZoom / previousZoom) - stage.clientWidth / 2;
      stage.scrollTop = centerY * (nextZoom / previousZoom) - stage.clientHeight / 2;
    });
  }
}

async function applyPhotoEdit() {
  const photo = state.photos.find((item) => item.id === state.editorPhotoId);
  if (!photo || !state.editorImage) return;
  elements.editorApply.disabled = true;
  elements.editorApply.textContent = "SAVING…";
  try {
    let outputCanvas = elements.editorCanvas;
    if (state.background === "white") {
      outputCanvas = document.createElement("canvas");
      outputCanvas.width = elements.editorCanvas.width;
      outputCanvas.height = elements.editorCanvas.height;
      const context = outputCanvas.getContext("2d");
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, outputCanvas.width, outputCanvas.height);
      context.drawImage(elements.editorCanvas, 0, 0);
    }
    const editedBlob = await canvasToPng(outputCanvas);
    if (photo.resultUrl) URL.revokeObjectURL(photo.resultUrl);
    photo.editInstructions = normalizeEditorStrokes(
      state.editorStrokes,
      elements.editorCanvas.width,
      elements.editorCanvas.height
    );
    photo.resultBlob = editedBlob;
    photo.resultUrl = URL.createObjectURL(editedBlob);
    photo.status = "complete";
    photo.statusLabel = "edited";
    closePhotoEditor();
    render();
  } finally {
    elements.editorApply.disabled = false;
    elements.editorApply.textContent = "APPLY EDIT";
  }
}

function canvasToJpeg(canvas, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Could not prepare this photo.")), "image/jpeg", quality);
  });
}

async function prepareBackgroundImage(source) {
  let image = null;
  let objectUrl = "";
  let maxDimension = 2400;
  let quality = 0.94;
  let blob = null;

  try {
    if (typeof window.createImageBitmap === "function") {
      try {
        // Apply phone-camera EXIF orientation before the pixels leave the
        // browser. Canvas re-encoding below then strips the orientation tag.
        image = await window.createImageBitmap(source, { imageOrientation: "from-image" });
      } catch {
        // Older Safari/WebViews may not support the imageOrientation option.
        // HTMLImageElement decoding provides the safest available fallback.
      }
    }

    if (!image) {
      objectUrl = URL.createObjectURL(source);
      const fallbackImage = new Image();
      fallbackImage.decoding = "async";
      fallbackImage.src = objectUrl;
      await fallbackImage.decode();
      image = fallbackImage;
    }

    const sourceWidth = image.width || image.naturalWidth;
    const sourceHeight = image.height || image.naturalHeight;
    if (!sourceWidth || !sourceHeight) throw new Error("Could not read this photo.");

    for (let attempt = 0; attempt < 6; attempt += 1) {
      const scale = Math.min(1, maxDimension / Math.max(sourceWidth, sourceHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(sourceWidth * scale));
      canvas.height = Math.max(1, Math.round(sourceHeight * scale));
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Could not prepare this photo.");
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = "high";
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      blob = await canvasToJpeg(canvas, quality);
      if (blob.size <= 3.75 * 1024 * 1024) break;
      maxDimension = Math.round(maxDimension * 0.88);
      quality = Math.max(0.78, quality - 0.04);
    }
  } finally {
    if (typeof image?.close === "function") image.close();
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }

  if (!blob || blob.size > 4 * 1024 * 1024) throw new Error("Could not prepare this photo.");
  const baseName = (source.name || "product-photo").replace(/\.[^.]+$/, "") || "product-photo";
  return new File([blob], `${baseName}-normalized.jpg`, {
    type: "image/jpeg",
    lastModified: Date.now()
  });
}

async function applySelectedPhotoBackground(cleanedBlob) {
  if (state.background === "transparent") return cleanedBlob;
  const image = await createImageBitmap(cleanedBlob);
  try {
    const canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext("2d");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0);
    return await canvasToPng(canvas);
  } finally {
    image.close();
  }
}

async function removeBackgroundInCloud(photo) {
  if (!state.session) throw new Error("Sign in again before cleaning photos.");
  // Cache the normalized bytes for this item. Reprocess must send the exact
  // same pixels instead of creating a newly encoded variation each time.
  const compactImage = photo.normalizedFile || await prepareBackgroundImage(photo.file);
  photo.normalizedFile = compactImage;
  const form = new FormData();
  form.append("image", compactImage, compactImage.name || "product-photo");
  form.append("client_item_id", state.clientItemId);

  const response = await fetch(`${config.supabaseUrl}/functions/v1/remove-product-background`, {
    method: "POST",
    headers: {
      apikey: config.supabasePublishableKey,
      Authorization: `Bearer ${state.session.access_token}`
    },
    body: form
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    handleApiProblem(payload);
    throw new Error(payload.error || "The cloud cleanup could not be completed.");
  }
  return applySelectedPhotoBackground(await response.blob());
}

async function processPhotos() {
  const processablePhotos = state.photos.filter((photo) => photo.preview && !photo.referenceOnly && !photo.error && !photo.resultBlob);
  if (!processablePhotos.length || state.processing) return;
  state.processing = true;
  state.processedCount = 0;
  state.processingTotal = processablePhotos.length;
  processablePhotos.forEach((photo) => { photo.status = "queued"; photo.statusLabel = "queued"; photo.error = ""; });
  render();

  for (const [index, photo] of processablePhotos.entries()) {
    state.processedCount = index;
    photo.status = "processing";
    photo.statusLabel = "uploading securely";
    render();
    try {
      const cleanedBlob = await removeBackgroundInCloud(photo);
      if (photo.resultUrl) URL.revokeObjectURL(photo.resultUrl);
      photo.cleanBaseBlob = cleanedBlob;
      photo.resultBlob = await applySavedPhotoEdits(photo, cleanedBlob);
      photo.resultUrl = URL.createObjectURL(photo.resultBlob);
      photo.status = "complete";
      photo.statusLabel = photo.editInstructions?.length ? "edited" : "ready";
    } catch (error) {
      photo.status = "error";
      photo.statusLabel = "try again";
      photo.error = error?.message || "Couldn’t process this photo. Please try again.";
      console.error("Cloud background removal failed", error);
    }
    render();
  }
  state.processing = false;
  state.processedCount = 0;
  state.processingTotal = 0;
  render();
  await refreshAccess();
}

async function processSinglePhoto(photoId) {
  const photo = state.photos.find((item) => item.id === photoId);
  if (!photo || photo.referenceOnly || state.processing) return;

  state.processing = true;
  state.processedCount = 0;
  state.processingTotal = 1;
  const previousBlob = photo.resultBlob || null;
  const previousUrl = photo.resultUrl || "";
  const previousCleanBase = photo.cleanBaseBlob || null;
  photo.error = "";
  photo.status = "processing";
  photo.statusLabel = "uploading securely";
  render();

  try {
    if (!photo.preview) {
      photo.file = photo.originalFile;
      await preparePhoto(photo);
      if (!photo.preview || photo.error) throw new Error(photo.error || "This photo could not be prepared.");
      photo.status = "processing";
      photo.statusLabel = "uploading securely";
      photo.error = "";
      render();
    }
    const cleanedBlob = await removeBackgroundInCloud(photo);
    const nextResultBlob = await applySavedPhotoEdits(photo, cleanedBlob);
    if (previousUrl) URL.revokeObjectURL(previousUrl);
    photo.cleanBaseBlob = cleanedBlob;
    photo.resultBlob = nextResultBlob;
    photo.resultUrl = URL.createObjectURL(photo.resultBlob);
    photo.status = "complete";
    photo.statusLabel = photo.editInstructions?.length ? "edited" : "ready";
  } catch (error) {
    photo.cleanBaseBlob = previousCleanBase;
    photo.resultBlob = previousBlob;
    photo.resultUrl = previousUrl;
    photo.status = "error";
    photo.statusLabel = "try again";
    photo.error = error?.message || "Couldn’t process this photo. Please try again.";
    console.error("Single photo cleanup failed", error);
  } finally {
    state.processing = false;
    state.processedCount = 0;
    state.processingTotal = 0;
    render();
    await refreshAccess();
  }
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

async function saveBlobToDevice(blob, filename, title) {
  const file = new File([blob], filename, { type: recordMimeType(blob, filename) });
  if (navigator.share && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title });
      return;
    } catch (error) {
      if (error?.name === "AbortError") return;
    }
  }
  triggerDownload(blob, filename);
}

function savableRecordPhotos() {
  return state.photos
    .map((photo, index) => ({ photo, index }))
    .map(({ photo, index }) => {
      const archiveBlob = photo.referenceOnly ? photo.originalFile || photo.file : photo.resultBlob;
      const shareBlob = photo.referenceOnly ? photo.file : photo.resultBlob;
      if (!archiveBlob || !shareBlob) return null;
      return {
        photo,
        index,
        archiveBlob,
        shareBlob,
        archiveFilename: photo.referenceOnly ? referenceFileName(photo, index, archiveBlob) : resultFileName(photo, index),
        shareFilename: photo.referenceOnly ? referenceFileName(photo, index, shareBlob) : resultFileName(photo, index)
      };
    })
    .filter(Boolean);
}

function originalRecordPhotos() {
  return state.photos
    .map((photo, index) => ({
      photo,
      index,
      archiveBlob: photo.originalFile || photo.file,
      shareBlob: photo.file || photo.originalFile
    }))
    .filter(({ archiveBlob, shareBlob }) => Boolean(archiveBlob && shareBlob))
    .map(({ photo, index, archiveBlob, shareBlob }) => ({
      photo,
      index,
      archiveBlob,
      shareBlob,
      archiveFilename: originalFileName(photo, index, archiveBlob),
      shareFilename: originalFileName(photo, index, shareBlob)
    }));
}

async function createFreshPhotoCopy(blob, filename) {
  let drawable = null;
  let objectUrl = "";

  try {
    if (typeof window.createImageBitmap === "function") {
      try {
        drawable = await window.createImageBitmap(blob, { imageOrientation: "from-image" });
      } catch {
        // Fall back to an HTML image for browsers that do not support the
        // imageOrientation option on createImageBitmap.
      }
    }

    if (!drawable) {
      objectUrl = URL.createObjectURL(blob);
      const image = new Image();
      image.decoding = "async";
      image.src = objectUrl;
      await image.decode();
      drawable = image;
    }

    const width = drawable.width || drawable.naturalWidth;
    const height = drawable.height || drawable.naturalHeight;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    context.drawImage(drawable, 0, 0, width, height);

    const outputType = blob.type === "image/png" ? "image/png" : "image/jpeg";
    const copiedBlob = await new Promise((resolve) => {
      canvas.toBlob(resolve, outputType, outputType === "image/jpeg" ? 0.98 : undefined);
    });
    if (!copiedBlob) throw new Error("The original photo copy could not be created.");

    const extension = outputType === "image/png" ? "png" : "jpg";
    const copiedFilename = `${filename.replace(/\.[^.]+$/, "")}.${extension}`;
    return new File([copiedBlob], copiedFilename, {
      type: outputType,
      lastModified: Date.now()
    });
  } finally {
    if (typeof drawable?.close === "function") drawable.close();
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }
}

async function saveAllPhotos() {
  const records = savableRecordPhotos().filter(({ photo }) => !photo.referenceOnly);
  if (!records.length) return;
  const files = records.map(({ shareBlob, shareFilename }) => new File(
    [shareBlob],
    shareFilename,
    { type: recordMimeType(shareBlob, shareFilename) }
  ));

  if (!navigator.share || !navigator.canShare?.({ files })) {
    window.alert("This device cannot save several photos at once. Use Download All to create one ZIP instead.");
    return;
  }

  elements.saveAll.disabled = true;
  elements.saveAll.textContent = "OPENING PHOTOS…";
  try {
    await navigator.share({ files, title: "Dressup Sesh edited product photos" });
  } catch (error) {
    if (error?.name !== "AbortError") {
      window.alert("The photos could not be opened for saving. Please try Download All instead.");
    }
  } finally {
    render();
  }
}

async function saveSingleOriginalPhoto(photoId) {
  const index = state.photos.findIndex((photo) => photo.id === photoId);
  const photo = state.photos[index];
  // Safari's Web Share API does not reliably accept HEIC files created from
  // browser memory. `photo.file` is the prepared JPEG for HEIC uploads and is
  // otherwise the untouched uploaded file. The exact upload remains available
  // as `originalFile` in Download Record Set.
  const shareableOriginal = photo?.file || photo?.originalFile;
  if (!shareableOriginal) return;
  try {
    const filename = originalFileName(photo, index, shareableOriginal);
    const freshCopy = await createFreshPhotoCopy(shareableOriginal, filename);
    await saveBlobToDevice(
      freshCopy,
      freshCopy.name,
      photo.referenceOnly ? "Dressup Sesh reference photo copy" : "Dressup Sesh original photo copy"
    );
  } catch {
    window.alert("This original photo copy could not be prepared. The exact upload is still available in Download Record Set.");
  }
}

async function saveAllOriginalPhotos() {
  const originals = originalRecordPhotos();
  if (!originals.length) return;
  elements.saveOriginals.disabled = true;
  elements.saveOriginals.textContent = "PREPARING COPIES…";
  let files;
  try {
    files = [];
    for (const { shareBlob, shareFilename } of originals) {
      files.push(await createFreshPhotoCopy(shareBlob, shareFilename));
    }
  } catch {
    window.alert("The original photo copies could not be prepared. The exact uploads are still available in Download Record Set.");
    render();
    return;
  }
  if (!navigator.share || !navigator.canShare?.({ files })) {
    window.alert("This device cannot save several originals at once. Hold an individual photo and choose Save to Photos, or use Download Record Set.");
    render();
    return;
  }
  elements.saveOriginals.textContent = "OPENING ORIGINALS…";
  try {
    await navigator.share({ files, title: "Dressup Sesh original photo copies" });
  } catch (error) {
    if (error?.name !== "AbortError") {
      window.alert("The original photos could not be opened together. Please save them individually.");
    }
  } finally {
    render();
  }
}

async function saveAllCreativePhotos() {
  if (!state.creativeResults.length) return;
  const files = state.creativeResults
    .slice()
    .reverse()
    .map((result) => new File([result.blob], result.filename, { type: result.blob.type || "image/jpeg" }));

  if (!navigator.share || !navigator.canShare?.({ files })) {
    window.alert("This device cannot open several creative images at once. Use each image’s Save to Photos button instead.");
    return;
  }

  elements.creativeSaveAll.disabled = true;
  elements.creativeSaveAll.textContent = "OPENING CREATIVE IMAGES…";
  try {
    await navigator.share({ files, title: "Dressup Sesh creative images" });
  } catch (error) {
    if (error?.name !== "AbortError") {
      window.alert("The creative images could not be opened together. Please save them individually.");
    }
  } finally {
    renderCreativeResults();
  }
}

async function downloadAllPhotos() {
  const records = savableRecordPhotos();
  if (!records.length || typeof window.JSZip !== "function") return;

  elements.downloadAll.disabled = true;
  elements.downloadAll.textContent = "PACKAGING…";
  try {
    const zip = new window.JSZip();
    records.forEach(({ archiveBlob, archiveFilename }) => {
      zip.file(archiveFilename, archiveBlob);
    });
    const zipBlob = await zip.generateAsync({
      type: "blob",
      compression: "DEFLATE",
      compressionOptions: { level: 6 }
    });
    triggerDownload(zipBlob, "dressup-sesh-product-photo-records.zip");
  } finally {
    render();
  }
}

async function saveAllItemAssets() {
  if (typeof window.JSZip !== "function") {
    window.alert("Save All is temporarily unavailable. Please try again.");
    return;
  }
  const hasListing = Boolean(elements.listingOutput.textContent.trim());
  if (!state.photos.length && !state.creativeResults.length && !hasListing) return;

  elements.saveAllAssets.disabled = true;
  elements.saveAllAssets.classList.add("working");
  elements.saveAllAssets.setAttribute("aria-label", "Preparing all item assets");
  try {
    const zip = new window.JSZip();
    const originals = zip.folder("01-original-photos");
    const edited = zip.folder("02-edited-photos");
    const creative = zip.folder("03-creative-images");

    state.photos.forEach((photo, index) => {
      const source = photo.originalFile || photo.file;
      if (source) originals.file(originalFileName(photo, index, source), source);
      if (photo.resultBlob) edited.file(resultFileName(photo, index), photo.resultBlob);
    });
    state.creativeResults.slice().reverse().forEach((result) => {
      creative.file(result.filename, result.blob);
    });
    if (hasListing) zip.file("04-listing-copy.txt", `${elements.listingOutput.textContent.trim()}\n`);

    const blob = await zip.generateAsync({
      type: "blob",
      compression: "DEFLATE",
      compressionOptions: { level: 6 }
    });
    triggerDownload(blob, "dressup-sesh-item-assets.zip");
    elements.saveAllAssets.classList.add("complete");
  } catch (error) {
    console.error("Save All failed", error);
    window.alert("The item assets could not be packaged. Please try again.");
  } finally {
    elements.saveAllAssets.classList.remove("working");
    elements.saveAllAssets.setAttribute("aria-label", "Save all item assets");
    setTimeout(() => elements.saveAllAssets.classList.remove("complete"), 1400);
    updateWorkflowSignals();
  }
}

async function prepareListingImage(source) {
  const image = await createImageBitmap(source);
  const maxDimension = 1800;
  const scale = Math.min(1, maxDimension / Math.max(image.width, image.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));
  const context = canvas.getContext("2d");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  image.close();

  return await new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => blob ? resolve(blob) : reject(new Error("Could not prepare this photo for listing analysis.")),
      "image/jpeg",
      0.84
    );
  });
}

function selectEvenly(photos, maximum) {
  if (photos.length <= maximum) return [...photos];
  const lastIndex = photos.length - 1;
  return Array.from({ length: maximum }, (_, index) => {
    const sourceIndex = Math.round((index * lastIndex) / (maximum - 1));
    return photos[sourceIndex];
  });
}

function selectPhotosForRequest(photos, maximum, referenceFirst = true) {
  const references = photos.filter((photo) => photo.referenceOnly);
  const products = photos.filter((photo) => !photo.referenceOnly);
  const reservedReferences = Math.min(references.length, Math.floor(maximum / 2));
  const selectedReferences = selectEvenly(references, reservedReferences);
  const selectedProducts = selectEvenly(products, Math.min(products.length, maximum - selectedReferences.length));
  const remaining = maximum - selectedReferences.length - selectedProducts.length;
  const extraReferences = remaining > 0
    ? references.filter((photo) => !selectedReferences.includes(photo)).slice(0, remaining)
    : [];
  return referenceFirst
    ? [...selectedReferences, ...extraReferences, ...selectedProducts]
    : [...selectedProducts, ...selectedReferences, ...extraReferences];
}

function cleanListingText(value = "") {
  return String(value)
    .replace(/\r\n/g, "\n")
    .replace(/\*/g, "")
    .replace(/^[ \t]*Title[ \t]*:[ \t]*/gim, "")
    .replace(/^[ \t]*Description[ \t]*:[ \t]*/gim, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function createListing() {
  if (!configured || !state.session || !state.photos.length) {
    if (!state.session) elements.authDialog.showModal();
    return;
  }
  elements.listingError.classList.add("hidden");
  state.listingGenerating = true;
  elements.listingButton.disabled = true;
  elements.listingButton.textContent = "WRITING LISTING…";
  updateWorkflowSignals();
  const body = new FormData();
  body.append("client_item_id", state.clientItemId);
  const additionalInfo = elements.listingAdditional.value.trim();
  if (additionalInfo) body.append("additional_info", additionalInfo);
  const usablePhotos = state.photos.filter((photo) => photo.preview && !photo.error);
  const selectedPhotos = selectPhotosForRequest(usablePhotos, 8, true);
  const referenceCount = selectedPhotos.filter((photo) => photo.referenceOnly).length;
  body.append("reference_count", String(referenceCount));
  try {
    for (const [index, photo] of selectedPhotos.entries()) {
      elements.listingButton.textContent = `PREPARING ${index + 1} OF ${selectedPhotos.length}…`;
      const source = photo.referenceOnly ? photo.file : photo.resultBlob || photo.file;
      const compactImage = await prepareListingImage(source);
      const role = photo.referenceOnly ? "reference" : "product";
      body.append("images", compactImage, `${role}-${index + 1}.jpg`);
    }
    elements.listingButton.textContent = "WRITING LISTING…";
    const response = await fetch(`${config.supabaseUrl}/functions/v1/create-listing`, {
        method: "POST",
        headers: { apikey: config.supabasePublishableKey, Authorization: `Bearer ${state.session.access_token}` },
      body
    });
    if (!response.ok) {
      const problem = await response.json().catch(() => ({}));
      handleApiProblem(problem);
      throw new Error(problem.error || "The listing could not be generated. Please try again.");
    }
    const data = await response.json();
    applyAccess(data.access);
    const listing = cleanListingText(data.listing);
    elements.listingOutput.textContent = listing;
    elements.listingOutput.classList.remove("hidden");
    elements.outputPlaceholder.classList.add("hidden");
    elements.copyButton.disabled = !listing;
  } catch (error) {
    elements.listingError.textContent = error?.message || "The listing could not be generated. Please try again.";
    elements.listingError.classList.remove("hidden");
  } finally {
    state.listingGenerating = false;
    elements.listingButton.disabled = false;
    elements.listingButton.textContent = "CREATE TITLE + DESCRIPTION";
    updateWorkflowSignals();
  }
}

function base64ToBlob(value, mimeType = "image/jpeg") {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new Blob([bytes], { type: mimeType });
}

async function generateCreativeImage() {
  if (!configured || !state.session || !state.photos.length || state.creativeGenerating) return;
  const usablePhotos = state.photos.filter((photo) => photo.preview && !photo.error);
  const productPhotos = usablePhotos.filter((photo) => !photo.referenceOnly);
  if (!productPhotos.length) return;

  state.creativeGenerating = true;
  elements.creativeError.classList.add("hidden");
  render();
  const body = new FormData();
  body.append("client_item_id", state.clientItemId);
  body.append("type", state.creativeType);
  body.append("instructions", elements.creativeInstructions.value.trim());

  try {
    const selectedPhotos = selectPhotosForRequest(usablePhotos, 6, false);
    const selectedProductCount = selectedPhotos.filter((photo) => !photo.referenceOnly).length;
    body.append("product_count", String(selectedProductCount));
    for (const [index, photo] of selectedPhotos.entries()) {
      elements.creativeGenerate.textContent = `PREPARING SOURCE ${index + 1} OF ${selectedPhotos.length}…`;
      const compactImage = await prepareListingImage(photo.file);
      const role = photo.referenceOnly ? "reference" : "product";
      body.append("images", compactImage, `${role}-${index + 1}.jpg`);
    }

    if (state.creativeReference) {
      elements.creativeGenerate.textContent = "PREPARING REFERENCE…";
      const compactReference = await prepareListingImage(state.creativeReference);
      body.append("reference", compactReference, "creative-reference.jpg");
    }

    elements.creativeGenerate.textContent = "GENERATING…";
    const response = await fetch(`${config.supabaseUrl}/functions/v1/generate-product-photo`, {
      method: "POST",
      headers: { apikey: config.supabasePublishableKey, Authorization: `Bearer ${state.session.access_token}` },
      body
    });
    if (!response.ok) {
      const problem = await response.json().catch(() => ({}));
      handleApiProblem(problem);
      throw new Error(problem.error || "The creative image could not be generated. Please try again.");
    }

    const data = await response.json();
    applyAccess(data.access);
    if (!data.image) throw new Error("The image generator returned no image. Please try again.");
    const blob = base64ToBlob(data.image, data.mimeType || "image/jpeg");
    const sequence = state.creativeResults.length + 1;
    const extension = blob.type === "image/png" ? "png" : "jpg";
    const type = state.creativeType;
    state.creativeResults.unshift({
      id: crypto.randomUUID(),
      sequence,
      type,
      label: creativeLabels[type].replace(/^GENERATE /, "").toLowerCase(),
      blob,
      url: URL.createObjectURL(blob),
      filename: `dressup-sesh-${type.replaceAll("_", "-")}-${String(sequence).padStart(2, "0")}.${extension}`
    });
    renderCreativeResults();
  } catch (error) {
    elements.creativeError.textContent = error?.message || "The creative image could not be generated. Please try again.";
    elements.creativeError.classList.remove("hidden");
  } finally {
    state.creativeGenerating = false;
    render();
  }
}

elements.dropzone.addEventListener("click", () => elements.input.click());
elements.dropzone.addEventListener("keydown", (event) => { if (event.key === "Enter" || event.key === " ") elements.input.click(); });
elements.dropzone.addEventListener("dragover", (event) => { event.preventDefault(); elements.dropzone.classList.add("dragging"); });
elements.dropzone.addEventListener("dragleave", () => elements.dropzone.classList.remove("dragging"));
elements.dropzone.addEventListener("drop", (event) => { event.preventDefault(); elements.dropzone.classList.remove("dragging"); addFiles(event.dataTransfer.files); });
elements.input.addEventListener("change", () => { addFiles(elements.input.files); elements.input.value = ""; });
elements.process.addEventListener("click", processPhotos);
elements.saveAllAssets.addEventListener("click", saveAllItemAssets);
elements.clearAll.addEventListener("click", clearAllPhotos);
elements.listingButton.addEventListener("click", createListing);
elements.emptyListing.addEventListener("click", () => { $("[data-tab='photos']").click(); elements.input.click(); });
elements.emptyCreative.addEventListener("click", () => { $("[data-tab='photos']").click(); elements.input.click(); });
elements.creativeGenerate.addEventListener("click", generateCreativeImage);
elements.creativeSaveAll.addEventListener("click", saveAllCreativePhotos);
elements.editorCanvas.addEventListener("pointerdown", beginEditorStroke);
elements.editorCanvas.addEventListener("pointermove", continueEditorStroke);
elements.editorCanvas.addEventListener("pointerup", endEditorStroke);
elements.editorCanvas.addEventListener("pointercancel", endEditorStroke);
elements.editorBrush.addEventListener("input", () => { elements.editorBrushOutput.textContent = elements.editorBrush.value; });
elements.editorRemove.addEventListener("click", () => setEditorMode("remove"));
elements.editorRestore.addEventListener("click", () => setEditorMode("restore"));
elements.editorMove.addEventListener("click", () => setEditorMode("move"));
elements.editorZoom.addEventListener("input", () => setEditorZoom(Number(elements.editorZoom.value) / 100));
elements.editorZoomOut.addEventListener("click", () => setEditorZoom(state.editorZoom - 0.25));
elements.editorZoomIn.addEventListener("click", () => setEditorZoom(state.editorZoom + 0.25));
elements.editorUndo.addEventListener("click", () => {
  state.editorStrokes.pop();
  redrawPhotoEditor();
});
elements.editorReset.addEventListener("click", () => {
  state.editorStrokes = [];
  redrawPhotoEditor();
});
elements.editorCancel.addEventListener("click", closePhotoEditor);
elements.editorApply.addEventListener("click", () => {
  void applyPhotoEdit().catch((error) => window.alert(error?.message || "Could not save this edit."));
});
elements.editorDialog.addEventListener("close", releasePhotoEditor);
elements.copyButton.addEventListener("click", async () => {
  await navigator.clipboard.writeText(elements.listingOutput.textContent);
  elements.copyButton.classList.add("complete");
  elements.copyButton.setAttribute("aria-label", "Listing text copied");
  setTimeout(() => {
    elements.copyButton.classList.remove("complete");
    elements.copyButton.setAttribute("aria-label", "Copy listing text");
  }, 1200);
});

$$('[data-tab]').forEach((button) => button.addEventListener("click", () => {
  $$('[data-tab]').forEach((item) => item.classList.toggle("active", item === button));
  const activeTab = button.dataset.tab;
  elements.photosPanel.classList.toggle("hidden", activeTab !== "photos");
  elements.listingPanel.classList.toggle("hidden", activeTab !== "listing");
  elements.creativePanel.classList.toggle("hidden", activeTab !== "creative");
}));

$$('[data-creative-type]').forEach((button) => button.addEventListener("click", () => {
  if (state.creativeGenerating) return;
  state.creativeType = button.dataset.creativeType;
  $$('[data-creative-type]').forEach((item) => item.classList.toggle("selected", item === button));
  render();
}));

elements.referencePicker.addEventListener("click", () => elements.creativeReference.click());
elements.removeReference.addEventListener("click", removeCreativeReference);
elements.creativeReference.addEventListener("change", async () => {
  let file = elements.creativeReference.files?.[0];
  if (!file) return;
  try {
    elements.referencePicker.innerHTML = "<strong>PREPARING REFERENCE…</strong>";
    if (isHeicFile(file)) file = await convertHeicFile(file);
    removeCreativeReference();
    state.creativeReference = file;
    state.creativeReferenceUrl = URL.createObjectURL(file);
    elements.referenceImage.src = state.creativeReferenceUrl;
    elements.referencePicker.classList.add("hidden");
    elements.referencePreview.classList.remove("hidden");
  } catch (error) {
    elements.creativeError.textContent = "That reference photo could not be prepared. Please try a JPG or PNG.";
    elements.creativeError.classList.remove("hidden");
  } finally {
    elements.referencePicker.innerHTML = "<span>＋</span><strong>Add inspiration photo</strong><small>JPG, PNG, WEBP or HEIC</small>";
  }
});

$$('[data-background]').forEach((button) => button.addEventListener("click", () => {
  if (state.processing || state.background === button.dataset.background) return;
  state.background = button.dataset.background;
  state.photos.forEach((photo) => {
    if (!photo.resultBlob) return;
    if (photo.resultUrl) URL.revokeObjectURL(photo.resultUrl);
    photo.cleanBaseBlob = null;
    photo.resultBlob = null;
    photo.resultUrl = "";
    photo.status = "ready";
    photo.statusLabel = "ready";
  });
  $$('[data-background]').forEach((item) => item.classList.toggle("selected", item === button));
  render();
}));

function openAuthDialog(action) {
  if (action === "subscribe") setPendingAuthAction("subscribe");
  if (action === "trial") setPendingAuthAction("");
  updateAuthDialogCopy();
  elements.authMessage.textContent = "";
  if (state.pendingConfirmationEmail) {
    elements.authEmail.value = state.pendingConfirmationEmail;
    elements.resendButton.classList.remove("hidden");
  }
  elements.authDialog.showModal();
}

elements.gateSignIn.addEventListener("click", () => openAuthDialog());
elements.gateCreate.addEventListener("click", () => openAuthDialog("trial"));

elements.authButton.addEventListener("click", async () => {
  if (state.session && supabase) {
    await supabase.auth.signOut();
  } else {
    openAuthDialog();
  }
});

$("#dialog-close").addEventListener("click", () => elements.authDialog.close());
$("#paywall-close").addEventListener("click", () => elements.paywallDialog.close());
$("#paywall-done").addEventListener("click", () => elements.paywallDialog.close());
elements.billingClose.addEventListener("click", () => elements.billingDialog.close());
elements.planButton.addEventListener("click", () => openBilling());
elements.usagePill.addEventListener("click", () => openBilling());
elements.paywallSubscribe.addEventListener("click", () => beginCheckout("create-checkout-session", elements.paywallSubscribe));
elements.billingSubscribe.addEventListener("click", () => beginCheckout("create-checkout-session", elements.billingSubscribe));
elements.billingAddCredits.addEventListener("click", () => beginCheckout("create-credit-checkout-session", elements.billingAddCredits));
elements.billingManage.addEventListener("click", async () => {
  const original = elements.billingManage.textContent;
  elements.billingManage.disabled = true;
  elements.billingManage.textContent = "OPENING BILLING…";
  elements.billingMessage.textContent = "";
  try {
    const data = await invokeStudioFunction("create-customer-portal");
    if (!data.url) throw new Error("The billing portal did not return a link.");
    window.location.assign(data.url);
  } catch (error) {
    elements.billingMessage.textContent = error.message || "Billing could not be opened.";
    elements.billingManage.disabled = false;
    elements.billingManage.textContent = original;
  }
});
elements.billingProWaitlist.addEventListener("click", () => {
  void joinProWaitlist(state.session?.user?.email || "", elements.billingProWaitlist, elements.billingMessage);
});

$$('[data-open-plan]').forEach((button) => button.addEventListener("click", () => {
  const action = button.dataset.openPlan;
  if (action === "trial") {
    if (state.session) window.location.hash = "top";
    else openAuthDialog("trial");
    return;
  }
  if (!state.session) {
    openAuthDialog(action === "subscribe" ? "subscribe" : undefined);
    return;
  }
  if (action === "subscribe") {
    void beginCheckout("create-checkout-session", button);
    return;
  }
  if (action === "credits") {
    if (!state.access?.paid) {
      openBilling("Creative packs are available with an active Private Beta subscription.");
      return;
    }
    void beginCheckout("create-credit-checkout-session", button);
  }
}));

elements.proWaitlistForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const email = elements.proWaitlistEmail.value.trim();
  const button = elements.proWaitlistForm.querySelector("button");
  if (await joinProWaitlist(email, button, elements.proWaitlistMessage)) {
    elements.proWaitlistForm.reset();
  }
});

elements.authForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!supabase) return;
  const captchaToken = getCaptchaToken(authCaptcha, elements.authMessage);
  if (captchaToken === null) return;
  elements.authMessage.textContent = "Signing in…";
  const { error } = await supabase.auth.signInWithPassword({
    email: elements.authEmail.value.trim(),
    password: elements.authPassword.value,
    options: { captchaToken },
  });
  authCaptcha.reset();
  if (error) {
    elements.authMessage.textContent = error.message;
  } else {
    elements.authMessage.textContent = "Signed in.";
    setTimeout(() => elements.authDialog.close(), 450);
  }
});

elements.forgotPasswordButton.addEventListener("click", async () => {
  if (!supabase) return;
  const email = elements.authEmail.value.trim();
  if (!email) {
    elements.authMessage.textContent = "Enter your Studio account email first.";
    elements.authEmail.focus();
    return;
  }
  const captchaToken = getCaptchaToken(authCaptcha, elements.authMessage);
  if (captchaToken === null) return;
  elements.forgotPasswordButton.disabled = true;
  elements.authMessage.textContent = "Sending password reset email…";
  const redirectTo = new URL("studio-password-reset.html", getAuthRedirectUrl()).href;
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo, captchaToken });
  authCaptcha.reset();
  elements.authMessage.textContent = error
    ? error.message
    : "If that Studio account exists, its password reset email is on the way.";
  elements.forgotPasswordButton.disabled = false;
});

function getAuthRedirectUrl(intent = "") {
  const redirect = new URL(window.location.href);
  redirect.hash = "";
  redirect.search = "";
  if (!redirect.pathname.endsWith("/")) {
    redirect.pathname = redirect.pathname.replace(/[^/]+$/, "");
  }
  if (intent === "subscribe") redirect.searchParams.set("intent", "subscribe");
  return redirect.toString();
}

$("#signup-button").addEventListener("click", async () => {
  if (!supabase) return;
  const email = elements.authEmail.value.trim();
  if (!email || !elements.authPassword.value) {
    elements.authMessage.textContent = "Enter an email and password first.";
    return;
  }
  const password = elements.authPassword.value;
  if (password.length < 9 || !/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password) || !/[^A-Za-z0-9]/.test(password)) {
    elements.authMessage.textContent = "New passwords need at least 9 characters with uppercase, lowercase, a number, and a symbol.";
    return;
  }
  const captchaToken = getCaptchaToken(authCaptcha, elements.authMessage);
  if (captchaToken === null) return;
  elements.authMessage.textContent = "Creating account…";
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: getAuthRedirectUrl(state.pendingAuthAction), captchaToken },
  });
  authCaptcha.reset();
  if (error) {
    elements.authMessage.textContent = captchaFailureMessage(error);
  } else if (!data.session) {
    state.pendingConfirmationEmail = email;
    writeSessionValue(PENDING_CONFIRMATION_EMAIL_KEY, email);
    elements.resendButton.classList.remove("hidden");
    elements.authMessage.textContent = state.pendingAuthAction === "subscribe"
      ? `Confirmation sent to ${email}. Use the newest email link; checkout will open after you sign in.`
      : `Confirmation sent to ${email}. Open the newest email, then return here to sign in.`;
  } else {
    state.pendingConfirmationEmail = "";
    writeSessionValue(PENDING_CONFIRMATION_EMAIL_KEY, "");
    elements.authMessage.textContent = state.pendingAuthAction === "subscribe"
      ? "Your account is ready. Opening secure checkout…"
      : "Your free studio account is ready.";
    if (state.pendingAuthAction !== "subscribe") setTimeout(() => elements.authDialog.close(), 650);
  }
});

elements.resendButton.addEventListener("click", async () => {
  if (!supabase) return;
  const email = state.pendingConfirmationEmail || elements.authEmail.value.trim();
  if (!email) {
    elements.authMessage.textContent = "Enter the email used to create the account.";
    return;
  }
  const captchaToken = getCaptchaToken(authCaptcha, elements.authMessage);
  if (captchaToken === null) return;
  elements.resendButton.disabled = true;
  elements.authMessage.textContent = "Sending a new confirmation email…";
  const { error } = await supabase.auth.resend({
    type: "signup",
    email,
    options: { emailRedirectTo: getAuthRedirectUrl(state.pendingAuthAction), captchaToken },
  });
  authCaptcha.reset();
  elements.resendButton.disabled = false;
  elements.authMessage.textContent = error
    ? captchaFailureMessage(error)
    : `A new confirmation email was sent to ${email}. Use the newest link only.`;
});

updateAuthDialogCopy();
if (state.pendingConfirmationEmail) {
  elements.authEmail.value = state.pendingConfirmationEmail;
  elements.resendButton.classList.remove("hidden");
}
render();
