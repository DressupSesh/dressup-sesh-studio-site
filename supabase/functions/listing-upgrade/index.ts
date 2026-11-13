import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import {projectConfig,requireUser,corsHeaders} from '../_shared/security.ts';
import {importListing,importPhoto} from './importer.ts';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const bucket='listing-upgrade-files';
const preview='https://dressup-sesh-design-preview.jcrump18.chatgpt.site';
const errorText:Record<string,string>={MONTHLY_UPGRADE_LIMIT:'You have used your Listing Upgrades this month. See plans for more.',IMPORT_BLOCKED:'This marketplace did not provide the listing photos. Add your photos and details to continue.',ACCESS_DISABLED:'Your account access needs attention. Open your account or contact support.',UNAUTHORIZED:'Sign in to continue.',UNSUPPORTED_LINK:'Use a Poshmark, eBay, Depop, Etsy or Vinted item link.',MISSING_PHOTOS:'Add a product photo first.',DRAFT_LIMIT:'You have reached today’s draft limit. Reopen a recent draft or try tomorrow.'};
const cfg=()=>projectConfig();
async function db(path:string,init:RequestInit={}){const c=cfg();const r=await fetch(c.projectUrl+'/rest/v1/'+path,{...init,headers:{apikey:c.secretKey,Authorization:'Bearer '+c.secretKey,'Content-Type':'application/json',Prefer:'return=representation',...init.headers}});if(!r.ok){console.error('listing-upgrade database',r.status);throw new Error('SAVE_FAILED');}return r.status===204?null:r.json();}
const rpc=(name:string,body:unknown)=>db('rpc/'+name,{method:'POST',body:JSON.stringify(body)});
async function owned(id:string,user:string){if(!uuid.test(id))throw new Error('INVALID_ITEM');const rows=await db(`studio_listing_upgrades?id=eq.${id}&user_id=eq.${user}&select=*`);if(!rows[0])throw new Error('NOT_FOUND');return rows[0];}
async function asset(user:string,id:string,bytes:Uint8Array,type:string){
 const c=cfg(),key=crypto.randomUUID(),path=`${user}/${id}/${key}`;
 const r=await fetch(`${c.projectUrl}/storage/v1/object/${bucket}/${path}`,{method:'POST',headers:{apikey:c.secretKey,Authorization:'Bearer '+c.secretKey,'Content-Type':type},body:bytes.slice().buffer});
 if(!r.ok)throw new Error('SAVE_FAILED');return {id:key,path,type};
}
async function newDraft(user:string,id:string,kind:string,source:unknown){
 if(!uuid.test(id))throw new Error('INVALID_ITEM');
 const existing=await db(`studio_listing_upgrades?id=eq.${id}&user_id=eq.${user}&select=*`);if(existing[0])return existing[0];
 const recent=await db(`studio_listing_upgrades?user_id=eq.${user}&created_at=gte.${new Date(Date.now()-86400000).toISOString()}&select=id&limit=61`);if(recent.length>=60)throw new Error('DRAFT_LIMIT');
 const rows=await db('studio_listing_upgrades',{method:'POST',body:JSON.stringify({id,user_id:user,kind,source})});return rows[0];
}
Deno.serve(async request=>{
 const cors=corsHeaders(request);if(request.headers.get('origin')===preview)cors['Access-Control-Allow-Origin']=preview;
 const json=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{...cors,'Content-Type':'application/json','Cache-Control':'no-store'}});
 if(request.method==='OPTIONS')return new Response('ok',{headers:cors});
 try{
  if(!['GET','POST'].includes(request.method))return json({error:'Method not allowed'},405);
  const user=await requireUser(request),url=new URL(request.url),c=cfg();
  const access=await rpc('studio_upgrade_access',{p_user_id:user.id});
  if(!access.allowed)throw new Error(access.reason);
  if(request.method==='GET'){
   if(url.searchParams.has('job')){
    const job=url.searchParams.get('job')!;if(!uuid.test(job))throw new Error('INVALID_ITEM');
    const r=await fetch(`${c.projectUrl}/functions/v1/studio-generation-jobs?id=${job}${url.searchParams.has('result')?'&result=1':''}`,{headers:{apikey:c.publishableKey,Authorization:request.headers.get('authorization')||''}});
    return new Response(r.body,{status:r.status,headers:{...cors,'Content-Type':r.headers.get('content-type')||'application/json','Cache-Control':'no-store'}});
   }
   if(url.searchParams.has('asset')){
    const id=url.searchParams.get('id')||'',key=url.searchParams.get('asset')||'';await owned(id,user.id);if(!uuid.test(key))throw new Error('INVALID_ITEM');
    const r=await fetch(`${c.projectUrl}/storage/v1/object/${bucket}/${user.id}/${id}/${key}`,{headers:{apikey:c.secretKey,Authorization:'Bearer '+c.secretKey}});
    return new Response(r.body,{status:r.status,headers:{...cors,'Content-Type':r.headers.get('content-type')||'application/octet-stream','Cache-Control':'private, no-store'}});
   }
   if(url.searchParams.has('id')){
    const draft=await owned(url.searchParams.get('id')!,user.id);
    const jobs=await db(`studio_generation_jobs?user_id=eq.${user.id}&client_item_id=eq.${draft.id}&select=id,operation,client_photo_id,status,error,error_code&order=created_at.asc`);
    return json({draft,jobs,access});
   }
   const drafts=await db(`studio_listing_upgrades?user_id=eq.${user.id}&select=id,source,kind,updated_at,started_at&order=updated_at.desc&limit=30`);
   return json({access,drafts});
  }
  if((request.headers.get('content-type')||'').includes('multipart/form-data')){
   if(Number(request.headers.get('content-length'))>140*1024*1024)throw new Error('FILE_TOO_LARGE');
   const form=await request.formData(),action=String(form.get('action')||''),id=String(form.get('client_item_id')||'');
   const draft=await owned(id,user.id);
   if(action==='asset'){
    const file=form.get('image');if(!(file instanceof File)||!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>12*1024*1024||!file.size)throw new Error('INVALID_PHOTO');
    const result=await asset(user.id,id,new Uint8Array(await file.arrayBuffer()),file.type);
    if(form.get('original')==='1'){
     if(draft.started_at||draft.originals.length>=16)throw new Error('PHOTO_LIMIT');
     await db(`studio_listing_upgrades?id=eq.${id}&user_id=eq.${user.id}`,{method:'PATCH',body:JSON.stringify({originals:[...draft.originals,result],updated_at:new Date().toISOString()})});
    }
    return json(result);
   }
   if(action!=='job')throw new Error('INVALID_ACTION');
   // Only server-owned draft IDs can receive bundle pricing. Existing job service checks owner and operation.
   const started=await rpc('studio_upgrade_access',{p_user_id:user.id,p_id:id,p_start:true});if(!started.allowed)throw new Error(started.reason);
   form.delete('action');
   const r=await fetch(c.projectUrl+'/functions/v1/studio-generation-jobs',{method:'POST',headers:{apikey:c.publishableKey,Authorization:request.headers.get('authorization')||''},body:form});
   return new Response(r.body,{status:r.status,headers:{...cors,'Content-Type':'application/json','Cache-Control':'no-store'}});
  }
  const body=await request.json();if(JSON.stringify(body).length>70000)throw new Error('FILE_TOO_LARGE');
  if(body.action==='trial'){
   await db(`studio_profiles?id=eq.${user.id}&trial_activated_at=is.null`,{method:'PATCH',body:JSON.stringify({trial_activated_at:new Date().toISOString()})});return json({activated:true});
  }
  if(body.action==='create'){
   return json({draft:await newDraft(user.id,String(body.id),body.kind==='free_copy'?'free_copy':'upgrade',body.source||{})});
  }
  if(body.action==='import'){
   const draft=await newDraft(user.id,String(body.id),'upgrade',{});
   if(draft.originals.length)return json({draft});
   const listing=await importListing(String(body.url));const originals=[];let failed=0;
   for(let i=0;i<listing.photos.length;i+=3){const chunk=await Promise.all(listing.photos.slice(i,i+3).map(async photoURL=>{try{const p=await importPhoto(photoURL);return await asset(user.id,draft.id,p.bytes,p.type);}catch{failed++;return null;}}));originals.push(...chunk.filter(Boolean));}
   if(!originals.length)throw new Error('IMPORT_BLOCKED');
   const source={...listing,photos:undefined,missingPhotos:failed};
   const rows=await db(`studio_listing_upgrades?id=eq.${draft.id}&user_id=eq.${user.id}`,{method:'PATCH',body:JSON.stringify({source,originals,updated_at:new Date().toISOString()})});return json({draft:rows[0],missingPhotos:failed});
  }
  if(body.action==='save'){
   await owned(String(body.id),user.id);
   await db(`studio_listing_upgrades?id=eq.${body.id}&user_id=eq.${user.id}`,{method:'PATCH',body:JSON.stringify({output:body.output||{},updated_at:new Date().toISOString()})});return json({saved:true});
  }
  return json({error:'Invalid action'},400);
 }catch(error){const code=error instanceof Error?error.message:'UNKNOWN';console.error('listing-upgrade',code);return json({error:errorText[code]||'Could not complete this step. Your saved work is kept; try again or contact support.',code},code==='UNAUTHORIZED'?401:code==='NOT_FOUND'?404:code.includes('LIMIT')?429:400);}
});

