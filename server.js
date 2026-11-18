// Oshi Push game server: serves the web pages, the card art and the multiplayer game (boardgame.io) from ONE address,
// so the browser's page and its game connection always share an origin. Works locally (npm start) and online (see DEPLOY.md).
//
// Settings (all optional, set as environment variables):
//   PORT              port to listen on (hosts like Render/Railway/Fly set this for you). Default 8000
//   ORIGIN            extra web addresses allowed to use the game API, comma separated (only needed for a custom domain on another host)
//   FLATFILE_DIR      folder where matches are saved so they survive a restart (needs a persistent disk). Default: kept in memory only
//   MATCH_TTL_HOURS   delete matches nobody has touched for this many hours. Default 48
//   MAX_MATCHES       refuse to create new matches above this many at once. Default 2000
//   CREATE_PER_MINUTE how many matches one visitor (IP address) may create per minute. Default 20
//   MAX_BOTS          how many computer opponents may be playing at once. Default 50
//   BOT_PER_MINUTE    how many bots one visitor (IP address) may add per minute. Default 10
import { Server, Origins } from 'boardgame.io/dist/cjs/server.js';
import serve from 'koa-static';
import send from 'koa-send';
import compress from 'koa-compress';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { OshiPush } from './game.js';
import { startBot, hasBot, botCount, stopBotsFor, stopOldBots } from './bot.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(__dirname, 'public');
const ART = path.join(PUBLIC, 'art');          // your full-size art (not uploaded when hosting)
const ART_WEB = path.join(PUBLIC, 'art-web');  // small WebP versions made by `npm run optimize-art`
const num = (v, d) => (Number.isFinite(Number(v)) && v !== undefined && v !== '' ? Number(v) : d);
const PORT = num(process.env.PORT, 8000);
const TTL_MS = num(process.env.MATCH_TTL_HOURS, 48) * 3600 * 1000;
const MAX_MATCHES = num(process.env.MAX_MATCHES, 2000);
const CREATE_PER_MINUTE = num(process.env.CREATE_PER_MINUTE, 20);
const MAX_BOTS = num(process.env.MAX_BOTS, 50);
const BOT_PER_MINUTE = num(process.env.BOT_PER_MINUTE, 10);

// Addresses allowed to talk to the game API. Local play is always allowed; hosts tell us their public address themselves.
const publicUrls = [
  process.env.RENDER_EXTERNAL_URL,
  process.env.RAILWAY_PUBLIC_DOMAIN && `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`,
  process.env.FLY_APP_NAME && `https://${process.env.FLY_APP_NAME}.fly.dev`,
  ...(process.env.ORIGIN || '').split(','),
].map((s) => (s || '').trim().replace(/\/$/, '')).filter(Boolean);

const server = Server({
  games: [OshiPush],
  origins: [Origins.LOCALHOST, ...publicUrls],
  // With FLATFILE_DIR set, boardgame.io saves matches to that folder; otherwise they live in memory (lost on restart).
});
const app = server.app;
app.proxy = true; // the host's proxy tells us the visitor's real IP address and that the connection is https

// ---------- basic safety headers ----------
app.use(async (ctx, next) => {
  await next();
  ctx.set('X-Content-Type-Options', 'nosniff');
  ctx.set('Referrer-Policy', 'same-origin');
});

// ---------- health check (hosts use this to know the game is up) ----------
app.use(async (ctx, next) => {
  if (ctx.path === '/healthz') { ctx.body = 'ok'; return; }
  return next();
});

// ---------- keep strangers from filling the server with matches ----------
const creates = new Map(); // ip -> timestamps of recent match creations
app.use(async (ctx, next) => {
  if (ctx.method === 'POST' && /^\/games\/[^/]+\/create\/?$/.test(ctx.path)) {
    const now = Date.now(), recent = (creates.get(ctx.ip) || []).filter((t) => now - t < 60000);
    if (recent.length >= CREATE_PER_MINUTE) { ctx.status = 429; ctx.body = 'Too many matches created. Please wait a minute.'; return; }
    const ids = await server.db.listMatches({ gameName: 'oshi-push' });
    if (ids.length >= MAX_MATCHES) { ctx.status = 503; ctx.body = 'The server is full right now. Please try again later.'; return; }
    recent.push(now); creates.set(ctx.ip, recent);
  }
  return next();
});
setInterval(() => { const now = Date.now(); for (const [ip, ts] of creates) if (!ts.some((t) => now - t < 60000)) creates.delete(ip); }, 60000).unref();

// ---------- computer opponent ----------
// POST /bot/add?matchID=...&seat=0|1 puts the bot in an empty seat of a match. The bot is a headless game client running
// inside this server (see bot.js); it connects to this same server like a browser would.
const botAdds = new Map(); // ip -> timestamps of recent requests
const refuse = (ctx, status, message) => { ctx.status = status; ctx.body = message; };
app.use(async (ctx, next) => {
  if (ctx.path !== '/bot/add') return next();
  if (ctx.method !== 'POST') return refuse(ctx, 405, 'Use POST.');
  const now = Date.now(), recent = (botAdds.get(ctx.ip) || []).filter((t) => now - t < 60000);
  if (recent.length >= BOT_PER_MINUTE) return refuse(ctx, 429, 'Too many requests. Please wait a minute.');
  recent.push(now); botAdds.set(ctx.ip, recent);
  const matchID = String(ctx.query.matchID || ''), seat = String(ctx.query.seat || '');
  if (!/^[\w-]{1,64}$/.test(matchID) || !['0', '1'].includes(seat)) return refuse(ctx, 400, 'Bad request.');
  const { metadata, state } = await server.db.fetch(matchID, { metadata: true, state: true });
  if (!metadata || metadata.gameName !== 'oshi-push') return refuse(ctx, 404, 'That match does not exist (it may have expired).');
  if (metadata.setupData?.sandbox) return refuse(ctx, 400, 'A sandbox match does not need a bot.');
  if (state?.ctx?.gameover) return refuse(ctx, 409, 'That match is already over.');
  if (metadata.players?.[seat]?.isConnected || hasBot(matchID, seat)) return refuse(ctx, 409, 'Someone is already in that seat.');
  if (botCount() >= MAX_BOTS) return refuse(ctx, 503, 'The bots are all busy right now. Please try again in a few minutes.');
  metadata.players[seat].name = 'Bot'; // shown to the human as the opponent's name
  await server.db.setMetadata(matchID, metadata);
  startBot({ matchID, seat, serverUrl: `http://127.0.0.1:${PORT}` });
  ctx.body = { ok: true };
});
setInterval(() => { const now = Date.now(); for (const [ip, ts] of botAdds) if (!ts.some((t) => now - t < 60000)) botAdds.delete(ip); }, 60000).unref();

// ---------- text compression (pages and scripts; images are already compressed) ----------
app.use(compress({ threshold: 1024, filter: (type) => /text|javascript|json|svg/i.test(type) }));

// ---------- card art ----------
// The page asks for art/<Name>.png. Send the small WebP version when we have one, otherwise the original file.
const SEVEN_DAYS = 7 * 24 * 3600 * 1000;
app.use(async (ctx, next) => {
  if ((ctx.method !== 'GET' && ctx.method !== 'HEAD') || !ctx.path.startsWith('/art/')) return next();
  let name;
  try { name = decodeURIComponent(ctx.path.slice('/art/'.length)); } catch { return next(); }
  if (!name || name !== path.basename(name) || name.includes('\0') || name.includes('\\')) return next(); // no sneaking out of the folder
  const attempts = [[name.replace(/\.(png|jpe?g)$/i, '.webp'), ART_WEB], [name, ART_WEB], [name, ART]];
  for (const [file, root] of attempts) {
    try { await send(ctx, file, { root, maxage: SEVEN_DAYS }); return; }
    catch (e) { if (e.status !== 404 && e.code !== 'ENOENT' && e.code !== 'ENAMETOOLONG') throw e; }
  }
  return next();
});

// ---------- art check: open /art-status on your site to see whether the card art made it onto the server ----------
const artCount = (dir) => { try { return fs.readdirSync(dir).length; } catch { return 0; } };
app.use(async (ctx, next) => {
  if (ctx.path !== '/art-status') return next();
  ctx.body = { artWebFiles: artCount(ART_WEB), fullSizeFiles: artCount(ART), cardBack: fs.existsSync(path.join(ART_WEB, 'card-back.svg')) };
});

// ---------- the pages themselves ----------
// no-cache = the browser checks for a newer version each time, so a new deploy shows up right away.
app.use(serve(PUBLIC, { setHeaders: (res) => res.setHeader('Cache-Control', 'no-cache') }));

// ---------- tidy up old matches ----------
async function cleanUp() {
  try {
    const ids = await server.db.listMatches({ gameName: 'oshi-push' });
    let removed = 0;
    for (const id of ids) {
      const { metadata } = await server.db.fetch(id, { metadata: true });
      const last = metadata && (metadata.updatedAt || metadata.createdAt);
      if (!last || Date.now() - last > TTL_MS) { stopBotsFor(id); await server.db.wipe(id); removed++; }
    }
    stopOldBots(TTL_MS);
    if (removed) console.log(`Removed ${removed} old match(es); ${ids.length - removed} left.`);
  } catch (e) { console.warn('Match clean-up failed:', e.message); }
}

server.run(PORT, () => {
  console.log(`Oshi Push running on port ${PORT} (http://localhost:${PORT})`);
  console.log(process.env.FLATFILE_DIR ? `Saving matches to ${process.env.FLATFILE_DIR}` : 'Matches are kept in memory (they are lost when the server restarts).');
  if (publicUrls.length) console.log('Also allowed:', publicUrls.join(', '));
  const nArt = artCount(ART_WEB);
  console.log(nArt ? `Card art: ${nArt} files in public/art-web.` : 'WARNING: public/art-web is missing or empty, so cards will have no pictures. Run `npm run optimize-art` and commit public/art-web (see DEPLOY.md).');
  cleanUp();
  setInterval(cleanUp, 3600 * 1000).unref();
});

// Shut down cleanly when the host stops or redeploys us.
for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => { console.log(`${sig}: shutting down`); process.exit(0); });
