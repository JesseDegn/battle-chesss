// Unit tests for the pure, server-authoritative room rules used by
// ONLINE mode (src/roomLogic.js). This is the part of the online server
// that can be tested with plain Node -- src/room.js itself is a thin
// wrapper around these functions that only adds Cloudflare-specific
// SQLite storage and WebSocket plumbing, which needs a real Workers
// runtime to exercise (see README.md's note on wrangler not being
// available in the build sandbox).

import test from 'node:test';
import assert from 'node:assert/strict';
import { createEmptyRoom, assignSeat, tryApplyMove, resetGame } from '../src/roomLogic.js';

test('first player claims White, second claims Black, third spectates', () => {
  let room = createEmptyRoom();
  const a = assignSeat(room, 'player-A', 'france');
  assert.equal(a.seat, 'w');
  room = a.room;

  const b = assignSeat(room, 'player-B', 'japan');
  assert.equal(b.seat, 'b');
  room = b.room;

  const c = assignSeat(room, 'player-C', 'brazil');
  assert.equal(c.seat, 'spectator');

  assert.equal(room.seats.w, 'player-A');
  assert.equal(room.seats.b, 'player-B');
  assert.equal(room.countries.w, 'france');
  assert.equal(room.countries.b, 'japan');
});

test('the same player ID reconnecting gets its existing seat back (refresh-rejoin)', () => {
  let room = createEmptyRoom();
  room = assignSeat(room, 'player-A', 'france').room;
  room = assignSeat(room, 'player-B', 'japan').room;

  const rejoinA = assignSeat(room, 'player-A', 'ignored-on-rejoin');
  assert.equal(rejoinA.seat, 'w');
  // Re-joining must NOT change the already-locked-in country.
  assert.equal(rejoinA.room.countries.w, 'france');
});

test('a legal move by the correct seat, on their turn, is accepted', () => {
  let room = createEmptyRoom();
  room = assignSeat(room, 'player-A', 'france').room;
  room = assignSeat(room, 'player-B', 'japan').room;

  const result = tryApplyMove(room, 'w', { from: { row: 1, col: 4 }, to: { row: 3, col: 4 } }); // e2-e4
  assert.equal(result.ok, true);
  assert.equal(result.room.state.turn, 'b');
});

test('a move out of turn is rejected and changes nothing', () => {
  let room = createEmptyRoom();
  room = assignSeat(room, 'player-A', 'france').room;
  room = assignSeat(room, 'player-B', 'japan').room;

  const result = tryApplyMove(room, 'b', { from: { row: 6, col: 4 }, to: { row: 4, col: 4 } }); // Black trying to move first
  assert.equal(result.ok, false);
  assert.match(result.reason, /not your turn/i);
});

test('a spectator can never move', () => {
  const room = createEmptyRoom();
  const result = tryApplyMove(room, 'spectator', { from: { row: 1, col: 4 }, to: { row: 3, col: 4 } });
  assert.equal(result.ok, false);
});

test('an illegal move (not in the legal move list) is rejected', () => {
  let room = createEmptyRoom();
  room = assignSeat(room, 'player-A', 'france').room;
  room = assignSeat(room, 'player-B', 'japan').room;

  // Pawn can't jump three squares.
  const result = tryApplyMove(room, 'w', { from: { row: 1, col: 4 }, to: { row: 4, col: 4 } });
  assert.equal(result.ok, false);
  assert.match(result.reason, /not legal/i);
});

test('New Game resets the board but keeps seats and countries', () => {
  let room = createEmptyRoom();
  room = assignSeat(room, 'player-A', 'france').room;
  room = assignSeat(room, 'player-B', 'japan').room;
  room = tryApplyMove(room, 'w', { from: { row: 1, col: 4 }, to: { row: 3, col: 4 } }).room;

  const reset = resetGame(room);
  assert.equal(reset.state.turn, 'w');
  assert.equal(reset.state.board[3][4], null); // e4 pawn is gone, back to start position
  assert.equal(reset.seats.w, 'player-A');
  assert.equal(reset.countries.b, 'japan');
});
