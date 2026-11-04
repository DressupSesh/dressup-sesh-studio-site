const ownerClient = window.supabase.createClient(DRESSUP_CONFIG.supabaseUrl,DRESSUP_CONFIG.supabasePublishableKey);
let ownerId;
async function ownerSession(){
  const {data:{session}}=await ownerClient.auth.getSession();
  if(!session || (ownerId && session.user.id!==ownerId))throw Error('Sign in to Studio with your owner account.');
  const role=await ownerClient.rpc('is_backroom_owner_role');
  if(role.error || role.data!==true)throw Error('Batch Pro is available to the Studio owner account.');
  return session;
}
async function startOwnerDesk(){
  const session=await ownerSession();
  ownerId=session.user.id;
  ownerClient.auth.onAuthStateChange((event,current)=>{
    if(!current || current.user.id!==ownerId)location.replace('/studio.html');
  });
  const script=document.createElement('script');script.src='desk.js?v=compact-studio-cards-1';
  script.onload=()=>{document.querySelector('#main').hidden=false;document.querySelector('#gate').hidden=true;};
  document.body.append(script);
}
startOwnerDesk().catch(e=>{document.querySelector('#gate span').textContent=e.message;});
async function jobRequest(query,options={}){
  const {data:{session}}=await ownerClient.auth.getSession();
  if(!session||session.user.id!==ownerId)throw Error('Owner session expired.');
  const res=await fetch(DRESSUP_CONFIG.supabaseUrl+'/functions/v1/studio-generation-jobs'+query,{
    ...options,cache:'no-store',headers:{apikey:DRESSUP_CONFIG.supabasePublishableKey,Authorization:'Bearer '+session.access_token}
  });
  if(!res.ok){const msg=await res.json().catch(()=>({}));throw Object.assign(Error(msg.error||'Job request failed ('+res.status+')'),{status:res.status});}
  return res;
}
function canvasToJpeg(canvas, quality){
  return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(Error('Photo encoding failed.')),'image/jpeg',quality));
}
async function prepareBackgroundImage(source) {
  let image = null;
  let objectUrl = "";
  let maxDimension = 2400;
  let quality = 0.94;
  let blob = null;

  try {
    if (typeof window.createImageBitmap === "function") {
      try {
        // Apply phone-camera EXIF orientation before the pixels leave the
        // browser. Canvas re-encoding below then strips the orientation tag.
        image = await window.createImageBitmap(source, { imageOrientation: "from-image" });
      } catch {
        // Older Safari/WebViews may not support the imageOrientation option.
        // HTMLImageElement decoding provides the safest available fallback.
      }
    }

    if (!image) {
      objectUrl = URL.createObjectURL(source);
      const fallbackImage = new Image();
      fallbackImage.decoding = "async";
      fallbackImage.src = objectUrl;
      await fallbackImage.decode();
      image = fallbackImage;
    }

    const sourceWidth = image.width || image.naturalWidth;
    const sourceHeight = image.height || image.naturalHeight;
    if (!sourceWidth || !sourceHeight) throw new Error("Could not read this photo.");

    for (let attempt = 0; attempt < 6; attempt += 1) {
      const scale = Math.min(1, maxDimension / Math.max(sourceWidth, sourceHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(sourceWidth * scale));
      canvas.height = Math.max(1, Math.round(sourceHeight * scale));
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Could not prepare this photo.");
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = "high";
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      blob = await canvasToJpeg(canvas, quality);
      if (blob.size <= 3.75 * 1024 * 1024) break;
      maxDimension = Math.round(maxDimension * 0.88);
      quality = Math.max(0.78, quality - 0.04);
    }
  } finally {
    if (typeof image?.close === "function") image.close();
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }

  if (!blob || blob.size > 4 * 1024 * 1024) throw new Error("Could not prepare this photo.");
  const baseName = (source.name || "product-photo").replace(/\.[^.]+$/, "") || "product-photo";
  return new File([blob], `${baseName}-normalized.jpg`, {
    type: "image/jpeg",
    lastModified: Date.now()
  });
}

async function prepareListingImage(source) {
  const image = await createImageBitmap(source);
  const maxDimension = 1800;
  const scale = Math.min(1, maxDimension / Math.max(image.width, image.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));
  const context = canvas.getContext("2d");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  image.close();

  return await new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => blob ? resolve(blob) : reject(new Error("Could not prepare this photo for listing analysis.")),
      "image/jpeg",
      0.84
    );
  });
}

