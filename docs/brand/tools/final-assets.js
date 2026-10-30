// Final HeadCanon assets: candidate 01 "Held canon" in scheme A "Ink & Verdigris".
// usage: FONTS=<dir with f2.ttf (Plex Sans Medium) and f3.ttf (Plex Sans SemiBold)> node final-assets.js <outDir>
// Needs: npm install opentype.js@1.3.4 @resvg/resvg-js@2.6.2
const ot = require('opentype.js');
const fs = require('fs');
const path = require('path');
const { Resvg } = require('@resvg/resvg-js');
const out = process.argv[2];
const FONTS = process.env.FONTS || '../fonts';
fs.mkdirSync(out, { recursive: true });

const F = {
  sans600: ot.loadSync(path.join(FONTS, 'f3.ttf')),
  sans500: ot.loadSync(path.join(FONTS, 'f2.ttf')),
};
const A = { ink: '#161A22', paper: '#F5F1E8', accent: '#0B7368', accentDark: '#3FC1B0', slate: '#5A6472', slateDark: '#98A0AD' };
const light = { fg: A.ink, bg: A.paper, ac: A.accent };
const dark = { fg: A.paper, bg: A.ink, ac: A.accentDark };

// ---------- the mark ----------
const HEAD = 'M24 62V53C13 50 6 41 6 30 6 17 16 6 30 6s24 10 24 24c0 4-1 8-3 11l6 9-7 2v10z';
function mark(c) {
  return `<path d="${HEAD}" fill="${c.fg}"/>
<path d="M22 30h12M22 30l12-10M22 30l12 10M34 30l10-5M34 30l10 5" stroke="${c.bg}" stroke-width="3" stroke-linecap="round" fill="none"/>
<g fill="${c.bg}"><circle cx="34" cy="20" r="3.4"/><circle cx="34" cy="30" r="3.4"/><circle cx="34" cy="40" r="3.4"/><circle cx="44" cy="25" r="3.4"/><circle cx="44" cy="35" r="3.4"/></g>
<circle cx="22" cy="30" r="4.8" fill="${c.ac}" stroke="${c.bg}" stroke-width="2"/>`;
}
// favicon: the same head, a coarser tree that holds at 16px
function favicon(c) {
  return `<path d="${HEAD}" fill="${c.fg}"/>
<path d="M22 30l14-11M22 30h14M22 30l14 11" stroke="${c.bg}" stroke-width="4" stroke-linecap="round" fill="none"/>
<g fill="${c.bg}"><circle cx="36" cy="19" r="4.5"/><circle cx="36" cy="30" r="4.5"/><circle cx="36" cy="41" r="4.5"/></g>
<circle cx="22" cy="30" r="6" fill="${c.ac}" stroke="${c.bg}" stroke-width="2.5"/>`;
}
const svg = (w, h, inner, extra = '') =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="HeadCanon"${extra}>${inner}</svg>`;

// ---------- wordmark ----------
function glyphs(font, text, size, x0, y0) {
  const parts = [];
  F[font].forEachGlyph(text, x0, y0, size, { kerning: true }, (g, gx, gy) => parts.push(g.getPath(gx, gy, size).toPathData(2)));
  return { parts, adv: F[font].getAdvanceWidth(text, size, { kerning: true }) };
}
const WM_SIZE = 50, CAP = 0.698 * WM_SIZE, BASE = 32 + CAP / 2, WM_X = 80;
const wm = glyphs('sans600', 'HeadCanon', WM_SIZE, WM_X, BASE);
const LOCK_W = Math.ceil(WM_X + wm.adv + 2);
const wordmark = c => wm.parts.slice(0, 4).map(d => `<path d="${d}" fill="${c.fg}"/>`).join('') + wm.parts.slice(4).map(d => `<path d="${d}" fill="${c.ac}"/>`).join('');
const lockup = c => svg(LOCK_W, 64, mark(c) + wordmark(c));

// ---------- files ----------
const files = {
  'headcanon-mark.svg': svg(64, 64, mark(light)),
  'headcanon-mark-dark.svg': svg(64, 64, mark(dark)),
  'headcanon-mark-mono.svg': svg(64, 64, mark({ fg: 'currentColor', bg: '#fff', ac: 'currentColor' }).replace(/#fff/g, 'var(--hc-ground, #fff)')),
  'headcanon-lockup.svg': lockup(light),
  'headcanon-lockup-dark.svg': lockup(dark),
  'favicon.svg': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64"><style>:root{--fg:${A.ink};--bg:${A.paper};--ac:${A.accent}}@media (prefers-color-scheme:dark){:root{--fg:${A.paper};--bg:${A.ink};--ac:${A.accentDark}}}</style>${favicon({ fg: 'var(--fg)', bg: 'var(--bg)', ac: 'var(--ac)' })}</svg>`,
};
for (const [n, s] of Object.entries(files)) fs.writeFileSync(path.join(out, n), s);

// ---------- rasters ----------
function png(svgText, width, name) {
  const r = new Resvg(svgText, { fitTo: { mode: 'width', value: width }, background: 'rgba(0,0,0,0)' });
  fs.writeFileSync(path.join(out, name), r.render().asPng());
}
// favicon PNGs use the light favicon drawing on transparent
const favLight = svg(64, 64, favicon(light));
png(favLight, 16, 'favicon-16.png');
png(favLight, 32, 'favicon-32.png');
png(svg(64, 64, `<rect width="64" height="64" rx="12" fill="${A.ink}"/>` + favicon(dark)), 180, 'apple-touch-icon.png');
png(svg(64, 64, mark(light)), 192, 'headcanon-mark-192.png');
png(svg(64, 64, mark(light)), 512, 'headcanon-mark-512.png');
png(lockup(light), 1024, 'headcanon-lockup-1024.png');
png(lockup(dark), 1024, 'headcanon-lockup-dark-1024.png');

// social preview 1280x640: ink ground, lockup, tagline
{
  const W = 1280, H = 640, c = dark;
  const scale = 2.6; // 64 -> 166
  const lw = LOCK_W * scale, lx = (W - lw) / 2, ly = 190;
  const tag = glyphs('sans500', 'Keeps a coding agent aligned with what you are actually building.', 30, 0, 0);
  const tx = (W - tag.adv) / 2, ty = 450;
  const inner = `<rect width="${W}" height="${H}" fill="${A.ink}"/>
<g transform="translate(${lx.toFixed(1)} ${ly}) scale(${scale})">${mark(c)}${wordmark(c)}</g>
<g transform="translate(${tx.toFixed(1)} ${ty})" fill="${A.slateDark}">${tag.parts.map(d => `<path d="${d}"/>`).join('')}</g>`;
  const s = svg(W, H, inner);
  fs.writeFileSync(path.join(out, 'social-preview.svg'), s);
  png(s, W, 'social-preview.png');
}
console.log('lockup', LOCK_W, 'x 64;', fs.readdirSync(out).length, 'files in', out);
