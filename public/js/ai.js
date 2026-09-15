// ai.js — the VS COMPUTER opponent. Runs entirely in the browser (no
// network call, no server involvement) and always returns a legal move
// within 2 seconds.
//
// It uses minimax search with alpha-beta pruning at a fixed depth of 2
// ply (see ProductSpec.md §2.2 for what "2 ply" means). Implemented as
// "negamax", a compact way to write minimax: instead of separately
// coding "maximize for me" and "minimize for you", every recursive call
// just returns a score from the CURRENT side-to-move's own point of
// view, and each level flips the sign of what it got back from the
// level below (because a good outcome for your opponent is, by
// definition, a bad outcome for you). This is mathematically identical
// to classic minimax, just less code to get right.

import { generateLegalMoves, applyMove, getGameStatus, PIECE_VALUES } from './rules.js';

const CHECKMATE_SCORE = 100000;
const TIME_BUDGET_MS = 1500; // well under the 2-second requirement, leaving headroom

/** Material-only evaluation, from `color`'s point of view: positive
 * means `color` is ahead on points, negative means behind. Good enough
 * for a depth-2 opponent -- there's no time budget here for anything
 * fancier like piece-square tables. */
function evaluate(state, color) {
  let score = 0;
  for (const row of state.board) {
    for (const sq of row) {
      if (!sq) continue;
      const value = PIECE_VALUES[sq.type];
      score += sq.color === color ? value : -value;
    }
  }
  return score;
}

/** Returns a score from the perspective of `state.turn` (the side about
 * to move in this position). `depth` is how many more ply to search. */
function negamax(state, depth, alpha, beta, deadline) {
  const status = getGameStatus(state);
  if (status === 'checkmate') return -CHECKMATE_SCORE - depth; // being mated is bad; sooner is worse
  if (status === 'stalemate') return 0;
  if (depth === 0) return evaluate(state, state.turn);

  const moves = generateLegalMoves(state);
  let best = -Infinity;
  for (const move of moves) {
    const next = applyMove(state, move);
    const score = -negamax(next, depth - 1, -beta, -alpha, deadline);
    if (score > best) best = score;
    if (best > alpha) alpha = best;
    if (alpha >= beta) break; // alpha-beta cutoff: this branch can't improve the outcome, stop exploring it
    if (Date.now() > deadline) break; // safety valve, see chooseComputerMove
  }
  return best;
}

/** Picks a legal move for the side to move in `state`. Returns null only
 * if there are no legal moves at all (checkmate/stalemate — callers
 * should check getGameStatus before calling this). */
function chooseComputerMove(state, depth = 2) {
  const moves = generateLegalMoves(state);
  if (moves.length === 0) return null;

  const deadline = Date.now() + TIME_BUDGET_MS;
  let bestMove = moves[0]; // always have a legal fallback, even if the deadline hits immediately
  let bestScore = -Infinity;
  let alpha = -Infinity;
  const beta = Infinity;

  for (const move of moves) {
    const next = applyMove(state, move);
    const score = -negamax(next, depth - 1, -beta, -alpha, deadline);
    if (score > bestScore) {
      bestScore = score;
      bestMove = move;
    }
    if (score > alpha) alpha = score;
    if (Date.now() > deadline) break;
  }

  return bestMove;
}

export { chooseComputerMove, evaluate };
