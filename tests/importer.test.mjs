import test from 'node:test';
import assert from 'node:assert/strict';
import {importListing, limitedFetch, listingHosts} from '../supabase/functions/listing-upgrade/importer.ts';
const item='5cbf615dfe19c735e459ed5b';
const photo='https://di2ponv0v5otw.cloudfront.net/item.jpg';
const listing=`<script type="application/ld+json">${JSON.stringify({'@type':'Product',name:'Vintage red wool blazer',description:'Size 2',image:[photo]})}</script>`;
const html=s=>new Response(s,{headers:{'Content-Type':'text/html'}});
const redirect=u=>new Response(null,{status:307,headers:{location:u}});
function mock(t,responses){const seen=[];t.mock.method(globalThis,'fetch',async(url)=>{seen.push(String(url));const r=responses.shift();assert.ok(r,'unexpected fetch');return r;});return seen;}
test('Poshmark phone share resolves via same-token Branch handoff to full listing',async t=>{
 const seen=mock(t,[redirect('https://bnc.lt/m/abc123?_p=test'),html(`<meta property="al:ios:url" content="poshmark://listing/${item}?tracking=ignored">`),html(listing)]);
 const result=await importListing('https://posh.mk/abc123');
 assert.equal(result.title,'Vintage red wool blazer');assert.deepEqual(result.photos,[photo]);assert.equal(result.sourceUrl,`https://poshmark.com/listing/${item}`);assert.equal(seen.length,3);
});
test('direct listing and direct short-link redirect still import',async t=>{
 mock(t,[html(listing),redirect(`https://poshmark.com/listing/${item}`),html(listing)]);
 assert.equal((await importListing(`https://poshmark.com/listing/${item}`)).title,'Vintage red wool blazer');
 assert.equal((await importListing('https://posh.mk/abc123')).title,'Vintage red wool blazer');
});
test('script-only Branch handoff extracts item identity without executing JavaScript',async t=>{
 mock(t,[redirect('https://bnc.lt/m/abc123'),html(`<script>window.top.location=validateProtocol("https://poshmark.com/listing/${item}?tracking=ignored");</script>`),html(listing)]);
 assert.equal((await importListing('https://posh.mk/abc123')).sourceUrl,`https://poshmark.com/listing/${item}`);
});
test('Branch is not a public input or an allowed redirect from another marketplace',async t=>{
 const seen=mock(t,[redirect('https://bnc.lt/m/abc123')]);
 await assert.rejects(importListing('https://bnc.lt/m/abc123'),/UNSUPPORTED_LINK/);
 await assert.rejects(importListing('https://ebay.com/item'),/UNSUPPORTED_LINK/);assert.equal(seen.length,1);
});
test('share redirect rejects wrong token, insecure URL, lookalike host and credentials',async t=>{
 const targets=['https://bnc.lt/m/wrong','http://bnc.lt/m/abc123','https://bnc.lt.evil.example/m/abc123','https://name@bnc.lt/m/abc123','https://bnc.lt:8443/m/abc123'];
 const seen=mock(t,targets.map(redirect));
 for(const target of targets)await assert.rejects(importListing('https://posh.mk/abc123'),/UNSUPPORTED_LINK/);
 assert.equal(seen.length,targets.length);
});
test('Branch cannot redirect to a private address or supply an arbitrary app link',async t=>{
 mock(t,[redirect('https://bnc.lt/m/abc123'),redirect('https://127.0.0.1/'),redirect('https://bnc.lt/m/abc123'),html('<meta property="al:ios:url" content="https://evil.example/listing/foo">')]);
 await assert.rejects(importListing('https://posh.mk/abc123'),/UNSUPPORTED_LINK/);
 await assert.rejects(importListing('https://posh.mk/abc123'),/IMPORT_BLOCKED/);
});
test('byte and redirect bounds remain enforced',async t=>{
 mock(t,[html('too large'),...Array.from({length:5},()=>redirect('https://poshmark.com/loop'))]);
 await assert.rejects(limitedFetch('https://poshmark.com/item',listingHosts,2),/FILE_TOO_LARGE/);
 await assert.rejects(importListing('https://poshmark.com/loop'),/IMPORT_BLOCKED/);
});
