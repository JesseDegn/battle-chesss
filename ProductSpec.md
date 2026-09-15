# Product Spec — Battle Chess

## 1. What this is

A browser chess game, playable in three modes, with a "two armies at war" visual theme instead of a plain tournament board. No accounts, no backend database beyond what each live game room needs to remember its own position.

## 2. The three modes

### 2.1 HOT-SEAT
Two people share one device and one browser tab. They take turns; the app just needs to know whose turn it is and stop the other side from touching the board out of turn. Entirely client-side — no server needed once the page has loaded.

### 2.2 VS COMPUTER
One human plays one side; the browser itself plays the other side, using a minimax search with alpha-beta pruning (see README for what those words mean) at a fixed search depth of **2 ply** (one ply = one side's move; depth 2 means the computer looks at "my move, then your best reply" for every candidate move before picking). Entirely client-side. The computer must always reply with a legal move within **2 seconds**.

### 2.3 ONLINE
Two people on two different devices/browsers type the same short room code. The **server is the referee**: it is the only thing that decides whether a submitted move is legal and updates the shared position. The two browsers are just showing what the server says is true and sending move attempts to it.

- First person to submit that room code becomes **White**.
- Second person becomes **Black**.
- Anyone after that is a **spectator** — sees the game live, can't move pieces.
- If a player's page reloads mid-game, rejoining the same room code puts them back in their same seat (White stays White, Black stays Black) with the current position, because the server — not the browser — is the source of truth and it never forgets.
- A "New Game" action resets the board for **both** players at once (it's a message to the server, not something either browser can do unilaterally).
- No timers of any kind are used to manage this. The server writes the position to its own storage after every single move, so nothing depends on a clock running in the background — if everyone disappears for a day and comes back, the game is exactly where it was left.

## 3. Country selection instead of White/Black

Each player (in every mode) chooses a country from a fixed list before the game starts, instead of being told they are "White" or "Black" internally. Internally the rules engine still tracks two sides — call them side A and side B — because chess rules only care that there are two opposing sides and who moves first; the country is purely a skin (its flag colors and a one-word style label) applied on top of that. The side that would traditionally be "White" (moves first) is decided by: in hot-seat, whoever is assigned side A picks first; in vs-computer, the human is always side A (moves first) and the computer is always side B; in online, whoever's browser first connects to the room and claims a seat is asked to choose a country for side A.

## 4. Look and feel

- **Board**: standard 8×8 alternating-color grid, but the two square colors and the border are styled to look like they're sitting on a grass field (a green ground texture behind/around the board, not just a flat color square).
- **Pieces**: every piece is drawn as an armored soldier appropriate to its role, not a flat silhouette:
  - Pawn → foot soldier / infantry, simple armor and a spear or short sword.
  - Knight → mounted cavalry rider.
  - Bishop → standard-bearer / banner carrier (keeps the traditional tall silhouette, reinterpreted).
  - Rook → a fortified siege tower / watchtower on wheels.
  - Queen → a battlefield commander with a more elaborate helm/cape.
  - King → the king himself, under a raised banner, the most ornamented piece.
  - Each piece is recolored (armor trim, banner colors) using the flag palette of the country the owning player picked, so two games look visually distinct depending on which countries were chosen.
- **Selecting a piece**: clicking a piece you're allowed to move plays a short "ready" animation on that piece (a small flourish appropriate to the piece — e.g. the cavalry rears slightly, the standard-bearer's banner ripples) and brightens every square that piece can legally move to.
- **Moving a piece**: the piece animates smoothly from its origin square to its destination square rather than jumping instantly.
- **Capturing**: when a piece lands on an enemy-occupied square, a brief "defeat" animation plays on the captured piece before it's removed — themed to that piece (e.g. infantry falls, cavalry piece topples, a tower crumbles) — rather than the enemy piece just vanishing.
- All animations are short (under ~600ms) and never block or delay the game logic itself — the move is legal and recorded the instant it's made; the animation is a visual layer on top.

## 5. Definition of "done" (functional)

Full legal chess, identically enforced in every mode, because every mode calls the same `rules.js`:

- All six piece types move and capture correctly.
- Check, checkmate, and stalemate are detected and shown to the players.
- Castling (both kingside and queenside, with all of its normal preconditions: neither piece has moved, no pieces in between, king not in/through/into check).
- En passant capture.
- Pawn promotion, with the player choosing which piece to promote to (not auto-queen).
- **An illegal move must be impossible to make** — the UI only ever offers legal destination squares; there is no path (misclick, drag, etc.) that produces an illegal board state.
- VS COMPUTER always replies with a legal move within 2 seconds.
- ONLINE: server-authoritative moves, correct seat assignment (1st = White/side A, 2nd = Black/side B, rest = spectators), refresh-rejoin, shared New Game reset, no timer-dependent logic, position persisted after every move.

## 6. Explicitly not in scope

Accounts or logins, clocks, ratings, draw by repetition or the fifty-move rule, opening books, move export (e.g. PGN), React or any other front-end framework.

## 7. Technical constraints (non-negotiable, from the brief)

- **Hosting**: Cloudflare Workers, Free plan. Static site served via the `assets` feature in `wrangler.jsonc`; `not_found_handling: "single-page-application"`; `run_worker_first` set for the WebSocket path (`/ws`) so that one request path is handled by our own server code instead of being treated as a static file request. `compatibility_date` set to the date the project was built; `observability` enabled (Cloudflare's built-in logging/metrics).
- **Rules engine**: written from scratch in one module, `src/rules.js` (mirrored into `public/js/rules.js` for the browser — see note in README on how the Worker and browser both use the same source). No chess.js or any other chess/engine library. Verified with a perft test (move-count test) from the starting position: depth 1 = 20 legal moves, depth 2 = 400, depth 3 = 8,902. This test must pass before any UI or game-mode code is built on top of it.
- **Online transport**: no Socket.IO, Express, or the `ws` npm package. One SQLite-backed Durable Object per room, obtained via `env.ROOM.getByName(roomCode)`, declared with `new_sqlite_classes` in `wrangler.jsonc`. Native `WebSocket`s accepted with `ctx.acceptWebSocket()`. All messages are JSON with a `type` and a `payload` field. Player identity (which seat a given WebSocket connection belongs to) is stored via `ws.serializeAttachment()`, which survives Cloudflare hibernating and waking the Durable Object back up. No timers of any kind; the position is saved to the Durable Object's own SQLite storage after every move, not on an interval.

## 8. Build order

Hot-seat live on the internet first (this is the first deployable milestone — a working game a person can actually open in a browser), then the computer opponent, then online rooms, then the optional extra (captured pieces + running material count, shown in every mode). See `FEATUREROADMAP_workplan.md` for the itemized checklist.
