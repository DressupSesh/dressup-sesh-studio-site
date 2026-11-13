import test from 'node:test';import assert from 'node:assert/strict';import {parseHTML} from 'linkedom';import {mountInstallPrompt} from '../../install-prompt.mjs';
for(const profile of [false,true]) test(`${profile?'signed-in':'guest'} popup waits a full ten seconds and choices reach the feedback RPC`,async()=>{
 const {window,document}=parseHTML('<html><body></body></html>');const storage=()=>({data:new Map(),getItem(k){return this.data.get(k)||null;},setItem(k,v){this.data.set(k,v);}});
 Object.assign(window,{localStorage:storage(),sessionStorage:storage()});Object.assign(globalThis,{window,document,matchMedia:()=>({matches:false})});
 const realTimer=globalThis.setTimeout;let delay,run;
 globalThis.setTimeout=(fn,ms)=>{run=fn;delay=ms;return 1;};const calls=[];
 try {
  await mountInstallPrompt({profilePage:profile,client:{auth:{getSession:async()=>({data:{session:profile?{user:{id:'timer-test',last_sign_in_at:'now'}}:null}})},rpc:async(name,args)=>{calls.push([name,args]);return {data:{dismissed:false},error:null};}}});
  assert.equal(delay,10000);const d=document.querySelector('dialog');assert.equal(d.hasAttribute('open'),false);
  d.showModal=()=>d.setAttribute('open','');d.close=()=>d.removeAttribute('open');run();assert.ok(d.hasAttribute('open'));
  d.querySelector('[data-done]').click();await Promise.resolve();await Promise.resolve();
  const feedback=calls.find(([name])=>name==='studio_record_install_feedback');assert.equal(feedback[1].p_outcome,'done');assert.equal(d.hasAttribute('open'),false);
 }finally{globalThis.setTimeout=realTimer;}
});
