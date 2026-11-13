export const PROMPT_VERSION='2026-11';
export const GUEST_DELAY=10000;
export function shouldPrompt({profile,dismissed,seen,standalone}) { return !dismissed && !seen && (profile || !standalone); }
const get=(store,key)=>{try{return store.getItem(key);}catch{return null;}};
const put=(store,key,value)=>{try{store.setItem(key,value);}catch{}};
export async function mountInstallPrompt({client,profilePage=false}) {
 const dialog=document.createElement('dialog');dialog.className='install-prompt';dialog.setAttribute('aria-labelledby','install-prompt-title');
 dialog.innerHTML=`<button class="install-close" aria-label="Close app instructions" data-close>×</button><img src="/assets/studio-apple-touch-icon.png" alt=""><h2 id="install-prompt-title">Keep Studio one tap away.</h2><p>Add Studio to your Home Screen so it’s ready for your next listing.</p><div class="install-devices"><button data-device="iphone">iPhone</button><button data-device="android">Android</button><button data-device="desktop">Computer</button></div><ol data-steps></ol><button data-native hidden>Install Studio</button><p>You’ll still need an internet connection. Sign in with the same account. Save finished work before clearing an item.</p><div class="install-actions"><button data-done>Done, don’t show this again</button><button data-problem>Report a problem saving as an app</button><button data-close>Not now</button></div><form data-report hidden><label>What happened? (optional)<textarea maxlength="2000" rows="3" data-details placeholder="Tell us which step didn’t work."></textarea></label><button type="submit">Send problem report</button></form><p role="status" aria-live="polite" data-status></p>`;
 document.body.append(dialog);
 const q=s=>dialog.querySelector(s), storage=window.localStorage, sessionStore=window.sessionStorage;
 let visitor=get(storage,'studio-install-visitor');if(!visitor){visitor=crypto.randomUUID();put(storage,'studio-install-visitor',visitor);}
 let current=null, nativePrompt=null, showing=false, timer=null, requestId=null, epoch=0;
 let device=(/iPhone|iPad|iPod/.test(navigator.userAgent)||(/Macintosh/.test(navigator.userAgent)&&navigator.maxTouchPoints>1))?'iphone':/Android/.test(navigator.userAgent)?'android':'desktop';
 const standalone=()=>matchMedia('(display-mode: standalone)').matches || navigator.standalone===true;
 const seenKey=()=>`studio-install-seen:${PROMPT_VERSION}:${current?.user?.id||'guest'}:${current?.user?.last_sign_in_at||''}`;
 const doneKey=()=>`studio-install-done:${PROMPT_VERSION}:${current?.user?.id||'guest'}`;
 const instructions={iphone:['Open Studio in Safari. If you’re in TikTok or Instagram, choose Open in browser first.','Tap Share, then Add to Home Screen. You may need to scroll down in the share menu.','Keep the name Dressup Sesh Studio. Turn on Open as Web App if shown, then tap Add.','Open the new icon. Return here and choose Done once you’ve saved it.'],android:['Open Studio in Chrome.','Open the three-dot menu and choose Add to Home screen or Install app.','Confirm Add or Install, then open the new Studio icon.'],desktop:['Open Studio in Chrome or Edge.','Use the install icon in the address bar or the browser menu → Install this site as an app.','In Safari on Mac, use File → Add to Dock if available.']};
 function renderDevice(){dialog.querySelectorAll('[data-device]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.device===device)));q('[data-steps]').replaceChildren(...instructions[device].map(text=>{const li=document.createElement('li');li.textContent=text;return li;}));}
 renderDevice();dialog.querySelectorAll('[data-device]').forEach(b=>b.addEventListener('click',()=>{device=b.dataset.device;renderDevice();}));
 function close(){dialog.close();showing=false;put(sessionStore,seenKey(),'1');}
 dialog.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',close));dialog.addEventListener('cancel',()=>{showing=false;put(sessionStore,seenKey(),'1');});
 function open(){if(dialog.open)return;clearTimeout(timer);showing=true;q('[data-report]').hidden=true;q('[data-status]').textContent='';dialog.showModal();put(sessionStore,seenKey(),'1');}
 async function check(){
  const ticket=++epoch;clearTimeout(timer);
  const {data}=await client.auth.getSession();current=data.session;
  if(showing)return;
  let dismissed=!!get(storage,doneKey());
  if(current){try{const r=await client.rpc('studio_install_prompt_status');if(!r.error)dismissed ||= !!r.data?.dismissed;}catch{}}
  if(ticket!==epoch || !shouldPrompt({profile:!!current,dismissed,seen:!!get(sessionStore,seenKey()),standalone:standalone()}))return;
  // Signed-in landing visitors go straight to Studio; show their next-login prompt there.
  if(current&&!profilePage)return;
  const showWhenClear=()=>{if(ticket!==epoch)return;if(document.querySelector('dialog[open]') || document.querySelector('studio-upgrade')?.shadowRoot?.querySelector('dialog[open]')){timer=setTimeout(showWhenClear,1000);return;}open();};
  timer=setTimeout(showWhenClear,GUEST_DELAY);
 }
 async function submit(outcome){
  q('[data-status]').textContent='Saving your response…';dialog.querySelectorAll('button').forEach(b=>b.disabled=true);
  try{
   requestId ||= crypto.randomUUID();
   const {error}=await client.rpc('studio_record_install_feedback',{p_id:requestId,p_visitor_id:visitor,p_outcome:outcome,p_device:device,p_details:outcome==='problem'?q('[data-details]').value:''});
   if(error)throw error;
   if(outcome==='done')put(storage,doneKey(),'1');
   requestId=null;close();
  }catch{q('[data-status]').textContent='Your response could not be saved. Please try again.';}
  finally{dialog.querySelectorAll('button').forEach(b=>b.disabled=false);}
 }
 q('[data-done]').addEventListener('click',()=>submit('done'));
 q('[data-problem]').addEventListener('click',()=>{q('[data-report]').hidden=false;q('[data-details]').focus();});
 q('[data-report]').addEventListener('submit',e=>{e.preventDefault();submit('problem');});
 window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();nativePrompt=e;q('[data-native]').hidden=false;});
 q('[data-native]').addEventListener('click',async()=>{if(!nativePrompt)return;await nativePrompt.prompt();nativePrompt=null;q('[data-native]').hidden=true;});
 window.addEventListener('studio:session',()=>{void check();});
 window.addEventListener('pagehide',()=>{clearTimeout(timer);epoch++;});
 await check();return {open};
}
