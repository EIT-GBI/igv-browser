# IGV Browser

A minimal [igv.js](https://igv.org/doc/igvjs/) page using the original IGV interface and human hg38.

[Open the browser](https://eit-gbi.github.io/igv-browser/).

## Saved local tracks

1. Keep your bigWig files and a `tracks.json` file in `~/igv`.
2. Open the site and choose that folder with **Local tracks folder**. On macOS, press Command+Shift+G in the file picker and enter `~/igv` to select the folder.
3. IGV reads the selected files directly in the browser.

In browsers supporting the File System Access API, the page remembers the selected folder in IndexedDB and loads it automatically on startup while read permission remains granted. If permission expires, click **Reconnect local tracks folder**. In Chrome, choose **Allow on every visit** when that permission option appears to enable automatic loading on future visits. **Change local tracks folder** opens the picker at the remembered folder.

The initial folder selection requires a click and your permission. Browsers using the fallback file input require folder selection each visit. The site cannot select an arbitrary `~/igv` path automatically before you grant access. See [Chrome’s persistent folder permissions](https://developer.chrome.com/blog/persistent-permissions-for-the-file-system-access-api).

The selected folder's `tracks.json` supplies local track settings. When it is absent, the page uses `docs/tracks.json` from this repository. Each JSON file contains an array of standard IGV track configurations. Local `url` values are paths relative to the selected folder. Selecting a folder again replaces the local tracks already loaded.

The repository defaults describe `RNAseq_HAP1_c12_R1.bw`, the HAP1 c12 R1 RNA-seq bigWig on hg38. The bigWig stays on your computer. Remote HTTP(S) tracks in the repository defaults load on startup.

## Customise and deploy

Edit `docs/index.html` for the initial genome and locus. Edit `docs/tracks.json` for default tracks. GitHub Pages publishes `/docs` from `main` after each push.

igv.js is pinned to 3.8.10 and loaded from jsDelivr. Site code and igv.js are MIT licensed.
