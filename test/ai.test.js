// Sanity + timing check for the vs-computer AI (ai.js). Plays a batch of
// full random-legal-move games where "black" is always chosen by
// chooseComputerMove, and checks two things every single time the AI is
// asked for a move: (1) the move it returns is actually in the current
// legal move list (never an illegal move), and (2) it never takes
// anywhere near the 2-second budget the brief requires.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState, applyMove, generateLegalMoves, getGameStatus } from '../public/js/rules.js';
import { chooseComputerMove } from '../public/js/ai.js';

function randomLegalMove(state) {
  const moves = generateLegalMoves(state);
  return moves[Math.floor(Math.random() * moves.length)];
}

test('chooseComputerMove always returns a legal move, well under 2 seconds, across many games', () => {
  const GAMES = 15;
  const MAX_PLIES_PER_GAME = 60;
  let maxElapsed = 0;
  let aiMovesChecked = 0;

  for (let g = 0; g < GAMES; g++) {
    let state = createInitialState();
    for (let ply = 0; ply < MAX_PLIES_PER_GAME; ply++) {
      const status = getGameStatus(state);
      if (status === 'checkmate' || status === 'stalemate') break;

      let move;
      if (state.turn === 'b') {
        const legalBefore = generateLegalMoves(state);
        const started = Date.now();
        move = chooseComputerMove(state, 2);
        const elapsed = Date.now() - started;
        maxElapsed = Math.max(maxElapsed, elapsed);
        aiMovesChecked++;

        assert.ok(move, 'AI must return a move when legal moves exist');
        const isLegal = legalBefore.some(
          (m) =>
            m.from.row === move.from.row &&
            m.from.col === move.from.col &&
            m.to.row === move.to.row &&
            m.to.col === move.to.col &&
            m.promotion === move.promotion
        );
        assert.ok(isLegal, `AI returned an illegal move: ${JSON.stringify(move)}`);
        assert.ok(elapsed < 2000, `AI took ${elapsed}ms, over the 2000ms budget`);
      } else {
        move = randomLegalMove(state);
      }

      state = applyMove(state, move);
    }
  }

  console.log(`Checked ${aiMovesChecked} AI-chosen moves across ${GAMES} games; slowest: ${maxElapsed}ms`);
  assert.ok(aiMovesChecked > 0, 'test should have actually exercised the AI at least once');
});
