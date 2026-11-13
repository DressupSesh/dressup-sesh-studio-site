import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {parseHTML} from 'linkedom';import {mountUpgrade} from '../../listing-upgrade/embedded.mjs';
test('Listing Upgrade mounts inside MVP, retains drafts and respects separate allowances',async()=>{
 const {window,document}=parseHTML('<html><body><studio-upgrade></studio-upgrade></body></html>');
 Object.assign(globalThis,{window,document,location:new URL('https://dressupsesh.studio/studio.html?tab=upgrade'),history:{replaceState(){}}});
 window.DRESSUP_CONFIG={supabaseUrl:'https://example.test',supabasePublishableKey:'public'};
 const access={allowed:true,tier:'free',remaining:0,limit:3,resets_at:'2026-12-01',trial_active:true};const calls=[];
 globalThis.fetch=async(url,options)=>{calls.push([url,options]);return url.startsWith('/listing-upgrade/workspace.html')?new Response(fs.readFileSync(new URL('../../listing-upgrade/workspace.html',import.meta.url))):Response.json({access,drafts:[{id:'up1',kind:'upgrade',source:{title:'Upgrade draft'}},{id:'copy1',kind:'free_copy',source:{title:'Copy-only draft'}}]});};
 const host=document.querySelector('studio-upgrade');let observed;
 await mountUpgrade(host,{client:{auth:{getSession:async()=>({data:{session:{user:{id:'u'},access_token:'test'}}})}},openAuth(){},onAccess:a=>observed=a});
 assert.equal(host.shadowRoot.querySelector('#draft-list').textContent,'Upgrade draft');assert.equal(observed.remaining,0);assert.equal(host.shadowRoot.querySelector('#import-button').disabled,true);assert.equal(host.shadowRoot.querySelector('#manual-load').disabled,true);assert.equal(host.shadowRoot.querySelector('#sample'),null);assert.ok(host.shadowRoot.querySelector('#post-dialog'));assert.ok(calls.every(c=>!c[1]?.body));
});
