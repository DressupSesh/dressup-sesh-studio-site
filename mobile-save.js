(() => {
  const button = document.querySelector("#save-all-mobile");
  const grid = document.querySelector("#photo-grid");
  if (!button || !grid) return;

  let preparedFiles = [];
  let refreshVersion = 0;

  function finishedPhotoLinks() {
    return [...grid.querySelectorAll("a[download]")]
      .filter((link) => link.href && link.download);
  }

  async function refreshPreparedFiles() {
    const version = ++refreshVersion;
    const links = finishedPhotoLinks();
    button.disabled = true;
    button.classList.remove("complete");

    try {
      const files = await Promise.all(links.map(async (link) => {
        const response = await fetch(link.href);
        if (!response.ok) throw new Error("Could not prepare a finished photo.");
        const blob = await response.blob();
        return new File([blob], link.download, { type: blob.type || "image/png" });
      }));
      if (version !== refreshVersion) return;
      preparedFiles = files;
      button.disabled = files.length === 0;
    } catch {
      if (version !== refreshVersion) return;
      preparedFiles = [];
      button.disabled = true;
    }
  }

  button.addEventListener("click", async () => {
    const files = preparedFiles.slice();
    if (!files.length) return;
    if (!navigator.share || !navigator.canShare?.({ files })) {
      window.alert("This device cannot save several photos at once. Use the computer button to download the complete ZIP instead.");
      return;
    }

    button.disabled = true;
    button.classList.add("working");
    button.setAttribute("aria-label", "Opening all edited photos on this phone");
    try {
      await navigator.share({ files, title: "Dressup Sesh edited product photos" });
      button.classList.add("complete");
    } catch (error) {
      if (error?.name !== "AbortError") {
        window.alert("The photos could not be opened for saving. Use the computer button to download the complete ZIP instead.");
      }
    } finally {
      button.classList.remove("working");
      button.setAttribute("aria-label", "Save all edited photos to phone");
      button.disabled = preparedFiles.length === 0;
      setTimeout(() => button.classList.remove("complete"), 1400);
    }
  });

  new MutationObserver(() => { void refreshPreparedFiles(); }).observe(grid, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["href", "download"]
  });
  void refreshPreparedFiles();
})();
