// HeadCanon local viewer. No build step: plain ES modules, one JSON endpoint.
const STATES = ["stated", "resolved", "assumed", "open", "contested"];
const UNCONFIRMED = new Set(["assumed", "open", "contested"]);

const $main = document.getElementById("main");
let snap = null;
const ui = { collapsed: new Set(), filters: new Set(), flaggedOnly: false, query: "", levels: new Set(["error", "warn"]), graph: true };
try { ui.graph = localStorage.getItem("hc-tree-mode") !== "list"; } catch {}

// ---------------------------------------------------------------- helpers
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const badge = (state, extra = "") => `<span class="badge ${esc(state)} ${extra}">${esc(state)}</span>`;
const idLink = (id) => {
  if (!snap) return esc(id);
  if (snap.canon.nodes[id]) return `<a class="id" href="#/node/${esc(id)}">${esc(id)}</a>`;
  if (id.startsWith("JRN-")) return `<a class="id" href="#/journey/${esc(id.split("/")[0])}">${esc(id)}</a>`;
  if (id.startsWith("DEC-")) return `<a class="id" href="#/decision/${esc(id)}">${esc(id)}</a>`;
  if (id.startsWith("TERM-")) return `<a class="id" href="#/glossary">${esc(id)}</a>`;
  return `<span class="id">${esc(id)}</span>`;
};
const node = (id) => snap.canon.nodes[id];
const pct = (n, d) => (d ? Math.round((n / d) * 100) : 0);
const bar = (counts, total) =>
  `<div class="bar" title="${STATES.map((s) => `${s} ${counts[s] ?? 0}`).join(", ")}">${STATES.map((s) => `<span class="${s}" style="width:${pct(counts[s] ?? 0, total)}%"></span>`).join("")}</div>`;
const legend = () => `<div class="legend">${STATES.map((s) => `<span><i style="background:var(--${s})"></i>${s}</span>`).join("")}</div>`;
const descendants = (id, out = []) => { for (const c of node(id)?.children ?? []) { out.push(c); descendants(c, out); } return out; };
const branchOf = (id) => { let n = node(id); while (n?.parent && node(n.parent)) n = node(n.parent); return n?.id; };
const findingsFor = (id) => snap.findings.filter((f) => f.id === id);
const decisionsFor = (id) => snap.canon.decisions.filter((d) => d.intents.includes(id));
const requiredBy = (id) => Object.values(snap.canon.nodes).filter((n) => (n.requires ?? []).includes(id)).map((n) => n.id);
const stepsFor = (id) => { const out = []; for (const j of snap.canon.journeys) for (const s of j.steps) if (s.requirements.includes(id)) out.push({ j, s }); return out; };
const countBy = (ids) => { const c = Object.fromEntries(STATES.map((s) => [s, 0])); for (const id of ids) { const n = node(id); if (n) c[n.state]++; } return c; };

// ---------------------------------------------------------------- data
async function load() {
  const res = await fetch("/api/snapshot", { cache: "no-store" });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  snap = await res.json();
  // A viewer started before the link fields existed serves nodes without them; the page must still draw.
  for (const n of Object.values(snap.canon.nodes)) { n.requires ??= []; n.relates ??= []; n.conflicts ??= []; }
  document.getElementById("canon-path").textContent = `${snap.canon.dir}${snap.git.branch ? `  ·  ${snap.git.branch}` : ""}`;
  document.getElementById("generated").textContent = `read ${new Date(snap.generatedAt).toLocaleTimeString()}`;
  const n = attentionItems().total;
  const pill = document.getElementById("attention-count");
  pill.textContent = n;
  pill.hidden = n === 0;
  if (ui.collapsed.size === 0) for (const id of Object.keys(snap.canon.nodes)) if (node(id).depth >= 1 && node(id).children.length) ui.collapsed.add(id);
}

function attentionItems() {
  const nodes = Object.values(snap.canon.nodes);
  const pending = snap.git.pending ?? [];
  const pendingShas = new Set(pending.map((c) => c.sha));
  const unmerged = (snap.git.unmerged ?? []).filter((c) => !pendingShas.has(c.sha));
  const items = {
    pending,
    unmerged,
    uncommitted: snap.git.uncommitted ?? [],
    errors: snap.findings.filter((f) => f.level === "error"),
    contested: nodes.filter((n) => n.state === "contested" || n.sections.some((s) => s.marker === "contested")),
    open: nodes.filter((n) => n.state === "open"),
    assumedDecisions: snap.canon.decisions.filter((d) => d.state === "assumed"),
    assumed: nodes.filter((n) => n.state === "assumed"),
    terms: snap.canon.terms,
  };
  items.total = items.pending.length + items.unmerged.length + items.uncommitted.length + items.errors.length + items.contested.length + items.open.length + items.assumedDecisions.length;
  return items;
}

// ---------------------------------------------------------------- router
function route() {
  const h = location.hash.replace(/^#\/?/, "");
  const [view, ...rest] = h.split("/");
  const arg = rest.join("/");
  return { view: view || "overview", arg };
}
function render() {
  if (!snap) return;
  const { view, arg } = route();
  const tab = view === "node" ? "tree" : view === "journey" ? "journeys" : view === "decision" ? "decisions" : view;
  for (const a of document.querySelectorAll("#tabs a")) a.classList.toggle("active", a.dataset.view === tab);
  document.body.classList.toggle("adopt-mode", view === "adopt");
  if (view !== "adopt") closePopup();
  const views = { overview, adopt: () => adopt(arg), tree: () => tree(arg), node: () => tree(arg), health, attention, journeys: () => journeys(arg), journey: () => journeys(arg), decisions: () => decisions(arg), decision: () => decisions(arg), glossary };
  $main.innerHTML = (views[view] ?? overview)();
  afterRender(view);
}

// ---------------------------------------------------------------- overview
function overview() {
  const { stats, health } = snap;
  if (stats.nodes === 0 && !snap.canon.root) return `
    <div class="alert none"><span class="alert-icon">·</span><b>No canon yet.</b><span class="muted">The session is reading your documents and drafting it; the Adopt tab shows the boxes as they appear.</span></div>
    <h1>Canon</h1>
    <p class="lede">Nothing to show until the first node exists. The session speaks in the panel at the bottom right.</p>`;
  const att = attentionItems();
  const tile = (n, label, cls = "", href = "") => `<div class="tile ${cls}"><div class="n">${href ? `<a href="${href}">${n}</a>` : n}</div><div class="l">${label}</div></div>`;
  const groups = [
    ["Requirements", "What the tree holds", [
      tile(stats.nodes, `in ${health.length} branches`),
      tile(stats.nodes - stats.unrefined, "measurable leaves"),
      tile(stats.unrefined, "not yet measurable"),
    ]],
    ["Certainty", "Who has confirmed each node", STATES.map((s) => tile(stats.counts[s], `${s} · ${pct(stats.counts[s], stats.nodes)}%`, `s-${s}`, `#/tree`))],
    ["Findings", "From headcanon check", [
      tile(stats.errors, "errors", stats.errors ? "err" : "", "#/health"),
      tile(stats.warnings, "warnings", stats.warnings ? "warn" : "", "#/health"),
      tile(stats.infos, "notes", "", "#/health"),
    ]],
    ["Approvals", "From git trailers", [
      tile(att.pending.length, "pending", att.pending.length ? "warn" : "", "#/attention"),
      tile(att.unmerged.length, "unmerged intent changes", att.unmerged.length ? "warn" : "", "#/attention"),
      tile(att.uncommitted.length, "uncommitted edits", att.uncommitted.length ? "warn" : "", "#/attention"),
    ]],
    ["Other records", "Linked to the tree", [
      tile(stats.journeys, `journeys · ${stats.steps} steps`, "", "#/journeys"),
      tile(stats.decisions, "decisions", "", "#/decisions"),
      tile(stats.terms, "glossary terms", "", "#/glossary"),
    ]],
  ];
  const tileGroups = groups.map(([name, hint, tiles]) => `<section class="tile-group"><div class="tg-head"><b>${name}</b><span class="muted">${hint}</span></div><div class="grid tiles">${tiles.join("")}</div></section>`).join("");
  const blocking = [
    [att.pending.length, "pending approvals"], [att.unmerged.length, "unmerged intent changes"], [att.uncommitted.length, "uncommitted canon edits"],
    [att.errors.length, "broken links"], [att.contested.length, "contested"], [att.open.length, "open questions"], [att.assumedDecisions.length, "unconfirmed decisions"],
  ].filter(([n]) => n > 0);
  const alert = blocking.length
    ? `<a class="alert warn" href="#/attention"><span class="alert-icon">!</span><b>${att.total} items need your attention</b><span class="alert-items">${blocking.map(([n, l]) => `<span class="badge warn">${n} ${l}</span>`).join("")}</span><span class="alert-go">Open Attention →</span></a>`
    : `<div class="alert ok"><span class="alert-icon">✓</span><b>Nothing is waiting on you.</b></div>`;
  const rows = health.map((b) => `
    <tr class="click" data-href="#/node/${esc(b.id)}">
      <td class="id">${esc(b.id)}</td>
      <td>${esc(b.title)} ${badge(b.state)}</td>
      <td>${bar(b.counts, b.size)}</td>
      <td class="num">${b.size}</td>
      <td class="num">${pct(b.counts.assumed + b.counts.open + b.counts.contested, b.size)}%</td>
      <td class="num">${b.errors ? `<span class="badge error">${b.errors}</span>` : ""} ${b.warnings ? `<span class="badge warn">${b.warnings}</span>` : ""}</td>
    </tr>`).join("");
  return `
    ${alert}
    <h1>${esc(snap.canon.root?.title ?? "Canon")}</h1>
    <p class="lede">Requirements at a glance. ${stats.counts.stated + stats.counts.resolved} of ${stats.nodes} nodes are confirmed by the human; ${stats.counts.assumed + stats.counts.open + stats.counts.contested} still need a word from you.</p>
    ${tileGroups}
    <h2>Branches</h2>
    ${legend()}
    <table class="list" style="margin-top:8px">
      <thead><tr><th>ID</th><th>Requirement</th><th>Certainty mix</th><th class="num">Nodes</th><th class="num">Unconfirmed</th><th class="num">Findings</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <h2>Purpose</h2>
    <div class="card body">${snap.html.ROOT ?? ""}</div>`;
}

// ---------------------------------------------------------------- tree
function matches(n) {
  const q = ui.query.trim().toLowerCase();
  if (q && !(`${n.id} ${n.title}`.toLowerCase().includes(q))) return false;
  if (ui.filters.size && !ui.filters.has(n.state)) return false;
  if (ui.flaggedOnly && !findingsFor(n.id).some((f) => f.level !== "info")) return false;
  return true;
}
function tree(selectedId) {
  const active = ui.query.trim() || ui.filters.size || ui.flaggedOnly;
  const visible = new Set();
  if (active) {
    for (const n of Object.values(snap.canon.nodes)) if (matches(n)) { visible.add(n.id); let p = n.parent; while (p && node(p)) { visible.add(p); p = node(p).parent; } }
  }
  const li = (id) => {
    const n = node(id);
    if (active && !visible.has(id)) return "";
    const kids = n.children.filter((c) => !active || visible.has(c));
    const collapsed = !active && ui.collapsed.has(id);
    const flags = findingsFor(id).filter((f) => f.level !== "info").length;
    return `<li>
      <div class="node ${id === selectedId ? "selected" : ""} ${active && !matches(n) ? "dim" : ""}" data-id="${esc(id)}">
        <span class="tg ${kids.length ? "" : "leaf"}" data-toggle="${esc(id)}">${collapsed ? "▶" : "▼"}</span>
        <span class="id">${esc(id)}</span>
        <span class="t" title="${esc(n.title)}">${esc(n.title)}</span>
        ${flags ? `<span class="flag" title="${flags} findings">!</span>` : ""}
        ${n.layerExplicit && n.layer !== "requirement" ? `<span class="badge kind">${esc(n.layer)}</span>` : ""}
        ${n.kind ? `<span class="badge kind">${esc(n.kind)}</span>` : ""}
        ${badge(n.state)}
      </div>
      ${kids.length && !collapsed ? `<ul>${kids.map(li).join("")}</ul>` : ""}
    </li>`;
  };
  const chips = STATES.map((s) => `<button class="chip ${s} ${ui.filters.has(s) ? "on" : ""}" data-filter="${s}">${s} ${snap.stats.counts[s]}</button>`).join("");
  const graph = ui.graph;
  return `
    <div class="toolbar">
      <button class="btn ${graph ? "on" : ""}" data-mode="graph" title="The canon as a graph: containment plus the typed links">Graph</button>
      <button class="btn ${graph ? "" : "on"}" data-mode="list" title="The canon as a nested list">List</button>
      ${graph ? "" : `<input id="q" placeholder="Search id or title…" value="${esc(ui.query)}" />
      ${chips}
      <button class="chip flag ${ui.flaggedOnly ? "on" : ""}" data-flagged="1">! flagged</button>
      <button class="btn" data-expand="1">Expand all</button>
      <button class="btn" data-collapse="1">Collapse</button>`}
    </div>
    <div class="split">
      ${graph ? graphBlock(selectedId) : `<div class="tree"><ul>${snap.canon.roots.map(li).join("")}</ul></div>`}
      <div class="detail">${selectedId ? nodeDetail(selectedId) : `<p class="muted">Select a requirement to read it.</p><h3>Text tree</h3><pre class="tree-text">${esc(snap.textTree)}</pre>`}</div>
    </div>`;
}
// ---------------------------------------------------------------- graph: the canon is a DAG, one home per node plus typed links
/** The nodes worth drawing: with nothing selected, the top level and its children; with a selection, its
 *  ancestors, siblings, children and every node linked to it, plus their parents for context. */
function graphScope(selectedId) {
  const nodes = snap.canon.nodes;
  const show = new Set();
  const addWithParents = (id) => { let p = id; while (p && nodes[p] && !show.has(p)) { show.add(p); p = nodes[p].parent; } };
  if (selectedId && nodes[selectedId]) {
    const n = nodes[selectedId];
    addWithParents(selectedId);
    for (const s of (n.parent ? nodes[n.parent].children : snap.canon.roots)) show.add(s);
    for (const c of n.children) show.add(c);
    for (const t of [...n.requires, ...n.relates, ...n.conflicts]) addWithParents(t);
    for (const o of Object.values(nodes)) if ([...o.requires, ...o.relates, ...o.conflicts].includes(selectedId)) addWithParents(o.id);
  } else {
    for (const r of snap.canon.roots) show.add(r);
    const wide = snap.canon.roots.reduce((a, r) => a + nodes[r].children.length, 0) > 40;
    if (!wide) for (const r of snap.canon.roots) for (const c of nodes[r].children) show.add(c);
  }
  return show;
}
function graphBlock(selectedId) {
  const show = graphScope(selectedId);
  return `<div class="graph">
    <div class="legend graph-legend"><span>solid: contains</span><span>dashed: requires</span><span>dotted: relates</span><span>red: conflicts</span><span class="muted">${selectedId ? "the branch and links of " + esc(selectedId) : "the top levels"}; drag to pan, wheel to zoom, click a node to open it</span><button class="btn small" data-fit="1">Fit</button></div>
    <div id="cy" data-ids="${esc(JSON.stringify([...show]))}"></div>
  </div>`;
}
/** Draw the scoped canon on the canvas: a layered layout, nodes coloured by state, edges by kind. */
function buildGraph(selectedId) {
  const el = $main.querySelector("#cy");
  if (!el || !window.cytoscape) return;
  if (window.cytoscapeDagre && !buildGraph.registered) { window.cytoscape.use(window.cytoscapeDagre); buildGraph.registered = true; }
  const nodes = snap.canon.nodes;
  const show = new Set(JSON.parse(el.dataset.ids || "[]"));
  const elements = [];
  for (const id of show) {
    const n = nodes[id];
    const hidden = n.children.filter((c) => !show.has(c)).length;
    elements.push({ data: { id, label: `${id}
${n.title}${hidden ? ` (+${hidden})` : ""}`, state: n.state }, classes: id === selectedId ? "selected" : "" });
  }
  const edge = (s, t, kind) => elements.push({ data: { id: `${kind}:${s}>${t}`, source: s, target: t, kind, label: kind === "contains" ? "" : kind }, classes: kind });
  for (const id of show) {
    const n = nodes[id];
    if (n.parent && show.has(n.parent)) edge(n.parent, id, "contains");
    for (const t of n.requires) if (show.has(t)) edge(id, t, "requires");
    for (const t of n.relates) if (show.has(t) && (!nodes[t].relates.includes(id) || id < t)) edge(id, t, "relates");
    for (const t of n.conflicts) if (show.has(t) && (!nodes[t].conflicts.includes(id) || id < t)) edge(id, t, "conflicts");
  }
  const dark = matchMedia("(prefers-color-scheme: dark)").matches;
  const fill = { stated: "#dcfce7", resolved: "#dbeafe", assumed: "#fef3c7", open: "#ede9fe", contested: "#fee2e2" };
  const line = { stated: "#16a34a", resolved: "#2563eb", assumed: "#d97706", open: "#7c3aed", contested: "#dc2626" };
  const cy = window.cytoscape({
    container: el, elements, minZoom: 0.1, maxZoom: 3,
    style: [
      { selector: "node", style: { shape: "round-rectangle", width: 180, height: 56, label: "data(label)", "text-wrap": "wrap", "text-max-width": 164, "font-size": 11, "text-valign": "center", "text-halign": "center", "background-color": (e) => fill[e.data("state")] ?? "#eee", "border-color": (e) => line[e.data("state")] ?? "#999", "border-width": 1.5, color: "#1f2937" } },
      { selector: "node.selected", style: { "border-width": 4 } },
      { selector: "edge", style: { width: 1.5, "curve-style": "bezier", "line-color": dark ? "#6b7280" : "#9ca3af", "target-arrow-shape": "triangle", "target-arrow-color": dark ? "#6b7280" : "#9ca3af", "arrow-scale": 0.9, label: "data(label)", "font-size": 9, color: dark ? "#cbd5e1" : "#475569", "text-background-color": dark ? "#171b21" : "#ffffff", "text-background-opacity": 1, "text-background-padding": "2px" } },
      { selector: "edge.requires", style: { "line-style": "dashed", "line-color": "#2563eb", "target-arrow-color": "#2563eb" } },
      { selector: "edge.relates", style: { "line-style": "dotted", "target-arrow-shape": "none", "line-color": "#7c3aed" } },
      { selector: "edge.conflicts", style: { "line-style": "dotted", "line-color": "#dc2626", "target-arrow-shape": "tee", "source-arrow-shape": "tee", "source-arrow-color": "#dc2626", "target-arrow-color": "#dc2626" } },
    ],
    layout: window.cytoscapeDagre ? { name: "dagre", rankDir: "TB", nodeSep: 24, rankSep: 60, edgeSep: 10, padding: 20 } : { name: "breadthfirst", directed: true, padding: 20 },
  });
  cy.on("tap", "node", (e) => { location.hash = `#/node/${e.target.id()}`; });
  $main.querySelector("[data-fit]")?.addEventListener("click", () => cy.fit(undefined, 20));
  cy.ready(() => { cy.fit(undefined, 20); if (selectedId && cy.getElementById(selectedId).length) cy.center(cy.getElementById(selectedId)); });
  window.__cy = cy;
}
function nodeDetail(id) {
  const n = node(id);
  if (!n) return `<p class="empty">No requirement with id ${esc(id)}.</p>`;
  const crumbs = []; let p = n.parent; while (p && node(p)) { crumbs.unshift(`<a href="#/node/${esc(p)}">${esc(p)}</a>`); p = node(p).parent; }
  const kids = n.children.map((c) => `<li>${idLink(c)} ${esc(node(c).title)} ${badge(node(c).state)}</li>`).join("");
  const decs = decisionsFor(id).map((d) => `<li>${idLink(d.id)} ${esc(d.title)} ${badge(d.state)}${d.origin ? ` <span class="badge origin">${esc(d.origin)}</span>` : ""}</li>`).join("");
  const steps = stepsFor(id).map(({ j, s }) => `<li><a href="#/journey/${esc(j.id)}">${esc(j.id)}/${esc(s.id)}</a> ${esc(s.label)} <span class="muted">in ${esc(j.title)}</span></li>`).join("");
  const fs = findingsFor(id).map((f) => `<li>${badge(f.level)} ${esc(f.message)}</li>`).join("");
  const sub = descendants(id);
  const html = snap.html[id] ?? "";
  return `
    <div class="crumbs">${crumbs.length ? crumbs.join(" › ") + " ›" : "top level"}</div>
    <h1>${esc(n.title)}</h1>
    <div class="row"><span class="id">${esc(n.id)}</span> ${badge(n.state)} <span class="badge kind" title="${n.layerExplicit ? "from the layer field" : "inferred from depth"}">${esc(n.layer)}${n.layerExplicit ? "" : " (inferred)"}</span> ${n.kind ? `<span class="badge kind">${esc(n.kind)}</span>` : `<span class="badge kind">not yet measurable</span>`} <a class="sub" href="#/tree/${esc(id)}">focus in tree</a></div>
    <dl class="meta">
      <dt>File</dt><dd class="mono">canon/${esc(n.file)}</dd>
      ${n.source ? `<dt>Source</dt><dd class="mono">${esc(n.source)}</dd>` : ""}
      ${n.partition ? `<dt>Children by</dt><dd>${esc(n.partition)}</dd>` : ""}
      ${n.relates.length ? `<dt>Relates to</dt><dd>${n.relates.map(idLink).join(", ")}</dd>` : ""}
      ${n.conflicts.length ? `<dt>Conflicts with</dt><dd>${n.conflicts.map(idLink).join(", ")}</dd>` : ""}
      ${n.requires.length ? `<dt>Requires</dt><dd>${n.requires.map(idLink).join(", ")}</dd>` : ""}
      ${requiredBy(id).length ? `<dt>Required by</dt><dd>${requiredBy(id).map(idLink).join(", ")}</dd>` : ""}
      ${n.files.length ? `<dt>Files</dt><dd class="mono">${n.files.map(esc).join(", ")}</dd>` : ""}
      ${n.steps.length ? `<dt>Steps</dt><dd>${n.steps.map(idLink).join(", ")}</dd>` : ""}
      ${n.baseline ? `<dt>Baseline</dt><dd>${esc(n.baseline)}</dd>` : ""}
      ${sub.length ? `<dt>Subtree</dt><dd>${sub.length} nodes ${bar(countBy(sub), sub.length)}</dd>` : ""}
    </dl>
    <div class="row node-actions">
      <button class="btn small" data-refine="${esc(id)}" title="Ask the session to define this branch next">Define this branch</button>
      <button class="btn small" data-edit="${esc(id)}" title="Edit this node's file">Edit</button>
      <button class="btn small" data-newchild="${esc(id)}" title="Add a child node under this one">New child</button>
    </div>
    <div id="node-editor" class="editor"></div>
    <div class="body">${markSections(html)}</div>
    <div class="related">
      ${kids ? `<h3>Children</h3><ul>${kids}</ul>` : ""}
      ${decs ? `<h3>Decisions resting on this</h3><ul>${decs}</ul>` : ""}
      ${steps ? `<h3>Journey steps</h3><ul>${steps}</ul>` : ""}
      ${fs ? `<h3>Findings</h3><ul>${fs}</ul>` : ""}
    </div>`;
}
/** Turn `<h2>Not this [assumed]</h2>` into a heading with a state badge. */
function markSections(html) {
  return html.replace(/<h2>(.*?)\s*\[(stated|assumed|open|contested|resolved)\]<\/h2>/g, (_, h, s) => `<h2>${h}<span class="badge ${s} sec-mark">${s}</span></h2>`);
}

// ---------------------------------------------------------------- health
function health() {
  const sorted = [...snap.health].sort((a, b) => b.errors - a.errors || b.warnings - a.warnings || b.unconfirmedShare - a.unconfirmedShare);
  const cards = sorted.map((b) => {
    const problems = snap.findings.filter((f) => f.branch === b.id && f.level !== "info");
    const kids = [b.id, ...descendants(b.id)].filter((id) => UNCONFIRMED.has(node(id).state));
    return `<div class="card">
      <div class="row spread"><div><span class="id">${esc(b.id)}</span> <b>${esc(b.title)}</b> ${badge(b.state)}</div>
        <div class="row">${b.errors ? `<span class="badge error">${b.errors} errors</span>` : ""}${b.warnings ? `<span class="badge warn">${b.warnings} warnings</span>` : ""}<span class="muted">${b.size} nodes · ${Math.round(b.unconfirmedShare * 100)}% unconfirmed · ${b.unrefined} not yet measurable</span></div></div>
      <div style="margin:8px 0">${bar(b.counts, b.size)}</div>
      ${problems.length ? `<ul>${problems.map((f) => `<li>${badge(f.level)} ${f.id ? idLink(f.id) + " " : ""}${esc(f.message)}</li>`).join("")}</ul>` : ""}
      ${kids.length ? `<details><summary>${kids.length} unconfirmed nodes</summary><ul>${kids.map((id) => `<li>${idLink(id)} ${esc(node(id).title)} ${badge(node(id).state)}</li>`).join("")}</ul></details>` : ""}
    </div>`;
  }).join("");
  const chips = ["error", "warn", "info"].map((l) => `<button class="chip ${l === "error" ? "contested" : l === "warn" ? "assumed" : "open"} ${ui.levels.has(l) ? "on" : ""}" data-level="${l}">${l} ${snap.findings.filter((f) => f.level === l).length}</button>`).join("");
  const list = snap.findings.filter((f) => ui.levels.has(f.level)).map((f) => `<div class="finding"><div>${badge(f.level)}</div><div>${f.id ? idLink(f.id) + " " : ""}${esc(f.message)}<div class="code">${esc(f.code)}${f.file ? ` · canon/${esc(f.file)}` : ""}</div></div></div>`).join("");
  return `
    <h1>Problematic branches</h1>
    <p class="lede">Branches sorted by errors, then warnings, then the share of nodes that are assumed, open or contested. Errors are broken structure or links. Warnings need a decision from you. Notes are things to know.</p>
    ${legend()}
    <div style="margin-top:10px">${cards}</div>
    <h2>All findings</h2>
    <div class="toolbar">${chips}</div>
    <div class="card" style="padding:0">${list || `<p class="empty" style="padding:12px">No findings at these levels.</p>`}</div>`;
}

// ---------------------------------------------------------------- attention
function commitCard(c) {
  const ops = c.trailers["Intent-Change"] ?? [];
  const byOp = {}; for (const o of ops) { const k = o.split(/\s+/)[0]; byOp[k] = (byOp[k] ?? 0) + 1; }
  const refs = c.refs.filter((r) => !r.startsWith("HEAD")).map((r) => `<span class="badge kind">${esc(r)}</span>`).join(" ");
  return `<div class="commit">
    <div class="row spread"><div class="subj">${esc(c.subject)}</div><div class="row"><span class="id">${esc(c.short)}</span> ${refs} ${c.onMain ? badge("resolved") : `<span class="badge assumed">not on main</span>`}</div></div>
    <div class="ops">
      ${Object.entries(byOp).map(([k, v]) => `<span class="badge kind">${v} ${esc(k)}</span>`).join("")}
      ${(c.trailers["Decision"] ?? []).map((d) => `<span class="badge origin">${idLink(d)}</span>`).join("")}
      ${(c.trailers["Intent"] ?? []).map((i) => `<span class="badge kind">Intent: ${esc(i)}</span>`).join("")}
    </div>
    ${(c.trailers["Approved-By"] ?? []).map((a) => `<div class="muted">Approved-By: ${esc(a)}</div>`).join("")}
    ${ops.length ? `<details><summary>${ops.length} intent changes</summary><ul class="ops-list">${ops.map((o) => { const [op, id] = o.split(/\s+/); return `<li>${esc(op)} ${idLink(id ?? "")}</li>`; }).join("")}</ul></details>` : ""}
  </div>`;
}
function attention() {
  const a = attentionItems();
  const section = (title, items, body, hint = "") => `
    <div class="section-head"><h2>${title}</h2><span class="count">${items.length}</span></div>
    ${hint ? `<p class="muted" style="margin-top:0">${hint}</p>` : ""}
    ${items.length ? body : `<p class="empty">None.</p>`}`;
  const byBranch = {};
  for (const n of a.assumed) (byBranch[branchOf(n.id)] ??= []).push(n);
  return `
    <h1>Changes that need your attention</h1>
    <p class="lede">Intent never changes silently. Everything here is waiting on a word from you, ordered by how much it blocks.${snap.git.error ? ` <span class="badge warn">git: ${esc(snap.git.error)}</span>` : ""}</p>
    ${section("Pending approvals", a.pending, a.pending.map(commitCard).join(""), "Commits whose Approved-By trailer says pending. Merging their branch into main is the approval.")}
    ${section("Unmerged intent changes", a.unmerged, a.unmerged.map(commitCard).join(""), "Commits not on main that create, update or delete canon nodes.")}
    ${section("Uncommitted canon edits", a.uncommitted, `<div class="card"><pre>${esc(a.uncommitted.join("\n"))}</pre></div>`, "Changes to canon files in the working tree that no commit records yet.")}
    ${section("Broken structure", a.errors, `<div class="card" style="padding:0">${a.errors.map((f) => `<div class="finding"><div>${badge("error")}</div><div>${f.id ? idLink(f.id) + " " : ""}${esc(f.message)}</div></div>`).join("")}</div>`)}
    ${section("Contested", a.contested, `<div class="card"><ul>${a.contested.map((n) => `<li>${idLink(n.id)} ${esc(n.title)} ${badge(n.state)}</li>`).join("")}</ul></div>`, "You and the agent disagree. The disagreement is recorded in the node.")}
    ${section("Open questions", a.open, `<div class="card"><ul>${a.open.map((n) => `<li>${idLink(n.id)} ${esc(n.title)}</li>`).join("")}</ul></div>`)}
    ${section("Decisions awaiting confirmation", a.assumedDecisions, `<div class="card"><ul>${a.assumedDecisions.map((d) => `<li>${idLink(d.id)} ${esc(d.title)}${d.origin ? ` <span class="badge origin">${esc(d.origin)}</span>` : ""} <span class="muted">serves ${d.intents.map(idLink).join(", ")}</span></li>`).join("")}</ul></div>`, "The agent made these choices; say yes, or contest them.")}
    ${section("Assumed requirements", a.assumed, Object.entries(byBranch).map(([b, ns]) => `<details class="card"><summary>${esc(b)} ${esc(node(b)?.title ?? "")} · ${ns.length}</summary><ul>${ns.map((n) => `<li>${idLink(n.id)} ${esc(n.title)}</li>`).join("")}</ul></details>`).join(""), "The agent's interpretation, not yet confirmed. These do not block work, but an assumption carrying many decisions is a signal to ask.")}
    ${section("Glossary terms awaiting confirmation", a.terms, `<p><a href="#/glossary">${a.terms.length} terms</a> are the agent's definitions until you confirm them.</p>`)}`;
}

// ---------------------------------------------------------------- journeys, decisions, glossary
function journeys(focus) {
  const list = focus ? snap.canon.journeys.filter((j) => j.id === focus) : snap.canon.journeys;
  const cards = list.map((j) => `
    <div class="card" id="${esc(j.id)}">
      <div class="row"><span class="id">${esc(j.id)}</span><h3 style="margin:0">${esc(j.title)}</h3> ${badge(j.state)} ${j.source ? `<span class="muted mono">${esc(j.source)}</span>` : ""}</div>
      ${j.mermaid ? `<pre class="mermaid">${esc(j.mermaid)}</pre>` : ""}
      <table class="list"><thead><tr><th>Step</th><th>State</th><th>Linked requirements</th></tr></thead><tbody>
        ${j.steps.map((s) => `<tr><td><span class="id">${esc(s.id)}</span> ${esc(s.label)}</td><td>${badge(s.state)}</td><td>${s.requirements.map((r) => `${idLink(r)}${node(r) ? ` <span class="muted">${esc(node(r).title)}</span>` : ` <span class="badge error">missing</span>`}`).join("<br>")}</td></tr>`).join("")}
      </tbody></table>
      <div class="body" style="margin-top:10px">${snap.html[j.id] ?? ""}</div>
    </div>`).join("");
  return `<h1>Journeys</h1><p class="lede">How the user envisions the product working. Intent records, not tests.${focus ? ` <a href="#/journeys">all journeys</a>` : ""}</p>${cards || `<p class="empty">No journeys.</p>`}`;
}
function decisions(focus) {
  if (focus) {
    const d = snap.canon.decisions.find((x) => x.id === focus);
    if (!d) return `<p class="empty">No decision ${esc(focus)}.</p>`;
    return `<a class="sub" href="#/decisions">all decisions</a>
      <h1>${esc(d.title)}</h1>
      <div class="row"><span class="id">${esc(d.id)}</span> ${badge(d.state)} ${d.origin ? `<span class="badge origin">origin: ${esc(d.origin)}</span>` : ""} ${d.date ? `<span class="muted">${esc(d.date)}</span>` : ""}</div>
      <dl class="meta" style="margin:12px 0"><dt>Serves</dt><dd>${d.intents.map((i) => `${idLink(i)} ${node(i) ? esc(node(i).title) : ""}`).join("<br>")}</dd><dt>File</dt><dd class="mono">canon/${esc(d.file)}</dd></dl>
      <div class="card body">${snap.html[d.id] ?? ""}</div>`;
  }
  const rows = snap.canon.decisions.map((d) => `<tr class="click" data-href="#/decision/${esc(d.id)}"><td class="id">${esc(d.id)}</td><td>${esc(d.title)}</td><td>${badge(d.state)}</td><td>${d.origin ? `<span class="badge origin">${esc(d.origin)}</span>` : ""}</td><td>${d.intents.map(idLink).join(", ")}</td><td class="muted">${esc(d.date ?? "")}</td></tr>`).join("");
  return `<h1>Decisions</h1><p class="lede">Short-term implementation choices, each linked to the intent it serves. A decision with an origin is a caught divergence.</p>
    <table class="list"><thead><tr><th>ID</th><th>Decision</th><th>State</th><th>Origin</th><th>Serves</th><th>Date</th></tr></thead><tbody>${rows}</tbody></table>`;
}
function glossary() {
  return `<h1>Glossary</h1><p class="lede">What the human means when they say X. Every term here is assumed until confirmed.</p>
    <table class="list"><thead><tr><th>Term</th><th>ID</th><th>Definition</th></tr></thead><tbody>
    ${snap.canon.terms.map((t) => `<tr><td><b>${esc(t.term)}</b></td><td class="id">${esc(t.id)}</td><td>${esc(t.definition)}</td></tr>`).join("")}
    </tbody></table>`;
}

// ---------------------------------------------------------------- events
function afterRender(view) {
  for (const tr of $main.querySelectorAll("tr.click")) tr.addEventListener("click", () => (location.hash = tr.dataset.href));
  if (view === "tree" || view === "node") {
    const q = $main.querySelector("#q");
    q?.addEventListener("input", () => { ui.query = q.value; const pos = q.selectionStart; render(); const nq = $main.querySelector("#q"); nq.focus(); nq.setSelectionRange(pos, pos); });
    for (const b of $main.querySelectorAll("[data-filter]")) b.addEventListener("click", () => { const s = b.dataset.filter; ui.filters.has(s) ? ui.filters.delete(s) : ui.filters.add(s); render(); });
    $main.querySelector("[data-flagged]")?.addEventListener("click", () => { ui.flaggedOnly = !ui.flaggedOnly; render(); });
    $main.querySelector("[data-expand]")?.addEventListener("click", () => { ui.collapsed.clear(); render(); });
    $main.querySelector("[data-collapse]")?.addEventListener("click", () => { for (const n of Object.values(snap.canon.nodes)) if (n.children.length) ui.collapsed.add(n.id); render(); });
    for (const t of $main.querySelectorAll("[data-toggle]")) t.addEventListener("click", (e) => { e.stopPropagation(); const id = t.dataset.toggle; ui.collapsed.has(id) ? ui.collapsed.delete(id) : ui.collapsed.add(id); render(); });
    for (const n of $main.querySelectorAll(".node")) n.addEventListener("click", () => { const id = n.dataset.id; let p = id; while (p) { ui.collapsed.delete(p); p = node(p)?.parent; } location.hash = `#/node/${id}`; });
    const sel = $main.querySelector(".node.selected");
    sel?.scrollIntoView({ block: "nearest" });
    for (const b of $main.querySelectorAll("[data-mode]")) b.addEventListener("click", () => { ui.graph = b.dataset.mode === "graph"; try { localStorage.setItem("hc-tree-mode", ui.graph ? "graph" : "list"); } catch {} render(); });
    wireNodeActions();
  }
  if (view === "health") for (const b of $main.querySelectorAll("[data-level]")) b.addEventListener("click", () => { const l = b.dataset.level; ui.levels.has(l) ? ui.levels.delete(l) : ui.levels.add(l); render(); });
  if ((view === "tree" || view === "node") && ui.graph) buildGraph(route().arg);
  if (view === "adopt") { buildAdoptCanvas(); openSession(); }
  const diagrams = $main.querySelectorAll(".mermaid");
  if (diagrams.length && window.mermaid) {
    const dark = matchMedia("(prefers-color-scheme: dark)").matches;
    window.mermaid.initialize({ startOnLoad: false, theme: dark ? "dark" : "neutral", securityLevel: "strict" });
    window.mermaid.run({ nodes: diagrams }).catch((e) => console.warn("mermaid", e));
  }
}

document.getElementById("refresh").addEventListener("click", async () => { await load().catch(showError); render(); });
window.addEventListener("hashchange", render);
function showError(e) { $main.innerHTML = `<div class="card"><b>Could not load the canon.</b><pre>${esc(e.stack ?? e.message ?? e)}</pre></div>`; }

// ---------------------------------------------------------------- node actions: define, edit, create
async function post(url, body, method = "POST") {
  const r = await fetch(url, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `${r.status}`);
  return j;
}
function wireNodeActions() {
  const editor = $main.querySelector("#node-editor");
  for (const b of $main.querySelectorAll("[data-refine]")) b.addEventListener("click", async () => {
    await post("/api/refine", { id: b.dataset.refine }).catch(showToast);
    showToast(`Asked the session to define ${b.dataset.refine} next.`);
  });
  for (const b of $main.querySelectorAll("[data-edit]")) b.addEventListener("click", async () => {
    const id = b.dataset.edit;
    const raw = await fetch(`/api/node/${encodeURIComponent(id)}/raw`).then((r) => r.json());
    editor.innerHTML = `<p class="sub">Editing <span class="mono">canon/${esc(raw.path)}</span>. Keep the front-matter id.</p>
      <textarea id="edit-text" rows="18">${esc(raw.text)}</textarea>
      <div class="row"><button class="btn" id="edit-save">Save</button><button class="btn" id="edit-cancel">Cancel</button></div>`;
    editor.querySelector("#edit-cancel").addEventListener("click", () => (editor.innerHTML = ""));
    editor.querySelector("#edit-save").addEventListener("click", async () => {
      try { await post(`/api/node/${encodeURIComponent(id)}`, { text: editor.querySelector("#edit-text").value }, "PUT"); editor.innerHTML = ""; await load(); render(); showToast(`Saved ${id}; the session will read it.`); }
      catch (e) { showToast(e); }
    });
  });
  for (const b of $main.querySelectorAll("[data-newchild]")) b.addEventListener("click", () => {
    const parent = b.dataset.newchild;
    editor.innerHTML = `<p class="sub">New child under <span class="id">${esc(parent)}</span>. Your words are recorded as stated.</p>
      <input id="new-title" placeholder="Title, in plain words" />
      <textarea id="new-intent" rows="4" placeholder="What must hold, in your words (one or two sentences)"></textarea>
      <div class="row"><button class="btn" id="new-create">Create</button><button class="btn" id="new-cancel">Cancel</button></div>`;
    editor.querySelector("#new-cancel").addEventListener("click", () => (editor.innerHTML = ""));
    editor.querySelector("#new-create").addEventListener("click", async () => {
      try {
        const r = await post("/api/node", { parent, title: editor.querySelector("#new-title").value, intent: editor.querySelector("#new-intent").value });
        await load(); location.hash = `#/node/${r.id}`; showToast(`Created ${r.id}; the session will read it.`);
      } catch (e) { showToast(e); }
    });
  });
}
function showToast(msg) {
  const li = document.createElement("li");
  li.textContent = typeof msg === "string" ? msg : (msg.message || String(msg));
  const list = document.getElementById("activity");
  list.prepend(li);
  while (list.children.length > 6) list.lastChild.remove();
  openSession();
}

// ---------------------------------------------------------------- session panel: questions from the agent, jargon gate, focus, messages
const $session = document.getElementById("session");
const $question = document.getElementById("question");
const $tooltip = document.getElementById("tooltip");
let shownQuestionId = null, lastFocusSeq = 0, lastCursor = 0, termState = {};
function setToggle(collapsed) {
  const b = document.getElementById("session-toggle");
  b.textContent = collapsed ? "Open" : "✕";
  b.title = collapsed ? "Open the session panel" : "Close the panel; it opens again when a question arrives";
}
function openSession() { $session.classList.remove("collapsed"); setToggle(false); }
document.getElementById("session-toggle").addEventListener("click", () => setToggle($session.classList.toggle("collapsed")));
document.getElementById("msg-send").addEventListener("click", async () => {
  const ta = document.getElementById("msg");
  if (!ta.value.trim()) return;
  await post("/api/message", { text: ta.value }).catch(showToast);
  showToast(`Sent: ${ta.value.trim().slice(0, 80)}`);
  ta.value = "";
});
async function pollSession() {
  try {
    const s = await fetch("/api/session", { cache: "no-store" }).then((r) => r.json());
    const pill = document.getElementById("session-pending");
    pill.textContent = s.pending; pill.hidden = s.pending === 0;
    document.getElementById("session-status").textContent = s.question ? `waiting on you: ${s.question.header}` : "no question waiting";
    if (s.focus && s.focus.seq !== lastFocusSeq) {
      lastFocusSeq = s.focus.seq;
      if (s.focus.id) {
        if (route().view === "adopt") { adoptState.selected = s.focus.id; if (s.focus.id !== "ROOT") expandTo(s.focus.id); location.hash = `#/adopt/${s.focus.id}`; render(); if (s.focus.open) openPopup(s.focus.id); }
        else location.hash = s.focus.id === "ROOT" ? "#/" : `#/node/${s.focus.id}`;
      }
    }
    if (s.question && s.question.id !== shownQuestionId) { shownQuestionId = s.question.id; termState = {}; renderQuestion(s.question, s.pending); openSession(); }
    if (!s.question && shownQuestionId) { shownQuestionId = null; showWorking(); }
    if (!s.question && working) { document.getElementById("session-status").textContent = `session working · ${elapsed()}`; const el = document.getElementById("work-elapsed"); if (el) el.textContent = elapsed(); }
    // While a draft is being written there is no feed entry per file; on the Adopt view, re-read the canon
    // every few seconds and redraw when nodes appeared, so the progress strip and the canvas grow with it.
    if (route().view === "adopt" && !s.question && (pollSession.tick = (pollSession.tick ?? 0) + 1) % 3 === 0) {
      const fresh = await fetch("/api/snapshot", { cache: "no-store" }).then((r) => r.json()).catch(() => null);
      if (fresh && (fresh.stats.nodes !== snap.stats.nodes || fresh.canon.decisions.length !== snap.canon.decisions.length || Boolean(fresh.canon.root) !== Boolean(snap.canon.root))) { snap = fresh; for (const n of Object.values(snap.canon.nodes)) { n.requires ??= []; n.relates ??= []; n.conflicts ??= []; } if ($popup.hidden) render(); else { const strip = $main.querySelector(".progress"); if (strip) strip.outerHTML = progressStrip(); } }
    }
    if (s.cursor !== lastCursor) {
      lastCursor = s.cursor;
      const c = await fetch(`/api/changes?since=${chatCursor}`, { cache: "no-store" }).then((r) => r.json()).catch(() => null);
      if (c) { chatCursor = c.cursor; appendChat(c.entries); if (c.entries.some((e) => e.kind === "say")) { working = null; if (!s.question) { $question.innerHTML = `<p class="muted">Waiting for you. Open a box on the canvas, or write below.</p>`; document.getElementById("session-status").textContent = "no question waiting"; } openSession(); } }
      if (shownQuestionId === null) { await load().catch(() => {}); if (route().view !== "tree" && route().view !== "node") render(); }
    }
  } catch (e) { /* server away; try again */ }
  setTimeout(pollSession, 2000);
}
// Between questions: the session is reading, writing or thinking; show that it is, and for how long.
let working = null;
const elapsed = () => { const s = Math.floor((Date.now() - (working?.since ?? Date.now())) / 1000); return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`; };
function showWorking(what) {
  if (!working) working = { since: Date.now(), answer: "" };
  $question.innerHTML = `
    <div class="working"><span class="spinner"></span><div><b>The session is working${what ? ` since ${esc(what)}` : ""}.</b> What it says or asks next appears here. <span class="muted" id="work-elapsed">${elapsed()}</span></div></div>
    ${working.answer ? `<p class="muted">You answered: <b>${esc(working.answer.slice(0, 200))}</b></p>` : ""}`;
}
function renderQuestion(q, pending = 1) {
  working = null;
  // An option reads as ID, title, then description. The ID links to the node's page when the node
  // exists, and the link sits outside the label so following it does not toggle the box.
  const opts = q.options.map((o, i) => {
    const m = /^((?:REQ|JRN|DEC|PRN|TERM)-\S+)\s+(.+)$/.exec(o.label);
    const head = m ? `${idLink(m[1])} <label for="opt-${i}"><b>${esc(m[2])}</b></label>` : `<label for="opt-${i}"><b>${esc(o.label)}</b></label>`;
    const desc = o.html ? `<label for="opt-${i}" class="opt-desc">${o.html}</label>` : o.description ? `<label for="opt-${i}" class="opt-desc">${esc(o.description)}</label>` : "";
    return `<div class="opt"><input type="${q.multiSelect ? "checkbox" : "radio"}" id="opt-${i}" name="opt" value="${esc(o.label)}" ${!q.multiSelect && i === 0 ? "checked" : ""}/> <span class="opt-text"><span class="opt-head">${head}</span>${desc}</span></div>`;
  }).join("");
  $question.innerHTML = `
    ${q.notice ? `<p class="notice"><b>Note from the session:</b> ${esc(q.notice)}</p>` : ""}
    <div class="q-head"><span class="badge kind">${esc(q.header)}</span>${q.nodeId ? ` ${idLink(q.nodeId)}` : ""}${pending > 1 ? ` <span class="muted">${pending - 1} more after this</span>` : ""}</div>
    <div class="q-body body">${q.html}</div>
    ${q.terms.length ? `<p class="sub q-terms">Terms in this draft that the glossary does not define are marked; hover each one and keep or drop it before answering.</p>` : ""}
    <div class="opts" id="q-opts">${opts}</div>
    <div id="q-free" hidden><textarea id="q-other" rows="3" placeholder="Your own wording, or a correction. This replaces the options above."></textarea></div>
    <div class="row"><button class="btn" id="q-submit">Answer</button><button class="btn small" id="q-mode">Other: correct or rewrite instead</button><span class="sub" id="q-hint"></span></div>`;
  // One answer shape at a time: the options, or typed text that replaces them. Never both.
  $question.querySelector("#q-mode").addEventListener("click", () => {
    const free = $question.querySelector("#q-free"), optsEl = $question.querySelector("#q-opts"), mode = $question.querySelector("#q-mode");
    const toFree = free.hidden;
    free.hidden = !toFree; optsEl.hidden = toFree;
    if (toFree) { for (const i of optsEl.querySelectorAll("input")) i.checked = false; free.querySelector("textarea").focus(); } else free.querySelector("textarea").value = "";
    mode.textContent = toFree ? "Back to the options" : "Other: correct or rewrite instead";
  });
  for (const span of $question.querySelectorAll(".jargon")) {
    span.addEventListener("mouseenter", () => showTooltip(span, q));
    span.addEventListener("click", (e) => { e.preventDefault(); showTooltip(span, q, true); });
  }
  $question.querySelector("#q-submit").addEventListener("click", () => submitAnswer(q));
  updateSubmit(q);
}
function updateSubmit(q) {
  const unresolved = q.terms.filter((t) => !termState[t.term.toLowerCase()]);
  const btn = $question.querySelector("#q-submit"), hint = $question.querySelector("#q-hint");
  if (!btn) return;
  btn.disabled = unresolved.length > 0;
  hint.textContent = unresolved.length ? `${unresolved.length} term${unresolved.length > 1 ? "s" : ""} to keep or drop first: ${unresolved.map((t) => t.term).join(", ")}` : "";
  for (const span of $question.querySelectorAll(".jargon")) {
    const st = termState[span.dataset.term.toLowerCase()];
    span.classList.toggle("kept", st?.decision === "keep");
    span.classList.toggle("dropped", st?.decision === "drop");
    if (st?.decision === "drop" && st.replacement) span.title = `replaced by: ${st.replacement}`;
  }
}
let tooltipPinned = false;
function showTooltip(span, q, pinned = false) {
  tooltipPinned = pinned || tooltipPinned && $tooltip.dataset.term === span.dataset.term;
  $tooltip.dataset.term = span.dataset.term;
  const term = span.dataset.term;
  const guess = q.terms.find((t) => t.term.toLowerCase() === term.toLowerCase());
  if (!guess) return;
  const st = termState[term.toLowerCase()];
  $tooltip.innerHTML = `<div class="tt-term">${esc(term)}</div><div class="tt-def">${esc(guess.definition)}</div>
    ${st ? `<div class="sub">${st.decision === "keep" ? "In the glossary." : `Dropped${st.replacement ? `, use "${esc(st.replacement)}"` : ""}.`}</div>` : `
    <div class="row"><button class="btn small ok" data-keep>✓ Keep, enshrine in the glossary</button><button class="btn small no" data-drop>✗ Drop</button></div>
    <div class="tt-replace" hidden><input placeholder="Word to use instead" /><button class="btn small" data-replace>Use this</button></div>`}`;
  $tooltip.hidden = false;
  const r = span.getBoundingClientRect();
  $tooltip.style.left = `${Math.min(r.left, window.innerWidth - 340)}px`;
  $tooltip.style.top = `${r.bottom + 6 + window.scrollY}px`;
  const hide = () => { if (!tooltipPinned && !$tooltip.matches(":hover")) $tooltip.hidden = true; };
  span.addEventListener("mouseleave", () => setTimeout(hide, 250), { once: true });
  $tooltip.onmouseleave = () => { if (!tooltipPinned) $tooltip.hidden = true; };
  $tooltip.querySelector("[data-keep]")?.addEventListener("click", async () => {
    await post("/api/term", { term, definition: guess.definition, decision: "keep" }).catch(showToast);
    termState[term.toLowerCase()] = { term, decision: "keep", definition: guess.definition };
    $tooltip.hidden = true; updateSubmit(q); showToast(`"${term}" enshrined in the glossary.`);
  });
  $tooltip.querySelector("[data-drop]")?.addEventListener("click", () => {
    $tooltip.querySelector(".tt-replace").hidden = false;
    $tooltip.querySelector(".tt-replace input").focus();
  });
  $tooltip.querySelector("[data-replace]")?.addEventListener("click", async () => {
    const replacement = $tooltip.querySelector(".tt-replace input").value.trim();
    await post("/api/term", { term, decision: "drop", replacement }).catch(showToast);
    termState[term.toLowerCase()] = { term, decision: "drop", replacement };
    $tooltip.hidden = true; updateSubmit(q); showToast(`"${term}" dropped${replacement ? `; use "${replacement}"` : ""}.`);
  });
}
async function submitAnswer(q) {
  const selected = [...$question.querySelectorAll("input[name=opt]:checked")].map((i) => i.value);
  const freeMode = !$question.querySelector("#q-free").hidden;
  const other = freeMode ? $question.querySelector("#q-other").value.trim() : "";
  if (freeMode && !other) { showToast("Type your wording or correction, or go back to the options."); return; }
  if (!freeMode && !selected.length && !q.multiSelect) { showToast("Pick an option, or switch to a correction."); return; }
  const terms = Object.values(termState);
  try {
    await post("/api/answer", { questionId: q.id, selected: freeMode ? [] : selected, other, terms });
    working = { since: Date.now(), answer: other ? `Other: ${other}` : selected.join(", ") };
    shownQuestionId = null;
    showWorking();
  } catch (e) { showToast(e); }
}
document.addEventListener("click", (e) => { if (!$tooltip.contains(e.target) && !e.target.classList?.contains("jargon")) { $tooltip.hidden = true; tooltipPinned = false; } });

// ---------------------------------------------------------------- adopt: the canvas for reviewing a drafted canon
// Green: the human approved it (stated or resolved). Yellow: the session's guess (assumed). Red: it needs the
// human before adoption can finish: open (the session would not guess), contested, or a check flagged it.
// Boxes start as plain circles; a click shows a node's name, a double-click or its ↗ opens the card.
const adoptState = { expanded: null, selected: null, labelled: new Set(), labels: false, deps: true, edges: true, view: null };
function colorOf(id) {
  if (id === "ROOT" || id === "PRINCIPLES" || id.startsWith("PRN-")) { const s = snap.canon.root?.state; return s === "stated" || s === "resolved" ? "green" : "yellow"; }
  const n = node(id);
  if (!n) return "yellow";
  if (n.state === "open" || n.state === "contested") return "red";
  if (findingsFor(id).some((f) => f.level !== "info")) return "red";
  return n.state === "stated" || n.state === "resolved" ? "green" : "yellow";
}
function ensureExpanded() {
  if (adoptState.expanded) return;
  adoptState.expanded = new Set(["ROOT", ...snap.canon.roots]);
}
function adoptScope() {
  ensureExpanded();
  const show = ["ROOT", "PRINCIPLES", ...snap.canon.roots];
  if (adoptState.expanded.has("PRINCIPLES")) for (const p of snap.canon.principles) show.push(p.id);
  const visit = (id) => { if (!adoptState.expanded.has(id)) return; for (const c of node(id).children) { show.push(c); visit(c); } };
  for (const r of snap.canon.roots) visit(r);
  return show;
}
function adoptCounts() {
  const c = { green: 0, yellow: 0, red: 0 };
  for (const id of Object.keys(snap.canon.nodes)) c[colorOf(id)]++;
  return c;
}
function adopt(selectedId) {
  if (selectedId) adoptState.selected = selectedId;
  const c = adoptCounts();
  return `<div class="adopt">
    <div class="toolbar adopt-bar">
      <span class="legend"><span><i class="sw green"></i>approved ${c.green}</span><span><i class="sw yellow"></i>guessed ${c.yellow}</span><span><i class="sw red"></i>needs you ${c.red}</span></span>
      <span class="muted">click a circle for its name; double-click or ↗ opens it; the handle below shows its children; drag to pan, wheel to zoom</span>
      <button class="btn small ${adoptState.labels ? "on" : ""}" data-labels="1" title="Show or hide every name">Names</button>
      <button class="btn small ${adoptState.deps ? "on" : ""}" data-deps="1" title="Show or hide the requires and conflicts links">Dependencies</button>
      <button class="btn small ${adoptState.edges ? "on" : ""}" data-edges="1" title="Show or hide every line">Edges</button>
      <button class="btn small" data-fit="1">Fit</button>
      <button class="btn small" data-expand-all="1">Show all</button>
      <button class="btn ${c.red ? "" : "primary"}" data-finish="1" title="${c.red ? `${c.red} still need you` : "Nothing red is left"}">Finish adoption</button>
    </div>
    ${progressStrip()}
    <div id="cy" class="cy-full"></div>
  </div>`;
}
// Progress of a draft: the agent writes one file per node in dependency order, so the canon on disk says
// how far it is. Phases: premise, domains, capabilities, requirements, consistency pass, review, finished.
function adoptProgress() {
  const nodes = Object.values(snap.canon.nodes);
  const finished = snap.canon.decisions.some((d) => /adoption-scope/.test(d.file));
  if (finished) return { phase: "Adoption finished", fraction: 1, detail: `${nodes.length} nodes committed` };
  if (!snap.canon.root && nodes.length === 0) return { phase: "Reading the repository", fraction: 0.03, detail: "the premise comes first" };
  const roots = snap.canon.roots.map(node);
  if (roots.length === 0) return { phase: "Drafting the premise and principles", fraction: 0.1, detail: "then the domains" };
  const cut = (n) => n.children.length > 0 || n.state === "open";
  const domains = roots.filter((n) => n.layer === "domain");
  const caps = nodes.filter((n) => n.layer === "capability");
  if (domains.length && !domains.some(cut)) return { phase: "Drafting the domains", fraction: 0.2, detail: `${domains.length} so far` };
  const domainsCut = domains.filter(cut).length;
  if (domains.length && domainsCut < domains.length) return { phase: "Drafting the capabilities", fraction: 0.25 + 0.3 * (domainsCut / domains.length), detail: `${domainsCut} of ${domains.length} domains cut · ${nodes.length} nodes` };
  const capsCut = caps.filter(cut).length;
  if (caps.length && capsCut < caps.length) return { phase: "Drafting the requirements", fraction: 0.55 + 0.35 * (capsCut / caps.length), detail: `${capsCut} of ${caps.length} capabilities cut · ${nodes.length} nodes` };
  const spoke = chatCursor > 0 && [...document.querySelectorAll("#activity li.say")].length > 0;
  if (!spoke) return { phase: "Consistency pass, then the canvas opens", fraction: 0.93, detail: `${nodes.length} nodes drafted` };
  const c = adoptCounts();
  const total = c.green + c.yellow + c.red || 1;
  return { phase: "Reviewing", fraction: 0.93 + 0.07 * (c.green / total), detail: `${c.green} approved · ${c.yellow} guessed · ${c.red} need you` };
}
function progressStrip() {
  const p = adoptProgress();
  return `<div class="progress" title="${esc(p.detail)}"><div class="progress-bar"><span style="width:${Math.round(p.fraction * 100)}%"></span></div><span class="progress-label"><b>${esc(p.phase)}</b> <span class="muted">${esc(p.detail)}</span></span></div>`;
}
function buildAdoptCanvas() {
  const el = $main.querySelector(".adopt #cy");
  if (!el || !window.cytoscape) return;
  if (window.cytoscapeDagre && !buildGraph.registered) { window.cytoscape.use(window.cytoscapeDagre); buildGraph.registered = true; }
  const show = adoptScope();
  const shown = new Set(show);
  const blank = { requires: [], conflicts: [], parent: undefined };
  const info = (id) =>
    id === "ROOT" ? { ...blank, title: snap.canon.root?.title ?? "Premise", children: snap.canon.roots }
    : id === "PRINCIPLES" ? { ...blank, title: "Principles", children: snap.canon.principles.map((p) => p.id) }
    : id.startsWith("PRN-") ? { ...blank, title: snap.canon.principles.find((p) => p.id === id)?.title ?? id, children: [], parent: "PRINCIPLES" }
    : node(id);
  const kindOf = (id) => (id === "ROOT" ? "premise" : id === "PRINCIPLES" ? "principles" : id.startsWith("PRN-") ? "prn" : "");
  const labelled = (id) => adoptState.labels || adoptState.labelled.has(id);
  const elements = [];
  for (const id of show) {
    const n = info(id);
    const label = id === "ROOT" ? `Premise\n${n.title}` : id === "PRINCIPLES" ? `Principles (${n.children.length})` : `${id}\n${n.title}`;
    elements.push({ data: { id, label }, classes: `${colorOf(id)} ${kindOf(id)} ${labelled(id) ? "labelled" : ""} ${id === adoptState.selected ? "selected" : ""}` });
    const parent = id === "ROOT" || id === "PRINCIPLES" ? undefined : n.parent ?? "ROOT";
    if (parent && shown.has(parent)) elements.push({ data: { id: `c:${parent}>${id}`, source: parent, target: id, label: "" }, classes: `contains ${adoptState.edges ? "" : "hidden"}` });
    for (const t of n.requires) if (shown.has(t)) elements.push({ data: { id: `r:${id}>${t}`, source: id, target: t, label: "requires" }, classes: `requires dep ${adoptState.edges && adoptState.deps ? "" : "hidden"}` });
    for (const t of n.conflicts) if (shown.has(t)) elements.push({ data: { id: `x:${id}>${t}`, source: id, target: t, label: "conflicts" }, classes: `conflicts dep ${adoptState.edges && adoptState.deps ? "" : "hidden"}` });
  }
  const dark = matchMedia("(prefers-color-scheme: dark)").matches;
  const layout = () => (window.cytoscapeDagre ? { name: "dagre", rankDir: "TB", nodeSep: 18, rankSep: 70, padding: 40, fit: false } : { name: "breadthfirst", directed: true, padding: 40, fit: false });
  const cy = window.cytoscape({
    container: el, elements, minZoom: 0.05, maxZoom: 4,
    style: [
      { selector: "node", style: { shape: "ellipse", width: 30, height: 30, label: "", "border-width": 2, "background-color": "#fef3c7", "border-color": "#d97706" } },
      { selector: "node.green", style: { "background-color": "#dcfce7", "border-color": "#16a34a" } },
      { selector: "node.yellow", style: { "background-color": "#fef3c7", "border-color": "#d97706" } },
      { selector: "node.red", style: { "background-color": "#fee2e2", "border-color": "#dc2626" } },
      { selector: "node.labelled", style: { shape: "round-rectangle", width: 190, height: 58, label: "", "border-width": 1 } },
      { selector: "node.selected", style: { "border-width": 2.5 } },
      { selector: "edge", style: { width: 1.5, "curve-style": "bezier", "line-color": dark ? "#6b7280" : "#9ca3af", "target-arrow-shape": "triangle", "target-arrow-color": dark ? "#6b7280" : "#9ca3af", "arrow-scale": 0.8, label: "data(label)", "font-size": 9, color: dark ? "#cbd5e1" : "#475569", "text-background-color": dark ? "#171b21" : "#ffffff", "text-background-opacity": 1, "text-background-padding": "2px" } },
      { selector: "edge.requires", style: { "line-style": "dashed", "line-color": "#2563eb", "target-arrow-color": "#2563eb" } },
      { selector: "edge.conflicts", style: { "line-style": "dotted", "line-color": "#dc2626", "target-arrow-shape": "tee", "source-arrow-shape": "tee", "source-arrow-color": "#dc2626", "target-arrow-color": "#dc2626" } },
      { selector: "node.premise", style: { shape: "hexagon", width: 44, height: 40 } },
      { selector: "node.principles", style: { shape: "octagon", width: 40, height: 40 } },
      { selector: "node.prn", style: { shape: "diamond", width: 22, height: 22 } },
      { selector: "node.premise.labelled, node.principles.labelled", style: { shape: "round-rectangle", width: 200, height: 60 } },
      { selector: "node.prn.labelled", style: { shape: "round-rectangle", width: 170, height: 48 } },
      { selector: ".hidden", style: { display: "none" } },
    ],
    layout: layout(),
  });
  window.__cy = cy;
  // The infinite canvas: a cross grid behind the nodes that pans and zooms with them.
  const grid = () => {
    const z = cy.zoom(), p = cy.pan();
    let step = 48 * z;
    while (step < 24) step *= 2;
    while (step > 96) step /= 2;
    el.style.backgroundSize = `${step}px ${step}px`;
    el.style.backgroundPosition = `${p.x}px ${p.y}px`;
  };
  // Buttons that float over the boxes: the children handle under every box that has children, and, on a
  // named box, the eye that hides the name and the ↗ that opens the card.
  const overlay = document.createElement("div");
  overlay.className = "overlays";
  el.appendChild(overlay);
  const makeOverlays = () => {
    overlay.innerHTML = "";
    for (const id of show) {
      const kids = info(id).children.length;
      if (kids) {
        const open = adoptState.expanded.has(id);
        const b = document.createElement("button");
        b.className = "ov handle"; b.dataset.id = id; b.dataset.kind = "handle"; b.textContent = open ? "−" : `+${kids}`; b.title = open ? "Hide the children" : `Show ${kids} children`;
        b.addEventListener("click", (ev) => { ev.stopPropagation(); toggleExpand(id); });
        overlay.appendChild(b);
      }
      if (cy.getElementById(id).hasClass("labelled")) {
        const card = document.createElement("div");
        card.className = "ov-card" + (id.startsWith("PRN-") ? " small" : ""); card.dataset.id = id; card.dataset.kind = "card";
        const tag = id === "ROOT" ? "Premise" : id === "PRINCIPLES" ? "Principles" : id;
        card.innerHTML = `<span class="tag">${esc(tag)}</span><span class="ttl">${esc(info(id).title)}</span>`;
        overlay.appendChild(card);
        const eye = document.createElement("button");
        eye.className = "ov eye"; eye.dataset.id = id; eye.dataset.kind = "eye"; eye.textContent = "👁"; eye.title = "Hide the name";
        eye.addEventListener("click", (ev) => { ev.stopPropagation(); hideLabel(id); });
        overlay.appendChild(eye);
        const go = document.createElement("button");
        go.className = "ov go"; go.dataset.id = id; go.dataset.kind = "go"; go.textContent = "↗"; go.title = "Open this box";
        go.addEventListener("click", (ev) => { ev.stopPropagation(); select(id); openPopup(id); });
        overlay.appendChild(go);
      }
    }
    for (const b of overlay.querySelectorAll("button")) for (const ev of ["pointerdown", "mousedown", "touchstart"]) b.addEventListener(ev, (e) => e.stopPropagation());
    place();
  };
  const place = () => {
    const r = el.getBoundingClientRect();
    for (const h of overlay.children) {
      const n = cy.getElementById(h.dataset.id);
      if (!n.length) continue;
      const p = n.renderedPosition(), w = n.renderedWidth(), hh = n.renderedHeight();
      const inside = p.x > -40 && p.y > -40 && p.x < r.width + 40 && p.y < r.height + 40;
      h.style.display = inside ? "" : "none";
      const z = cy.zoom();
      if (h.dataset.kind === "handle") { h.style.left = `${p.x}px`; h.style.top = `${p.y + hh / 2}px`; }
      else if (h.dataset.kind === "card") { h.style.left = `${p.x}px`; h.style.top = `${p.y}px`; h.style.transform = `translate(-50%, -50%) scale(${z})`; }
      else if (h.dataset.kind === "eye") { h.style.left = `${p.x + w / 2 - 14 * z}px`; h.style.top = `${p.y - hh / 2 + 13 * z}px`; }
      else { h.style.left = `${p.x + w / 2 - 38 * z}px`; h.style.top = `${p.y - hh / 2 + 13 * z}px`; }
    }
  };
  const select = (id) => { adoptState.selected = id; cy.$("node.selected").removeClass("selected"); cy.getElementById(id).addClass("selected"); };
  const relax = () => cy.layout({ name: "cose", randomize: false, animate: true, animationDuration: 350, fit: false, padding: 30, nodeOverlap: 40, nodeRepulsion: () => 60000, idealEdgeLength: () => 70, edgeElasticity: () => 60, gravity: 0.02, numIter: 150, initialTemp: 60, coolingFactor: 0.9, minTemp: 1, nestingFactor: 1 }).run();
  const showLabel = (id) => { adoptState.labelled.add(id); cy.getElementById(id).addClass("labelled"); makeOverlays(); relax(); };
  const hideLabel = (id) => { adoptState.labelled.delete(id); if (adoptState.labels) { adoptState.labels = false; $main.querySelector("[data-labels]")?.classList.remove("on"); for (const n of cy.nodes()) if (!adoptState.labelled.has(n.id())) n.removeClass("labelled"); } cy.getElementById(id).removeClass("labelled"); makeOverlays(); relax(); };
  let lastTap = { id: null, at: 0 };
  cy.on("tap", "node", (e) => {
    const id = e.target.id(), now = Date.now();
    if (lastTap.id === id && now - lastTap.at < 400) { lastTap = { id: null, at: 0 }; select(id); openPopup(id); return; }
    lastTap = { id, at: now };
    select(id);
    showLabel(id);
  });
  cy.on("viewport", () => { grid(); place(); adoptState.view = { zoom: cy.zoom(), pan: cy.pan() }; });
  cy.on("position layoutstop", place);
  cy.ready(() => {
    if (adoptState.view) cy.viewport(adoptState.view); else cy.fit(undefined, 40);
    grid(); makeOverlays();
  });
  if (window.ResizeObserver) new ResizeObserver(() => { cy.resize(); grid(); place(); }).observe(el);
  $main.querySelector("[data-fit]")?.addEventListener("click", () => { cy.fit(undefined, 40); });
  $main.querySelector("[data-labels]")?.addEventListener("click", (ev) => {
    adoptState.labels = !adoptState.labels;
    ev.currentTarget.classList.toggle("on", adoptState.labels);
    if (adoptState.labels) { adoptState.labelled = new Set(cy.nodes().map((n) => n.id())); cy.nodes().addClass("labelled"); }
    else { adoptState.labelled.clear(); cy.nodes().removeClass("labelled"); }
    cy.layout(layout()).run();
    makeOverlays();
  });
  $main.querySelector("[data-deps]")?.addEventListener("click", (ev) => { adoptState.deps = !adoptState.deps; ev.currentTarget.classList.toggle("on", adoptState.deps); cy.edges(".dep").toggleClass("hidden", !(adoptState.deps && adoptState.edges)); });
  $main.querySelector("[data-edges]")?.addEventListener("click", (ev) => { adoptState.edges = !adoptState.edges; ev.currentTarget.classList.toggle("on", adoptState.edges); cy.edges().toggleClass("hidden", !adoptState.edges); if (adoptState.edges) cy.edges(".dep").toggleClass("hidden", !adoptState.deps); });
  $main.querySelector("[data-expand-all]")?.addEventListener("click", () => { for (const id of Object.keys(snap.canon.nodes)) if (node(id).children.length) adoptState.expanded.add(id); render(); });
  $main.querySelector("[data-finish]")?.addEventListener("click", async () => { try { await post("/api/finish", {}); startWorking("you asked to finish the adoption"); } catch (e) { showToast(e); } });
}
function toggleExpand(id) { ensureExpanded(); adoptState.expanded.has(id) ? adoptState.expanded.delete(id) : adoptState.expanded.add(id); render(); }
function expandTo(id) { ensureExpanded(); if (id.startsWith("PRN-")) { adoptState.expanded.add("PRINCIPLES"); return; } let p = node(id)?.parent; while (p) { adoptState.expanded.add(p); p = node(p)?.parent; } }

// The node card: what the node says, why it has its colour, and the actions on it.
const $popup = document.getElementById("popup");
const $why = document.getElementById("ask-why");
function openPopup(id) {
  const isRoot = id === "ROOT";
  const isPrinciples = id === "PRINCIPLES";
  const prn = id.startsWith("PRN-") ? snap.canon.principles.find((p) => p.id === id) : null;
  const n = isRoot || isPrinciples || prn ? null : node(id);
  if (!n && !isRoot && !isPrinciples && !prn) return;
  if (isPrinciples || prn) { openTextCard(id, isPrinciples ? "Principles" : prn.title, isPrinciples
    ? snap.canon.principles.map((p) => `<p><b>${esc(p.id)} ${esc(p.title)}</b> ${esc(p.statement)}${p.source ? ` <span class="muted">Source: ${esc(p.source)}</span>` : ""}</p>`).join("")
    : `<p>${esc(prn.statement)}</p>${prn.source ? `<p class="muted">Source: ${esc(prn.source)}</p>` : ""}`); return; }
  const color = colorOf(id);
  const state = isRoot ? snap.canon.root?.state : n.state;
  const because = color === "red"
    ? (state === "open" ? "The session would not guess this; it needs your words." : state === "contested" ? "Two statements pull against each other; keep one or rewrite." : "A check flagged it; see below.")
    : color === "yellow" ? "The session's guess from your documents. Approve it, rewrite it, or delete it." : "Approved by you.";
  const fs = isRoot ? [] : findingsFor(id).filter((f) => f.level !== "info");
  const kids = isRoot ? snap.canon.roots.length : n.children.length;
  const bodyHtml = isRoot ? stripHtmlSection(snap.html[id] ?? "", "Principles") : snap.html[id];
  $popup.innerHTML = `
    <div class="popup-head"><span class="id">${esc(id)}</span> ${badge(state ?? "assumed")} <span><i class="sw ${color}"></i><span class="muted">${because}</span></span><button class="btn small" id="pp-close" title="Close">✕</button></div>
    <h2>${esc(isRoot ? snap.canon.root?.title ?? "Premise" : n.title)}</h2>
    <div class="popup-body body" id="pp-body">${markSections(bodyHtml || "<p class='muted'>No text yet.</p>")}</div>
    ${fs.length ? `<ul class="pp-findings">${fs.map((f) => `<li>${badge(f.level)} ${esc(f.message)}</li>`).join("")}</ul>` : ""}
    <div class="row pp-actions">
      ${color !== "green" ? `<button class="btn primary" id="pp-approve" title="Keep it as written; it becomes approved by you">Approve</button>` : ""}
      <button class="btn" id="pp-edit" title="Say it in your own words">Rewrite</button>
      ${isRoot ? "" : `<button class="btn" id="pp-delete" title="Remove this node and everything under it">Delete</button>`}
      ${kids && !isRoot ? `<button class="btn" id="pp-toggle">${adoptState.expanded?.has(id) ? "Hide children" : `Show ${kids} children`}</button>` : ""}
      ${isRoot ? "" : `<button class="btn" id="pp-define" title="Ask the session to define this branch further">Define further</button>`}
    </div>
    <p class="sub">Select any words above and press the ? that appears to ask the session what they mean.</p>
    <div id="pp-editor" class="editor"></div>
    <i class="pp-resize nw"></i><i class="pp-resize ne"></i><i class="pp-resize sw"></i><i class="pp-resize se"></i>`;
  const wasHidden = $popup.hidden;
  $popup.hidden = false;
  $popup.dataset.id = id;
  if (wasHidden) centerPopup();
  wirePopupMoves();
  $popup.querySelector("#pp-close").addEventListener("click", closePopup);
  $popup.querySelector("#pp-approve")?.addEventListener("click", async () => {
    try { await post(`/api/node/${encodeURIComponent(id)}/approve`, {}); closePopup(); await load(); render(); startWorking(`you approved ${id}`); } catch (e) { showToast(e); }
  });
  $popup.querySelector("#pp-delete")?.addEventListener("click", async () => {
    if (!confirm(`Delete ${id}${kids ? ` and its ${kids} children` : ""}? The session will re-check what depended on it.`)) return;
    try { await fetch(`/api/node/${encodeURIComponent(id)}`, { method: "DELETE" }); closePopup(); adoptState.selected = null; await load(); render(); startWorking(`you deleted ${id}`); } catch (e) { showToast(e); }
  });
  $popup.querySelector("#pp-toggle")?.addEventListener("click", () => { toggleExpand(id); openPopup(id); });
  $popup.querySelector("#pp-define")?.addEventListener("click", async () => { try { await post("/api/refine", { id }); startWorking(`you asked the session to define ${id} further`); } catch (e) { showToast(e); } });
  $popup.querySelector("#pp-edit").addEventListener("click", async () => {
    const editor = $popup.querySelector("#pp-editor");
    const raw = await fetch(`/api/node/${encodeURIComponent(id)}/raw`).then((r) => r.json()).catch(() => ({ text: "" }));
    const intent = (/^##\s+Intent\b[^\n]*\n([\s\S]*?)(?=^##\s|(?![\s\S]))/m.exec(raw.text ?? "")?.[1] ?? "").trim();
    editor.innerHTML = `<p class="sub">Your words replace the session's and are recorded as stated.</p>
      ${isRoot ? "" : `<input id="pp-title" value="${esc(n.title)}" placeholder="Title, in plain words" />`}
      <textarea id="pp-intent" rows="5" placeholder="What must hold, in your words">${esc(intent)}</textarea>
      <div class="row"><button class="btn primary" id="pp-save">Save</button><button class="btn" id="pp-cancel">Cancel</button></div>`;
    editor.querySelector("#pp-cancel").addEventListener("click", () => (editor.innerHTML = ""));
    editor.querySelector("#pp-save").addEventListener("click", async () => {
      const body = { intent: editor.querySelector("#pp-intent").value, title: editor.querySelector("#pp-title")?.value };
      try { await post(`/api/node/${encodeURIComponent(id)}`, body, "PUT"); closePopup(); await load(); render(); startWorking(`you rewrote ${id}`); } catch (e) { showToast(e); }
    });
  });
}
function closePopup() { $popup.hidden = true; $why.hidden = true; delete $popup.dataset.id; }
/** Remove one rendered `<h2>` section from a node's HTML. */
function stripHtmlSection(html, heading) {
  const re = new RegExp(`<h2>${heading}\\b[^<]*(?:<[^h][^>]*>[^<]*)*</h2>[\\s\\S]*?(?=<h2>|$)`, "i");
  return html.replace(re, "");
}
/** A read-only card: the principles, or one principle, which live in the root README and are edited there. */
function openTextCard(id, title, html) {
  const wasHidden = $popup.hidden;
  $popup.innerHTML = `
    <div class="popup-head"><span class="id">${esc(id)}</span> ${badge(snap.canon.root?.state ?? "assumed")} <span><i class="sw ${colorOf(id)}"></i><span class="muted">Direction the whole canon is judged against; rewrite it in the premise card.</span></span><button class="btn small" id="pp-close" title="Close">✕</button></div>
    <h2>${esc(title)}</h2>
    <div class="popup-body body" id="pp-body">${html}</div>
    <p class="sub">Select any words above and press the ? that appears to ask the session what they mean.</p>
    <i class="pp-resize nw"></i><i class="pp-resize ne"></i><i class="pp-resize sw"></i><i class="pp-resize se"></i>`;
  $popup.hidden = false;
  $popup.dataset.id = id;
  if (wasHidden) centerPopup();
  wirePopupMoves();
  $popup.querySelector("#pp-close").addEventListener("click", closePopup);
}
// The card opens in the middle of the canvas, moves by its header and resizes from any corner.
function centerPopup() {
  const area = $main.querySelector(".adopt #cy")?.getBoundingClientRect() ?? $main.getBoundingClientRect();
  const w = Math.min(560, Math.max(320, area.width - 40));
  $popup.style.width = `${w}px`;
  $popup.style.height = "";
  const h = Math.min($popup.offsetHeight, area.height - 40);
  $popup.style.height = `${h}px`;
  $popup.style.left = `${Math.max(8, area.left + (area.width - w) / 2)}px`;
  $popup.style.top = `${Math.max(60, area.top + (area.height - h) / 2)}px`;
}
function wirePopupMoves() {
  const head = $popup.querySelector(".popup-head");
  head.addEventListener("mousedown", (e) => {
    if (e.target.closest("button")) return;
    e.preventDefault();
    const start = { x: e.clientX, y: e.clientY, left: $popup.offsetLeft, top: $popup.offsetTop };
    const move = (ev) => { $popup.style.left = `${start.left + ev.clientX - start.x}px`; $popup.style.top = `${start.top + ev.clientY - start.y}px`; };
    const up = () => { document.removeEventListener("mousemove", move); document.removeEventListener("mouseup", up); };
    document.addEventListener("mousemove", move); document.addEventListener("mouseup", up);
  });
  for (const grip of $popup.querySelectorAll(".pp-resize")) grip.addEventListener("mousedown", (e) => {
    e.preventDefault(); e.stopPropagation();
    const dirs = grip.className.replace("pp-resize", "").trim();
    const start = { x: e.clientX, y: e.clientY, left: $popup.offsetLeft, top: $popup.offsetTop, w: $popup.offsetWidth, h: $popup.offsetHeight };
    const move = (ev) => {
      const dx = ev.clientX - start.x, dy = ev.clientY - start.y;
      let { left, top, w, h } = start;
      if (dirs.includes("e")) w = Math.max(320, start.w + dx);
      if (dirs.includes("s")) h = Math.max(220, start.h + dy);
      if (dirs.includes("w")) { w = Math.max(320, start.w - dx); left = start.left + (start.w - w); }
      if (dirs.includes("n")) { h = Math.max(220, start.h - dy); top = start.top + (start.h - h); }
      Object.assign($popup.style, { left: `${left}px`, top: `${top}px`, width: `${w}px`, height: `${h}px` });
    };
    const up = () => { document.removeEventListener("mousemove", move); document.removeEventListener("mouseup", up); };
    document.addEventListener("mousemove", move); document.addEventListener("mouseup", up);
  });
}
// The ? tool: select words in the card, press ?, and the session explains them in the chat.
document.addEventListener("mouseup", () => {
  setTimeout(() => {
    const sel = window.getSelection();
    const text = sel?.toString().trim();
    if (!text || $popup.hidden || !$popup.contains(sel.anchorNode)) { if (!$why.matches(":hover")) $why.hidden = true; return; }
    const r = sel.getRangeAt(0).getBoundingClientRect();
    $why.style.left = `${Math.min(window.innerWidth - 34, r.right + 6)}px`; $why.style.top = `${Math.max(8, r.top - 30)}px`;
    $why.dataset.text = text.slice(0, 300);
    $why.hidden = false;
  }, 0);
});
$why.addEventListener("click", async () => {
  const text = $why.dataset.text, id = $popup.dataset.id;
  $why.hidden = true;
  try { await post("/api/message", { text: `What do you mean by "${text}"?`, nodeId: id }); appendChat([{ kind: "message", text: `What do you mean by "${text}"?`, id }]); startWorking("you asked about a passage"); } catch (e) { showToast(e); }
});

// The chat: what the session says and what the human sends, with the actions between them as quiet lines.
let chatCursor = 0;
function appendChat(entries) {
  const list = document.getElementById("activity");
  for (const e of entries) {
    const li = document.createElement("li");
    if (e.kind === "say") { li.className = "say"; li.innerHTML = `${esc(e.text ?? "")}${e.id ? ` ${idLink(e.id)}` : ""}`; }
    else if (e.kind === "message") { li.className = "message"; li.textContent = e.text ?? ""; }
    else { li.className = "sys"; li.textContent = e.kind === "answer" ? `You answered: ${e.text ?? ""}` : e.text ?? e.kind; }
    list.appendChild(li);
  }
  while (list.children.length > 60) list.firstChild.remove();
  list.lastElementChild?.scrollIntoView({ block: "nearest" });
}
function startWorking(what) { working = { since: Date.now(), answer: "" }; if (shownQuestionId === null) showWorking(what); }

load().then(render).catch(showError).finally(pollSession);
