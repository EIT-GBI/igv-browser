export async function initializeLocalTracks(browser, defaults, restore = true) {


    const folder = document.getElementById("folder");
    const choose = document.getElementById("choose");
    const status = document.getElementById("status");
    const persistent = "showDirectoryPicker" in window;
    let savedFolder;
    const localTracks = [];
    const remote = track => /^https?:\/\//i.test(track.url);
    choose.hidden = !persistent;
    document.getElementById("fallback").hidden = persistent;

    // Remember the folder handle; the data files stay on disk.
    function rememberedFolder(handle) {
      return new Promise((resolve, reject) => {
        const request = indexedDB.open("igv-local-tracks", 1);
        request.onupgradeneeded = () => request.result.createObjectStore("folders");
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const transaction = db.transaction("folders", handle ? "readwrite" : "readonly");
          const store = transaction.objectStore("folders");
          const result = handle ? store.put(handle, "default") : store.get("default");
          transaction.oncomplete = () => { db.close(); resolve(result.result); };
          transaction.onabort = transaction.onerror = () => { db.close(); reject(transaction.error); };
        };
      });
    }

    async function fileFromHandle(path) {
      const parts = path.replace(/^\.\//, "").split("/");
      let directory = savedFolder;
      for (const part of parts.slice(0, -1)) directory = await directory.getDirectoryHandle(part);
      return (await directory.getFileHandle(parts.at(-1))).getFile();
    }

    async function loadTracks(getFile) {
      let tracks = defaults;
      try { tracks = JSON.parse(await (await getFile("tracks.json")).text()); }
      catch (error) { if (error.name !== "NotFoundError") throw error; }
      if (!Array.isArray(tracks)) throw new Error("tracks.json must contain an array of IGV tracks.");
      const resolved = [];
      for (const track of tracks.filter(track => !remote(track))) {
        resolved.push({ ...track, url: await getFile(String(track.url)) });
      }
      for (const track of localTracks.splice(0)) {
        if (browser.trackViews.some(view => view.track === track)) browser.removeTrack(track);
      }
      for (const config of resolved) {
        status.textContent = `Loading ${config.name}…`;
        localTracks.push(await browser.loadTrack(config));
      }
      status.textContent = `Loaded ${resolved.length} local track(s). Files stay on this computer.`;
      choose.textContent = "Change local tracks folder";
    }

    try {
      status.textContent = "Choose your ~/igv folder to load saved local tracks.";
      if (persistent) {
        try { savedFolder = await rememberedFolder(); }
        catch { status.textContent = "Choose your ~/igv folder. Browser storage is unavailable for remembering it."; }
        if (savedFolder) {
          if (await savedFolder.queryPermission({ mode: "read" }) === "granted") {
            if (restore) await loadTracks(fileFromHandle);
            else choose.textContent = "Change local tracks folder";
          } else {
            choose.textContent = "Reconnect local tracks folder";
            status.textContent = "Your folder is remembered. Click Reconnect to allow access.";
          }
        }
      }
    } catch (error) {
      status.textContent = error.message;
    }
    folder.disabled = choose.disabled = !browser;

    choose.addEventListener("click", async () => {
      choose.disabled = true;
      try {
        if (savedFolder && choose.textContent === "Reconnect local tracks folder") {
          if (await savedFolder.requestPermission({ mode: "read" }) !== "granted") {
            choose.textContent = "Choose local tracks folder";
            throw new Error("Read access was declined. Choose a folder to try again.");
          }
        } else {
          savedFolder = await window.showDirectoryPicker({
            id: "igv-local-tracks", mode: "read", ...(savedFolder ? { startIn: savedFolder } : {})
          });
        }
        await loadTracks(fileFromHandle);
        try { await rememberedFolder(savedFolder); }
        catch { status.textContent += " Browser storage is unavailable; select the folder again next visit."; }
      } catch (error) {
        if (error.name === "AbortError") {
          document.getElementById("fallback").hidden = false;
        } else status.textContent = error.message;
      } finally { choose.disabled = false; }
    });

    folder.addEventListener("change", async () => {
      folder.disabled = true;
      try {
        const files = [...folder.files];
        if (!files.length) return;
        await loadTracks(async path => {
          const file = files.find(file => file.webkitRelativePath.split("/").slice(1).join("/") === path.replace(/^\.\//, ""));
          if (!file) throw new DOMException(`Select a folder containing ${path}.`, "NotFoundError");
          return file;
        });
      } catch (error) { status.textContent = error.message; }
      finally { folder.disabled = false; }
    });

}
