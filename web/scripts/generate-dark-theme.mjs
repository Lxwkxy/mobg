// Generates app/dark-theme.css.
//
// Components use hard-coded colors (bg-white, text-[#5B44BA], bg-red-50, ...).
// This script scans the source for those classes and emits dark-mode overrides
// that change background, text and border colors as matching pairs, so text
// never ends up dark-on-dark. Re-run it after adding new color classes:
//
//   npm run gen:dark-theme
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SCAN_DIRS = ['app', 'components'];
const OUT = join(root, 'app', 'dark-theme.css');

// ---------- colour helpers ----------
function hexToHsl(hex) {
  let h = hex.replace('#', '');
  if (h.length === 3) h = [...h].map((c) => c + c).join('');
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { h: 0, s: 0, l };
  const s = d / (1 - Math.abs(2 * l - 1));
  let hue;
  if (max === r) hue = ((g - b) / d) % 6;
  else if (max === g) hue = (b - r) / d + 2;
  else hue = (r - g) / d + 4;
  hue = (hue * 60 + 360) % 360;
  return { h: hue, s, l };
}

function family({ h, s }) {
  if (s < 0.25) return 'neutral';
  if (h < 25 || h >= 335) return 'red';
  if (h < 70) return 'amber';
  if (h < 175) return 'green';
  if (h < 235) return 'blue';
  return 'purple';
}

const PAGE_BG = '#f3efff';

const BG_BASE = {
  page: '#14122a',
  surface: '#1d1a3d',
  surface2: '#25214d',
  tint: '#2e2a63',
  red: '#3c2030',
  amber: '#3a301c',
  green: '#173a30',
  blue: '#1c2c4d',
};
const BG_HOVER = {
  '#14122a': '#1d1a3d',
  '#1d1a3d': '#2e2a63',
  '#25214d': '#312c66',
  '#2e2a63': '#3a3576',
  '#3c2030': '#4b283b',
  '#3a301c': '#4a3d22',
  '#173a30': '#1e4a3d',
  '#1c2c4d': '#243a63',
};

const TEXT = {
  main: '#ebe8fb',
  muted: '#a8a3cf',
  accent: '#c2b8ff',
  red: '#f5a9bd',
  amber: '#f2cf6b',
  green: '#7ad9b4',
  blue: '#9cc3f5',
};

const BORDER = {
  neutral: '#38336a',
  accentHover: '#6f63c4',
  red: '#7a3350',
  amber: '#6e5a26',
  green: '#27604b',
  blue: '#35588a',
};

const isHoverLike = (variants) =>
  variants.some((v) =>
    ['hover', 'focus', 'group-hover', 'focus-visible', 'focus-within'].includes(v),
  );

function mapBgHex(hex, variants) {
  const lower = hex.toLowerCase();
  const hsl = hexToHsl(lower);
  if (hsl.l < 0.8) return null;
  const hoverLike = isHoverLike(variants);
  let base;
  if (lower === PAGE_BG) base = BG_BASE.page;
  else if (lower === '#ffffff' || lower === '#fff') base = BG_BASE.surface;
  else {
    const fam = family(hsl);
    if (fam === 'red') base = BG_BASE.red;
    else if (fam === 'amber') base = BG_BASE.amber;
    else if (fam === 'green') base = BG_BASE.green;
    else if (fam === 'blue') base = BG_BASE.blue;
    else base = hsl.l >= 0.93 && fam === 'neutral' ? BG_BASE.surface2 : BG_BASE.tint;
  }
  return hoverLike ? BG_HOVER[base] ?? base : base;
}

function mapTextHex(hex) {
  const hsl = hexToHsl(hex);
  if (hsl.l >= 0.72) return null; // already light (white / pale text)
  if (hsl.l < 0.28) return TEXT.main;
  const fam = family(hsl);
  if (fam === 'red') return TEXT.red;
  if (fam === 'amber') return TEXT.amber;
  if (fam === 'green') return TEXT.green;
  if (fam === 'blue') return TEXT.blue;
  if (fam === 'purple' && hsl.l < 0.62) return TEXT.accent;
  return TEXT.muted;
}

function mapBorderHex(hex) {
  const hsl = hexToHsl(hex);
  if (hsl.l < 0.6) return null; // strong accent border, keep
  const fam = family(hsl);
  if (fam === 'red') return BORDER.red;
  if (fam === 'amber') return BORDER.amber;
  if (fam === 'green') return BORDER.green;
  if (fam === 'blue') return BORDER.blue;
  if (hsl.l < 0.82 && fam === 'purple') return BORDER.accentHover;
  return BORDER.neutral;
}

// ---------- Tailwind palette classes ----------
const FAMILY_OF = {
  red: 'red', rose: 'red', pink: 'red',
  amber: 'amber', yellow: 'amber', orange: 'amber',
  emerald: 'green', green: 'green', teal: 'green',
  blue: 'blue', sky: 'blue', cyan: 'blue',
  violet: 'purple', purple: 'purple', indigo: 'purple',
  slate: 'neutral', gray: 'neutral', zinc: 'neutral', neutral: 'neutral', stone: 'neutral',
};

function mapPaletteBg(name, shade, variants) {
  const fam = FAMILY_OF[name];
  if (!fam || shade > 200) return null;
  const hoverLike = isHoverLike(variants);
  let base;
  if (fam === 'red') base = BG_BASE.red;
  else if (fam === 'amber') base = BG_BASE.amber;
  else if (fam === 'green') base = BG_BASE.green;
  else if (fam === 'blue') base = BG_BASE.blue;
  else base = BG_BASE.tint;
  // 100/200 shades are one step stronger than 50
  if (shade >= 100 && !hoverLike) base = BG_HOVER[base] ?? base;
  return hoverLike ? BG_HOVER[base] ?? base : base;
}

function mapPaletteText(name, shade) {
  const fam = FAMILY_OF[name];
  if (!fam || shade < 400) return null;
  if (fam === 'red') return TEXT.red;
  if (fam === 'amber') return TEXT.amber;
  if (fam === 'green') return TEXT.green;
  if (fam === 'blue') return TEXT.blue;
  if (fam === 'purple') return TEXT.accent;
  return shade >= 700 ? TEXT.main : TEXT.muted;
}

function mapPaletteBorder(name, shade) {
  const fam = FAMILY_OF[name];
  if (!fam || shade > 300) return null;
  if (fam === 'red') return BORDER.red;
  if (fam === 'amber') return BORDER.amber;
  if (fam === 'green') return BORDER.green;
  if (fam === 'blue') return BORDER.blue;
  return BORDER.neutral;
}

function withAlpha(hex, pct) {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgb(${r} ${g} ${b} / ${pct / 100})`;
}

// ---------- scan ----------
function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(tsx|ts|jsx|js)$/.test(name)) out.push(p);
  }
  return out;
}

const files = SCAN_DIRS.flatMap((d) => walk(join(root, d)));
const tokenRe = /(?:[A-Za-z0-9-]+:)*(?:bg|text|border|border-[trblxy]|divide)-(?:\[#[0-9a-fA-F]{3,8}\]|[a-z]+-\d{2,3}|white)(?:\/\d{1,3})?(?![\w/\[-])/g;
const tokens = new Set();
for (const f of files) {
  for (const m of readFileSync(f, 'utf8').matchAll(tokenRe)) tokens.add(m[0]);
}

const SUPPORTED_STATE = new Set([
  'hover', 'focus', 'focus-visible', 'focus-within', 'disabled', 'active',
  'placeholder', 'group-hover',
]);
const RESPONSIVE = { sm: 640, md: 768, lg: 1024, xl: 1280 };

function cssEscape(token) {
  return token.replace(/([^A-Za-z0-9_-])/g, '\\$1');
}

const rules = []; // { order, media, css }
const skipped = [];

for (const token of tokens) {
  const parts = token.split(':');
  const utility = parts.pop();
  const variants = parts;

  if (variants.includes('dark')) continue; // author already handled dark

  const m = utility.match(
    /^(bg|text|border|border-[trblxy]|divide)-(?:\[(#[0-9a-fA-F]{3,8})\]|([a-z]+)-(\d{2,3})|(white))(?:\/(\d{1,3}))?$/,
  );
  if (!m) continue;
  const [, kind, hex, palName, shadeStr, isWhite, opacity] = m;
  const shade = shadeStr ? Number(shadeStr) : 0;

  let value = null;
  let prop = null;
  if (kind === 'bg') {
    prop = 'background-color';
    value = isWhite
      ? mapBgHex('#ffffff', variants)
      : hex
        ? mapBgHex(hex, variants)
        : mapPaletteBg(palName, shade, variants);
  } else if (kind === 'text') {
    prop = 'color';
    value = isWhite ? null : hex ? mapTextHex(hex) : mapPaletteText(palName, shade);
  } else {
    prop = 'border-color';
    value = isWhite ? null : hex ? mapBorderHex(hex) : mapPaletteBorder(palName, shade);
  }
  if (!value) continue;
  // White overlays sit on purple banners; only bg-white/80-95 cards are handled (staticRules).
  if (isWhite && opacity) continue;
  if (opacity) value = withAlpha(value, Number(opacity));

  const unsupported = variants.filter((v) => !SUPPORTED_STATE.has(v) && !RESPONSIVE[v]);
  if (unsupported.length) {
    skipped.push(`${token} (variant: ${unsupported.join(', ')})`);
    continue;
  }

  const media = variants.find((v) => RESPONSIVE[v]);
  const states = variants.filter((v) => SUPPORTED_STATE.has(v));
  const esc = `.${cssEscape(token)}`;

  let selector = esc;
  let prefix = '';
  for (const s of states) {
    if (s === 'group-hover') prefix = '.group:hover ';
    else if (s === 'placeholder') selector += '::placeholder';
    else selector += `:${s}`;
  }
  if (kind === 'divide') selector = `${selector} > :not(:last-child)`;

  const order = states.length === 0 ? 0 : states.includes('disabled') ? 3 : states.includes('active') ? 2 : 1;
  rules.push({
    order,
    media: media ? RESPONSIVE[media] : 0,
    css: `html[data-theme="dark"] ${prefix}${selector} { ${prop}: ${value}; }`,
  });
}

// translucent white cards sit on dark surface; do not touch bg-white/10 etc. on banners
const staticRules = [
  'html[data-theme="dark"] .bg-white\\/95 { background-color: rgb(29 26 61 / 0.95); }',
  'html[data-theme="dark"] .bg-white\\/80 { background-color: rgb(29 26 61 / 0.8); }',
  'html[data-theme="dark"] .bg-white\\/90 { background-color: rgb(29 26 61 / 0.9); }',
  'html[data-theme="dark"] .border-white { border-color: #38336a; }',
];

const sortRules = (a, b) => a.media - b.media || a.order - b.order || a.css.localeCompare(b.css);
const plain = rules.filter((r) => !r.media).sort(sortRules).map((r) => r.css);
const byMedia = new Map();
for (const r of rules.filter((r) => r.media).sort(sortRules)) {
  if (!byMedia.has(r.media)) byMedia.set(r.media, []);
  byMedia.get(r.media).push(r.css);
}

let css = `/* GENERATED by scripts/generate-dark-theme.mjs. Do not edit by hand.
   Run \`npm run gen:dark-theme\` after adding new color classes. */\n\n`;
css += [...plain, ...staticRules].join('\n') + '\n';
for (const [min, list] of [...byMedia.entries()].sort((a, b) => a[0] - b[0])) {
  css += `\n@media (min-width: ${min}px) {\n${list.map((l) => `  ${l}`).join('\n')}\n}\n`;
}

writeFileSync(OUT, css);
console.log(`Wrote ${OUT}: ${rules.length + staticRules.length} rules from ${tokens.size} color classes.`);
if (skipped.length) console.log(`Skipped:\n  ${skipped.join('\n  ')}`);
