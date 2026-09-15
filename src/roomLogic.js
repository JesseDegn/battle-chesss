// roomLogic.js — the pure, server-authoritative game-room rules for
// ONLINE mode: seat assignment, move validation, and reset. Deliberately
// has NO Cloudflare-specific imports (no 'cloudflare:workers', no
// WebSocket/storage APIs) so it can be unit-tested with plain Node, the
// same way rules.js is. room.js (the actual Durable Object) is a thin
// wrapper around these functions that adds the SQLite persistence and
// WebSocket plumbing.
//
// A "room" object looks like:
//   {
//     state,                          // a rules.js game state
//     seats: { w: playerId|null, b: playerId|null },
//     countries: { w: countryId|null, b: countryId|null },
//   }
// `playerId` is a random ID the CLIENT generates once and keeps in its
// own browser storage — that's what makes "refresh rejoins the same
// seat" work: the server doesn't care about WebSocket connections
// staying alive, only about which player ID owns which seat.

import { createInitialState, generateLegalMoves, applyMove } from '../public/js/rules.js';

function createEmptyRoom() {
  return {
    state: createInitialState(),
    seats: { w: null, b: null },
    countries: { w: null, b: null },
  };
}

function serializeRoom(room) {
  return JSON.stringify(room);
}

function deserializeRoom(json) {
  if (!json) return createEmptyRoom();
  return JSON.parse(json);
}

/** First person to show up with a given playerId claims side 'w'
 * (moves first). Second distinct playerId claims 'b'. The SAME
 * playerId reconnecting (e.g. after a page refresh) always gets its
 * existing seat back. Anyone else is a spectator. Returns a new room
 * object (never mutates the one passed in) and the seat assigned. */
function assignSeat(room, playerId, countryId) {
  if (room.seats.w === playerId) return { room, seat: 'w' };
  if (room.seats.b === playerId) return { room, seat: 'b' };

  if (!room.seats.w) {
    const next = {
      ...room,
      seats: { ...room.seats, w: playerId },
      countries: { ...room.countries, w: countryId },
    };
    return { room: next, seat: 'w' };
  }

  if (!room.seats.b) {
    const next = {
      ...room,
      seats: { ...room.seats, b: playerId },
      countries: { ...room.countries, b: countryId },
    };
    return { room: next, seat: 'b' };
  }

  return { room, seat: 'spectator' };
}

/** Validates a move request against the CURRENT server-side position —
 * this is what "the server decides every move" means. A spectator, a
 * move out of turn, or a move that doesn't exactly match one of the
 * actually-legal moves (same from/to/promotion) is rejected without
 * changing anything. */
function tryApplyMove(room, seat, movePayload) {
  if (seat !== 'w' && seat !== 'b') {
    return { ok: false, reason: 'Spectators cannot move pieces.' };
  }
  if (!movePayload || !movePayload.from || !movePayload.to) {
    return { ok: false, reason: 'Malformed move.' };
  }
  if (room.state.turn !== seat) {
    return { ok: false, reason: 'It is not your turn.' };
  }

  const legalMoves = generateLegalMoves(room.state);
  const match = legalMoves.find(
    (m) =>
      m.from.row === movePayload.from.row &&
      m.from.col === movePayload.from.col &&
      m.to.row === movePayload.to.row &&
      m.to.col === movePayload.to.col &&
      (m.promotion || null) === (movePayload.promotion || null)
  );

  if (!match) {
    return { ok: false, reason: 'That move is not legal.' };
  }

  const nextState = applyMove(room.state, match);
  return { ok: true, room: { ...room, state: nextState }, move: match };
}

/** Resets the board for both players; seats and chosen countries are
 * untouched, only the game itself restarts. Either seated player may
 * call this — it affects both. */
function resetGame(room) {
  return { ...room, state: createInitialState() };
}

export { createEmptyRoom, serializeRoom, deserializeRoom, assignSeat, tryApplyMove, resetGame };
