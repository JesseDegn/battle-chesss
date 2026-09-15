// Correctness gate for rules.js. This is the FIRST test that must pass
// before any UI or game-mode code gets built on top of the rules engine
// (see FEATUREROADMAP_workplan.md, item 1.5).
//
// "Perft" (performance test / move-path test) counts every possible
// sequence of legal moves N moves deep from a position. From the normal
// chess starting position, the correct counts are well known:
//   depth 1 = 20 legal moves
//   depth 2 = 400 legal move sequences
//   depth 3 = 8,902 legal move sequences
// If our from-scratch rules engine gets any rule wrong (an illegal move
// allowed, a legal move missed, castling/en passant/promotion handled
// incorrectly), these counts will not match — that's what makes this a
// strong correctness check rather than just "the app doesn't crash".

import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState, perft } from '../public/js/rules.js';

test('perft depth 1 from the start position is 20', () => {
  assert.equal(perft(createInitialState(), 1), 20);
});

test('perft depth 2 from the start position is 400', () => {
  assert.equal(perft(createInitialState(), 2), 400);
});

test('perft depth 3 from the start position is 8902', () => {
  assert.equal(perft(createInitialState(), 3), 8902);
});
