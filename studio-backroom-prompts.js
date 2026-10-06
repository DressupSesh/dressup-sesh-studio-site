import {assemblePrompt} from './prompt-renderer.js';
const $ = id => document.getElementById(id);
let state = null, activeId = null, draftId = null, previous = 'listing', history = [], busy = false, epoch = 0, loading = 0;
const status = (text,error=false) => { $('prompt-status').textContent=text; $('prompt-status').classList.toggle('error',error); };
async function rpc(action,extra={}) {
  const ticket=epoch;
  const {data,error}=await window.DRESSUP_SUPABASE.rpc('studio_admin_prompt_hub',{p_action:action,p_payload:extra});
  if(ticket!==epoch||!window.DRESSUP_STUDIO_ADMIN)throw new Error('Owner verification required.');
  if(error){if(error.code==='42501')window.dispatchEvent(new Event('studio:admin-denied'));throw error;}
  return data;
}
function collect(kind=previous) {
  if(!state)return;
  if(kind==='listing')state.listing=$('prompt-standard').value;
  else if(kind!=='background'){state.creative=$('prompt-standard').value;state.types[kind].direction=$('prompt-direction').value;}
  state.influence={text:$('prompt-influence').value,source:$('prompt-source').value,expires:$('prompt-expires').value,strength:$('prompt-strength').value,scope:$('prompt-scope').value};
  state.variation=$('prompt-variation').value;
}
function display() {
  if(!state)return;
  const kind=$('prompt-workflow').value;
  $('prompt-standard').disabled=kind==='background'; $('prompt-direction').disabled=kind==='background'||kind==='listing';
  $('prompt-standard').value=kind==='listing'?state.listing:kind==='background'?'Recraft segmentation: no natural-language prompt.':state.creative;
  $('prompt-direction').value=state.types[kind]?.direction||'';
  for(const [field,value]of Object.entries({influence:state.influence.text,source:state.influence.source,expires:state.influence.expires,strength:state.influence.strength,scope:state.influence.scope||'both',variation:state.variation}))$('prompt-'+field).value=value||'';
  const path=kind==='listing'?'create-listing':kind==='background'?'remove-product-background':'generate-product-photo';
  $('prompt-code-link').href=`https://github.com/DressupSesh/dressup-sesh-studio/blob/main/supabase/functions/${path}/index.ts`;
  $('prompt-code-link').textContent='View private code: '+path;
  $('prompt-version').textContent=`Live version ${activeId}${draftId?` · Saved draft ${draftId}`:' · Unsaved editor changes stay out of production'}`;
  preview();
}
function preview() {
  if(!state)return;
  try{
  const resolved=assemblePrompt(state,$('prompt-workflow').value,{productCount:2,itemId:'preview-item'});
  $('prompt-assembled').textContent=resolved.text;
  $('prompt-influence-note').textContent=resolved.influence_applied?'Current sourced influence included.':'Influence off, out of scope, expired or missing text/source/expiry.';
  }catch(error){$('prompt-assembled').textContent='';$('prompt-influence-note').textContent=error.message||'Preview unavailable.';}
}
function changed(){if(busy)return;collect();draftId=null;$('prompt-publish').disabled=true;preview();$('prompt-version').textContent=`Live version ${activeId} · Unsaved editor changes`;}
async function load() {
  if(!window.DRESSUP_STUDIO_ADMIN)return;
  const ticket=++loading,session=epoch;
  status('Loading private production prompts…');
  try{
    const data=await rpc('load');if(ticket!==loading||session!==epoch)return;activeId=data.active.id;state=structuredClone(data.active.config);history=data.history;draftId=null;
    $('prompt-history').replaceChildren();for(const v of history){const option=document.createElement('option');option.value=String(v.id);option.textContent=`Version ${v.id}${v.id===activeId?' · LIVE':''} · ${new Date(v.created_at).toLocaleString()}`;$('prompt-history').append(option);}
    $('prompt-save').disabled=false;$('prompt-publish').disabled=true;$('prompt-restore').disabled=!history.length;display();status('Production prompts loaded. Save a draft, review its preview, then publish to apply it to new generations.');
  }catch(error){if(ticket===loading&&session===epoch)status(error.message||'Prompt hub could not load.',true);}
}
async function action(callback){if(busy||!state||!window.DRESSUP_STUDIO_ADMIN)return;const session=epoch;busy=true;$('prompt-save').disabled=true;$('prompt-publish').disabled=true;$('prompt-reload').disabled=true;$('prompt-restore').disabled=true;for(const id of ['workflow','standard','direction','influence','source','expires','strength','scope','variation','history'])$('prompt-'+id).disabled=true;try{await callback();}catch(error){if(session===epoch)status(error.code==='40001'?'Another version was published. Reload the hub before publishing your changes.':error.message||'The change could not be saved.',true);}finally{if(session===epoch){busy=false;$('prompt-save').disabled=!state;$('prompt-publish').disabled=!draftId;$('prompt-reload').disabled=false;$('prompt-restore').disabled=!state||!history.length;for(const id of ['workflow','standard','direction','influence','source','expires','strength','scope','variation','history'])$('prompt-'+id).disabled=false;if(state)display();}}}
$('prompt-workflow').addEventListener('change',()=>{collect(previous);previous=$('prompt-workflow').value;display();});
for(const id of ['standard','direction','influence','source','expires','strength','scope','variation'])$('prompt-'+id).addEventListener('input',changed);
$('prompt-preview').addEventListener('click',()=>{collect();preview();});
$('prompt-reload').addEventListener('click',()=>void load());
$('prompt-save').addEventListener('click',()=>void action(async()=>{collect();const data=await rpc('save',{config:state});draftId=data.id;display();status(`Draft ${draftId} saved privately. Production remains on version ${activeId}.`);}));
$('prompt-publish').addEventListener('click',()=>void action(async()=>{if(!draftId)return;const data=await rpc('publish',{version_id:draftId,expected_active_id:activeId});activeId=data.id;draftId=null;await load();status(`Version ${activeId} is live for new copy and creative generations.`);}));
$('prompt-restore').addEventListener('click',()=>void action(async()=>{const data=await rpc('version',{version_id:Number($('prompt-history').value)});state=structuredClone(data.config);draftId=null;display();status(`Version ${data.id} restored into the editor. Save a draft and publish to roll back production.`);}));
window.addEventListener('studio:admin-ready',()=>void load());
function lock(){epoch++;loading++;busy=false;state=null;activeId=null;draftId=null;history=[];for(const id of ['standard','direction','influence','source','expires'])$('prompt-'+id).value='';$('prompt-strength').value='off';$('prompt-scope').value='both';$('prompt-variation').value='natural';$('prompt-version').textContent='';$('prompt-influence-note').textContent='';$('prompt-code-link').removeAttribute('href');$('prompt-code-link').textContent='Private code requires owner verification';$('prompt-assembled').textContent='';$('prompt-history').replaceChildren();$('prompt-save').disabled=true;$('prompt-publish').disabled=true;$('prompt-restore').disabled=true;$('prompt-reload').disabled=false;for(const id of ['workflow','standard','direction','influence','source','expires','strength','scope','variation','history'])$('prompt-'+id).disabled=false;status('Owner verification required.');}
window.addEventListener('studio:admin-locked',lock);
window.addEventListener('pagehide',lock);
document.querySelector('.backroom-tabs').addEventListener('click',event=>{const button=event.target.closest('[role="tab"]');if(!button)return;for(const tab of document.querySelectorAll('.backroom-tabs [role="tab"]')){const selected=tab===button;tab.setAttribute('aria-selected',String(selected));const panel=$(tab.getAttribute('aria-controls'));if(panel)panel.hidden=!selected;}});
if(window.DRESSUP_STUDIO_ADMIN)void load();
