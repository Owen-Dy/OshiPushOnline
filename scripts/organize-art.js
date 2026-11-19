// One-time tidy-up: moves the art files that sit loose in public/art and public/art-web into a folder for one generation.
//   npm run organize-art            moves them into gen1 (everything you have today is Gen 1)
//   npm run organize-art -- gen2    moves them into gen2 instead
// Safe to run twice: files already in a generation folder are left alone, and nothing is overwritten.
// card-back.* stays where it is, because every generation shares the card back.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const gen = (process.argv[2] || 'gen1').toLowerCase();
if (!/^gen\d+$/.test(gen)) { console.error(`"${gen}" is not a generation folder name. Use gen1, gen2, ...`); process.exit(1); }

let total = 0;
for (const dir of ['art', 'art-web']) {
  const from = path.join(root, dir);
  if (!fs.existsSync(from)) { console.log(`public/${dir}: not found, skipped`); continue; }
  const files = fs.readdirSync(from, { withFileTypes: true }).filter((d) => d.isFile() && /\.(png|jpe?g|webp|gif|svg)$/i.test(d.name) && !/^card-back\./i.test(d.name));
  const to = path.join(from, gen);
  fs.mkdirSync(to, { recursive: true });
  let moved = 0, kept = 0;
  for (const f of files) {
    const dest = path.join(to, f.name);
    if (fs.existsSync(dest)) { kept++; continue; }
    fs.renameSync(path.join(from, f.name), dest); moved++;
  }
  total += moved;
  console.log(`public/${dir}: moved ${moved} file${moved === 1 ? '' : 's'} into ${gen}/${kept ? ` (${kept} left alone because they already exist there)` : ''}`);
}
console.log(total ? `\nNow run:  npm run cards   (so the card list points at ${gen}/)   then   npm start` : '\nNothing to move.');
