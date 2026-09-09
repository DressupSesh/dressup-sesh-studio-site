(() => {
  const photoGrid = document.querySelector("#photo-grid");
  const creativeResults = document.querySelector("#creative-results");
  const listingOutput = document.querySelector("#listing-output");
  const photoPhone = document.querySelector("#photo-save-page");
  const photoComputer = document.querySelector("#photo-download-page");
  const creativePhone = document.querySelector("#creative-save-page");
  const creativeComputer = document.querySelector("#creative-download-page");
  const listingCopy = document.querySelector("#listing-copy-page");

  const prepared = { photos: [], creative: [] };
  const versions = { photos: 0, creative: 0 };

  function linksWithin(container) {
    if (!container) return [];
    return [...container.querySelectorAll("a[download]")]
      .filter((link) => link.href && link.download);
  }

  async function prepareGroup(name, container, buttons) {
    const version = ++versions[name];
    const links = linksWithin(container);
    buttons.forEach((button) => { if (button) button.disabled = true; });
    try {
      const files = await Promise.all(links.map(async (link) => {
        const response = await fetch(link.href);
        if (!response.ok) throw new Error("Could not prepare this image.");
        const blob = await response.blob();
        return new File([blob], link.download, { type: blob.type || "image/png" });
      }));
      if (version !== versions[name]) return;
      prepared[name] = files;
      buttons.forEach((button) => { if (button) button.disabled = files.length === 0; });
    } catch {
      if (version !== versions[name]) return;
      prepared[name] = [];
      buttons.forEach((button) => { if (button) button.disabled = true; });
    }
  }

  function showComplete(button, resetLabel) {
    button.classList.add("complete");
    button.setAttribute("aria-label", "Saved successfully");
    setTimeout(() => {
      button.classList.remove("complete");
      button.setAttribute("aria-label", resetLabel);
    }, 1400);
  }

  async function sharePrepared(files, button, title, resetLabel) {
    if (!files.length) return;
    if (!navigator.share || !navigator.canShare?.({ files })) {
      window.alert("This device cannot save several images at once. Use Download All instead.");
      return;
    }
    button.disabled = true;
    button.classList.add("working");
    try {
      await navigator.share({ files, title });
      showComplete(button, resetLabel);
    } catch (error) {
      if (error?.name !== "AbortError") window.alert("The images could not be opened for saving. Please try again.");
    } finally {
      button.classList.remove("working");
      button.disabled = files.length === 0;
    }
  }

  async function downloadPrepared(files, button, zipName, resetLabel) {
    if (!files.length) return;
    if (typeof window.JSZip !== "function") {
      window.alert("Download All is temporarily unavailable. Please try again.");
      return;
    }
    button.disabled = true;
    button.classList.add("working");
    try {
      const zip = new window.JSZip();
      files.forEach((file) => zip.file(file.name, file));
      const blob = await zip.generateAsync({
        type: "blob",
        compression: "DEFLATE",
        compressionOptions: { level: 6 }
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = zipName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
      showComplete(button, resetLabel);
    } catch {
      window.alert("The images could not be packaged. Please try again.");
    } finally {
      button.classList.remove("working");
      button.disabled = files.length === 0;
    }
  }

  function refreshListingCopy() {
    if (!listingCopy || !listingOutput) return;
    listingCopy.disabled = !listingOutput.textContent.trim();
  }

  photoPhone?.addEventListener("click", () => {
    void sharePrepared(prepared.photos.slice(), photoPhone, "Dressup Sesh edited product photos", "Save all edited photos to phone");
  });
  photoComputer?.addEventListener("click", () => {
    void downloadPrepared(prepared.photos.slice(), photoComputer, "dressup-sesh-edited-photos.zip", "Download all edited photos");
  });
  creativePhone?.addEventListener("click", () => {
    void sharePrepared(prepared.creative.slice(), creativePhone, "Dressup Sesh creative images", "Save all creative images to phone");
  });
  creativeComputer?.addEventListener("click", () => {
    void downloadPrepared(prepared.creative.slice(), creativeComputer, "dressup-sesh-creative-images.zip", "Download all creative images");
  });
  listingCopy?.addEventListener("click", async () => {
    const text = listingOutput?.textContent.trim();
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      listingCopy.classList.add("complete");
      listingCopy.setAttribute("aria-label", "Listing text copied");
      setTimeout(() => {
        listingCopy.classList.remove("complete");
        listingCopy.setAttribute("aria-label", "Copy listing text");
      }, 1400);
    } catch {
      window.alert("The listing text could not be copied. Please try again.");
    }
  });

  if (photoGrid) {
    new MutationObserver(() => {
      void prepareGroup("photos", photoGrid, [photoPhone, photoComputer]);
    }).observe(photoGrid, { childList: true, subtree: true, attributes: true, attributeFilter: ["href", "download"] });
    void prepareGroup("photos", photoGrid, [photoPhone, photoComputer]);
  }
  if (creativeResults) {
    new MutationObserver(() => {
      void prepareGroup("creative", creativeResults, [creativePhone, creativeComputer]);
    }).observe(creativeResults, { childList: true, subtree: true, attributes: true, attributeFilter: ["href", "download"] });
    void prepareGroup("creative", creativeResults, [creativePhone, creativeComputer]);
  }
  if (listingOutput) {
    new MutationObserver(refreshListingCopy).observe(listingOutput, { childList: true, subtree: true, characterData: true });
    refreshListingCopy();
  }
})();
