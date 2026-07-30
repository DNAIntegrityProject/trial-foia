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
  ["f-name", "f-kind", "f-dir", "f-cat"].forEach((id) => $(id).addEventListener("input", apply));
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
  const more = rr.filter((r) => r.mag > 0).length, less = rr.filter((r) => r.mag < 0).length;
  const net = {};
  for (const r of rr) for (const [m, v] of Object.entries(r.delta)) net[m] = (net[m] || 0) + v;
  const b6 = net["(b)(6)"] || 0, b4 = net["(b)(4)"] || 0;
  const cards = [
    [fmt(ROWS.length), "documents redacted differently"],
    [fmt(rr.length), "same document, re-redacted"],
    [`${fmt(more)} / ${fmt(less)}`, "same-doc: more / less than PHMPT"],
    [`${b6 >= 0 ? "+" : ""}${fmt(b6)}`, "net (b)(6) privacy Δ (same-doc)"],
    [`${b4 >= 0 ? "+" : ""}${fmt(b4)}`, "net (b)(4) trade-secret Δ (same-doc)"],
  ];
  $("stats").innerHTML = cards.map(([b, t]) => `<div class="stat"><b>${b}</b><span>${t}</span></div>`).join("");
}

function apply() {
  const name = $("f-name").value.trim().toLowerCase();
  const kind = $("f-kind").value, dir = $("f-dir").value, cat = $("f-cat").value;
  view = ROWS.filter((r) => {
    if (name && !r.filename.toLowerCase().includes(name)) return false;
    if (kind && r.kind !== kind) return false;
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

function render() {
  const slice = view.slice((page - 1) * PAGE, page * PAGE);
  $("rows").innerHTML = slice.map((r) => {
    const link = r.doc_link
      ? `<a class="fn" href="${esc(r.doc_link)}" target="_blank" rel="noopener">${esc(r.filename)}</a>`
      : esc(r.filename);
    const tag = r.kind === "reredaction"
      ? '<span class="tag tag-rr">re-redaction</span>' : '<span class="tag tag-ver">version</span>';
    return `<tr><td class="fn">${link}</td><td>${tag}</td><td>${esc(r.category)}</td>` +
      `<td class="num">${deltaStr(r.delta)}</td><td>${markers(r.trove)}</td>` +
      `<td>${markers(r.phmpt)}</td><td class="num">${esc(r.pages)}</td></tr>`;
  }).join("");
  $("count").textContent = `${fmt(view.length)} document(s)`;
  const pages = Math.max(1, Math.ceil(view.length / PAGE));
  $("pageinfo").textContent = `Page ${page} / ${pages}`;
  $("prev").disabled = page <= 1; $("next").disabled = page >= pages;
}
