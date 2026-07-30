"use strict";
const PAGE = 100;
let ROWS = [], view = [], page = 1, sortKey = "mag", sortDir = -1;
const $ = (id) => document.getElementById(id);
const fmt = (n) => (n || 0).toLocaleString();
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const mag = (d) => Object.values(d).reduce((a, b) => a + b, 0);
const markers = (o) => Object.entries(o).sort((a, b) => b[1] - a[1])
  .map(([m, c]) => `${esc(m)}&nbsp;${fmt(c)}`).join(" · ") || "<span class='muted'>none</span>";
function deltaStr(d) {
  return Object.entries(d).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
    .map(([m, v]) => `<span class="${v > 0 ? "up" : "down"}">${esc(m)} ${v > 0 ? "+" : ""}${fmt(v)}</span>`)
    .join(" ");
}

fetch("redaction_diffs.json").then((r) => r.json()).then((d) => {
  ROWS = d.map((x) => ({ ...x, mag: mag(x.delta), pages: `${x.trove_pages ?? "?"}/${x.phmpt_pages ?? "?"}` }));
  renderStats();
  const cats = [...new Set(ROWS.map((r) => r.category))].sort();
  for (const c of cats) $("f-cat").insertAdjacentHTML("beforeend", `<option>${esc(c)}</option>`);
  ["f-name", "f-kind", "f-conf", "f-dir", "f-cat"].forEach((id) => $(id).addEventListener("input", apply));
  $("prev").onclick = () => { if (page > 1) { page--; render(); } };
  $("next").onclick = () => { if (page * PAGE < view.length) { page++; render(); } };
  document.querySelectorAll("th[data-sort]").forEach((th) => th.onclick = () => {
    const k = th.dataset.sort;
    if (sortKey === k) sortDir = -sortDir; else { sortKey = k; sortDir = (k === "mag") ? -1 : 1; }
    apply();
  });
  apply();
}).catch((e) => { $("stats").textContent = "Failed to load redaction_diffs.json: " + e; });

function renderStats() {
  const rr = ROWS.filter((r) => r.kind === "reredaction");
  const hi = rr.filter((r) => r.confidence === "high");
  const net = {};
  for (const r of hi) for (const [m, v] of Object.entries(r.delta)) net[m] = (net[m] || 0) + v;
  const b6 = net["(b)(6)"] || 0;
  const cards = [
    [fmt(hi.length), "documents this release adds redactions to (text-verified)"],
    [`+${fmt(b6)}`, "net (b)(6) personal-privacy markers added"],
    [fmt(rr.length), "same-document differences (text-verified)"],
    [fmt(ROWS.filter((r) => r.kind === "version").length), "re-issued / different-length versions"],
    [fmt(rr.filter((r) => r.confidence === "verify").length), "flagged 'verify' (likely image, check visually)"],
  ];
  $("stats").innerHTML = cards.map(([b, t]) => `<div class="stat"><b>${b}</b><span>${t}</span></div>`).join("");
}

function apply() {
  const name = $("f-name").value.trim().toLowerCase();
  const kind = $("f-kind").value, conf = $("f-conf").value, dir = $("f-dir").value, cat = $("f-cat").value;
  view = ROWS.filter((r) => {
    if (name && !r.filename.toLowerCase().includes(name)) return false;
    if (kind && r.kind !== kind) return false;
    if (conf && r.confidence !== conf) return false;
    if (cat && r.category !== cat) return false;
    if (dir === "more" && r.mag <= 0) return false;
    if (dir === "less" && r.mag >= 0) return false;
    return true;
  });
  view.sort((a, b) => {
    let x = a[sortKey], y = b[sortKey];
    if (sortKey === "mag") { x = Math.abs(x); y = Math.abs(y); }
    if (typeof x === "string") { x = x.toLowerCase(); y = (y || "").toLowerCase(); }
    return x < y ? -sortDir : x > y ? sortDir : 0;
  });
  page = 1; render();
}

function versionLinks(r) {
  const t = r.trove_link
    ? `<a class="vlink vlink-this" href="${esc(r.trove_link)}" target="_blank" rel="noopener">This release${r.trove_oversize ? " <small>(GitHub)</small>" : ""}</a>`
    : "";
  const p = r.phmpt_link
    ? `<a class="vlink vlink-phmpt" href="${esc(r.phmpt_link)}" target="_blank" rel="noopener">PHMPT</a>`
    : "";
  return t + p || "<span class='muted'>—</span>";
}
function diffPagesCell(r) {
  if (r.kind !== "reredaction") return "<span class='muted'>version — pages don't align</span>";
  const dp = r.diff_pages || [];
  if (!dp.length) return "<span class='muted'>—</span>";
  const shown = dp.slice(0, 25).join(", ");
  return `<div class="dpages">${dp.length} page(s): ${shown}${dp.length > 25 ? " …" : ""}</div>`;
}
function render() {
  const slice = view.slice((page - 1) * PAGE, page * PAGE);
  $("rows").innerHTML = slice.map((r) => {
    const verify = r.confidence === "verify"
      ? ' <span class="tag" style="background:#fdecc8;color:#8a5a00">verify</span>' : "";
    const tag = r.kind === "reredaction"
      ? `<span class="tag tag-rr">re-redaction</span>${verify}` : '<span class="tag tag-ver">version</span>';
    return `<tr><td class="fn">${esc(r.filename)}</td>` +
      `<td>${versionLinks(r)}</td><td>${tag}</td>` +
      `<td class="num">${deltaStr(r.delta)}</td>` +
      `<td>${diffPagesCell(r)}</td>` +
      `<td>${markers(r.trove)} <span class="muted">/</span> ${markers(r.phmpt)}</td>` +
      `<td class="num">${esc(r.pages)}</td></tr>`;
  }).join("");
  $("count").textContent = `${fmt(view.length)} document(s)`;
  const pages = Math.max(1, Math.ceil(view.length / PAGE));
  $("pageinfo").textContent = `Page ${page} / ${pages}`;
  $("prev").disabled = page <= 1; $("next").disabled = page >= pages;
}
