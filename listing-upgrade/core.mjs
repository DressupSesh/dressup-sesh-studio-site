export const ALLOWANCES = Object.freeze({ free: 3, paid: 25, pro: 50 });
export const PLAN_NAMES = Object.freeze({ free: 'Free member', paid: 'Member', pro: 'Pro' });
export const MARKETPLACES = Object.freeze([
  { name: 'Poshmark', url: 'https://poshmark.com/create-listing' },
  { name: 'eBay', url: 'https://www.ebay.com/sl/sell' },
  { name: 'Depop', url: 'https://www.depop.com/sell/' },
  { name: 'Etsy', url: 'https://www.etsy.com/your/shops/me/tools/listings' },
  { name: 'Vinted', url: 'https://www.vinted.com/items/new' }
]);
export function listingLink(value) {
  let url;
  try { url = new URL(value); } catch { throw new Error('Paste a complete link beginning with https://.'); }
  const host = url.hostname.toLowerCase();
  const domains = ['poshmark.com', 'posh.mk', 'ebay.com', 'ebay.us', 'depop.com', 'etsy.com', 'vinted.com', 'vinted.co.uk'];
  if (url.protocol !== 'https:' || url.username || url.password || url.port || !domains.some(domain => host === domain || host.endsWith('.' + domain))) {
    throw new Error('Use an HTTPS listing link from Poshmark, eBay, Depop, Etsy, or Vinted.');
  }
  if (url.pathname === '/' && !url.search) throw new Error('Paste the link to the item, rather than the marketplace homepage.');
  url.hash = '';
  return url.href;
}
export function combinedCopy(title, description) {
  return [String(title || '').trim(), String(description || '').trim()].filter(Boolean).join('\n\n');
}
export function reviewProblem({ title, description, photos, price }) {
  if (!title?.trim()) return 'Add a listing title before reviewing.';
  if (!description?.trim()) return 'Add a description before reviewing.';
  if (price !== '' && price != null && (!Number.isFinite(Number(price)) || Number(price) < 0)) return 'Enter a valid price or leave it blank.';
  const chosen = photos.filter(p => p.selected);
  if (!chosen.length) return 'Select at least one photo to save.';
  if (chosen.some(p => p.failed || !p.blob || !p.blob.size)) return 'A selected photo is missing. Replace it or deselect it before reviewing.';
  return '';
}
export function photoFilename(index, type) {
  const ext = { 'image/png': 'png', 'image/webp': 'webp', 'image/jpeg': 'jpg' }[type];
  if (!ext) throw new Error('This photo format cannot be exported.');
  return `Photo ${index + 1}.${ext}`;
}
