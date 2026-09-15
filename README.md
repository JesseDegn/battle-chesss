# Battle Chess

By Jesse Degn

Battle Chess is a browser chess game with three ways to play:

1. **HOT-SEAT** — two people share one screen and one keyboard/mouse, taking turns.
2. **VS COMPUTER** — you play against a computer opponent that thinks inside your own browser (no server involved).
3. **ONLINE** — two people on two different devices type the same room code and play live, with the server keeping both sides in sync.

Instead of White and Black, each player picks a **country**. The chess pieces are recolored to that country's flag palette and drawn as armored soldiers, so a game looks like two small armies facing off across a grassy battlefield. Selecting a piece, moving it, and capturing an enemy piece each play a short animation.

This project deliberately uses no chess library and no front-end framework. Every legal-move rule is hand-written once, in `src/rules.js`, and every part of the app (hot-seat, computer, and the online server) calls that same file. The whole thing is plain HTML, CSS, and JavaScript, deployed as a static site plus one small server component on **Cloudflare Workers** (a hosting platform for running that server component close to any of Cloudflare's servers around the world).

## A few terms, defined once

- **Cloudflare Workers**: a place to host code that runs on Cloudflare's servers instead of your own computer. It hosts both the static files (the HTML/CSS/JS your browser downloads) and the small piece of server logic that referees online games.
- **Durable Object**: a Cloudflare feature that gives one small piece of server code its own private, persistent memory — one Durable Object per game room, so each online game has its own referee that remembers the board even if everyone disconnects and comes back.
- **WebSocket**: a live, two-way connection between a browser and a server that stays open, so moves can be pushed to the other player instantly instead of the browser having to keep asking "anything new?"
- **Minimax with alpha-beta pruning**: the algorithm the computer opponent uses to pick a move. It looks a few moves ahead, assuming both sides play their best move at each step ("minimax"), and skips branches that can't possibly change the outcome to search faster ("alpha-beta pruning").
- **Perft test**: a way to check a chess rules engine is correct by counting *every* legal move sequence a fixed number of moves deep from the starting position and comparing it to a known correct number.

## Repository layout

```
public/              Static site: everything the browser downloads directly
  index.html          The single page (mode picker + board)
  css/                Styling: board, pieces, animations, layout
  js/
    rules.js           <-- THE chess rules engine (also used by the server)
    ai.js               Computer opponent (minimax + alpha-beta, depth 2)
    art.js              Procedural SVG piece art + country color palettes
    hotseat.js          HOT-SEAT mode controller
    computer.js         VS COMPUTER mode controller
    online.js           ONLINE mode controller (talks to the Worker over WebSocket)
    main.js             Mode picker / app shell
src/
  worker.js            Cloudflare Worker entry point (serves the site, upgrades /ws)
  room.js              The Durable Object: one game room, one instance, SQLite-backed
  roomLogic.js          The room's rules (seat assignment, move validation, reset) as
                         plain, Cloudflare-free functions -- room.js is a thin wrapper
                         around these that adds SQLite storage and WebSocket plumbing
test/
  perft.test.js        Move-count correctness test for rules.js
  ai.test.js            Legality + timing check for the vs-computer AI
  roomLogic.test.js     Unit tests for the online room's pure rules
  room.test.js          Runs the REAL src/room.js against faithful fakes of the
                         Cloudflare Durable Object runtime (see its own comments)
  helpers/               Test-only stand-ins for Cloudflare-specific runtime pieces
wrangler.jsonc         Cloudflare Workers configuration
ProductSpec.md         What this app is and what "done" means
FEATUREROADMAP_workplan.md   Every feature as a checklist, in build order
```

`public/js/rules.js` and `src/worker.js`'s copy of the rules are **the same file** — the Worker imports it directly, so the server and every browser mode always agree on what's legal. There is exactly one rulebook.

## Running it yourself

You'll need [Node.js](https://nodejs.org) installed (any recent version) and a (free) [Cloudflare account](https://dash.cloudflare.com/sign-up).

```bash
npm install                 # installs wrangler, the Cloudflare Workers command-line tool
npm test                    # runs the perft correctness test on rules.js
npm run dev                 # serves the site locally, hot-seat and vs-computer work fully;
                             # online mode also works locally via wrangler's local Durable Objects
npm run deploy               # publishes to your Cloudflare account (asks you to log in first time)
```

`npm run deploy` runs `wrangler deploy`, which will open a browser tab for you to log into Cloudflare the first time. Nothing about deployment requires touching this repository's code — the same `wrangler.jsonc` config is used every time.

> **Note on how this was built:** the sandbox this project was built in blocks installing `wrangler` and reaching Cloudflare's API directly, so `wrangler.jsonc` and `src/worker.js` were written against Cloudflare's current documentation and validated for correct JSON structure, but never run against a live `wrangler dev`/`wrangler deploy`. The game logic itself (`rules.js`, hot-seat mode, and every mode built after it) *was* verified end-to-end in a real headless browser. The very first thing to do after cloning this repo is `npm install && npm run dev` and confirm the site comes up locally — if anything about the Workers config needs a small fix, that's where it'll show up.

## What "done" means

See `ProductSpec.md` for the full product definition and `FEATUREROADMAP_workplan.md` for the build checklist, in the order it was actually built: hot-seat live first, then the computer opponent, then online rooms, then the captured-pieces/material-count extra.

## Not in scope

No accounts or logins, no clocks, no ratings, no draw-by-repetition or fifty-move-rule detection, no opening books, no move export, no React or any other front-end framework.
