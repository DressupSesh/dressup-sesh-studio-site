let clientPromise;
export function getClient(){
 if(!clientPromise)clientPromise=import('https://esm.sh/@supabase/supabase-js@2.57.4').then(({createClient})=>createClient(window.DRESSUP_CONFIG.supabaseUrl,window.DRESSUP_CONFIG.supabasePublishableKey));
 return clientPromise;
}
export async function session(){return (await (await getClient()).auth.getSession()).data.session;}
export async function request(name,body,query=''){
 const current=await session();if(!current)throw Error('Sign in to continue.');
 const r=await fetch(window.DRESSUP_CONFIG.supabaseUrl+'/functions/v1/'+name+query,{method:body?'POST':'GET',headers:{apikey:window.DRESSUP_CONFIG.supabasePublishableKey,Authorization:'Bearer '+current.access_token,...body?{'Content-Type':'application/json'}:{}},body:body?JSON.stringify(body):undefined});
 const result=await r.json();if(!r.ok)throw Error(result.error||'Could not complete this step. Try again.');return result;
}
let noticeLoaded=false;
export async function workflowNotice(){
 if(noticeLoaded)return;noticeLoaded=true;
 try{const p=await request('studio-communications');if(!p.show_notice)return;const main=document.querySelector('main');const box=document.createElement('aside');box.className='notice workflow-notice';box.innerHTML='<h2>Your Studio is ready for your routine.</h2><p>Write listing copy from your item photos or give an existing listing a fresh start. Save Studio to your Home Screen so it’s easy to find whenever you’re ready to list.</p><p><a href="/save-studio/">Save Studio for later ↗</a> · <a href="/studio/#updates">Choose email updates</a></p><button type="button" class="secondary">Not now</button>';box.querySelector('button').addEventListener('click',async()=>{try{await request('studio-communications',{action:'dismiss'});box.remove();}catch{box.remove();}});main.prepend(box);}catch{noticeLoaded=false;}
}
