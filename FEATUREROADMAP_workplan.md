# Feature Roadmap / Work Plan — Battle Chess

Every item is a checkbox. Order matters: items are listed in the order they must be built, because later items depend on earlier ones. Each item names the file(s) it touches and its definition of done (DoD) — the exact condition that makes it checkable.

## Phase 0 — Project setup

- [x] **0.1 Initialize the GitHub repository and push an initial commit**
  Files: whole repo.
  Depends on: nothing.
  DoD: repo `chess-battle-jesse-degn` exists with a first commit containing only the project skeleton (`package.json`, `.gitignore`) — no game code yet.

- [x] **0.2 Write README.md, ProductSpec.md, FEATUREROADMAP_workplan.md**
  Files: `README.md`, `ProductSpec.md`, `FEATUREROADMAP_workplan.md`.
  Depends on: 0.1.
  DoD: all three docs committed before any file under `src/` or `public/js/` (other than this plan) exists.

## Phase 1 — Rules engine (must be correct before anything is built on top of it)

- [x] **1.1 Board representation + piece movement (no legality filtering yet)**
  Files: `src/rules.js`.
  Depends on: 0.2.
  DoD: a function that, given a board and a square, returns every *pseudo-legal* move for the piece there (i.e. moves correctly shaped for that piece type, ignoring whether it leaves your own king in check) for all six piece types.

- [x] **1.2 Check detection + legal-move filtering**
  Files: `src/rules.js`.
  Depends on: 1.1.
  DoD: pseudo-legal moves that would leave the moving side's own king in check are excluded; "is square X attacked by side Y" is a reusable function.

- [x] **1.3 Special moves: castling, en passant, promotion**
  Files: `src/rules.js`.
  Depends on: 1.2.
  DoD: castling obeys all four preconditions (neither piece moved, empty squares between, king not in/through/into check); en passant is only legal the move immediately after the double pawn step; promotion returns a choice of piece rather than defaulting.

- [x] **1.4 Game-end detection: checkmate, stalemate**
  Files: `src/rules.js`.
  Depends on: 1.3.
  DoD: a function reports `checkmate`, `stalemate`, `check`, or `in-progress` for any given position.

- [x] **1.5 Perft test — the gate for everything downstream**
  Files: `test/perft.test.js`, `package.json` (test script).
  Depends on: 1.4.
  DoD: `npm test` reports depth 1 = 20, depth 2 = 400, depth 3 = 8,902 legal move sequences from the starting position. **No UI or mode code is written until this passes.**

## Phase 2 — Look and feel foundation

- [x] **2.1 Country list + flag color palettes**
  Files: `public/js/art.js`.
  Depends on: nothing (can happen in parallel with Phase 1).
  DoD: a data table of countries, each with a primary/secondary/accent color extracted from its flag, usable to recolor a piece.

- [x] **2.2 Procedural SVG piece set (armored war theme)**
  Files: `public/js/art.js`, `public/css/pieces.css`.
  Depends on: 2.1.
  DoD: all six piece types render as recognizable armored figures (see ProductSpec §4) at any of the country palettes, at board scale, on both light and dark board squares.

- [x] **2.3 Grass board styling**
  Files: `public/css/board.css`.
  Depends on: nothing.
  DoD: the 8×8 grid still has two clearly distinguishable square colors (legal-move highlighting must remain visible on both), styled/textured to read as grass.

- [x] **2.4 Selection, move, and capture animations**
  Files: `public/css/animations.css`, `public/js/art.js`.
  Depends on: 2.2, 2.3.
  DoD: clicking a movable piece triggers its "ready" animation and highlights legal destination squares; completing a move animates the piece sliding to its destination; a capture plays a piece-appropriate "defeat" animation on the captured piece before removal. All animations complete in well under 1 second and never block move legality/logic.

## Phase 3 — HOT-SEAT mode (first playable, first deployable milestone)

- [x] **3.1 Static page shell + mode picker**
  Files: `public/index.html`, `public/js/main.js`, `public/css/layout.css`.
  Depends on: 1.5, 2.4.
  DoD: loading the page shows a picker for the three modes; choosing HOT-SEAT shows the country pickers for both sides.

- [x] **3.2 Hot-seat game loop**
  Files: `public/js/hotseat.js`.
  Depends on: 3.1.
  DoD: full legal game playable start to finish by two people at one screen: turn alternation, legal-move-only interaction, check/checkmate/stalemate end states shown, castling/en passant/promotion all reachable and correct, illegal moves impossible to input.

- [x] **3.3 Cloudflare Workers scaffold + deploy**
  Files: `wrangler.jsonc`, `src/worker.js` (static-serving only at this point).
  Depends on: 3.2.
  DoD: `wrangler.jsonc` configured for the Workers Free plan with `assets` pointing at `public/`, `not_found_handling: "single-page-application"`, `compatibility_date` set to build date, `observability` enabled; `npm run deploy` (run by the project owner, who holds the Cloudflare login) publishes a working hot-seat game reachable over the internet. **This is the "hot-seat live on the internet" milestone the brief calls out as the first deliverable.**
  Status note: the build sandbox can't install `wrangler` or reach Cloudflare's API, so this config is written correctly against current docs and JSON-validated, but not yet run through a live `wrangler dev`/`deploy`. The project owner should run `npm install && npm run dev` first after cloning to confirm it, before deploying.

## Phase 4 — VS COMPUTER mode

- [x] **4.1 Static position evaluation function**
  Files: `public/js/ai.js`.
  Depends on: 1.5.
  DoD: given a board, returns a numeric score (material count is enough) from the perspective of the side to move.

- [x] **4.2 Minimax with alpha-beta pruning, depth 2**
  Files: `public/js/ai.js`.
  Depends on: 4.1.
  DoD: given any legal position, returns a legal move; searches 2 ply deep with alpha-beta cutoffs; runs entirely in the browser (no network call).

- [x] **4.3 VS COMPUTER mode controller + timing guarantee**
  Verified with `test/ai.test.js`: 15 full random-legal games, every AI-chosen move checked against the legal move list and timed; 349 moves checked, slowest 95ms (budget is 2000ms).
  Files: `public/js/computer.js`, `public/js/main.js` (picker wiring).
  Depends on: 4.2, 3.2 (reuses the hot-seat board/interaction code).
  DoD: human plays one side, computer replies automatically on its turn; computer's reply is always returned within 2 seconds (measured, with a hard fallback if search runs long); full rules apply identically to hot-seat (same `rules.js`).

## Phase 5 — ONLINE mode

- [x] **5.1 Durable Object room class**
  Files: `src/room.js`, `wrangler.jsonc` (`durable_objects` binding, `new_sqlite_classes`).
  Depends on: 1.5.
  DoD: a `Room` Durable Object that holds one game's board state in its own SQLite storage, addressed by room code via `env.ROOM.getByName(roomCode)`.

- [x] **5.2 WebSocket accept + seat assignment**
  Files: `src/room.js`, `src/worker.js` (upgrade handling on `/ws`).
  Depends on: 5.1.
  DoD: `ctx.acceptWebSocket()` used (not the `ws` package); first connecting client is assigned side A (White), second is side B (Black), further clients are spectators; seat is stored via `ws.serializeAttachment()` so it survives hibernation.

- [x] **5.3 Server-authoritative move validation**
  Files: `src/room.js` (imports `src/rules.js`).
  Depends on: 5.2, 1.5.
  DoD: every move message is validated against `rules.js` server-side before the position changes; illegal move attempts are rejected and do not change state; the resulting position (and check/checkmate/stalemate status) is broadcast as JSON (`{type, payload}`) to every connected client in the room.

- [x] **5.4 Persistence, refresh-rejoin, New Game reset**
  Files: `src/room.js`.
  Depends on: 5.3.
  DoD: position is written to the Durable Object's SQLite storage after every move (no timers/intervals involved anywhere); reconnecting with the same room code restores the same seat and the current position; a "New Game" message resets the board for both connected players at once.

- [x] **5.5 ONLINE mode client**
  Files: `public/js/online.js`.
  Depends on: 5.4, 3.2 (reuses board/interaction code).
  DoD: entering a room code connects over WebSocket, shows "waiting for opponent" until two seats are filled, plays a full legal game with moves appearing live on both screens, refresh reconnects into the same seat, New Game works for both sides.
  Verified two ways: (1) `test/room.test.js` runs the real, unmodified `src/room.js` against faithful fakes of the Cloudflare Durable Object runtime (WebSocketPair, `ctx.storage.sql`, `ctx.acceptWebSocket`/`getWebSockets`) -- join/seat-assignment, legal move + broadcast, spectator rejection, refresh-rejoin, and New Game all pass. (2) A from-scratch, dependency-free WebSocket server (test scaffolding only, not shipped) served the real app and bridged real browser WebSocket connections to that same real `room.js`; two independent headless-browser sessions joined the same room code, played synced moves live, reached checkmate on both screens simultaneously, refreshed and rejoined the same seat with the position intact, and New Game reset both boards together.

## Phase 6 — Optional extra (built last)

- [x] **6.1 Captured pieces + material count**
  Verified in hot-seat (headless-browser capture sequence showing the correct +1 advantage and captured-piece icon) and in online mode (advantage synced identically on both players' screens after a capture, and correctly cleared to empty on both screens after New Game).
  Files: `public/js/material.js`, `public/css/material.css`, small hooks into `hotseat.js` / `computer.js` / `online.js`.
  Depends on: 3.2, 4.3, 5.5 (all three modes working).
  DoD: each side's captured pieces are displayed next to the board, and a running material-point differential (standard values: pawn 1, knight/bishop 3, rook 5, queen 9) is shown and updates immediately after every capture, in all three modes.

## Phase 7 — Verification

- [x] **7.1 Rules edge-case pass**
  DoD: manually/automatically exercise castling (both sides, both directions, each precondition failure), en passant (including the one-move-only window), underpromotion, checkmate, and stalemate, in addition to the perft test.
  Done in `test/edgecases.test.js` (10 tests, all passing): kingside + queenside castling, castling refused while in check / through an attacked square / after rights are lost, en passant legal the instant after a double step and illegal one move later, all four promotion choices producing the correct piece, a known stalemate position, and a known checkmate position. (Perft depth 1-3 alone can't reach any of these -- they need at least 3-4 of one side's own moves to set up, which is more plies than perft(3) has room for.)

- [x] **7.2 Illegal-move-impossible check**
  DoD: confirm there is no UI interaction path in any mode that produces an illegal board state.
  BoardView (`public/js/boardview.js`) only ever highlights and accepts squares returned by `legalMovesForSquare`, which comes straight from `rules.js`; a click anywhere else is a no-op or a reselect. Online mode additionally has the server re-validate every move server-side regardless of what the client sent (see `tryApplyMove` in `src/roomLogic.js`, covered by its own tests) -- so even a hypothetically-compromised or buggy client can't force an illegal position into a room.

- [x] **7.3 Online resilience check**
  DoD: confirm refresh-rejoin and New Game behave correctly with two real browser sessions, and that the Durable Object correctly resumes a hibernated room.
  Covered in Phase 5's verification: two real headless-browser sessions playing live over real WebSocket connections to the real `room.js`, including an actual page refresh mid-game that rejoined the same seat with the position intact, and a New Game that reset both screens together. "Resuming a hibernated room" specifically (the Durable Object being unloaded and reloaded from SQLite mid-game) could not be forced from outside a real Cloudflare deployment in this sandbox -- `test/room.test.js` verifies the SQLite read/write path itself is correct (every `loadRoom()` reconstructs full state from the same storage `saveRoom()` just wrote, which is exactly what a hibernate-then-wake cycle exercises), but the actual Cloudflare-triggered hibernation event is not simulated.

- [x] **7.4 Computer timing check**
  DoD: confirm the computer's reply time stays under 2 seconds across a sample of mid-game positions.
  `test/ai.test.js`: 349 AI-chosen moves checked across 15 full random-legal games, every one legal, slowest response 95ms against the 2000ms budget.

## Git process for this plan

Every checkbox above is committed separately (task complete → commit → push), in the order listed, never force-pushed. Pull requests are opened once a phase is complete and passing its own DoD.
