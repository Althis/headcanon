// HeadCanon local viewer. No build step: plain ES modules, one JSON endpoint.
const STATES = ["stated", "resolved", "assumed", "open", "contested"];
const UNCONFIRMED = new Set(["assumed", "open", "contested"]);

const $main = document.getElementById("main");
let snap = null;
const ui = { collapsed: new Set(), filters: new Set(), flaggedOnly: false, query: "", levels: new Set(["error", "warn"]) };

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
const stepsFor = (id) => { const out = []; for (const j of snap.canon.journeys) for (const s of j.steps) if (s.requirements.includes(id)) out.push({ j, s }); return out; };
const countBy = (ids) => { const c = Object.fromEntries(STATES.map((s) => [s, 0])); for (const id of ids) { const n = node(id); if (n) c[n.state]++; } return c; };

// ---------------------------------------------------------------- data
async function load() {
  const res = await fetch("/api/snapshot", { cache: "no-store" });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  snap = await res.json();
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
  const views = { overview, tree: () => tree(arg), node: () => tree(arg), health, attention, journeys: () => journeys(arg), journey: () => journeys(arg), decisions: () => decisions(arg), decision: () => decisions(arg), glossary };
  $main.innerHTML = (views[view] ?? overview)();
  afterRender(view);
}

// ---------------------------------------------------------------- overview
function overview() {
  const { stats, health } = snap;
  if (stats.nodes === 0 && !snap.canon.root) return `
    <div class="alert none"><span class="alert-icon">·</span><b>No canon yet.</b><span class="muted">The session creates it as you approve the premise; the first files appear here after init.</span></div>
    <h1>Canon</h1>
    <p class="lede">Nothing to show until the first node exists. Questions from the session arrive in the panel at the bottom right.</p>`;
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
  return `
    <div class="toolbar">
      <input id="q" placeholder="Search id or title…" value="${esc(ui.query)}" />
      ${chips}
      <button class="chip flag ${ui.flaggedOnly ? "on" : ""}" data-flagged="1">! flagged</button>
      <button class="btn" data-expand="1">Expand all</button>
      <button class="btn" data-collapse="1">Collapse</button>
    </div>
    <div class="split">
      <div class="tree"><ul>${snap.canon.roots.map(li).join("")}</ul></div>
      <div class="detail">${selectedId ? nodeDetail(selectedId) : `<p class="muted">Select a requirement to read it.</p><h3>Text tree</h3><pre class="tree-text">${esc(snap.textTree)}</pre>`}</div>
    </div>`;
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
    wireNodeActions();
  }
  if (view === "health") for (const b of $main.querySelectorAll("[data-level]")) b.addEventListener("click", () => { const l = b.dataset.level; ui.levels.has(l) ? ui.levels.delete(l) : ui.levels.add(l); render(); });
  if ((view === "journeys" || view === "journey") && window.mermaid) {
    const dark = matchMedia("(prefers-color-scheme: dark)").matches;
    window.mermaid.initialize({ startOnLoad: false, theme: dark ? "dark" : "neutral", securityLevel: "strict" });
    window.mermaid.run({ nodes: $main.querySelectorAll(".mermaid") }).catch((e) => console.warn("mermaid", e));
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
    if (s.focus && s.focus.seq !== lastFocusSeq) { lastFocusSeq = s.focus.seq; if (s.focus.id) location.hash = s.focus.id === "ROOT" ? "#/" : `#/node/${s.focus.id}`; }
    if (s.question && s.question.id !== shownQuestionId) { shownQuestionId = s.question.id; termState = {}; renderQuestion(s.question, s.pending); openSession(); }
    if (!s.question && shownQuestionId) { shownQuestionId = null; showWorking(); }
    if (!s.question && working) { document.getElementById("session-status").textContent = `session working · ${elapsed()}`; const el = document.getElementById("work-elapsed"); if (el) el.textContent = elapsed(); }
    if (s.cursor !== lastCursor) { lastCursor = s.cursor; if (shownQuestionId === null) { await load().catch(() => {}); if (route().view !== "tree" && route().view !== "node") render(); } }
  } catch (e) { /* server away; try again */ }
  setTimeout(pollSession, 2000);
}
// Between questions: the session is reading, writing or thinking; show that it is, and for how long.
let working = null;
const elapsed = () => { const s = Math.floor((Date.now() - (working?.since ?? Date.now())) / 1000); return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`; };
function showWorking() {
  if (!working) working = { since: Date.now(), answer: "" };
  $question.innerHTML = `
    <div class="working"><span class="spinner"></span><div><b>The session is working.</b> Its next question appears here. <span class="muted" id="work-elapsed">${elapsed()}</span></div></div>
    ${working.answer ? `<p class="muted">You answered: <b>${esc(working.answer.slice(0, 200))}</b></p>` : ""}`;
}
function renderQuestion(q, pending = 1) {
  working = null;
  const opts = q.options.map((o, i) => `<label class="opt"><input type="${q.multiSelect ? "checkbox" : "radio"}" name="opt" value="${esc(o.label)}" ${!q.multiSelect && i === 0 ? "checked" : ""}/> <span class="opt-text"><b>${esc(o.label)}</b>${o.html ? `<span class="opt-desc">${o.html}</span>` : o.description ? `<span class="opt-desc">${esc(o.description)}</span>` : ""}</span></label>`).join("");
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

load().then(render).catch(showError).finally(pollSession);
