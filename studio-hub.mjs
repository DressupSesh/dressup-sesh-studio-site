import {getClient,session,request} from './studio-client.mjs';
const $=id=>document.getElementById(id),say=(id,text)=>$(id).textContent=text;
let captcha=null,epoch=0;
function signedOut(){epoch++;$('signed-in').hidden=true;$('signin').hidden=false;$('studio-drafts').hidden=true;$('studio-draft-list').replaceChildren();$('updates-optin').checked=false;$('pro-optin').checked=false;if(!captcha)captcha=window.DRESSUP_TURNSTILE.create('studio-captcha',{onError:message=>say('auth-status',message)});}
async function refresh(){
 const ticket=++epoch,current=await session();if(ticket!==epoch)return;if(!current){signedOut();return;}
 $('signin').hidden=true;$('signed-in').hidden=false;say('account-caption','Signed in as '+current.user.email);
 const results=await Promise.allSettled([request('listing-upgrade'),request('studio-communications')]);if(ticket!==epoch)return;
 if(results[0].status==='fulfilled'){
 const {access,drafts}=results[0].value;say('copy-allowance',access.free_copy_remaining==null?'Unlimited listing copy':`${access.free_copy_remaining} free copy outputs left this month`);say('upgrade-allowance',`${access.remaining} of ${access.limit} upgrades left this month`);
 $('hub-trial').disabled=!!access.trial_active;if(access.trial_active)say('hub-trial','Trial already activated');
 const list=$('studio-draft-list');list.replaceChildren();for(const draft of drafts){const a=document.createElement('a');a.href=(draft.kind==='free_copy'?'/free-copy/':'/listing-upgrade/')+'?draft='+encodeURIComponent(draft.id);a.textContent=draft.source?.title||`${draft.kind==='free_copy'?'Listing copy':'Listing upgrade'} · ${new Date(draft.updated_at).toLocaleDateString()}`;list.append(a);}say('drafts-status',drafts.length?'Your saved work is ready to reopen.':'Your saved drafts will appear here.');$('studio-drafts').hidden=false;
 }else{say('drafts-status',results[0].reason.message);$('studio-drafts').hidden=false;}
 if(results[1].status==='fulfilled'){const p=results[1].value;$('updates-optin').checked=p.preferences.updates;$('pro-optin').checked=p.preferences.pro_interest;$('return-notice').hidden=!p.show_notice;}else say('preferences-status',results[1].reason.message);
 if(location.hash)document.querySelector(location.hash==='#pro-interest'?'#pro-interest':location.hash==='#updates'?'#updates':'#worktable')?.scrollIntoView({block:'start'});
}
async function authenticate(link){
 if(!$('auth-email').reportValidity())return;const token=captcha?.getToken();if(captcha?.enabled&&!token){say('auth-status','Complete the security check first.');return;}
 $('auth-link').disabled=true;
 try{const c=await getClient(),email=$('auth-email').value.trim(),r=link?await c.auth.signInWithOtp({email,options:{shouldCreateUser:true,captchaToken:token,emailRedirectTo:'https://dressupsesh.studio/studio/'}}):await c.auth.signInWithPassword({email,password:$('auth-password').value,options:{captchaToken:token}});captcha?.reset();if(r.error)throw r.error;say('auth-status',link?'Check your email for the newest sign-in link.':'Signed in.');if(!link){$('auth-password').value='';await refresh();}}catch(e){say('auth-status',e.message);}finally{$('auth-link').disabled=false;}
}
$('studio-auth').addEventListener('submit',e=>{e.preventDefault();authenticate(false);});$('auth-link').addEventListener('click',()=>authenticate(true));
$('studio-signout').addEventListener('click',async()=>{await(await getClient()).auth.signOut();signedOut();});
$('notice-dismiss').addEventListener('click',async()=>{try{await request('studio-communications',{action:'dismiss'});$('return-notice').hidden=true;}catch(e){say('preferences-status',e.message);}});
$('preferences-form').addEventListener('submit',async e=>{e.preventDefault();try{if(!await session()){$('signin').scrollIntoView();say('auth-status','Sign in to save your email preferences.');return;}const button=e.target.querySelector('button');button.disabled=true;try{await request('studio-communications',{action:'preferences',updates:$('updates-optin').checked,pro_interest:$('pro-optin').checked,source:'studio'});say('preferences-status','Preferences saved. You can change them here anytime.');}finally{button.disabled=false;}}catch(error){say('preferences-status',error.message);}});
$('hub-trial').addEventListener('click',async()=>{try{await request('listing-upgrade',{action:'trial'});say('hub-trial-status','Your trial is active. Open photo tools to get started.');await refresh();}catch(e){say('hub-trial-status',e.message);if(!await session())$('signin').scrollIntoView();}});
const client=await getClient();client.auth.onAuthStateChange((event)=>{if(event!=='INITIAL_SESSION')setTimeout(()=>refresh(),0);});await refresh();

$('hub-member').addEventListener('click',async()=>{try{if(!await session()){$('signin').scrollIntoView();say('auth-status','Sign in before choosing Member.');return;}$('hub-member').disabled=true;const result=await request('create-checkout-session',{tier:'member'});const u=new URL(result.url);if(u.protocol!=='https:'||!['checkout.stripe.com','billing.stripe.com'].includes(u.hostname))throw Error('Could not open billing.');location.assign(u.href);}catch(e){say('hub-billing-status',e.message);}finally{$('hub-member').disabled=false;}});
