"use strict";
const $ = (id) => document.getElementById(id);
let browser;
let hasLocalFiles = false;
function status(message, error = false) {
  $("status").textContent = message;
  $("status").dataset.error = String(error);
}
async function run(action) {
  try { await action(); } catch (error) { console.error(error); status(error.message || String(error), true); }
}
function updateAssembly() {
  const id = browser.genome.id;
  $("genome").value = ["hg38", "hg19", "mm39"].includes(id) ? id : "custom";
  document.querySelectorAll("[data-locus]").forEach((button) => { button.disabled = id !== "hg38"; });
}
function exportableSession() {
  if (hasLocalFiles) throw new Error("This view contains local files. Use hosted track URLs to save or share a reproducible session.");
  return browser.toJSON();
}
async function start() {
  if (!window.igv) throw new Error("IGV could not load. Check your internet connection and reload the page.");
  const response = await fetch("config.json");
  if (!response.ok) throw new Error(`Configuration request failed (${response.status}).`);
  const config = await response.json();
  browser = await igv.createBrowser($("igv"), config);
  // Fragment sessions keep shared state together with the static site URL.
  if (location.hash.startsWith("#session=")) {
    await browser.loadSessionObject(JSON.parse(decodeURIComponent(location.hash.slice(9))));
  }
  updateAssembly();
  document.querySelectorAll(".toolbar button, .toolbar input, .toolbar select, aside button, aside input, aside select").forEach((control) => { control.disabled = false; });
  updateAssembly();
  window.igvBrowser = browser;
  status("Ready · Reference genes loaded. Add a track to explore your data.");
}
$("genome").addEventListener("change", () => run(async () => {
  if ($("genome").value === "custom") return;
  status("Loading assembly…");
  await browser.loadGenome($("genome").value);
  hasLocalFiles = false;
  updateAssembly();
  status("Assembly loaded · Add tracks matched to this reference.");
}));
$("presets").addEventListener("click", (event) => run(async () => {
  const locus = event.target.dataset.locus;
  if (locus) { await browser.search(locus); status(`Viewing ${event.target.textContent} · hg38`); }
}));
$("track-form").addEventListener("submit", (event) => {
  event.preventDefault();
  run(async () => {
    const url = new URL($("track-url").value.trim());
    const index = $("index-url").value.trim();
    if (url.protocol !== "https:" || (index && new URL(index).protocol !== "https:")) throw new Error("Use HTTPS URLs for remote tracks and indexes.");
    const track = { url: url.href, name: $("track-name").value.trim() || decodeURIComponent(url.pathname.split("/").pop()), color: "#167d8d" };
    if (index) track.indexURL = index;
    if ($("track-format").value) track.format = $("track-format").value;
    status("Loading track…");
    await browser.loadTrack(track);
    $("track-form").reset();
    status(`Track added · ${track.name}`);
  });
});
$("open-local").addEventListener("click", () => run(async () => {
  const files = [...$("local-files").files];
  const indexes = files.filter((file) => /\.(bai|crai|tbi|csi|idx)$/i.test(file.name));
  const data = files.filter((file) => !indexes.includes(file));
  if (!data.length) throw new Error("Select a track data file together with its index, when available.");
  for (const file of data) {
    const basename = file.name.replace(/\.(bam|cram|vcf\.gz|bed\.gz)$/i, "");
    const index = indexes.find((item) => item.name.startsWith(file.name + ".") || item.name.replace(/\.(bai|crai|tbi|csi|idx)$/i, "") === basename);
    if (/\.(bam|cram|vcf\.gz|bed\.gz)$/i.test(file.name) && !index) throw new Error(`Select the index for ${file.name} together with the data file.`);
    status(`Loading ${file.name}…`);
    await browser.loadTrack({ url: file, indexURL: index, name: file.name, indexed: Boolean(index) });
    hasLocalFiles = true;
  }
  status("Local tracks loaded · Files stay in your browser. Sharing and session export require hosted track URLs.");
}));
$("save").addEventListener("click", () => run(async () => {
  const url = URL.createObjectURL(new Blob([JSON.stringify(exportableSession(), null, 2)], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url; link.download = "igv-session.json"; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  status("Session saved · Open the JSON file here to restore this view.");
}));
$("session").addEventListener("change", () => run(async () => {
  const file = $("session").files[0];
  if (!file) return;
  status("Opening session…");
  await browser.loadSessionObject(JSON.parse(await file.text()));
  hasLocalFiles = false;
  updateAssembly();
  $("session").value = "";
  status("Session loaded.");
}));
$("share").addEventListener("click", () => run(async () => {
  const url = new URL(location.href);
  url.hash = "session=" + encodeURIComponent(JSON.stringify(exportableSession()));
  if (url.href.length > 50000) throw new Error("This session is large. Save its JSON file and share that file with your team.");
  await navigator.clipboard.writeText(url.href);
  status("View link copied · The link includes your reference, locus, and hosted track URLs.");
}));
run(start);
