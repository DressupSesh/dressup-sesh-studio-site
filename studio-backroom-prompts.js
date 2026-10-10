import {assemblePrompt} from './prompt-renderer.js';
const $ = id => document.getElementById(id);
let state = null, activeId = null, draftId = null, previous = 'listing', history = [], busy = false, epoch = 0, loading = 0;
let testInputUrls = [], testImageUrl = null, testItemId = null;
const creativeWorkflows = new Set(['on_body','ghost','influencer','editorial']);
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
  testControls();
}
function preview() {
  if(!state)return;
  try{
  const resolved=assemblePrompt(state,$('prompt-workflow').value,{productCount:2,itemId:'preview-item'});
  $('prompt-assembled').textContent=resolved.text;
  $('prompt-influence-note').textContent=resolved.influence_applied?'Current sourced influence included.':'Influence not included. Choose Subtle or Strong, set a review date and apply it to this workflow to test your influence.';
  }catch(error){$('prompt-assembled').textContent='';$('prompt-influence-note').textContent=error.message||'Preview unavailable.';}
}
function changed(){if(busy)return;collect();draftId=null;$('prompt-publish').disabled=true;preview();testControls();$('prompt-version').textContent=`Live version ${activeId} · Unsaved editor changes`;}
async function load() {
  if(!window.DRESSUP_STUDIO_ADMIN)return;
  const ticket=++loading,session=epoch;
  status('Loading private production prompts…');
  try{
    const data=await rpc('load');if(ticket!==loading||session!==epoch)return;activeId=data.active.id;state=structuredClone(data.active.config);history=data.history;draftId=null;previous=$('prompt-workflow').value;
    $('prompt-history').replaceChildren();for(const v of history){const option=document.createElement('option');option.value=String(v.id);option.textContent=`Version ${v.id}${v.id===activeId?' · LIVE':''} · ${new Date(v.created_at).toLocaleString()}`;$('prompt-history').append(option);}
    $('prompt-save').disabled=false;$('prompt-latest').disabled=!history.some(v=>v.id>activeId);$('prompt-publish').disabled=true;$('prompt-restore').disabled=!history.length;display();status('Production prompts loaded. Save a draft, review its preview, then publish to apply it to new generations.');
  }catch(error){if(ticket===loading&&session===epoch)status(error.message||'Prompt hub could not load.',true);}
}
async function action(callback){if(busy||!state||!window.DRESSUP_STUDIO_ADMIN)return;const session=epoch;busy=true;testControls();$('prompt-latest').disabled=true;$('prompt-save').disabled=true;$('prompt-publish').disabled=true;$('prompt-reload').disabled=true;$('prompt-restore').disabled=true;for(const id of ['workflow','standard','direction','influence','source','expires','strength','scope','variation','history'])$('prompt-'+id).disabled=true;try{await callback();}catch(error){if(session===epoch)status(error.code==='40001'?'Another version was published. Reload the hub before publishing your changes.':error.message||'The change could not be saved.',true);}finally{if(session===epoch){busy=false;$('prompt-latest').disabled=!history.some(v=>v.id>activeId);$('prompt-save').disabled=!state;$('prompt-publish').disabled=!draftId;$('prompt-reload').disabled=false;$('prompt-restore').disabled=!state||!history.length;for(const id of ['workflow','standard','direction','influence','source','expires','strength','scope','variation','history'])$('prompt-'+id).disabled=false;if(state)display();}}}
$('prompt-workflow').addEventListener('change',()=>{collect(previous);previous=$('prompt-workflow').value;display();});
for(const id of ['standard','direction','influence','source','expires','strength','scope','variation'])$('prompt-'+id).addEventListener('input',changed);
$('prompt-preview').addEventListener('click',()=>{collect();preview();});
$('prompt-latest').addEventListener('click',()=>void action(async()=>{const latest=history.find(v=>v.id>activeId);if(!latest)return;const data=await rpc('version',{version_id:latest.id});state=structuredClone(data.config);draftId=data.id;previous=$('prompt-workflow').value;display();status(`Saved draft ${data.id} loaded. Production remains on version ${activeId}.`);}));
$('prompt-reload').addEventListener('click',()=>void load());
$('prompt-save').addEventListener('click',()=>void action(async()=>{collect();const data=await rpc('save',{config:state});draftId=data.id;rememberDraft(data.id);display();status(`Draft ${draftId} saved privately. Production remains on version ${activeId}.`);}));
$('prompt-publish').addEventListener('click',()=>void action(async()=>{if(!draftId)return;const data=await rpc('publish',{version_id:draftId,expected_active_id:activeId});activeId=data.id;draftId=null;await load();status(`Version ${activeId} is live for new copy and creative generations.`);}));
$('prompt-restore').addEventListener('click',()=>void action(async()=>{const data=await rpc('version',{version_id:Number($('prompt-history').value)});state=structuredClone(data.config);draftId=null;display();status(`Version ${data.id} restored into the editor. Save a draft and publish to roll back production.`);}));

function rememberDraft(id){history=[{id,created_at:new Date().toISOString()},...history.filter(v=>v.id!==id)];const option=document.createElement('option');option.value=String(id);option.textContent=`Version ${id} · Saved draft`;$('prompt-history').append(option);}
function testStatus(text,error=false){$('prompt-test-status').textContent=text;$('prompt-test-status').classList.toggle('error',error);}
function testControls(){
  const enabled=Boolean(state&&window.DRESSUP_STUDIO_ADMIN&&!busy);
  for(const id of ['photos','reference','instructions'])$('prompt-test-'+id).disabled=!enabled;
  $('prompt-test-generate').disabled=!enabled||!creativeWorkflows.has($('prompt-workflow').value)||!$('prompt-test-photos').files?.length||$('prompt-test-photos').files.length>6;
}
function clearTestResult(){
  if(testImageUrl)URL.revokeObjectURL(testImageUrl);testImageUrl=null;
  $('prompt-test-image').removeAttribute('src');$('prompt-test-download').removeAttribute('href');
  $('prompt-test-result').hidden=true;$('prompt-test-details').hidden=true;$('prompt-test-used-prompt').textContent='';$('prompt-test-result-note').textContent='';
}
function clearTest(){
  clearTestResult();for(const url of testInputUrls)URL.revokeObjectURL(url);testInputUrls=[];testItemId=null;
  $('prompt-test-inputs').replaceChildren();for(const id of ['photos','reference','instructions'])$('prompt-test-'+id).value='';
  testStatus('Choose a creative workflow and add a garment photo.');
}
function photosChanged(){
  clearTestResult();for(const url of testInputUrls)URL.revokeObjectURL(url);testInputUrls=[];testItemId=null;$('prompt-test-inputs').replaceChildren();
  const photos=Array.from($('prompt-test-photos').files||[]);
  if(photos.length>6){testStatus('Choose up to six garment photos.',true);testControls();$('prompt-test-generate').disabled=true;return;}
  for(const photo of photos){
    const figure=document.createElement('figure'),img=document.createElement('img'),caption=document.createElement('figcaption');
    const url=URL.createObjectURL(photo);testInputUrls.push(url);img.src=url;img.alt='Garment reference';caption.textContent=photo.name;figure.append(img,caption);$('prompt-test-inputs').append(figure);
  }
  testStatus(photos.length?'Ready to test. Choose a creative workflow, then generate one image.':'Choose a creative workflow and add a garment photo.');testControls();
}
async function generateTest(){
  const ticket=epoch;
  await action(async()=>{
    try{
      const kind=$('prompt-workflow').value,photos=Array.from($('prompt-test-photos').files||[]),reference=$('prompt-test-reference').files?.[0];
      if(!creativeWorkflows.has(kind))throw new Error('Choose On body, Ghost mannequin, Influencer or Editorial to test an image.');
      if(!photos.length||photos.length>6)throw new Error('Choose between one and six garment photos.');
      if([...photos,...(reference?[reference]:[])].some(file=>!/^image\/(jpeg|png|webp)$/i.test(file.type)||file.size===0||file.size>12*1024*1024))throw new Error('Use JPG, PNG or WEBP photos no larger than 12 MB each.');
      collect();if(!draftId){testStatus('Saving your private draft…');const saved=await rpc('save',{config:state});draftId=saved.id;rememberDraft(saved.id);}
      if(ticket!==epoch||!window.DRESSUP_STUDIO_ADMIN)return;
      testItemId ||= crypto.randomUUID();const body=new FormData();body.append('client_item_id',testItemId);body.append('type',kind);body.append('preview_version_id',String(draftId));body.append('product_count',String(photos.length));
      for(const photo of photos)body.append('images',photo);if(reference)body.append('reference',reference);body.append('instructions',$('prompt-test-instructions').value.trim());
      testStatus(`Generating one private image with draft ${draftId}… Keep this page open.`);
      const {data,error}=await window.DRESSUP_SUPABASE.functions.invoke('generate-product-photo',{body});
      if(ticket!==epoch||!window.DRESSUP_STUDIO_ADMIN)return;
      if(error){const details=await error.context?.json().catch(()=>null);if(details?.code==='FORBIDDEN'||details?.code==='UNAUTHORIZED')window.dispatchEvent(new Event('studio:admin-denied'));throw new Error(details?.error||error.message||'The image could not be generated.');}
      if(!data?.image||data?.mimeType!=='image/jpeg'||data?.preview?.version_id!==draftId)throw new Error('The test did not return a valid draft image.');
      const bytes=Uint8Array.from(atob(data.image),character=>character.charCodeAt(0));
      if(ticket!==epoch||!window.DRESSUP_STUDIO_ADMIN)return;clearTestResult();testImageUrl=URL.createObjectURL(new Blob([bytes],{type:'image/jpeg'}));
      $('prompt-test-image').src=testImageUrl;$('prompt-test-download').href=testImageUrl;$('prompt-test-download').download=`studio-draft-${draftId}-${kind}.jpg`;
      const info=data.preview,cost=info.estimated_cost_micros==null?'Cost estimate unavailable':`Recorded cost estimate $${(info.estimated_cost_micros/1000000).toFixed(4)}`;
      $('prompt-test-result-note').textContent=`Draft ${draftId} · ${state.types[kind].label} · Influence ${info.influence_applied?'included':'not included'} · ${cost}`;
      $('prompt-test-used-prompt').textContent=info.prompt;$('prompt-test-details').hidden=false;$('prompt-test-result').hidden=false;
      testStatus(`Draft ${draftId} tested privately. Live version ${activeId} is unchanged.`);status(`Draft ${draftId} saved privately and tested. Publish only when you are ready.`);
    }catch(error){if(ticket===epoch&&window.DRESSUP_STUDIO_ADMIN)testStatus(error.message||'The test could not be completed.',true);throw error;}
  });
}
$('prompt-test-photos').addEventListener('change',photosChanged);
$('prompt-test-reference').addEventListener('change',()=>testControls());
$('prompt-test-generate').addEventListener('click',()=>void generateTest());

window.addEventListener('studio:admin-ready',()=>void load());
function lock(){clearTest();$('prompt-latest').disabled=true;epoch++;loading++;busy=false;state=null;activeId=null;draftId=null;history=[];for(const id of ['standard','direction','influence','source','expires'])$('prompt-'+id).value='';$('prompt-strength').value='off';$('prompt-scope').value='both';$('prompt-variation').value='natural';$('prompt-version').textContent='';$('prompt-influence-note').textContent='';$('prompt-code-link').removeAttribute('href');$('prompt-code-link').textContent='Private code requires owner verification';$('prompt-assembled').textContent='';$('prompt-history').replaceChildren();$('prompt-save').disabled=true;$('prompt-publish').disabled=true;$('prompt-restore').disabled=true;$('prompt-reload').disabled=false;for(const id of ['workflow','standard','direction','influence','source','expires','strength','scope','variation','history'])$('prompt-'+id).disabled=false;testControls();status('Owner verification required.');}
window.addEventListener('studio:admin-locked',lock);
window.addEventListener('pagehide',lock);
document.querySelector('.backroom-tabs').addEventListener('click',event=>{const button=event.target.closest('[role="tab"]');if(!button)return;for(const tab of document.querySelectorAll('.backroom-tabs [role="tab"]')){const selected=tab===button;tab.setAttribute('aria-selected',String(selected));const panel=$(tab.getAttribute('aria-controls'));if(panel)panel.hidden=!selected;}});
if(window.DRESSUP_STUDIO_ADMIN)void load();
