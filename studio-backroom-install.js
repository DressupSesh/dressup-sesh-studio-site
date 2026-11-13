(()=>{
 const $=id=>document.getElementById(id);let epoch=0;
 function clear(){epoch++;$('install-feedback-data').hidden=true;$('install-feedback-rows').replaceChildren();$('install-feedback-status').textContent='Owner verification required.';}
 async function load(){
  if(!window.DRESSUP_STUDIO_ADMIN)return;const ticket=++epoch;
  $('install-feedback-status').textContent='Loading Home Screen responses…';
  try{
   const {data,error}=await window.DRESSUP_SUPABASE.rpc('studio_admin_install_feedback');
   if(ticket!==epoch||!window.DRESSUP_STUDIO_ADMIN)return;
   if(error)throw error;
   $('install-feedback-done').textContent=data.done;$('install-feedback-problems').textContent=data.problems;
   $('install-feedback-rows').replaceChildren(...data.responses.map(r=>{const row=document.createElement('tr');[new Date(r.created_at).toLocaleString('en-US',{timeZone:'America/Los_Angeles'})+' PT',r.email||r.phone||'Guest',r.outcome==='done'?'Done / do not show again':'Problem saving',r.device,r.details||'—'].forEach(value=>{const cell=document.createElement('td');cell.textContent=value;row.append(cell);});return row;}));
   $('install-feedback-data').hidden=false;$('install-feedback-status').textContent=data.responses.length?'Latest responses · refreshes when you open the Back Room.':'No responses yet.';
  }catch(e){if(ticket!==epoch)return;if(e?.code==='42501')window.dispatchEvent(new Event('studio:admin-denied'));else $('install-feedback-status').textContent='Responses could not load. Try refreshing.';}
 }
 $('install-feedback-refresh').addEventListener('click',load);window.addEventListener('studio:admin-ready',load);window.addEventListener('studio:admin-locked',clear);window.addEventListener('pagehide',clear);if(window.DRESSUP_STUDIO_ADMIN)void load();
})();
