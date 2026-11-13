import {getClient} from '/studio-client.mjs?v=release-20261113';
import {mountInstallPrompt} from '/install-prompt.mjs?v=release-20261113';
const url=new URL(location.href);
const authReturn=/(?:^#|&)(access_token|refresh_token|type)=/.test(url.hash)||['code','billing','password-reset'].some(k=>url.searchParams.has(k))||['signin','subscribe','credits'].includes(url.searchParams.get('intent'));
if(authReturn)location.replace('/studio.html'+location.search+location.hash);
else {
 const client=await getClient();
 const {data}=await client.auth.getSession();
 if(data.session && url.searchParams.get('view')!=='landing')location.replace('/studio.html');
 else {
  const prompt=await mountInstallPrompt({client});
  document.querySelectorAll('[data-install-open]').forEach(a=>a.addEventListener('click',e=>{e.preventDefault();prompt.open();}));
 }
}
