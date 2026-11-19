# Putting Oshi Push online

The game is one small Node program. It serves the web pages, the card art and the live multiplayer connection from a
single address, so any host that can run Node (or Docker) works. These steps use **Render** (it has a free plan and
supports the live connection the game needs). Other hosts are covered at the end.

## 1. Get the card art ready (once, and again whenever the art changes)

Your full-size art (`public/art`, about 480 MB) is far too big to upload, and most of it is not used by any card.

    npm install
    npm run optimize-art

This writes small copies of the art your cards use into `public/art-web` (about 10 MB for all 169 images) and a card back
image. The full-size `public/art` folder stays on your computer only; `.gitignore` keeps it out of Git.
Run it again after adding cards or changing art (it only redoes what changed).

**One art folder per generation.** Keep each generation's art in its own folder: `public/art/gen1`, `public/art/gen2`, and so on.
The small copies are written to the same layout (`public/art-web/gen1`, `gen2`, ...), and the card back stays loose in
`public/art-web`. If your art is still loose in `public/art`, run `npm run organize-art` once (it moves it into `gen1`),
then `npm run cards`. For Gen 2: put its art in `public/art/gen2`, run `npm run cards`, then `npm run optimize-art`. Gen 1 and Gen 2 are both
imported by default; to add Gen 3 later, add it to `DEFAULT_SETS` in `scripts/import-cards.js` (or run
`npm run cards -- --sets=Gen1,Gen2,Gen3`). When it runs, `npm run cards` prints how many cards of each set have art. A card's folder comes from its Set column ("Gen 2" uses `gen2`).

## 2. Check it works on your computer

    npm start

Open http://localhost:8000, create a match, and open the invite link in a private window to play both sides.

## 3. Put the project on GitHub

Install Git and make a free GitHub account, create an empty repository there, then in the project folder:

    git init
    git add .
    git commit -m "Oshi Push"
    git branch -M main
    git remote add origin https://github.com/YOUR-NAME/oshi-push.git
    git push -u origin main

Check on GitHub that `public/art-web` is there (with `gen1`, `gen2`, ... inside) and `public/art` is not.
Open `/art-status` on your site to see how many images arrived in each folder.

## 4. Deploy on Render

1. Make a free account at render.com and connect your GitHub.
2. **New +  >  Blueprint**, choose your repository. Render reads `render.yaml` and fills everything in. Click **Apply**.
   (Prefer clicking through by hand? **New + > Web Service**, build command `npm ci --include=dev && npm run build`,
   start command `node server.js`, health check path `/healthz`.)
3. Wait a few minutes for the first build. You get an address like `https://oshi-push.onrender.com`.
4. Open it, press **Create match**, and send the invite link to your opponent. That is all: the invite link already
   contains the public address.

To update the live game later: change things, `git add . && git commit -m "..." && git push`. Render redeploys by itself.
After `npm run cards` (new cards) also run `npm run optimize-art` before you commit.

## Things you should know

- **Free plan sleeps.** After about 15 minutes with nobody connected the free service stops; the next visit takes
  30 to 60 seconds to wake it. Matches are kept in memory, so **unfinished matches are lost when it sleeps or redeploys.**
  Fine for casual games with friends. For something people rely on, use a paid plan with a disk (see `render.yaml`) and
  set `FLATFILE_DIR` so matches are saved and survive restarts (this was tested: a match in progress survives a restart).
- **One server only.** Matches live inside the running server, so do not scale it to several copies.
- **The link is the key.** There are no accounts. Anyone who has your match link (`?match=...&player=0`) can sit in that
  seat and see that player's hand. Do not show the address bar on stream, and only send each player their own link.
- **Decks are saved in each player's own browser** (not on the server), so a player keeps their decks on the same
  device and browser only.
- The Sandbox button is available to everyone (it only affects their own test match).
- **Play against the bot.** The start screen has a **Play against the bot** button, and a match waiting for an opponent
  shows **Play against the bot instead** next to the invite link. The bot runs inside your server (`bot.js`), uses a
  random deck and plays by simple rules, so it is a fair practice opponent rather than an expert. It leaves when its
  human has been gone 30 minutes, and bots do not survive a server restart (neither do matches on the free plan).
  If you use `FLATFILE_DIR`, a restored match will not get its bot back: just press the button again.
- Old matches are deleted after 48 hours without activity; at most 2000 matches exist at once and one visitor can
  create 20 per minute. Change these with the settings below.

## Settings (environment variables, all optional)

| Setting | What it does | Default |
|---|---|---|
| `PORT` | Port to listen on (hosts set this for you) | 8000 |
| `FLATFILE_DIR` | Folder to save matches in so they survive restarts (needs a persistent disk) | memory only |
| `MATCH_TTL_HOURS` | Delete matches untouched for this long | 48 |
| `MAX_MATCHES` | Most matches that can exist at once | 2000 |
| `CREATE_PER_MINUTE` | Matches one visitor may create per minute | 20 |
| `MAX_BOTS` | Most bots that can be playing at once | 50 |
| `BOT_PER_MINUTE` | Bots one visitor may add per minute | 10 |
| `ORIGIN` | Extra web addresses allowed to use the game API (only if the pages are hosted on a different address than the server) | none |

## Other hosts

The included `Dockerfile` runs the game anywhere Docker does:

    docker build -t oshi-push .
    docker run -p 8000:8000 -v oshi-data:/data -e FLATFILE_DIR=/data oshi-push

- **Fly.io / Railway:** both can deploy straight from the Dockerfile or the GitHub repo (`fly launch`, or "Deploy from
  GitHub" on Railway). Use one machine only. They also offer small persistent volumes for `FLATFILE_DIR`.
- **Your own server (VPS):** run the Docker command above behind a web server that provides https (Caddy is the
  simplest: `yourdomain.com { reverse_proxy localhost:8000 }`). Websockets must be allowed through (Caddy does this by default).

## If something goes wrong

- *Pages load but cards have no pictures:* `public/art-web` was not committed. Run `npm run optimize-art`, then `git add public/art-web` and push.
- *"Create match" does nothing / game never connects:* open the browser console (F12). A blocked connection usually means the page and the
  server are on different addresses; set `ORIGIN` to the page's address.
- *First visit is slow:* the free plan was asleep (see above).
- Server logs are in the Render dashboard under **Logs**.
