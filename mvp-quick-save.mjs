export function mountMvpQuickSave({isOwner,getAssets,prepareOriginal,getCopy=()=>""}) {
  const button=document.createElement('button');button.type='button';button.className='workflow-icon';button.id='mvp-quick-save';button.title='Quick Save';button.setAttribute('aria-label','Quick Save: select photos');button.innerHTML='<svg aria-hidden="true" viewBox="0 0 24 24"><path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5Z"/></svg>';button.hidden=true;
  document.querySelector('.workflow-tools')?.append(button);
  let dialog=null,version=0,urls=[];
  const close=()=>{version++;dialog?.remove();dialog=null;urls.forEach(URL.revokeObjectURL);urls=[];};
  const refresh=()=>{button.hidden=!isOwner();button.disabled=!getAssets().length;if(!isOwner())close();};
  button.onclick=async()=>{
    if(!isOwner())return;close();const ticket=version;
    const text=getCopy().trim();
    const copied=text && navigator.clipboard?.writeText ? navigator.clipboard.writeText(text).then(()=>true,()=>false) : Promise.resolve(false);
    dialog=document.createElement('dialog');dialog.setAttribute('aria-label','Choose photos to save');
    dialog.className='mvp-save-dialog';
    dialog.innerHTML='<header class="mvp-save-heading"><h2>Quick Save</h2><button data-close type="button" aria-label="Close Quick Save">×</button></header><p class="mvp-save-intro">Select photos, then choose where to save them. Edited photos start selected. Originals are optional.</p><section data-edited-section><h3>Edited &amp; creative photos</h3><div class="mvp-save-grid" data-edited></div></section><section data-original-section><h3>Original photos</h3><div class="mvp-save-grid mvp-save-originals" data-originals></div></section><footer class="mvp-save-actions"><p role="status">Preparing photo copies…</p><button data-save disabled>Save selected photos</button><a data-posh target="_blank" rel="noopener" href="https://poshmark.com/create-listing">Open Poshmark ↗</a><a class="mvp-save-web" href="https://poshmark.com/create-listing" target="_blank" rel="noopener">Poshmark website</a></footer>';
    const status=dialog.querySelector('[role=status]'),save=dialog.querySelector('[data-save]'),chosen=[];
    const mobile=/iPhone|iPad|iPod|Android/i.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
    if(mobile){const a=dialog.querySelector('[data-posh]');a.href=/Android/i.test(navigator.userAgent)?'intent://#Intent;scheme=poshmark;package=com.poshmark.app;end':'poshmark://';a.removeAttribute('target');}
    dialog.querySelector('[data-close]').onclick=close;dialog.addEventListener('cancel',e=>{e.preventDefault();close()});document.body.append(dialog);dialog.showModal();
    const copyStatus=document.createElement('p');copyStatus.setAttribute('role','status');dialog.querySelector('.mvp-save-intro').after(copyStatus);
    const copyOk=await copied;if(ticket!==version)return;
    copyStatus.textContent=copyOk?'Title + description copied.':text?'Copy failed. Use the copy button in the actions bar to retry.':'No listing copy yet. Generate it before copying.';
    let failed=0;
    for(const [i,asset] of getAssets().slice().sort((a,b)=>Number(!!a.original)-Number(!!b.original)).entries()){
      try{const file=asset.original?await prepareOriginal(asset.blob,asset.name):new File([asset.blob],asset.name,{type:asset.blob.type||'image/jpeg'});if(ticket!==version)return;
      const url=URL.createObjectURL(file);urls.push(url);const label=document.createElement('label'),check=document.createElement('input'),img=document.createElement('img');check.type='checkbox';check.checked=!asset.original;check.setAttribute('aria-label','Include '+asset.label);img.src=url;img.alt=asset.label;const caption=document.createElement('span');caption.textContent=asset.label;label.className='mvp-save-photo';label.append(check,caption,img);dialog.querySelector(asset.original?'[data-originals]':'[data-edited]').append(label);const entry={file,check};chosen.push(entry);check.onchange=update;
      }catch{failed++;}
    }
    if(ticket!==version)return;
    dialog.querySelector('[data-edited-section]').hidden=!dialog.querySelector('[data-edited]').children.length;
    dialog.querySelector('[data-original-section]').hidden=!dialog.querySelector('[data-originals]').children.length;
    function update(){const n=chosen.filter(x=>x.check.checked).length;save.disabled=!n;save.textContent=`Save selected photos (${n})`;status.textContent=failed?`${failed} photo(s) could not be prepared. Close and retry to include them.`:`${n} photos selected. On iPhone, choose Save Images in the share sheet.`;}
    update();save.onclick=async()=>{if(!isOwner())return close();const files=chosen.filter(x=>x.check.checked).map(x=>x.file);if(!files.length)return;save.disabled=true;
      try{if(navigator.share&&navigator.canShare?.({files})){await navigator.share({files,title:'Dressup Sesh listing photos'});status.textContent='Photo selection shared. Choose Save Images to keep them in Photos.';}
      else {const zip=new window.JSZip();files.forEach((f,i)=>zip.file(`${i+1}-${f.name}`,f));const blob=await zip.generateAsync({type:'blob'});if(ticket!==version)return;const url=URL.createObjectURL(blob);urls.push(url);const a=document.createElement('a');a.href=url;a.download='studio-selected-photos.zip';a.click();status.textContent='Selected photos ZIP download started.';}}
      catch(error){status.textContent=error.name==='AbortError'?'Save cancelled. Your selection is still here.':'Could not save these photos. Please try again.';}
      finally{save.disabled=false;}
    };
  };
  return {refresh,close};
}
