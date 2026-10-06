export const factualGuard = 'Product evidence always wins. Never invent or redesign product facts, measurements, materials, straps, condition or exact MSRP. Preserve the required listing format. Influence and variation may change appropriate phrasing, styling and composition only.';
const variants = {
  natural: 'Use specific, natural wording and believable composition. Avoid generic stock openings and repeated filler.',
  minimal: 'Use restrained, precise wording and uncluttered composition. Vary sentence openings without changing the required layout.',
  editorial: 'Use fresh, item-specific styling language and editorial composition while preserving product details and the required layout.'
};
export function variationFor(config, itemId = '') {
  if (config.variation !== 'rotate') return config.variation;
  let hash = 0;
  for (const character of itemId) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return ['natural', 'minimal', 'editorial'][hash % 3];
}
export function influenceEligible(config, kind, now = new Date()) {
  const influence = config.influence || {};
  const parts = new Intl.DateTimeFormat('en-CA',{timeZone:'America/Los_Angeles',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
  const calendar = Object.fromEntries(parts.map(part=>[part.type,part.value]));
  const today = `${calendar.year}-${calendar.month}-${calendar.day}`;
  const parsedExpiry = /^\d{4}-\d{2}-\d{2}$/.test(influence.expires || '') ? Date.parse(influence.expires + 'T12:00:00Z') : NaN;
  const validExpiry = Number.isFinite(parsedExpiry) && new Date(parsedExpiry).toISOString().slice(0,10) === influence.expires;
  const scopeMatches = !influence.scope || influence.scope === 'both' || influence.scope === (kind === 'listing' ? 'listing' : 'creative');
  return Boolean(['subtle','strong'].includes(influence.strength) && influence.text?.trim() && influence.source?.trim() && validExpiry && influence.expires >= today && scopeMatches);
}
export function assemblePrompt(config, kind, context = {}, now = new Date()) {
  if (kind === 'background') return { text: 'Background cleanup uses a segmentation model; it has no text prompt.', variation: null, influence_applied: false };
  let text = config.listing;
  if (kind !== 'listing') {
    const type = config.types[kind];
    if (!type) throw new Error('Invalid creative format');
    const productCount = context.productCount ?? 2, evidenceCount = context.referenceOnlyCount ?? 0;
    const evidenceRule = evidenceCount ? `The next ${evidenceCount} input image${evidenceCount === 1 ? ' is' : 's are'} reference-only evidence for labels, measurements, construction and condition. Use their factual evidence to improve accuracy, but do not reproduce rulers, measuring tapes, hands, backgrounds, tags used only for documentation or other staging elements in the generated image.` : 'No reference-only evidence images were supplied.';
    const referenceRule = context.hasReference ? 'The final input image is an inspiration reference. Use it only for pose, framing, camera angle, setting, lighting mood or layout. Do not copy its product, garment, color, pattern, branding, hardware, person identity or face.' : 'No separate inspiration image was supplied; choose a commercially useful composition yourself.';
    const substitutions = {label:type.label,product_count:String(productCount),evidence_rule:evidenceRule,reference_rule:referenceRule,direction:type.direction,user_direction:context.instructions ? `Additional direction from the user: ${context.instructions}` : ''};
    text = config.creative.replace(/\{\{([a-z_]+)\}\}/g, (match,key) => Object.hasOwn(substitutions,key) ? substitutions[key] : match);
    if (/\{\{/.test(text)) throw new Error('Unresolved prompt placeholder');
  }
  const applied = influenceEligible(config, kind, now);
  if (applied) text += `\n\nAPPROVED STYLE INFLUENCE (${config.influence.strength}; review by ${config.influence.expires}):\n${config.influence.text}\nUse only when appropriate to the actual product. This is a style direction, never a factual source.`;
  const variation = variationFor(config, context.itemId || 'preview-item');
  text += `\n\nVARIATION: ${variants[variation] || variants.natural}\n\n${factualGuard}`;
  return {text,variation,influence_applied:applied};
}
