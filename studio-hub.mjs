import {mountPhoneAuth} from './sms-auth.mjs';
import {clearPending} from './signup-continuity.mjs';
import {getClient,session,request} from './studio-client.mjs';
const $=id=>document.getElementById(id),say=(id,text)=>$(id).textContent=text;
let captcha=null,epoch=0,phoneMounted=false,linkMounted=false;
let visibleAccountId=null;

function resetAccount() {
 visibleAccountId=null;
 $('account-nav').hidden=true;
 $('signin-nav').hidden=false;
 $('hub-owner-pro').hidden=true;
 $('account-billing').hidden=true;
 $('hub-billing-link').hidden=true;
 $('hub-member').hidden=false;
 say('account-membership','Checking your membership…');
 say('account-billing-status','');
}

function renderMembership(legacyAccess, upgradeAccess) {
 const owner=legacyAccess?.owner || upgradeAccess?.tier==='owner';
 const status=legacyAccess?.subscription_status;
 const hasBilling=!owner && (legacyAccess?.paid || ['active','trialing','past_due','unpaid','paused','incomplete'].includes(status));
 $('hub-owner-pro').hidden=!owner;
 $('account-billing').hidden=!hasBilling;
 $('hub-billing-link').hidden=!hasBilling;
 $('hub-member').hidden=Boolean(owner || hasBilling);

 if (owner) {
  say('account-membership','Owner · Unlimited access · No recurring subscription');
  return;
 }
 if (!legacyAccess) {
  say('account-membership','Membership could not be verified. Refresh to try again.');
  return;
 }
 if (legacyAccess.access_suspended) {
  say('account-membership','Membership refunded · Studio access suspended');
  return;
 }
 if (!legacyAccess.paid && !hasBilling) {
  say('account-membership',upgradeAccess?.trial_active ? 'Free · Studio trial activated' : 'Free · No recurring subscription');
  return;
 }

 const tier=upgradeAccess?.tier;
 const plan=tier==='pro' ? 'Pro' : tier==='member' || tier==='free' ? 'Member' : 'Paid membership';
 const date=legacyAccess.current_period_end ? new Date(legacyAccess.current_period_end) : null;
 const periodEnd=date && !Number.isNaN(date.valueOf()) ? new Intl.DateTimeFormat(undefined,{dateStyle:'long'}).format(date) : 'the end of your billing period';
 if (legacyAccess.cancel_at_period_end) {
  say('account-membership',plan+' · Access ends '+periodEnd);
 } else {
  const billingStatus=status ? status.replaceAll('_',' ') : 'active';
  const nextDate=date && !Number.isNaN(date.valueOf()) && ['active','trialing'].includes(status)
   ? ' · Next billing date '+periodEnd : '';
  say('account-membership',plan+' · '+billingStatus+nextDate);
 }
}
function signedOut(){epoch++;resetAccount();$('signed-in').hidden=true;$('signin').hidden=false;$('studio-drafts').hidden=true;$('studio-draft-list').replaceChildren();$('updates-optin').checked=false;$('pro-optin').checked=false;if(!captcha)captcha=window.DRESSUP_TURNSTILE.create('studio-captcha',{onError:message=>say('auth-status',message)});if(!phoneMounted){phoneMounted=true;void mountPhoneAuth(document.querySelector('[data-sms-login]'),{getClient,getCaptcha:()=>captcha,onSuccess:refresh});}}
async function refresh(){
 const ticket=++epoch,current=await session();if(ticket!==epoch)return;if(!current){signedOut();return;}
 if(visibleAccountId!==current.user.id){resetAccount();visibleAccountId=current.user.id;}
 $('account-nav').hidden=false;$('signin-nav').hidden=true;
 $('signin').hidden=true;$('signed-in').hidden=false;say('account-caption','Signed in as '+(current.user.email||current.user.phone||'your account'));
 if(!linkMounted){linkMounted=true;void mountPhoneAuth(document.querySelector('[data-sms-link]'),{getClient,linking:true,onSuccess:refresh});}
 const results=await Promise.allSettled([request('listing-upgrade'),request('studio-communications'),request('create-listing')]);if(ticket!==epoch)return;
 const upgradeAccess=results[0].status==='fulfilled'?results[0].value.access:null;
 const legacyAccess=results[2].status==='fulfilled'?results[2].value.access:null;
 renderMembership(legacyAccess,upgradeAccess);
 if(results[0].status==='fulfilled'){
 const {access,drafts}=results[0].value;say('copy-allowance',access.free_copy_remaining==null?'Unlimited listing copy':`${access.free_copy_remaining} free copy outputs left this month`);say('upgrade-allowance',`${access.remaining} of ${access.limit} upgrades left this month`);
 $('hub-trial').disabled=!!access.trial_active;if(access.trial_active)say('hub-trial','Trial already activated');
 const list=$('studio-draft-list');list.replaceChildren();for(const draft of drafts){const a=document.createElement('a');a.href=(draft.kind==='free_copy'?'/free-copy/':'/listing-upgrade/')+'?draft='+encodeURIComponent(draft.id);a.textContent=draft.source?.title||`${draft.kind==='free_copy'?'Listing copy':'Listing upgrade'} · ${new Date(draft.updated_at).toLocaleDateString()}`;list.append(a);}say('drafts-status',drafts.length?'Your saved work is ready to reopen.':'Your saved drafts will appear here.');$('studio-drafts').hidden=false;
 }else{say('drafts-status',results[0].reason.message);$('studio-drafts').hidden=false;}
 if(results[1].status==='fulfilled'){const p=results[1].value;$('updates-optin').checked=p.preferences.updates;$('pro-optin').checked=p.preferences.pro_interest;$('return-notice').hidden=!p.show_notice;}else say('preferences-status',results[1].reason.message);
 const target=location.hash.slice(1);
 if(['pro-interest','updates','account','worktable'].includes(target))$(target).scrollIntoView({block:'start'});
 if(target==='signin')$('account').scrollIntoView({block:'start'});
}
async function authenticate(link){
 if(!$('auth-email').reportValidity())return;const token=captcha?.getToken();if(captcha?.enabled&&!token){say('auth-status','Complete the security check first.');return;}
 $('auth-link').disabled=true;
 try{const c=await getClient(),email=$('auth-email').value.trim(),r=link?await c.auth.signInWithOtp({email,options:{shouldCreateUser:true,captchaToken:token,emailRedirectTo:'https://dressupsesh.studio/'}}):await c.auth.signInWithPassword({email,password:$('auth-password').value,options:{captchaToken:token}});captcha?.reset();if(r.error)throw r.error;say('auth-status',link?'Check your email for the newest sign-in link.':'Signed in.');if(!link){$('auth-password').value='';await refresh();}}catch(e){say('auth-status',e.message);}finally{$('auth-link').disabled=false;}
}
$('studio-auth').addEventListener('submit',e=>{e.preventDefault();authenticate(false);});$('auth-link').addEventListener('click',()=>authenticate(true));
$('studio-signout').addEventListener('click',async()=>{await clearPending();await(await getClient()).auth.signOut();signedOut();});
$('notice-dismiss').addEventListener('click',async()=>{try{await request('studio-communications',{action:'dismiss'});$('return-notice').hidden=true;}catch(e){say('preferences-status',e.message);}});
$('preferences-form').addEventListener('submit',async e=>{e.preventDefault();try{if(!await session()){$('signin').scrollIntoView();say('auth-status','Sign in to save your email preferences.');return;}const button=e.target.querySelector('button');button.disabled=true;try{await request('studio-communications',{action:'preferences',updates:$('updates-optin').checked,pro_interest:$('pro-optin').checked,source:'studio'});say('preferences-status','Preferences saved. You can change them here anytime.');}finally{button.disabled=false;}}catch(error){say('preferences-status',error.message);}});
$('hub-trial').addEventListener('click',async()=>{try{await request('listing-upgrade',{action:'trial'});say('hub-trial-status','Your trial is active. Open photo tools to get started.');await refresh();}catch(e){say('hub-trial-status',e.message);if(!await session())$('signin').scrollIntoView();}});
$('account-billing').addEventListener('click',async()=>{
 const button=$('account-billing'),accountId=visibleAccountId;
 button.disabled=true;
 say('account-billing-status','Opening billing…');
 try{
  const result=await request('create-customer-portal',{});
  if(accountId!==visibleAccountId)return;
  const url=new URL(result.url);
  if(url.protocol!=='https:'||url.hostname!=='billing.stripe.com')throw Error('Could not open billing.');
  location.assign(url.href);
 }catch(e){
  if(accountId===visibleAccountId)say('account-billing-status',e.message);
 }finally{
  button.disabled=false;
 }
});
const client=await getClient();client.auth.onAuthStateChange((event)=>{if(event!=='INITIAL_SESSION')setTimeout(()=>refresh(),0);});await refresh();

$('hub-member').addEventListener('click',async()=>{try{if(!await session()){$('signin').scrollIntoView();say('auth-status','Sign in before choosing Member.');return;}$('hub-member').disabled=true;const result=await request('create-checkout-session',{tier:'member'});const u=new URL(result.url);if(u.protocol!=='https:'||!['checkout.stripe.com','billing.stripe.com'].includes(u.hostname))throw Error('Could not open billing.');location.assign(u.href);}catch(e){say('hub-billing-status',e.message);}finally{$('hub-member').disabled=false;}});

const billingReturn=new URLSearchParams(location.search).get('billing');
if(billingReturn)say('hub-billing-status',billingReturn==='cancelled'?'Checkout was cancelled.':'Checkout returned. Your allowance refreshes when the payment is confirmed.');
if(new URLSearchParams(location.search).get('password-reset')==='success')say('auth-status','Password updated. Sign in with your new password.');

