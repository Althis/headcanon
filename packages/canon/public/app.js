// HeadCanon local viewer. No build step: plain ES modules, one JSON endpoint.
const STATES = ["stated", "resolved", "assumed", "draft", "contested"];
const UNCONFIRMED = new Set(["assumed", "draft", "contested"]);

const $main = document.getElementById("main");
let snap = null;
const ui = { collapsed: new Set(), filters: new Set(), flaggedOnly: false, query: "", levels: new Set(["error", "warn"]), graph: true, glossary: { q: "", sort: "term", dir: 1 } };
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
  marksData ??= marksFromSnapshot(); // the first drawing already carries the marks; the marks route then keeps them current
  noteActivity(snap.activity);
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
    open: nodes.filter((n) => n.state === "draft"),
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
  if (view !== "adopt") { closePopup(); closeRunCard(); }
  // the large Issues card lives on the page itself, outside the view: it goes with the view, its place in the list kept
  for (const old of document.querySelectorAll("body > .menu.issues.expanded")) { adoptState.issuesScroll = old.querySelector(".menu-body")?.scrollTop ?? 0; old.remove(); }
  const views = { history: historyView, overview, adopt: () => adopt(arg), tree: () => tree(arg), node: () => tree(arg), health, attention, journeys: () => journeys(arg), journey: () => journeys(arg), decisions: () => decisions(arg), decision: () => decisions(arg), glossary };
  $main.innerHTML = (views[view] ?? overview)();
  afterRender(view);
}

// ---------------------------------------------------------------- history
// Every change to the canon's files, operations and page edits alike, newest first, with a way back to before any
// of them (DEC-025: everything is an operation). The list is fetched when the view opens; the canon reloads after a revert.
function historyView() {
  return `<h1>History</h1><p class="lede">Every change to the canon, by the session or by you. Reverting restores the files to how they were before that change; the revert is itself a change you can undo.</p><div id="history-list" class="history-list"><p class="muted">Loading…</p></div>`;
}
async function wireHistory() {
  const holder = document.getElementById("history-list"); if (!holder) return;
  let entries = [];
  try { entries = (await fetch("/api/history", { cache: "no-store" }).then((r) => r.json())).entries ?? []; } catch { holder.innerHTML = `<p class="muted">No history: the canon is outside a git repository.</p>`; return; }
  if (!entries.length) { holder.innerHTML = `<p class="muted">No changes recorded yet.</p>`; return; }
  holder.innerHTML = `<table class="history"><thead><tr><th>#</th><th>when</th><th>what</th><th>files</th><th></th></tr></thead><tbody>${entries.map((e) => `<tr class="h-${esc(e.kind)}"><td>${e.seq}</td><td>${esc(e.at.slice(0, 19).replace("T", " "))}</td><td><span class="badge kind">${esc(e.kind)}</span> ${e.id ? `<a href="#/node/${esc(e.id)}" class="id">${esc(e.id)}</a> ` : ""}${esc(e.summary)}</td><td title="${esc(e.files.join("\n"))}">${e.files.length}</td><td><button class="btn small" data-revert="${e.seq}" title="Restore every file to how it was before this change">Revert to before</button></td></tr>`).join("")}</tbody></table>`;
  for (const b of holder.querySelectorAll("[data-revert]")) b.addEventListener("click", async () => {
    const seq = Number(b.dataset.revert);
    const n = entries.filter((e) => e.seq >= seq).length;
    if (!confirm(`Undo ${n} change${n === 1 ? "" : "s"}, back to before #${seq}? The files are restored as they were; this revert can itself be undone.`)) return;
    try { const r = await post("/api/revert", { seq }); showToast(`${r.restored} file${r.restored === 1 ? "" : "s"} restored.`); await load(); render(); } catch (e) { showToast(e); }
  });
}

// ---------------------------------------------------------------- overview
function overview() {
  const { stats, health } = snap;
  if (stats.nodes === 0 && !snap.canon.root) return `
    <div class="alert none"><span class="alert-icon">·</span><b>No canon yet.</b><span class="muted">The session is reading your documents and drafting it; the Adopt tab shows the nodes as they appear.</span></div>
    <h1>Canon</h1>
    <p class="lede">Nothing to show until the first node exists. The session speaks in the panel at the bottom right.</p>`;
  const att = attentionItems();
  const tile = (n, label, cls = "", href = "") => `<div class="tile ${cls}"><div class="n">${href ? `<a href="${href}">${n}</a>` : n}</div><div class="l">${label}</div></div>`;
  const groups = [
    ["Requirements", "What the tree holds", [
      tile(stats.nodes, `in ${health.length} branches`),
      tile(stats.measurable, "leaves with a check"),
      tile(stats.unrefined, "leaves to refine"),
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
    <p class="lede">Requirements at a glance. ${stats.counts.stated + stats.counts.resolved} of ${stats.nodes} nodes are confirmed by the user; ${stats.counts.assumed + stats.counts.open + stats.counts.contested} still need a word from you.</p>
    ${adoptionStarting() ? `<p class="lede"><span class="spin"></span> <b>${esc(adoptProgress().phase)}.</b> The session is drafting the canon from the repository; nothing to review yet. The <a href="#/adopt">Adopt view</a> shows nodes as they land, and your list fills as they do.</p>` : ""}
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
      <div class="node ${id === selectedId ? "selected" : ""} ${active && !matches(n) ? "dim" : ""} ${markClass(id)}" data-id="${esc(id)}">
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
${n.title}${hidden ? ` (+${hidden})` : ""}`, state: n.state }, classes: `${id === selectedId ? "selected" : ""} ${n.state === "draft" ? "draft" : ""} ${n.kind ? "done" : ""} ${pendingNodes.has(id) ? "pending" : ""} ${markClass(id)}` });
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
      { selector: "node.draft", style: { "border-style": "dashed" } },
      { selector: "node.done", style: { "border-style": "double", "border-width": 3 } },
      { selector: "node.pending", style: { "border-style": "dotted" } },
      { selector: "node.not-built", style: { "background-color": "#d1d5db" } },
      { selector: "node.out-of-sync", style: { "outline-width": 2, "outline-style": "dashed", "outline-color": "#dc2626", "outline-offset": 4 } },
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
    <div class="row"><span class="id">${esc(n.id)}</span> ${badge(n.state)}${blockedBadge(n.id)}<span class="badge kind" id="nd-built"${builtWords(id) ? "" : " hidden"}>${esc(builtWords(id))}</span> <span class="badge kind" title="${n.layerExplicit ? "from the layer field" : "inferred from depth"}">${esc(n.layer)}${n.layerExplicit ? "" : " (inferred)"}</span> ${n.kind ? `<span class="badge kind">${esc(n.kind)}</span>` : `<span class="badge kind">not yet measurable</span>`} <a class="sub" href="#/tree/${esc(id)}">focus in tree</a></div>
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
  const chips = ["error", "warn", "info"].map((l) => `<button class="chip ${l === "error" ? "contested" : l === "warn" ? "assumed" : "draft"} ${ui.levels.has(l) ? "on" : ""}" data-level="${l}">${l} ${snap.findings.filter((f) => f.level === l).length}</button>`).join("");
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
      <div class="row"><span class="id">${esc(j.id)}</span><h3 style="margin:0">${esc(j.title)}</h3> ${certainty(j.state)} ${j.source ? `<span class="muted mono">${esc(j.source)}</span>` : ""}</div>
      ${j.mermaid ? `<pre class="mermaid">${esc(j.mermaid)}</pre>` : ""}
      <table class="list journey-steps${marksData ? " tested" : ""}"><thead><tr><th>Step</th><th>State</th><th>Nodes it cites</th><th class="jtest">Test that plays it</th></tr></thead><tbody>
        ${j.steps.map((s, k) => `<tr><td><span class="id">${esc(s.id)}</span> ${esc(s.label)}</td><td>${certainty(s.state)}</td><td>${s.requirements.map((r) => `${idLink(r)}${node(r) ? ` <span class="muted">${esc(node(r).title)}</span>` : ` <span class="badge error">missing</span>`}`).join("<br>")}</td>${k === 0 ? `<td class="jtest" rowspan="${j.steps.length}" data-jplays="${esc(j.id)}"></td>` : ""}</tr>`).join("")}
      </tbody></table>
      <div class="body" style="margin-top:10px">${snap.html[j.id] ?? ""}</div>
    </div>`).join("");
  return `<h1>Journeys</h1><p class="lede">How you see the product working, step by step. Each step cites the nodes it rests on; a test that plays a journey stands beside its steps.${focus ? ` <a href="#/journeys">all journeys</a>` : ""}</p>${cards || `<p class="empty">No journeys.</p>`}`;
}
// A journey's test plays every step in order, so it stands once beside them all. It is found on the nodes the steps
// cite: only those the marks say have a test are asked for.
function fillJourneyTests() {
  for (const cell of $main.querySelectorAll("[data-jplays]")) {
    const j = snap.canon.journeys.find((x) => x.id === cell.dataset.jplays);
    if (!j) continue;
    const nodes = [...new Set(j.steps.flatMap((s) => s.requirements))].filter((r) => markOf(r)?.tests);
    Promise.all(nodes.map(fetchTests)).then((lists) => {
      if (!cell.isConnected) return;
      const plays = lists.flat().filter((t) => t.journey === j.id || String(t.journey ?? "").startsWith(`${j.id}/`));
      const key = JSON.stringify(plays);
      if (cell.dataset.key === key) return;
      cell.dataset.key = key;
      cell.innerHTML = plays.length ? testsHtml(plays, false) : `<span class="muted">No test plays it yet.</span>`;
    });
  }
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
// A term matches the search when the words typed appear in its term, id or definition.
const termMatches = (t, q) => !q || `${t.term} ${t.id} ${t.definition}`.toLowerCase().includes(q.toLowerCase());
function glossary() {
  const green = (t) => t.state === "stated" || t.state === "resolved";
  const g = ui.glossary, rank = { open: 0, contested: 1, assumed: 2, stated: 3, resolved: 4 };
  const keyOf = (t) => (g.sort === "state" ? rank[t.state] ?? 9 : g.sort === "id" ? t.id.toLowerCase() : t.term.toLowerCase());
  const terms = [...snap.canon.terms].sort((a, b) => { const x = keyOf(a), y = keyOf(b); return (x < y ? -1 : x > y ? 1 : 0) * g.dir; });
  const th = (key, label) => `<th><a href="#" data-gsort="${key}" title="Sort by ${label.toLowerCase()}">${label}${g.sort === key ? ` <span class="muted">${g.dir > 0 ? "▲" : "▼"}</span>` : ""}</a></th>`;
  return `<h1>Glossary</h1><p class="lede">What the user means when they say X. A term is the session's guess until you approve it, rewrite it in your words, or delete it.</p>
    <p class="toolbar"><input id="g-q" type="search" placeholder="Search the terms…" value="${esc(g.q)}" /> <span class="muted" id="g-count"></span></p>
    <table class="list glossary"><thead><tr>${th("term", "Term")}${th("id", "ID")}<th>Definition</th>${th("state", "State")}</tr></thead><tbody>
    ${terms.map((t) => `<tr data-term="${esc(t.id)}" data-search="${esc(`${t.term} ${t.id} ${t.definition}`.toLowerCase())}" ${termMatches(t, g.q) ? "" : "hidden"}><td><b>${esc(t.term)}</b><div>${badge(t.state)}</div></td><td class="id">${esc(t.id)}</td><td class="def">${esc(t.definition)}</td><td class="acts"><span class="row">${green(t) ? "" : `<button class="btn small primary" data-term-approve="${esc(t.id)}" title="Keep it as written; it becomes approved by you">Approve</button>`}<button class="btn small" data-term-edit="${esc(t.id)}" title="Say it in your own words">Rewrite</button><button class="btn small" data-term-delete="${esc(t.id)}">Delete</button></span></td></tr>`).join("")}
    </tbody></table>`;
}
// The glossary's rows act like nodes: approve, rewrite in place, delete; each reaches the session as a change.
function wireGlossary() {
  const after = async (what) => { await load(); render(); startWorking(what); };
  // the search filters the rows in place, so typing never redraws the page; the sort redraws once
  const q = $main.querySelector("#g-q"), count = $main.querySelector("#g-count");
  const applySearch = () => { const needle = (q?.value ?? "").toLowerCase(); ui.glossary.q = q?.value ?? ""; let shown = 0; for (const tr of $main.querySelectorAll("tr[data-term]")) { const hit = !needle || tr.dataset.search.includes(needle); tr.hidden = !hit; if (hit) shown++; } if (count) count.textContent = needle ? `${shown} of ${snap.canon.terms.length}` : `${snap.canon.terms.length} terms`; };
  q?.addEventListener("input", applySearch);
  applySearch();
  for (const a of $main.querySelectorAll("[data-gsort]")) a.addEventListener("click", (e) => { e.preventDefault(); const key = a.dataset.gsort; if (ui.glossary.sort === key) ui.glossary.dir = -ui.glossary.dir; else { ui.glossary.sort = key; ui.glossary.dir = 1; } render(); });
  for (const b of $main.querySelectorAll("[data-term-approve]")) b.addEventListener("click", async () => { const id = b.dataset.termApprove; try { await post(`/api/node/${encodeURIComponent(id)}/approve`, {}); after(`you approved ${id}`); } catch (e) { showToast(e); } });
  for (const b of $main.querySelectorAll("[data-term-delete]")) b.addEventListener("click", async () => { const id = b.dataset.termDelete; if (!confirm(`Delete ${id}? The session re-reads the nodes that use the word.`)) return; try { await fetch(`/api/node/${encodeURIComponent(id)}`, { method: "DELETE" }); after(`you deleted ${id}`); } catch (e) { showToast(e); } });
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
  if (view === "history") wireHistory();
  if (view === "journeys" || view === "journey") fillJourneyTests();
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
  // a passing line at the end of the chat, gone after a while; it never pushes a real line out
  const li = document.createElement("li");
  li.className = "sys toast";
  li.textContent = typeof msg === "string" ? msg : (msg.message || String(msg));
  const list = document.getElementById("activity");
  list.appendChild(li);
  li.scrollIntoView({ block: "nearest" });
  setTimeout(() => li.remove(), 8000);
  openSession();
}

// ---------------------------------------------------------------- session panel: questions from the agent, jargon gate, focus, messages
const $session = document.getElementById("session");
const $question = document.getElementById("question");
// A question is a card over the canvas, moved by its header; the panel's header brings it back when put away.
const $issueCard = document.getElementById("issue");
function showIssueCard(header, label = "Issue") {
  document.getElementById("issue-label").textContent = label;
  document.getElementById("issue-sub").textContent = header ?? $question.dataset.label ?? "";
  $issueCard.hidden = false;
  // a card that opens on "Write it yourself" puts the cursor in its node
  if ($question.querySelector('input[name=opt][value="write"]')?.checked) $question.querySelector("#q-other")?.focus();
  if ($issueCard.dataset.placed) return;
  const area = $main.querySelector(".adopt #cy")?.getBoundingClientRect() ?? $main.getBoundingClientRect();
  const w = Math.min(640, Math.max(320, area.width - 40));
  $issueCard.style.width = `${w}px`;
  $issueCard.style.left = `${Math.max(8, area.left + (area.width - w) / 2)}px`;
  $issueCard.style.top = `${Math.max(60, area.top + Math.max(0, (area.height - $issueCard.offsetHeight) / 2))}px`;
  $issueCard.dataset.placed = "1";
}
document.getElementById("issue-close").addEventListener("click", () => { $issueCard.hidden = true; shownIssue = null; });
document.getElementById("session-status").addEventListener("click", () => { if (shownQuestionId) $issueCard.hidden = false; });
// A card over the canvas moves by its header: the issue card and the run card.
function dragByHead(card) {
  card.querySelector(".popup-head").addEventListener("pointerdown", (e) => {
    if (e.target.closest("button")) return;
    const r = card.getBoundingClientRect(), dx = e.clientX - r.left, dy = e.clientY - r.top;
    const move = (ev) => { card.style.left = `${ev.clientX - dx}px`; card.style.top = `${Math.max(0, ev.clientY - dy)}px`; };
    const up = () => { document.removeEventListener("pointermove", move); document.removeEventListener("pointerup", up); };
    document.addEventListener("pointermove", move); document.addEventListener("pointerup", up);
  });
}
dragByHead($issueCard);
const $tooltip = document.getElementById("tooltip");
let shownQuestionId = null, lastFocusSeq = 0, lastCursor = 0, lastRev = null, termState = {};
// When the canon last changed on disk while this page was open, and when the page was opened: before any node
// exists nothing else says whether a session is at work, so the live status reads the phase and these two times.
let lastDiskChangeAt = null;
const pageOpenedAt = Date.now();
// An adoption that has not reached its domains: the session reads and drafts outside the tree, so the page has no
// activity to show yet and says what the phase is instead of "no session".
const adoptionStarting = () => snap && !snap.canon.decisions.some((d) => /adoption-scope/.test(d.file)) && snap.canon.roots.length === 0;
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
// A message carries the passage the user highlighted in a card, when they did: the chip above the node names
// the node and the words, and both go with the text. Enter sends; Shift+Enter breaks a line.
const $msg = document.getElementById("msg"), $quote = document.getElementById("quote");
let quote = null;
function setQuote(q) {
  quote = q;
  $quote.hidden = !q;
  if (q) {
    $quote.innerHTML = `<span class="muted">about</span> ${q.id ? idLink(q.id) : `<span class="muted">${esc(q.about ?? "the issue")}</span>`} <q>${esc(q.text)}</q><button class="btn small" id="quote-x" title="Drop the passage">✕</button>`;
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
// An issue is the session's explicit request for help, kept in its queue: a question, usually about a draft
// node, or a contradiction to settle. Each kind has its template, and the Issues panel lists them. For a red node
// the session filed nothing for, the page builds a stand-in from the node itself, so nothing red goes unlisted.
let lastSession = null, lastQueueRev = "";
let workingSet = new Set();
const ISSUE_MARK = { question: "?", contradiction: "≠" };
function issuesOf(s) {
  const out = [];
  const queue = s?.queue ?? (s?.question ? [s.question] : []);
  const qTitle = (q) => { const draft = /"([^"\n]{3,90}?)\./.exec(q.question ?? "")?.[1]; return (q.nodeId && node(q.nodeId)?.title) || draft || q.header; };
  const named = new Set();
  // a contradiction is one by its kind, by its node being contested, or by a header that says so: agents file them in all three ways
  const isContradiction = (q) => q.kind === "contradiction" || node(q.nodeId)?.state === "contested" || /contradict|contested/i.test(q.header ?? "");
  queue.forEach((q) => { if (q.nodeId) named.add(q.nodeId); out.push({ kind: isContradiction(q) ? "contradiction" : "question", key: q.id, id: q.id, nodeId: q.nodeId, title: qTitle(q), sub: q.header && q.header !== q.nodeId && q.header !== qTitle(q) ? q.header : "", current: q.id === s?.question?.id }); });
  for (const n of Object.values(snap.canon.nodes)) {
    if (named.has(n.id) || pendingNodes.has(n.id)) continue; // a pending node is the session's for now; its line says so
    if (n.state === "contested") out.push({ kind: "contradiction", key: "c:" + n.id, nodeId: n.id, title: n.title, standIn: true });
    else if (n.state === "draft") out.push({ kind: "question", key: "o:" + n.id, nodeId: n.id, title: n.title, standIn: true, preparing: agentLive(s) });
  }
  // in the order of what settling the node releases (the next command's user list); the rest keep their order
  const rank = new Map((snap.next?.user ?? []).map((h, i) => [h.id, i]));
  out.forEach((i, k) => { i.order = k; });
  out.sort((a, b) => (rank.get(a.nodeId) ?? 1e9) - (rank.get(b.nodeId) ?? 1e9) || a.order - b.order);
  return out;
}
function renderIssues(s) {
  const body = document.getElementById("issues-body"), count = document.getElementById("issues-count");
  if (!body || !snap) return;
  for (const [id, p] of pendingNodes) if (Date.now() - p.since > 15 * 60 * 1000) pendingNodes.delete(id);
  const issues = issuesOf(s);
  const notReady = new Set([...issues.filter((i) => i.preparing).map((i) => i.nodeId), ...pendingNodes.keys()]);
  // what the user can do, ranked by impact (the next command's user list, with its reason): the first is next for
  // them, a few more follow, so they always see where their time goes furthest, during adoption and after it.
  // The issues show live as they are filed, ranked, in groups by kind; while the drafting runs the gate is one
  // line of progress above them, never a reason to withhold them (the user asked to see them as they land).
  // In Guided the drafting stops at each node until it is approved: the line then says whose turn it is, with no spinner.
  const gate = snap.next?.gate;
  const waits = guidedWaits().length > 0;
  const drafting = Boolean(gate && gate.total && !gate.open && agentLive(s) && !waits);
  const picks =(snap.next?.user ?? []).filter((h) => !notReady.has(h.id)).slice(0, 5);
  const top = picks[0];
  const minutes = (p) => Math.floor((Date.now() - p.since) / 60000);
  const ago = (p) => { const m = minutes(p); return m < 1 ? "just now" : m === 1 ? "a minute ago" : `${m} minutes ago`; };
  const pendingKey = [...pendingNodes].map(([id, p]) => `${id}:${minutes(p)}`);
  const active = agentLive(s) ? activeIds() : []; // what the disk shows moving, shown only while a session is attached
  // the reason in a few tokens: "93 below · 18 red", "contested · ~7 not drafted · 9 wait", "leaf"; in Guided only a node
  // with its check reads "leaf", and one the session has yet to draft under reads "nothing below yet"
  const shortWhy = (h) => String(h.why ?? "").replace(/validates the path for (\d+) nodes? below it/, "$1 below").replace(/, (\d+) of them red/, " · $1 red").replace(/(\d+) nodes? below it/, "$1 below").replace(/, (\d+) red/, " · $1 red").replace(/about (\d+) nodes? not drafted yet/, "~$1 not drafted").replace(/(\d+) wait on it/, "$1 wait").replace(/frees (\d+)/, "frees $1").replace(/nothing below it/, guided() && !node(h.id)?.kind ? "nothing below yet" : "leaf").replace(/; /g, " · ");
  const key = JSON.stringify([issuesTab, issuesSort, waits, drafting && `${gate.refined}/${gate.total}`, picks.map((h) => `${h.id}:${h.action}:${shortWhy(h)}`), pendingKey, active, ...issues.map((i) => i.key + (i.preparing ? "~" : ""))]);
  if (body.dataset.key === key) return;
  body.dataset.key = key;
  const open = issues.filter((i) => !i.preparing).length;
  count.textContent = open; count.hidden = open === 0;
  // each node the user acted on (with how long ago), then what the disk shows moving
  const pendingLines = [...pendingNodes].map(([id, p]) => `<p class="pending-line"><span class="spin"></span> <a href="#" data-next="${esc(id)}" title="Select it on the canvas">${esc(id)}</a> <span class="muted">· the session is working on it; ${esc(p.why)} ${esc(ago(p))}</span></p>`).join("");
  const activeLine = active.length ? `<p class="pending-line"><span class="spin"></span> <span class="muted">Being refined now:</span> ${active.map((id) => `<a href="#" data-next="${esc(id)}" title="Select it on the canvas">${esc(id)}</a>`).join(", ")}</p>` : "";
  const hint = (i) => i.preparing ? "The session is still writing its question for this draft" : i.kind === "contradiction" ? "Settle the contradiction" : i.standIn ? "Define this draft" : "Open this question";
  const pickRow = (h, first) => `<button class="btn small issue-row pick${first ? " now" : ""}" data-next="${esc(h.id)}" title="Select it on the canvas"><span class="kind">${h.action === "settle" ? "!" : "✓"}</span><span class="tag">${esc(h.id)}</span><span>${esc(h.action)} <span class="muted">· ${esc(shortWhy(h))}</span></span></button>`;
  const row = (i, k) => `<button class="btn small issue-row${i.current ? " now" : ""}${i.preparing ? " preparing" : ""}" data-issue="${k}" title="${hint(i)}"><span class="kind">${i.preparing ? "…" : ISSUE_MARK[i.kind]}</span>${i.nodeId ? `<span class="tag">${esc(i.nodeId)}</span>` : ""}<span>${esc(i.title)}${i.preparing ? ` <span class="muted">· being prepared</span>` : ""}</span></button>`;
  const index = new Map(issues.map((i, k) => [i.key, k]));
  // the two lists of issues in the order the user picked: by importance (what settling the node releases, then how
  // many nodes lie below it, then the shallower node), by requirement number, or by title
  const sorted = (list) => issuesSort === "number" ? [...list].sort((a, b) => byReqNumber(a.nodeId, b.nodeId) || a.order - b.order)
    : issuesSort === "title" ? [...list].sort((a, b) => String(a.title ?? "").localeCompare(String(b.title ?? ""), undefined, { sensitivity: "base", numeric: true }) || byReqNumber(a.nodeId, b.nodeId))
    : [...list].sort((a, b) => (userRank.get(a.nodeId) ?? 1e9) - (userRank.get(b.nodeId) ?? 1e9) || nodesBelow(b.nodeId) - nodesBelow(a.nodeId) || (node(a.nodeId)?.depth ?? 99) - (node(b.nodeId)?.depth ?? 99) || a.order - b.order);
  const userRank = new Map((snap.next?.user ?? []).map((h, i) => [h.id, i]));
  const contradictions = sorted(issues.filter((i) => i.kind === "contradiction")), drafts = sorted(issues.filter((i) => i.kind !== "contradiction"));
  const sortBar = `<label class="issues-sort muted">Sort <select data-issues-sort><option value="importance"${issuesSort === "importance" ? " selected" : ""}>by importance</option><option value="number"${issuesSort === "number" ? " selected" : ""}>by requirement number</option><option value="title"${issuesSort === "title" ? " selected" : ""}>alphabetically</option></select></label>`;
  // four tabs, one short status line above them: what to do first, the two kinds of issue, and what moves
  const status = waits ? "Waiting for your approval. The session drafts under a node once you approve it." : drafting ? `<span class="spin"></span> Drafting · ${gate.refined}/${gate.total}` : adoptionStarting() ? `<span class="spin"></span> Reading` : "";
  const tabs = [["for-you", "For you", picks.length], ["contradictions", "Contradictions", contradictions.length], ["drafts", "Drafts", drafts.length], ["activity", "Activity", pendingNodes.size + active.length]];
  if (!tabs.some(([k]) => k === issuesTab)) issuesTab = "for-you";
  let content;
  if (issuesTab === "for-you") content = picks.length ? picks.map((h, k) => pickRow(h, k === 0)).join("") : `<p class="muted">${adoptionStarting() ? "Nothing to review yet; the domains come first." : "Nothing needs you right now."}</p>`;
  else if (issuesTab === "contradictions") content = contradictions.length ? sortBar + contradictions.map((i) => row(i, index.get(i.key))).join("") : `<p class="muted">No contradiction open.</p>`;
  else if (issuesTab === "drafts") content = drafts.length ? sortBar + drafts.map((i) => row(i, index.get(i.key))).join("") : `<p class="muted">No draft waits for you.</p>`;
  else content = (pendingLines + activeLine) || `<p class="muted">Nothing moving right now.</p>`;
  // a redraw keeps the user's place: the scroll position comes back, and an open card is never touched
  const scroll = body.scrollTop;
  body.innerHTML = `${status ? `<p class="status muted">${status}</p>` : ""}<div class="tabs">${tabs.map(([k, label, n]) => `<button class="btn small${k === issuesTab ? " on" : ""}" data-tab="${k}">${label}${n ? ` <span class="pill">${n}</span>` : ""}</button>`).join("")}</div>${content}`;
  body.scrollTop = scroll;
  for (const b of body.querySelectorAll("[data-tab]")) b.addEventListener("click", () => { issuesTab = b.dataset.tab; body.dataset.key = ""; body.scrollTop = 0; renderIssues(lastSession); });
  body.querySelector("[data-issues-sort]")?.addEventListener("change", (e) => { issuesSort = e.target.value; try { localStorage.setItem("hc-issues-sort", issuesSort); } catch { /* fine */ } body.dataset.key = ""; body.scrollTop = 0; renderIssues(lastSession); });
  for (const b of body.querySelectorAll("[data-issue]")) b.addEventListener("click", () => openIssue(issues[Number(b.dataset.issue)]));
  // a pick opens its card: the issue filed on the node when there is one, else the node itself
  for (const a of body.querySelectorAll("[data-next]")) a.addEventListener("click", (e) => { e.preventDefault(); const id = e.currentTarget.dataset.next; const issue = issues.find((i) => i.nodeId === id && i.current) ?? issues.find((i) => i.nodeId === id); if (issue) openIssue(issue); else if (id === "ROOT" || node(id)) focusOnCanvas(id, true, true); });
}
let issuesTab = "for-you";
// How the issue lists are ordered, kept across visits: "importance", "number" or "title".
let issuesSort = "importance";
try { const saved = localStorage.getItem("hc-issues-sort"); if (saved === "number" || saved === "title") issuesSort = saved; } catch { /* fine */ }
// Requirement ids in their natural order: REQ-2.10 after REQ-2.9; an issue with no node goes last.
const byReqNumber = (a, b) => { if (!a || !b) return a ? -1 : b ? 1 : 0; const pa = String(a).match(/\d+/g) ?? [], pb = String(b).match(/\d+/g) ?? []; for (let k = 0; k < Math.max(pa.length, pb.length); k++) { const d = (pa[k] === undefined ? -1 : Number(pa[k])) - (pb[k] === undefined ? -1 : Number(pb[k])); if (d) return d; } return String(a).localeCompare(String(b)); };
// How many nodes lie below a node, counted once per snapshot.
let belowMemo = { snap: null, counts: new Map() };
function nodesBelow(id) {
  if (belowMemo.snap !== snap) belowMemo = { snap, counts: new Map() };
  const n = id ? node(id) : undefined;
  if (!n) return 0;
  if (belowMemo.counts.has(id)) return belowMemo.counts.get(id);
  belowMemo.counts.set(id, 0);
  let total = 0;
  for (const c of n.children ?? []) total += 1 + nodesBelow(typeof c === "string" ? c : c.id);
  belowMemo.counts.set(id, total);
  return total;
}
// A statement's words without their source references, and the references themselves.
const REF_RE = /[A-Za-z0-9_.\/-]+\.[A-Za-z0-9]+:\d+(?:-\d+)?/g;
const plainWords = (html) => html.replace(/<[^>]+>/g, "").replace(/\s*\(([^()]*)\)/g, (m, inner) => (/[A-Za-z0-9_.\/-]+\.[A-Za-z0-9]+:\d+/.test(inner) ? "" : m)).trim();
const refsOf = (html) => [...new Set(html.replace(/<[^>]+>/g, "").match(REF_RE) ?? [])];
// Settling writes the user's words into the node, stated; an explicit issue is answered as well.
async function settleNode(id, text, resolve, q, selected) {
  try {
    await post(`/api/node/${encodeURIComponent(id)}`, resolve ? { intent: text, resolve } : { intent: text }, "PUT");
    if (q) await post("/api/answer", { questionId: q.id, selected: selected ?? [], other: selected?.length ? "" : text, terms: Object.values(termState) }).catch(() => {});
    $issueCard.hidden = true; shownIssue = null; $question.dataset.issue = ""; if (q) shownQuestionId = null;
    markPending(id, "you defined it");
    await load(); render(); startWorking(`you settled ${id}`);
  } catch (e) { showToast(e); }
}
// The contradiction's template: the sources at odds, each statement with its references, the session's
// summary, which is correct, a place to write, and what the decision changes, kept current as the user picks.
function contradictionCard(nodeId, q) {
  const n = node(nodeId);
  if (!n) return;
  const html = snap.html[nodeId] ?? "", contested = extractHtmlSection(html, "Contested");
  const summary = /<\/h2>\s*<p>([\s\S]*?)<\/p>\s*<ul>/.exec(contested)?.[1] ?? "";
  const fromNode = [...contested.matchAll(/<li>([\s\S]*?)<\/li>/g)].map((m) => m[1]);
  const statements = fromNode.length ? fromNode : (q?.options ?? []).map((o) => o.html ?? esc(o.label));
  const others = [...new Set([...(n.conflicts ?? []), ...Object.values(snap.canon.nodes).filter((o) => (o.conflicts ?? []).includes(nodeId)).map((o) => o.id)])].filter((x) => snap.canon.nodes[x]);
  const options = statements.map((st, i) => { const refs = refsOf(st); return { labelHtml: `<b>Statement ${i + 1}</b> ${plainWords(st) ? esc(plainWords(st)) : st}`, descHtml: refs.length ? `<span class="sources q-side"><span class="muted">From</span>${refs.map((r) => `<code>${esc(r)}</code>`).join("")}</span>` : `<span class="muted q-side">No source recorded</span>` }; });
  questionCard({
    badge: "Contradiction", nodeId, title: n.title, questionHtml: "Which is correct?",
    summaryHtml: `${q?.why ? `<p>${esc(q.why)}</p>` : ""}${summary ? `<p>${summary}</p>` : ""}${others.length ? `<p class="sub">Also against: ${others.map((x) => `${idLink(x)} ${esc(node(x).title)}`).join("; ")}</p>` : ""}`,
    options, change: { nodeId, title: n.title, texts: statements.map(plainWords) },
    onAnswer: ({ picked, text }) => settleNode(nodeId, text || plainWords(statements[picked[0]]), "contested", q, text ? [] : [`Statement ${picked[0] + 1}`]),
  });
}
function openIssue(issue) {
  if (issue.preparing) { if (node(issue.nodeId)) focusOnCanvas(issue.nodeId, false, true); showToast("The session is still writing its question for this draft; open the node if you want to define it yourself."); return; }
  // The card keeps what the user typed across a close and reopen of the same question; a stand-in, which
  // carries no term decisions, is redrawn from the node whenever it is reopened.
  if ($question.dataset.issue !== issue.key || (!issue.id && $issueCard.hidden)) {
    if (issue.id) { const q = (lastSession?.queue ?? []).find((x) => x.id === issue.id && x.question !== undefined) ?? (lastSession?.question?.id === issue.id ? lastSession.question : null); if (!q) return; shownQuestionId = q.id; termState = {}; renderQuestion(q, lastSession?.pending ?? 1); }
    else if (issue.kind === "contradiction") contradictionCard(issue.nodeId, null);
    else {
      // a draft node the session filed no question for: the user defines it in their words
      const id = issue.nodeId, n = node(id), intent = extractHtmlSection(snap.html[id] ?? "", "Intent").replace(/<h2>[^<]*<\/h2>/, "");
      questionCard({ badge: "Draft", nodeId: id, title: n.title, questionHtml: "What is this, and what must hold for it?", summaryHtml: `<p class="sub">No question from the session for this draft yet; one usually follows within a minute of the draft, and this card is replaced by it. Define it in your words now, or wait. What it knows so far:</p>${intent}`, options: [], onAnswer: ({ text }) => settleNode(id, text) });
    }
    $question.dataset.issue = issue.key;
  }
  shownIssue = issue.key;
  showIssueCard();
}
let shownIssue = null;
let stripMode; // the mode the progress strip was last drawn with
async function pollSession() {
  pollSession.count = (pollSession.count ?? 0) + 1;
  try {
    // the queue travels only when it changed; the page keeps the last one it got
    const s = await fetch(`/api/session?queueRev=${encodeURIComponent(lastQueueRev)}`, { cache: "no-store" }).then((r) => r.json());
    if (s.queue === undefined) s.queue = lastSession?.queue ?? [];
    lastQueueRev = s.queueRev ?? "";
    lastSession = s;
    const pill = document.getElementById("session-pending");
    pill.textContent = s.pending; pill.hidden = s.pending === 0;
    try { lastStatus = await fetch("/api/status", { cache: "no-store" }).then((r) => r.json()); } catch { /* keep the last */ }
    // The strip is drawn when the canon changes, and in Guided its phase reads the mode too: when Guided arrives
    // (the first status after the page opens) or goes, the strip alone is drawn again, so a pause never reads as drafting.
    const mode = lastStatus?.settings?.mode;
    if (mode !== stripMode) { const redraw = mode === "guided" || stripMode === "guided"; stripMode = mode; const strip = redraw && snap && route().view === "adopt" ? $main.querySelector(".progress") : null; if (strip) strip.outerHTML = progressStrip(); }
    try { syncBuild(s); } catch (e) { console.warn("marks and run", e); } // the poll goes on whatever the marks and the run answer
    const workingNow = new Set(lastStatus?.working ?? []);
    if (workingNow.size !== workingSet.size || [...workingNow].some((x) => !workingSet.has(x))) { workingSet = workingNow; window.__cySpin?.(); }
    document.getElementById("session-status").textContent = s.question ? `waiting on you: ${s.question.header}` : lastStatus ? (lastStatus.listening ? "a session is listening" : "no session is listening") : "no question waiting";
    document.getElementById("session-status").classList.toggle("listening", Boolean(lastStatus?.listening));
    syncOnboard();
    document.getElementById("session-status").classList.toggle("has-q", Boolean(s.question));
    if (s.focus && s.focus.seq !== lastFocusSeq) {
      // a focus from before this page opened is history, not a request: the first poll only records it
      const replay = lastFocusSeq === 0 && lastSession === s && pollSession.count === 1;
      lastFocusSeq = s.focus.seq;
      if (s.focus.id && !replay) {
        if (route().view === "adopt") { focusOnCanvas(s.focus.id, false); if (s.focus.id === "ROOT" && snap && !onboardStage) openPopup("ROOT"); }
        else location.hash = s.focus.id === "ROOT" ? "#/" : `#/node/${s.focus.id}`;
      }
    }
    if (s.question && s.question.id !== shownQuestionId && !(shownIssue && !$issueCard.hidden)) { shownQuestionId = s.question.id; termState = {}; renderQuestion(s.question, s.pending); $question.dataset.issue = s.question.id; shownIssue = null; chime("issue"); }
    ageActivity(); // a node that went quiet loses its paint here; no new snapshot comes for that
    for (const q of s.queue ?? []) if (q.nodeId && pendingNodes.has(q.nodeId)) clearPending(q.nodeId);
    renderIssues(s); // every poll: what is pending, prepared or live changes with time; the key guard keeps the DOM still
    renderLive(s);
    // A question that vanished under an open card: the session replaced it, withdrew it, or it was answered elsewhere.
    // The card shows the replacement on the same node, or says the question is gone; typed words are kept in sight.
    const shownKey = $question.dataset.issue;
    if (!$issueCard.hidden && shownKey && !shownKey.includes(":") && !(s.queue ?? []).some((q) => q.id === shownKey)) {
      const typed = $question.querySelector("#q-other")?.value?.trim();
      const kept = typed ? ` What you had typed: “${esc(typed)}”` : "";
      const next = (s.queue ?? []).find((q) => q.nodeId && q.nodeId === $question.dataset.nodeId);
      if (next) { shownQuestionId = next.id; termState = {}; renderQuestion(next, s.pending); $question.dataset.issue = next.id; $question.insertAdjacentHTML("afterbegin", `<p class="notice"><b>The session replaced its question on this node;</b> this is the new one.${kept}</p>`); }
      else { $question.innerHTML = `<p class="notice"><b>This question is no longer open:</b> it was answered, withdrawn or replaced.${kept}</p>`; $question.dataset.issue = ""; }
      // a replacement still wants an answer; a withdrawal asks nothing, so it says so without a sound
      if (next) chime("issue");
    }
    if (!s.question && shownQuestionId) { shownQuestionId = null; showWorking(); }
    if (!s.question && working) { document.getElementById("session-status").textContent = `session working · ${elapsed()}`; const el = document.getElementById("work-elapsed"); if (el) el.textContent = elapsed(); }
    // The feed carries what went through the page and the session's says; the ids it names are not repeated below.
    const named = new Set();
    if (s.cursor !== lastCursor) {
      lastCursor = s.cursor;
      const c = await fetch(`/api/changes?since=${chatCursor}`, { cache: "no-store" }).then((r) => r.json()).catch(() => null);
      if (c) { chatCursor = c.cursor; appendChat(c.entries); for (const e of c.entries) if (e.id) named.add(e.id); for (const e of c.entries) if (e.kind === "say" && e.id) clearPending(e.id); if (c.entries.some((e) => e.kind === "say")) { if (c.entries.some((e) => e.kind === "say" && e.attention)) chime(); working = null; if (!s.question) { $issueCard.hidden = true; document.getElementById("session-status").textContent = "no question waiting"; } openSession(); } }
      renderIssues(s);
    }
    // The canon's revision changes with any edit on disk, however it was made: a refiner's file, the session's own
    // tools, an editor. The page then re-reads the canon, says in the chat what changed beyond what the feed named,
    // redraws (a card stays open; a rewrite in progress is judged by checkConflict), and chimes for the unannounced.
    if (s.rev !== undefined && s.rev !== lastRev) {
      const first = lastRev === null;
      lastRev = s.rev;
      if (!first) { lastDiskChangeAt = Date.now(); scheduleReload(named); }
    }
  } catch (e) { /* server away; try again */ }
  setTimeout(pollSession, 2000);
}
// Between questions: the session is reading, writing or thinking; show that it is, and for how long.
let working = null;
// Nodes the session is working on after the user acted on them: answered, defined or rewritten. Cleared when the
// session says something about the node, changes it on disk, or files a new question for it; dropped after a while.
const pendingNodes = new Map();
const paintPending = (id) => { const c = window.__cy; if (c) { const n = c.getElementById(id); if (n.length) n.toggleClass("pending", pendingNodes.has(id)); } window.__cySpin?.(); };
const markPending = (id, why) => { if (id) { pendingNodes.set(id, { since: Date.now(), why }); paintPending(id); } };
const clearPending = (id) => { if (id && pendingNodes.delete(id)) { paintPending(id); renderIssues(lastSession); } };
// A session is live when it asked something in the last fifteen minutes, or when the disk shows a node moving that no
// edit from this page explains: while drafting, agents write for long stretches without asking anything.
const agentLive = (s) => Boolean(lastStatus?.listening) || workingSet.size > 0 || (typeof s?.agentSeenAgo === "number" && s.agentSeenAgo < 900);
// Guided: the nodes the session waits for, each a guess with no check and nothing under it, which it drafts under
// only once the user approves it. Read from the canon and the mode alone, never from who is live: an armed waiter
// counts as a live session, and a pause lasts as long as the user takes.
const guided = () => lastStatus?.settings?.mode === "guided";
const guidedWaits = () => (guided() && snap ? snap.next?.user ?? [] : []).filter((h) => { const n = node(h.id); return h.action === "approve" && n && !n.kind && !n.children.length; });
// which worker holds a node, from the status the page polls
const workerOf =(id) => (lastStatus?.workers ?? []).find((w) => w.ids.includes(id))?.by;
// Nodes being refined right now, as the disk shows it (DEC-024): the snapshot names each node file written in the last
// two minutes with the seconds since. The page keeps the write time that implies and ages it by the same rule, because
// a new snapshot comes only when a file changes, never when one goes quiet. Painted like a pending node but kept apart
// from pendingNodes: those lines say what the user did; this says only that the file moves.
const activeNodes = new Map();
const ACTIVE_FOR = 120 * 1000;
// a file the user just changed from the page is their own write, not the session at work: it is not "active"
const userTouched = new Map();
const touched = (id) => { if (id) userTouched.set(id, Date.now()); };
const isActive = (id) => activeNodes.has(id) && Date.now() - activeNodes.get(id) <= ACTIVE_FOR && !(userTouched.has(id) && Date.now() - userTouched.get(id) <= ACTIVE_FOR);
const activeIds = () => [...activeNodes.keys()].filter(isActive);
function noteActivity(activity) {
  const was = [...activeNodes.keys()], now = Date.now();
  activeNodes.clear();
  for (const [id, sec] of Object.entries(activity ?? {})) activeNodes.set(id, now - sec * 1000);
  for (const id of new Set([...was, ...activeNodes.keys()])) paintPending(id);
}
function ageActivity() {
  for (const [id] of activeNodes) if (!isActive(id)) { activeNodes.delete(id); paintPending(id); }
}
// Nodes the session wrote on disk in the last minutes, for the live status when it has not said what it is doing.
let recentChanges = [];
// The session's live status at the top of the panel: what it says it is running, else what the page sees appearing
// on disk, else whether a session is attached at all.
let liveOpen = false;
document.getElementById("session-live")?.addEventListener("click", (e) => { if (!e.target.closest(".live-toggle")) return; liveOpen = !liveOpen; const list = document.querySelector("#session-live .live-list"); if (list) list.hidden = !liveOpen; });
function renderLive(s) {
  const el = document.getElementById("session-live");
  if (!el) return;
  const now = Date.now();
  recentChanges = recentChanges.filter((c) => now - c.at < 3 * 60000);
  const ago = (ms) => { const sec = Math.max(0, Math.round(ms / 1000)); return sec < 60 ? `${sec} s ago` : `${Math.round(sec / 60)} min ago`; };
  const saidAt = s?.doing ? new Date(s.doing.at).getTime() : 0;
  const doing = s?.doing && now - saidAt < 15 * 60000 ? s.doing.items : [];
  const active = activeIds();
  let html;
  if (!agentLive(s) && adoptionStarting()) {
    // nothing on disk moves yet: the phase from the canon's shape, and when the disk last changed, so a stalled
    // session shows as a time that keeps growing rather than as silence
    const p = adoptProgress();
    const since = lastDiskChangeAt ? `the canon last changed ${ago(now - lastDiskChangeAt)}` : `no change on disk since you opened the page ${ago(now - pageOpenedAt)}`;
    html = `<span class="live-toggle"><span class="spin"></span> <b>Working</b> · ${esc(p.phase)}</span><span class="muted">${esc(p.detail)}; ${since}. Nothing to review until the domains land.</span>`;
  } else if (!agentLive(s)) html = `<span class="muted">No session attached to this page.</span>`;
  else if (doing.length || workingSet.size) {
    // "Working" is the workers and where each is right now, as they signalled it: the session with the branches it
    // holds, each refiner with the one node it is on. Nothing here comes from file times.
    const workers = (lastStatus?.workers ?? []).filter((w) => w.ids.length);
    const nodeLabel = (id) => `${id === "ROOT" ? "Premise" : linkIds(id)}${node(id) ? ` ${esc(node(id).title)}` : ""}`;
    const items = workers.length ? workers.map((w) => `<b>${esc(w.by === "session" ? "session" : w.by.replace(/^refiner-/, "refiner of "))}</b> · ${w.ids.map(nodeLabel).join(", ")}`) : doing.map((d) => linkIds(d));
    const meta = doing.length ? `said ${ago(now - saidAt)}` : "";
    const n = workers.length || items.length;
    html = `<button class="btn small live-toggle" title="Where each worker is now"><span class="spin"></span> Working <span class="muted">· ${n} worker${n === 1 ? "" : "s"}</span></button><ul class="live-list" ${liveOpen ? "" : "hidden"}>${items.map((i) => `<li>${i}</li>`).join("")}${meta ? `<li class="muted">${meta}</li>` : ""}</ul>`;
  }
  else if (working) html = `<span class="spin"></span><span>Working since your last action <span class="muted">· ${esc(elapsed())}</span></span>`;
  else if (s?.pending) html = `<span>Waiting for you <span class="muted">· ${s.pending} question${s.pending === 1 ? "" : "s"} under Issues</span></span>`;
  else html = `<span class="muted">Session attached, nothing running.</span>`;
  if (el.innerHTML !== html) el.innerHTML = html;
  el.hidden = false;
}
const elapsed = () => { const s = Math.floor((Date.now() - (working?.since ?? Date.now())) / 1000); return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`; };
function showWorking(what) {
  if (!working) working = { since: Date.now(), answer: "" };
  // the panel's header counts the seconds; the card goes away until the next question
  $issueCard.hidden = true;
  $question.innerHTML = ""; $question.dataset.issue = "";
  if (what) appendChat([{ kind: "sys", text: `The session is working since ${what}.`, at: new Date().toISOString() }]);
}
// One card for every issue: the node's title, the question, a short summary, the options to pick from with
// "Write it yourself" as the last, and Answer at the bottom. `onAnswer` gets the picked options' indices, or the
// typed text. `change` names the node the decision rewrites, with each option's resulting text.
// The path to a node as a card's head: the premise, each ancestor and the node itself, buttons with a slash between.
// A click focuses the node on the canvas; a double click opens its node card beside the issue card.
function crumbsHtml(id) {
  const crumbs = [];
  for (let p = id; p; p = node(p)?.parent) { const n = node(p); if (!n) break; crumbs.unshift({ id: p, title: n.title }); }
  if (snap.canon.root) crumbs.unshift({ id: "ROOT", title: snap.canon.root.title });
  return `<span class="crumbs">${crumbs.map((c) => `<button class="btn small crumb" data-path="${esc(c.id)}" title="${esc(c.title)}">${esc(c.id === "ROOT" ? "premise" : c.id)}</button>`).join(`<span class="slash">/</span>`)}</span>`;
}
function wireCrumbs(where) {
  for (const b of where.querySelectorAll("button[data-path]")) {
    const id = b.dataset.path;
    b.addEventListener("click", () => { if (document.body.classList.contains("adopt-mode")) focusOnCanvas(id, false, true); else location.hash = id === "ROOT" ? "#/" : `#/node/${id}`; });
    b.addEventListener("dblclick", (e) => { e.preventDefault(); openPopup(id); });
  }
}
function questionCard({ badge, nodeId, title, questionHtml, summaryHtml, options, multi, more, change, onAnswer }) {
  const type = multi ? "checkbox" : "radio";
  const opts = options.map((o, i) => `<label class="opt"><input type="${type}" name="opt" value="${i}" ${!multi && i === 0 ? "checked" : ""}/> <span class="opt-text"><span class="opt-head">${o.labelHtml}</span>${o.descHtml ? `<span class="opt-desc">${o.descHtml}</span>` : ""}</span></label>`).join("");
  const target = nodeId && (node(nodeId) || nodeId.startsWith("PRN-")) ? nodeId : null;
  const draft = target && node(target)?.state === "draft";
  $question.dataset.nodeId = nodeId ?? "";
  $question.innerHTML = `
    ${more ?? ""}
    <div class="q-head">${target && !target.startsWith("PRN-") ? crumbsHtml(target) : nodeId ? idLink(nodeId) : ""} <span class="badge kind">${esc(badge)}</span>${target ? ` <button class="btn small" id="iss-card" title="Open the node card beside this one">Open the node</button>` : ""}</div>
    ${title ? `<h2 class="q-title">${esc(title)}</h2>` : ""}
    ${questionHtml ? `<p class="q-question"><strong>${questionHtml}</strong></p>` : ""}
    ${summaryHtml ? `<div class="q-body body">${summaryHtml}</div>` : ""}
    <div id="q-terms" class="q-terms" hidden></div>
    <div class="opts" id="q-opts">${opts}<label class="opt"><input type="${type}" name="opt" value="write" ${options.length ? "" : "checked"}/> <span class="opt-text"><span class="opt-head"><b>Write it yourself</b></span></span></label></div>
    <div id="q-free" ${options.length ? "hidden" : ""}><textarea id="q-other" rows="3" placeholder="Your own words, or a correction."></textarea></div>
    ${change ? `<p class="q-change"><b>This changes ${esc(change.nodeId)} · ${esc(change.title)}.</b> It will read: <em id="q-change-text"></em></p>` : ""}
    <div class="row"><button class="btn primary" id="q-submit">Answer</button><span class="sub" id="q-hint"></span></div>`;
  wireCrumbs($question);
  const free = $question.querySelector("#q-free"), writeOption = $question.querySelector('input[name=opt][value="write"]'), textarea = $question.querySelector("#q-other");
  const preview = () => { const el = $question.querySelector("#q-change-text"); if (!el || !change) return; const picked = $question.querySelector("input[name=opt]:checked"); el.textContent = writeOption.checked ? (textarea.value.trim() || "what you write above") : picked ? change.texts[Number(picked.value)] ?? "" : "…"; };
  const sync = () => { free.hidden = !writeOption.checked; if (writeOption.checked) textarea.focus(); preview(); };
  for (const i of $question.querySelectorAll("input[name=opt]")) i.addEventListener("change", sync);
  textarea.addEventListener("input", preview);
  if (!options.length) sync(); else preview();
  $question.querySelector("#iss-card")?.addEventListener("click", () => openPopup(target));
  $question.querySelector("#q-submit").addEventListener("click", () => {
    const write = writeOption.checked, text = textarea.value.trim();
    const picked = write ? [] : [...$question.querySelectorAll("input[name=opt]:checked")].map((i) => Number(i.value));
    if (write && !text) { showToast("Write it first, or pick an option."); return; }
    if (!write && !picked.length) { showToast("Pick an option, or write it yourself."); return; }
    onAnswer({ picked, text: write ? text : "" });
  });
}
function renderQuestion(q, pending = 1) {
  working = null;
  if (q.kind === "contradiction" && q.nodeId && node(q.nodeId)) { contradictionCard(q.nodeId, q); $question.dataset.label = `Contradiction · ${q.nodeId}`; return; }
  // The card's title: the node's, or the draft's first sentence while the node is still being drafted; the
  // header is a label of the kind of question and is not repeated when it is only the node's id.
  const nodeTitle = q.nodeId ? node(q.nodeId)?.title : undefined;
  const draftTitle = /"([^"\n]{3,90}?)\./.exec(q.question ?? "")?.[1];
  const title = nodeTitle ?? draftTitle ?? "";
  const label = q.header && q.header !== q.nodeId ? q.header : "";
  // an option reads as ID, title, then description; the ID links to the node's page when the node exists
  const options = q.options.map((o) => { const m = /^((?:REQ|JRN|DEC|PRN|TERM)-\S+)\s+(.+)$/.exec(o.label); return { labelHtml: m ? `${idLink(m[1])} <b>${esc(m[2])}</b>` : `<b>${esc(o.label)}</b>`, descHtml: o.html ?? (o.description ? esc(o.description) : "") }; });
  questionCard({ badge: label || "Question", nodeId: q.nodeId, title, questionHtml: "", summaryHtml: `${q.html}${q.why ? `<p class="sub">Why it matters: ${esc(q.why)}</p>` : ""}`, options, multi: q.multiSelect, more: `${q.notice ? `<p class="notice"><b>Note from the session:</b> ${esc(q.notice)}</p>` : ""}`, onAnswer: ({ picked, text }) => submitAnswer(q, picked, text) });
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
  const holder = $question.querySelector("#q-terms");
  if (!holder) return;
  if (!q.terms.length) { holder.hidden = true; return; }
  const left = q.terms.filter((t) => !termState[t.term.toLowerCase()]).length;
  holder.hidden = false;
  holder.innerHTML = `<p class="sub">${left ? `Before you answer: ${left} term${left > 1 ? "s" : ""} in this draft that the glossary does not define. Keep a term and it enters the glossary with this meaning; drop it and name a word to use instead.` : "Every term is decided; the answer can go."}</p>` +
    q.terms.map((t) => { const st = termState[t.term.toLowerCase()]; return `<div class="term-row"><b>${esc(t.term)}</b><span class="muted">${esc(t.definition)}</span>${st ? `<span class="badge ${st.decision === "keep" ? "stated" : "contested"}">${st.decision === "keep" ? "kept" : `dropped${st.replacement ? `, use "${esc(st.replacement)}"` : ""}`}</span>` : `<span class="row"><button class="btn small ok" data-term-keep="${esc(t.term)}">Keep</button><button class="btn small no" data-term-drop="${esc(t.term)}">Drop</button><input class="term-replace" data-term-input="${esc(t.term)}" placeholder="word to use instead (optional)" hidden /></span>`}</div>`; }).join("");
  for (const b of holder.querySelectorAll("[data-term-keep]")) b.addEventListener("click", () => { const t = q.terms.find((x) => x.term === b.dataset.termKeep); decideTerm(q, t.term, "keep", "", t.definition); });
  for (const b of holder.querySelectorAll("[data-term-drop]")) {
    const input = holder.querySelector(`[data-term-input="${CSS.escape(b.dataset.termDrop)}"]`);
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
    markPending(q.nodeId, "you answered");
    shownQuestionId = null;
    showWorking();
  } catch (e) { showToast(e); }
}
document.addEventListener("click", (e) => { if (!$tooltip.contains(e.target) && !e.target.classList?.contains("jargon")) { $tooltip.hidden = true; tooltipPinned = false; } });

// ---------------------------------------------------------------- adopt: the canvas for reviewing a drafted canon
// Green: the user approved it (stated or resolved). Yellow: the session's guess (assumed). Red: it needs the
// user before adoption can finish: open (the session would not guess), contested, or a check flagged it.
// Nodes start as plain circles; a click shows a node's name, a double-click or its ↗ opens the card.
const adoptState = { expanded: null, selected: null, labelled: new Set(), labels: false, deps: true, edges: true, bands: true, order: true, mode: "dendro", menu: true, prn: true, issuesOpen: true, view: null, focus: new Set() };
function colorOf(id) {
  if (id === "ROOT" || id === "PRINCIPLES") { const s = snap.canon.root?.state; return s === "stated" || s === "resolved" ? "green" : "yellow"; }
  if (id.startsWith("PRN-")) { const s = snap.canon.principles.find((p) => p.id === id)?.state ?? "assumed"; return s === "draft" || s === "contested" ? "red" : s === "stated" || s === "resolved" ? "green" : "yellow"; }
  const n = node(id);
  if (!n) return "yellow";
  if (n.state === "draft" || n.state === "contested") return "red";
  // red is an issue for the user, a draft or a contested node; a finding is the session's to fix and never paints a node
  return n.state === "stated" || n.state === "resolved" ? "green" : "yellow";
}
function ensureExpanded() {
  if (adoptState.expanded) return;
  adoptState.expanded = new Set(["ROOT"]);
}
// True when every node with children is open: then the button offers to collapse back to the domains.
function allOpen() { ensureExpanded(); return Object.keys(snap.canon.nodes).every((id) => !node(id).children.length || adoptState.expanded.has(id)); }
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
  for (const t of snap.canon.terms) c[t.state === "stated" || t.state === "resolved" ? "green" : t.state === "draft" || t.state === "contested" ? "red" : "yellow"]++;
  return c;
}
// The legend of the canvas: the four colours, with their counts over the nodes, the principles and the terms; then the
// two marks about the code and how many nodes with a check have a test, as the server counted them.
function adoptLegend() {
  const c = adoptCounts();
  const blocked = snap.canon.roots.length ? domainProgress().n.blocked : 0;
  const k = marksData?.counts;
  const code = k ? `<span title="Nodes with a check that no code implements yet"><i class="sw grey"></i>not built ${k.notBuilt ?? 0}</span><span title="Nodes whose code fails their tests or contradicts them"><i class="sw ring"></i>out of sync ${k.outOfSync ?? 0}</span><span title="Nodes with a check that have a test">tested ${k.tested ?? 0} of ${k.measurable ?? 0}</span>` : "";
  return `<span class="legend"><span><i class="sw green"></i>approved ${c.green}</span><span><i class="sw yellow"></i>guessed ${c.yellow}</span><span><i class="sw blue"></i>blocked ${blocked}</span><span><i class="sw red"></i>needs you ${c.red}</span>${code}</span>`;
}
function adopt(selectedId) {
  if (selectedId) adoptState.selected = selectedId;
  return `<div class="adopt">
    <div class="toolbar adopt-bar">
      <button class="btn small primary" id="implement-btn" title="Build what is not built and align what is out of sync: the selected node and what is under it, or every node when none is selected">${implementLabel()}</button>
      ${adoptLegend()}
      <span class="modes"><button class="btn small" data-mode-btn="feature" disabled title="Opens after adoption completes: describe what you want to build">New feature</button><button class="btn small" disabled title="Later">Revise</button><button class="btn small" disabled title="Later">Rebalance</button></span>
    </div>
    ${progressStrip()}
    <div id="cy" class="cy-full"></div>
  </div>`;
}
// Progress of a draft: the agent writes one file per node in dependency order, so the canon on disk says
// how far it is. Phases: reading, premise, drafting to the leaves while the user reviews by impact, finished.
function adoptProgress() {
  const nodes = Object.values(snap.canon.nodes);
  const finished = snap.canon.decisions.some((d) => /adoption-scope/.test(d.file));
  const none = { approved: 0, assumed: 0, blocked: 0, issue: 0 };
  if (finished) return { phase: "Adoption finished", f: { ...none, approved: 1 }, n: {}, detail: `${nodes.length} nodes committed` };
  if (!premiseDrafted()) return { phase: "Reading the repository", f: none, n: {}, detail: "the premise comes first" };
  if (snap.canon.roots.length === 0) return { phase: premiseApproved() ? "Drafting the domains" : "The premise waits for you", f: none, n: {}, detail: "the canvas opens with the domains" };
  // from the domains on, the bar is the work: every domain weighs the same, so a domain the session has not started
  // yet is a full grey share, and the bar fills as nodes are approved (green), guessed (yellow), stop on you (red)
  // or wait behind a red node (blue)
  const d = domainProgress();
  const gate = snap.next?.gate;
  const toRefine = snap.stats?.unrefined ?? 0;
  let phase, detail;
  // Guided: while a node waits for approval before the session drafts under it, the phase is the user's turn
  const w = guidedWaits().length;
  if (w) { phase = "Waiting for your approval"; detail = `${w} ${w === 1 ? "node waits" : "nodes wait"} · For you, under Issues`; }
  else if (gate && gate.total && !gate.open) {
    const domains = nodes.filter((n) => !n.parent);
    const opened = domains.filter((n) => n.children.length || n.state === "draft" || n.state === "contested");
    if (opened.length < domains.length) { phase = "Drafting the capabilities of each domain"; detail = `${opened.length} of ${domains.length} domains · ${d.n.issue} need you`; }
    else { phase = "Refining capabilities"; detail = `${gate.refined} of ${gate.total} · ${d.n.issue} need you · ${d.n.blocked} wait behind them`; }
  } else if (toRefine) { phase = "Refining to the leaves"; detail = `${nodes.length - toRefine} of ${nodes.length} nodes · ${d.n.issue} need you · ${d.n.blocked} wait behind them`; }
  else { phase = "Every branch ends in a testable leaf"; detail = `${snap.stats?.leaves ?? nodes.filter((n) => n.kind).length} leaves with a check · ${d.n.issue} need you`; }
  return { phase, f: d.f, n: d.n, detail };
}
// Each domain's subtree in four bands: refined, red (waiting on the user), yellow (an unrefined node behind a red
// one, through a requires chain or under it), grey (unrefined, the machine's to do). The total weighs each
// domain the same.
// A node is blocked when it waits on another: a prerequisite not yet refined (the session's blocked list) or a red
// node above it; the tag names what it waits on.
function blockedBy(id) {
  const n = snap.canon.nodes[id]; if (!n) return null;
  const waits = (snap.next?.blocked ?? []).find((b) => b.id === id)?.waitingOn ?? [];
  const redAbove = []; for (let p = n.parent; p; p = snap.canon.nodes[p]?.parent) { const a = snap.canon.nodes[p]; if (a && (a.state === "draft" || a.state === "contested")) redAbove.push(p); }
  if (!waits.length && !redAbove.length) return null;
  const parts = []; if (waits.length) parts.push(`waits on ${waits.join(", ")}`); if (redAbove.length) parts.push(`under a red node: ${redAbove.join(", ")}`);
  return { waits, redAbove, text: parts.join("; ") };
}
function blockedBadge(id) { const b = blockedBy(id); return b ? ` <span class="badge blocked" title="${esc(b.text)}">blocked</span>` : ""; }
function domainProgress() {
  const isRed = (n) => n.state === "draft" || n.state === "contested";
  const refined = (n) => n.children.length || n.kind;
  const redIds = new Set(Object.values(snap.canon.nodes).filter(isRed).map((n) => n.id));
  const waits = new Map((snap.next?.blocked ?? []).map((b) => [b.id, b.waitingOn]));
  const behindMemo = new Map();
  const behindRed = (id, seen = new Set()) => {
    if (behindMemo.has(id)) return behindMemo.get(id);
    if (seen.has(id)) return false;
    seen.add(id);
    for (let p = snap.canon.nodes[id]?.parent; p; p = snap.canon.nodes[p]?.parent) if (redIds.has(p)) { behindMemo.set(id, true); return true; }
    const r = (waits.get(id) ?? []).some((w) => redIds.has(w) || behindRed(w, seen));
    behindMemo.set(id, r);
    return r;
  };
  const byId = (a, b) => a.localeCompare(b, undefined, { numeric: true });
  // five bands per domain: approved (green), guessed (yellow), blocked behind a red node (blue), needing you (red),
  // and still to refine (grey); a node counts once, in the first band that fits
  const domains = [...snap.canon.roots].sort(byId).map((r) => {
    const pool = [r, ...descendants(r)].map((id) => snap.canon.nodes[id]).filter(Boolean);
    const size = pool.length || 1;
    const n = { approved: 0, assumed: 0, blocked: 0, issue: 0, rest: 0, size };
    for (const x of pool) { if (redIds.has(x.id)) n.issue++; else if (behindRed(x.id)) n.blocked++; else if (!refined(x)) n.rest++; else if (x.state === "stated" || x.state === "resolved") n.approved++; else n.assumed++; }
    const root = snap.canon.nodes[r];
    return { id: r, title: root?.title ?? r, started: pool.length > 1 || n.issue > 0, n, f: { approved: n.approved / size, assumed: n.assumed / size, blocked: n.blocked / size, issue: n.issue / size } };
  });
  const k = domains.length || 1;
  const meanF = (key) => domains.reduce((a, d) => a + d.f[key], 0) / k;
  const sum = (key) => domains.reduce((a, d) => a + d.n[key], 0);
  return { domains, f: { approved: meanF("approved"), assumed: meanF("assumed"), blocked: meanF("blocked"), issue: meanF("issue") }, n: { approved: sum("approved"), assumed: sum("assumed"), blocked: sum("blocked"), issue: sum("issue"), rest: sum("rest"), size: sum("size") } };
}
// A change of phase is told once: a toast, the chime, and a tick in the tab title until the page is looked at.
let lastPhase = null;
function notePhase() {
  if (!snap) return;
  const p = adoptProgress().phase;
  if (lastPhase !== null && p !== lastPhase) { showToast(`Now: ${p}`); document.title = `✓ ${document.title.replace(/^✓ /, "")}`; }
  lastPhase = p;
  const a = adoptProgress();
  const complete = snap.canon.roots.length > 0 && a.phase === "Every branch ends in a testable leaf" && !(a.n?.issue) && !(a.n?.blocked) && !(a.n?.rest);
  const btn = document.querySelector('[data-mode-btn="feature"]'); if (btn) btn.disabled = !complete;
  if (complete && !notePhase.celebrated) { notePhase.celebrated = true; celebrate(); }
}
function celebrate() {
  showToast("Adoption complete: every branch ends in a testable leaf. The list keeps ranking what to approve next.");
  let k = 0; const t = setInterval(() => { chime.last = 0; chime(); if (++k >= 3) clearInterval(t); }, 400);
  const holder = document.createElement("div"); holder.className = "confetti";
  const colours = ["#4c8dff", "#f0b429", "#3fb950", "#ff6b6b", "#a497f0"];
  for (let i = 0; i < 80; i++) { const sp = document.createElement("span"); sp.style.left = `${Math.random() * 100}vw`; sp.style.background = colours[i % colours.length]; sp.style.animationDelay = `${Math.random() * 1.2}s`; sp.style.animationDuration = `${2 + Math.random() * 2}s`; holder.appendChild(sp); }
  document.body.appendChild(holder); setTimeout(() => holder.remove(), 5000);
}
document.addEventListener("visibilitychange", () => { if (!document.hidden) document.title = document.title.replace(/^✓ /, ""); });
let progressMode = "total";
try { progressMode = localStorage.getItem("hc-progress-mode") === "domain" ? "domain" : "total"; } catch { /* fine */ }
// One bar in five bands: approved, guessed, blocked, needing you, still to refine. Hovering a band lifts its count out
// of the bar (the label is the band's data-n, drawn by the stylesheet) and the band glows in its own colour.
function progressBar(f, n = {}, title = "") {
  const pct = (x) => Math.max(0, Math.round((x ?? 0) * 100));
  const keys = [["approved", "approved"], ["assumed", "guessed"], ["blocked", "blocked"], ["issue", "need you"]];
  const todo = Math.max(0, 100 - pct(f?.approved) - pct(f?.assumed) - pct(f?.blocked) - pct(f?.issue));
  const live = keys.filter(([k]) => pct(f?.[k]) > 0).map(([k]) => k);
  const seg = (k, what) => `<span class="${k}${live[0] === k ? " edge-l" : ""}${!todo && live[live.length - 1] === k ? " edge-r" : ""}" style="width:${pct(f?.[k])}%" data-n="${esc(`${n[k] ?? 0} ${what}`)}"></span>`;
  return `<div class="progress-bar" title="${esc(title)}">${keys.map(([k, w]) => seg(k, w)).join("")}<span class="rest" data-n="${esc(`${n.rest ?? 0} to refine`)}"></span></div><span class="pct" title="the part still to refine">${todo}% to do</span>`;
}
function progressStrip() {
  const p = adoptProgress();
  const mode = snap.canon.roots.length ? progressMode : "total";
  const head = `<span class="progress-head"><b>Progress</b><span class="tabs">${["total", "domain"].map((m) => `<button class="btn small ${mode === m ? "on" : ""}" data-pmode="${m}">${m === "total" ? "Total" : "Domain"}</button>`).join("")}</span></span>`;
  if (mode === "total") return `<div class="progress total">${head}${progressBar(p.f, p.n, p.detail)}<span class="progress-label"><b>${esc(p.phase)}</b></span></div>`;
  // one bar per domain, empty until the session starts on it, so the grey is what the agent still has to do
  const rows = domainProgress().domains.map((d) => `<div class="dom ${d.started ? "" : "idle"}"><span class="dom-name" title="${esc(d.title)}"><span class="id">${esc(d.id)}</span> ${esc(d.title)}</span>${progressBar(d.f, d.n, d.started ? `${d.n.size} nodes` : "not started")}</div>`).join("");
  return `<div class="progress domain">${head}<div class="progress-domains">${rows}</div></div>`;
}
document.addEventListener("click", (e) => {
  const b = e.target.closest?.("[data-pmode]"); if (!b || b.dataset.pmode === progressMode) return;
  const from = b.dataset.pmode === "domain" ? "total" : "domain";
  progressMode = b.dataset.pmode; try { localStorage.setItem("hc-progress-mode", progressMode); } catch { /* fine */ }
  const old = $main.querySelector(".progress"); if (!old) return;
  // the bars drain, the strip changes, the new bars fill: combining reads as one bar filling up, splitting as the
  // rows filling in, with no bars piling on one another in between
  const DRAIN = 260;
  for (const span of old.querySelectorAll(".progress-bar span:not(.rest)")) span.style.width = "0%";
  setTimeout(() => {
    const cur = $main.querySelector(".progress"); if (!cur) return;
    cur.outerHTML = progressStrip();
    const strip = $main.querySelector(".progress"); if (!strip) return;
    const spans = [...strip.querySelectorAll(".progress-bar span:not(.rest)")];
    const targets = spans.map((sp) => sp.style.width);
    strip.classList.add("no-anim"); for (const sp of spans) sp.style.width = "0%";
    void strip.offsetWidth; // the zero widths land before the transition is switched back on
    strip.classList.remove("no-anim"); spans.forEach((sp, i) => { sp.style.width = targets[i]; });
  }, DRAIN);
});
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
  // an id the canon does not have, a node signalled before its file exists, has no parent here and is simply not drawn
  const parentOf = (id) => (id === "ROOT" || id === "PRINCIPLES" ? undefined : info(id) ? info(id).parent ?? "ROOT" : undefined);
  const labelled = (id) => adoptState.labels || adoptState.labelled.has(id);
  // A closed circle shows its number; a long number gets a smaller font, the circle never grows.
  const shortOf = (id) => (id === "ROOT" || id === "PRINCIPLES" ? "" : id.replace(/^(REQ|PRN)-/, ""));
  const fsOf = (short) => (short.length <= 3 ? 10 : short.length <= 5 ? 8 : short.length <= 7 ? 6.5 : 5.5);
  const classesOf = (id) => `${colorOf(id)} ${kindOf(id)} ${node(id)?.state === "draft" ? "draft" : ""} ${node(id)?.kind ? "done" : ""} ${pendingNodes.has(id) ? "pending" : ""} ${labelled(id) ? "labelled" : ""} ${adoptState.mode === "dendro" ? "dendro" : ""} ${id === adoptState.selected ? "selected" : ""} ${markClass(id)}`;
  const elementsFor = (show) => {
    const shown = new Set(show);
    const out = [];
    for (const id of show) {
      const n = info(id);
      const short = shortOf(id);
      out.push({ data: { id, label: `${id}\n${n.title}`, short, fs: fsOf(short), dw: 140 }, classes: classesOf(id) });
      const parent = parentOf(id);
      if (parent && shown.has(parent)) out.push({ data: { id: `c:${parent}>${id}`, source: parent, target: id, label: "" }, classes: `contains ${adoptState.edges ? "" : "hidden"}` });
      // a far end folded away: the line goes to its nearest open ancestor, dotted, so a dependency is never invisible
      const visibleEnd = (t) => { let p = t; while (p && !shown.has(p)) p = parentOf(p); return p; };
      for (const t of n.requires) { const v = visibleEnd(t); if (v && v !== id) out.push({ data: { id: `r:${id}>${t}`, source: id, target: v, label: v === t ? "requires" : `requires ${t}` }, classes: `requires dep ${v === t ? "" : "folded"} ${adoptState.edges && adoptState.deps ? "" : "hidden"}` }); }
      for (const t of n.conflicts) { const v = visibleEnd(t); if (v && v !== id) out.push({ data: { id: `x:${id}>${t}`, source: id, target: v, label: v === t ? "conflicts" : `conflicts ${t}` }, classes: `conflicts dep ${v === t ? "" : "folded"} ${adoptState.edges && adoptState.deps ? "" : "hidden"}` }); }
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
      { selector: "node.draft", style: { "border-style": "dashed" } },
      { selector: "node.done", style: { "border-style": "double", "border-width": 3 } },
      { selector: "node.pending", style: { "border-style": "dotted" } },
      // the two marks about the code leave the border to the states above: not built is the fill, out of sync a ring outside it
      { selector: "node.not-built", style: { "background-color": "#3a3f48" } },
      { selector: "node.out-of-sync", style: { "outline-width": 2, "outline-style": "dashed", "outline-color": "#ef4444", "outline-offset": 4 } },
      { selector: "node.premise", style: { shape: "hexagon", width: 44, height: 40 } },
      { selector: "node.principles", style: { shape: "octagon", width: 40, height: 40 } },
      { selector: "node.prn", style: { shape: "diamond", width: 22, height: 22 } },
      { selector: "node.labelled", style: { shape: "round-rectangle", width: 190, height: 58, label: "", "border-width": 1, "background-opacity": 0.7 } },
      { selector: "node.premise.labelled, node.principles.labelled", style: { shape: "round-rectangle", width: 200, height: 60 } },
      { selector: "node.prn.labelled", style: { shape: "round-rectangle", width: 170, height: 48 } },
      { selector: "node.dendro", style: { shape: "round-rectangle", width: "data(dw)", height: 30, label: "", "border-width": 0, "background-opacity": 0 } },
      { selector: "node.dendro.done, node.dendro.pending, node.dendro.selected", style: { "border-width": 0 } },
      { selector: "node.selected", style: { "border-width": 2.5 } },
      { selector: "node.dendro.selected", style: { "border-width": 0 } },
      { selector: "node.dendro.out-of-sync", style: { "outline-width": 0 } }, // in the tree the row card draws the ring
      { selector: "node.dim", style: { opacity: 0.4 } },
      { selector: "edge", style: { width: 1.2, "curve-style": "bezier", "line-color": "#6b7280", "target-arrow-shape": "triangle", "target-arrow-color": "#6b7280", "arrow-scale": 0.8, label: "data(label)", "font-size": 9, color: "#cbd5e1", "text-background-color": "#0f1216", "text-background-opacity": 1, "text-background-padding": "2px" } },
      { selector: "edge.requires", style: { "line-style": "dashed", "line-color": "#60a5fa", "target-arrow-color": "#60a5fa" } },
      { selector: "edge.conflicts", style: { "line-style": "dotted", "line-color": "#ef4444", "target-arrow-shape": "tee", "source-arrow-shape": "tee", "source-arrow-color": "#ef4444", "target-arrow-color": "#ef4444" } },
      { selector: "edge.fork", style: { "curve-style": "round-segments", "segment-radii": 14, "edge-distances": "node-position", "target-arrow-shape": "none" } },
      { selector: "edge.straight", style: { "curve-style": "straight", width: 2 } },
      { selector: "edge.bowed", style: { "curve-style": "unbundled-bezier", "control-point-distances": "data(bow)", "control-point-weights": 0.5, width: 2 } },
      { selector: "edge.folded", style: { "line-style": "dotted", opacity: 0.75 } },
      { selector: "edge.faded", style: { opacity: 0.12 } },
      { selector: "edge.dim", style: { opacity: 0.18 } },
      { selector: ".hidden", style: { display: "none" } },
    ],
    layout: { name: "preset" },
  });
  window.__cy = cy;
  // Fit shows everything, but never closer than a comfortable zoom: one node alone does not fill the screen.
  const fitAll = () => { cy.fit(undefined, 40); if (cy.zoom() > 1.2) { cy.zoom(1.2); cy.center(); } };
  // Positions come from a force simulation, as in a node canvas: a containment edge is a strong spring that
  // holds a child under its parent, a dependency edge a weaker spring that draws a node toward what it needs,
  // nodes repel each other and never overlap. The first arrangement is seeded by a layered pass so the
  // hierarchy reads top-down; after that the simulation runs live, including while a node is dragged.
  const dimsOf = (n) => [n.width(), n.height()];
  const sim = { alpha: 0, raf: 0, pinned: new Set(), heavy: new Set(), offsets: new Map(), top0: 0, lanes: null, rings: null, centre: { x: 0, y: 0 } };
  // Lanes: every level of the tree has its own horizontal band. A lane grows with the number of nodes in it
  // that carry dependency lines, so crowded levels get room; a node moves freely inside its lane.
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
  // Inside its lane a node moves freely up and down; it only never leaves the band.
  const inLane = (n, y) => { const l = laneOf(n), half = l.h / 2 - 22; return Math.max(l.c - half, Math.min(l.c + half, y)); };
  // Radial: every dot in a number is a ring. The premise sits at the centre, the domains on the first ring,
  // their capabilities on the second, and so on; a ring is as thick as a lane and moves outward until its
  // circumference holds every node on it, and thick enough that its widest node clears the rings beside it. The
  // arrangement is computed outright, not simulated: every branch
  // owns a slice of its parent's slice, sized by how many nodes it shows, so siblings stand together; with
  // Order on, siblings are swapped around while that pulls the dependency lines apart; then the nodes on
  // each ring are spaced so none overlap. The containment lines fork like a dendrogram: out from the parent
  // to just inside the children's ring, around, and out to each child. Nodes cannot be dragged here.
  const ringOf = (n) => (n.id() === "ROOT" ? 0 : n.id() === "PRINCIPLES" ? 1 : n.hasClass("prn") ? 2 : n.id().replace(/^REQ-/, "").split(".").length);
  // past this many nodes an arrangement is applied, not animated: 840 glides and a card per node per frame is what froze the tab
  const BIG = () => cy.nodes().length > 150;
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
    // every node's direction, from the slices, given the order of every node's children
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
    // on each ring the nodes keep their order and move apart until none overlap along the ring; a node's extent
    // along the ring depends on where it stands: wide at the top and bottom, tall at the sides
    const byRing = new Map();
    for (const n of cy.nodes()) { if (n.id() === "ROOT") continue; const r = ringOf(n); (byRing.get(r) ?? byRing.set(r, []).get(r)).push(n); }
    for (const [r, group] of byRing) {
      const R = rings[r].c;
      const run = [...group].sort((a, b) => A.get(a.id()) - A.get(b.id()));
      const span = run.map((n) => { const a = A.get(n.id()), [w, h] = finalSize(n); return (Math.abs(w * Math.sin(a)) + Math.abs(h * Math.cos(a)) + 26) / R; });
      // the ring is a circle: the last node and the first are neighbours too, so the passes wrap around
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
    // the forks, as segment lines: a line leaves a node from the middle of the side that faces the way it
    // goes, and arrives at the middle of the side that faces it, so it visibly meets the node instead of
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
      for (const n of cy.nodes()) { const p = P.get(n.id()); if (animated && !BIG()) n.animate({ position: p }, { duration: 320, easing: "ease-in-out", queue: false }); else n.position(p); }
    });
    laneLines();
    place();
    if (animated && !BIG()) follow(380);
  };
  const unfork = () => { cy.edges(".fork").removeClass("fork").removeStyle("segment-weights segment-distances"); cy.edges(".straight").removeClass("straight"); if (cy.nodes(".dendro").length) { cy.nodes().removeClass("dendro"); makeOverlays(); } cy.nodes().grabify(); };
  // A fork as a segment line: the points are given relative to the straight line from parent to child.
  const fork = (e, S, T, pts, cls = "fork") => {
    const vx = T.x - S.x, vy = T.y - S.y, L = Math.hypot(vx, vy) || 1;
    const ws = [], ds = [];
    for (const p of pts) { const px = p.x - S.x, py = p.y - S.y; ws.push(((px * vx + py * vy) / (L * L)).toFixed(4)); ds.push(((-px * vy + py * vx) / L).toFixed(2)); }
    e.addClass(cls).style({ "segment-weights": ws.join(" "), "segment-distances": ds.join(" ") });
  };
  // Dendrogram: left to right, one column per level, every node a single row showing its number and its
  // whole title; a column is as wide as its widest row. A leaf takes one row, a parent as many as its
  // children together and stands level with their middle, so a branch never overlaps another. Dotted
  // lines mark the columns and, inside a column, part one parent's children from the next's. Computed
  // outright like the rings, with the same forks: out of the parent's right side, down the gutter before
  // the children's column, into each child's left side. Nothing is collapsed here and nothing is dragged.
  const ROWH = 44, COLGAP = 72;
  // A row's width is measured on a real card, in the page's own font, so the outline and the card always agree;
  // the canvas could not be trusted to render the same width as the DOM.
  const rowWidth = (() => {
    const cache = new Map(); let probe = null;
    return (id) => {
      const title = info(id).title, key = id + "\n" + title;
      if (cache.has(key)) return cache.get(key);
      if (!probe) { probe = document.createElement("div"); probe.className = "ov-card row"; probe.style.cssText = "position:absolute;visibility:hidden;left:-9999px;top:-9999px;width:auto;height:auto;animation:none;pointer-events:none"; el.appendChild(probe); }
      probe.innerHTML = `<span class="tag">${esc(id === "ROOT" ? "Premise" : id === "PRINCIPLES" ? "Principles" : id)}</span><span class="ttl">${esc(title)}</span>`;
      const w = Math.ceil(probe.getBoundingClientRect().width) + 4;
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
      // in the tree a dependency is drawn only while one of its ends is selected; each bows by its own amount, to
      // one side or the other, so lines that share a column no longer lie on one another
      const byId = (a, b) => a.localeCompare(b, undefined, { numeric: true });
      cy.edges(".dep").toArray().sort((a, b) => byId(a.source().id(), b.source().id()) || byId(a.target().id(), b.target().id())).forEach((e, k) => { e.removeClass("straight"); e.data("bow", (k % 2 ? 1 : -1) * (28 + 16 * (Math.floor(k / 2) % 5))); e.addClass("bowed"); });
      applyDeps();
      cy.nodes().ungrabify();
      for (const n of cy.nodes()) { const p = P.get(n.id()); if (animated && !BIG()) n.animate({ position: p }, { duration: 320, easing: "ease-in-out", queue: false }); else n.position(p); }
    });
    // every node is a row here, so the overlays are rebuilt, not just moved
    makeOverlays();
    if (animated && !BIG()) follow(380);
  };
  // Which computed arrangement the view uses; the lanes use the simulation instead.
  const relayout = (animated) => (adoptState.mode === "radial" ? layoutRadial : layoutDendro)(animated);
  // Overlap is never allowed to stand. Nodes in the same lane separate sideways, since the lane clamp would undo
  // a vertical push; others separate along the axis of least overlap. A bright or just-dropped node has right of way.
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
  // Ordering: within each lane, nodes are sorted by the average x of their neighbours in the lanes above and
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
      // left to right, each node takes its wanted place unless that overlaps the one before; then a pass back
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
    // Lines push nodes off them, and are pushed off nodes: a node near a line it is not an end of is nudged away,
    // perpendicular to the line, measured against the node's real rectangle; the line's ends get the opposite nudge.
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
    // a pinned node follows the mouse; a just-dropped block stays where it was put while the others clear out
    const gain = sim.alpha * (sim.pinned.size ? 0.35 : 1);
    cy.batch(() => { for (const p of arr) { if (sim.pinned.has(p.n.id()) || sim.heavy.has(p.n.id())) continue; p.n.position({ x: p.x + p.fx * gain, y: adoptState.bands ? inLane(p.n, p.y + p.fy * gain) : p.y + p.fy * gain }); } });
    place();
  };
  const run = () => {
    cancelAnimationFrame(sim.raf);
    const step = () => { tick(); sim.alpha *= 0.95; if (sim.alpha > 0.02) sim.raf = requestAnimationFrame(step); else { sim.alpha = 0; orderLanes(true); setTimeout(() => { hardSeparate(); keepInView(adoptState.selected); }, 340); sim.heavy.clear(); } };
    sim.raf = requestAnimationFrame(step);
  };
  // On the rings a settle is one fresh arrangement; several asked for in the same breath (a node and its
  // ancestors naming themselves) become one. In the lanes it is the simulation.
  const settle = (strength = 1) => { if (adoptState.mode === "lanes" && BIG()) { seed(); place(); return; } if (adoptState.mode !== "lanes") { if (!sim.relayout) sim.relayout = setTimeout(() => { sim.relayout = 0; relayout(true); }, 0); return; } sim.alpha = Math.max(sim.alpha, strength); run(); };
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
  // Focus: the nodes the user expanded, their descendants and their ancestors are active; the rest fade a little.
  // Focus follows the nodes the user expanded themselves; with none, everything is active.
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
  // Buttons that float over the nodes: the children handle under every node that has children, and, on a
  // named node, the card with its tag and title, the eye that hides the name and the ↗ that opens the card.
  const overlay = document.createElement("div");
  overlay.className = "overlays";
  el.appendChild(overlay);
  // the classes a row card carries from its node: colour, state and the two marks about the code
  const ROW_CLASSES = ["green", "yellow", "red", "done", "pending", "draft", "selected", "not-built", "out-of-sync"];
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
        card.className = "ov-card row " + n.classes().filter((k) => ROW_CLASSES.includes(k)).join(" "); card.dataset.id = id; card.dataset.kind = "card"; card.style.width = n.data("dw") + "px";
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
        go.className = "ov go"; go.dataset.id = id; go.dataset.kind = "go"; go.textContent = "↗"; go.title = "Open this node";
        go.addEventListener("click", (ev) => { ev.stopPropagation(); select(id); openPopup(id); });
        overlay.appendChild(go);
      }
    }
    for (const b of overlay.querySelectorAll("button")) for (const ev of ["pointerdown", "mousedown", "touchstart"]) b.addEventListener(ev, (e) => e.stopPropagation());
    syncSpinners(false);
    laneLines();
    place();
  };
  // A spinner at the top-left corner of every node being refined now; rebuilt whenever the activity changes.
  const syncSpinners = (andPlace = true) => {
    for (const w of overlay.querySelectorAll(".ov.working")) w.remove();
    // a node being refined that is folded away spins its nearest open ancestor, named on hover
    const shown = new Set(cy.nodes().map((n) => n.id()));
    const under = new Map();
    // the session's own signal first; the disk only when no signal exists at all, and then named as writing
    // exactly what the workers signalled, live: the session holds its branches, each refiner the one node it is on
    const signalled = workingSet.size > 0;
    const spinning = new Set([...pendingNodes.keys(), ...workingSet]);
    for (const id of spinning) {
      let at = id; while (at && !shown.has(at)) at = parentOf(at);
      if (!at) continue;
      if (!under.has(at)) under.set(at, []);
      under.get(at).push(id);
    }
    for (const [at, ids] of under) {
      const w = document.createElement("span");
      const own = ids.includes(at), others = ids.filter((i) => i !== at);
      w.className = "ov working"; w.dataset.id = at; w.dataset.kind = "spin"; w.innerHTML = '<i class="spin"></i>';
      const who = workerOf(at) ?? ids.map((i) => workerOf(i)).find(Boolean); const how = who && who !== "session" ? `being refined now by ${who}` : "being refined now";
      w.title = own && !others.length ? `${at} is ${how}` : `${how[0].toUpperCase() + how.slice(1)} under ${at}: ${others.join(", ")}`;
      overlay.appendChild(w);
    }
    if (andPlace) place();
  };
  window.__cySpin = syncSpinners;
  // Columns and lanes are named by the layer the nodes at that depth carry, never by the depth alone: nested
  // requirements stay requirements, numbered, and a project without a domain layer starts with capabilities.
  const PLURAL = { domain: "domains", capability: "capabilities", requirement: "requirements" };
  const levelName = (d) => {
    if (d === 0) return "premise";
    const at = Object.values(snap.canon.nodes).filter((n) => n.depth === d - 1);
    if (!at.length) return `level ${d}`;
    const layer = Object.keys(PLURAL).map((l) => [l, at.filter((n) => n.layer === l).length]).sort((a, b) => b[1] - a[1])[0][0];
    const first = Math.min(...Object.values(snap.canon.nodes).filter((n) => n.layer === layer).map((n) => n.depth)) + 1;
    return d > first ? `${PLURAL[layer]} ${d - first + 1}` : PLURAL[layer];
  };
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
    const far = z < 0.4 && BIG();
    if (far) { if (!overlay.dataset.far) { for (const h of overlay.children) if (!h.classList.contains("lane")) h.style.display = "none"; overlay.dataset.far = "1"; } }
    else if (overlay.dataset.far) delete overlay.dataset.far;
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
      else if (h.dataset.kind === "spin") { h.style.left = `${p.x - w / 2 + 12 * z}px`; h.style.top = `${p.y - hh / 2 + 12 * z}px`; h.style.transform = `translate(-50%, -50%) scale(${z})`; }
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
  // The selected or just-moved node stays on screen: the view pans just enough to show it whole.
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
      <button class="btn small" data-expand-all="1" data-views="lanes dendro" title="${allOpen() ? "Close every node back to the domains" : "Open every node down to the leaves"}">${allOpen() ? "Collapse all" : "Show all"}</button>
      <p class="menu-hint">Double-click a node to open it. The handle beside it shows its children; a double border is a leaf with its check, which branches no further. Drag to pan, wheel to zoom.</p>
    </div>`;
  el.appendChild(menu);
  // The canvas takes the wheel in the capture phase, before a panel lying on it can keep it: so the wheel over a
  // panel is stopped at the window, ahead of the canvas, and the panel's own list scrolls. Registered once.
  if (!window.__hcPanelWheel) { window.__hcPanelWheel = true; window.addEventListener("wheel", (e) => { if (e.target instanceof Element && e.target.closest(".menu, .left-stack")) e.stopPropagation(); }, { capture: true, passive: true }); }
  for (const ev of ["pointerdown", "mousedown", "touchstart", "wheel"]) menu.addEventListener(ev, (e) => e.stopPropagation());
  menu.querySelector("[data-collapse]").addEventListener("click", () => { adoptState.menu = !adoptState.menu; menu.classList.toggle("closed", !adoptState.menu); });
  const labelButton = () => { const b = menu.querySelector("[data-labels]"); b.classList.toggle("on", adoptState.labels); b.textContent = adoptState.labels ? "Collapse" : "Expand"; };
  // The principles keep one place in every view, the canvas's top left corner; each row opens its card.
  const leftStack = document.createElement("div");
  leftStack.className = "left-stack";
  el.appendChild(leftStack);
  const prnPanel = document.createElement("div");
  prnPanel.className = "menu principles" + (adoptState.prn ? "" : " closed");
  const prnRows = () => snap.canon.principles.map((p) => `<button class="btn small prn-row" data-prn="${esc(p.id)}" title="${esc(p.statement)}"><i class="sw ${colorOf(p.id)}"></i><span class="tag">${esc(p.id)}</span><span>${esc(p.title)}</span></button>`).join("") || `<span class="muted">none yet</span>`;
  prnPanel.innerHTML = `<div class="menu-head"><b>Principles</b><button class="btn small" data-prn-approve="1" title="Approve every principle still guessed; the session goes on from here">Approve the rest</button><button class="btn small caret" data-collapse="1" title="Fold or unfold the principles">▾</button></div><div class="menu-body">${prnRows()}</div>`;
  adoptState.refreshPrn = () => { const b = prnPanel.querySelector(".menu-body"); b.innerHTML = prnRows(); for (const x of b.querySelectorAll("[data-prn]")) x.addEventListener("click", () => openPopup(x.dataset.prn)); prnPanel.querySelector("[data-prn-approve]").hidden = snap.canon.principles.every((p) => p.state === "stated" || p.state === "resolved"); };
  leftStack.appendChild(prnPanel);
  prnPanel.querySelector("[data-prn-approve]").hidden = snap.canon.principles.every((p) => p.state === "stated" || p.state === "resolved");
  for (const ev of ["pointerdown", "mousedown", "touchstart", "wheel"]) prnPanel.addEventListener(ev, (e) => e.stopPropagation());
  // The Issues panel: the session's questions, which open when the user clicks them, and the nodes that need the
  // user; a click highlights a node, a double-click opens its card. Nothing here opens by itself.
  const issuesPanel = document.createElement("div");
  issuesPanel.className = "menu issues" + (adoptState.issuesOpen ? "" : " closed");
  issuesPanel.innerHTML = `<div class="menu-head"><b>Issues</b><span class="pill" id="issues-count" hidden></span><button class="btn small" data-issues-expand="1"></button><button class="btn small caret" data-collapse="1" title="Fold or unfold the issues">▾</button></div><div class="menu-body" id="issues-body"></div>`;
  leftStack.appendChild(issuesPanel);
  // The panel opens into a large card at the centre of the window and goes back to its corner. It lives on the page
  // itself while large, below the cards, so a node or an issue opened from it draws over it. One at a time: a
  // redraw of the canvas makes a new panel, and the old large one is taken away first.
  for (const old of document.querySelectorAll("body > .menu.issues.expanded")) old.remove();
  const placeIssues = () => {
    const big = Boolean(adoptState.issuesBig);
    issuesPanel.classList.toggle("expanded", big);
    if (big) { issuesPanel.classList.remove("closed"); document.body.appendChild(issuesPanel); } else { issuesPanel.classList.toggle("closed", !adoptState.issuesOpen); leftStack.appendChild(issuesPanel); }
    const b = issuesPanel.querySelector("[data-issues-expand]");
    b.textContent = big ? "Dock" : "Expand";
    b.title = big ? "Put the issues back in the corner of the canvas" : "Open the issues as a large card in the middle of the window";
  };
  // The move between the corner and the centre is shown: the panel grows from where it was to where it lands, and
  // shrinks back the same way. Skipped for a user who asked their system for less motion.
  issuesPanel.querySelector("[data-issues-expand]").addEventListener("click", () => {
    const from = issuesPanel.getBoundingClientRect();
    adoptState.issuesBig = !adoptState.issuesBig;
    placeIssues();
    const to = issuesPanel.getBoundingClientRect();
    if (!from.width || !to.width || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches || !issuesPanel.animate) return;
    issuesPanel.getAnimations().forEach((a) => a.cancel());
    issuesPanel.animate([{ transformOrigin: "top left", transform: `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${from.width / to.width}, ${from.height / to.height})`, opacity: 0.6 }, { transformOrigin: "top left", transform: "none", opacity: 1 }], { duration: 220, easing: "cubic-bezier(.2,.7,.2,1)" });
  });
  placeIssues();
  if (adoptState.issuesBig && adoptState.issuesScroll) requestAnimationFrame(() => { const b = issuesPanel.querySelector(".menu-body"); if (b) b.scrollTop = adoptState.issuesScroll; adoptState.issuesScroll = 0; });
  for (const ev of ["pointerdown", "mousedown", "touchstart", "wheel"]) issuesPanel.addEventListener(ev, (e) => e.stopPropagation());
  issuesPanel.querySelector("[data-collapse]").addEventListener("click", () => { adoptState.issuesOpen = !adoptState.issuesOpen; issuesPanel.classList.toggle("closed", !adoptState.issuesOpen); });
  renderIssues(lastSession);
  prnPanel.querySelector("[data-prn-approve]")?.addEventListener("click", async () => { try { await post("/api/principles/approve", {}); showToast("Principles approved as listed."); } catch (e) { showToast(e); } });
  prnPanel.querySelector("[data-collapse]").addEventListener("click", () => { adoptState.prn = !adoptState.prn; prnPanel.classList.toggle("closed", !adoptState.prn); });
  for (const b of prnPanel.querySelectorAll("[data-prn]")) b.addEventListener("click", () => openPopup(b.dataset.prn));
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
  // While nodes glide on their own, outside the simulation, the overlays follow them frame by frame.
  const follow = (ms) => { const until = performance.now() + ms; const loop = () => { place(); if (performance.now() < until) requestAnimationFrame(loop); }; requestAnimationFrame(loop); };
  // The dependency lines follow the Dependencies and Edges switches; in the tree only the selected row's show.
  const applyDeps = () => { const on = adoptState.deps && adoptState.edges, sel = adoptState.selected; for (const e of cy.edges(".dep")) e.toggleClass("hidden", !on || (adoptState.mode === "dendro" && e.source().id() !== sel && e.target().id() !== sel)); };
  // a selection changes classes, not cards: the row cards take their node's classes in place, so nothing is recreated and
  // nothing replays its entry animation
  const syncRowCards = () => { for (const c of overlay.querySelectorAll(".ov-card.row[data-id]")) { const n = cy.getElementById(c.dataset.id); if (!n.length) continue; const want = "ov-card row " + n.classes().filter((k) => ROW_CLASSES.includes(k)).join(" "); if (c.className !== want) c.className = want; } };
  adoptState.syncRowCards = syncRowCards;
  // the run card's scope is the selection, so it follows a new one at once
  const select = (id) => { adoptState.selected = id; cy.$("node.selected").removeClass("selected"); cy.getElementById(id).addClass("selected"); applyFocus(); applyDeps(); syncRowCards(); place(); keepInView(id); renderRunCard(); };
  cy.on("tap", (e) => { if (e.target === cy && adoptState.selected) { adoptState.selected = null; cy.$("node.selected").removeClass("selected"); applyFocus(); applyDeps(); syncRowCards(); place(); renderRunCard(); } });
  // A node grows into its card over a third of a second while the simulation runs, and shrinks back the same way.
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
  // Expanding or collapsing changes the graph in place: new nodes grow out of their parent and everything
  // glides to the new layered layout.
  const sync = () => {
    const show = adoptScope();
    const shown = new Set(show);
    cy.remove(cy.nodes().filter((n) => !shown.has(n.id())));
    cy.remove(cy.edges(".dep"));
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
  // A change on disk: every shown node takes its current colour and name, nodes that appeared or went move the layout.
  // Only what changed moves: a node whose colour or name changed takes it, the layout runs only when nodes appeared
  // or went, and a refresh that changes nothing touches nothing, so the canvas never blinks on a poll.
  adoptState.refresh = () => {
    const before = cy.nodes().length;
    let changed = false;
    cy.batch(() => { for (const n of cy.nodes()) { const id = n.id(); const i = info(id); if (!i) continue; const cls = classesOf(id).split(/\s+/).filter(Boolean).sort().join(" "); if (n.classes().slice().sort().join(" ") !== cls) { n.classes(cls); changed = true; } const label = `${id}\n${i.title}`; if (n.data("label") !== label) n.data("label", label); } });
    const shown = new Set(adoptScope()); const have = new Set(cy.nodes().map((n) => n.id()));
    const structural = [...shown].some((id) => !have.has(id)) || [...have].some((id) => !shown.has(id));
    if (structural) sync(); else if (changed) makeOverlays();
    if (before <= 1 && cy.nodes().length > 1) setTimeout(fitAll, 500);
  };
  let lastTap = { id: null, at: 0 };
  cy.on("mouseover", "edge.dep", (e) => cy.edges(".dep").not(e.target).addClass("faded"));
  cy.on("mouseout", "edge.dep", () => cy.edges(".dep").removeClass("faded"));
  cy.on("tap", "edge.dep", (e) => {
    const s = e.target.source().id(), t = e.target.target().id();
    const other = s === adoptState.selected ? t : t === adoptState.selected ? s : t;
    cy.edges(".dep").removeClass("faded");
    select(other);
    // the view follows the hop, so a click on a long line moves the eye to its far end, and the next click back
    cy.animate({ center: { eles: cy.getElementById(other) } }, { duration: 260, easing: "ease-in-out", queue: false });
    if (adoptState.mode !== "dendro") showLabel(other);
  });
  cy.on("tap", "node", (e) => {
    const id = e.target.id(), now = Date.now();
    if (lastTap.id === id && now - lastTap.at < 400) { lastTap = { id: null, at: 0 }; select(id); openPopup(id); return; }
    lastTap = { id, at: now };
    select(id);
    if (adoptState.mode === "dendro") return;
    showLabel(id);
    // the path to the root reads along with the node: every ancestor shows its name too
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
    // a redraw with a selected node brings that node on screen
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
  $main.querySelector('[data-mode-btn="feature"]')?.addEventListener("click", () => { const holder = document.getElementById("msg"); if (holder) { holder.value = "New feature: "; holder.focus(); } showToast("Describe what you want to build; the session checks it and asks where it goes."); });
  $main.querySelector("[data-expand-all]")?.addEventListener("click", (ev) => {
    if (allOpen()) adoptState.expanded = new Set(["ROOT"]);
    else for (const id of Object.keys(snap.canon.nodes)) if (node(id).children.length) adoptState.expanded.add(id);
    adoptState.focus.clear();
    const open = allOpen(); ev.currentTarget.textContent = open ? "Collapse all" : "Show all"; ev.currentTarget.title = open ? "Close every node back to the domains" : "Open every node down to the leaves";
    sync();
  });
}
function toggleExpand(id) { ensureExpanded(); if (adoptState.expanded.has(id)) { adoptState.expanded.delete(id); adoptState.focus.delete(id); } else { adoptState.expanded.add(id); adoptState.focus.add(id); } if (adoptState.sync && $main.querySelector(".adopt #cy")) adoptState.sync(); else render(); }
// The canvas shows a node: selected, its ancestors opened, the view drawn around it, and its card when asked.
function focusOnCanvas(id, open, byUser = false) {
  // while the user has a card open, the session's pointing is noted in the chat and moves nothing; the
  // user's own click closes the card first, unless they are mid-rewrite
  if (!$popup.hidden) {
    if (!byUser) { adoptState.selected = id; appendChat([{ kind: "sys", text: `The session points at ${id}; your card stays as it is.`, at: new Date().toISOString() }]); return; }
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
  // every side of a contradiction: the nodes this one conflicts with, either way round
  const conflictIds = isRoot || prn ? [] : [...new Set([...(n.conflicts ?? []), ...Object.values(snap.canon.nodes).filter((o) => (o.conflicts ?? []).includes(id)).map((o) => o.id)])].filter((x) => snap.canon.nodes[x]);
  const because = color === "red"
    ? (state === "draft" ? "A draft: the session's provisional name for a thing it could not define. Its question is an issue; answering it defines the node." : state === "contested" ? (conflictIds.length ? "This node and another contradict each other; the tabs show both. Keep one or rewrite." : "Two statements pull against each other; the tabs show each. Keep one or rewrite.") : "A check flagged it; see below.")
    : color === "yellow" ? "The session's guess from your documents. Approve it, rewrite it, or delete it." : "Approved by you.";
  const fs = isRoot || prn ? [] : findingsFor(id).filter((f) => f.level !== "info");
  const kids = isRoot ? snap.canon.roots.length : n.children.length;
  const bodyHtml = isRoot ? stripHtmlSection(snap.html[id] ?? "", "Principles") : prn ? `<p>${esc(prn.statement)}</p>${prn.source ? `<p class="muted">Source: ${esc(prn.source)}</p>` : ""}` : snap.html[id];
  // ... and the statements a contested node records against each other; each side gets a tab beside the node's own text
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
  for (const cid of conflictIds) { const o = snap.canon.nodes[cid]; panes.push({ label: cid, html: `<p class="sub"><i class="sw ${colorOf(cid)}"></i>${esc(cid)} ${badge(o.state)} <b>${esc(o.title)}</b> conflicts with this node. <a href="#" data-open="${esc(cid)}">Open ${esc(cid)}</a></p>${snap.html[cid] ?? ""}` }); }
  // the Deferred list, the parts not yet refined, and As built, what the code does today, live in tabs of their own so
  // the intent stands alone: what must hold on the card, what holds one click away
  const deferredHtml = isRoot || prn ? "" : extractHtmlSection(bodyHtml ?? "", "Deferred");
  if (deferredHtml) panes.push({ label: `Deferred (${(deferredHtml.match(/<li/g) || []).length})`, html: deferredHtml });
  const builtHtml = isRoot || prn ? "" : (extractHtmlSection(bodyHtml ?? "", "Implemented by") || extractHtmlSection(bodyHtml ?? "", "As built"));
  const binds = isRoot || prn ? [] : (n.binds ?? []);
  const bindsHtml = binds.length ? ["implements", "contributes", "contradicts"].map((r) => { const xs = binds.filter((b) => b.relation === r); return xs.length ? `<p class="sub"><b>${r}</b></p><ul>${xs.map((b) => `<li><code>${esc(b.unit)}</code></li>`).join("")}</ul>` : ""; }).join("") : "";
  if (builtHtml || bindsHtml) panes.push({ label: `Implemented by${binds.length ? ` (${binds.length})` : ""}`, html: `<p class="sub">The code units and documents this node rests on, with how each relates to it; written from the bindings, never approved by you.</p>${bindsHtml}${builtHtml}` });
  // the tests of a node with a check, one click away like the rest of what holds; the list arrives after the card
  const mark = isRoot || prn ? undefined : markOf(id);
  if (mark && (n.kind || mark.tests)) panes.push({ key: "tests", label: testsLabel(mark), html: `<p class="sub">What each test checks and how, with its last result.</p><div data-tests-for="${esc(id)}"><p class="muted">Loading the tests…</p></div>` });
  let mainHtml = bodyHtml ?? "";
  if (statements.length >= 2) mainHtml = stripHtmlSection(mainHtml, "Contested");
  if (deferredHtml) mainHtml = stripHtmlSection(mainHtml, "Deferred");
  if (builtHtml) { mainHtml = stripHtmlSection(mainHtml, "Implemented by"); mainHtml = stripHtmlSection(mainHtml, "As built"); }
  $popup.innerHTML = `
    <div class="popup-head">${isRoot || prn ? `<span class="id">${esc(id)}</span>` : crumbsHtml(id)} ${badge(state ?? "assumed")}${blockedBadge(id)} <span><i class="sw ${color}"></i><span class="muted">${because}</span></span><button class="btn small" id="pp-close" title="Close">✕</button></div>
    <h2>${esc(isRoot ? snap.canon.root?.title ?? "Premise" : n.title)}</h2>
    ${isRoot || prn ? "" : `<p class="built-line" id="pp-built"${builtWords(id) ? "" : " hidden"}>${builtLine(id)}</p>`}
    ${state === "contested" ? (conflictSummary ? `<p class="conflict-summary">${conflictSummary}</p>` : `<p class="conflict-summary muted">No summary of the contradiction yet. <button class="btn small" id="pp-explain">Ask the session to explain</button></p>`) : ""}
    ${panes.length ? `<div class="pp-tabs"><button class="btn small on" data-pane="-1">Intent</button>${panes.map((p, i) => `<button class="btn small" data-pane="${i}"${p.key ? ` data-pane-key="${p.key}"` : ""}>${esc(p.label)}</button>`).join("")}</div>` : ""}
    <div class="popup-body body" id="pp-body">${markSections(mainHtml || "<p class='muted'>No text yet.</p>")}</div>
    ${panes.map((p, i) => `<div class="popup-body body pp-pane" data-pane="${i}" hidden>${markSections(p.html)}</div>`).join("")}
    <div id="pp-editor" class="editor" hidden></div>
    ${fs.length ? `<ul class="pp-findings">${fs.map((f) => `<li>${badge(f.level)} ${esc(f.message)}</li>`).join("")}</ul>` : ""}
    <div id="pp-review"></div>
    <div class="row pp-actions">
      ${color !== "green" && state !== "draft" ? `<button class="btn primary" id="pp-approve" title="Keep it as written; it becomes approved by you">Approve</button>` : ""}
      ${isRoot || prn ? "" : `<button class="btn" id="pp-implement" title="The session builds this node alone, runs its tests, and brings the result to you"${canImplement(id) ? "" : " hidden"}>Implement this</button>`}
      <button class="btn" id="pp-edit" title="Say it in your own words">${state === "draft" ? "Write it yourself" : "Rewrite"}</button>
      ${isRoot ? "" : `<button class="btn" id="pp-delete" title="Remove this node and everything under it">Delete</button>`}
      ${kids && !isRoot ? `<button class="btn" id="pp-toggle">${adoptState.expanded?.has(id) ? "Hide children" : `Show ${kids} children`}</button>` : ""}
      ${isRoot || prn ? "" : `<button class="btn" id="pp-define" title="Ask the session to define this branch further">Define further</button>`}
    </div>
    <p class="sub">Select any words above to ask the session about them in the chat.</p>
    <i class="pp-resize nw"></i><i class="pp-resize ne"></i><i class="pp-resize sw"></i><i class="pp-resize se"></i>`;
  const wasHidden = $popup.hidden;
  $popup.hidden = false;
  $popup.dataset.id = id;
  testsCache.delete(id); // a card that opens asks for the node's tests afresh
  syncPopupReview(); // before the card takes its size, so a decision that waits is inside it
  if (wasHidden) centerPopup();
  wirePopupMoves();
  wireCrumbs($popup);
  $popup.querySelector("#pp-close").addEventListener("click", () => { if (editingDraft() && !confirm("Discard your rewrite?")) return; closePopup(); });
  for (const b of $popup.querySelectorAll(".pp-tabs button")) b.addEventListener("click", () => { const k = b.dataset.pane; for (const o of $popup.querySelectorAll(".pp-tabs button")) o.classList.toggle("on", o === b); $popup.querySelector("#pp-body").hidden = k !== "-1"; for (const pane of $popup.querySelectorAll(".pp-pane")) pane.hidden = pane.dataset.pane !== k; });
  $popup.querySelector("#pp-explain")?.addEventListener("click", async () => { try { await post("/api/message", { text: `Explain the contradiction in ${id} in one or two sentences: what the two statements cannot both hold, and what choosing decides. Record it as the first paragraph under its Contested heading.`, nodeId: id }); startWorking(`you asked for an explanation of ${id}`); } catch (e) { showToast(e); } });
  for (const a of $popup.querySelectorAll("[data-open]")) a.addEventListener("click", (ev) => { ev.preventDefault(); if (editingDraft()) { showToast("Finish or cancel your rewrite first."); return; } closePopup(); focusOnCanvas(a.dataset.open, true); });
  $popup.querySelector("#pp-approve")?.addEventListener("click", async () => {
    // In Guided an approval starts work only where the session waited for it: the premise, or a node with no check and
    // nothing under it. Any other approval opens nothing and the session says nothing, so no clock starts for it.
    const opens = () => { const x = node(id); return !guided() || isRoot || Boolean(!prn && x && !x.kind && !x.children.length); };
    try { await post(`/api/node/${encodeURIComponent(id)}/approve`, {}); touched(id); closePopup(); await load(); refreshAdopt(); if (opens()) startWorking(`you approved ${id}`); } catch (e) { showToast(e); }
  });
  $popup.querySelector("#pp-delete")?.addEventListener("click", async () => {
    if (!confirm(`Delete ${id}${kids ? ` and its ${kids} children` : ""}? The session will re-check what depended on it.`)) return;
    try { await fetch(`/api/node/${encodeURIComponent(id)}`, { method: "DELETE" }); closePopup(); adoptState.selected = null; await load(); render(); startWorking(`you deleted ${id}`); } catch (e) { showToast(e); }
  });
  $popup.querySelector("#pp-toggle")?.addEventListener("click", () => { toggleExpand(id); openPopup(id); });
  $popup.querySelector("#pp-define")?.addEventListener("click", async () => { try { await post("/api/refine", { id }); startWorking(`you asked the session to define ${id} further`); } catch (e) { showToast(e); } });
  // one node is the unit of building; while a run is under way the press shows that run instead of asking for another
  $popup.querySelector("#pp-implement")?.addEventListener("click", () => { if (isActiveRun(runData.run)) openRunCard(); else askImplement([id], { single: true }); });
  fillTests($popup);
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
    for (const sel of ["#pp-body", ".pp-pane", ".pp-tabs", ".conflict-summary", "#pp-approve", "#pp-edit", "#pp-delete", "#pp-toggle", "#pp-define", "#pp-implement", "#pp-review"]) for (const el of $popup.querySelectorAll(sel)) el.hidden = true;
    editor.querySelector("#pp-intent").focus();
    editor.querySelector("#pp-cancel").addEventListener("click", () => { editor.innerHTML = ""; editBase = null; openPopup(id); });
    editor.querySelector("#pp-save").addEventListener("click", async () => {
      const body = { intent: editor.querySelector("#pp-intent").value, title: editor.querySelector("#pp-title")?.value };
      try { await post(`/api/node/${encodeURIComponent(id)}`, body, "PUT"); closePopup(); markPending(id, "you rewrote it"); await load(); render(); startWorking(`you rewrote ${id}`); } catch (e) { showToast(e); }
    });
  };
  $popup.querySelector("#pp-edit").addEventListener("click", () => startEdit());

  if (draft) startEdit(draft);
}
function closePopup() { $popup.hidden = true; delete $popup.dataset.id; editBase = null; document.getElementById("conflict").hidden = true; window.CSS?.highlights?.delete("quote"); }
// A rewrite in progress: what the user has typed, so that no redraw can lose it.
function editingDraft() {
  if ($popup.hidden) return null;
  const ta = $popup.querySelector("#pp-editor #pp-intent");
  if (!ta) return null;
  return { id: $popup.dataset.id, title: $popup.querySelector("#pp-editor #pp-title")?.value, intent: ta.value };
}
// The text a rewrite started from. When the session rewrites that node meanwhile, the user chooses: keep
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
  chime("conflict");
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
// Three chimes: two notes for a chat line that needs you, three rising for an issue, a falling pair for a conflict.
const CHIMES = { say: [[880, 0], [1320, 0.12]], issue: [[660, 0], [990, 0.12], [1320, 0.24]], conflict: [[523, 0], [392, 0.16]] };
function chime(kind = "say") {
  // one chime per change: the focus, the redraw and the chat line about one change arrive seconds apart
  if (Date.now() - (chime.last ?? 0) < 1500) return;
  chime.last = Date.now();
  chime.count = (chime.count ?? 0) + 1;
  if (!chimeOn) return;
  try {
    const ctx = (chime.ctx ??= new (window.AudioContext || window.webkitAudioContext)());
    if (ctx.state === "suspended") ctx.resume();
    const t = ctx.currentTime;
    for (const [freq, dt] of CHIMES[kind] ?? CHIMES.say) {
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
  // the node card stands beside a card already up, the issue card or else the run card, where there is room
  const other = !$issueCard.hidden ? $issueCard : !$run.hidden ? $run : null;
  if (other && placeBeside($popup, other, w)) return;
  $popup.style.left = `${Math.max(8, area.left + (area.width - w) / 2)}px`;
  $popup.style.top = `${Math.max(60, area.top + (area.height - h) / 2)}px`;
}
// Two cards stand together: the one that opens goes to the right of the one already up, else to its left, at most `w`
// wide; false when neither side has room.
function placeBeside(card, other, w) {
  const r = other.getBoundingClientRect(), right = window.innerWidth - r.right - 20, left = r.left - 20;
  const side = right >= 320 ? "right" : left >= 320 ? "left" : null;
  if (!side) return false;
  const cw = Math.min(w, side === "right" ? right : left);
  card.style.width = `${cw}px`; card.style.left = `${side === "right" ? r.right + 12 : r.left - cw - 12}px`; card.style.top = `${r.top}px`;
  return true;
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
// card, the chip above the message node names the node and the words, and the cursor is in the node.
document.addEventListener("mouseup", (ev) => {
  const target = ev.target;
  setTimeout(() => {
    const sel = window.getSelection();
    const text = sel?.toString().trim();
    // a plain click anywhere but the panel drops a highlighted passage; the panel is where the question is typed
    const inPopup = !$popup.hidden && $popup.contains(sel?.anchorNode) && Boolean($popup.dataset.id);
    const inIssue = !$issueCard.hidden && $issueCard.contains(sel?.anchorNode);
    if (!text || (!inPopup && !inIssue)) { if (quote && !document.getElementById("session").contains(target)) setQuote(null); return; }
    if (window.CSS?.highlights && window.Highlight) CSS.highlights.set("quote", new Highlight(sel.getRangeAt(0).cloneRange()));
    // words from an issue card are about its node when it has one, else about the issue itself
    setQuote(inPopup ? { id: $popup.dataset.id, text: text.slice(0, 300) } : { id: $question.dataset.nodeId || undefined, about: `the issue "${$question.dataset.label ?? "issue"}"`, text: text.slice(0, 300) });
    openSession();
    $msg.focus();
  }, 0);
});

// The chat: what the session says and what the user sends, with the actions between them as quiet lines.
let chatCursor = 0;
// Ids named in a chat line are links; a line about a node carries the node as a chip; every line has its time.
const ID_RE = /\b(REQ-\d+(?:\.\d+)*|PRN-\d+|DEC-\d+)\b/g;
const linkIds = (text) => esc(text).replace(ID_RE, (id) => `<a class="id" data-id="${id}" href="#/node/${id}">${id}</a>`);
const timeOf = (at) => { const d = at ? new Date(at) : new Date(); return Number.isNaN(d.getTime()) ? "" : d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); };
// Two lists. The chat holds what the session asks of the user (a say marked `to: user`, or one that ends in a
// question) and what they write. The history holds the rest: what the session did, and what the user did on
// the canvas. A history line opens its node on a double-click, or the nearest node above it if it is gone.
const KIND_LABELS = { "node-approved": "approved", "node-edited": "rewritten", "node-deleted": "deleted", "node-created": "created", "term-enshrined": "term kept", "term-dropped": "term dropped", "refine-request": "asked to define", "finish-request": "finish", "edit-conflict": "conflict", "question-superseded": "question withdrawn", answer: "you answered", say: "session", "implement-request": "asked to build", "run-stop": "asked to stop", "run-continue": "asked to continue", "slice-approved": "approved", "slice-discarded": "discarded", "slice-sent-back": "sent back" };
let historyNew = 0;
// What changed between two readings of the canon, as chat lines: nodes, principles, terms and decisions that
// appeared, changed or went, each naming its id so a click goes there.
function canonDiff(was, now) {
  const at = new Date().toISOString(), out = [];
  const line = (kind, id, text) => out.push({ kind, id, text, at });
  const byId = (list) => Object.fromEntries((list ?? []).map((x) => [x.id, x]));
  const a = was.canon.nodes, b = now.canon.nodes;
  for (const id of Object.keys(b)) { if (!a[id]) line("node-created", id, `${id} appeared on disk · ${b[id].title}`); else if (was.html[id] !== now.html[id] || a[id].title !== b[id].title || a[id].state !== b[id].state) line("node-edited", id, `${id} changed on disk${a[id].state !== b[id].state ? `, now ${b[id].state}` : ""} · ${b[id].title}`); }
  for (const id of Object.keys(a)) if (!b[id]) line("node-deleted", id, `${id} gone from disk · ${a[id].title}`);
  // a refiner's set appears as one line under its parent, not one per node
  const byParent = new Map();
  for (const e of out) if (e.kind === "node-created" && b[e.id]) { const p = b[e.id].parent ?? "ROOT"; (byParent.get(p) ?? byParent.set(p, []).get(p)).push(e); }
  for (const [p, list] of byParent) if (list.length >= 3) { out.splice(out.indexOf(list[0]), 0, { kind: "node-created", id: p, text: `${list.length} nodes appeared under ${p}${b[p] ? ` · ${b[p].title}` : ""}: ${list.map((e) => e.id).join(", ")}`, at }); for (const e of list) out.splice(out.indexOf(e), 1); }
  const sets = [["principle", byId(was.canon.principles), byId(now.canon.principles), (p) => p.title, (p) => `${p.title}|${p.statement ?? p.text ?? ""}|${p.state}`], ["term", byId(was.canon.terms), byId(now.canon.terms), (t) => t.term, (t) => `${t.term}|${t.definition}|${t.state}`], ["decision", byId(was.canon.decisions), byId(now.canon.decisions), (d) => d.title, (d) => `${d.title}|${d.state ?? ""}`]];
  for (const [what, x, y, name, sig] of sets) {
    for (const id of Object.keys(y)) { if (!x[id]) line("node-created", id, `${what} ${id} added on disk · ${name(y[id])}`); else if (sig(x[id]) !== sig(y[id])) line("node-edited", id, `${what} ${id} changed on disk · ${name(y[id])}`); }
    for (const id of Object.keys(x)) if (!y[id]) line("node-deleted", id, `${what} ${id} dropped on disk · ${name(x[id])}`);
  }
  if (!out.length && was.html.ROOT !== now.html.ROOT) line("node-edited", "ROOT", "the premise changed on disk");
  return out;
}
// A say keeps its shape in the chat: blank lines part paragraphs, lines that start with a dash become a list, a
// line break stays a line break; ids are linked as everywhere else. The briefing reads as it was written.
function chatHtml(text) {
  const blocks = String(text ?? "").replace(/\r/g, "").split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  return blocks.map((b) => {
    const lines = b.split("\n");
    if (lines.every((l) => /^\s*[-*•]\s+/.test(l))) return `<ul>${lines.map((l) => `<li>${linkIds(l.replace(/^\s*[-*•]\s+/, ""))}</li>`).join("")}</ul>`;
    return `<p>${lines.map((l) => linkIds(l)).join("<br>")}</p>`;
  }).join("");
}
// ---------------------------------------------------------------- onboarding: one card, six stages (docs/tone.md)
// The card over the canvas carries the whole onboarding: welcome, the way of working, the reading, the premise, the
// principles, the first domains. Its words live here, never in the session. The stage follows the canon and the
// settings on every poll, so a refresh lands where the reader was; only "welcome seen" is remembered per tab.
const $onboard = document.getElementById("onboard");
let lastStatus = null;
let onboardStage = null, onboardDismissed = false, onboardBusy = false;
const intentWords = () => { const m = /##\s*Intent[^\n]*\n+([\s\S]*?)(?=\n##\s|$)/i.exec(snap?.canon?.root?.body ?? ""); return m ? m[1].trim().split(/\s+/).filter(Boolean).length : 0; };
const premiseDrafted = () => Boolean(snap?.canon?.root) && (intentWords() >= 12 || (snap.canon.principles?.length ?? 0) > 0);
const premiseApproved = () => ["stated", "resolved"].includes(snap?.canon?.root?.state);
const principleSettled = (p) => p.state === "stated" || p.state === "resolved";
// "welcome seen" belongs to a run, not a tab: the session's opening signal carries a time, and that time is what is remembered
let introAt = null;
const welcomeSeen = () => { try { const v = sessionStorage.getItem("hc-welcome"); return Boolean(v) && (introAt ? v === introAt : v === "1"); } catch { return false; } };
function onboardStageNow() {
  if (!snap || route().view !== "adopt") return null;
  const chosen = Boolean(lastStatus?.settings?.at);
  if (!premiseDrafted()) return chosen ? "reading" : welcomeSeen() ? "mode" : "welcome";
  if (!premiseApproved()) return "premise";
  const prns = snap.canon.principles ?? [];
  if (prns.length && !prns.every(principleSettled)) return "principles";
  if (!snap.canon.roots.length) return "drafting";
  return null;
}
const OB = {
  welcome: { label: "Welcome", sub: "", bar: true },
  mode: { label: "How you want to work", sub: "", bar: true },
  reading: { label: "Reading", sub: "the repository", bar: true },
  premise: { label: "The premise", sub: "what this project is for", bar: false },
  principles: { label: "The principles", sub: "what every requirement is judged against", bar: false },
  drafting: { label: "Drafting", sub: "the domains", bar: false },
};
// Every poll: the stage the canon is at. A new stage draws the card, dismissed or not; the same stage leaves it alone.
function syncOnboard() {
  const stage = onboardStageNow();
  // before the domains the card's bar is the progress; the strip at the top returns with the domains
  document.body.classList.toggle("onboarding", Boolean(stage) && !(snap?.canon?.roots?.length));
  if (stage !== onboardStage) { const was = onboardStage; onboardStage = stage; onboardDismissed = false; if (stage) renderOnboard(stage, Boolean(was)); else hideOnboard(Boolean(was)); }
  if (stage === "welcome" || stage === "mode" || stage === "reading") updateOnboardBar();
}
function hideOnboard(animated) {
  if ($onboard.hidden) return;
  if (!animated) { $onboard.hidden = true; return; }
  $onboard.classList.add("leaving"); setTimeout(() => { $onboard.hidden = true; $onboard.classList.remove("leaving"); }, 260);
}
function renderOnboard(stage, animated) {
  const meta = OB[stage];
  const body = document.getElementById("ob-body");
  const draw = () => {
    // a redraw of the same stage keeps the reader's place: the list and the card scroll back to where they were
    const list = body.querySelector(".ob-prn"); const keepList = list ? list.scrollTop : 0, keepCard = $onboard.scrollTop;
    document.getElementById("ob-label").textContent = meta.label;
    document.getElementById("ob-sub").textContent = meta.sub;
    document.getElementById("ob-bar").classList.toggle("gone", !meta.bar);
    document.getElementById("ob-line").classList.toggle("gone", !meta.bar);
    body.innerHTML = onboardHtml(stage);
    wireOnboard(stage);
    body.classList.remove("swap");
    if (meta.bar) updateOnboardBar();
    if (!animated || stage === onboardStage) { const nl = body.querySelector(".ob-prn"); if (nl) nl.scrollTop = keepList; $onboard.scrollTop = keepCard; }
  };
  if (onboardDismissed) { draw(); return; }
  if ($onboard.hidden || !animated) { $onboard.hidden = false; draw(); return; }
  body.classList.add("swap"); setTimeout(draw, 180);
}
function onboardHtml(stage) {
  if (stage === "welcome") return `
    <p>HeadCanon writes down what your project is for, as a tree of nodes you can read and correct. The session reads that tree before every piece of work, so the work stays true to it.</p>
    <p>It is reading your repository now: the code, the documents, the content. Nothing is decided from that reading. It is evidence.</p>
    <p>You will be asked three things, in order: the premise, the principles, then the issues the evidence could not settle. You will not be asked what the code or the documents already answer.</p>
    <div class="actions"><button class="btn primary" id="ob-begin">Begin</button></div>`;
  if (stage === "mode") return `
    <p>Two ways to work. Either can be changed later from the chat.</p>
    <div class="modes-pick">
      <button class="btn" data-pick-mode="guided"><b>Guided</b><span>One level at a time. Each level waits for your approval before the next. Slower and cheaper, about an hour of your time.</span></button>
      <button class="btn primary" data-pick-mode="full-auto"><b>Full-Auto</b><span>Everything is drafted down to testable leaves, then you review. About fifteen minutes of your time; the draft may carry guesses you have not seen.</span></button>
    </div>
    <label class="muted">A cap, if you want one: agents at once, or a budget in your plan's terms <input id="ob-cap" type="text" placeholder="none"></label>`;
  if (stage === "reading") return `
    <p><span class="spin"></span>The reading goes on. The premise is drafted from it when it is done, and nothing else runs until you approve the premise.</p>
    <p class="muted">${esc(lastStatus?.settings?.mode === "guided" ? "Guided" : "Full-Auto")} it is. You can leave this page; the card is here when you come back.</p>`;
  if (stage === "premise") {
    // the premise as the reader judges it: Intent and Not this; the folder's own preamble, the principles, the glossary
    // and any approval note stay out of the card
    let html = ["Principles", "Glossary", "Resolution"].reduce((h, s) => stripHtmlSection(h, s), snap.html["ROOT"] ?? "");
    if (html.includes("<h2>")) html = html.slice(html.indexOf("<h2>"));
    return `
    <p>Drafted from the evidence: what the project is, for whom, and what it is not. Approve it as written, or say it in your words.</p>
    <div class="body" id="ob-premise">${html || "<p class='muted'>No text yet.</p>"}</div>
    <div id="ob-edit" hidden></div>
    <div class="actions" id="ob-premise-actions"><button class="btn primary" id="ob-approve">Approve</button><button class="btn" id="ob-rewrite">Rewrite</button><span class="muted">Select words to ask about them in the chat.</span></div>`;
  }
  if (stage === "principles") {
    const prns = snap.canon.principles ?? []; const settled = prns.filter(principleSettled).length;
    return `
    <p>Every later requirement is judged against these. Approve, rewrite or remove each one. The session starts when all are settled.</p>
    <ul class="ob-prn">${prns.map((p) => `<li class="${principleSettled(p) ? "settled" : ""}" data-prn="${esc(p.id)}"><i class="sw ${principleSettled(p) ? "green" : "yellow"}"></i><div><b>${esc(p.title)}</b><span class="st">${esc(p.statement)}</span><div class="ob-prn-edit" hidden></div></div><div class="row">${principleSettled(p) ? `<span class="muted">approved</span>` : `<button class="btn small primary" data-prn-ok="${esc(p.id)}">Approve</button>`}<button class="btn small" data-prn-edit="${esc(p.id)}">Rewrite</button><button class="btn small" data-prn-del="${esc(p.id)}">Remove</button></div></li>`).join("")}</ul>
    <div class="ob-foot">${settled < prns.length ? `<button class="btn" id="ob-approve-rest">Approve the rest</button>` : ""}<span class="muted">${settled} of ${prns.length} settled</span></div>`;
  }
  if (stage === "drafting") return `
    <p><span class="spin"></span>The session splits the premise into domains and places the evidence under each. They appear on the canvas as they land, and what needs you appears under Issues.</p>`;
  return "";
}
// An action on the card: run it, re-read the canon, draw whatever stage follows.
async function obAct(fn) {
  if (onboardBusy) return; onboardBusy = true;
  try {
    await fn(); await load();
    const st = onboardStageNow();
    if (st !== onboardStage) { onboardStage = st; onboardDismissed = false; if (st) renderOnboard(st, true); else hideOnboard(true); } else if (st) renderOnboard(st, false);
    refreshAdopt();
  } catch (e) { showToast(e); } finally { onboardBusy = false; }
}
function wireOnboard(stage) {
  const body = document.getElementById("ob-body");
  body.querySelector("#ob-begin")?.addEventListener("click", () => { try { sessionStorage.setItem("hc-welcome", introAt ?? "1"); } catch { /* fine */ } onboardStage = "mode"; renderOnboard("mode", true); });
  for (const b of body.querySelectorAll("[data-pick-mode]")) b.addEventListener("click", () => obAct(async () => { const cap = body.querySelector("#ob-cap")?.value?.trim(); await post("/api/settings", { mode: b.dataset.pickMode, cap: cap || null }); lastStatus = { ...(lastStatus ?? {}), settings: { mode: b.dataset.pickMode, at: new Date().toISOString() } }; }));
  body.querySelector("#ob-approve")?.addEventListener("click", () => obAct(async () => { await post("/api/node/ROOT/approve", {}); touched("ROOT"); startWorking("you approved the premise"); }));
  body.querySelector("#ob-rewrite")?.addEventListener("click", async () => {
    const holder = body.querySelector("#ob-edit"); const raw = await fetch("/api/node/ROOT/raw").then((r) => r.json()).catch(() => ({ text: "" }));
    const intent = (/^##\s+Intent\b[^\n]*\n([\s\S]*?)(?=^##\s|(?![\s\S]))/m.exec(raw.text ?? "")?.[1] ?? "").trim();
    holder.innerHTML = `<p class="muted">Your words replace the draft and are recorded as yours.</p><textarea id="ob-intent">${esc(intent)}</textarea><div class="actions"><button class="btn primary" id="ob-save">Save</button><button class="btn" id="ob-cancel">Cancel</button></div>`;
    holder.hidden = false; body.querySelector("#ob-premise").hidden = true; body.querySelector("#ob-premise-actions").hidden = true; holder.querySelector("#ob-intent").focus();
    holder.querySelector("#ob-cancel").addEventListener("click", () => renderOnboard("premise", false));
    holder.querySelector("#ob-save").addEventListener("click", () => obAct(async () => { await post("/api/node/ROOT", { intent: holder.querySelector("#ob-intent").value }, "PUT"); touched("ROOT"); startWorking("you rewrote the premise"); }));
  });
  for (const b of body.querySelectorAll("[data-prn-ok]")) b.addEventListener("click", () => obAct(() => post(`/api/node/${encodeURIComponent(b.dataset.prnOk)}/approve`, {})));
  for (const b of body.querySelectorAll("[data-prn-del]")) b.addEventListener("click", () => { if (!confirm("Remove this principle? The session will not judge anything against it.")) return; obAct(() => fetch(`/api/node/${encodeURIComponent(b.dataset.prnDel)}`, { method: "DELETE" })); });
  for (const b of body.querySelectorAll("[data-prn-edit]")) b.addEventListener("click", () => {
    const li = b.closest("li"); const p = snap.canon.principles.find((x) => x.id === b.dataset.prnEdit); const holder = li.querySelector(".ob-prn-edit");
    holder.innerHTML = `<input id="ob-prn-title" value="${esc(p.title)}" /><textarea id="ob-prn-text">${esc(p.statement)}</textarea><div class="actions"><button class="btn small primary" id="ob-prn-save">Save</button><button class="btn small" id="ob-prn-cancel">Cancel</button></div>`;
    holder.hidden = false; li.querySelector(".st").hidden = true; holder.querySelector("#ob-prn-text").focus();
    holder.querySelector("#ob-prn-cancel").addEventListener("click", () => renderOnboard("principles", false));
    holder.querySelector("#ob-prn-save").addEventListener("click", () => obAct(() => post(`/api/node/${encodeURIComponent(p.id)}`, { title: holder.querySelector("#ob-prn-title").value, intent: holder.querySelector("#ob-prn-text").value }, "PUT")));
  });
  body.querySelector("#ob-approve-rest")?.addEventListener("click", () => obAct(() => post("/api/principles/approve", {})));
}
// The measured bar: what the readers wrote to disk, functions described and document files with a claim, each part
// weighing the same; motion without a number until the server has counted anything.
function updateOnboardBar() {
  const bar = document.getElementById("ob-bar"), line = document.getElementById("ob-line");
  const r = lastStatus?.reading; const parts = [r?.code, r?.documents].filter((x) => x && x.total > 0);
  if (!parts.length) { bar.classList.add("indeterminate"); bar.classList.remove("done"); line.textContent = lastStatus && !lastStatus.listening ? "No session is attached to this page yet. Start one with /headcanon:adopt in the terminal." : "Reading the repository."; return; }
  const frac = parts.reduce((a, x) => a + Math.min(1, x.done / x.total), 0) / parts.length;
  bar.classList.remove("indeterminate"); bar.classList.toggle("done", frac >= 0.999); bar.firstElementChild.style.width = `${Math.max(4, Math.round(frac * 100))}%`;
  line.textContent = (frac >= 0.999 ? "Reading done. " : "") + parts.map((x) => `${x === r.code ? "code" : "documents"}: ${x.done} of ${x.total} ${x === r.code ? "functions" : "files"}`).join(" · ");
}
document.getElementById("ob-close").addEventListener("click", () => { onboardDismissed = true; hideOnboard(true); });
// the session's status line brings a put-away card back
document.getElementById("session-status").addEventListener("click", () => { if (onboardStage && onboardDismissed) { onboardDismissed = false; renderOnboard(onboardStage, false); } });

// ---------------------------------------------------------------- the code beside the canon: marks, tests, the run, the final decision
// Two marks stand beside the colours: a grey fill on a node that is not built, a red dashed ring around one that is out
// of sync with the code. The viewer measures them; the page asks at load and when their revision changes on the poll,
// and swaps classes where the nodes are, so a mark never redraws the canvas. A viewer that does not answer, here or on
// any route below, means "nothing yet": the page stays as it is without them.
let marksData = null, lastMarksRev = null;
const markOf = (id) => marksData?.marks?.[id];
const markClass = (id) => { const m = markOf(id)?.mark; return m === "not-built" || m === "out-of-sync" ? m : ""; };
// The snapshot carries the same marks; they stand in, counted the way the viewer counts, when the marks route is silent.
function marksFromSnapshot() {
  if (!snap?.marks) return null;
  const counts = { notBuilt: 0, outOfSync: 0, tested: 0, measurable: 0 };
  for (const n of Object.values(snap.canon.nodes)) {
    if (!n.kind || n.state === "draft") continue;
    counts.measurable++;
    const m = snap.marks[n.id];
    if (!m) continue;
    if (m.mark === "not-built") counts.notBuilt++;
    if (m.mark === "out-of-sync") counts.outOfSync++;
    if (m.tests > 0) counts.tested++;
  }
  return { rev: "", marks: snap.marks, counts };
}
async function fetchMarks() {
  let got = null;
  try { const r = await fetch("/api/marks", { cache: "no-store" }); if (r.ok) got = await r.json(); } catch { /* nothing yet */ }
  if (!got?.marks) got = marksFromSnapshot() ?? marksData;
  testsCache.clear();
  if (!got) return;
  marksData = got;
  paintMarks();
}
// Every place a mark shows takes it where it stands: the canvas nodes and their row cards, the Tree tab, the legend,
// the journeys' tests, the open card and the run card.
function paintMarks() {
  if (!snap) return;
  const view = route().view, c = window.__cy;
  const swap = (set, m) => { set("not-built", m === "not-built"); set("out-of-sync", m === "out-of-sync"); };
  if (c && $main.querySelector("#cy")) c.batch(() => { for (const n of c.nodes()) swap((k, on) => n.toggleClass(k, on), markClass(n.id())); });
  if (view === "adopt") { adoptState.syncRowCards?.(); const lg = $main.querySelector(".adopt-bar .legend"); if (lg) lg.outerHTML = adoptLegend(); }
  for (const row of $main.querySelectorAll(".tree .node[data-id]")) swap((k, on) => row.classList.toggle(k, on), markClass(row.dataset.id));
  const nd = $main.querySelector("#nd-built"); if (nd) { const words = builtWords(route().arg); nd.textContent = words; nd.hidden = !words; }
  for (const t of $main.querySelectorAll("table.journey-steps")) t.classList.toggle("tested", Boolean(marksData));
  if (view === "journeys" || view === "journey") fillJourneyTests();
  syncPopupMarks();
  if (!$run.hidden) fillTests($runBody);
  renderRunCard();
}
// What a node's mark says in words. A node without a check of its own speaks for what is under it.
function builtWords(id) {
  const m = markOf(id), n = snap?.canon.nodes[id];
  if (!m || !n) return "";
  if (m.mark === "not-built") return n.kind ? "Not built yet" : "Nothing under it is built yet";
  if (m.mark === "out-of-sync") return n.kind ? "Out of sync with the code" : "A node under it is out of sync with the code";
  if (!n.kind) return "";
  if (m.tested === "passing") return "Built and passing";
  if (m.tested === "failing") return "Its tests fail";
  if (m.tested === "stale") return "Its tests were written for an earlier text";
  return m.built === "built" ? "Built, not tested yet" : "Not measured";
}
const builtLine = (id) => { const m = markClass(id); return `${m === "not-built" ? `<i class="sw grey"></i>` : m === "out-of-sync" ? `<i class="sw ring"></i>` : ""}${esc(builtWords(id))}`; };
const testsLabel = (m) => `Tests${m?.tests ? ` (${m.tests})` : ""}`;
// "Implement this" stands on a node with a check that is not built or out of sync, never on a red one, and not while
// what was built for it waits for a decision.
const canImplement = (id) => Boolean(node(id)?.kind && markClass(id) && colorOf(id) !== "red") && !reviewSlices().some((s) => s.node === id);
// The open card follows the marks in place: its line of words, the count on its Tests tab, the button, the tests.
function syncPopupMarks() {
  const id = $popup.dataset.id, line = $popup.querySelector("#pp-built");
  if ($popup.hidden || !id || !line) return;
  const words = builtWords(id);
  if (line.dataset.words !== words) { line.dataset.words = words; line.innerHTML = builtLine(id); line.hidden = !words; }
  const tab = $popup.querySelector('[data-pane-key="tests"]'); if (tab) tab.textContent = testsLabel(markOf(id));
  if (editingDraft()) return;
  const b = $popup.querySelector("#pp-implement"); if (b) b.hidden = !canImplement(id);
  fillTests($popup);
}
// The state of a journey or a step in the canvas's words: approved, guessed, or needing you.
function certainty(state) {
  const [colour, word] = state === "stated" || state === "resolved" ? ["green", "approved"] : state === "draft" || state === "contested" ? ["red", "needs you"] : ["yellow", "guessed"];
  return `<span class="certainty"><i class="sw ${colour}"></i>${word}</span>`;
}

// The tests of a node, as a user who does not read code needs them: what is checked and how, the kind, the last
// result in words, where the file is, and the journey an end-to-end test plays. Kept per node until the marks or the
// run change, since both mean the results may have.
const testsCache = new Map();
function fetchTests(id) {
  if (!testsCache.has(id)) testsCache.set(id, fetch(`/api/tests?id=${encodeURIComponent(id)}`, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((j) => (Array.isArray(j?.tests) ? j.tests : [])).catch(() => []));
  return testsCache.get(id);
}
const KIND_WORDS = { unit: "unit", integration: "integration", e2e: "end to end", eval: "eval", other: "other" };
const OUTCOME_WORDS = { passed: "passed", failed: "failed", errored: "stopped on an error", skipped: "skipped", missing: "its file is gone", changed: "its file changed after it was accepted", stale: "written for an earlier text of the node", "not-run": "not run yet" };
const testOutcome = (t) => (t.status === "proposed" ? "waiting for its review" : t.status === "rejected" ? "rejected in review" : OUTCOME_WORDS[t.outcome] ?? "not run yet");
const testTone = (t) => (t.status !== "accepted" ? "" : t.outcome === "passed" ? "ok" : ["failed", "errored", "missing", "changed"].includes(t.outcome) ? "bad" : "");
// A page served over http cannot open a local file, so the link carries the file's address and a click copies its full path.
function fileLink(file) {
  if (!file) return "";
  const root = snap?.git?.repoRoot;
  const full = root ? `${root.replace(/[\\/]+$/, "")}/${file}` : file;
  const href = root ? `file:///${encodeURI(full.replace(/\\/g, "/").replace(/^\/+/, ""))}` : "#";
  return `<a class="mono test-file" href="${esc(href)}" data-path="${esc(full)}" title="Copy the full path of this test file">${esc(file)}</a>`;
}
function testsHtml(tests, withJourney = true) {
  if (!tests.length) return `<p class="muted">No test is recorded for this node yet.</p>`;
  return `<ul class="tests">${tests.map((t) => {
    const jid = withJourney && t.journey ? String(t.journey).split("/")[0] : "";
    const plays = jid ? `<span>plays <a class="id" href="#/journey/${esc(jid)}" title="${esc(snap.canon.journeys.find((j) => j.id === jid)?.title ?? "")}">${esc(t.journey)}</a></span>` : "";
    return `<li class="test ${testTone(t)}"><span>${esc(t.description)}</span><span class="test-meta"><span class="badge kind">${esc(KIND_WORDS[t.kind] ?? t.kind)}</span><span class="outcome">${esc(testOutcome(t))}</span>${fileLink(t.file)}${plays}</span>${t.message && testTone(t) === "bad" ? `<span class="test-msg">${esc(String(t.message).slice(0, 600))}</span>` : ""}${t.review && t.status === "rejected" ? `<span class="sub">Why the review rejected it: ${esc(t.review)}</span>` : ""}</li>`;
  }).join("")}</ul>`;
}
// Every place that waits for a node's tests gets them; an answer that changed nothing leaves the list as it is.
function fillTests(where) {
  for (const el of where.querySelectorAll("[data-tests-for]")) fetchTests(el.dataset.testsFor).then((tests) => {
    const key = JSON.stringify(tests);
    if (!el.isConnected || el.dataset.key === key) return;
    el.dataset.key = key;
    el.innerHTML = testsHtml(tests);
  });
}
async function copyText(text) { try { await navigator.clipboard.writeText(text); return true; } catch { return false; } }
// A press that got no answer (the request failed, or the viewer answered a bare status) names the viewer and the way
// out; a refusal is the viewer's own sentence.
const noAnswer = (e) => e instanceof TypeError || /^\d{3}$/.test(String(e?.message ?? e));
const sayWhy = (what, e) => (noAnswer(e) ? `${what}: the viewer gave no answer. Check that it still runs, then press again.` : String(e?.message ?? e));

// The run: Implement/align on a scope, or "Implement this" on one node. The page reads it from the viewer when its
// revision changes on the poll; the card over the canvas says what a run would do, then how it stands.
let runData = { run: null, listening: false }, lastRunRev = null, runSeen = false, listenedAt = 0;
const isActiveRun = (r) => Boolean(r) && r.status !== "done" && r.status !== "stopped";
const reviewSlices = () => (runData.run?.slices ?? []).filter((s) => s.status === "review");
// A waiting session listens in long requests with a breath between them, so "listening" holds for a while after it
// was last seen: a press in that breath still reaches the session through the feed.
const LISTEN_GRACE = 30 * 1000;
const sessionListening = () => Boolean(lastStatus ? lastStatus.listening : runData.listening) || Date.now() - listenedAt < LISTEN_GRACE;
const RUN_WORDS = { running: "running", waiting: "waits on you", review: "your decision", done: "done", stopped: "stopped" };
function implementLabel() {
  const r = runData.run, n = reviewSlices().length;
  return `Implement/align${isActiveRun(r) ? ` <span class="run-tag">· ${esc(RUN_WORDS[r.status] ?? r.status)}</span>` : ""}${n ? ` <span class="pill" title="Nodes built and waiting for your decision">${n}</span>` : ""}`;
}
async function fetchRun() {
  let got = null;
  try { const r = await fetch("/api/run", { cache: "no-store" }); if (r.ok) got = await r.json(); } catch { /* nothing yet */ }
  if (!got) return;
  const was = runData.run;
  runData = { run: got.run ?? null, listening: Boolean(got.listening) };
  if (runData.listening) listenedAt = Date.now();
  testsCache.clear();
  if (runSeen) noteRun(was, runData.run);
  runSeen = true;
  const b = document.getElementById("implement-btn"); if (b) b.innerHTML = implementLabel();
  renderRunCard();
  syncPopupReview();
  syncPopupMarks();
}
// The run chimes at two moments only: when it starts to wait on the user, and when it ends. A run the viewer no
// longer returns has ended and been decided.
function noteRun(was, now) {
  const waits = (r) => r.status === "waiting" || r.status === "review";
  if (!now) { if (isActiveRun(was)) chime(); return; }
  const same = Boolean(was) && was.id === now.id;
  if (waits(now) && !(same && was.status === now.status)) chime("issue");
  else if (!isActiveRun(now) && !(same && !isActiveRun(was))) chime();
}
// On every poll: the marks and the run are asked for again only when their revision changed. The marks' revision
// moves with every write to the canon, so while a session writes without pause they are asked for at the pace of the
// canon's own reloads. A viewer that names no revision for the run still names the run in its status.
let marksTimer = 0, marksAskedAt = 0;
function marksSoon() {
  if (marksTimer) return;
  marksTimer = setTimeout(() => { marksTimer = 0; marksAskedAt = Date.now(); fetchMarks(); }, Math.max(0, marksAskedAt + RELOAD_GAP - Date.now()));
}
function syncBuild(s) {
  if (lastStatus?.listening) listenedAt = Date.now();
  if (s.marksRev !== undefined && s.marksRev !== lastMarksRev) { const first = lastMarksRev === null; lastMarksRev = s.marksRev; if (!first || !marksData) marksSoon(); }
  const runRev = s.runRev ?? (lastStatus && "run" in lastStatus ? JSON.stringify(lastStatus.run) : undefined);
  if (runRev !== undefined && runRev !== lastRunRev) { const first = lastRunRev === null; lastRunRev = runRev; if (!first || !runSeen) fetchRun(); }
  renderRunCard();
}

const $run = document.getElementById("run"), $runBody = document.getElementById("run-body");
let runAsked = null, runCardHtml = "";
dragByHead($run);
document.getElementById("run-close").addEventListener("click", closeRunCard);
function closeRunCard() { $run.hidden = true; runAsked = null; runCardHtml = ""; $runBody.innerHTML = ""; }
function openRunCard() {
  const wasHidden = $run.hidden;
  $run.hidden = false;
  if (!$run.dataset.placed) {
    // between the panels at the canvas's top left and the menu at its top right, so the Issues stay in reach
    const area = $main.querySelector(".adopt #cy")?.getBoundingClientRect() ?? $main.getBoundingClientRect();
    const left = ($main.querySelector(".left-stack")?.getBoundingClientRect().right ?? area.left) + 12;
    const limit = ($main.querySelector(".cy-full > .menu")?.getBoundingClientRect().left ?? area.right) - 12;
    $run.style.width = `${Math.min(520, Math.max(320, limit - left))}px`; $run.style.left = `${Math.max(8, left)}px`; $run.style.top = `${Math.max(60, area.top + 10)}px`;
    $run.dataset.placed = "1";
  }
  renderRunCard();
  // a card that would open over the node's card goes beside it instead
  const over = (a, b) => { const x = a.getBoundingClientRect(), y = b.getBoundingClientRect(); return x.left < y.right && y.left < x.right && x.top < y.bottom && y.top < x.bottom; };
  if (wasHidden && !$popup.hidden && over($run, $popup)) placeBeside($run, $popup, $run.offsetWidth);
  fetchRun();
}
// The scope of a press: the selected node and what is under it; with nothing selected, every node.
function runScope() {
  const sel = adoptState.selected && node(adoptState.selected) ? adoptState.selected : null;
  return { sel, ids: sel ? [sel, ...descendants(sel)] : Object.keys(snap.canon.nodes), send: sel ? [sel] : [...snap.canon.roots] };
}
// What a run over these nodes would do, from the marks as measured: a red node is left out, a node with a check and no
// test gets one, a marked node is built or aligned.
function scopeCounts(ids) {
  const c = { test: 0, build: 0, align: 0, needYou: 0 };
  for (const id of ids) {
    const n = node(id);
    if (!n) continue;
    if (n.state === "draft" || n.state === "contested") { c.needYou++; continue; }
    if (!n.kind) continue;
    const m = markOf(id);
    if (!m?.tests) c.test++;
    if (m?.mark === "not-built") c.build++;
    if (m?.mark === "out-of-sync") c.align++;
  }
  return c;
}
const terminalHtml = (ids) => { const line = `/headcanon:implement ${ids.join(" ")}`; return `<p>No session is listening to this page. Type this in the terminal:</p><p class="run-cmd"><code>${esc(line)}</code><button class="btn small" data-copy="${esc(line)}">Copy</button></p>`; };
function runBeforeHtml() {
  const { sel, ids, send } = runScope(), c = scopeCounts(ids), todo = c.test + c.build + c.align;
  const tile = (n, label) => `<li><b>${n}</b><span>${label}</span></li>`;
  const scope = sel ? `<span class="id">${esc(sel)}</span> ${esc(node(sel).title)} and what is under it.` : "every node. Select a node on the canvas to narrow it.";
  const next = !todo ? `Nothing in scope needs a test, a build or an alignment.${c.needYou ? " What needs you is under Issues." : ""}`
    : marksData ? "The tests come first, then the build. You decide on each result before it is kept."
    : "What is built is not measured yet. The first run of the tests measures it.";
  return `<p>In scope: ${scope}</p>
    <ul class="run-counts">${tile(c.test, "to test")}${marksData ? tile(c.build, "to build") + tile(c.align, "to align") : ""}${tile(c.needYou, "left out, they need you")}</ul>
    <p class="muted">${next}</p>
    ${!todo ? "" : sessionListening() ? `<div class="row"><button class="btn primary" data-run="start">Start</button></div>` : terminalHtml(send)}`;
}
function runAskedHtml(a) {
  if (!a.listening) return terminalHtml(a.ids);
  const what = a.single ? `build ${a.ids[0]} alone` : a.all ? "work on every node" : `work on ${a.ids.join(", ")} and what is under it`;
  return `<p><span class="spin"></span>The session was asked to ${esc(what)}. The steps appear here when the run starts.</p>`;
}
const RUN_SAYS = { running: "The run is under way.", waiting: "The run waits on you. What holds it is marked below; settle it, then continue.", review: "The run waits for your decision on what was built.", done: "The run is done.", stopped: "The run was stopped." };
const STEP_WORDS = { prepare: "Prepare the build branch", readiness: "Check that the nodes can be built from their text", tests: "Write the tests and review them", "first-run": "Run the tests once", build: "Build, one node at a time", review: "Your decision" };
const STEP_STATE = { waiting: ["·", "to come"], running: [`<span class="spin"></span>`, "running"], done: ["✓", "done"], blocked: ["!", "waits on you"] };
const SLICE_WORDS = { queued: "queued", building: "being built", passed: "passing", blocked: "waiting for your answer", review: "waiting for your decision", approved: "approved", discarded: "discarded", "sent-back": "sent back", stopped: "stopped" };
function runStepsHtml(run) {
  return `<ol class="run-steps">${(run.steps ?? []).map((s) => { const [sign, word] = STEP_STATE[s.status] ?? ["·", s.status]; return `<li class="s-${esc(s.status)}"><span class="step-mark">${sign}</span><span><b>${esc(STEP_WORDS[s.name] ?? s.name)}</b>${s.note ? ` <span class="muted">· ${esc(s.note)}</span>` : ""}</span><span class="step-state">${esc(word)}</span></li>`; }).join("")}</ol>`;
}
// The nodes of a run, those waiting for a decision first, each with its state; one in review opens into the decision.
function runSlicesHtml(run) {
  const slices = [...(run.slices ?? [])].sort((a, b) => (a.status === "review" ? 0 : 1) - (b.status === "review" ? 0 : 1));
  if (!slices.length) return `<p class="muted">No node is in this run yet.</p>`;
  const tally = {}; for (const s of slices) tally[s.status] = (tally[s.status] ?? 0) + 1;
  const sum = Object.keys(SLICE_WORDS).filter((k) => tally[k]).map((k) => `${tally[k]} ${SLICE_WORDS[k]}`).join(" · ");
  const more = (s) => { const bits = []; if (s.status === "blocked" && s.issues?.length) bits.push(`${s.issues.length} issue${s.issues.length === 1 ? "" : "s"} under Issues`); if (s.note) bits.push(s.status === "sent-back" ? `Your note: ${s.note}` : s.note); else if (s.summary) bits.push(s.summary); return bits.length ? `<p class="sub">${esc(bits.join(" · "))}</p>` : ""; };
  return `<p class="sub">${esc(sum)}</p><ul class="run-slices">${slices.map((s) => `<li class="slice s-${esc(s.status)}"><div class="slice-head"><button class="btn small crumb" data-run-node="${esc(s.node)}" title="Show this node on the canvas and open its card">${esc(s.node)}</button><span class="t" title="${esc(s.title ?? "")}">${esc(s.title ?? "")}</span><span class="slice-state">${s.status === "building" ? `<span class="spin"></span>` : ""}${esc(SLICE_WORDS[s.status] ?? s.status)}</span></div>${s.status === "review" ? reviewHtml(s) : more(s)}</li>`).join("")}</ul>`;
}
const approveAllHtml = () => (reviewSlices().length > 1 ? `<button class="btn" data-run="approve-all" title="Approve every node that waits for your decision">Approve all</button>` : "");
function runDuringHtml(run) {
  return `<p>${esc(RUN_SAYS[run.status] ?? "")}${run.startedAt ? ` <span class="muted">Started ${esc(timeOf(run.startedAt))}.</span>` : ""}</p>
    ${runStepsHtml(run)}${runSlicesHtml(run)}
    <div class="row">${run.status === "waiting" ? `<button class="btn primary" data-run="continue">Continue</button>` : ""}${run.status === "running" || run.status === "waiting" ? `<button class="btn" data-run="stop" title="The run stops after the node being built now">Stop</button>` : ""}${approveAllHtml()}</div>`;
}
// A run that ended while nodes of it still wait for a decision: they stay in reach under what a new run would do.
const runLastHtml = (run) => (run ? `<details class="run-last" open><summary>The last run, ${esc(RUN_WORDS[run.status] ?? run.status)}</summary>${runSlicesHtml(run)}<div class="row">${approveAllHtml()}</div></details>` : "");
// The card says one of three things: what a run would do, that the session was asked, or how the run stands. It is
// redrawn only when its words change, and never under a note being typed.
function renderRunCard() {
  if ($run.hidden || !snap) return;
  const run = runData.run, active = isActiveRun(run);
  if (active) runAsked = null;
  const html = active ? runDuringHtml(run) : runAsked ? runAskedHtml(runAsked) : runBeforeHtml() + runLastHtml(run);
  document.getElementById("run-sub").textContent = active && run.branch ? `on the branch ${run.branch}` : "";
  if (html === runCardHtml || [...$runBody.querySelectorAll(".review-note textarea")].some((t) => t.value.trim())) return;
  const keep = $runBody.querySelector(".run-slices")?.scrollTop ?? 0;
  runCardHtml = html;
  $runBody.innerHTML = html;
  const list = $runBody.querySelector(".run-slices"); if (list) list.scrollTop = keep;
  fillTests($runBody);
}
// A press reaches the listening session through the feed. With none listening, or no answer, the card gives the line
// to type instead; a refusal is said as the viewer said it.
async function askImplement(ids, { single = false, all = false } = {}) {
  let listening = false;
  try { const r = await post("/api/implement", single ? { ids, single: true } : { ids }); if (r.ok === false) throw new Error(r.error || "the viewer refused"); listening = Boolean(r.listening) || sessionListening(); }
  catch (e) { if (!noAnswer(e)) { showToast(e); return; } }
  runAsked = { ids, single, all, listening };
  runCardHtml = "";
  openRunCard();
}
async function runPress(b) {
  const act = b.dataset.run;
  b.disabled = true;
  if (act === "start") { const { sel, send } = runScope(); await askImplement(send, { all: !sel }); }
  else if (act === "approve-all") await approveAll();
  else {
    try { const r = await post(`/api/run/${act}`, {}); if (r.ok === false) throw new Error(r.error || "the viewer refused"); showToast(act === "stop" ? "The run stops after the node being built now." : "The run goes on."); }
    catch (e) { showToast(sayWhy(act === "stop" ? "The run did not hear Stop" : "The run did not hear Continue", e)); }
    await fetchRun();
  }
  if (b.isConnected) b.disabled = false;
}

// The final decision. A node built and waiting shows what was built in plain words, its tests with their results, its
// commits, and three ways to decide; the same block stands on the node's card and in the run card.
function reviewHtml(s) {
  const commits = (s.commits ?? []).map((c) => `<code title="${esc(c)}">${esc(/^[0-9a-f]{11,40}$/i.test(c) ? c.slice(0, 10) : c)}</code>`).join(" ");
  return `<div class="review" data-review="${esc(s.node)}">
    <p>${s.summary ? esc(s.summary) : `<span class="muted">The session left no words on what was built.</span>`}</p>
    <div data-tests-for="${esc(s.node)}"><p class="muted">Loading the tests…</p></div>
    ${commits ? `<p class="sub">Commits: ${commits}</p>` : ""}
    <div class="row review-actions"><button class="btn primary" data-slice="approve" title="Keep it: the change to the canon is committed with your approval">Approve</button><button class="btn" data-slice="back" title="Return it with a note; the session starts again on this node">Send back</button><button class="btn" data-slice="discard" title="Undo what was built for this node">Discard</button></div>
    <div class="review-note" hidden><textarea rows="3" placeholder="What should change, in your words"></textarea><div class="row"><button class="btn primary" data-slice="send">Send back</button><button class="btn" data-slice="cancel">Cancel</button></div></div>
  </div>`;
}
// The node's card carries the decision while the node waits for one.
function syncPopupReview() {
  const place = $popup.querySelector("#pp-review");
  if (!place || $popup.hidden || editingDraft()) return;
  const s = reviewSlices().find((x) => x.node === $popup.dataset.id), key = s ? JSON.stringify(s) : "";
  if ((place.dataset.key ?? "") === key || place.querySelector(".review-note textarea")?.value.trim()) return;
  place.dataset.key = key;
  place.innerHTML = s ? `<p class="review-head"><b>Built, and waiting for your decision.</b></p>${reviewHtml(s)}` : "";
  fillTests(place);
}
// A decision that went through shows where the node stands and in the history; only one that did not is said.
const SLICE_FAILED = { approve: "could not be approved", discard: "could not be discarded", "send-back": "could not be sent back" };
async function sliceAct(action, node, note) {
  try { const r = await post(`/api/slice/${action}`, note === undefined ? { node } : { node, note }); if (r.ok === false) throw new Error(r.error || "the viewer refused"); return true; }
  catch (e) { showToast(sayWhy(`${node} ${SLICE_FAILED[action]}`, e)); return false; }
}
async function slicePress(b) {
  const review = b.closest(".review"), node = review?.dataset.review, act = b.dataset.slice;
  if (!node) return;
  const note = review.querySelector(".review-note"), actions = review.querySelector(".review-actions"), text = note.querySelector("textarea");
  if (act === "back") { note.hidden = false; actions.hidden = true; text.focus(); return; }
  if (act === "cancel") { text.value = ""; note.hidden = true; actions.hidden = false; return; }
  if (act === "send" && !text.value.trim()) { showToast("Write what should change first."); return; }
  if (act === "discard" && !confirm(`Discard what was built for ${node}? Its commits are reverted.`)) return;
  const action = act === "send" ? "send-back" : act;
  b.disabled = true;
  if (await sliceAct(action, node, act === "send" ? text.value.trim() : undefined)) { text.value = ""; await fetchRun(); }
  if (b.isConnected) b.disabled = false;
}
async function approveAll() {
  for (const s of reviewSlices()) if (!(await sliceAct("approve", s.node))) break;
  await fetchRun();
}
// One listener for what these cards hold, wherever they are drawn: the button, the run card, a test's file, a decision.
document.addEventListener("click", async (e) => {
  const t = e.target.closest?.("#implement-btn, [data-run], [data-run-node], [data-copy], a.test-file, [data-slice]");
  if (!t) return;
  if (t.matches("a.test-file")) { e.preventDefault(); const path = t.dataset.path; showToast((await copyText(path)) ? `Copied the path of the test file: ${path}` : `The test file is at ${path}`); }
  else if (t.id === "implement-btn") openRunCard();
  else if (t.dataset.copy) { if (await copyText(t.dataset.copy)) t.textContent = "Copied"; else showToast("The line could not be copied. Select it and copy it by hand."); }
  else if (t.dataset.runNode) { if (node(t.dataset.runNode)) focusOnCanvas(t.dataset.runNode, true, true); }
  else if (t.dataset.run) runPress(t);
  else slicePress(t);
});

// ---------------------------------------------------------------- the canvas view, refreshed in place
// A change on disk never rebuilds the canvas: the strip, the legend, the principles node and the nodes' colours are
// updated where they are, and only nodes that appeared or went move the layout. Reloads are spaced while the session
// writes continuously, except during onboarding, when the canon is small and the next step must not wait.
function refreshAdopt() {
  if (route().view !== "adopt" || !snap) return;
  const strip = $main.querySelector(".progress"); if (strip) strip.outerHTML = progressStrip();
  const lg = $main.querySelector(".adopt-bar .legend"); if (lg) lg.outerHTML = adoptLegend();
  if (adoptState.refresh) adoptState.refresh(); else render();
  adoptState.refreshPrn?.();
}
let reloadTimer = 0, lastReloadAt = 0, reloadNamed = new Set();
const RELOAD_GAP = 5000;
function scheduleReload(named) {
  for (const id of named) reloadNamed.add(id);
  if (reloadTimer) return;
  const wait = onboardStage ? 0 : Math.max(0, lastReloadAt + RELOAD_GAP - Date.now());
  reloadTimer = setTimeout(async () => {
    reloadTimer = 0; lastReloadAt = Date.now();
    const named2 = reloadNamed; reloadNamed = new Set();
    const was = snap;
    if (!(await load().then(() => true).catch(() => false))) return;
    if (lastMarksRev === null) fetchMarks(); // a viewer that names no revision for the marks: they follow the canon
    const changes = canonDiff(was, snap).filter((e) => !named2.has(e.id));
    for (const e of changes) { clearPending(e.id); recentChanges.push({ id: e.id, at: Date.now() }); }
    if (changes.length) appendChat(changes);
    notePhase();
    syncOnboard();
    if (route().view === "adopt") refreshAdopt();
    else if (route().view !== "tree" && route().view !== "node" && !$main.querySelector("#term-save, #edit-text") && document.activeElement?.id !== "g-q") render();
    checkConflict();
    renderIssues(lastSession);
  }, wait);
}

function appendChat(entries) {
  // the chat holds only what the user and the session say to each other; the terminal's mirror has its own tab
  const chat = document.getElementById("activity"), history = document.getElementById("history"), terminal = document.getElementById("terminal");
  for (const e of entries) {
    if (e.kind === "say" && e.intro) { introAt = e.at; continue; } // the onboarding signal: the card owns its words; its time names the run
    if (e.kind === "terminal") { const li = document.createElement("li"); li.className = `terminal ${e.role === "session" ? "say" : "message"}`; li.innerHTML = `<span class="kind">terminal · ${e.role === "session" ? "session" : "you"}</span>${chatHtml(e.text ?? "")}<div class="meta"><time>${timeOf(e.at)}</time></div>`; (terminal ?? chat).appendChild(li); continue; }
    const li = document.createElement("li");
    const t = timeOf(e.at);
    const toUser = e.kind === "message" || (e.kind === "say" && (e.to === "user" || /\?\s*$/.test(e.text ?? "")));
    if (toUser && e.kind === "say") { li.className = "say"; li.innerHTML = `${chatHtml(e.text)}<div class="meta">${e.id ? `<a class="ref" data-id="${esc(e.id)}" href="#/node/${esc(e.id)}" title="Open ${esc(e.id)}">${esc(e.id)}</a>` : ""}<time>${t}</time></div>`; chat.appendChild(li); }
    else if (e.kind === "message") { li.className = "message"; li.innerHTML = `${e.quote ? `<span class="q">${e.id ? `<a class="id" data-id="${esc(e.id)}" href="#/node/${esc(e.id)}">${esc(e.id)}</a> › ` : ""}“${esc(e.quote)}”</span>` : ""}${linkIds(e.text ?? "")}<div class="meta"><time>${t}</time></div>`; chat.appendChild(li); }
    else {
      li.className = `ev ${e.kind}`; if (e.id) li.dataset.id = e.id; li.title = "Double-click to go to this node";
      li.innerHTML = `<span class="kind">${esc(KIND_LABELS[e.kind] ?? e.kind)}</span>${linkIds(e.text ?? "")}<div class="meta">${e.id ? `<span class="ref">${esc(e.id)}</span>` : ""}<time>${t}</time></div>`;
      li.addEventListener("dblclick", () => goToEvent(e.id));
      history.appendChild(li);
      if (history.hidden) { historyNew++; const pill = document.getElementById("history-new"); pill.textContent = historyNew; pill.hidden = false; }
    }
  }
  for (const list of [chat, history, terminal].filter(Boolean)) { while (list.children.length > 80) list.firstChild.remove(); if (!list.hidden) list.lastElementChild?.scrollIntoView({ block: "nearest" }); }
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
  for (const id of ["activity", "terminal", "history"]) { const el = document.getElementById(id); if (el) el.hidden = id !== b.dataset.panel; }
  if (b.dataset.panel === "history") { historyNew = 0; document.getElementById("history-new").hidden = true; }
  document.getElementById(b.dataset.panel).lastElementChild?.scrollIntoView({ block: "nearest" });
});
// While the canvas is up, a node named in the chat is focused there rather than opened as a page; a principle opens its card.
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

load().then(render).catch(showError).finally(() => { fetchMarks(); fetchRun(); pollSession(); });
