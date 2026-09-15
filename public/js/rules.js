// rules.js — THE chess rules engine. Written from scratch, no external
// chess library. This exact file is used by every part of the app:
// hot-seat mode, the vs-computer AI, and the online server (Durable
// Object). There is only one rulebook; everyone imports it.
//
// Board representation
// ---------------------
// `board` is an 8x8 array of arrays: board[row][col].
//   row 0 = rank 1 (White's home rank), row 7 = rank 8 (Black's home rank)
//   col 0 = file a, col 7 = file h
// A square is either `null` (empty) or a piece object: { type, color }
//   type:  'p' | 'n' | 'b' | 'r' | 'q' | 'k'
//   color: 'w' | 'b'
//
// Game state
// ----------
// A `state` object is everything needed to know what moves are legal
// right now and to keep playing from here:
//   {
//     board,
//     turn: 'w' | 'b',                     // side to move
//     castling: { wK, wQ, bK, bQ },        // castling rights still available
//     enPassant: { row, col } | null,      // square a pawn could capture onto en passant, this move only
//     fullmoveNumber: number,
//     lastMove: move | null                // for UI animation / highlighting, not used by the rules themselves
//   }
//
// A `move` object:
//   {
//     from: { row, col }, to: { row, col },
//     piece: 'p'|'n'|'b'|'r'|'q'|'k', color: 'w'|'b',
//     captured: 'p'|'n'|'b'|'r'|'q'|'k'|null,
//     promotion: 'q'|'r'|'b'|'n'|null,
//     isEnPassant: boolean,
//     castle: 'K'|'Q'|null                 // kingside / queenside castle
//   }

const PIECE_VALUES = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

function createInitialBoard() {
  const back = ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'];
  const board = Array.from({ length: 8 }, () => Array(8).fill(null));
  for (let col = 0; col < 8; col++) {
    board[0][col] = { type: back[col], color: 'w' };
    board[1][col] = { type: 'p', color: 'w' };
    board[6][col] = { type: 'p', color: 'b' };
    board[7][col] = { type: back[col], color: 'b' };
  }
  return board;
}

function createInitialState() {
  return {
    board: createInitialBoard(),
    turn: 'w',
    castling: { wK: true, wQ: true, bK: true, bQ: true },
    enPassant: null,
    fullmoveNumber: 1,
    lastMove: null,
  };
}

function cloneBoard(board) {
  return board.map((row) => row.map((sq) => (sq ? { ...sq } : null)));
}

function cloneState(state) {
  return {
    board: cloneBoard(state.board),
    turn: state.turn,
    castling: { ...state.castling },
    enPassant: state.enPassant ? { ...state.enPassant } : null,
    fullmoveNumber: state.fullmoveNumber,
    lastMove: state.lastMove ? { ...state.lastMove } : null,
  };
}

function inBounds(row, col) {
  return row >= 0 && row < 8 && col >= 0 && col < 8;
}

function opponent(color) {
  return color === 'w' ? 'b' : 'w';
}

function findKing(board, color) {
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const sq = board[row][col];
      if (sq && sq.type === 'k' && sq.color === color) return { row, col };
    }
  }
  return null; // should never happen in a valid game
}

const KNIGHT_OFFSETS = [
  [-2, -1], [-2, 1], [-1, -2], [-1, 2],
  [1, -2], [1, 2], [2, -1], [2, 1],
];
const KING_OFFSETS = [
  [-1, -1], [-1, 0], [-1, 1],
  [0, -1], [0, 1],
  [1, -1], [1, 0], [1, 1],
];
const BISHOP_DIRS = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
const ROOK_DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1]];

/** Is `(row,col)` attacked by any piece of `byColor`? Used for check
 * detection and for verifying castling doesn't move a king through
 * or into check. */
function isSquareAttacked(board, row, col, byColor) {
  // Pawns: a pawn of byColor attacks diagonally "forward" from its own
  // perspective, so we look one rank *behind* (from the target square's
  // point of view) in both files.
  const pawnRow = byColor === 'w' ? row - 1 : row + 1;
  for (const dc of [-1, 1]) {
    const c = col + dc;
    if (inBounds(pawnRow, c)) {
      const sq = board[pawnRow][c];
      if (sq && sq.type === 'p' && sq.color === byColor) return true;
    }
  }

  for (const [dr, dc] of KNIGHT_OFFSETS) {
    const r = row + dr, c = col + dc;
    if (inBounds(r, c)) {
      const sq = board[r][c];
      if (sq && sq.type === 'n' && sq.color === byColor) return true;
    }
  }

  for (const [dr, dc] of KING_OFFSETS) {
    const r = row + dr, c = col + dc;
    if (inBounds(r, c)) {
      const sq = board[r][c];
      if (sq && sq.type === 'k' && sq.color === byColor) return true;
    }
  }

  for (const [dr, dc] of BISHOP_DIRS) {
    let r = row + dr, c = col + dc;
    while (inBounds(r, c)) {
      const sq = board[r][c];
      if (sq) {
        if (sq.color === byColor && (sq.type === 'b' || sq.type === 'q')) return true;
        break;
      }
      r += dr; c += dc;
    }
  }

  for (const [dr, dc] of ROOK_DIRS) {
    let r = row + dr, c = col + dc;
    while (inBounds(r, c)) {
      const sq = board[r][c];
      if (sq) {
        if (sq.color === byColor && (sq.type === 'r' || sq.type === 'q')) return true;
        break;
      }
      r += dr; c += dc;
    }
  }

  return false;
}

function isInCheck(state, color) {
  const kingPos = findKing(state.board, color);
  if (!kingPos) return false;
  return isSquareAttacked(state.board, kingPos.row, kingPos.col, opponent(color));
}

const PROMOTION_PIECES = ['q', 'r', 'b', 'n'];

/** Pseudo-legal moves for the piece at (row,col): correctly shaped for
 * that piece type and blocked by other pieces, but NOT yet filtered for
 * "does this leave my own king in check". Castling is included here but
 * fully self-verified (rights, empty squares, king not in/through/into
 * check) since the generic post-move check filter only verifies the
 * king's *final* square, not the square it passes through. */
function pseudoMovesForSquare(state, row, col) {
  const { board } = state;
  const piece = board[row][col];
  if (!piece) return [];
  const moves = [];
  const color = piece.color;

  const addMove = (toRow, toCol, extra = {}) => {
    const target = board[toRow][toCol];
    moves.push({
      from: { row, col },
      to: { row: toRow, col: toCol },
      piece: piece.type,
      color,
      captured: target ? target.type : null,
      promotion: null,
      isEnPassant: false,
      castle: null,
      ...extra,
    });
  };

  if (piece.type === 'p') {
    const dir = color === 'w' ? 1 : -1;
    const startRow = color === 'w' ? 1 : 6;
    const promotionRow = color === 'w' ? 7 : 0;

    const pushRow = row + dir;
    if (inBounds(pushRow, col) && !board[pushRow][col]) {
      if (pushRow === promotionRow) {
        for (const promo of PROMOTION_PIECES) addMove(pushRow, col, { promotion: promo });
      } else {
        addMove(pushRow, col);
        const doubleRow = row + 2 * dir;
        if (row === startRow && !board[doubleRow][col]) {
          addMove(doubleRow, col);
        }
      }
    }

    for (const dc of [-1, 1]) {
      const c = col + dc;
      if (!inBounds(pushRow, c)) continue;
      const target = board[pushRow][c];
      if (target && target.color !== color) {
        if (pushRow === promotionRow) {
          for (const promo of PROMOTION_PIECES) addMove(pushRow, c, { promotion: promo });
        } else {
          addMove(pushRow, c);
        }
      } else if (
        !target &&
        state.enPassant &&
        state.enPassant.row === pushRow &&
        state.enPassant.col === c
      ) {
        addMove(pushRow, c, { isEnPassant: true, captured: 'p' });
      }
    }
  } else if (piece.type === 'n') {
    for (const [dr, dc] of KNIGHT_OFFSETS) {
      const r = row + dr, c = col + dc;
      if (!inBounds(r, c)) continue;
      const target = board[r][c];
      if (!target || target.color !== color) addMove(r, c);
    }
  } else if (piece.type === 'k') {
    for (const [dr, dc] of KING_OFFSETS) {
      const r = row + dr, c = col + dc;
      if (!inBounds(r, c)) continue;
      const target = board[r][c];
      if (!target || target.color !== color) addMove(r, c);
    }
    addCastlingMoves(state, row, col, color, addMove);
  } else {
    const dirs =
      piece.type === 'b' ? BISHOP_DIRS : piece.type === 'r' ? ROOK_DIRS : [...BISHOP_DIRS, ...ROOK_DIRS];
    for (const [dr, dc] of dirs) {
      let r = row + dr, c = col + dc;
      while (inBounds(r, c)) {
        const target = board[r][c];
        if (!target) {
          addMove(r, c);
        } else {
          if (target.color !== color) addMove(r, c);
          break;
        }
        r += dr; c += dc;
      }
    }
  }

  return moves;
}

function addCastlingMoves(state, row, col, color, addMove) {
  const { board, castling } = state;
  const homeRow = color === 'w' ? 0 : 7;
  if (row !== homeRow || col !== 4) return; // king must be on its original square
  if (isSquareAttacked(board, row, col, opponent(color))) return; // can't castle out of check

  const kingsideRight = color === 'w' ? castling.wK : castling.bK;
  if (kingsideRight && !board[homeRow][5] && !board[homeRow][6]) {
    const rook = board[homeRow][7];
    if (
      rook && rook.type === 'r' && rook.color === color &&
      !isSquareAttacked(board, homeRow, 5, opponent(color)) &&
      !isSquareAttacked(board, homeRow, 6, opponent(color))
    ) {
      addMove(homeRow, 6, { castle: 'K' });
    }
  }

  const queensideRight = color === 'w' ? castling.wQ : castling.bQ;
  if (queensideRight && !board[homeRow][3] && !board[homeRow][2] && !board[homeRow][1]) {
    const rook = board[homeRow][0];
    if (
      rook && rook.type === 'r' && rook.color === color &&
      !isSquareAttacked(board, homeRow, 3, opponent(color)) &&
      !isSquareAttacked(board, homeRow, 2, opponent(color))
    ) {
      addMove(homeRow, 2, { castle: 'Q' });
    }
  }
}

function generatePseudoMoves(state, color) {
  const moves = [];
  const { board } = state;
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const sq = board[row][col];
      if (sq && sq.color === color) {
        moves.push(...pseudoMovesForSquare(state, row, col));
      }
    }
  }
  return moves;
}

/** Apply `move` to `state` and return a brand-new state. Does not check
 * legality — callers must only pass moves that came from
 * generateLegalMoves (or a matching hand-picked promotion variant). */
function applyMove(state, move) {
  const next = cloneState(state);
  const { board } = next;
  const piece = board[move.from.row][move.from.col];

  board[move.from.row][move.from.col] = null;

  if (move.isEnPassant) {
    // The captured pawn is NOT on the destination square — it's on the
    // same row as the moving pawn's origin, same column as destination.
    board[move.from.row][move.to.col] = null;
  }

  board[move.to.row][move.to.col] = {
    type: move.promotion || piece.type,
    color: piece.color,
  };

  if (move.castle === 'K') {
    const homeRow = piece.color === 'w' ? 0 : 7;
    board[homeRow][5] = board[homeRow][7];
    board[homeRow][7] = null;
  } else if (move.castle === 'Q') {
    const homeRow = piece.color === 'w' ? 0 : 7;
    board[homeRow][3] = board[homeRow][0];
    board[homeRow][0] = null;
  }

  // Update castling rights: king moves lose both; a rook moving off (or
  // being captured on) its original square loses that side's right.
  if (piece.type === 'k') {
    if (piece.color === 'w') { next.castling.wK = false; next.castling.wQ = false; }
    else { next.castling.bK = false; next.castling.bQ = false; }
  }
  const clearRookRight = (row, col) => {
    if (row === 0 && col === 0) next.castling.wQ = false;
    else if (row === 0 && col === 7) next.castling.wK = false;
    else if (row === 7 && col === 0) next.castling.bQ = false;
    else if (row === 7 && col === 7) next.castling.bK = false;
  };
  clearRookRight(move.from.row, move.from.col);
  clearRookRight(move.to.row, move.to.col);

  // En passant target: set only right after a pawn's double step.
  if (piece.type === 'p' && Math.abs(move.to.row - move.from.row) === 2) {
    next.enPassant = { row: (move.to.row + move.from.row) / 2, col: move.from.col };
  } else {
    next.enPassant = null;
  }

  if (piece.color === 'b') next.fullmoveNumber += 1;
  next.turn = opponent(piece.color);
  next.lastMove = move;

  return next;
}

/** All fully legal moves for the side to move (or for `color` if given —
 * useful for "what could the opponent do" checks). Filters out any
 * pseudo-legal move that leaves the mover's own king in check. */
function generateLegalMoves(state, color = state.turn) {
  const pseudo = generatePseudoMoves(state, color);
  const legal = [];
  for (const move of pseudo) {
    const result = applyMove(state, move);
    if (!isInCheck(result, color)) legal.push(move);
  }
  return legal;
}

function legalMovesForSquare(state, row, col) {
  const piece = state.board[row][col];
  if (!piece || piece.color !== state.turn) return [];
  return generateLegalMoves(state, state.turn).filter(
    (m) => m.from.row === row && m.from.col === col
  );
}

/** 'checkmate' | 'stalemate' | 'check' | 'in-progress' */
function getGameStatus(state) {
  const legal = generateLegalMoves(state);
  const check = isInCheck(state, state.turn);
  if (legal.length === 0) return check ? 'checkmate' : 'stalemate';
  return check ? 'check' : 'in-progress';
}

/** Move-count test used to verify this engine is correct. */
function perft(state, depth) {
  if (depth === 0) return 1;
  const moves = generateLegalMoves(state);
  if (depth === 1) return moves.length;
  let count = 0;
  for (const move of moves) {
    count += perft(applyMove(state, move), depth - 1);
  }
  return count;
}

export {
  PIECE_VALUES,
  createInitialBoard,
  createInitialState,
  cloneBoard,
  cloneState,
  opponent,
  findKing,
  isSquareAttacked,
  isInCheck,
  generatePseudoMoves,
  generateLegalMoves,
  legalMovesForSquare,
  applyMove,
  getGameStatus,
  perft,
};
