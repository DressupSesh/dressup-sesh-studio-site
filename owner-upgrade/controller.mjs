// Owner-only MVP pilot. The verified create-listing response supplies access.owner.
export function createOwnerUpgrade({client,openAuth,load=()=>import('./embedded.mjs?v=compare-20261113')}) {
 const nav=document.querySelector('.mode-tabs');
 let identity=null,tab=null,panel=null,host=null,lifetime=null,pending=null,navListener=null;
 const panels=()=>['photos-panel','listing-panel','creative-panel'].map(id=>document.getElementById(id));
 function reset(){
  const wasOpen=tab?.classList.contains('active');
  if(navListener)nav.removeEventListener('click',navListener);navListener=null;
  lifetime?.abort();pending=null;identity=null;
  tab?.remove();panel?.remove();tab=null;panel=null;host=null;
  nav?.classList.remove('owner-upgrade-enabled');
  if(wasOpen)nav.querySelector('[data-tab="photos"]').click();
 }
 async function open(){
  if(!identity || !tab)return;
  for(const button of nav.querySelectorAll('[data-tab]'))button.classList.toggle('active',button===tab);
  panels().forEach(node=>node.classList.add('hidden'));panel.hidden=false;
  if(host)return;
  if(pending)return pending;
  const account=identity,signal=lifetime.signal,target=panel;
  target.textContent='Loading Listing Upgrade…';
  pending=(async()=>{
   try{
    const {mountUpgrade}=await load();if(signal.aborted)return;
    host=document.createElement('studio-upgrade');target.replaceChildren(host);
    // Bind every operation to the verified owner who opened this workspace.
    const scopedClient={auth:{getSession:async()=>{
     const result=await client.auth.getSession();
     return !signal.aborted && identity===account && result.data?.session?.user?.id===account
      ? result : {data:{session:null},error:null};
    }}};
    await mountUpgrade(host,{client:scopedClient,openAuth,signal,onAccess:access=>{
     if(signal.aborted)return;
     if(access && (access.allowed!==true || access.tier!=='owner'))reset();
    }});
   }catch(error){
    if(signal.aborted)return;host=null;target.replaceChildren();
    const message=document.createElement('p');message.textContent='Listing Upgrade could not load. Your other Studio tools are still available.';
    const retry=document.createElement('button');retry.textContent='Try again';retry.type='button';retry.addEventListener('click',()=>{void open();});
    target.append(message,retry);
   }finally{if(!signal.aborted)pending=null;}
  })();return pending;
 }
 function setSession(session,access){
  const next=session?.user?.id && access?.owner===true && access.allowed===true && !access.access_suspended ? session.user.id : null;
  if(next===identity)return;
  reset();if(!next || !client || !nav)return;
  identity=next;lifetime=new AbortController();
  if(!document.querySelector('link[data-owner-upgrade-style]')){
   const link=document.createElement('link');link.rel='stylesheet';link.href='/owner-upgrade/mvp.css';link.dataset.ownerUpgradeStyle='';document.head.append(link);
  }
  tab=document.createElement('button');tab.type='button';tab.dataset.tab='upgrade';tab.id='owner-upgrade-tab';tab.setAttribute('aria-controls','owner-upgrade-panel');
  tab.innerHTML='<span>04 · LISTING UPGRADE</span><small>Owner test · unlimited access</small>';
  nav.querySelector('[data-tab="creative"]').after(tab);nav.classList.add('owner-upgrade-enabled');
  panel=document.createElement('section');panel.id='owner-upgrade-panel';panel.hidden=true;panel.setAttribute('aria-label','Listing Upgrade owner test');nav.after(panel);
  tab.addEventListener('click',()=>{void open();},{signal:lifetime.signal});
  navListener=event=>{const other=event.target.closest('[data-tab]');if(panel && other && other!==tab)panel.hidden=true;};
  nav.addEventListener('click',navListener,{signal:lifetime.signal});
  if(new URLSearchParams(location.search).get('tab')==='upgrade')void open();
 }
 return {setSession,destroy:reset};
}
