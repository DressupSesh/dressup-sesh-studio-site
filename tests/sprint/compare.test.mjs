import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {parseHTML} from 'linkedom';import {mountUpgrade} from '../../listing-upgrade/embedded.mjs';
const base=new URL('../../',import.meta.url);
async function setup({saved=false, userAgent="iPhone", touchPoints=0, share, copy, output, jobs=[], failResult, failAsset}={}){
 const {window,document}=parseHTML('<html><body><studio-upgrade></studio-upgrade></body></html>');
 Object.assign(globalThis,{window,document,location:new URL('https://fixture.invalid/studio.html'+(saved?'?draft=qa':'')),history:{replaceState(){}},matchMedia:()=>({matches:true}),Image:function(){const img=document.createElement('img');img.decode=async()=>{};img.naturalWidth=800;img.naturalHeight=800;return img;}});
 window.HTMLElement.prototype.scrollIntoView=function(){};window.HTMLElement.prototype.showModal=function(){this.open=true;};window.HTMLElement.prototype.close=function(){this.open=false;};
 const calls=[],shared=[],copied=[];Object.defineProperty(globalThis,'navigator',{configurable:true,value:{userAgent,maxTouchPoints:touchPoints,clipboard:{writeText:copy|| (async t=>copied.push(t))},canShare:()=>true,share:share|| (async v=>shared.push(v))}});
 window.DRESSUP_CONFIG={supabaseUrl:'https://api.fixture.invalid',supabasePublishableKey:'test'};
 const jpg=fs.readFileSync(new URL('assets/jacket-before.jpeg',base));const draft={id:'qa',kind:'upgrade',source:{title:'Original title',description:'Original description'},originals:[{id:'photo-a'},{id:'photo-b'}],output:saved?{values:{title:'Saved new title',description:'Saved new description'},jobs:{listing_copy:{id:'old-copy',status:'succeeded',applied:true},creative_image:{id:'old-ghost',status:'succeeded',applied:true}},photos:[{id:'bg',asset:'clean',kind:'Background removed',selected:true},{id:'ghost',job:'old-ghost',kind:'Ghost mannequin · AI styling',selected:true}]}:{}};
 if(output)draft.output=output;
 const operations=new Map();globalThis.fetch=async(url,opts={})=>{const address=String(url);calls.push({address,opts});if(address.startsWith('/listing-upgrade/workspace.html'))return new Response(fs.readFileSync(new URL('listing-upgrade/workspace.html',base)));if(address.startsWith('data:'))return new Response(jpg,{headers:{'content-type':'image/jpeg'}});const parsed=new URL(address);if(opts.body instanceof FormData){const op=opts.body.get('operation');if(op){operations.set(opts.body.get('job_id'),op);return Response.json({ok:true});}return Response.json({id:'asset'});}if(opts.body){const b=JSON.parse(opts.body);if(b.action==='import')return Response.json({draft,missingPhotos:2});return Response.json({saved:true});}if(parsed.searchParams.has('asset')&&failAsset?.(parsed.searchParams.get('asset')))return Response.json({error:'Asset unavailable'},{status:503});if(parsed.searchParams.has('asset'))return new Response(jpg,{headers:{'content-type':'image/jpeg'}});if(parsed.searchParams.has('job')){if(!parsed.searchParams.has('result'))return Response.json({job:{status:'succeeded'}});if(failResult?.(parsed.searchParams.get('job')))return Response.json({error:'Result unavailable'},{status:503});return Response.json((parsed.searchParams.get('job')==='old-copy'||operations.get(parsed.searchParams.get('job'))==='listing_copy')?{listing:'New title\nNew description'}:{image:jpg.toString('base64'),mimeType:'image/jpeg'});}if(parsed.searchParams.has('id'))return Response.json({draft,jobs});return Response.json({access:{tier:'owner',allowed:true},drafts:[{id:'qa',kind:'upgrade',source:{title:'Draft'}}]});};
 const lifetime=new AbortController();const host=document.querySelector('studio-upgrade');await mountUpgrade(host,{client:{auth:{getSession:async()=>({data:{session:{user:{id:'owner'},access_token:'fixture'}}})}},onAccess(){},openAuth(){},signal:lifetime.signal});return {root:host.shadowRoot,window,lifetime,calls,operations,shared,copied};
}
async function until(fn){for(let i=0;i<80;i++){if(fn())return;await new Promise(r=>setTimeout(r,5));}assert.ok(fn(),'condition completed');}
test('import creates one ghost image and copy using multiple references; saves only the new photo and combined text',async()=>{
 const {root:r,window:w,lifetime,calls,operations,shared,copied}=await setup();try{
 assert.equal(r.querySelector('#sample'),null);assert.equal(r.querySelectorAll('.listing-column').length,2);
 r.querySelector('#listing-url').value='https://poshmark.com/listing/test';r.querySelector('#import-form').dispatchEvent(new w.Event('submit',{cancelable:true}));
 await until(()=>r.querySelector('#result-note').textContent.includes('upgrade is ready'));
 assert.deepEqual([...operations.values()].sort(),['creative_image','listing_copy']);
 const ghost=calls.find(c=>c.opts.body instanceof FormData&&c.opts.body.get('operation')==='creative_image');assert.equal(ghost.opts.body.getAll('images').length,2);
 assert.equal(r.querySelectorAll('#original-photos img').length,1);assert.equal(r.querySelectorAll('#photo-grid img').length,1);
 assert.equal(r.querySelector('#original-title').textContent,'Original title');assert.equal(r.querySelector('#title').value,'New title');
 const review=r.querySelector('#reviewed');review.checked=true;review.dispatchEvent(new w.Event('change'));await until(()=>!r.querySelector('#quick-post').disabled);
 r.querySelector('#quick-post').click();await until(()=>shared.length===1);assert.equal(shared[0].files.length,1);assert.equal(copied[0],'New title\n\nNew description');
 r.querySelector('#description').value='Edited';r.querySelector('#description').dispatchEvent(new w.Event('input'));assert.equal(r.querySelector('#quick-post').disabled,true);assert.equal(review.checked,false);
 }finally{lifetime.abort();}
});
test('existing draft preserves original and copy while hiding legacy background photos from Quick Save',async()=>{
 const {root:r,window:w,lifetime,shared,copied}=await setup({saved:true});try{
 assert.equal(r.querySelectorAll('#photo-grid img').length,1);assert.equal(r.querySelector('#title').value,'Saved new title');
 const review=r.querySelector('#reviewed');review.checked=true;review.dispatchEvent(new w.Event('change'));await until(()=>!r.querySelector('#quick-post').disabled);r.querySelector('#quick-post').click();await until(()=>shared.length===1);
 assert.equal(shared[0].files.length,1);assert.equal(copied[0],'Saved new title\n\nSaved new description');
 }finally{lifetime.abort();}
});

async function review(fixture){const checkbox=fixture.root.querySelector('#reviewed');checkbox.checked=true;checkbox.dispatchEvent(new fixture.window.Event('change'));await until(()=>!fixture.root.querySelector('#quick-post').disabled);}
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
test('one click starts both actions immediately; check acknowledges request, duplicate taps do not share again',async()=>{
 const copying=deferred(),sharing=deferred();let copies=0,shares=0;
 const f=await setup({saved:true,copy:()=>{copies++;return copying.promise;},share:()=>{shares++;return sharing.promise;}});const r=f.root;
 try{await review(f);r.querySelector('#quick-post').click();assert.equal(copies,1);assert.equal(shares,1);assert.equal(r.querySelector('#save-listing').disabled,true);
 r.querySelector('#save-listing').click();assert.equal(shares,1);copying.resolve();await until(()=>r.querySelector('#save-listing').textContent.includes('✓'));
 assert.match(r.querySelector('#post-status').textContent,/Choose Save Image/);assert.equal(r.querySelector('#post-links').closest('details'),null);assert.equal(r.querySelector('#post-links').children.length,5);
 sharing.resolve();await until(()=>!r.querySelector('#quick-post').disabled);r.querySelector('#post-dialog').close();r.querySelector('#quick-post').click();assert.equal(shares,1);assert.equal(copies,1);
 assert.match(r.querySelector('#post-status').textContent,/Photo exported/);
 }finally{f.lifetime.abort();}
});
test('cancelled share clears checkmark, retains copied text and retries from the same combined button',async()=>{
 let shares=0;const f=await setup({saved:true,share:()=>++shares===1?Promise.reject(new DOMException('Cancelled','AbortError')):Promise.resolve()});const r=f.root;
 try{await review(f);r.querySelector('#quick-post').click();await until(()=>r.querySelector('#save-listing').textContent==='Try Quick Save again');assert.match(r.querySelector('#post-status').textContent,/copied.*cancelled/i);assert.doesNotMatch(r.querySelector('#quick-post').textContent,/✓/);assert.equal(r.querySelector('#save-help').open,false);
 r.querySelector('#save-listing').click();await until(()=>r.querySelector('#save-listing').textContent.includes('✓'));assert.equal(shares,2);assert.equal(f.copied.length,2);
 }finally{f.lifetime.abort();}
});
test('blocked clipboard does not show success or resave an already handed-off photo on retry',async()=>{
 let copies=0;const f=await setup({saved:true,copy:()=>++copies===1?Promise.reject(new Error('Blocked')):Promise.resolve()});const r=f.root;
 try{await review(f);r.querySelector('#quick-post').click();await until(()=>r.querySelector('#save-listing').textContent==='Try Quick Save again');assert.equal(f.shared.length,1);assert.match(r.querySelector('#post-status').textContent,/Text was not copied/);assert.equal(r.querySelector('#copy-fallback').value,'Saved new title\n\nSaved new description');
 r.querySelector('#save-listing').click();await until(()=>r.querySelector('#save-listing').textContent.includes('✓'));assert.equal(f.shared.length,1);assert.equal(copies,2);
 }finally{f.lifetime.abort();}
});
test('desktop downloads only the final photo while copying combined text',async()=>{
 const f=await setup({saved:true,userAgent:'Macintosh Safari'});const r=f.root;let downloads=0,downloadName;
 try{r.querySelector('#individual-photos').addEventListener('click',event=>{if(event.target.tagName==='A'){downloads++;downloadName=event.target.download;}});await review(f);r.querySelector('#quick-post').click();await until(()=>r.querySelector('#save-listing').textContent.includes('✓'));assert.equal(downloads,1);assert.equal(decodeURIComponent(downloadName),'Photo 1.jpg');assert.equal(f.shared.length,0);assert.equal(f.copied.length,1);assert.match(r.querySelector('#post-status').textContent,/Photo download started/);
 }finally{f.lifetime.abort();}
});
test('iPad desktop user agent uses the native share sheet',async()=>{
 const f=await setup({saved:true,userAgent:'Macintosh Safari',touchPoints:5});try{await review(f);f.root.querySelector('#quick-post').click();await until(()=>f.shared.length===1);}finally{f.lifetime.abort();}
});
test('synchronous share failure offers a retry and keeps text-copy outcome',async()=>{
 const f=await setup({saved:true,share:()=>{throw new Error('Unavailable');}});try{await review(f);f.root.querySelector('#quick-post').click();await until(()=>f.root.querySelector('#save-listing').textContent==='Try Quick Save again');assert.match(f.root.querySelector('#post-status').textContent,/copied.*could not start/);}finally{f.lifetime.abort();}
});
test('editing while a request is pending invalidates success callbacks and clears stale save controls',async()=>{
 const sharing=deferred(),copying=deferred();const f=await setup({saved:true,share:()=>sharing.promise,copy:()=>copying.promise});const r=f.root;
 try{await review(f);r.querySelector('#quick-post').click();r.querySelector('#title').value='Edited title';r.querySelector('#title').dispatchEvent(new f.window.Event('input'));assert.equal(r.querySelector('#post-dialog').open,false);sharing.resolve();copying.resolve();await new Promise(resolve=>setTimeout(resolve,0));assert.equal(r.querySelector('#quick-post').disabled,true);assert.doesNotMatch(r.querySelector('#quick-post').textContent,/✓/);assert.equal(r.querySelector('#copy-fallback').value,'');assert.equal(r.querySelector('#individual-photos').children.length,0);
 }finally{f.lifetime.abort();}
});
test('sign-out during a save cannot report a late success',async()=>{
 const sharing=deferred();const f=await setup({saved:true,share:()=>sharing.promise});try{await review(f);f.root.querySelector('#quick-post').click();f.lifetime.abort();const status=f.root.querySelector('#post-status').textContent;sharing.resolve();await new Promise(resolve=>setTimeout(resolve,0));assert.equal(f.root.querySelector('#post-status').textContent,status);}finally{f.lifetime.abort();}
});
const completedJobs=()=>({listing_copy:{id:'old-copy',status:'succeeded',applied:true},creative_image:{id:'old-ghost',status:'succeeded',applied:true}});
const saves=f=>f.calls.filter(c=>typeof c.opts.body==='string').map(c=>JSON.parse(c.opts.body)).filter(b=>b.action==='save');
test('blank completed draft restores both saved results without new generation or blank saves',async()=>{
 const f=await setup({saved:true,output:{values:{title:'',description:''},jobs:completedJobs(),photos:[{id:'photo-a',asset:'photo-a',kind:'Original · optional for export',selected:false}]}});
 try{assert.equal(f.root.querySelector('#title').value,'New title');assert.equal(f.root.querySelector('#description').value,'New description');assert.equal(f.root.querySelectorAll('#photo-grid img').length,1);assert.equal(f.operations.size,0);assert.ok(saves(f).length>0);for(const saved of saves(f)){assert.equal(saved.output.values.title,'New title');assert.ok(saved.output.photos.some(p=>p.job==='old-ghost'));}await review(f);f.root.querySelector('#quick-post').click();await until(()=>f.shared.length===1);await until(()=>f.root.querySelector('#save-listing').textContent==='✓');assert.ok(f.root.querySelector('#save-listing').getAttribute('aria-label'));}
 finally{f.lifetime.abort();}
});
test('server job history recovers lost draft job pointers without regenerating',async()=>{
 const f=await setup({saved:true,output:{values:{},jobs:{},photos:[]},jobs:[{id:'old-copy',operation:'listing_copy',status:'succeeded'},{id:'old-ghost',operation:'creative_image',status:'succeeded'}]});
 try{assert.equal(f.root.querySelector('#title').value,'New title');assert.equal(f.root.querySelectorAll('#photo-grid img').length,1);assert.equal(f.operations.size,0);assert.equal(saves(f).at(-1).output.jobs.listing_copy.id,'old-copy');}finally{f.lifetime.abort();}
});
test('recovery fills missing copy without overwriting an edited title',async()=>{
 const f=await setup({saved:true,output:{values:{title:'My edited title',description:''},jobs:completedJobs(),photos:[]}});
 try{assert.equal(f.root.querySelector('#title').value,'My edited title');assert.equal(f.root.querySelector('#description').value,'New description');assert.equal(f.operations.size,0);}finally{f.lifetime.abort();}
});
test('edited ghost photo reloads as a binary asset instead of a JSON generation result',async()=>{
 const f=await setup({saved:true,output:{values:{title:'Edited title',description:'Edited description'},jobs:completedJobs(),photos:[{id:'edited',asset:'crop-asset',job:null,kind:'Ghost mannequin · AI styling',selected:true}]}});
 try{assert.equal(f.root.querySelectorAll('#photo-grid img').length,1);assert.equal(f.operations.size,0);assert.equal(saves(f).length,0);assert.ok(!f.calls.some(c=>c.address.includes('job=old-ghost')));await review(f);f.root.querySelector('#quick-post').click();await until(()=>f.shared.length===1);}finally{f.lifetime.abort();}
});
test('Resume retries a failed completed-result download instead of skipping or generating again',async()=>{
 let copyReads=0;const f=await setup({saved:true,output:{values:{title:'',description:''},jobs:completedJobs(),photos:[]},failResult:id=>id==='old-copy'&&++copyReads===1});
 try{assert.equal(f.root.querySelector('#title').value,'');assert.match(f.root.querySelector('#copy-state').textContent,/Resume/);f.root.querySelector('#resume-workflows').click();await until(()=>f.root.querySelector('#result-note').textContent.includes('upgrade is ready'));assert.equal(f.root.querySelector('#title').value,'New title');assert.equal(copyReads,2);assert.equal(f.operations.size,0);}finally{f.lifetime.abort();}
});
test('unavailable edited asset keeps its reference during Resume and never falls back to an older image',async()=>{
 const ref={id:'edited',asset:'crop-asset',kind:'Ghost mannequin · AI styling',selected:true};const f=await setup({saved:true,output:{values:{title:'Edited title',description:'Edited description'},jobs:completedJobs(),photos:[ref]},failAsset:id=>id==='crop-asset'});
 try{assert.equal(f.root.querySelectorAll('#photo-grid img').length,0);assert.equal(saves(f).length,0);f.root.querySelector('#resume-workflows').click();await until(()=>f.root.querySelector('#result-note').textContent.includes('Some results need attention'));assert.equal(f.operations.size,0);assert.ok(!f.calls.some(c=>c.address.includes('job=old-ghost')));assert.ok(saves(f).at(-1).output.photos.some(p=>p.asset==='crop-asset'));assert.equal(saves(f).at(-1).output.values.title,'Edited title');}finally{f.lifetime.abort();}
});
test('Resume restores an edited asset after a temporary download error',async()=>{
 let reads=0;const f=await setup({saved:true,output:{values:{title:'Edited title',description:'Edited description'},jobs:completedJobs(),photos:[{id:'edited',asset:'crop-asset',kind:'Ghost mannequin · AI styling',selected:true}]},failAsset:id=>id==='crop-asset'&&++reads===1});
 try{assert.equal(f.root.querySelectorAll('#photo-grid img').length,0);f.root.querySelector('#resume-workflows').click();await until(()=>f.root.querySelector('#result-note').textContent.includes('upgrade is ready'));assert.equal(f.root.querySelectorAll('#photo-grid img').length,1);assert.equal(f.operations.size,0);assert.equal(saves(f).at(-1).output.photos.filter(p=>p.asset==='crop-asset').length,1);}finally{f.lifetime.abort();}
});
test('failed original-photo load cannot save an empty draft when reopening it',async()=>{
 const f=await setup({saved:true,failAsset:id=>id==='photo-a'});
 try{assert.equal(saves(f).length,0);f.root.querySelector('#draft-list button').click();await until(()=>f.calls.filter(c=>c.address.includes('asset=photo-a')).length===2);assert.equal(saves(f).length,0);assert.equal(f.operations.size,0);}finally{f.lifetime.abort();}
});

for (const [ua,expected] of [['iPhone','poshmark://'],['Android','intent://#Intent;scheme=poshmark;package=com.poshmark.app;end'],['Desktop','https://poshmark.com/create-listing']]) {
 test('Poshmark destination for '+ua,async()=>{const {root,lifetime}=await setup({userAgent:ua});try{const link=root.querySelector('#post-links a');assert.equal(link.getAttribute('href'),expected);assert.equal(link.getAttribute('target'),ua==='Desktop'?'_blank':null);}finally{lifetime.abort();}});
}
