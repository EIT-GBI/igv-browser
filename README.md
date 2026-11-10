# IGV Browser

A standalone, customisable genome browser for EIT GBI, powered by [igv.js](https://igv.org/doc/igvjs/).

Live site: https://eit-gbi.github.io/igv-browser/

## Features

- Human hg38 with RefSeq genes as the starting view.
- Human hg19 and mouse mm39 assembly selection.
- Quick navigation to TP53, EGFR and BRCA1 on hg38.
- Remote track URLs with optional explicit index URLs.
- Local track files with paired indexes, read directly in the browser.
- JSON session import/export, including custom references.
- Shareable links containing the current session in the URL fragment.

## Customise

Edit `docs/config.json` to change the default reference, locus, tracks, colors and IGV settings. A custom reference can use `reference: {id, name, fastaURL, indexURL}` in place of `genome`. See the [reference documentation](https://igv.org/doc/igvjs/Reference-Genome/).

Edit `docs/styles.css` for branding and layout, and `docs/app.js` for controls and interactions. The IGV dependency is pinned to 3.8.10 in `docs/index.html` and served through jsDelivr.

## Preview

Serve `docs/` with a static HTTP server and open its URL in a modern browser. For a persistent preview using atch:

```sh
atch start igv-browser-preview sh -c 'python3 -m http.server 8094 --directory docs > preview.log 2>&1; code=$?; echo "$code" > preview.exit; exit "$code"'
```

## Deployment

GitHub Pages publishes the `/docs` directory from `main`. Changes pushed to `main` trigger a Pages build. Static assets use relative paths so the project URL works under `/igv-browser/`.

## Data hosting and sessions

Use HTTPS track URLs. Indexed remote files require HTTP Range support; cross-origin hosts require CORS. Store large datasets and reference files on a suitable object store. See [IGV data server requirements](https://igv.org/doc/igvjs/Data-Server-Requirements/).

Local files stay in the browser. Views containing local tracks require hosted track URLs before session export or link sharing. Saved sessions and shared links include remote data URLs; use public, shareable URLs appropriate for the intended audience.

## License

Site code is MIT licensed. igv.js is MIT licensed by the IGV team; its distribution retains its upstream license notice. Reference genomes and annotations remain subject to their providers’ terms.
