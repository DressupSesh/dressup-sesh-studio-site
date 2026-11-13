export const listingHosts = ['poshmark.com','posh.mk','ebay.com','ebay.us','depop.com','etsy.com','vinted.com','vinted.co.uk'];
const imageHosts = ['di2ponv0v5otw.cloudfront.net','poshmark.com','i.ebayimg.com','depop.com','media-photos.depop.com','etsystatic.com','vinted.net'];
export function safeURL(value: string, hosts: string[]) {
 const u=new URL(value);
 if(u.protocol!=='https:' || u.username || u.password || u.port || !hosts.some(h=>u.hostname===h || u.hostname.endsWith('.'+h))) throw new Error('UNSUPPORTED_LINK');
 u.hash=''; return u;
}
export async function limitedFetch(value: string, hosts: string[], max: number, poshShare = false) {
 let u=safeURL(value,hosts);
 for(let i=0;i<5;i++) {
  const r=await fetch(u,{redirect:'manual',signal:AbortSignal.timeout(12000),headers:{'User-Agent':'DressupSeshListingImporter/1.0','Accept':'text/html,image/jpeg,image/png,image/webp'}});
  if([301,302,303,307,308].includes(r.status)){
   await r.body?.cancel();
   const next=new URL(r.headers.get('location')||'',u);
   // Branch is allowed only as the same-token handoff from a Poshmark share link.
   if(poshShare && u.hostname==='posh.mk' && /^\/[A-Za-z0-9]+$/.test(u.pathname) && next.hostname==='bnc.lt' && next.pathname==='/m'+u.pathname) u=safeURL(next.href,['bnc.lt']);
   else u=safeURL(next.href,hosts);
   continue;
  }
  if(!r.ok) {await r.body?.cancel();throw new Error('IMPORT_BLOCKED');}
  if(Number(r.headers.get('content-length'))>max){await r.body?.cancel();throw new Error('FILE_TOO_LARGE');}
  const reader=r.body?.getReader();if(!reader)throw new Error('EMPTY_RESPONSE');
  const parts:Uint8Array[]=[];let size=0;
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>max){await reader.cancel();throw new Error('FILE_TOO_LARGE');}parts.push(value);}
  const bytes=new Uint8Array(size);let n=0;for(const p of parts){bytes.set(p,n);n+=p.length;}
  return {bytes,type:(r.headers.get('content-type')||'').split(';')[0],url:u.href};
 }
 throw new Error('IMPORT_BLOCKED');
}
const decode=(s:unknown)=>String(s||'').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>');
export function parseListing(html:string,url:string){
 const meta=(name:string)=>{for(const m of html.matchAll(/<meta\s[^>]*>/gi)){const attrs=Object.fromEntries([...m[0].matchAll(/([\w:-]+)\s*=\s*(["'])(.*?)\2/gs)].map(a=>[a[1].toLowerCase(),a[3]]));if(attrs.property===name||attrs.name===name)return decode(attrs.content);}return '';};
 let product:Record<string,any>={};
 for(const m of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)){
  try{const walk=(x:any):void=>{if(!x||typeof x!=='object')return;if(x['@type']==='Product'||x['@type']?.includes?.('Product')){product=x;return;}for(const v of Object.values(x))if(typeof v==='object')Array.isArray(v)?v.forEach(walk):walk(v);};walk(JSON.parse(m[1]));}catch{/* Third-party malformed metadata */}
 }
 const imageList=(Array.isArray(product.image)?product.image:[product.image]).map(x=>typeof x==='string'?x:x?.url||x?.contentUrl).filter(Boolean);
 if(!imageList.length&&meta('og:image'))imageList.push(meta('og:image'));
 const photos=[...new Set(imageList)].slice(0,16).filter(x=>{try{safeURL(x as string,imageHosts);return true;}catch{return false;}}) as string[];
 const offer=Array.isArray(product.offers)?product.offers[0]:product.offers;
 return {title:decode(product.name||meta('og:title')).slice(0,200),description:decode(product.description||meta('og:description')).slice(0,6000),brand:decode(product.brand?.name||product.brand).slice(0,100),size:decode(product.size||meta('product:size')).slice(0,80),price:offer?.price?String(offer.price):'',sourceUrl:url,photos};
}
export async function importListing(url:string){
 const start=safeURL(url,listingHosts);
 const short=start.hostname==='posh.mk';
 let page=await limitedFetch(start.href,listingHosts,2*1024*1024,short);
 if(short && new URL(page.url).hostname==='bnc.lt'){
  if(!page.type.includes('text/html'))throw new Error('IMPORT_BLOCKED');
  const html=new TextDecoder().decode(page.bytes);
  // Read the item identity, never execute the handoff page or follow arbitrary URLs.
  let id='';
  for(const tag of html.matchAll(/<meta\s[^>]*>/gi)){
   const attrs=Object.fromEntries([...tag[0].matchAll(/([\w:-]+)\s*=\s*(["'])(.*?)\2/gs)].map(a=>[a[1].toLowerCase(),a[3]]));
   if(attrs.property==='al:ios:url') id=/^poshmark:\/\/listing\/([a-f0-9]{24})(?:\?|$)/i.exec(decode(attrs.content))?.[1]||'';
  }
  // Branch also serves a script-only handoff. Extract only its fixed Poshmark item ID.
  if(!id) id=/validateProtocol\(["']https:\/\/poshmark\.com\/listing\/([a-f0-9]{24})(?:\?|["'])/i.exec(html)?.[1]||'';
  if(!id)throw new Error('IMPORT_BLOCKED');
  page=await limitedFetch('https://poshmark.com/listing/'+id,['poshmark.com'],2*1024*1024);
 }
 if(!page.type.includes('text/html'))throw new Error('IMPORT_BLOCKED');
 const listing=parseListing(new TextDecoder().decode(page.bytes),page.url);
 if(!listing.title||!listing.photos.length)throw new Error('IMPORT_BLOCKED');
 return listing;
}
export async function importPhoto(url:string){const photo=await limitedFetch(url,imageHosts,12*1024*1024);if(!['image/jpeg','image/png','image/webp'].includes(photo.type))throw new Error('INVALID_PHOTO');return photo;}

