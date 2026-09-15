// Dedicated correctness tests for the rules that the perft test (depth
// 1-3 from the starting position) is too shallow to actually exercise:
// castling requires at least 3 of the SAME side's moves to set up
// (clear a knight, clear a bishop, then castle), en passant requires a
// pawn to have already reached the fifth rank, and promotion requires a
// pawn to have marched the whole board — none of which can happen
// within perft's first 3 ply. This file builds hand-picked positions
// directly instead, per FEATUREROADMAP_workplan.md item 7.1.

import test from 'node:test';
import assert from 'node:assert/strict';
import { generateLegalMoves, applyMove, isInCheck, getGameStatus } from '../public/js/rules.js';

function emptyBoard() {
  return Array.from({ length: 8 }, () => Array(8).fill(null));
}

function baseState(overrides = {}) {
  return {
    board: emptyBoard(),
    turn: 'w',
    castling: { wK: false, wQ: false, bK: false, bQ: false },
    enPassant: null,
    fullmoveNumber: 1,
    lastMove: null,
    ...overrides,
  };
}

function findMove(moves, fromRow, fromCol, toRow, toCol, promotion = null) {
  return moves.find(
    (m) =>
      m.from.row === fromRow &&
      m.from.col === fromCol &&
      m.to.row === toRow &&
      m.to.col === toCol &&
      (m.promotion || null) === promotion
  );
}

// ---------- Castling ----------

test('kingside castling is legal with clear path and full rights', () => {
  const board = emptyBoard();
  board[0][4] = { type: 'k', color: 'w' };
  board[0][7] = { type: 'r', color: 'w' };
  board[7][4] = { type: 'k', color: 'b' };
  const state = baseState({ board, castling: { wK: true, wQ: false, bK: false, bQ: false } });

  const moves = generateLegalMoves(state, 'w');
  const castleMove = findMove(moves, 0, 4, 0, 6);
  assert.ok(castleMove, 'kingside castle should be offered');
  assert.equal(castleMove.castle, 'K');

  const next = applyMove(state, castleMove);
  assert.deepEqual(next.board[0][6], { type: 'k', color: 'w' });
  assert.deepEqual(next.board[0][5], { type: 'r', color: 'w' });
  assert.equal(next.board[0][7], null);
  assert.equal(next.board[0][4], null);
});

test('castling is illegal while the king is currently in check', () => {
  const board = emptyBoard();
  board[0][4] = { type: 'k', color: 'w' };
  board[0][7] = { type: 'r', color: 'w' };
  board[7][4] = { type: 'r', color: 'b' }; // checks the white king down the e-file
  const state = baseState({ board, castling: { wK: true, wQ: false, bK: false, bQ: false } });

  assert.equal(isInCheck(state, 'w'), true);
  const moves = generateLegalMoves(state, 'w');
  assert.equal(findMove(moves, 0, 4, 0, 6), undefined, 'cannot castle out of check');
});

test('castling is illegal if the king would pass through an attacked square', () => {
  const board = emptyBoard();
  board[0][4] = { type: 'k', color: 'w' };
  board[0][7] = { type: 'r', color: 'w' };
  board[7][5] = { type: 'r', color: 'b' }; // attacks f1, the square the king passes through
  const state = baseState({ board, castling: { wK: true, wQ: false, bK: false, bQ: false } });

  const moves = generateLegalMoves(state, 'w');
  assert.equal(findMove(moves, 0, 4, 0, 6), undefined, 'cannot castle through an attacked square');
});

test('castling is illegal once the rights flag is already false (rook/king already moved)', () => {
  const board = emptyBoard();
  board[0][4] = { type: 'k', color: 'w' };
  board[0][7] = { type: 'r', color: 'w' };
  const state = baseState({ board, castling: { wK: false, wQ: false, bK: false, bQ: false } });

  const moves = generateLegalMoves(state, 'w');
  assert.equal(findMove(moves, 0, 4, 0, 6), undefined);
});

test('queenside castling moves the a-rook to d1 and king to c1', () => {
  const board = emptyBoard();
  board[0][4] = { type: 'k', color: 'w' };
  board[0][0] = { type: 'r', color: 'w' };
  board[7][4] = { type: 'k', color: 'b' };
  const state = baseState({ board, castling: { wK: false, wQ: true, bK: false, bQ: false } });

  const moves = generateLegalMoves(state, 'w');
  const castleMove = findMove(moves, 0, 4, 0, 2);
  assert.ok(castleMove);
  assert.equal(castleMove.castle, 'Q');

  const next = applyMove(state, castleMove);
  assert.deepEqual(next.board[0][2], { type: 'k', color: 'w' });
  assert.deepEqual(next.board[0][3], { type: 'r', color: 'w' });
});

// ---------- En passant ----------

test('en passant capture is legal immediately after the double pawn step', () => {
  const board = emptyBoard();
  board[0][4] = { type: 'k', color: 'w' };
  board[7][4] = { type: 'k', color: 'b' };
  board[4][3] = { type: 'p', color: 'w' }; // white pawn on d5
  board[6][4] = { type: 'p', color: 'b' }; // black pawn on e7, about to double-step to e5

  let state = baseState({ board, turn: 'b' });
  const blackMoves = generateLegalMoves(state, 'b');
  const doubleStep = findMove(blackMoves, 6, 4, 4, 4);
  assert.ok(doubleStep, 'black double pawn step should be legal');
  state = applyMove(state, doubleStep);

  assert.deepEqual(state.enPassant, { row: 5, col: 4 });

  const whiteMoves = generateLegalMoves(state, 'w');
  const epCapture = findMove(whiteMoves, 4, 3, 5, 4);
  assert.ok(epCapture, 'en passant capture should be offered right after the double step');
  assert.equal(epCapture.isEnPassant, true);

  const afterCapture = applyMove(state, epCapture);
  assert.deepEqual(afterCapture.board[5][4], { type: 'p', color: 'w' }); // capturing pawn lands on e6
  assert.equal(afterCapture.board[4][4], null, 'the captured black pawn (still on e5) is removed');
});

test('en passant is no longer legal one move later', () => {
  const board = emptyBoard();
  board[0][4] = { type: 'k', color: 'w' };
  board[7][4] = { type: 'k', color: 'b' };
  board[4][3] = { type: 'p', color: 'w' };
  board[6][4] = { type: 'p', color: 'b' };

  let state = baseState({ board, turn: 'b' });
  state = applyMove(state, findMove(generateLegalMoves(state, 'b'), 6, 4, 4, 4)); // ...e5
  // White plays something unrelated instead of capturing en passant right away.
  state = applyMove(state, findMove(generateLegalMoves(state, 'w'), 0, 4, 1, 4)); // Ke1-e2... wait, that's occupied by nothing, fine: king can't move to e2 if own pawn absent; use a neutral king shuffle
  // Black makes any move, e.g. shuffling its king.
  const blackShuffle = generateLegalMoves(state, 'b')[0];
  state = applyMove(state, blackShuffle);

  const whiteMoves = generateLegalMoves(state, 'w');
  assert.equal(findMove(whiteMoves, 4, 3, 5, 4), undefined, 'en passant window has closed');
});

// ---------- Promotion ----------

test('a pawn reaching the last rank offers all four promotion choices, each producing the right piece', () => {
  const board = emptyBoard();
  board[0][4] = { type: 'k', color: 'w' };
  board[7][4] = { type: 'k', color: 'b' };
  board[6][0] = { type: 'p', color: 'w' }; // one step from promoting on a8

  const state = baseState({ board });
  const moves = generateLegalMoves(state, 'w');
  const promotionMoves = moves.filter((m) => m.from.row === 6 && m.from.col === 0);
  const choices = promotionMoves.map((m) => m.promotion).sort();
  assert.deepEqual(choices, ['b', 'n', 'q', 'r']);

  for (const promo of ['q', 'r', 'b', 'n']) {
    const move = findMove(moves, 6, 0, 7, 0, promo);
    const next = applyMove(state, move);
    assert.deepEqual(next.board[7][0], { type: promo, color: 'w' });
  }
});

// ---------- Checkmate / stalemate on known positions ----------

test('recognizes a known stalemate position (no legal moves, not in check)', () => {
  // Classic stalemate: Black king on a8, White king on c7, White queen on b6.
  // Black to move, not in check, but has no legal move.
  const board = emptyBoard();
  board[7][0] = { type: 'k', color: 'b' }; // a8
  board[6][2] = { type: 'k', color: 'w' }; // c7
  board[5][1] = { type: 'q', color: 'w' }; // b6
  const state = baseState({ board, turn: 'b' });

  assert.equal(isInCheck(state, 'b'), false);
  assert.equal(getGameStatus(state), 'stalemate');
});

test('recognizes checkmate (back-rank mate)', () => {
  const board = emptyBoard();
  board[7][6] = { type: 'k', color: 'b' }; // g8
  board[6][5] = { type: 'p', color: 'b' }; // f7 (blocks the king's own escape)
  board[6][6] = { type: 'p', color: 'b' }; // g7
  board[6][7] = { type: 'p', color: 'b' }; // h7
  board[0][0] = { type: 'r', color: 'w' }; // rook about to deliver mate on the back rank
  board[0][4] = { type: 'k', color: 'w' };
  const state = baseState({ board, turn: 'w' });

  const moves = generateLegalMoves(state, 'w');
  const mateMove = findMove(moves, 0, 0, 7, 0); // Ra1-a8#
  assert.ok(mateMove);
  const next = applyMove(state, mateMove);
  assert.equal(getGameStatus(next), 'checkmate');
});
