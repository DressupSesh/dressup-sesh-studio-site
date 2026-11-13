export function mountMvpQuickSave({isOwner,getAssets,prepareOriginal}) {
  const button=document.createElement('button');button.type='button';button.textContent='Quick Save · owner preview';button.hidden=true;
  document.querySelector('.page-save-actions')?.prepend(button);
  let dialog=null,version=0,urls=[];
  const close=()=>{version++;dialog?.remove();dialog=null;urls.forEach(URL.revokeObjectURL);urls=[];};
  const refresh=()=>{button.hidden=!isOwner();button.disabled=!getAssets().length;if(!isOwner())close();};
  button.onclick=async()=>{
    if(!isOwner())return;close();const ticket=version;dialog=document.createElement('dialog');dialog.setAttribute('aria-label','Choose photos to save');
    dialog.innerHTML='<h2>Quick Save</h2><p>All photos are selected. Uncheck any you don’t want.</p><div class="mvp-save-grid"></div><p role="status">Preparing photo copies…</p><button data-save disabled>Save selected photos</button> <a data-posh target="_blank" rel="noopener" href="https://poshmark.com/create-listing">Open Poshmark ↗</a><p><a href="https://poshmark.com/create-listing" target="_blank" rel="noopener">Poshmark website</a></p><button data-close>Back to Studio</button>';
    dialog.style.cssText='width:min(900px,94vw);max-height:90vh;overflow:auto;padding:24px;border:1px solid #bbb;background:#f7f5ef;color:#222';
    const grid=dialog.querySelector('.mvp-save-grid');grid.style.cssText='display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px';
    const status=dialog.querySelector('[role=status]'),save=dialog.querySelector('[data-save]'),chosen=[];
    const mobile=/iPhone|iPad|iPod|Android/i.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
    if(mobile){const a=dialog.querySelector('[data-posh]');a.href=/Android/i.test(navigator.userAgent)?'intent://#Intent;scheme=poshmark;package=com.poshmark.app;end':'poshmark://';a.removeAttribute('target');}
    dialog.querySelector('[data-close]').onclick=close;dialog.addEventListener('cancel',e=>{e.preventDefault();close()});document.body.append(dialog);dialog.showModal();
    let failed=0;
    for(const [i,asset] of getAssets().entries()){
      try{const file=asset.original?await prepareOriginal(asset.blob,asset.name):new File([asset.blob],asset.name,{type:asset.blob.type||'image/jpeg'});if(ticket!==version)return;
      const url=URL.createObjectURL(file);urls.push(url);const label=document.createElement('label'),check=document.createElement('input'),img=document.createElement('img');check.type='checkbox';check.checked=true;check.setAttribute('aria-label','Include '+asset.label);img.src=url;img.alt=asset.label;img.style.cssText='display:block;width:100%;height:190px;object-fit:contain;background:white';label.append(check,document.createTextNode(' '+asset.label),img);grid.append(label);const entry={file,check};chosen.push(entry);check.onchange=update;
      }catch{failed++;}
    }
    if(ticket!==version)return;
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
