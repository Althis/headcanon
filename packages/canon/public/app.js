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
      tile(stats.measurable, "leaves with a check"),
      tile(stats.unrefined, "leaves to cut"),
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
  const green = (t) => t.state === "stated" || t.state === "resolved";
  return `<h1>Glossary</h1><p class="lede">What the human means when they say X. A term is the session's guess until you approve it, rewrite it in your words, or delete it.</p>
    <table class="list glossary"><thead><tr><th>Term</th><th>ID</th><th>Definition</th><th></th></tr></thead><tbody>
    ${snap.canon.terms.map((t) => `<tr data-term="${esc(t.id)}"><td><b>${esc(t.term)}</b><div>${badge(t.state)}</div></td><td class="id">${esc(t.id)}</td><td class="def">${esc(t.definition)}</td><td class="acts"><span class="row">${green(t) ? "" : `<button class="btn small primary" data-term-approve="${esc(t.id)}" title="Keep it as written; it becomes approved by you">Approve</button>`}<button class="btn small" data-term-edit="${esc(t.id)}" title="Say it in your own words">Rewrite</button><button class="btn small" data-term-delete="${esc(t.id)}">Delete</button></span></td></tr>`).join("")}
    </tbody></table>`;
}
// The glossary's rows act like boxes: approve, rewrite in place, delete; each reaches the session as a change.
function wireGlossary() {
  const after = async (what) => { await load(); render(); startWorking(what); };
  for (const b of $main.querySelectorAll("[data-term-approve]")) b.addEventListener("click", async () => { const id = b.dataset.termApprove; try { await post(`/api/node/${encodeURIComponent(id)}/approve`, {}); after(`you approved ${id}`); } catch (e) { showToast(e); } });
  for (const b of $main.querySelectorAll("[data-term-delete]")) b.addEventListener("click", async () => { const id = b.dataset.termDelete; if (!confirm(`Delete ${id}? The session re-reads the boxes that use the word.`)) return; try { await fetch(`/api/node/${encodeURIComponent(id)}`, { method: "DELETE" }); after(`you deleted ${id}`); } catch (e) { showToast(e); } });
  for (const b of $main.querySelectorAll("[data-term-edit]")) b.addEventListener("click", () => {
    const id = b.dataset.termEdit, tr = $main.querySelector(`tr[data-term="${CSS.escape(id)}"]`), t = snap.canon.terms.find((x) => x.id === id);
    if (!tr || !t) return;
    tr.querySelector(".def").innerHTML = `<div class="editor"><input id="term-word" value="${esc(t.term)}" placeholder="The term" /><textarea id="term-def" rows="3" placeholder="What it means, in your words">${esc(t.definition)}</textarea><div class="row"><button class="btn primary" id="term-save">Save</button><button class="btn" id="term-cancel">Cancel</button></div></div>`;
    tr.querySelector(".acts").hidden = true;
    tr.querySelector("#term-def").focus();
    tr.querySelector("#term-cancel").addEventListener("click", () => render());
    tr.querySelector("#term-save").addEventListener("click", async () => { try { await post(`/api/node/${encodeURIComponent(id)}`, { title: tr.querySelector("#term-word").value, intent: tr.querySelector("#term-def").value }, "PUT"); after(`you rewrote ${id}`); } catch (e) { showToast(e); } });
  });
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
  if (view === "glossary") wireGlossary();
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
// A question is a card over the canvas, moved by its header; the panel's header brings it back when put away.
const $ask = document.getElementById("ask");
function showAsk(header) {
  document.getElementById("ask-sub").textContent = header ?? $question.dataset.label ?? "";
  $ask.hidden = false;
  if ($ask.dataset.placed) return;
  const area = $main.querySelector(".adopt #cy")?.getBoundingClientRect() ?? $main.getBoundingClientRect();
  const w = Math.min(640, Math.max(320, area.width - 40));
  $ask.style.width = `${w}px`;
  $ask.style.left = `${Math.max(8, area.left + (area.width - w) / 2)}px`;
  $ask.style.top = `${Math.max(60, area.top + Math.max(0, (area.height - $ask.offsetHeight) / 2))}px`;
  $ask.dataset.placed = "1";
}
document.getElementById("ask-close").addEventListener("click", () => { $ask.hidden = true; shownIssue = null; });
document.getElementById("session-status").addEventListener("click", () => { if (shownQuestionId) $ask.hidden = false; });
$ask.querySelector(".popup-head").addEventListener("pointerdown", (e) => {
  if (e.target.closest("button")) return;
  const r = $ask.getBoundingClientRect(), dx = e.clientX - r.left, dy = e.clientY - r.top;
  const move = (ev) => { $ask.style.left = `${ev.clientX - dx}px`; $ask.style.top = `${Math.max(0, ev.clientY - dy)}px`; };
  const up = () => { document.removeEventListener("pointermove", move); document.removeEventListener("pointerup", up); };
  document.addEventListener("pointermove", move); document.addEventListener("pointerup", up);
});
const $tooltip = document.getElementById("tooltip");
let shownQuestionId = null, lastFocusSeq = 0, lastCursor = 0, termState = {};
function setToggle(collapsed) {
  const b = document.getElementById("session-toggle");
  b.textContent = collapsed ? "Open" : "✕";
  b.title = collapsed ? "Open the session panel" : "Close the panel; it opens again when a question arrives";
}
function openSession() { $session.classList.remove("collapsed"); setToggle(false); }
document.getElementById("session-toggle").addEventListener("click", () => setToggle($session.classList.toggle("collapsed")));
// The panel's left edge drags to set the split between canvas and panel; the width is kept for next time.
{
  const grip = document.getElementById("session-grip");
  const apply = (w) => document.documentElement.style.setProperty("--panel-w", `${Math.round(w)}px`);
  try { const saved = Number(localStorage.getItem("hc-panel-w")); if (saved >= 280) apply(saved); } catch {}
  grip.addEventListener("pointerdown", (e) => {
    e.preventDefault(); grip.setPointerCapture(e.pointerId); document.body.classList.add("resizing");
    const move = (ev) => apply(Math.max(280, Math.min(window.innerWidth * 0.7, window.innerWidth - ev.clientX)));
    const up = () => { grip.removeEventListener("pointermove", move); grip.removeEventListener("pointerup", up); document.body.classList.remove("resizing"); try { localStorage.setItem("hc-panel-w", String(parseInt(getComputedStyle(document.documentElement).getPropertyValue("--panel-w")) || "")); } catch {} };
    grip.addEventListener("pointermove", move); grip.addEventListener("pointerup", up);
  });
}
// A message carries the passage the human highlighted in a card, when they did: the chip above the box names
// the node and the words, and both go with the text. Enter sends; Shift+Enter breaks a line.
const $msg = document.getElementById("msg"), $quote = document.getElementById("quote");
let quote = null;
function setQuote(q) {
  quote = q;
  $quote.hidden = !q;
  if (q) {
    $quote.innerHTML = `<span class="muted">about</span> ${idLink(q.id)} <q>${esc(q.text)}</q><button class="btn small" id="quote-x" title="Drop the passage">✕</button>`;
    $quote.querySelector("#quote-x").addEventListener("click", () => setQuote(null));
    $msg.placeholder = "Ask about the highlighted passage…";
  } else { $msg.placeholder = "Message the session…"; window.CSS?.highlights?.delete("quote"); }
}
async function sendMessage() {
  const text = $msg.value.trim();
  if (!text) return;
  const q = quote;
  try { await post("/api/message", { text, nodeId: q?.id, quote: q?.text }); } catch (e) { showToast(e); return; }
  $msg.value = "";
  setQuote(null);
  if (q) startWorking("you asked about a passage"); else showToast(`Sent: ${text.slice(0, 80)}`);
}
document.getElementById("msg-send").addEventListener("click", sendMessage);
$msg.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } });
// Issues are their own objects, each of a kind with its own template, and each acts on a box: a question the
// session asked, an open box to settle, a contradiction to settle, a check that flagged a box. The panel lists
// them; clicking one opens its template, never the box's card. Redrawn only when the list changes.
let lastSession = null;
const ISSUE_MARK = { question: "?", open: "?", contradiction: "≠", check: "!" };
function issuesOf(s) {
  const out = [];
  const queue = s?.queue ?? (s?.question ? [{ id: s.question.id, header: s.question.header, nodeId: s.question.nodeId }] : []);
  const qTitle = (q) => { const draft = q.id === s?.question?.id ? /"([^"\n]{3,90}?)\./.exec(s.question.question ?? "")?.[1] : undefined; return (q.nodeId && node(q.nodeId)?.title) || draft || q.header; };
  queue.forEach((q, i) => out.push({ kind: "question", key: q.id, id: q.id, nodeId: q.nodeId, title: qTitle(q), sub: q.header && q.header !== q.nodeId && q.header !== qTitle(q) ? q.header : "", current: i === 0 }));
  for (const n of Object.values(snap.canon.nodes)) {
    if (n.state === "contested") out.push({ kind: "contradiction", key: "c:" + n.id, nodeId: n.id, title: n.title });
    else if (n.state === "open") out.push({ kind: "open", key: "o:" + n.id, nodeId: n.id, title: n.title });
    else if (findingsFor(n.id).some((f) => f.level !== "info" && f.code !== "branch-unconfirmed")) out.push({ kind: "check", key: "k:" + n.id, nodeId: n.id, title: n.title });
  }
  return out;
}
function renderIssues(s) {
  const body = document.getElementById("issues-body"), count = document.getElementById("issues-count");
  if (!body || !snap) return;
  const issues = issuesOf(s);
  const key = JSON.stringify(issues.map((i) => i.key));
  if (body.dataset.key === key) return;
  body.dataset.key = key;
  count.textContent = issues.length; count.hidden = issues.length === 0;
  body.innerHTML = (issues.length ? "" : `<p class="muted">Nothing needs you right now.</p>`) +
    issues.map((i, k) => `<button class="btn small issue-row${i.current ? " now" : ""}" data-issue="${k}" title="${i.kind === "question" ? (i.current ? "Open this question" : "Waits behind the question above") : i.kind === "open" ? "Settle what is open" : i.kind === "contradiction" ? "Settle the contradiction" : "See what the check flagged"}"><span class="kind">${ISSUE_MARK[i.kind]}</span>${i.nodeId ? `<span class="tag">${esc(i.nodeId)}</span>` : ""}<span>${esc(i.title)}${i.sub ? ` <span class="muted">· ${esc(i.sub)}</span>` : ""}</span></button>`).join("");
  for (const b of body.querySelectorAll("[data-issue]")) b.addEventListener("click", () => openIssue(issues[Number(b.dataset.issue)]));
}
// A suggestion's words without their source references, as a box's text.
const plainWords = (html) => html.replace(/<[^>]+>/g, "").replace(/\s*\(([^()]*)\)/g, (m, inner) => (/[A-Za-z0-9_.\/-]+\.[A-Za-z0-9]+:\d+/.test(inner) ? "" : m)).trim();
function openIssue(issue) {
  if (issue.kind === "question") { if (issue.current) showAsk(); else showToast("Answer the question above it first."); return; }
  const id = issue.nodeId, n = node(id);
  if (!n) return;
  const html = snap.html[id] ?? "";
  const settle = async (text, resolve) => { try { await post(`/api/node/${encodeURIComponent(id)}`, { intent: text, resolve }, "PUT"); $ask.hidden = true; shownIssue = null; await load(); render(); startWorking(`you settled ${id}`); } catch (e) { showToast(e); } };
  const items = (sectionHtml) => [...sectionHtml.matchAll(/<li>([\s\S]*?)<\/li>/g)].map((m) => m[1]);
  if (issue.kind === "open") {
    const intent = extractHtmlSection(html, "Intent").replace(/<h2>[^<]*<\/h2>/, "");
    const question = /<strong>([\s\S]*?)<\/strong>/.exec(intent)?.[1] ?? "";
    const summary = intent.replace(/<p>\s*<strong>[\s\S]*?<\/strong>\s*<\/p>/, "").trim();
    const choices = items(extractHtmlSection(html, "Options"));
    questionCard({ badge: "Open question", nodeId: id, title: n.title, questionHtml: question, summaryHtml: summary, options: choices.map((c) => ({ labelHtml: c })), onAnswer: ({ picked, text }) => settle(text || plainWords(choices[picked[0]]), "open") });
  } else if (issue.kind === "contradiction") {
    const contested = extractHtmlSection(html, "Contested");
    const summary = /<\/h2>\s*<p>([\s\S]*?)<\/p>\s*<ul>/.exec(contested)?.[1] ?? "";
    const choices = items(contested);
    const others = [...new Set([...(n.conflicts ?? []), ...Object.values(snap.canon.nodes).filter((o) => (o.conflicts ?? []).includes(id)).map((o) => o.id)])].filter((x) => snap.canon.nodes[x]);
    questionCard({ badge: "Contradiction", nodeId: id, title: n.title, questionHtml: "Which statement stands?", summaryHtml: `${summary ? `<p>${summary}</p>` : ""}${others.length ? `<p class="sub">Also against: ${others.map((x) => `${idLink(x)} ${esc(node(x).title)}`).join("; ")}</p>` : ""}`, options: choices.map((c) => ({ labelHtml: c })), onAnswer: ({ picked, text }) => settle(text || plainWords(choices[picked[0]]), "contested") });
  } else {
    const fs = findingsFor(id).filter((f) => f.level !== "info" && f.code !== "branch-unconfirmed");
    questionCard({ badge: "Flagged", nodeId: id, title: n.title, questionHtml: "What should happen with this box?", summaryHtml: `<ul class="pp-findings">${fs.map((f) => `<li>${badge(f.level)} ${esc(f.message)}</li>`).join("")}</ul>`, options: [{ labelHtml: "<b>Ask the session to fix it</b>" }], onAnswer: async ({ text }) => { try { if (text) await post(`/api/node/${encodeURIComponent(id)}`, { intent: text }, "PUT"); else await post("/api/message", { text: `Fix what the check flags on ${id}: ${fs.map((f) => f.message).join("; ")}`, nodeId: id }); $ask.hidden = true; shownIssue = null; await load(); render(); startWorking(`you answered about ${id}`); } catch (e) { showToast(e); } } });
  }
  $question.dataset.label = `${issue.kind === "open" ? "Open question" : issue.kind === "contradiction" ? "Contradiction" : "Flagged"} · ${id}`;
  shownIssue = issue.key;
  showAsk();
}
let shownIssue = null;
async function pollSession() {
  try {
    const s = await fetch("/api/session", { cache: "no-store" }).then((r) => r.json());
    lastSession = s;
    const pill = document.getElementById("session-pending");
    pill.textContent = s.pending; pill.hidden = s.pending === 0;
    document.getElementById("session-status").textContent = s.question ? `waiting on you: ${s.question.header}` : "no question waiting";
    document.getElementById("session-status").classList.toggle("has-q", Boolean(s.question));
    if (s.focus && s.focus.seq !== lastFocusSeq) {
      lastFocusSeq = s.focus.seq;
      if (s.focus.id) {
        chime();
        if (route().view === "adopt") focusOnCanvas(s.focus.id, false);
        else location.hash = s.focus.id === "ROOT" ? "#/" : `#/node/${s.focus.id}`;
      }
    }
    if (s.question && s.question.id !== shownQuestionId && !(shownIssue && !$ask.hidden)) { shownQuestionId = s.question.id; termState = {}; renderQuestion(s.question, s.pending); shownIssue = null; chime(); }
    renderIssues(s);
    if (!s.question && shownQuestionId) { shownQuestionId = null; showWorking(); }
    if (!s.question && working) { document.getElementById("session-status").textContent = `session working · ${elapsed()}`; const el = document.getElementById("work-elapsed"); if (el) el.textContent = elapsed(); }
    // While a draft is being written there is no feed entry per file; on the Adopt view, re-read the canon
    // every few seconds and redraw when nodes appeared, so the progress strip and the canvas grow with it.
    if (route().view === "adopt" && !s.question && (pollSession.tick = (pollSession.tick ?? 0) + 1) % 3 === 0) {
      const fresh = await fetch("/api/snapshot", { cache: "no-store" }).then((r) => r.json()).catch(() => null);
      const ed = editingDraft();
      if (fresh && (fresh.stats.nodes !== snap.stats.nodes || fresh.canon.decisions.length !== snap.canon.decisions.length || Boolean(fresh.canon.root) !== Boolean(snap.canon.root) || (ed && fresh.html[ed.id] !== snap.html[ed.id]))) { snap = fresh; for (const n of Object.values(snap.canon.nodes)) { n.requires ??= []; n.relates ??= []; n.conflicts ??= []; } if ($popup.hidden) render(); else { const strip = $main.querySelector(".progress"); if (strip) strip.outerHTML = progressStrip(); } checkConflict(); chime(); }
    }
    if (s.cursor !== lastCursor) {
      lastCursor = s.cursor;
      const c = await fetch(`/api/changes?since=${chatCursor}`, { cache: "no-store" }).then((r) => r.json()).catch(() => null);
      if (c) { chatCursor = c.cursor; appendChat(c.entries); if (c.entries.some((e) => e.kind === "say")) { chime(); working = null; if (!s.question) { $ask.hidden = true; document.getElementById("session-status").textContent = "no question waiting"; } openSession(); } }
      if (shownQuestionId === null) { await load().catch(() => {}); checkConflict(); if (route().view !== "tree" && route().view !== "node") render(); }
      renderIssues(s);
    }
  } catch (e) { /* server away; try again */ }
  setTimeout(pollSession, 2000);
}
// Between questions: the session is reading, writing or thinking; show that it is, and for how long.
let working = null;
const elapsed = () => { const s = Math.floor((Date.now() - (working?.since ?? Date.now())) / 1000); return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`; };
function showWorking(what) {
  if (!working) working = { since: Date.now(), answer: "" };
  // the panel's header counts the seconds; the card goes away until the next question
  $ask.hidden = true;
  $question.innerHTML = "";
  if (what) appendChat([{ kind: "sys", text: `The session is working since ${what}.`, at: new Date().toISOString() }]);
}
// One card for every question, whoever asks it: the box's title, the question, a short summary, the options to
// pick from with "Write it yourself" as the last, and Answer at the bottom. `onAnswer` gets the picked options'
// indices, or the typed text.
function questionCard({ badge, nodeId, title, questionHtml, summaryHtml, options, multi, more, onAnswer }) {
  const type = multi ? "checkbox" : "radio";
  const opts = options.map((o, i) => `<label class="opt"><input type="${type}" name="opt" value="${i}" ${!multi && i === 0 ? "checked" : ""}/> <span class="opt-text"><span class="opt-head">${o.labelHtml}</span>${o.descHtml ? `<span class="opt-desc">${o.descHtml}</span>` : ""}</span></label>`).join("");
  const canShow = nodeId && (node(nodeId) || nodeId.startsWith("PRN-"));
  $question.innerHTML = `
    ${more ?? ""}
    <div class="q-head"><span class="badge kind">${esc(badge)}</span>${nodeId ? ` ${idLink(nodeId)}` : ""}${canShow ? ` <button class="btn small" id="iss-show" title="Show the box on the canvas">Show on canvas</button> <button class="btn small" id="iss-card" title="Open the box's card">Open the card</button>` : ""}</div>
    ${title ? `<h2 class="q-title">${esc(title)}</h2>` : ""}
    ${questionHtml ? `<p class="q-question"><strong>${questionHtml}</strong></p>` : ""}
    ${summaryHtml ? `<div class="q-body body">${summaryHtml}</div>` : ""}
    <div id="q-terms" class="q-terms" hidden></div>
    <div class="opts" id="q-opts">${opts}<label class="opt"><input type="${type}" name="opt" value="write" ${options.length ? "" : "checked"}/> <span class="opt-text"><span class="opt-head"><b>Write it yourself</b></span></span></label></div>
    <div id="q-free" ${options.length ? "hidden" : ""}><textarea id="q-other" rows="3" placeholder="Your own words, or a correction."></textarea></div>
    <div class="row"><button class="btn primary" id="q-submit">Answer</button><span class="sub" id="q-hint"></span></div>`;
  const free = $question.querySelector("#q-free"), writeBox = $question.querySelector('input[name=opt][value="write"]');
  const sync = () => { free.hidden = !writeBox.checked; if (writeBox.checked) free.querySelector("textarea").focus(); };
  for (const i of $question.querySelectorAll("input[name=opt]")) i.addEventListener("change", sync);
  if (!options.length) sync();
  $question.querySelector("#iss-show")?.addEventListener("click", () => { if (document.body.classList.contains("adopt-mode") && !nodeId.startsWith("PRN-")) focusOnCanvas(nodeId, false, true); });
  $question.querySelector("#iss-card")?.addEventListener("click", () => { $ask.hidden = true; openPopup(nodeId); });
  $question.querySelector("#q-submit").addEventListener("click", () => {
    const write = writeBox.checked, text = $question.querySelector("#q-other").value.trim();
    const picked = write ? [] : [...$question.querySelectorAll("input[name=opt]:checked")].map((i) => Number(i.value));
    if (write && !text) { showToast("Write it first, or pick an option."); return; }
    if (!write && !picked.length) { showToast("Pick an option, or write it yourself."); return; }
    onAnswer({ picked, text: write ? text : "" });
  });
}
function renderQuestion(q, pending = 1) {
  working = null;
  // The card's title: the node's, or the draft's first sentence while the node is still being drafted; the
  // header is a label of the kind of question and is not repeated when it is only the node's id.
  const nodeTitle = q.nodeId ? node(q.nodeId)?.title : undefined;
  const draftTitle = /"([^"\n]{3,90}?)\./.exec(q.question ?? "")?.[1];
  const title = nodeTitle ?? draftTitle ?? "";
  const label = q.header && q.header !== q.nodeId ? q.header : "";
  // an option reads as ID, title, then description; the ID links to the node's page when the node exists
  const options = q.options.map((o) => { const m = /^((?:REQ|JRN|DEC|PRN|TERM)-\S+)\s+(.+)$/.exec(o.label); return { labelHtml: m ? `${idLink(m[1])} <b>${esc(m[2])}</b>` : `<b>${esc(o.label)}</b>`, descHtml: o.html ?? (o.description ? esc(o.description) : "") }; });
  questionCard({ badge: label || "Question", nodeId: q.nodeId, title, questionHtml: "", summaryHtml: q.html, options, multi: q.multiSelect, more: `${q.notice ? `<p class="notice"><b>Note from the session:</b> ${esc(q.notice)}</p>` : ""}${pending > 1 ? `<p class="sub">${pending - 1} more after this.</p>` : ""}`, onAnswer: ({ picked, text }) => submitAnswer(q, picked, text) });
  $question.dataset.label = label || q.nodeId || "Question";
  renderTermRows(q);
  for (const span of $question.querySelectorAll(".jargon")) {
    span.addEventListener("mouseenter", () => showTooltip(span, q));
    span.addEventListener("click", (e) => { e.preventDefault(); showTooltip(span, q, true); });
  }
  updateSubmit(q);
}
function updateSubmit(q) {
  const unresolved = q.terms.filter((t) => !termState[t.term.toLowerCase()]);
  const btn = $question.querySelector("#q-submit"), hint = $question.querySelector("#q-hint");
  if (!btn) return;
  btn.disabled = unresolved.length > 0;
  btn.textContent = unresolved.length ? `Decide ${unresolved.length} term${unresolved.length > 1 ? "s" : ""} first` : "Answer";
  hint.textContent = "";
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
  $tooltip.querySelector("[data-keep]")?.addEventListener("click", () => decideTerm(q, term, "keep", "", guess.definition));
  $tooltip.querySelector("[data-drop]")?.addEventListener("click", () => {
    $tooltip.querySelector(".tt-replace").hidden = false;
    $tooltip.querySelector(".tt-replace input").focus();
  });
  $tooltip.querySelector("[data-replace]")?.addEventListener("click", () => decideTerm(q, term, "drop", $tooltip.querySelector(".tt-replace input").value.trim(), ""));
}
// A term's fate, from the tooltip or from the rows under the draft: kept, and it enters the glossary with this
// meaning; dropped, with a word to use instead.
async function decideTerm(q, term, decision, replacement, definition) {
  await post("/api/term", decision === "keep" ? { term, definition, decision } : { term, decision, replacement }).catch(showToast);
  termState[term.toLowerCase()] = decision === "keep" ? { term, decision, definition } : { term, decision, replacement };
  $tooltip.hidden = true;
  updateSubmit(q);
  renderTermRows(q);
  showToast(decision === "keep" ? `"${term}" enshrined in the glossary.` : `"${term}" dropped${replacement ? `; use "${replacement}"` : ""}.`);
}
// The undefined terms as rows under the draft, each with Keep and Drop, so the gate before the answer is in plain sight.
function renderTermRows(q) {
  const box = $question.querySelector("#q-terms");
  if (!box) return;
  if (!q.terms.length) { box.hidden = true; return; }
  const left = q.terms.filter((t) => !termState[t.term.toLowerCase()]).length;
  box.hidden = false;
  box.innerHTML = `<p class="sub">${left ? `Before you answer: ${left} term${left > 1 ? "s" : ""} in this draft that the glossary does not define. Keep a term and it enters the glossary with this meaning; drop it and name a word to use instead.` : "Every term is decided; the answer can go."}</p>` +
    q.terms.map((t) => { const st = termState[t.term.toLowerCase()]; return `<div class="term-row"><b>${esc(t.term)}</b><span class="muted">${esc(t.definition)}</span>${st ? `<span class="badge ${st.decision === "keep" ? "stated" : "contested"}">${st.decision === "keep" ? "kept" : `dropped${st.replacement ? `, use "${esc(st.replacement)}"` : ""}`}</span>` : `<span class="row"><button class="btn small ok" data-term-keep="${esc(t.term)}">Keep</button><button class="btn small no" data-term-drop="${esc(t.term)}">Drop</button><input class="term-replace" data-term-input="${esc(t.term)}" placeholder="word to use instead (optional)" hidden /></span>`}</div>`; }).join("");
  for (const b of box.querySelectorAll("[data-term-keep]")) b.addEventListener("click", () => { const t = q.terms.find((x) => x.term === b.dataset.termKeep); decideTerm(q, t.term, "keep", "", t.definition); });
  for (const b of box.querySelectorAll("[data-term-drop]")) {
    const input = box.querySelector(`[data-term-input="${CSS.escape(b.dataset.termDrop)}"]`);
    const drop = () => decideTerm(q, b.dataset.termDrop, "drop", input.value.trim(), "");
    b.addEventListener("click", () => { if (input.hidden) { input.hidden = false; input.focus(); b.textContent = "Drop it"; return; } drop(); });
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); drop(); } });
  }
}
async function submitAnswer(q, picked, text) {
  const selected = picked.map((i) => q.options[i]?.label).filter(Boolean);
  const terms = Object.values(termState);
  try {
    await post("/api/answer", { questionId: q.id, selected, other: text, terms });
    working = { since: Date.now(), answer: text ? `Other: ${text}` : selected.join(", ") };
    shownQuestionId = null;
    showWorking();
  } catch (e) { showToast(e); }
}
document.addEventListener("click", (e) => { if (!$tooltip.contains(e.target) && !e.target.classList?.contains("jargon")) { $tooltip.hidden = true; tooltipPinned = false; } });

// ---------------------------------------------------------------- adopt: the canvas for reviewing a drafted canon
// Green: the human approved it (stated or resolved). Yellow: the session's guess (assumed). Red: it needs the
// human before adoption can finish: open (the session would not guess), contested, or a check flagged it.
// Boxes start as plain circles; a click shows a node's name, a double-click or its ↗ opens the card.
const adoptState = { expanded: null, selected: null, labelled: new Set(), labels: false, deps: true, edges: true, bands: true, order: true, mode: "dendro", menu: true, prn: true, issuesOpen: true, view: null, focus: new Set() };
function colorOf(id) {
  if (id === "ROOT" || id === "PRINCIPLES") { const s = snap.canon.root?.state; return s === "stated" || s === "resolved" ? "green" : "yellow"; }
  if (id.startsWith("PRN-")) { const s = snap.canon.principles.find((p) => p.id === id)?.state ?? "assumed"; return s === "open" || s === "contested" ? "red" : s === "stated" || s === "resolved" ? "green" : "yellow"; }
  const n = node(id);
  if (!n) return "yellow";
  if (n.state === "open" || n.state === "contested") return "red";
  // a finding about the branch under a box (branch-unconfirmed) is the normal state of a draft and never paints the box itself
  if (findingsFor(id).some((f) => f.level !== "info" && f.code !== "branch-unconfirmed")) return "red";
  return n.state === "stated" || n.state === "resolved" ? "green" : "yellow";
}
function ensureExpanded() {
  if (adoptState.expanded) return;
  adoptState.expanded = new Set(["ROOT", ...snap.canon.roots]);
}
function adoptScope() {
  ensureExpanded();
  const show = ["ROOT", ...snap.canon.roots];
  const visit = (id) => { if (!adoptState.expanded.has(id)) return; for (const c of node(id).children) { show.push(c); visit(c); } };
  for (const r of snap.canon.roots) visit(r);
  return show;
}
function adoptCounts() {
  const c = { green: 0, yellow: 0, red: 0 };
  for (const id of Object.keys(snap.canon.nodes)) c[colorOf(id)]++;
  for (const p of snap.canon.principles) c[colorOf(p.id)]++;
  for (const t of snap.canon.terms) c[t.state === "stated" || t.state === "resolved" ? "green" : t.state === "open" || t.state === "contested" ? "red" : "yellow"]++;
  return c;
}
function adopt(selectedId) {
  if (selectedId) adoptState.selected = selectedId;
  const c = adoptCounts();
  return `<div class="adopt">
    <div class="toolbar adopt-bar">
      <span class="legend"><span><i class="sw green"></i>approved ${c.green}</span><span><i class="sw yellow"></i>guessed ${c.yellow}</span><span><i class="sw red"></i>needs you ${c.red}</span></span>
      <button class="btn ${c.red ? "" : "primary"}" data-finish="1" title="${c.red ? `${c.red} still need you` : "Nothing red is left"}">Finish adoption</button>
    </div>
    ${progressStrip()}
    <div id="cy" class="cy-full"></div>
  </div>`;
}
// Progress of a draft: the agent writes one file per node in dependency order, so the canon on disk says
// how far it is. Phases: reading, premise, then reviewing while the draft goes on under the reach rule, finished.
function adoptProgress() {
  const nodes = Object.values(snap.canon.nodes);
  const finished = snap.canon.decisions.some((d) => /adoption-scope/.test(d.file));
  if (finished) return { phase: "Adoption finished", fraction: 1, detail: `${nodes.length} nodes committed` };
  if (!snap.canon.root && nodes.length === 0) return { phase: "Reading the repository", fraction: 0.03, detail: "the premise comes first" };
  if (snap.canon.roots.length === 0) return { phase: "Drafting the premise and principles", fraction: 0.1, detail: "the canvas opens with the domains" };
  // from the domains on, the human reviews while refiners cut what lies within reach of their approvals
  const c = adoptCounts();
  const total = c.green + c.yellow + c.red || 1;
  const toCut = snap.stats?.unrefined ?? 0;
  return { phase: "Reviewing while the draft goes on", fraction: 0.2 + 0.8 * (c.green / total), detail: `${c.green} approved · ${c.yellow} guessed · ${c.red} need you · ${toCut} box${toCut === 1 ? "" : "es"} still to cut` };
}
function progressStrip() {
  const p = adoptProgress();
  return `<div class="progress" title="${esc(p.detail)}"><div class="progress-bar"><span style="width:${Math.round(p.fraction * 100)}%"></span></div><span class="progress-label"><b>${esc(p.phase)}</b> <span class="muted">${esc(p.detail)}</span></span></div>`;
}
function buildAdoptCanvas() {
  const el = $main.querySelector(".adopt #cy");
  if (!el || !window.cytoscape) return;
  if (window.cytoscapeDagre && !buildGraph.registered) { window.cytoscape.use(window.cytoscapeDagre); buildGraph.registered = true; }
  const blank = { requires: [], conflicts: [], parent: undefined };
  const info = (id) =>
    id === "ROOT" ? { ...blank, title: snap.canon.root?.title ?? "Premise", children: snap.canon.roots }
    : id === "PRINCIPLES" ? { ...blank, title: "Principles", children: snap.canon.principles.map((p) => p.id) }
    : id.startsWith("PRN-") ? { ...blank, title: snap.canon.principles.find((p) => p.id === id)?.title ?? id, children: [], parent: "PRINCIPLES" }
    : node(id);
  const kindOf = (id) => (id === "ROOT" ? "premise" : id === "PRINCIPLES" ? "principles" : id.startsWith("PRN-") ? "prn" : "");
  const parentOf = (id) => (id === "ROOT" || id === "PRINCIPLES" ? undefined : info(id).parent ?? "ROOT");
  const labelled = (id) => adoptState.labels || adoptState.labelled.has(id);
  // A closed circle shows its number; a long number gets a smaller font, the circle never grows.
  const shortOf = (id) => (id === "ROOT" || id === "PRINCIPLES" ? "" : id.replace(/^(REQ|PRN)-/, ""));
  const fsOf = (short) => (short.length <= 3 ? 10 : short.length <= 5 ? 8 : short.length <= 7 ? 6.5 : 5.5);
  const classesOf = (id) => `${colorOf(id)} ${kindOf(id)} ${labelled(id) ? "labelled" : ""} ${adoptState.mode === "dendro" ? "dendro" : ""} ${id === adoptState.selected ? "selected" : ""}`;
  const elementsFor = (show) => {
    const shown = new Set(show);
    const out = [];
    for (const id of show) {
      const n = info(id);
      const short = shortOf(id);
      out.push({ data: { id, label: `${id}\n${n.title}`, short, fs: fsOf(short), dw: 140 }, classes: classesOf(id) });
      const parent = parentOf(id);
      if (parent && shown.has(parent)) out.push({ data: { id: `c:${parent}>${id}`, source: parent, target: id, label: "" }, classes: `contains ${adoptState.edges ? "" : "hidden"}` });
      for (const t of n.requires) if (shown.has(t)) out.push({ data: { id: `r:${id}>${t}`, source: id, target: t, label: "requires" }, classes: `requires dep ${adoptState.edges && adoptState.deps ? "" : "hidden"}` });
      for (const t of n.conflicts) if (shown.has(t)) out.push({ data: { id: `x:${id}>${t}`, source: id, target: t, label: "conflicts" }, classes: `conflicts dep ${adoptState.edges && adoptState.deps ? "" : "hidden"}` });
    }
    return out;
  };
  const layout = () => (window.cytoscapeDagre ? { name: "dagre", rankDir: "TB", nodeSep: 18, rankSep: 100, padding: 40, fit: false } : { name: "breadthfirst", directed: true, padding: 40, fit: false });
  const cy = window.cytoscape({
    container: el, elements: elementsFor(adoptScope()), minZoom: 0.05, maxZoom: 4,
    style: [
      { selector: "node", style: { shape: "ellipse", width: 30, height: 30, label: "data(short)", "font-size": 8, "font-family": "ui-monospace, Consolas, monospace", color: "#e6e8ec", "text-valign": "center", "text-halign": "center", "border-width": 1.5, "background-color": "#4a3306", "background-opacity": 0.85, "border-color": "#f59e0b" } },
      { selector: "node.green", style: { "background-color": "#0f3d22", "border-color": "#22c55e" } },
      { selector: "node.yellow", style: { "background-color": "#4a3306", "border-color": "#f59e0b" } },
      { selector: "node.red", style: { "background-color": "#4c1414", "border-color": "#ef4444" } },
      { selector: "node.premise", style: { shape: "hexagon", width: 44, height: 40 } },
      { selector: "node.principles", style: { shape: "octagon", width: 40, height: 40 } },
      { selector: "node.prn", style: { shape: "diamond", width: 22, height: 22 } },
      { selector: "node.labelled", style: { shape: "round-rectangle", width: 190, height: 58, label: "", "border-width": 1, "background-opacity": 0.7 } },
      { selector: "node.premise.labelled, node.principles.labelled", style: { shape: "round-rectangle", width: 200, height: 60 } },
      { selector: "node.prn.labelled", style: { shape: "round-rectangle", width: 170, height: 48 } },
      { selector: "node.dendro", style: { shape: "round-rectangle", width: "data(dw)", height: 30, label: "", "border-width": 1, "background-opacity": 0.7 } },
      { selector: "node.selected", style: { "border-width": 2.5 } },
      { selector: "node.dim", style: { opacity: 0.4 } },
      { selector: "edge", style: { width: 1.2, "curve-style": "bezier", "line-color": "#6b7280", "target-arrow-shape": "triangle", "target-arrow-color": "#6b7280", "arrow-scale": 0.8, label: "data(label)", "font-size": 9, color: "#cbd5e1", "text-background-color": "#0f1216", "text-background-opacity": 1, "text-background-padding": "2px" } },
      { selector: "edge.requires", style: { "line-style": "dashed", "line-color": "#60a5fa", "target-arrow-color": "#60a5fa" } },
      { selector: "edge.conflicts", style: { "line-style": "dotted", "line-color": "#ef4444", "target-arrow-shape": "tee", "source-arrow-shape": "tee", "source-arrow-color": "#ef4444", "target-arrow-color": "#ef4444" } },
      { selector: "edge.fork", style: { "curve-style": "round-segments", "segment-radii": 14, "edge-distances": "node-position", "target-arrow-shape": "none" } },
      { selector: "edge.straight", style: { "curve-style": "straight", width: 2 } },
      { selector: "edge.faded", style: { opacity: 0.12 } },
      { selector: "edge.dim", style: { opacity: 0.18 } },
      { selector: ".hidden", style: { display: "none" } },
    ],
    layout: { name: "preset" },
  });
  window.__cy = cy;
  // Fit shows everything, but never closer than a comfortable zoom: one box alone does not fill the screen.
  const fitAll = () => { cy.fit(undefined, 40); if (cy.zoom() > 1.2) { cy.zoom(1.2); cy.center(); } };
  // Positions come from a force simulation, as in a node canvas: a containment edge is a strong spring that
  // holds a child under its parent, a dependency edge a weaker spring that draws a box toward what it needs,
  // boxes repel each other and never overlap. The first arrangement is seeded by a layered pass so the
  // hierarchy reads top-down; after that the simulation runs live, including while a box is dragged.
  const dimsOf = (n) => [n.width(), n.height()];
  const sim = { alpha: 0, raf: 0, pinned: new Set(), heavy: new Set(), offsets: new Map(), top0: 0, lanes: null, rings: null, centre: { x: 0, y: 0 } };
  // Lanes: every level of the tree has its own horizontal band. A lane grows with the number of boxes in it
  // that carry dependency lines, so crowded levels get room; a box moves freely inside its lane.
  const LANE = 150;
  const depthOf = (n) => (n.id() === "ROOT" || n.id() === "PRINCIPLES" ? 0 : n.hasClass("prn") ? 1 : (node(n.id())?.depth ?? 0) + 1);
  const laneGeom = () => {
    const deepest = Math.max(0, ...cy.nodes().map((n) => depthOf(n)));
    const carriers = new Array(deepest + 1).fill(0);
    for (const n of cy.nodes()) if (n.connectedEdges(".dep").some((e) => !e.hasClass("hidden"))) carriers[depthOf(n)]++;
    const lanes = [];
    let top = sim.top0;
    for (let d = 0; d <= deepest; d++) { const h = LANE + 34 * Math.min(8, carriers[d]); lanes.push({ top, h, c: top + h / 2 }); top += h; }
    sim.lanes = lanes;
    return lanes;
  };
  const laneOf = (n) => (sim.lanes ?? laneGeom())[depthOf(n)] ?? { top: 0, h: LANE, c: 0 };
  const laneY = (n) => laneOf(n).c;
  // Inside its lane a box moves freely up and down; it only never leaves the band.
  const inLane = (n, y) => { const l = laneOf(n), half = l.h / 2 - 22; return Math.max(l.c - half, Math.min(l.c + half, y)); };
  // Radial: every dot in a number is a ring. The premise sits at the centre, the domains on the first ring,
  // their capabilities on the second, and so on; a ring is as thick as a lane and moves outward until its
  // circumference holds every box on it, and thick enough that its widest box clears the rings beside it. The
  // arrangement is computed outright, not simulated: every branch
  // owns a slice of its parent's slice, sized by how many boxes it shows, so siblings stand together; with
  // Order on, siblings are swapped around while that pulls the dependency lines apart; then the boxes on
  // each ring are spaced so none overlap. The containment lines fork like a dendrogram: out from the parent
  // to just inside the children's ring, around, and out to each child. Boxes cannot be dragged here.
  const ringOf = (n) => (n.id() === "ROOT" ? 0 : n.id() === "PRINCIPLES" ? 1 : n.hasClass("prn") ? 2 : n.id().replace(/^REQ-/, "").split(".").length);
  const closedSize = (n) => (n.hasClass("premise") ? [44, 40] : n.hasClass("principles") ? [40, 40] : n.hasClass("prn") ? [22, 22] : [30, 30]);
  const finalSize = (n) => (n.hasClass("dendro") ? [n.data("dw"), 30] : n.hasClass("labelled") ? cardSize(n) : closedSize(n));
  const ringGeom = () => {
    const deepest = Math.max(0, ...cy.nodes().map((n) => ringOf(n)));
    const carriers = new Array(deepest + 1).fill(0), need = new Array(deepest + 1).fill(0), ext = new Array(deepest + 1).fill(0);
    for (const n of cy.nodes()) { const r = ringOf(n), [w, h] = finalSize(n); need[r] += Math.max(w, h) + 30; ext[r] = Math.max(ext[r], w, h); if (n.connectedEdges(".dep").some((e) => !e.hasClass("hidden"))) carriers[r]++; }
    const root = cy.getElementById("ROOT");
    const r0 = root.length ? Math.max(...finalSize(root)) / 2 + 30 : 60;
    const rings = [{ inner: 0, outer: r0, c: 0, h: 2 * r0 }];
    for (let r = 1; r <= deepest; r++) { const h = Math.max(LANE + 34 * Math.min(8, carriers[r]), ext[r] + 60); const inner = Math.max(rings[r - 1].outer, need[r] / (2 * Math.PI) - h / 2); rings.push({ inner, outer: inner + h, c: inner + h / 2, h }); }
    sim.rings = rings;
    return rings;
  };
  const cart = (r, a) => ({ x: sim.centre.x + r * Math.cos(a), y: sim.centre.y + r * Math.sin(a) });
  const angleDiff = (to, from) => { let d = to - from; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };
  const layoutRadial = (animated) => {
    const rings = ringGeom();
    const radius = (id) => rings[ringOf(cy.getElementById(id))]?.c ?? 0;
    const kids = new Map();
    const kidsOf = (id) => { if (!kids.has(id)) kids.set(id, info(id).children.filter((c) => cy.getElementById(c).length)); return kids.get(id); };
    const size = new Map();
    const count = (id) => { let s = 1; for (const c of kidsOf(id)) s += count(c); size.set(id, s); return s; };
    count("ROOT");
    // every box's direction, from the slices, given the order of every box's children
    const lay = () => {
      const A = new Map([["ROOT", 0]]);
      const walk = (id, a0, a1) => { const ks = kidsOf(id), total = ks.reduce((s, c) => s + size.get(c), 0) || 1; let a = a0; for (const c of ks) { const span = ((a1 - a0) * size.get(c)) / total; A.set(c, a + span / 2); walk(c, a, a + span); a += span; } };
      walk("ROOT", -Math.PI / 2, (3 * Math.PI) / 2);
      return A;
    };
    // the dependency lines: a long one costs, and two whose middles are close cost more, so swaps pull them apart
    const deps = cy.edges(".dep").filter((e) => !e.hasClass("hidden")).map((e) => [e.source().id(), e.target().id()]);
    const cost = (A) => {
      const mids = deps.map(([s, t]) => { const p = cart(radius(s), A.get(s)), q = cart(radius(t), A.get(t)); return { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2, len: Math.hypot(p.x - q.x, p.y - q.y) }; });
      let c = 0;
      for (let i = 0; i < mids.length; i++) { c += mids[i].len * 0.2; for (let j = i + 1; j < mids.length; j++) { const d = Math.hypot(mids[i].x - mids[j].x, mids[i].y - mids[j].y); if (d < 260) c += (260 - d) * 2; } }
      return c;
    };
    let A = lay();
    if (adoptState.order && deps.length) {
      let best = cost(A);
      for (let sweep = 0; sweep < 3; sweep++) {
        let improved = false;
        for (const ks of kids.values()) for (let i = 0; i + 1 < ks.length; i++) {
          [ks[i], ks[i + 1]] = [ks[i + 1], ks[i]];
          const B = lay(), c = cost(B);
          if (c < best - 1e-6) { best = c; A = B; improved = true; } else [ks[i], ks[i + 1]] = [ks[i + 1], ks[i]];
        }
        if (!improved) break;
      }
    }
    // on each ring the boxes keep their order and move apart until none overlap along the ring; a box's extent
    // along the ring depends on where it stands: wide at the top and bottom, tall at the sides
    const byRing = new Map();
    for (const n of cy.nodes()) { if (n.id() === "ROOT") continue; const r = ringOf(n); (byRing.get(r) ?? byRing.set(r, []).get(r)).push(n); }
    for (const [r, group] of byRing) {
      const R = rings[r].c;
      const run = [...group].sort((a, b) => A.get(a.id()) - A.get(b.id()));
      const span = run.map((n) => { const a = A.get(n.id()), [w, h] = finalSize(n); return (Math.abs(w * Math.sin(a)) + Math.abs(h * Math.cos(a)) + 26) / R; });
      // the ring is a circle: the last box and the first are neighbours too, so the passes wrap around
      const as = run.map((n) => A.get(n.id())), N = run.length, TAU = 2 * Math.PI;
      for (let it = 0; it < 20 && N > 1; it++) {
        let moved = false;
        for (let i = 0; i < N; i++) { const j = (i + N - 1) % N, min = (i ? as[j] : as[j] - TAU) + (span[j] + span[i]) / 2; if (as[i] < min) { as[i] = min; moved = true; } }
        for (let i = N - 1; i >= 0; i--) { const j = (i + 1) % N, max = (i < N - 1 ? as[j] : as[j] + TAU) - (span[i] + span[j]) / 2; if (as[i] > max) { as[i] = max; moved = true; } }
        if (!moved) break;
      }
      run.forEach((n, i) => A.set(n.id(), as[i]));
    }
    const P = new Map(cy.nodes().map((n) => [n.id(), n.id() === "ROOT" ? { ...sim.centre } : cart(radius(n.id()), A.get(n.id()))]));
    // the forks, as segment lines: a line leaves a box from the middle of the side that faces the way it
    // goes, and arrives at the middle of the side that faces it, so it visibly meets the box instead of
    // slipping under a corner; the points are given relative to the straight line from parent to child
    const door = (n, p, dx, dy) => { const [w, h] = finalSize(n); if (Math.abs(dx) * h >= Math.abs(dy) * w) { const sx = Math.sign(dx) || 1; return { x: p.x + sx * (w / 2 + 18), y: p.y }; } const sy = Math.sign(dy) || 1; return { x: p.x, y: p.y + sy * (h / 2 + 18) }; };
    cy.batch(() => {
      for (const e of cy.edges(".contains")) {
        const s = e.source().id(), t = e.target().id(), S = P.get(s), T = P.get(t);
        if (!S || !T) continue;
        const rf = rings[ringOf(e.target())].inner + 10, at = A.get(t), pts = [];
        if (s === "ROOT") { pts.push(door(e.source(), S, Math.cos(at), Math.sin(at)), cart(rf, at)); }
        else { const as0 = A.get(s), da = angleDiff(at, as0), steps = Math.max(1, Math.ceil(Math.abs(da) / (Math.PI / 18))); pts.push(door(e.source(), S, Math.cos(as0), Math.sin(as0))); for (let k = 0; k <= steps; k++) pts.push(cart(rf, as0 + (da * k) / steps)); }
        pts.push(door(e.target(), T, -Math.cos(at), -Math.sin(at)));
        fork(e, S, T, pts);
      }
      cy.nodes().ungrabify();
      // the glide runs alongside a card that is still growing, not after it, so the overlays can keep up
      for (const n of cy.nodes()) { const p = P.get(n.id()); if (animated) n.animate({ position: p }, { duration: 320, easing: "ease-in-out", queue: false }); else n.position(p); }
    });
    laneLines();
    place();
    if (animated) follow(380);
  };
  const unfork = () => { cy.edges(".fork").removeClass("fork").removeStyle("segment-weights segment-distances"); cy.edges(".straight").removeClass("straight"); if (cy.nodes(".dendro").length) { cy.nodes().removeClass("dendro"); makeOverlays(); } cy.nodes().grabify(); };
  // A fork as a segment line: the points are given relative to the straight line from parent to child.
  const fork = (e, S, T, pts, cls = "fork") => {
    const vx = T.x - S.x, vy = T.y - S.y, L = Math.hypot(vx, vy) || 1;
    const ws = [], ds = [];
    for (const p of pts) { const px = p.x - S.x, py = p.y - S.y; ws.push(((px * vx + py * vy) / (L * L)).toFixed(4)); ds.push(((-px * vy + py * vx) / L).toFixed(2)); }
    e.addClass(cls).style({ "segment-weights": ws.join(" "), "segment-distances": ds.join(" ") });
  };
  // Dendrogram: left to right, one column per level, every box a single row showing its number and its
  // whole title; a column is as wide as its widest row. A leaf takes one row, a parent as many as its
  // children together and stands level with their middle, so a branch never overlaps another. Dotted
  // lines mark the columns and, inside a column, part one parent's children from the next's. Computed
  // outright like the rings, with the same forks: out of the parent's right side, down the gutter before
  // the children's column, into each child's left side. Nothing is collapsed here and nothing is dragged.
  const ROWH = 44, COLGAP = 72;
  const rowWidth = (() => {
    const ctx = document.createElement("canvas").getContext("2d"), cache = new Map();
    return (id) => {
      const title = info(id).title, key = id + "\n" + title;
      if (cache.has(key)) return cache.get(key);
      ctx.font = `600 11px ${getComputedStyle(document.body).fontFamily}`;
      const tw = ctx.measureText(title).width;
      ctx.font = `9px ${getComputedStyle(document.documentElement).getPropertyValue("--mono") || "ui-monospace, monospace"}`;
      const gw = ctx.measureText(id === "ROOT" ? "Premise" : id === "PRINCIPLES" ? "Principles" : id).width;
      const w = Math.ceil(8 + gw + 10 + 6 + tw + 8 + 6);
      cache.set(key, w);
      return w;
    };
  })();
  const layoutDendro = (animated) => {
    const kids = new Map();
    const kidsOf = (id) => { if (!kids.has(id)) kids.set(id, info(id).children.filter((c) => cy.getElementById(c).length)); return kids.get(id); };
    const depth = new Map(), order = [];
    const walk = (id, d) => { depth.set(id, d); order.push(id); for (const c of kidsOf(id)) walk(c, d + 1); };
    walk("ROOT", 0);
    const widths = new Map(cy.nodes().map((n) => [n.id(), rowWidth(n.id())]));
    const deepest = Math.max(0, ...depth.values());
    const cols = [];
    let left = 0;
    for (let d = 0; d <= deepest; d++) { let w = 120; for (const [id, dd] of depth) if (dd === d) w = Math.max(w, widths.get(id)); cols.push({ left, width: w, name: levelName(d) }); left += w + COLGAP; }
    const span = new Map();
    const extent = (id) => { const ks = kidsOf(id); const s = ks.length ? Math.max(ROWH, ks.reduce((a, c) => a + extent(c), 0)) : ROWH; span.set(id, s); return s; };
    extent("ROOT");
    const Y = new Map();
    const lay = (id, top) => {
      const ks = kidsOf(id), s = span.get(id);
      if (!ks.length) { Y.set(id, top + s / 2); return; }
      let y = top + (s - ks.reduce((a, c) => a + span.get(c), 0)) / 2;
      for (const c of ks) { lay(c, y); y += span.get(c); }
      Y.set(id, (Y.get(ks[0]) + Y.get(ks[ks.length - 1])) / 2);
    };
    lay("ROOT", 0);
    const seps = [];
    for (let d = 1; d <= deepest; d++) {
      const parents = order.filter((id) => depth.get(id) === d - 1 && kidsOf(id).length).sort((a, b) => Y.get(a) - Y.get(b));
      for (let i = 1; i < parents.length; i++) { const prev = kidsOf(parents[i - 1]), next = kidsOf(parents[i]); const a = prev[prev.length - 1], b = next[0]; seps.push({ x: cols[d].left, y: (Y.get(a) + span.get(a) / 2 + Y.get(b) - span.get(b) / 2) / 2, w: cols[d].width }); }
    }
    const P = new Map(cy.nodes().map((n) => { const id = n.id(), d = depth.get(id) ?? 0; return [id, { x: cols[d].left + widths.get(id) / 2, y: Y.get(id) ?? 0 }]; }));
    sim.dendro = { cols, seps, top: -ROWH, height: span.get("ROOT") + 2 * ROWH };
    cy.batch(() => {
      for (const n of cy.nodes()) n.addClass("dendro").data("dw", widths.get(n.id()));
      for (const e of cy.edges(".contains")) {
        const s = e.source().id(), t = e.target().id(), S = P.get(s), T = P.get(t);
        if (!S || !T) continue;
        const fx = cols[depth.get(t)].left - 26;
        fork(e, S, T, [{ x: S.x + widths.get(s) / 2 + 18, y: S.y }, { x: fx, y: S.y }, { x: fx, y: T.y }, { x: T.x - widths.get(t) / 2 - 18, y: T.y }]);
      }
      // in the tree a dependency is a straight line, drawn only while one of its ends is selected
      cy.edges(".dep").addClass("straight");
      applyDeps();
      cy.nodes().ungrabify();
      for (const n of cy.nodes()) { const p = P.get(n.id()); if (animated) n.animate({ position: p }, { duration: 320, easing: "ease-in-out", queue: false }); else n.position(p); }
    });
    // every box is a row here, so the overlays are rebuilt, not just moved
    makeOverlays();
    if (animated) follow(380);
  };
  // Which computed arrangement the view uses; the lanes use the simulation instead.
  const relayout = (animated) => (adoptState.mode === "radial" ? layoutRadial : layoutDendro)(animated);
  // Overlap is never allowed to stand. Boxes in the same lane separate sideways, since the lane clamp would undo
  // a vertical push; others separate along the axis of least overlap. A bright or just-dropped box has right of way.
  const separate = (arr, strength, iterations) => {
    for (let it = 0; it < iterations; it++) {
      let any = false;
      for (let i = 0; i < arr.length; i++) for (let j = i + 1; j < arr.length; j++) {
        const a = arr[i], b = arr[j];
        const dx = b.x - a.x, dy = b.y - a.y;
        const ox = (a.w + b.w) / 2 + 22 - Math.abs(dx), oy = (a.h + b.h) / 2 + 22 - Math.abs(dy);
        if (ox <= 0 || oy <= 0) continue;
        any = true;
        const sx = dx >= 0 ? 1 : dx < 0 ? -1 : (i % 2 ? 1 : -1), sy = dy >= 0 ? 1 : -1;
        const ha = sim.heavy.has(a.n.id()) || sim.pinned.has(a.n.id()), hb = sim.heavy.has(b.n.id()) || sim.pinned.has(b.n.id());
        const wa = ha && !hb ? 0 : hb && !ha ? 1 : a.bright && !b.bright ? 0 : b.bright && !a.bright ? 1 : 0.5, wb = 1 - wa;
        const sideways = ox < oy || (adoptState.bands && depthOf(a.n) === depthOf(b.n));
        if (sideways) { a.x -= sx * ox * wa * strength; b.x += sx * ox * wb * strength; } else { a.y -= sy * oy * wa * strength; b.y += sy * oy * wb * strength; }
      }
      if (!any) break;
    }
  };
  const collect = () => { const arr = []; for (const n of cy.nodes()) { const p = n.position(), [w, h] = dimsOf(n); arr.push({ n, x: p.x, y: p.y, fx: 0, fy: 0, w, h, bright: !n.hasClass("dim") }); } return arr; };
  // Ordering: within each lane, boxes are sorted by the average x of their neighbours in the lanes above and
  // below and of their dependency partners (the barycenter heuristic), swept down and up, then re-spaced in that
  // order. The simulation keeps doing the spacing; this pass only decides who stands left of whom.
  const orderLanes = (animated) => {
    if (!adoptState.bands || !adoptState.order) return;
    const lanes = new Map();
    for (const n of cy.nodes()) { const d = depthOf(n); (lanes.get(d) ?? lanes.set(d, []).get(d)).push(n); }
    const depths = [...lanes.keys()].sort((a, b) => a - b);
    const X = new Map(cy.nodes().map((n) => [n.id(), n.position().x]));
    const bary = (n) => {
      const xs = [];
      for (const e of n.connectedEdges()) { if (e.hasClass("hidden")) continue; const o = e.source().id() === n.id() ? e.target() : e.source(); xs.push(X.get(o.id())); }
      return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : X.get(n.id());
    };
    const respace = (group) => {
      const sorted = [...group].sort((a, b) => bary(a) - bary(b) || X.get(a.id()) - X.get(b.id()));
      const gap = 26;
      const want = sorted.map((n) => bary(n));
      // left to right, each box takes its wanted place unless that overlaps the one before; then a pass back
      // from the right pulls crowded runs toward where they wanted to be
      const xs = [];
      for (let i = 0; i < sorted.length; i++) { const minX = i ? xs[i - 1] + (sorted[i - 1].width() + sorted[i].width()) / 2 + gap : -Infinity; xs.push(Math.max(want[i], minX)); }
      for (let i = sorted.length - 2; i >= 0; i--) { const maxX = xs[i + 1] - (sorted[i].width() + sorted[i + 1].width()) / 2 - gap; if (xs[i] > maxX) xs[i] = maxX; }
      sorted.forEach((n, i) => X.set(n.id(), xs[i]));
    };
    for (let sweep = 0; sweep < 2; sweep++) {
      for (const d of depths) respace(lanes.get(d));
      for (const d of [...depths].reverse()) respace(lanes.get(d));
    }
    cy.batch(() => { for (const n of cy.nodes()) { if (sim.pinned.has(n.id())) continue; const p = { x: X.get(n.id()), y: n.position().y }; if (animated) n.animate({ position: p }, { duration: 320, easing: "ease-in-out" }); else n.position(p); } });
  };
  const hardSeparate = () => {
    const arr = collect();
    separate(arr, 1, 80);
    cy.batch(() => { for (const p of arr) { if (sim.pinned.has(p.n.id())) continue; p.n.position({ x: p.x, y: adoptState.bands ? inLane(p.n, p.y) : p.y }); } });
    place();
  };
  const tick = () => {
    if (adoptState.bands) laneGeom();
    const P = new Map();
    for (const n of cy.nodes()) { const p = n.position(), [w, h] = dimsOf(n); P.set(n.id(), { n, x: p.x, y: p.y, fx: 0, fy: 0, w, h, bright: !n.hasClass("dim") }); }
    for (const e of cy.edges()) {
      const a = P.get(e.source().id()), b = P.get(e.target().id());
      if (!a || !b) continue;
      if (e.hasClass("contains")) {
        // the child wants to sit a rank under its parent; the parent is pulled back only a little
        const tx = a.x, ty = a.y + 110 + (a.h + b.h) / 4, kx = 0.02, ky = adoptState.bands ? 0.006 : 0.09;
        const dx = tx - b.x, dy = ty - b.y;
        const stretch = Math.min(5, 1 + Math.abs(dx) / 220);
        b.fx += kx * stretch * dx; b.fy += ky * dy; a.fx -= kx * stretch * dx * 0.25; a.fy -= ky * dy * 0.25;
      } else if (!e.hasClass("hidden")) {
        a.deg = (a.deg ?? 0) + 1; b.deg = (b.deg ?? 0) + 1;
        const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1, L = 120, k = 0.05, f = k * (d - L) * Math.min(4, 1 + Math.max(0, d - L) / 250);
        a.fx += (f * dx) / d; a.fy += (f * dy) / d; b.fx -= (f * dx) / d; b.fy -= (f * dy) / d;
      }
    }
    const arr = [...P.values()];
    // siblings stick together: each child is drawn toward the centre of its parent's group
    const groups = new Map();
    for (const e of cy.edges(".contains")) { const c = P.get(e.target().id()); if (!c) continue; const k = e.source().id(); (groups.get(k) ?? groups.set(k, []).get(k)).push(c); }
    for (const g of groups.values()) { if (g.length < 2) continue; let cx = 0, cy0 = 0; for (const m of g) { cx += m.x; cy0 += m.y; } cx /= g.length; cy0 /= g.length; for (const m of g) { m.fx += 0.09 * (cx - m.x); m.fy += (adoptState.bands ? 0.02 : 0.04) * (cy0 - m.y); } }
    if (adoptState.bands) for (const p of arr) { const deg = p.deg ?? 0; const l = laneOf(p.n); const target = l.c + (deg ? -Math.min(l.h / 2 - 24, 10 + 14 * deg) : 12); p.fy += 0.05 * (target - p.y); }
    // Lines push boxes off them, and are pushed off boxes: a box near a line it is not an end of is nudged away,
    // perpendicular to the line, measured against the box's real rectangle; the line's ends get the opposite nudge.
    const segs = [];
    for (const e of cy.edges()) { if (e.hasClass("hidden")) continue; const a = P.get(e.source().id()), b = P.get(e.target().id()); if (a && b) segs.push({ a, b }); }
    for (const p of arr) for (const sg of segs) {
      if (sg.a === p || sg.b === p) continue;
      const ax = sg.a.x, ay = sg.a.y, vx = sg.b.x - ax, vy = sg.b.y - ay, len2 = vx * vx + vy * vy || 1;
      const t = Math.max(0.06, Math.min(0.94, ((p.x - ax) * vx + (p.y - ay) * vy) / len2));
      let dx = p.x - (ax + t * vx), dy = p.y - (ay + t * vy);
      const pad = p.w > 60 ? 44 : 28;
      const rx = p.w / 2 + pad, ry = p.h / 2 + pad;
      const dn = Math.hypot(dx / rx, dy / ry);
      if (dn >= 1) continue;
      let d = Math.hypot(dx, dy);
      if (d < 0.5) { dx = -vy; dy = vx; d = Math.hypot(dx, dy) || 1; }
      const f = 7 * (1 - dn);
      p.fx += (f * dx) / d; p.fy += (f * dy) / d;
      sg.a.fx -= (0.35 * f * dx) / d; sg.a.fy -= (0.35 * f * dy) / d; sg.b.fx -= (0.35 * f * dx) / d; sg.b.fy -= (0.35 * f * dy) / d;
    }
    for (let i = 0; i < arr.length; i++) for (let j = i + 1; j < arr.length; j++) {
      const a = arr[i], b = arr[j];
      const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 0.01;
      const size = (a.w + b.w + a.h + b.h) / 4;
      if (d < 220 + size * 2) { const f = Math.min(10, (2600 + 40 * size) / (d * d) * (size > 60 ? 3 : 1)); a.fx -= (f * dx) / d; a.fy -= (f * dy) / d; b.fx += (f * dx) / d; b.fy += (f * dy) / d; }
    }
    separate(arr, sim.pinned.size ? 0.3 : 0.9, 2);
    // a pinned box follows the mouse; a just-dropped block stays where it was put while the others clear out
    const gain = sim.alpha * (sim.pinned.size ? 0.35 : 1);
    cy.batch(() => { for (const p of arr) { if (sim.pinned.has(p.n.id()) || sim.heavy.has(p.n.id())) continue; p.n.position({ x: p.x + p.fx * gain, y: adoptState.bands ? inLane(p.n, p.y + p.fy * gain) : p.y + p.fy * gain }); } });
    place();
  };
  const run = () => {
    cancelAnimationFrame(sim.raf);
    const step = () => { tick(); sim.alpha *= 0.95; if (sim.alpha > 0.02) sim.raf = requestAnimationFrame(step); else { sim.alpha = 0; orderLanes(true); setTimeout(() => { hardSeparate(); keepInView(adoptState.selected); }, 340); sim.heavy.clear(); } };
    sim.raf = requestAnimationFrame(step);
  };
  // On the rings a settle is one fresh arrangement; several asked for in the same breath (a box and its
  // ancestors naming themselves) become one. In the lanes it is the simulation.
  const settle = (strength = 1) => { if (adoptState.mode !== "lanes") { if (!sim.relayout) sim.relayout = setTimeout(() => { sim.relayout = 0; relayout(true); }, 0); return; } sim.alpha = Math.max(sim.alpha, strength); run(); };
  const seed = () => { cy.nodes().union(cy.edges(".contains")).layout({ ...layout(), animate: false }).run(); sim.top0 = (cy.getElementById("ROOT").length ? cy.getElementById("ROOT").position().y : 0) - LANE / 2; sim.lanes = null; };
  window.__sim = { tick, settle, state: sim, hardSeparate, orderLanes };
  if (adoptState.mode === "lanes") seed();
  // The infinite canvas: a cross grid behind the nodes that pans and zooms with them.
  const grid = () => {
    const z = cy.zoom(), p = cy.pan();
    let step = 40 * z;
    while (step < 20) step *= 2;
    while (step > 80) step /= 2;
    el.style.backgroundSize = `${step}px ${step}px`;
    el.style.backgroundPosition = `${p.x}px ${p.y}px`;
  };
  // Focus: the boxes the human expanded, their descendants and their ancestors are active; the rest fade a little.
  // Focus follows the boxes the human expanded themselves; with none, everything is active.
  const applyFocus = () => {
    const shown = cy.nodes().map((n) => n.id());
    const active = new Set();
    for (const f of [...adoptState.focus]) if (!adoptState.expanded.has(f)) adoptState.focus.delete(f);
    const roots = new Set(adoptState.focus);
    if (adoptState.selected && cy.getElementById(adoptState.selected).length) roots.add(adoptState.selected);
    if (roots.size === 0) for (const id of shown) active.add(id);
    else for (const e of roots) {
      if (!cy.getElementById(e).length) continue;
      let p = e; while (p) { active.add(p); p = parentOf(p); }
      const walk = (id) => { for (const c of info(id).children) if (cy.getElementById(c).length) { active.add(c); walk(c); } };
      walk(e);
    }
    for (const n of cy.nodes()) n.toggleClass("dim", !active.has(n.id()));
    for (const e of cy.edges()) e.toggleClass("dim", e.source().hasClass("dim") && e.target().hasClass("dim"));
  };
  // Buttons that float over the boxes: the children handle under every box that has children, and, on a
  // named box, the card with its tag and title, the eye that hides the name and the ↗ that opens the card.
  const overlay = document.createElement("div");
  overlay.className = "overlays";
  el.appendChild(overlay);
  const makeOverlays = () => {
    overlay.innerHTML = "";
    for (const n of cy.nodes()) {
      const id = n.id();
      const kids = info(id).children.length;
      if (kids) {
        const open = adoptState.expanded.has(id);
        const b = document.createElement("button");
        b.className = "ov handle"; b.dataset.id = id; b.dataset.kind = "handle"; b.textContent = open ? "−" : `+${kids}`; b.title = open ? "Hide the children" : `Show ${kids} children`;
        b.addEventListener("click", (ev) => { ev.stopPropagation(); toggleExpand(id); });
        overlay.appendChild(b);
      }
      if (n.hasClass("dendro")) {
        const card = document.createElement("div");
        card.className = "ov-card row"; card.dataset.id = id; card.dataset.kind = "card"; card.style.width = n.data("dw") + "px";
        const tag = id === "ROOT" ? "Premise" : id === "PRINCIPLES" ? "Principles" : id;
        card.innerHTML = `<span class="tag">${esc(tag)}</span><span class="ttl">${esc(info(id).title)}</span>`;
        overlay.appendChild(card);
      } else if (n.hasClass("labelled")) {
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
    laneLines();
    place();
  };
  const levelName = (d) => (d === 0 ? "premise" : d === 1 ? "domains" : d === 2 ? "capabilities" : d === 3 ? "requirements" : "level " + d);
  const laneLines = () => {
    for (const old of overlay.querySelectorAll(".lane")) old.remove();
    if (adoptState.mode === "dendro") {
      const g = sim.dendro; if (!g) return;
      g.cols.forEach((c, d) => { const line = document.createElement("div"); line.className = "lane col"; line.dataset.depth = String(d); line.textContent = c.name; overlay.appendChild(line); });
      g.seps.forEach((_, i) => { const line = document.createElement("div"); line.className = "lane sep"; line.dataset.sep = String(i); overlay.appendChild(line); });
      return;
    }
    if (!adoptState.bands && adoptState.mode === "lanes") return;
    const radial = adoptState.mode === "radial";
    const deepest = Math.max(0, ...cy.nodes().map((n) => (radial ? ringOf(n) : depthOf(n))));
    for (let d = 0; d <= deepest; d++) { const line = document.createElement("div"); line.className = radial ? "lane ring" : "lane"; line.dataset.depth = String(d); line.textContent = levelName(d); overlay.appendChild(line); }
  };
  const place = () => {
    const r = el.getBoundingClientRect();
    const z = cy.zoom(), pan = cy.pan();
    if (adoptState.mode === "dendro") { const g = sim.dendro; if (g) { for (const line of overlay.querySelectorAll(".lane.col")) { const c = g.cols[Number(line.dataset.depth)]; if (!c) continue; line.style.left = (c.left - 12) * z + pan.x + "px"; line.style.top = g.top * z + pan.y + "px"; line.style.height = g.height * z + "px"; } for (const line of overlay.querySelectorAll(".lane.sep")) { const sp = g.seps[Number(line.dataset.sep)]; if (!sp) continue; line.style.left = (sp.x - 12) * z + pan.x + "px"; line.style.top = sp.y * z + pan.y + "px"; line.style.width = (sp.w + 24) * z + "px"; } } }
    else if (adoptState.mode === "radial") { const rings = sim.rings ?? ringGeom(), cx = sim.centre.x * z + pan.x, cy0 = sim.centre.y * z + pan.y; for (const line of overlay.querySelectorAll(".lane")) { const g = rings[Number(line.dataset.depth)]; if (!g) continue; const d = 2 * g.outer * z; line.style.left = (cx - d / 2) + "px"; line.style.top = (cy0 - d / 2) + "px"; line.style.width = d + "px"; line.style.height = d + "px"; } }
    else { const lanes = adoptState.bands ? (sim.lanes ?? laneGeom()) : []; for (const line of overlay.querySelectorAll(".lane")) { const l = lanes[Number(line.dataset.depth)]; if (l) line.style.top = (l.top * z + pan.y) + "px"; } }
    for (const h of overlay.children) {
      if (h.classList.contains("lane")) continue;
      const n = cy.getElementById(h.dataset.id);
      if (!n.length) { h.style.display = "none"; continue; }
      const p = n.renderedPosition(), w = n.renderedWidth(), hh = n.renderedHeight();
      const inside = p.x > -40 && p.y > -40 && p.x < r.width + 40 && p.y < r.height + 40;
      h.style.display = inside ? "" : "none";
      h.style.opacity = n.hasClass("dim") ? "0.4" : "";
      const z = cy.zoom();
      if (h.dataset.kind === "handle") { if (adoptState.mode === "dendro") { h.style.left = `${p.x + w / 2 + 16 * z}px`; h.style.top = `${p.y}px`; } else { h.style.left = `${p.x}px`; h.style.top = `${p.y + hh / 2}px`; } h.style.transform = `translate(-50%, -50%) scale(${z})`; }
      else if (h.dataset.kind === "card") { const [bw, bh] = cardSize(n); h.style.left = `${p.x}px`; h.style.top = `${p.y}px`; h.style.transform = `translate(-50%, -50%) scale(${(z * n.width()) / bw}, ${(z * n.height()) / bh})`; }
      else if (h.dataset.kind === "eye") { h.style.left = `${p.x + w / 2 - 14 * z}px`; h.style.top = `${p.y - hh / 2 + 13 * z}px`; h.style.transform = `translate(-50%, -50%) scale(${z})`; }
      else { h.style.left = `${p.x + w / 2 - 38 * z}px`; h.style.top = `${p.y - hh / 2 + 13 * z}px`; h.style.transform = `translate(-50%, -50%) scale(${z})`; }
    }
  };
  // A short glide of the view, driven by the same frame loop as the simulation; a second call while one runs
  // adds to the distance still to go.
  const panBy = (dx, dy) => {
    sim.panLeft = { x: (sim.panLeft?.x ?? 0) + dx, y: (sim.panLeft?.y ?? 0) + dy };
    if (sim.panRaf) return;
    const step = () => { const l = sim.panLeft; if (!l) { sim.panRaf = 0; return; } const kx = l.x * 0.25, ky = l.y * 0.25; cy.panBy({ x: kx, y: ky }); l.x -= kx; l.y -= ky; if (Math.abs(l.x) > 0.5 || Math.abs(l.y) > 0.5) sim.panRaf = requestAnimationFrame(step); else { cy.panBy({ x: l.x, y: l.y }); sim.panLeft = null; sim.panRaf = 0; } };
    sim.panRaf = requestAnimationFrame((sim.panStep = step));
  };
  // The selected or just-moved box stays on screen: the view pans just enough to show it whole.
  const keepInView = (id) => {
    const n = id ? cy.getElementById(id) : null;
    if (!n || !n.length) return;
    const r = el.getBoundingClientRect(), bb = n.renderedBoundingBox({ includeLabels: false, includeOverlays: false }), m = 24;
    let dx = 0, dy = 0;
    if (bb.x1 < m) dx = m - bb.x1; else if (bb.x2 > r.width - m) dx = r.width - m - bb.x2;
    if (bb.y1 < m) dy = m - bb.y1; else if (bb.y2 > r.height - m) dy = r.height - m - bb.y2;
    if (dx || dy) panBy(dx, dy);
  };
  // The floating menu in the canvas's top right corner, folded or unfolded with its caret: the view switch
  // at its head (levels as lanes, or as rings around the premise), the view's options below. The rings
  // show only what applies to them; the lanes-only options hide there.
  const menu = document.createElement("div");
  menu.className = "menu" + (adoptState.menu ? "" : " closed");
  menu.dataset.mode = adoptState.mode;
  const modeBtn = (m, label, title) => `<button class="btn small ${adoptState.mode === m ? "on" : ""}" data-mode="${m}" title="${title}">${label}</button>`;
  menu.innerHTML = `<div class="menu-head"><span class="mode">${modeBtn("lanes", "Lanes", "Levels as horizontal lanes")}${modeBtn("radial", "Radial", "Levels as rings around the premise")}${modeBtn("dendro", "Tree", "Levels as columns, left to right")}</span><button class="btn small caret" data-collapse="1" title="Fold or unfold the menu">▾</button></div>
    <div class="menu-body">
      <button class="btn small ${adoptState.labels ? "on" : ""}" data-labels="1" data-views="lanes radial" title="Show or hide every name">${adoptState.labels ? "Collapse" : "Expand"}</button>
      <button class="btn small ${adoptState.deps ? "on" : ""}" data-deps="1" data-views="lanes radial dendro" title="Show or hide the requires and conflicts links">Dependencies</button>
      <button class="btn small ${adoptState.edges ? "on" : ""}" data-edges="1" data-views="lanes" title="Show or hide every line">Edges</button>
      <button class="btn small ${adoptState.bands ? "on" : ""}" data-bands="1" data-views="lanes" title="Keep every level in its own lane">Levels</button>
      <button class="btn small ${adoptState.order ? "on" : ""}" data-order="1" data-views="lanes" title="Sort each lane to untangle the lines">Order</button>
      <button class="btn small" data-fit="1" data-views="lanes radial dendro" title="Bring everything into view">Fit</button>
      <button class="btn small" data-expand-all="1" data-views="lanes dendro" title="Open every box down to the leaves">Show all</button>
      <p class="menu-hint">Double-click a box to open it. The handle beside it shows its children. Drag to pan, wheel to zoom.</p>
    </div>`;
  el.appendChild(menu);
  for (const ev of ["pointerdown", "mousedown", "touchstart", "wheel"]) menu.addEventListener(ev, (e) => e.stopPropagation());
  menu.querySelector("[data-collapse]").addEventListener("click", () => { adoptState.menu = !adoptState.menu; menu.classList.toggle("closed", !adoptState.menu); });
  const labelButton = () => { const b = menu.querySelector("[data-labels]"); b.classList.toggle("on", adoptState.labels); b.textContent = adoptState.labels ? "Collapse" : "Expand"; };
  // The principles keep one place in every view, the canvas's top left corner; each row opens its card.
  const leftStack = document.createElement("div");
  leftStack.className = "left-stack";
  el.appendChild(leftStack);
  const prnBox = document.createElement("div");
  prnBox.className = "menu principles" + (adoptState.prn ? "" : " closed");
  const prnRows = snap.canon.principles.map((p) => `<button class="btn small prn-row" data-prn="${esc(p.id)}" title="${esc(p.statement)}"><i class="sw ${colorOf(p.id)}"></i><span class="tag">${esc(p.id)}</span><span>${esc(p.title)}</span></button>`).join("") || `<span class="muted">none yet</span>`;
  prnBox.innerHTML = `<div class="menu-head"><b>Principles</b><button class="btn small caret" data-collapse="1" title="Fold or unfold the principles">▾</button></div><div class="menu-body">${prnRows}</div>`;
  leftStack.appendChild(prnBox);
  for (const ev of ["pointerdown", "mousedown", "touchstart", "wheel"]) prnBox.addEventListener(ev, (e) => e.stopPropagation());
  // The Issues panel: the session's questions, which open when the human clicks them, and the boxes that need the
  // human; a click highlights a box, a double-click opens its card. Nothing here opens by itself.
  const issuesBox = document.createElement("div");
  issuesBox.className = "menu issues" + (adoptState.issuesOpen ? "" : " closed");
  issuesBox.innerHTML = `<div class="menu-head"><b>Issues</b><span class="pill" id="issues-count" hidden></span><button class="btn small caret" data-collapse="1" title="Fold or unfold the issues">▾</button></div><div class="menu-body" id="issues-body"></div>`;
  leftStack.appendChild(issuesBox);
  for (const ev of ["pointerdown", "mousedown", "touchstart", "wheel"]) issuesBox.addEventListener(ev, (e) => e.stopPropagation());
  issuesBox.querySelector("[data-collapse]").addEventListener("click", () => { adoptState.issuesOpen = !adoptState.issuesOpen; issuesBox.classList.toggle("closed", !adoptState.issuesOpen); });
  renderIssues(lastSession);
  prnBox.querySelector("[data-collapse]").addEventListener("click", () => { adoptState.prn = !adoptState.prn; prnBox.classList.toggle("closed", !adoptState.prn); });
  for (const b of prnBox.querySelectorAll("[data-prn]")) b.addEventListener("click", () => openPopup(b.dataset.prn));
  const setMode = (mode) => {
    if (adoptState.mode === mode) return;
    adoptState.mode = mode;
    menu.dataset.mode = mode;
    for (const b of menu.querySelectorAll(".mode button")) b.classList.toggle("on", b.dataset.mode === mode);
    cancelAnimationFrame(sim.raf); sim.alpha = 0; sim.heavy.clear();
    unfork();
    applyDeps();
    if (mode !== "lanes") { const root = cy.getElementById("ROOT"); sim.centre = root.length ? { ...root.position() } : { x: 0, y: 0 }; relayout(true); setTimeout(() => fitAll(), 340); return; }
    const before = new Map(cy.nodes().map((n) => [n.id(), { ...n.position() }]));
    seed();
    const target = new Map(cy.nodes().map((n) => [n.id(), { ...n.position() }]));
    cy.batch(() => { for (const [id, p] of before) cy.getElementById(id).position(p); for (const [id, p] of target) cy.getElementById(id).animate({ position: p }, { duration: 420, easing: "ease-in-out", queue: false }); });
    laneLines();
    follow(440);
    setTimeout(() => { fitAll(); settle(0.8); }, 440);
  };
  for (const b of menu.querySelectorAll(".mode button")) b.addEventListener("click", () => setMode(b.dataset.mode));
  window.__sim.layoutRadial = layoutRadial; window.__sim.layoutDendro = layoutDendro;
  // While boxes glide on their own, outside the simulation, the overlays follow them frame by frame.
  const follow = (ms) => { const until = performance.now() + ms; const loop = () => { place(); if (performance.now() < until) requestAnimationFrame(loop); }; requestAnimationFrame(loop); };
  // The dependency lines follow the Dependencies and Edges switches; in the tree only the selected row's show.
  const applyDeps = () => { const on = adoptState.deps && adoptState.edges, sel = adoptState.selected; for (const e of cy.edges(".dep")) e.toggleClass("hidden", !on || (adoptState.mode === "dendro" && e.source().id() !== sel && e.target().id() !== sel)); };
  const select = (id) => { adoptState.selected = id; cy.$("node.selected").removeClass("selected"); cy.getElementById(id).addClass("selected"); applyFocus(); applyDeps(); place(); keepInView(id); };
  cy.on("tap", (e) => { if (e.target === cy && adoptState.selected) { adoptState.selected = null; cy.$("node.selected").removeClass("selected"); applyFocus(); applyDeps(); place(); } });
  // A box grows into its card over a third of a second while the simulation runs, and shrinks back the same way.
  const cardSize = (n) => (n.hasClass("dendro") ? [n.data("dw"), 30] : n.hasClass("prn") ? [170, 48] : n.hasClass("premise") || n.hasClass("principles") ? [200, 60] : [190, 58]);
  const showLabel = (id) => {
    const n = cy.getElementById(id);
    if (!n.length || n.hasClass("labelled")) return;
    adoptState.labelled.add(id);
    const [w0, h0] = [n.width(), n.height()], [w, h] = cardSize(n);
    n.addClass("labelled").style({ width: w0, height: h0 });
    n.animate({ style: { width: w, height: h } }, { duration: 320, easing: "ease-out", queue: false, complete: () => { n.removeStyle("width height"); place(); if (id === adoptState.selected) keepInView(id); } });
    makeOverlays();
    settle(0.7);
  };
  const hideLabel = (id) => {
    adoptState.labelled.delete(id);
    if (adoptState.labels) { adoptState.labels = false; labelButton(); for (const o of cy.nodes()) if (!adoptState.labelled.has(o.id()) && o.id() !== id) o.removeClass("labelled"); }
    const n = cy.getElementById(id);
    const [w0, h0] = [n.width(), n.height()];
    n.removeClass("labelled").style({ width: w0, height: h0 });
    const [w, h] = closedSize(n);
    n.animate({ style: { width: w, height: h } }, { duration: 260, easing: "ease-in", queue: false, complete: () => { n.removeStyle("width height"); place(); } });
    makeOverlays();
    settle(0.4);
  };
  // Expanding or collapsing changes the graph in place: new boxes grow out of their parent and everything
  // glides to the new layered layout.
  const sync = () => {
    const show = adoptScope();
    const shown = new Set(show);
    cy.remove(cy.nodes().filter((n) => !shown.has(n.id())));
    const have = new Set(cy.nodes().map((n) => n.id()));
    const fresh = elementsFor(show).filter((e) => (e.data.source ? !cy.getElementById(e.data.id).length : !have.has(e.data.id)));
    let k = 0;
    for (const e of fresh) if (!e.data.source) { const parent = parentOf(e.data.id); const pp = parent && cy.getElementById(parent).length ? cy.getElementById(parent).position() : { x: 0, y: 0 }; e.position = { x: pp.x + (k++ % 7 - 3) * 12, y: pp.y + 40 }; }
    cy.add(fresh);
    applyFocus();
    makeOverlays();
    settle(0.8);
  };
  adoptState.sync = sync;
  let lastTap = { id: null, at: 0 };
  cy.on("mouseover", "edge.dep", (e) => cy.edges(".dep").not(e.target).addClass("faded"));
  cy.on("mouseout", "edge.dep", () => cy.edges(".dep").removeClass("faded"));
  cy.on("tap", "edge.dep", (e) => {
    const s = e.target.source().id(), t = e.target.target().id();
    const other = s === adoptState.selected ? t : t === adoptState.selected ? s : t;
    cy.edges(".dep").removeClass("faded");
    select(other);
    if (adoptState.mode !== "dendro") showLabel(other);
  });
  cy.on("tap", "node", (e) => {
    const id = e.target.id(), now = Date.now();
    if (lastTap.id === id && now - lastTap.at < 400) { lastTap = { id: null, at: 0 }; select(id); openPopup(id); return; }
    lastTap = { id, at: now };
    select(id);
    if (adoptState.mode === "dendro") return;
    showLabel(id);
    // the path to the root reads along with the box: every ancestor shows its name too
    let p = parentOf(id);
    while (p && cy.getElementById(p).length) { showLabel(p); p = parentOf(p); }
  });
  const block = (id) => { const out = []; const walk = (x) => { for (const c of info(x).children) if (cy.getElementById(c).length) { out.push(c); walk(c); } }; walk(id); return out; };
  cy.on("grab", "node", (e) => {
    const id = e.target.id(), p = e.target.position();
    sim.pinned = new Set([id, ...block(id)]);
    sim.offsets = new Map([...sim.pinned].filter((k) => k !== id).map((k) => { const q = cy.getElementById(k).position(); return [k, { x: q.x - p.x, y: q.y - p.y }]; }));
    settle(0.35);
  });
  cy.on("drag", "node", (e) => {
    const p = e.target.position();
    cy.batch(() => { for (const [k, o] of sim.offsets) cy.getElementById(k).position({ x: p.x + o.x, y: p.y + o.y }); });
    place();
    if (sim.alpha < 0.15) settle(0.18);
  });
  cy.on("free", "node", (e) => { if (adoptState.bands) cy.batch(() => { for (const id of sim.pinned) { const n = cy.getElementById(id); n.position({ x: n.position().x, y: inLane(n, n.position().y) }); } }); sim.heavy = new Set(sim.pinned); sim.pinned = new Set(); sim.offsets = new Map(); settle(0.7); keepInView(e.target.id()); });
  let labelZoom = 0;
  cy.on("viewport", () => {
    grid(); place(); adoptState.view = { zoom: cy.zoom(), pan: cy.pan() };
    const z = cy.zoom();
    if (Math.abs(z - labelZoom) > 0.05) { labelZoom = z; cy.style().selector("edge").style("font-size", Math.max(3, Math.min(9, 9 / z))).update(); }
  });
  cy.on("layoutstop", place);
  cy.ready(() => {
    // The opening arrangement settles fully before it is shown.
    if (adoptState.mode !== "lanes") relayout(false);
    else {
      sim.alpha = 1;
      for (let i = 0; i < 260 && sim.alpha > 0.02; i++) { tick(); sim.alpha *= 0.985; }
      sim.alpha = 0;
      orderLanes(false);
      hardSeparate();
    }
    if (adoptState.view) cy.viewport(adoptState.view); else fitAll();
    grid(); applyFocus(); makeOverlays();
    // a redraw with a selected box brings that box on screen
    if (adoptState.selected && cy.getElementById(adoptState.selected).length) keepInView(adoptState.selected);
  });
  if (window.ResizeObserver) new ResizeObserver(() => { cy.resize(); grid(); place(); }).observe(el);
  $main.querySelector("[data-fit]")?.addEventListener("click", () => { fitAll(); });
  $main.querySelector("[data-labels]")?.addEventListener("click", () => {
    adoptState.labels = !adoptState.labels;
    labelButton();
    if (adoptState.labels) { adoptState.labelled = new Set(cy.nodes().map((n) => n.id())); cy.nodes().addClass("labelled"); }
    else { adoptState.labelled.clear(); cy.nodes().removeClass("labelled"); }
    makeOverlays();
    settle(0.8);
  });
  $main.querySelector("[data-deps]")?.addEventListener("click", (ev) => { adoptState.deps = !adoptState.deps; ev.currentTarget.classList.toggle("on", adoptState.deps); applyDeps(); });
  $main.querySelector("[data-edges]")?.addEventListener("click", (ev) => { adoptState.edges = !adoptState.edges; ev.currentTarget.classList.toggle("on", adoptState.edges); cy.edges().toggleClass("hidden", !adoptState.edges); applyDeps(); });
  $main.querySelector("[data-bands]")?.addEventListener("click", (ev) => { adoptState.bands = !adoptState.bands; ev.currentTarget.classList.toggle("on", adoptState.bands); laneLines(); settle(0.6); });
  $main.querySelector("[data-order]")?.addEventListener("click", (ev) => { adoptState.order = !adoptState.order; ev.currentTarget.classList.toggle("on", adoptState.order); settle(0.5); });
  $main.querySelector("[data-expand-all]")?.addEventListener("click", () => { for (const id of Object.keys(snap.canon.nodes)) if (node(id).children.length) adoptState.expanded.add(id); adoptState.focus.clear(); sync(); });
  $main.querySelector("[data-finish]")?.addEventListener("click", async () => { try { await post("/api/finish", {}); startWorking("you asked to finish the adoption"); } catch (e) { showToast(e); } });
}
function toggleExpand(id) { ensureExpanded(); if (adoptState.expanded.has(id)) { adoptState.expanded.delete(id); adoptState.focus.delete(id); } else { adoptState.expanded.add(id); adoptState.focus.add(id); } if (adoptState.sync && $main.querySelector(".adopt #cy")) adoptState.sync(); else render(); }
// The canvas shows a box: selected, its ancestors opened, the view drawn around it, and its card when asked.
function focusOnCanvas(id, open, byHuman = false) {
  // while the human has a card open, the session's pointing is noted in the chat and moves nothing; the
  // human's own click closes the card first, unless they are mid-rewrite
  if (!$popup.hidden) {
    if (!byHuman) { adoptState.selected = id; appendChat([{ kind: "sys", text: `The session points at ${id}; your card stays as it is.`, at: new Date().toISOString() }]); return; }
    if (editingDraft()) { showToast("Finish or cancel your rewrite first."); return; }
    closePopup();
  }
  adoptState.selected = id; if (id !== "ROOT") expandTo(id); location.hash = `#/adopt/${id}`; render(); if (open) openPopup(id);
}
function expandTo(id) { ensureExpanded(); if (id.startsWith("PRN-")) { adoptState.expanded.add("PRINCIPLES"); return; } let p = node(id)?.parent; while (p) { adoptState.expanded.add(p); p = node(p)?.parent; } }

// The node card: what the node says, why it has its colour, and the actions on it.
const $popup = document.getElementById("popup");
function openPopup(id) {
  const draft = editingDraft();
  if (draft && draft.id !== id) { showToast(`Finish or cancel your rewrite of ${draft.id} first.`); return; }
  const isRoot = id === "ROOT";
  const isPrinciples = id === "PRINCIPLES";
  const prn = id.startsWith("PRN-") ? snap.canon.principles.find((p) => p.id === id) : null;
  // a principle is its own card: its statement, its own state, and the same actions as a node
  const n = isRoot || isPrinciples ? null : prn ? { title: prn.title, state: prn.state, children: [] } : node(id);
  if (!n && !isRoot && !isPrinciples) return;
  if (isPrinciples) { openTextCard(id, "Principles", snap.canon.principles.map((p) => `<p><i class="sw ${colorOf(p.id)}"></i><b>${esc(p.id)} ${esc(p.title)}</b> ${esc(p.statement)}${p.source ? ` <span class="muted">Source: ${esc(p.source)}</span>` : ""}</p>`).join("")); return; }
  const color = colorOf(id);
  const state = isRoot ? snap.canon.root?.state : n.state;
  // every side of a contradiction: the boxes this one conflicts with, either way round
  const conflictIds = isRoot || prn ? [] : [...new Set([...(n.conflicts ?? []), ...Object.values(snap.canon.nodes).filter((o) => (o.conflicts ?? []).includes(id)).map((o) => o.id)])].filter((x) => snap.canon.nodes[x]);
  const because = color === "red"
    ? (state === "open" ? "The session could not decide this; it is listed under Issues, where you settle it." : state === "contested" ? (conflictIds.length ? "This box and another contradict each other; the tabs show both. Keep one or rewrite." : "Two statements pull against each other; the tabs show each. Keep one or rewrite.") : "A check flagged it; see below.")
    : color === "yellow" ? "The session's guess from your documents. Approve it, rewrite it, or delete it." : "Approved by you.";
  const fs = isRoot || prn ? [] : findingsFor(id).filter((f) => f.level !== "info");
  const kids = isRoot ? snap.canon.roots.length : n.children.length;
  const bodyHtml = isRoot ? stripHtmlSection(snap.html[id] ?? "", "Principles") : prn ? `<p>${esc(prn.statement)}</p>${prn.source ? `<p class="muted">Source: ${esc(prn.source)}</p>` : ""}` : snap.html[id];
  // ... and the statements a contested box records against each other; each side gets a tab beside the box's own text
  const contestedHtml = isRoot || prn ? "" : extractHtmlSection(bodyHtml ?? "", "Contested");
  const statements = [...contestedHtml.matchAll(/<li>([\s\S]*?)<\/li>/g)].map((m) => m[1]);
  // the session's summary of the contradiction: the paragraph under the heading, before the statements
  const conflictSummary = /<\/h2>\s*<p>([\s\S]*?)<\/p>\s*<ul>/.exec(contestedHtml)?.[1] ?? "";
  const panes = [];
  // each statement names where it comes from: the file references in it become a row of chips under it
  const refRe = /[A-Za-z0-9_.\/-]+\.[A-Za-z0-9]+:\d+(?:-\d+)?/g, refOne = /[A-Za-z0-9_.\/-]+\.[A-Za-z0-9]+:\d+(?:-\d+)?/;
  if (statements.length >= 2) statements.forEach((st, i) => {
    const refs = [...new Set(st.replace(/<[^>]+>/g, "").match(refRe) ?? [])];
    const text = st.replace(/\s*\(([^()]*)\)/g, (m, inner) => (refOne.test(inner) && inner.replace(refRe, "").replace(/[;,\s]/g, "") === "" ? "" : m));
    panes.push({ label: `Statement ${i + 1}`, html: `<p class="sub">Statement ${i + 1} of ${statements.length}, as the contested section records it.</p><p>${text}</p>${refs.length ? `<div class="sources"><span class="muted">Where it comes from</span>${refs.map((r) => `<code>${esc(r)}</code>`).join("")}</div>` : `<p class="muted">No source recorded for this statement.</p>`}` });
  });
  for (const cid of conflictIds) { const o = snap.canon.nodes[cid]; panes.push({ label: cid, html: `<p class="sub"><i class="sw ${colorOf(cid)}"></i>${esc(cid)} ${badge(o.state)} <b>${esc(o.title)}</b> conflicts with this box. <a href="#" data-open="${esc(cid)}">Open ${esc(cid)}</a></p>${snap.html[cid] ?? ""}` }); }
  // the Deferred list, the parts not yet cut, lives in a tab of its own so the intent stands alone
  const deferredHtml = isRoot || prn ? "" : extractHtmlSection(bodyHtml ?? "", "Deferred");
  if (deferredHtml) panes.push({ label: `Deferred (${(deferredHtml.match(/<li/g) || []).length})`, html: deferredHtml });
  // an open box offers its suggestions as choices; picking one makes it the box's text in the human's name
  const optionsHtml = isRoot || prn || state !== "open" ? "" : extractHtmlSection(bodyHtml ?? "", "Options");
  const choices = [...optionsHtml.matchAll(/<li>([\s\S]*?)<\/li>/g)].map((m) => m[1]);
  let mainHtml = bodyHtml ?? "";
  if (statements.length >= 2) mainHtml = stripHtmlSection(mainHtml, "Contested");
  if (deferredHtml) mainHtml = stripHtmlSection(mainHtml, "Deferred");
  if (choices.length) mainHtml = stripHtmlSection(mainHtml, "Options");
  $popup.innerHTML = `
    <div class="popup-head"><span class="id">${esc(id)}</span> ${badge(state ?? "assumed")} <span><i class="sw ${color}"></i><span class="muted">${because}</span></span><button class="btn small" id="pp-close" title="Close">✕</button></div>
    <h2>${esc(isRoot ? snap.canon.root?.title ?? "Premise" : n.title)}</h2>
    ${state === "contested" ? (conflictSummary ? `<p class="conflict-summary">${conflictSummary}</p>` : `<p class="conflict-summary muted">No summary of the contradiction yet. <button class="btn small" id="pp-explain">Ask the session to explain</button></p>`) : ""}
    ${panes.length ? `<div class="pp-tabs"><button class="btn small on" data-pane="-1">Intent</button>${panes.map((p, i) => `<button class="btn small" data-pane="${i}">${esc(p.label)}</button>`).join("")}</div>` : ""}
    <div class="popup-body body" id="pp-body">${markSections(mainHtml || "<p class='muted'>No text yet.</p>")}</div>
    ${panes.map((p, i) => `<div class="popup-body body pp-pane" data-pane="${i}" hidden>${markSections(p.html)}</div>`).join("")}
    <div id="pp-editor" class="editor" hidden></div>
    ${fs.length ? `<ul class="pp-findings">${fs.map((f) => `<li>${badge(f.level)} ${esc(f.message)}</li>`).join("")}</ul>` : ""}
    <div class="row pp-actions">
      ${color !== "green" && state !== "open" ? `<button class="btn primary" id="pp-approve" title="Keep it as written; it becomes approved by you">Approve</button>` : ""}
      <button class="btn" id="pp-edit" title="Say it in your own words">${state === "open" ? "Write it yourself" : "Rewrite"}</button>
      ${isRoot ? "" : `<button class="btn" id="pp-delete" title="Remove this node and everything under it">Delete</button>`}
      ${kids && !isRoot ? `<button class="btn" id="pp-toggle">${adoptState.expanded?.has(id) ? "Hide children" : `Show ${kids} children`}</button>` : ""}
      ${isRoot || prn ? "" : `<button class="btn" id="pp-define" title="Ask the session to define this branch further">Define further</button>`}
    </div>
    <p class="sub">Select any words above to ask the session about them in the chat.</p>
    <i class="pp-resize nw"></i><i class="pp-resize ne"></i><i class="pp-resize sw"></i><i class="pp-resize se"></i>`;
  const wasHidden = $popup.hidden;
  $popup.hidden = false;
  $popup.dataset.id = id;
  if (wasHidden) centerPopup();
  wirePopupMoves();
  $popup.querySelector("#pp-close").addEventListener("click", () => { if (editingDraft() && !confirm("Discard your rewrite?")) return; closePopup(); });
  for (const b of $popup.querySelectorAll(".pp-tabs button")) b.addEventListener("click", () => { const k = b.dataset.pane; for (const o of $popup.querySelectorAll(".pp-tabs button")) o.classList.toggle("on", o === b); $popup.querySelector("#pp-body").hidden = k !== "-1"; for (const pane of $popup.querySelectorAll(".pp-pane")) pane.hidden = pane.dataset.pane !== k; });
  $popup.querySelector("#pp-explain")?.addEventListener("click", async () => { try { await post("/api/message", { text: `Explain the contradiction in ${id} in one or two sentences: what the two statements cannot both hold, and what choosing decides. Record it as the first paragraph under its Contested heading.`, nodeId: id }); startWorking(`you asked for an explanation of ${id}`); } catch (e) { showToast(e); } });
  for (const a of $popup.querySelectorAll("[data-open]")) a.addEventListener("click", (ev) => { ev.preventDefault(); if (editingDraft()) { showToast("Finish or cancel your rewrite first."); return; } closePopup(); focusOnCanvas(a.dataset.open, true); });
  $popup.querySelector("#pp-approve")?.addEventListener("click", async () => {
    try { await post(`/api/node/${encodeURIComponent(id)}/approve`, {}); closePopup(); await load(); render(); startWorking(`you approved ${id}`); } catch (e) { showToast(e); }
  });
  $popup.querySelector("#pp-delete")?.addEventListener("click", async () => {
    if (!confirm(`Delete ${id}${kids ? ` and its ${kids} children` : ""}? The session will re-check what depended on it.`)) return;
    try { await fetch(`/api/node/${encodeURIComponent(id)}`, { method: "DELETE" }); closePopup(); adoptState.selected = null; await load(); render(); startWorking(`you deleted ${id}`); } catch (e) { showToast(e); }
  });
  $popup.querySelector("#pp-toggle")?.addEventListener("click", () => { toggleExpand(id); openPopup(id); });
  $popup.querySelector("#pp-define")?.addEventListener("click", async () => { try { await post("/api/refine", { id }); startWorking(`you asked the session to define ${id} further`); } catch (e) { showToast(e); } });
  const startEdit = async (keep) => {
    const editor = $popup.querySelector("#pp-editor");
    const raw = keep || prn ? { text: "" } : await fetch(`/api/node/${encodeURIComponent(id)}/raw`).then((r) => r.json()).catch(() => ({ text: "" }));
    const intent = keep ? keep.intent : prn ? prn.statement : (/^##\s+Intent\b[^\n]*\n([\s\S]*?)(?=^##\s|(?![\s\S]))/m.exec(raw.text ?? "")?.[1] ?? "").trim();
    editor.innerHTML = `<p class="sub">Your words replace the session's and are recorded as stated.</p>
      ${isRoot ? "" : `<input id="pp-title" value="${esc(keep?.title ?? n.title)}" placeholder="Title, in plain words" />`}
      <textarea id="pp-intent" rows="${Math.max(6, Math.min(18, intent.split("\n").length + 2))}" placeholder="What must hold, in your words">${esc(intent)}</textarea>
      <div class="row"><button class="btn primary" id="pp-save">Save</button><button class="btn" id="pp-cancel">Cancel</button></div>`;
    if (!keep) editBase = { id, html: snap.html[id] ?? "" };
    // the text gives way to the editor, in its place; Cancel brings the card back as it was
    editor.hidden = false;
    for (const sel of ["#pp-body", ".pp-pane", ".pp-tabs", ".conflict-summary", "#pp-choices", "#pp-approve", "#pp-edit", "#pp-delete", "#pp-toggle", "#pp-define"]) for (const el of $popup.querySelectorAll(sel)) el.hidden = true;
    editor.querySelector("#pp-intent").focus();
    editor.querySelector("#pp-cancel").addEventListener("click", () => { editor.innerHTML = ""; editBase = null; openPopup(id); });
    editor.querySelector("#pp-save").addEventListener("click", async () => {
      const body = { intent: editor.querySelector("#pp-intent").value, title: editor.querySelector("#pp-title")?.value };
      try { await post(`/api/node/${encodeURIComponent(id)}`, body, "PUT"); closePopup(); await load(); render(); startWorking(`you rewrote ${id}`); } catch (e) { showToast(e); }
    });
  };
  $popup.querySelector("#pp-edit").addEventListener("click", () => startEdit());

  if (draft) startEdit(draft);
}
function closePopup() { $popup.hidden = true; delete $popup.dataset.id; editBase = null; document.getElementById("conflict").hidden = true; window.CSS?.highlights?.delete("quote"); }
// A rewrite in progress: what the human has typed, so that no redraw can lose it.
function editingDraft() {
  if ($popup.hidden) return null;
  const ta = $popup.querySelector("#pp-editor #pp-intent");
  if (!ta) return null;
  return { id: $popup.dataset.id, title: $popup.querySelector("#pp-editor #pp-title")?.value, intent: ta.value };
}
// The text a rewrite started from. When the session rewrites that box meanwhile, the human chooses: keep
// what they typed, or take the session's words; the session hears which as an edit-conflict entry.
let editBase = null;
function checkConflict() {
  const d = editingDraft();
  if (!d || !editBase || editBase.id !== d.id) return;
  const dlg = document.getElementById("conflict");
  if ((snap.html[d.id] ?? "") === editBase.html || !dlg.hidden) return;
  document.getElementById("conflict-sub").textContent = d.id;
  document.getElementById("conflict-text").textContent = `The session rewrote ${d.id} while you were writing. Keep your version and go on, or switch to the session's words and drop what you typed?`;
  dlg.hidden = false;
  chime();
}
{
  const dlg = document.getElementById("conflict");
  const tell = (choice, id) => post("/api/conflict", { id, choice }).catch(() => {});
  document.getElementById("conflict-keep").addEventListener("click", () => { const d = editingDraft(); dlg.hidden = true; if (!d) return; editBase = { id: d.id, html: snap.html[d.id] ?? "" }; tell("keep", d.id); });
  document.getElementById("conflict-take").addEventListener("click", () => { const d = editingDraft(); dlg.hidden = true; if (!d) return; $popup.querySelector("#pp-editor").innerHTML = ""; editBase = null; tell("take", d.id); openPopup(d.id); });
}
// A chime when the session speaks, asks, or changes the canon; the bell in the panel's header mutes it.
let chimeOn = true;
try { chimeOn = localStorage.getItem("hc-chime") !== "off"; } catch {}
function chime() {
  // one chime per change: the focus, the redraw and the chat line about one change arrive seconds apart
  if (Date.now() - (chime.last ?? 0) < 1500) return;
  chime.last = Date.now();
  chime.count = (chime.count ?? 0) + 1;
  if (!chimeOn) return;
  try {
    const ctx = (chime.ctx ??= new (window.AudioContext || window.webkitAudioContext)());
    if (ctx.state === "suspended") ctx.resume();
    const t = ctx.currentTime;
    for (const [freq, dt] of [[880, 0], [1320, 0.12]]) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = "sine"; o.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, t + dt); g.gain.exponentialRampToValueAtTime(0.16, t + dt + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + dt + 0.5);
      o.connect(g).connect(ctx.destination); o.start(t + dt); o.stop(t + dt + 0.55);
    }
  } catch {}
}
{
  const bell = document.getElementById("chime-toggle");
  const show = () => { bell.textContent = chimeOn ? "🔔" : "🔕"; bell.title = chimeOn ? "A chime when the session speaks or changes the canon; click to mute" : "Muted; click to chime again"; };
  bell.addEventListener("click", () => { chimeOn = !chimeOn; try { localStorage.setItem("hc-chime", chimeOn ? "on" : "off"); } catch {} show(); if (chimeOn) chime(); });
  show();
}
/** Remove one rendered `<h2>` section from a node's HTML. */
const sectionRe = (heading) => new RegExp(`<h2>${heading}\\b[^<]*(?:<[^h][^>]*>[^<]*)*</h2>[\\s\\S]*?(?=<h2>|$)`, "i");
function stripHtmlSection(html, heading) { return html.replace(sectionRe(heading), ""); }
function extractHtmlSection(html, heading) { return sectionRe(heading).exec(html)?.[0] ?? ""; }
/** A read-only card: the principles, or one principle, which live in the root README and are edited there. */
function openTextCard(id, title, html) {
  const wasHidden = $popup.hidden;
  $popup.innerHTML = `
    <div class="popup-head"><span class="id">${esc(id)}</span> <span class="muted">Each principle has its own card and approval; open one from the panel.</span><button class="btn small" id="pp-close" title="Close">✕</button></div>
    <h2>${esc(title)}</h2>
    <div class="popup-body body" id="pp-body">${html}</div>
    <p class="sub">Select any words above to ask the session about them in the chat.</p>
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
// Asking about a passage: select words in a card and the chat is ready with them. The words stay lit in the
// card, the chip above the message box names the node and the words, and the cursor is in the box.
document.addEventListener("mouseup", (ev) => {
  const target = ev.target;
  setTimeout(() => {
    const sel = window.getSelection();
    const text = sel?.toString().trim();
    // a plain click anywhere but the panel drops a highlighted passage; the panel is where the question is typed
    if (!text || $popup.hidden || !$popup.contains(sel.anchorNode) || !$popup.dataset.id) { if (quote && !document.getElementById("session").contains(target)) setQuote(null); return; }
    if (window.CSS?.highlights && window.Highlight) CSS.highlights.set("quote", new Highlight(sel.getRangeAt(0).cloneRange()));
    setQuote({ id: $popup.dataset.id, text: text.slice(0, 300) });
    openSession();
    $msg.focus();
  }, 0);
});

// The chat: what the session says and what the human sends, with the actions between them as quiet lines.
let chatCursor = 0;
// Ids named in a chat line are links; a line about a box carries the box as a chip; every line has its time.
const ID_RE = /\b(REQ-\d+(?:\.\d+)*|PRN-\d+|DEC-\d+)\b/g;
const linkIds = (text) => esc(text).replace(ID_RE, (id) => `<a class="id" data-id="${id}" href="#/node/${id}">${id}</a>`);
const timeOf = (at) => { const d = at ? new Date(at) : new Date(); return Number.isNaN(d.getTime()) ? "" : d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); };
// Two lists. The chat holds what the session asks of the human (a say marked `to: human`, or one that ends in a
// question) and what they write. The history holds the rest: what the session did, and what the human did on
// the canvas. A history line opens its box on a double-click, or the nearest box above it if it is gone.
const KIND_LABELS = { "node-approved": "approved", "node-edited": "rewritten", "node-deleted": "deleted", "node-created": "created", "term-enshrined": "term kept", "term-dropped": "term dropped", "refine-request": "asked to define", "finish-request": "finish", "edit-conflict": "conflict", answer: "you answered", say: "session" };
let historyNew = 0;
function appendChat(entries) {
  const chat = document.getElementById("activity"), history = document.getElementById("history");
  for (const e of entries) {
    const li = document.createElement("li");
    const t = timeOf(e.at);
    const toHuman = e.kind === "message" || (e.kind === "say" && (e.to === "human" || /\?\s*$/.test(e.text ?? "")));
    if (toHuman && e.kind === "say") { li.className = "say"; li.innerHTML = `${linkIds(e.text ?? "")}<div class="meta">${e.id ? `<a class="ref" data-id="${esc(e.id)}" href="#/node/${esc(e.id)}" title="Open ${esc(e.id)}">${esc(e.id)}</a>` : ""}<time>${t}</time></div>`; chat.appendChild(li); }
    else if (e.kind === "message") { li.className = "message"; li.innerHTML = `${e.quote ? `<span class="q">${e.id ? `<a class="id" data-id="${esc(e.id)}" href="#/node/${esc(e.id)}">${esc(e.id)}</a> › ` : ""}“${esc(e.quote)}”</span>` : ""}${linkIds(e.text ?? "")}<div class="meta"><time>${t}</time></div>`; chat.appendChild(li); }
    else {
      li.className = `ev ${e.kind}`; if (e.id) li.dataset.id = e.id; li.title = "Double-click to go to this box";
      li.innerHTML = `<span class="kind">${esc(KIND_LABELS[e.kind] ?? e.kind)}</span>${linkIds(e.text ?? "")}<div class="meta">${e.id ? `<span class="ref">${esc(e.id)}</span>` : ""}<time>${t}</time></div>`;
      li.addEventListener("dblclick", () => goToEvent(e.id));
      history.appendChild(li);
      if (history.hidden) { historyNew++; const pill = document.getElementById("history-new"); pill.textContent = historyNew; pill.hidden = false; }
    }
  }
  for (const list of [chat, history]) { while (list.children.length > 80) list.firstChild.remove(); if (!list.hidden) list.lastElementChild?.scrollIntoView({ block: "nearest" }); }
}
function goToEvent(id) {
  if (!id || !snap) return;
  if (editingDraft()) { showToast("Finish or cancel your rewrite first."); return; }
  if (id.startsWith("PRN-")) { openPopup(id); return; }
  let target = id;
  while (target !== "ROOT" && !snap.canon.nodes[target]) target = target.includes(".") ? target.slice(0, target.lastIndexOf(".")) : "ROOT";
  if (target !== id) showToast(`${id} is gone; showing ${target}.`);
  closePopup();
  if (document.body.classList.contains("adopt-mode")) focusOnCanvas(target, false); else location.hash = target === "ROOT" ? "#/" : `#/node/${target}`;
}
for (const b of document.querySelectorAll(".panel-tabs button")) b.addEventListener("click", () => {
  for (const o of document.querySelectorAll(".panel-tabs button")) o.classList.toggle("on", o === b);
  for (const id of ["activity", "history"]) document.getElementById(id).hidden = id !== b.dataset.panel;
  if (b.dataset.panel === "history") { historyNew = 0; document.getElementById("history-new").hidden = true; }
  document.getElementById(b.dataset.panel).lastElementChild?.scrollIntoView({ block: "nearest" });
});
// While the canvas is up, a box named in the chat is focused there rather than opened as a page; a principle opens its card.
document.getElementById("activity").addEventListener("click", (ev) => {
  const a = ev.target.closest("a[data-id]");
  if (!a || !document.body.classList.contains("adopt-mode")) return;
  const id = a.dataset.id;
  if (id.startsWith("PRN-")) { ev.preventDefault(); openPopup(id); return; }
  if (!snap?.canon.nodes[id]) return;
  ev.preventDefault();
  if (editingDraft()) { showToast("Finish or cancel your rewrite first."); return; }
  closePopup();
  focusOnCanvas(id, false);
});
function startWorking(what) { working = { since: Date.now(), answer: "" }; if (shownQuestionId === null) showWorking(what); }

load().then(render).catch(showError).finally(pollSession);
