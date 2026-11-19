// Makes the card art small enough to host online.  Run:  npm run optimize-art
//
// Your full-size art stays in public/art (it is never uploaded). Keep one folder per generation: public/art/gen1, gen2, ...
// and the small versions are written to the same layout in public/art-web/gen1, gen2, ... This script reads the art that your cards actually
// use (from cards.js), shrinks each image to ART_WIDTH pixels wide, and writes it as WebP into public/art-web/.
// The server (server.js) sends art-web/<name>.webp whenever the browser asks for art/<name>.png, so the game and
// cards.js do not change. Without art-web (for example while developing) it falls back to public/art.
//
//   ART_WIDTH=500   width in pixels (cards show at ~112px, so 500 is sharp on high-DPI screens)
//   ART_QUALITY=80  WebP quality 1-100
//
// Only changed files are redone, so running it again after adding a few cards is quick.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';
import { CARDS } from '../cards.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const SRC = path.join(root, 'art'), OUT = path.join(root, 'art-web');
const WIDTH = Number(process.env.ART_WIDTH || 500), QUALITY = Number(process.env.ART_QUALITY || 80);

const CARD_BACK = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 250 350"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4c3f7a"/><stop offset="1" stop-color="#2b2542"/></linearGradient></defs><rect width="250" height="350" rx="14" fill="url(#g)"/><rect x="12" y="12" width="226" height="326" rx="8" fill="none" stroke="#a78bfa" stroke-width="3"/><circle cx="125" cy="175" r="54" fill="none" stroke="#a78bfa" stroke-width="3"/><text x="125" y="188" font-family="Arial,sans-serif" font-size="38" font-weight="700" text-anchor="middle" fill="#c4b5fd">OP</text></svg>\n`;

if (!fs.existsSync(SRC)) { console.error(`No ${SRC} folder: put your card art there first.`); process.exit(1); }
fs.mkdirSync(OUT, { recursive: true });

// Art paths in cards.js look like art/gen1/Name.png (or art/Name.png in the old flat layout).
const files = [...new Set(CARDS.filter((c) => c.art).map((c) => c.art.replace(/^art\//, '').split('/').map(decodeURIComponent).join('/')))].sort();
const walk = (dir, rel = '') => fs.existsSync(dir) ? fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => d.isDirectory() ? walk(path.join(dir, d.name), rel + d.name + '/') : [rel + d.name]) : [];
let done = 0, skipped = 0, missing = 0, before = 0, after = 0;
const perFolder = {};
for (const name of files) {
  let srcName = name;
  if (!fs.existsSync(path.join(SRC, srcName)) && name.includes('/')) srcName = path.posix.basename(name); // still in the old flat folder
  const src = path.join(SRC, srcName), dest = path.join(OUT, name.replace(/\.(png|jpe?g)$/i, '') + '.webp');
  if (!fs.existsSync(src)) { missing++; console.log('missing art file:', name); continue; }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const folder = name.includes('/') ? name.split('/')[0] : '(flat)';
  perFolder[folder] = (perFolder[folder] || 0) + 1;
  const s = fs.statSync(src);
  before += s.size;
  if (fs.existsSync(dest) && fs.statSync(dest).mtimeMs >= s.mtimeMs) { skipped++; after += fs.statSync(dest).size; continue; }
  await sharp(src).resize({ width: WIDTH, withoutEnlargement: true }).webp({ quality: QUALITY, alphaQuality: 90, effort: 5 }).toFile(dest);
  after += fs.statSync(dest).size; done++;
}
const back = fs.existsSync(path.join(SRC, 'card-back.svg')) ? path.join(SRC, 'card-back.svg') : null;
if (back) fs.copyFileSync(back, path.join(OUT, 'card-back.svg')); else fs.writeFileSync(path.join(OUT, 'card-back.svg'), CARD_BACK);

const mb = (n) => (n / 1e6).toFixed(1) + ' MB';
console.log(`${files.length} art files used by cards: ${done} converted, ${skipped} unchanged, ${missing} missing.`);
console.log(`Size: ${mb(before)} -> ${mb(after)} in public/art-web (${files.length ? Math.round((after / before) * 100) : 0}% of the original).`);
console.log('By folder:', Object.entries(perFolder).map(([k, v]) => `${k} ${v}`).join(', ') || 'none');
console.log(`Art in public/art that no card uses is simply not included (${Math.max(0, walk(SRC).length - files.length)} files).`);
