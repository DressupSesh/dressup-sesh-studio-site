(function(root){
  'use strict';
  const fields=['sku','title','description','brand','size','color','department','category','quantity','price','cost','location','notes'];
  function parseCSV(text){
    const rows=[];let row=[],cell='',quoted=false;
    text=text.replace(/^\uFEFF/,'');
    for(let i=0;i<text.length;i++){
      const c=text[i];
      if(c==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}
      else if(c===','&&!quoted){row.push(cell);cell='';}
      else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(cell);rows.push(row);row=[];cell='';}
      else cell+=c;
    }
    if(quoted)throw Error('The CSV has an unclosed quoted cell.');
    if(cell||row.length){row.push(cell);rows.push(row);}
    return rows.filter(r=>r.some(c=>c.trim()));
  }
  function csv(rows,safe=true){return '\uFEFF'+rows.map(row=>row.map(value=>{
    let s=String(value??'');if(safe&&/^[\s]*[=+@-]/.test(s))s="'"+s;
    return '"'+s.replace(/"/g,'""')+'"';
  }).join(',')).join('\r\n')+'\r\n';}
  function active(p){return fields.some(k=>k!=='sku'&&k!=='quantity'&&String(p[k]??'').trim())||p.photoNames?.length>0;}
  function draft(p){
    const title=[p.brand,p.color,p.title,p.size?'Size '+p.size:''].filter(Boolean).join(' ').replace(/\s+/g,' ').trim().slice(0,80);
    return {title,description:[p.brand&&'Brand: '+p.brand,p.size&&'Tag size: '+p.size,p.color&&'Color: '+p.color,p.notes].filter(Boolean).join('\n')};
  }
  function issues(p,all){
    const errors=[];
    for(const k of ['sku','department','category','size'])if(!String(p[k]??'').trim())errors.push(k+' is missing');
    if(!/^\d+$/.test(String(p.quantity))||Number(p.quantity)<1)errors.push('quantity must be a positive whole number');
    if(all.filter(x=>String(x.sku).trim().toUpperCase()===String(p.sku).trim().toUpperCase()).length>1)errors.push('duplicate SKU in this catalog');
    if(!p.reviewed)errors.push('seller review is required');
    if(p.title.length>80)errors.push('title exceeds 80 characters');
    return errors;
  }
  const api={fields,parseCSV,csv,active,draft,issues};
  root.BatchCore=api;if(typeof module!=='undefined')module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);

(() => {
  'use strict';
  const C=window.BatchCore,$=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
  const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const blobURLs=[];
  function download(name,data,type='text/csv;charset=utf-8'){
    const url=URL.createObjectURL(new Blob([data],{type})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1500);
  }
  function photoURL(f){const u=URL.createObjectURL(f);blobURLs.push(u);return u;}
  window.addEventListener('pagehide',()=>blobURLs.forEach(u=>URL.revokeObjectURL(u)));
  const free=$('#free-form');
  if(free){
    $('#free-photo').addEventListener('change',e=>{const f=e.target.files[0];if(!f)return;if(f.size>15*1024*1024){alert('Please use a photo under 15 MB.');return;}const im=$('#free-photo-preview');im.src=photoURL(f);im.hidden=false;});
    free.addEventListener('submit',e=>{e.preventDefault();const f=new FormData(free);const d=C.draft({brand:f.get('brand').trim(),title:f.get('item').trim(),size:f.get('size').trim(),color:f.get('color').trim(),notes:f.get('notes').trim()});$('#free-title').value=d.title;$('#free-description').value=d.description;$('#free-result').hidden=false;$('#free-status').textContent='Built only from your typed facts. Photo analysis and AI generation are not connected in this preview.';});
    $('#copy-free').addEventListener('click',async()=>{try{await navigator.clipboard.writeText($('#free-title').value+'\n\n'+$('#free-description').value);$('#free-status').textContent='Copied. Review the details before posting.';}catch{$('#free-status').textContent='Select the editable text and copy it manually.';}});
    return;
  }
  if(!$('#piece-grid'))return;
  const KEY='dressup-owner-pro-v1:'+ownerId;
  const sessionPhotos=new Map(),selected=new Set();
  const uid=()=>Array.from(crypto.getRandomValues(new Uint8Array(16)),n=>n.toString(16).padStart(2,'0')).join('');
  let nextSku=1;
  const makePiece=()=>Object.fromEntries([['id',uid()],...C.fields.map(k=>[k,k==='quantity'?'1':k==='sku'?String(nextSku++).padStart(4,'0'):'']),['reviewed',false],['photoNames',[]],['referenceNames',[]]]);
  const fresh=()=>({batch:1,pieces:Array.from({length:10},makePiece),archive:[]});
  let state;
  try{const s=JSON.parse(localStorage.getItem(KEY));state=s&&Array.isArray(s.pieces)&&s.pieces.length>=10&&s.pieces.every(p=>p.id&&typeof p.title==='string')&&Array.isArray(s.archive)?s:fresh();}catch{state=fresh();}
  nextSku=Math.max(0,...[...state.archive,...state.pieces].map(p=>/^\d{1,9}$/.test(p.sku)?Number(p.sku):0),state.nextSku||0)+1;
  // Replace only unused slots created by the original random SKU generator.
  for(const piece of state.pieces){
    if(/^DS-[0-9A-Z]{5}-[0-9A-F]{8}$/.test(piece.sku) && !C.active(piece) && !piece.reviewed && !piece.referenceNames?.length){
      piece.sku=String(nextSku++).padStart(4,'0');
    }
  }
  let focusId=state.pieces[0].id;
  function save(){try{state.nextSku=nextSku-1;localStorage.setItem(KEY,JSON.stringify(state));$('#saved-status').textContent='Text saved on this device · photos are session only';}catch{$('#saved-status').textContent='Device storage unavailable. Download a catalog backup before leaving.';}}
  const allPieces=()=>[...state.archive,...state.pieces.filter(C.active)];
  function field(p,key,label,options={}){const type=options.type||'text';return `<label>${label}<input data-field="${key}" type="${type}" value="${esc(p[key])}" ${options.max?'maxlength="'+options.max+'"':''} ${type==='number'?'min="0" step="'+(key==='quantity'?'1':'0.01')+'"':''}></label>`;}
  function render(){
    $('#piece-grid').innerHTML=state.pieces.map(p=>{
      const ph=sessionPhotos.get(p.id)||{products:[],refs:[]};
      return `<article class="piece-card ${p.reviewed?'piece-reviewed':''}" data-id="${p.id}"><div class="piece-head"><h2>${esc(p.title||'New piece')}</h2><label class="inline-label"><input type="checkbox" data-select ${selected.has(p.id)?'checked':''}> Select</label></div><div class="piece-top"><label class="piece-photo">${ph.products.length?`<img src="${esc(ph.products[0].url)}" alt="Original item photo"><span>${ph.products.length} photo${ph.products.length===1?'':'s'} · replace</span>`:'<span aria-hidden="true">＋</span><span>Add item photos</span>'}<input class="visually-hidden" type="file" data-photos="products" accept="image/jpeg,image/png,image/webp" multiple></label><div class="quick-fields">${field(p,'title','Item / working title',{max:80})}${field(p,'brand','Brand')}${field(p,'size','Size')}${field(p,'price','Listing price ($)',{type:'number'})}</div></div>${p.photoNames.length&&!ph.products.length?'<p class="field-note">Photo previews expired. Reattach photos for this session.</p>':''}<div class="piece-actions"><button class="small-btn" data-run="clean">Clean photo</button><button class="small-btn" data-run="copy">Write copy</button><button class="small-btn" data-run="style">Style piece</button></div><p class="piece-status" role="status">${p.reviewed?'Reviewed by you':'Draft · review the facts before export'}</p><details><summary>Copy & reference photos</summary><label>Reference type<select data-ref-kind><option>Brand tag</option><option>Composition tag</option><option>Measurements</option><option>Condition / flaw</option><option>Other details</option></select></label><label>Reference photos<input type="file" data-photos="refs" accept="image/jpeg,image/png,image/webp" multiple></label><div class="ref-strip">${ph.refs.map(f=>`<img src="${esc(f.url)}" alt="${esc(f.kind)} reference">`).join('')}</div><p>References guide the copy. They are excluded from product photo exports.</p>${field(p,'color','Color')}<label>Condition, measurements and notes<textarea data-field="notes" rows="3">${esc(p.notes)}</textarea></label><label>Description<textarea data-field="description" rows="5">${esc(p.description)}</textarea></label><button class="small-btn" data-template>Build draft from typed facts</button><p class="field-note">Template only. No photo analysis or AI in this preview.</p></details><details><summary>Catalog & Poshmark fields</summary><div class="quick-fields">${field(p,'sku','Unique SKU')}${field(p,'department','Department (official value)')}${field(p,'category','Category (official value)')}${field(p,'quantity','Quantity',{type:'number'})}${field(p,'cost','Purchase cost ($)',{type:'number'})}${field(p,'location','Storage location')}</div><p>Copy department, category and size exactly from the current template’s Taxonomy tab. Do not guess original retail price.</p></details><label class="inline-label"><input type="checkbox" data-reviewed ${p.reviewed?'checked':''}> I reviewed this piece’s details</label></article>`;
    }).join('');
    layoutDesk();updateCount();renderCatalog();save();
  }
  function layoutDesk(){
    const grid=$('#piece-grid');
    grid.querySelectorAll('.piece-card').forEach((card,i)=>{
      const p=state.pieces[i],photo=card.querySelector('.piece-photo');
      const sku=card.querySelector('[data-field="sku"]').parentElement;
      sku.firstChild.textContent='SKU ';card.prepend(sku);sku.className='sku';
      if(Number.isInteger(p.sample)&&!sessionPhotos.get(p.id)?.products.length){
        photo.querySelectorAll('span').forEach(x=>x.remove());
        const im=new Image();im.src='piece-'+p.sample+'.png';im.alt=p.title;photo.prepend(im);
      }
      card.classList.toggle('vacant',!C.active(p));
      card.classList.toggle('current',p.id===focusId);
      const fields=card.querySelector('.quick-fields');card.append(fields);
      fields.prepend(fields.querySelector('[data-field="brand"]').parentElement);
      fields.querySelector('[data-field="price"]').parentElement.hidden=true;
      fields.querySelector('[data-field="size"]').placeholder='Add size';
      const controls=document.createElement('div');controls.className='desk-tools';
      const setup = [
        ['clean','Remove','background',['Standard','Keep edits']],
        ['copy','Copy',null,null],
        ['style','Creative','creative',['Ghost mannequin','On-body','Editorial']]
      ];
      for(const [key,label,setting,options] of setup){
        const row=document.createElement('div');
        row.className='tool-row';
        row.innerHTML='<label><input type="checkbox"> '+label+'</label><button type="button" aria-expanded="false">⌄</button>';
        const check=row.querySelector('input'), arrow=row.querySelector('button');
        check.checked=!!p[key];
        check.onchange=()=>{p[key]=check.checked;save()};
        arrow.setAttribute('aria-label',label+' options for '+p.sku);
        let panel;
        if(setting){
          panel=document.createElement('select');
          panel.setAttribute('aria-label',label+' setting');
          options.forEach(value=>panel.add(new Option(value,value)));
          panel.value=p[setting]||options[0];
          panel.onchange=()=>{p[setting]=panel.value;save()};
        }else{
          panel=card.querySelector('details');
          panel.open=true;
          panel.querySelector('summary').hidden=true;
        }
        panel.id='options-'+p.id+'-'+key;
        panel.hidden=true;
        arrow.setAttribute('aria-controls',panel.id);
        arrow.onclick=()=>{panel.hidden=!panel.hidden;arrow.setAttribute('aria-expanded',String(!panel.hidden))};
        controls.append(row,panel);
      }
      card.querySelector('.piece-top').append(controls);
      const listingFields=card.querySelector(':scope > details');
      listingFields.classList.add('listing-fields');
      listingFields.querySelector('summary').textContent='Listing details';
      card.onclick=()=>{focusId=p.id;grid.querySelectorAll('.current').forEach(c=>c.classList.remove('current'));card.classList.add('current');showReview(p)};
    });
    state.pieces.forEach(paintProgress);
    showReview(state.pieces.find(p=>p.id===focusId)||state.pieces[0]);
  }
  function showReview(p){
    const drawer=$('#review-piece');
    drawer.innerHTML='<strong>REVIEW ITEM — SKU '+esc(p.sku)+'</strong><label>Title<input id="edit-title"></label><label>Description<textarea id="edit-description"></textarea></label><button id="save-piece">Save changes</button>';
    $('#edit-title').value=p.title;$('#edit-description').value=p.description;
    for(const field of ['title','description'])$('#edit-'+field).oninput=e=>{p[field]=e.target.value;p.reviewed=false;save()};
    $('#save-piece').onclick=()=>{p.title=$('#edit-title').value;p.description=$('#edit-description').value;p.reviewed=true;render()};
  }

  const pending=[], scheduled=new Set(), results=new Map();
  let workers=0;
  function paintProgress(p){
    const card=$('[data-id="'+p.id+'"]');if(!card)return;
    let box=card.querySelector('.job-progress');
    if(!box){box=document.createElement('div');box.className='job-progress';card.append(box)}
    const list=Object.values(p.progress||{}), done=list.filter(j=>j.state==='done').length;
    box.replaceChildren();
    if(!list.length)return;
    const text=document.createElement('p');text.textContent=done===list.length?'● Ready to review':done+' / '+list.length+' complete';
    text.style.color=done===list.length?'#28743b':'inherit';box.append(text);
    const bar=document.createElement('progress');bar.max=list.length;bar.value=done;box.append(bar);
    for(const [slot,item] of Object.entries(p.progress)){
      const line=document.createElement('p');line.textContent=item.message;box.append(line);
      const output=results.get(p.id+slot);if(output)line.append(output);
    }
    card.querySelectorAll('[data-photos]').forEach(input=>input.disabled=list.some(x=>x.state==='running'||x.state==='queued'));
  }
  async function runLive(){
    try{await ownerSession()}catch(e){alert(e.message);return}
    for(const p of state.pieces.filter(C.active)){
      const ph=sessionPhotos.get(p.id)||{products:[],refs:[]};
      for(const key of ['clean','copy','style'].filter(k=>p[k])){
        const slots=key==='clean'?Array.from({length:Math.max(1,p.photoNames.length)},(_,i)=>i):[0];
        for(const i of slots){
          const slot=key+':'+i, token=p.id+slot;
          if(scheduled.has(token)||p.jobs?.[slot]?.complete&& (key==='copy'||results.has(token)))continue;
          scheduled.add(token);p.progress||={};p.progress[slot]={state:'queued',message:key+' · queued'};
          pending.push({p,ph,key,i,slot,token});paintProgress(p);
        }
      }
    }
    save();pump();
  }
  function pump(){
    while(workers<3&&pending.length){
      workers++;
      const task=pending.shift();
      processTask(task).finally(()=>{workers--;scheduled.delete(task.token);pump()});
    }
  }
  async function processTask({p,ph,key,i,slot,token}){
    const label=({clean:'Remove '+(i+1),copy:'Copy',style:'Creative'})[key];
    p.progress[slot]={state:'running',message:label+' · preparing'};
    const line={
      set textContent(value){p.progress[slot].message=value;paintProgress(p)},
      append(node){results.set(token,node);paintProgress(p)}
    };
    try{
          p.jobs ||= {};
          const slot=key+':'+i;
          let job=p.jobs[slot];
          if(!job){
            if(!ph.products.length)throw Error('Attach the product photos first.');
            const form=new FormData();
            p.itemUuid ||= crypto.randomUUID();
            form.set('client_item_id',p.itemUuid);
            const operation={clean:'background_remove',copy:'listing_copy',style:'creative_image'}[key];
            form.set('operation',operation);
            if(key==='clean'){
              if(!ph.products[i]?.file)throw Error('Reattach this photo.');
              form.set('client_photo_id',crypto.randomUUID());
              const image=await prepareBackgroundImage(ph.products[i].file);
              form.set('image',image,image.name||'product.jpg');
            }else{
              const refs=key==='copy'?ph.refs.slice(0,3):[];
              const products=ph.products.slice(0,key==='copy'?8-refs.length:6);
              if(key==='copy'){
                form.set('reference_count',String(refs.length));
                form.set('additional_info',[p.brand,p.title,p.size,p.notes,...refs.map(r=>r.kind)].filter(Boolean).join('\n'));
              }else{
                form.set('product_count',String(products.length));
                form.set('type',({'On-body':'on_body','Editorial':'editorial'})[p.creative]||'ghost');
              }
              for(const [n,photo] of [...refs,...products].entries()){
                form.append('images',await prepareListingImage(photo.file),(n<refs.length?'reference':'product')+'-'+n+'.jpg');
              }
            }
            job=p.jobs[slot]={id:crypto.randomUUID(),titleBefore:p.title,descriptionBefore:p.description};form.set('job_id',job.id);
            localStorage.setItem(KEY,JSON.stringify(state));
            try{await jobRequest('',{method:'POST',body:form})}
            catch(e){if([400,401,403,413,422,429].includes(e.status)){delete p.jobs[slot];save()}throw e}
          }
          line.textContent=label+' — checking job';
          let status;
          for(let n=0;n<160;n++){
            const reply=await jobRequest('?id='+job.id);
            status=(await reply.json()).job;
            if(status.status==='succeeded')break;
            if(status.status==='failed'){
              if(status.error_code!=='STATUS_UNKNOWN'){delete p.jobs[slot];save()}
              throw Error(status.error||'Generation failed.');
            }
            await new Promise(resolve=>setTimeout(resolve,2500));
          }
          if(status?.status!=='succeeded')throw Error('Still processing. Run again to check this same job.');
          const result=await jobRequest('?id='+job.id+'&result=1');
          if(key==='copy'){
            const data=await result.json();
            if(!data.listing?.trim())throw Error('Empty listing result.');
            if(!job.applied){
              const priorTitle=p.title,priorDescription=p.description;
              const lines=data.listing.trim().replace(/\*+/g,'').split(/\r?\n/);
              p.title=lines.shift().replace(/^title:\s*/i,'').trim().slice(0,80);
              p.description=lines.join('\n').trim().replace(/^description:\s*/i,'');
              for(const field of ['brand','size']){
                const match=p.description.match(new RegExp('^'+field+':\\s*(.+)$','im'));
                if(!p[field]&&match)p[field]=match[1].trim();
              }
              if(job.titleBefore!==undefined&&priorTitle!==job.titleBefore)p.title=priorTitle;
              if(job.descriptionBefore!==undefined&&priorDescription!==job.descriptionBefore)p.description=priorDescription;
              job.applied=true;p.reviewed=false;
            }
            line.textContent=label+' — ready to review';
          }else{
            let blob;
            if(key==='clean')blob=await result.blob();
            else{const data=await result.json();if(!data.image)throw Error('Missing creative output.');blob=new Blob([Uint8Array.from(atob(data.image),c=>c.charCodeAt(0))],{type:data.mimeType||'image/jpeg'});}
            const a=document.createElement('a');a.href=photoURL(blob);a.download=p.sku+'-'+key+'-'+(i+1)+(blob.type.includes('png')?'.png':'.jpg');a.textContent='Download image';
            line.textContent=label+' — ';line.append(a);
          }
          p.jobs[slot].complete=true; save();

      p.progress[slot].state='done';
      const card=$('[data-id="'+p.id+'"]');
      if(card)for(const field of ['title','brand','size']){
        const input=card.querySelector('[data-field="'+field+'"]');
        if(input && document.activeElement!==input)input.value=p[field];
      }
      if(focusId===p.id && !$('#review-piece').contains(document.activeElement))showReview(p);
    }catch(e){p.progress[slot]={state:'error',message:label+' · '+e.message}}
    finally{paintProgress(p);save();renderCatalog()}
  }
  $('#run-desk').onclick=runLive;
  $('#export-desk').onclick=()=>{const p=state.pieces.find(p=>p.id===focusId);if(p&&C.active(p)){p.title=$('#edit-title').value;p.description=$('#edit-description').value}save();$('[data-view="export"]').click()};
  function updateCount(){const a=state.pieces.filter(C.active);$('#batch-count').textContent=`${a.length}/10 pieces · ${selected.size} selected · batch ${state.batch}`;$('#select-all').checked=a.length>0&&a.every(p=>selected.has(p.id));}
  function renderCatalog(){
    const a=allPieces();$('#catalog-table tbody').innerHTML=a.length?a.map(p=>`<tr><td>${esc(p.sku)}</td><td>${esc(p.title||'Untitled')} ${state.archive.some(x=>x.id===p.id)?`<button class="small-btn" data-restore="${p.id}">Edit piece</button>`:''}</td><td>${esc([p.brand,p.size].filter(Boolean).join(' / '))}</td><td>${p.price?esc('$'+p.price):'—'}</td><td>${esc(p.location||'—')}</td><td>${p.reviewed?'Reviewed':'Needs review'}</td><td>${p.batch||state.batch}</td></tr>`).join(''):'<tr><td colspan="7">Add a piece or load samples to start your catalog.</td></tr>';
  }
  $('#piece-grid').addEventListener('input',e=>{
    const card=e.target.closest('[data-id]');if(!card)return;const p=state.pieces.find(x=>x.id===card.dataset.id);
    if(e.target.dataset.field){p[e.target.dataset.field]=e.target.value;p.reviewed=false;card.classList.remove('piece-reviewed');card.querySelector('[data-reviewed]').checked=false;card.querySelector('.piece-status').textContent='Changed · review this piece again';if(e.target.dataset.field==='title'){card.querySelector('h2').textContent=p.title||'New piece';if(focusId===p.id)$('#edit-title').value=p.title;}save();updateCount();renderCatalog();}
  });
  $('#piece-grid').addEventListener('change',e=>{
    const card=e.target.closest('[data-id]');if(!card)return;const p=state.pieces.find(x=>x.id===card.dataset.id);
    if(e.target.hasAttribute('data-select')){e.target.checked?selected.add(p.id):selected.delete(p.id);updateCount();}
    if(e.target.hasAttribute('data-reviewed')){p.reviewed=e.target.checked;card.classList.toggle('piece-reviewed',p.reviewed);card.querySelector('.piece-status').textContent=p.reviewed?'Reviewed by you':'Draft · review before export';save();renderCatalog();}
    if(e.target.dataset.photos){
      const key=e.target.dataset.photos,files=[...e.target.files];
      if(files.length>(key==='refs'?3:20)||files.some(f=>f.size>15*1024*1024||!/^image\/(jpeg|png|webp)$/.test(f.type))){alert('Use JPG, PNG or WebP files under 15 MB each. Maximum: 20 product photos or 3 reference photos.');return;}
      const ph=sessionPhotos.get(p.id)||{products:[],refs:[]};
      const kind=card.querySelector('[data-ref-kind]').value;
      if(p.jobs && Object.keys(p.jobs).length){
        if(!confirm('Replacing photos starts a new generation set for the affected tools. Download any previous images first.'))return;
        if(key==='products')p.jobs={};else delete p.jobs['copy:0'];
      }
      ph[key]=files.map(f=>({name:f.name,url:photoURL(f),kind,file:f}));sessionPhotos.set(p.id,ph);
      p[key==='products'?'photoNames':'referenceNames']=files.map(f=>f.name);p.reviewed=false;selected.add(p.id);render();
    }
  });
  $('#piece-grid').addEventListener('click',e=>{
    const card=e.target.closest('[data-id]');if(!card)return;const p=state.pieces.find(x=>x.id===card.dataset.id);
    if(e.target.dataset.run)queue(e.target.dataset.run,[p]);
    if(e.target.hasAttribute('data-template')){const d=C.draft(p);if(!d.title){alert('Add an item type or working title first.');return;}p.description=d.description;p.reviewed=false;render();const c=$(`[data-id="${p.id}"]`);c.querySelector('details').open=true;c.querySelector('.piece-status').textContent='Template drafted from typed facts. Review before using.';}
  });
  function queue(action,pieces){
    const names={clean:'Clean photos',copy:'Write listing copy',style:'Style pieces'};
    $('#queue-title').textContent=names[action];
    $('#queue-content').innerHTML=pieces.length?'<ul>'+pieces.map(p=>{
      const ph=sessionPhotos.get(p.id);let message;
      if(action!=='copy'&&!ph?.products.length)message='Attach product photos first.';
      else if(action==='copy'&&!ph?.products.length&&!p.notes&&!p.title)message='Add a photo or item facts first.';
      else message='Ready to queue when the real workflow is connected.';
      return `<li><strong>${esc(p.title||p.sku)}</strong><p>${message}</p></li>`;
    }).join('')+'</ul>':'<p>Select at least one piece to preview the batch.</p>';
    $('#queue-dialog').showModal();
  }
  $('#queue-close').addEventListener('click',()=>$('#queue-dialog').close());
  $$('[data-batch]').forEach(b=>b.addEventListener('click',()=>queue(b.dataset.batch,state.pieces.filter(p=>selected.has(p.id)))));
  $('#select-all').addEventListener('change',e=>{selected.clear();if(e.target.checked)state.pieces.filter(C.active).forEach(p=>selected.add(p.id));render();});
  $$('[data-view]').forEach(b=>b.addEventListener('click',()=>{$$('[data-view]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));for(const name of ['pieces','catalog','export'])$('#'+name+'-view').hidden=name!==b.dataset.view;renderCatalog();}));
  $('#load-samples').addEventListener('click',()=>{
    const blanks=state.pieces.filter(p=>!C.active(p));if(blanks.length<2){alert('Two blank slots are needed. Archive this batch first if it is full.');return;}
    for(const [i,sample] of [{title:'Black jacket · sample',notes:'Example item. Verify brand, fabric, size and condition from the actual item.',file:'jacket-before.jpeg'},{title:'Dress · sample',notes:'Example item. Add tag details and actual condition before posting.',file:'demo-dress-before.jpg'}].entries()){
      const p=blanks[i];Object.assign(p,{title:sample.title,notes:sample.notes,photoNames:[sample.file]});sessionPhotos.set(p.id,{products:[{name:sample.file,url:'/assets/'+sample.file}],refs:[]});selected.add(p.id);
    }render();
  });
  $('#new-batch').addEventListener('click',()=>{
    if(scheduled.size){alert('Finish the current jobs before archiving. You can add more SKU slots now.');return;}
    const active=state.pieces.filter(C.active);if(!active.length){alert('Add a piece before starting another batch.');return;}
    state.archive.push(...active.map(p=>({...p,batch:state.batch})));state.batch++;state.pieces=Array.from({length:10},makePiece);selected.clear();render();
  });
  $('#catalog-table').addEventListener('click',e=>{
    if(!e.target.dataset.restore)return;const blank=state.pieces.findIndex(p=>!C.active(p));
    if(blank<0){alert('Archive the current batch to make space for editing this piece.');return;}
    const i=state.archive.findIndex(p=>p.id===e.target.dataset.restore);if(i<0)return;
    state.pieces[blank]=state.archive.splice(i,1)[0];render();$('[data-view="pieces"]').click();
  });
  $('#export-catalog').addEventListener('click',()=>{
    const a=allPieces();if(!a.length){alert('Add at least one piece first.');return;}
    download('Studio-Inventory-Catalog.csv',C.csv([['SKU','Title','Description','Brand','Size','Color','Department','Category','Quantity','Listing Price','Purchase Cost','Storage Location','Condition / Notes','Seller Reviewed','Batch','Product Filenames','Reference Filenames'],...a.map(p=>[...C.fields.map(k=>p[k]),p.reviewed?'Yes':'No',p.batch||state.batch,(p.photoNames||[]).join('; '),(p.referenceNames||[]).join('; ')])]));
  });
  $('#backup-json').addEventListener('click',()=>download('Studio-Text-Catalog-Backup.json',JSON.stringify(state,null,2),'application/json'));
  const format=$('#export-format'),inputs=$('#export-inputs'),status=$('#export-status'),files=$('#export-files');
  const batch=()=>state.pieces.filter(C.active);
  const help={
    zip:'Review your items, then prepare the export. The first attached product photo is the cover. Studio converts product photos to JPEG and names them by SKU. To use a cleaned or creative image, download it and attach it as a product photo first. Download both files, choose Photos on Your Computer in Poshmark, and upload the CSV and ZIP together. Reference photos stay out of the ZIP.',
    url:'Paste direct public image links for each SKU, one per line, cover first. Leave the links blank to add photos later in your Poshmark drafts. Download the CSV, choose Photos in an Online Cloud in Poshmark, and upload the CSV alone.',
    edits:'For existing closet SKUs only. Enter only the values you intend to change. Quantity 0 marks an item sold out. Price 0 marks it not for sale. Changing price can clear existing Smart Sell settings. Choose Quick Edits in Poshmark and upload the CSV alone.',
    catalog:'Download your current and archived inventory for your own records.'
  };
  function showExport(){
    $('#photo-help').textContent=help[format.value];status.textContent='';files.replaceChildren();inputs.replaceChildren();
    for(const p of batch()){
      if(!['url','edits'].includes(format.value))continue;
      const row=document.createElement('fieldset');const legend=document.createElement('legend');legend.textContent=p.sku;row.append(legend);
      for(const [k,label] of format.value==='url'?[['urls','Public image URLs']]:[['qty','New quantity'],['price','New listing price'],['shipping','Shipping discount']]){
        const wrapper=document.createElement('label'),input=document.createElement(k==='urls'?'textarea':'input');wrapper.textContent=label+' ';input.value=p.posh?.[k]||'';input.oninput=()=>{p.posh||={};p.posh[k]=input.value.trim();save();files.replaceChildren()};wrapper.append(input);row.append(wrapper);
      }
      inputs.append(row);
    }
  }
  format.onchange=showExport;
  $('[data-view="export"]').addEventListener('click',showExport);
  function fileLink(name,blob){
    const a=document.createElement('a');a.href=photoURL(blob);a.download=name;a.textContent='Download '+name;files.append(a,document.createElement('br'));
  }
  $('#make-export').onclick=async e=>{
    const mode=format.value;
    files.replaceChildren();status.textContent='';if(mode==='catalog'){ $('#export-catalog').click();return }
    const headers=POSH_HEADERS[mode],rows=[],zip=mode==='zip'?new JSZip():null;
    e.target.disabled=true;format.disabled=true;
    try{
      for(const p of batch()){
        const changes=p.posh||{};
        if(mode==='edits'&&!(changes.qty||changes.price||changes.shipping))continue;
        if(!/^[A-Za-z0-9_-]{4,500}$/.test(p.sku))throw Error(p.sku+' · Use a unique SKU of at least four letters, digits, dashes or underscores for this export.');
        if(allPieces().filter(x=>x.sku.toUpperCase()===p.sku.toUpperCase()).length>1)throw Error('Duplicate SKU '+p.sku);
        let values={sku:p.sku};
        if(mode==='edits'){
          if(changes.qty&&!/^\d+$/.test(changes.qty)||changes.price&&!/^\d+(\.\d{1,2})?$/.test(changes.price))throw Error(p.sku+' · Check quantity and price.');
          Object.assign(values,{quantity:changes.qty,'listing price':changes.price,'shipping discount':changes.shipping});
        }else{
          const issues=C.issues(p,allPieces());if(issues.length)throw Error(p.sku+' · '+issues.join(', '));
          Object.assign(values,{title:p.title,description:p.description,brand:p.brand,department:p.department,category:p.category,quantity:p.quantity,size:p.size,'listing price':p.price,color1:p.color,availability:'Draft'});
          if(mode==='zip'){
            const images=sessionPhotos.get(p.id)?.products||[];
            if(!images.length||images.length>16)throw Error(p.sku+' · Attach 1–16 product photos in this tab.');
            for(const [i,photo] of images.entries()){
              if(!photo.file)throw Error(p.sku+' · Reattach product photos.');
              zip.file(p.sku+'-'+(i||'CS')+'.jpg',await (await prepareListingImage(photo.file)).arrayBuffer());
            }
          }else{
            const urls=(changes.urls||'').split(/\s+/).filter(Boolean);
            if(urls.length>16||urls.some(u=>!/^https?:\/\/[^\s]+$/i.test(u)))throw Error(p.sku+' · Supply up to 16 public image URLs.');
            urls.forEach((url,i)=>values[i?'alt image '+i:'primary image']=url);
          }
        }
        const row=headers[0].map(k=>values[k.trim().toLowerCase()]??'');
        if(row.some(v=>/^\s*[=@+-]/.test(v)))throw Error(p.sku+' · Check fields starting with a spreadsheet formula character.');
        rows.push(row);
      }
      if(!rows.length)throw Error(mode==='edits'?'Enter a change for an existing SKU first.':'Add an item first.');
      const photoZip=zip&&await zip.generateAsync({type:'blob'});
      fileLink('Poshmark-'+mode+'-batch-'+state.batch+'.csv',new Blob([C.csv([...headers,...rows],false)],{type:'text/csv'}));
      if(photoZip)fileLink('Poshmark-photos-'+state.batch+'.zip',photoZip);
      status.textContent=rows.length+' SKU(s) prepared. Match the template type in Poshmark and review before uploading.';
    }catch(err){status.textContent=err.message}finally{e.target.disabled=false;format.disabled=false}
  };
  showExport();

  const dock=document.createElement('div');dock.className='pro-dock';
  dock.innerHTML='<button type="button" id="add-skus">+ 10 SKUs</button><button type="button" id="run-floating">Run selected</button>';
  document.body.append(dock);
  $('#add-skus').onclick=()=>{state.pieces.push(...Array.from({length:10},makePiece));render()};
  $('#run-floating').onclick=runLive;
  render();
  for(const p of state.pieces){
    p.progress={};
    for(const [slot,job] of Object.entries(p.jobs||{})){
      const [key,index]=slot.split(':'),token=p.id+slot;
      if(job.complete&&key==='copy'){p.progress[slot]={state:'done',message:'Copy · ready to review'};continue}
      p.progress[slot]={state:'queued',message:key+' · recovering'};
      scheduled.add(token);pending.push({p,ph:{products:[],refs:[]},key,i:Number(index),slot,token});
    }
    paintProgress(p);
  }
  pump();
})();
