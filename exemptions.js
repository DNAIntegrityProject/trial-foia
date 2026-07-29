"use strict";

const PAGE = 100;
let DATA = null, ROWS = [], view = [], page = 1;
let sortKey = "total_markers", sortDir = -1;
const activeMarkers = new Set();

const $ = (id) => document.getElementById(id);
const fmt = (n) => (n || 0).toLocaleString();
const esc = (s) => String(s).replace(/[&<>"]/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

function markerChip(m, count) {
  const cls = m === "(b)(4)" ? "mk mk-b4" : m === "(b)(6)" ? "mk mk-b6" : "mk";
  return `<span class="${cls}">${esc(m)}${count != null ? " " + fmt(count) : ""}</span>`;
}
function statusTag(s) {
  return s === "NEW" ? '<span class="tag tag-new">New</span>'
                     : '<span class="tag tag-phmpt">PHMPT</span>';
}

fetch("exemptions.json").then((r) => r.json()).then((d) => {
  DATA = d;
  ROWS = d.files;
  renderStats();
  renderCrosstabs();
  renderRare();
  buildFilters();
  apply();
}).catch((e) => { $("stats").textContent = "Failed to load exemptions.json: " + e; });

function renderStats() {
  const s = DATA.summary;
  const cards = [
    [fmt(s.files), "documents in trove"],
    [fmt(s.total_marker_occurrences), "total redaction markers"],
    [fmt(s.files_with_markers), "documents with markers"],
    [`${fmt(s.new_files_with_markers)} / ${fmt(s.new_files)}`, "NEW docs with markers"],
  ];
  $("stats").innerHTML = cards.map(([b, t]) =>
    `<div class="stat"><b>${b}</b><span>${t}</span></div>`).join("");
  const bs = s.by_source || {};
  $("coverage").innerHTML =
    `Coverage: <b>${fmt(bs.phmpt)}</b> reused from the PHMPT scan · ` +
    `<b>${fmt(bs.new)}</b> newly OCR-scanned · ` +
    `<b>${fmt(bs.data)}</b> non-PDF data files (no text markers) · ` +
    `<b>${fmt(bs.none)}</b> correspondence PDFs not held locally, not yet scanned.`;
}

function crosstabTable(ct) {
  const cols = ct.columns;
  let h = "<table><thead><tr><th>Exemption</th>" +
    cols.map((c) => `<th class="num">${esc(c)}</th>`).join("") +
    '<th class="num">Total</th></tr></thead><tbody>';
  for (const row of ct.rows) {
    h += `<tr><td>${markerChip(row.exemption)}</td>` +
      cols.map((c) => `<td class="num">${fmt(row.counts[c])}</td>`).join("") +
      `<td class="num"><b>${fmt(row.total)}</b></td></tr>`;
  }
  const totFiles = Object.values(ct.files).reduce((a, b) => a + b, 0);
  h += `<tr><td><i>Files</i></td>` +
    cols.map((c) => `<td class="num"><i>${fmt(ct.files[c])}</i></td>`).join("") +
    `<td class="num"><i>${fmt(totFiles)}</i></td></tr>`;
  h += `<tr><td><i>Markers / file</i></td>` +
    cols.map((c) => {
      const f = ct.files[c] || 0, m = ct.markers_total[c] || 0;
      return `<td class="num"><i>${f ? (m / f).toFixed(1) : "0"}</i></td>`;
    }).join("") + `<td></td></tr>`;
  return h + "</tbody></table>";
}

function renderCrosstabs() {
  $("xt-status-body").innerHTML = crosstabTable(DATA.crosstabs.status);
  $("xt-module-body").innerHTML = crosstabTable(DATA.crosstabs.module);
  $("xt-category-body").innerHTML = crosstabTable(DATA.crosstabs.category);
  $("xt-bimo-body").innerHTML = crosstabTable(DATA.crosstabs.bimo);
}

function renderRare() {
  if (!DATA.rare.length) { $("rare-body").innerHTML = "<p class='muted'>None.</p>"; return; }
  let h = "";
  for (const r of DATA.rare) {
    h += `<div style="margin:10px 0"><b>${markerChip(r.exemption)}</b> — ` +
      `${fmt(r.total)} occurrences across ${fmt(r.files)} document(s)` +
      '<table style="margin-top:6px"><thead><tr><th>Document</th><th>Set</th>' +
      '<th class="num">Count</th></tr></thead><tbody>';
    for (const e of r.examples) {
      const link = e.doc_link
        ? `<a class="fn" href="${esc(e.doc_link)}" target="_blank" rel="noopener">${esc(e.filename)}</a>`
        : esc(e.filename);
      h += `<tr><td class="fn">${link}</td><td>${statusTag(e.status)}</td>` +
        `<td class="num">${fmt(e.count)}</td></tr>`;
    }
    h += "</tbody></table></div>";
  }
  $("rare-body").innerHTML = h;
}

function buildFilters() {
  const mods = [...new Set(ROWS.map((r) => r.module))].sort();
  const cats = [...new Set(ROWS.map((r) => r.category))].sort();
  for (const m of mods) $("f-module").insertAdjacentHTML("beforeend", `<option>${esc(m)}</option>`);
  for (const c of cats) $("f-category").insertAdjacentHTML("beforeend", `<option>${esc(c)}</option>`);

  // exemption chips from the summary, in frequency order
  const chips = Object.keys(DATA.summary.by_marker);
  $("ex-chips").innerHTML = "<span class='muted' style='align-self:center'>Has exemption:</span>" +
    chips.map((m) => `<span class="chip" data-mk="${esc(m)}">${esc(m)}</span>`).join("");
  $("ex-chips").querySelectorAll(".chip").forEach((el) => {
    el.onclick = () => {
      const m = el.dataset.mk;
      if (activeMarkers.has(m)) { activeMarkers.delete(m); el.classList.remove("on"); }
      else { activeMarkers.add(m); el.classList.add("on"); }
      apply();
    };
  });

  ["f-name", "f-status", "f-module", "f-category", "f-min", "f-markers-only"]
    .forEach((id) => $(id).addEventListener("input", apply));
  $("prev").onclick = () => { if (page > 1) { page--; renderRows(); } };
  $("next").onclick = () => { if (page * PAGE < view.length) { page++; renderRows(); } };
  document.querySelectorAll("th[data-sort]").forEach((th) => {
    th.onclick = () => {
      const k = th.dataset.sort;
      if (sortKey === k) sortDir = -sortDir;
      else { sortKey = k; sortDir = (k === "total_markers") ? -1 : 1; }
      apply();
    };
  });
}

function apply() {
  const name = $("f-name").value.trim().toLowerCase();
  const status = $("f-status").value;
  const mod = $("f-module").value;
  const cat = $("f-category").value;
  const min = parseInt($("f-min").value, 10);
  const withOnly = $("f-markers-only").checked;

  view = ROWS.filter((r) => {
    if (name && !r.filename.toLowerCase().includes(name)) return false;
    if (status && r.status !== status) return false;
    if (mod && r.module !== mod) return false;
    if (cat && r.category !== cat) return false;
    if (!isNaN(min) && (r.total_markers || 0) < min) return false;
    if (withOnly && !r.total_markers) return false;
    for (const m of activeMarkers) if (!(m in r.by_marker)) return false;
    return true;
  });

  view.sort((a, b) => {
    let x = a[sortKey], y = b[sortKey];
    if (typeof x === "string") { x = x.toLowerCase(); y = (y || "").toLowerCase(); }
    else { x = x || 0; y = y || 0; }
    return x < y ? -sortDir : x > y ? sortDir : 0;
  });
  page = 1;
  renderRows();
}

function renderRows() {
  const start = (page - 1) * PAGE;
  const slice = view.slice(start, start + PAGE);
  $("rows").innerHTML = slice.map((r) => {
    const link = r.doc_link
      ? `<a class="fn" href="${esc(r.doc_link)}" target="_blank" rel="noopener">${esc(r.filename)}</a>`
      : esc(r.filename);
    const marks = Object.entries(r.by_marker)
      .sort((a, b) => b[1] - a[1])
      .map(([m, c]) => markerChip(m, c)).join(" ") || '<span class="muted">—</span>';
    return `<tr><td class="fn">${link}</td><td>${statusTag(r.status)}</td>` +
      `<td>${esc(r.module)}</td><td>${esc(r.category)}</td>` +
      `<td class="num">${fmt(r.total_markers)}</td><td>${marks}</td></tr>`;
  }).join("");
  $("count").textContent =
    `${fmt(view.length)} document(s) match · ${fmt(view.reduce((a, r) => a + (r.total_markers || 0), 0))} markers in view`;
  const pages = Math.max(1, Math.ceil(view.length / PAGE));
  $("pageinfo").textContent = `Page ${page} / ${pages}`;
  $("prev").disabled = page <= 1;
  $("next").disabled = page >= pages;
}
