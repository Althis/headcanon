// Builds the HeadCanon logo candidates: standalone SVGs plus a review sheet.
// usage: FONTS=<dir with IBMPlexSans-Medium/SemiBold/Bold.ttf> node build-logos.js <outDir>
// Fonts: IBM Plex Sans (OFL), https://github.com/IBM/plex or Google Fonts. Needs: npm install opentype.js@1.3.4
const ot = require('opentype.js');
const fs = require('fs');
const path = require('path');
const out = process.argv[2];
const FONTS = process.env.FONTS || path.join(__dirname, 'fonts');
fs.mkdirSync(path.join(out, 'logos'), { recursive: true });

const F = {
  sans600: ot.loadSync(path.join(FONTS, 'IBMPlexSans-SemiBold.ttf')),
  sans700: ot.loadSync(path.join(FONTS, 'IBMPlexSans-Bold.ttf')),
  sans500: ot.loadSync(path.join(FONTS, 'IBMPlexSans-Medium.ttf')),
};

// ---------- colour schemes ----------
const SCHEMES = {
  A: { name: 'Ink & Verdigris', ink: '#161A22', paper: '#F5F1E8', accent: '#0B7368', accentDark: '#3FC1B0', slate: '#5A6472' },
  B: { name: 'Graphite & Cobalt', ink: '#1A1D23', paper: '#F6F7F9', accent: '#2454D6', accentDark: '#6D9CFF', slate: '#5F6673' },
  C: { name: 'Midnight & Chalk', ink: '#0F1115', paper: '#FAFAF7', accent: '#0F1115', accentDark: '#FAFAF7', slate: '#6B7280' },
};
const light = s => ({ fg: s.ink, bg: s.paper, ac: s.accent });
const dark = s => ({ fg: s.paper, bg: s.ink, ac: s.accentDark });
const VARS = { fg: 'var(--fg)', bg: 'var(--bg)', ac: 'var(--ac)' };

// ---------- wordmark ----------
function wordmark(font, text, size, x0, y0) {
  const parts = [];
  F[font].forEachGlyph(text, x0, y0, size, { kerning: true }, (g, gx, gy) => {
    parts.push(g.getPath(gx, gy, size).toPathData(2));
  });
  const adv = F[font].getAdvanceWidth(text, size, { kerning: true });
  return { parts, adv };
}
const QUOTE = F.sans700.getPath('”', 0, 0, 100);
const QB = QUOTE.getBoundingBox();

// ---------- the eight marks (64x64) ----------
// each returns inner svg for a 64x64 viewBox, given colours c = {fg,bg,ac}
const MARKS = [
  {
    id: '01-held-canon', title: 'Held canon',
    why: 'The literal reading of the name: a head with the canon tree inside it, the root lit. Reads at every size as a head; the tree appears from 32px up.',
    draw: c => `
<path d="M24 62V53C13 50 6 41 6 30 6 17 16 6 30 6s24 10 24 24c0 4-1 8-3 11l6 9-7 2v10z" fill="${c.fg}"/>
<g stroke="${c.bg}" stroke-width="2.6" stroke-linecap="round" fill="none">
  <path d="M22 30h12M22 30l12-10M22 30l12 10M34 30l10-5M34 30l10 5"/>
</g>
<g fill="${c.bg}"><circle cx="34" cy="20" r="3.2"/><circle cx="34" cy="30" r="3.2"/><circle cx="34" cy="40" r="3.2"/><circle cx="44" cy="25" r="3.2"/><circle cx="44" cy="35" r="3.2"/></g>
<circle cx="22" cy="30" r="4.6" fill="${c.ac}" stroke="${c.bg}" stroke-width="2"/>`,
  },
  {
    id: '02-hc-rung', title: 'HC rung',
    why: 'A monogram. The H is two stems joined by a rung, and the rung runs on into the C: the ladder that ties every child to its parent, and the C that holds it.',
    draw: c => `
<rect x="2" y="14" width="7" height="36" rx="1" fill="${c.fg}"/>
<rect x="19" y="14" width="7" height="36" rx="1" fill="${c.fg}"/>
<rect x="2" y="28.5" width="44.5" height="7" rx="1" fill="${c.fg}"/>
<path d="M56.46 23.64A13 13 0 1 0 56.46 40.36" fill="none" stroke="${c.ac}" stroke-width="7" stroke-linecap="butt"/>`,
  },
  {
    id: '03-fork', title: 'Fork',
    why: 'The Tree view itself: one box, a bus, three children. The root is the accent because the root is the human’s premise. Familiar as an icon, owned by the colour and the proportions.',
    draw: c => `
<g stroke="${c.fg}" stroke-width="4" stroke-linecap="round" fill="none"><path d="M20 32h10M30 10v44M30 10h12M30 32h12M30 54h12"/></g>
<rect x="4" y="24" width="16" height="16" rx="3.5" fill="${c.ac}"/>
<rect x="42" y="2" width="16" height="16" rx="3.5" fill="${c.fg}"/>
<rect x="42" y="24" width="16" height="16" rx="3.5" fill="${c.fg}"/>
<rect x="42" y="46" width="16" height="16" rx="3.5" fill="${c.fg}"/>`,
  },
  {
    id: '04-quote-root', title: 'Quote root',
    why: 'The stated quote outranks every document, so the quote mark is the root and the tree grows from it. The most "canon" of the eight; the accent sits on the leaves.',
    draw: c => {
      const h = 26, s = h / (QB.y2 - QB.y1);
      const tx = 4 - QB.x1 * s, ty = 4 - QB.y1 * s;
      return `
<path transform="translate(${tx.toFixed(2)} ${ty.toFixed(2)}) scale(${s.toFixed(4)})" d="${QUOTE.toPathData(2)}" fill="${c.fg}"/>
<g stroke="${c.fg}" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round" fill="none"><path d="M30 31L37 44M37 44L50 37M37 44L46 57"/></g>
<g fill="${c.ac}"><circle cx="51" cy="36.5" r="4.6"/><circle cx="47" cy="58" r="4.6"/></g>`;
    },
  },
  {
    id: '05-c-ring', title: 'C ring',
    why: 'An open ring around a point: a C, a head with one thing held in it, and an alignment reticle. The simplest mark of the set; it is a favicon before it is anything else.',
    draw: c => `
<path d="M48.26 15.74A23 23 0 1 0 48.26 48.26" fill="none" stroke="${c.fg}" stroke-width="7" stroke-linecap="round"/>
<circle cx="32" cy="32" r="8" fill="${c.ac}"/>`,
  },
  {
    id: '06-profile-line', title: 'Profile line',
    why: 'One continuous line: a profile that, at the back of the head, turns inward and forks. The outline of the head and the tree inside it are the same stroke.',
    draw: c => `
<path d="M38 62V56C38 54 44 52 47 49C49 46 49 43 52 41C54 40 52 38 50 36L56 33C57 32 55 29 52 26C50 20 46 12 40 9C32 5 20 6 14 14C10 20 9 28 11 33L22 34L32 24M22 34L32 44" fill="none" stroke="${c.fg}" stroke-width="5.5" stroke-linecap="round" stroke-linejoin="round"/>
<g fill="${c.ac}"><circle cx="34.5" cy="21.5" r="4.4"/><circle cx="34.5" cy="46.5" r="4.4"/></g>`,
  },
  {
    id: '07-h-tree', title: 'h tree',
    why: 'A lowercase h whose stem also sprouts a branch: letter and tree in one glyph. Monoline, so it sits beside code.',
    draw: c => `
<path d="M18 8v50M18 42c0-12 28-12 28 0v16M18 18l11-8" fill="none" stroke="${c.fg}" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>
<circle cx="33" cy="7.5" r="5.5" fill="${c.ac}"/>`,
  },
  {
    id: '08-thought-box', title: 'Thought box',
    why: 'A thought bubble whose cloud is a canon card. The small dot is the one who thinks it; the card is what they hold to be true. The pun in the name, drawn.',
    draw: c => `
<rect x="10" y="6" width="46" height="32" rx="7" fill="${c.fg}"/>
<rect x="18" y="16" width="30" height="4" rx="2" fill="${c.bg}"/>
<rect x="18" y="24" width="19" height="4" rx="2" fill="${c.bg}"/>
<circle cx="20" cy="48" r="5" fill="${c.fg}"/>
<circle cx="11" cy="58" r="3.4" fill="${c.ac}"/>`,
  },
];

// ---------- emitters ----------
const WM_SIZE = 50;
const CAP = 0.698 * WM_SIZE;
const BASE = 32 + CAP / 2;
const WM_X = 80;
const wm = wordmark('sans600', 'HeadCanon', WM_SIZE, WM_X, BASE);
const LOCK_W = Math.ceil(WM_X + wm.adv + 2);

function wordmarkSvg(c) {
  const head = wm.parts.slice(0, 4).map(d => `<path d="${d}" fill="${c.fg}"/>`).join('');
  const canon = wm.parts.slice(4).map(d => `<path d="${d}" fill="${c.ac}"/>`).join('');
  return head + canon;
}
function markSvg(m, c, size) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="${size}" height="${size}" role="img" aria-label="HeadCanon mark, ${m.title}">${m.draw(c)}</svg>`;
}
function lockupSvg(m, c, height, withBg) {
  const bg = withBg ? `<rect width="${LOCK_W}" height="64" fill="${c.bg}"/>` : '';
  const w = Math.round(LOCK_W * height / 64);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${LOCK_W} 64" width="${w}" height="${height}" role="img" aria-label="HeadCanon, ${m.title}">${bg}${m.draw(c)}${wordmarkSvg(c)}</svg>`;
}

// standalone files, scheme A
const A = SCHEMES.A;
for (const m of MARKS) {
  fs.writeFileSync(path.join(out, 'logos', `${m.id}-mark.svg`), markSvg(m, light(A), 64));
  fs.writeFileSync(path.join(out, 'logos', `${m.id}-lockup.svg`), lockupSvg(m, light(A), 64, false));
  fs.writeFileSync(path.join(out, 'logos', `${m.id}-lockup-dark.svg`), lockupSvg(m, dark(A), 64, true));
}

// ---------- the review sheet ----------
const schemeCss = Object.entries(SCHEMES).map(([k, s]) => `
  [data-scheme="${k}"] { --ink:${s.ink}; --paper:${s.paper}; --accent:${s.accent}; --accent-dark:${s.accentDark}; --slate:${s.slate}; }`).join('');

const cards = MARKS.map((m, i) => `
<section class="card">
  <header><span class="num">0${i + 1}</span><h2>${m.title}</h2></header>
  <p class="why">${m.why}</p>
  <div class="lockup">${lockupSvg(m, VARS, 72, false)}</div>
  <div class="row">
    <div class="cell"><div class="sq">${markSvg(m, VARS, 64)}</div><span>64</span></div>
    <div class="cell"><div class="sq">${markSvg(m, VARS, 32)}</div><span>32</span></div>
    <div class="cell"><div class="sq">${markSvg(m, VARS, 16)}</div><span>16</span></div>
    <div class="cell mono"><div class="sq">${markSvg({ ...m, draw: c => m.draw({ fg: c.fg, bg: c.bg, ac: c.fg }) }, VARS, 40)}</div><span>mono</span></div>
    <div class="cell inv"><div class="sq">${markSvg(m, { fg: 'var(--bg)', bg: 'var(--fg)', ac: 'var(--ac)' }, 40)}</div><span>on ink</span></div>
    <div class="cell ctx"><div class="bar">${markSvg(m, VARS, 18)}<b>HeadCanon</b><i class="st g">stated 12</i><i class="st y">assumed 7</i><i class="st r">needs you 3</i></div><span>beside the states</span></div>
  </div>
</section>`).join('');

const html = `<!doctype html>
<html lang="en" data-scheme="A" data-theme="light">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>HeadCanon logo candidates</title>
<style>
  ${schemeCss}
  :root { --fg: var(--ink); --bg: var(--paper); --ac: var(--accent); --mut: var(--slate); --line: color-mix(in srgb, var(--ink) 14%, var(--paper)); }
  [data-theme="dark"] { --fg: var(--paper); --bg: var(--ink); --ac: var(--accent-dark); --mut: color-mix(in srgb, var(--paper) 60%, var(--ink)); --line: color-mix(in srgb, var(--paper) 16%, var(--ink)); }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--fg); font: 15px/1.5 "IBM Plex Sans", system-ui, sans-serif; padding: 24px 16px 64px; }
  h1 { font-size: 22px; margin: 0; font-weight: 600; }
  .top { display: flex; flex-wrap: wrap; gap: 12px 24px; align-items: center; justify-content: space-between; max-width: 1180px; margin: 0 auto 20px; }
  .ctl { display: flex; gap: 6px; flex-wrap: wrap; }
  .ctl button { font: inherit; font-size: 13px; padding: 5px 11px; border-radius: 999px; border: 1px solid var(--line); background: transparent; color: var(--fg); cursor: pointer; }
  .ctl button[aria-pressed="true"] { background: var(--fg); color: var(--bg); border-color: var(--fg); }
  .pal { display: flex; gap: 6px; align-items: center; font-size: 12px; color: var(--mut); }
  .pal i { display: inline-block; width: 22px; height: 22px; border-radius: 6px; border: 1px solid var(--line); }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); gap: 18px; max-width: 1180px; margin: 0 auto; }
  .card { border: 1px solid var(--line); border-radius: 14px; padding: 18px 18px 14px; display: flex; flex-direction: column; gap: 10px; }
  .card header { display: flex; align-items: baseline; gap: 10px; }
  .num { font-family: "IBM Plex Mono", ui-monospace, monospace; font-size: 12px; color: var(--mut); }
  h2 { font-size: 16px; margin: 0; font-weight: 600; }
  .why { margin: 0; color: var(--mut); font-size: 13px; line-height: 1.45; }
  .lockup { padding: 18px 4px; display: flex; justify-content: center; }
  .lockup svg { max-width: 100%; height: auto; }
  .row { display: flex; gap: 10px; align-items: flex-end; flex-wrap: wrap; border-top: 1px solid var(--line); padding-top: 12px; }
  .cell { display: flex; flex-direction: column; align-items: center; gap: 4px; font-size: 11px; color: var(--mut); }
  .sq { display: flex; align-items: center; justify-content: center; height: 64px; }
  .inv .sq { background: var(--fg); border-radius: 8px; width: 64px; }
  .ctx { align-items: flex-start; flex: 1; min-width: 200px; }
  .bar { display: flex; align-items: center; gap: 8px; width: 100%; height: 36px; padding: 0 10px; border-radius: 8px; background: #171b21; color: #e6e8ec; font-size: 13px; }
  .bar b { font-weight: 600; margin-right: auto; }
  .st { font-style: normal; font-size: 10px; padding: 1px 7px; border-radius: 999px; }
  .st.g { background: #15311f; color: #4fc37e; } .st.y { background: #3a2c0f; color: #e8b04b; } .st.r { background: #3d1a1c; color: #ff6b6e; }
  [data-theme="light"] .bar { background: #ffffff; color: #1a1d23; border: 1px solid #e3e6eb; }
  [data-theme="light"] .st.g { background: #e3f5ea; color: #1f8a4c; } [data-theme="light"] .st.y { background: #fff3d6; color: #b7791f; } [data-theme="light"] .st.r { background: #fde7e8; color: #d13438; }
  footer { max-width: 1180px; margin: 24px auto 0; color: var(--mut); font-size: 12px; }
</style>
</head>
<body>
<div class="top">
  <h1>HeadCanon logo candidates</h1>
  <div class="ctl" id="schemes">
    ${Object.entries(SCHEMES).map(([k, s]) => `<button data-scheme="${k}" aria-pressed="${k === 'A'}">${k} · ${s.name}</button>`).join('')}
  </div>
  <div class="ctl" id="themes"><button data-theme="light" aria-pressed="true">Light</button><button data-theme="dark" aria-pressed="false">Dark</button></div>
  <div class="pal"><i style="background:var(--ink)"></i><i style="background:var(--paper)"></i><i style="background:var(--accent)"></i><i style="background:var(--accent-dark)"></i><i style="background:var(--slate)"></i><span id="palname"></span></div>
</div>
<div class="grid">${cards}</div>
<footer>Wordmark: IBM Plex Sans SemiBold, outlined. Marks drawn on a 64-unit grid. The last cell of each row places the mark beside the viewer's state colours, which the brand colour must not be mistaken for.</footer>
<script>
  const root = document.documentElement;
  const names = ${JSON.stringify(Object.fromEntries(Object.entries(SCHEMES).map(([k, s]) => [k, `${s.ink} · ${s.paper} · ${s.accent} / ${s.accentDark} · ${s.slate}`])))};
  function wire(id, attr) {
    document.getElementById(id).addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      root.setAttribute(attr, b.getAttribute(attr));
      for (const x of b.parentNode.children) x.setAttribute('aria-pressed', x === b);
      document.getElementById('palname').textContent = names[root.getAttribute('data-scheme')];
    });
  }
  wire('schemes', 'data-scheme'); wire('themes', 'data-theme');
  document.getElementById('palname').textContent = names['A'];
</script>
</body>
</html>`;
fs.writeFileSync(path.join(out, 'logos.html'), html);
console.log('wrote', out, 'lockup width', LOCK_W, 'files', fs.readdirSync(path.join(out, 'logos')).length);
