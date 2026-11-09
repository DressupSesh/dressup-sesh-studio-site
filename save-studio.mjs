let prompt;
const $=id=>document.getElementById(id);
function platform(name){document.querySelectorAll('[data-platform]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.platform===name)));$('iphone-steps').hidden=name!=='iphone';$('android-steps').hidden=name!=='android';}
document.querySelectorAll('[data-platform]').forEach(b=>b.addEventListener('click',()=>platform(b.dataset.platform)));
if(/Android/i.test(navigator.userAgent))platform('android');
window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();prompt=event;$('install-studio').hidden=false;});
$('install-studio').addEventListener('click',async()=>{if(!prompt)return;await prompt.prompt();prompt=null;$('install-studio').hidden=true;});
$('copy-save-link').addEventListener('click',async()=>{try{await navigator.clipboard.writeText('https://dressupsesh.studio/save-studio/');$('save-link-status').textContent='Link copied. Save it or share it for later.';}catch{$('save-link-status').textContent='Save this link: https://dressupsesh.studio/save-studio/';}});
