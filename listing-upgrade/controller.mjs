// Bind every draft request to the verified account that opened this workspace.
export function createUpgradeController({panel,client,openAuth,onAccess,load=()=>import('./embedded.mjs?v=release-20261113')}) {
  let identity, lifetime=null, pending=null;
  function clear() {
    lifetime?.abort();
    lifetime=null;
    pending=null;
    panel.replaceChildren();
    onAccess(null);
  }
  function setSession(session) {
    const next=session?.user?.id || null;
    if(next===identity) return pending;
    clear();
    identity=next;
    if(!next) {
      const message=document.createElement('p');
      message.textContent='Sign in to upgrade a listing and open your saved drafts.';
      const button=document.createElement('button');
      button.type='button'; button.textContent='Sign in';
      button.addEventListener('click',openAuth);
      panel.append(message,button);
      return;
    }
    lifetime=new AbortController();
    const account=next,signal=lifetime.signal;
    panel.textContent='Loading Listing Upgrade…';
    pending=(async()=>{
      try {
        const {mountUpgrade}=await load();
        if(signal.aborted)return;
        const host=document.createElement('studio-upgrade');
        panel.replaceChildren(host);
        const scopedClient={auth:{getSession:async()=>{
          const result=await client.auth.getSession();
          return !signal.aborted && identity===account && result.data?.session?.user?.id===account
            ? result : {data:{session:null},error:null};
        }}};
        await mountUpgrade(host,{client:scopedClient,openAuth,signal,onAccess:access=>{
          if(!signal.aborted && identity===account)onAccess(access);
        }});
      } catch(error) {
        if(signal.aborted)return;
        panel.replaceChildren();
        const message=document.createElement('p');
        message.textContent='Listing Upgrade could not load. Your other Studio tools are still available.';
        const retry=document.createElement('button');
        retry.type='button';retry.textContent='Try again';
        retry.addEventListener('click',()=>{identity=undefined;void setSession(session);});
        panel.append(message,retry);
      } finally {if(!signal.aborted)pending=null;}
    })();
    return pending;
  }
  return {setSession,destroy(){clear();identity=undefined;}};
}
