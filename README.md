# IGV Browser

A customised IGV browser for Parts lab, built with [igv.js](https://igv.org/doc/igvjs/).

[Open the browser](https://eit-gbi.github.io/igv-browser/).

## Widgets

Genome, Tracks, Session, and BLAT start folded. Save image is always visible in one row. Scroll up over a genome track to zoom in, and scroll down to zoom out. Zoom follows the mouse pointer. Right-click a track feature, or left-click an ROI header, and choose **Zoom in** to fit that interval in the current view.

- **Genome:** the official IGV genome list, with human builds first and chicken included.
- **Tracks:** local files, URLs with optional indexes, the four ENCODE categories, **Hosted Annotations** from the current genome's official IGV hub, and all collections in IGV-Web's genome-specific track registry. Source buttons open a searchable, paged multi-select list. The list loads data on demand.
- **Group scaling:** use the checkboxes beside signal-track names to select multiple bigWig, wig, or bedGraph tracks. Click a track name to view its metadata. With tracks selected, press **S** to toggle the floating scaling panel. It closes when the selection is cleared; its close button and Escape also dismiss it. **Group autoscale** shares the visible data range and updates on pan/zoom. **Apply group range** assigns the same minimum and maximum to the selected tracks. Selected tracks have blue outlines. **Unselect all** clears the selection while preserving scaling. Scaling is included in saved session JSON.
- **Session:** load JSON/XML files, hosted session URLs, lab starter sessions, or the ten most recently loaded sessions stored in this browser. Save the current state as JSON.
- **Save PNG / SVG:** defaults to `IGV-screenshot_<assembly>_<chromosome>_<start>-<end>`. The name updates with the view and can be edited.
- **BLAT:** submit a DNA sequence of 20–8000 bases to IGV's UCSC BLAT service and display its native results track and table.

Genomes and track catalogues come from the same official registries used by [IGV-Web](https://igv.org/app/), through their IGV-team GitHub mirrors. Catalogue availability and BLAT results depend on their upstream services. The site uses the existing igv.js 3.8.10 API for genome loading, sessions, images, and BLAT.

## HAP-1 ENCODE-rE2G highlighting

For the HAP-1_ENCSR895KTN ENCODE-rE2G Elements and E2G Predictions tracks, click an element to highlight it in red, with incoming prediction links in red and outgoing links in orange. Other elements and links fade to very light grey. Hover over the prediction track or its label to see the incoming/red and outgoing/orange key. The prediction track defaults to **Proportional – One End in View**; an arc type saved explicitly in a session is retained. Links are highlighted when either BEDPE endpoint overlaps the selected element, including incoming target links and outgoing enhancer links. Click the selected element again, or an empty part of the Elements track, to restore all colours. Element clicks control highlighting; track-label clicks show metadata.

## Lab sessions

`docs/sessions.json` is the starter-session registry. It currently points to `docs/sessions/parts-hg38.json`, a human hg38 starting view at TP53. Add a record with `label` and `url` to offer another lab or hosted personal session. Individual session URLs can also be loaded directly from the widget.

Saved sessions contain data references. Remote tracks require accessible data URLs; local tracks require the recipient's files and folder access. IGV presents its own warning when saving local-file references. Reopen the local tracks folder to restore those tracks. A session link takes precedence over automatic local-folder loading at startup.

## Saved local tracks

1. Keep your bigWig files and a `tracks.json` file in `~/igv`.
2. Open the site and choose that folder with **Local tracks folder**. On macOS, press Command+Shift+G in the file picker and enter `~/igv` to select the folder.
3. IGV reads the selected files directly in the browser.

In browsers supporting the File System Access API, the page remembers the selected folder in IndexedDB and loads it automatically on startup while read permission remains granted. If permission expires, click **Reconnect local tracks folder**. In Chrome, choose **Allow on every visit** when that permission option appears to enable automatic loading on future visits. **Change local tracks folder** opens the picker at the remembered folder.

The initial folder selection requires a click and your permission. Browsers using the fallback file input require folder selection each visit. The site cannot select an arbitrary `~/igv` path automatically before you grant access. See [Chrome’s persistent folder permissions](https://developer.chrome.com/blog/persistent-permissions-for-the-file-system-access-api).

The selected folder's `tracks.json` supplies local track settings. When it is absent, the page uses `docs/tracks.json` from this repository. Each JSON file contains an array of standard IGV track configurations. Local `url` values are paths relative to the selected folder. Selecting a folder again replaces the local tracks already loaded.

The repository defaults describe `RNAseq_HAP1_c12_R1.bw`, the HAP1 c12 R1 RNA-seq bigWig on hg38. The bigWig stays on your computer. Remote HTTP(S) tracks in the repository defaults load on startup.

## Customise and deploy

Edit `docs/app.js` for the initial genome and locus. Edit `docs/tracks.json` for default tracks. GitHub Pages publishes `/docs` from `main` after each push.

igv.js is pinned to 3.8.10 and loaded from jsDelivr. Site code and igv.js are MIT licensed.

Inline annotation tracks use the same compact interval renderer as the Parts apps to remove false one-pixel seam lines.

## Validation

Run `node --test tests/widgets.test.mjs tests/wheel-zoom.test.mjs tests/group-scaling.test.mjs tests/annotation-seams.test.mjs tests/e2g-highlighting.test.mjs tests/region-zoom.test.mjs` for coordinate filenames, BLAT input, catalogue parsing, hub entries, file/index pairing, wheel zoom, shared scaling, and annotation rendering. Serve `docs/` with a static HTTP server for browser testing.
