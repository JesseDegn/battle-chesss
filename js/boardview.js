// boardview.js — the shared board renderer + click/animation engine used
// by every mode (hot-seat, vs-computer, online). Keeping this in one
// place means all three modes look and behave identically; each mode
// controller just tells a BoardView what happened and who's allowed to
// click right now.
//
// A BoardView does NOT decide whether a move is legal on its own beyond
// asking rules.js what the legal destinations are for a clicked piece —
// it never invents rules. In hot-seat and vs-computer, the move is
// applied to `rules.js` state locally the instant it's picked. In
// online mode, a picked move is only a *request*: the real board state
// always comes back down from the server (see online.js), which is what
// "the server decides every move" means in practice.

import { legalMovesForSquare, isInCheck, findKing, getGameStatus, opponent } from './rules.js';
import { pieceMarkup, animatePieceMove, triggerSelectFlourish, animateCapture, countryById } from './art.js';

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

class BoardView {
  /**
   * @param {HTMLElement} boardEl - empty container to render the grid into
   * @param {Object} opts
   * @param {(move: object) => void} opts.onMove - called when the local
   *   player completes a legal move selection (promotion already resolved)
   * @param {(state: object, status: string) => void} [opts.onAfterRender]
   */
  constructor(boardEl, opts) {
    this.boardEl = boardEl;
    this.boardEl.classList.add('board');
    this.boardEl.style.position = 'relative';
    this.onMove = opts.onMove;
    this.onAfterRender = opts.onAfterRender || (() => {});
    this.countries = { w: 'france', b: 'japan' };
    this.state = null;
    this.selected = null;
    this.legalFromSelected = [];
    this.interactiveColor = null; // which color, if any, the LOCAL player may move right now

    this.boardEl.addEventListener('click', (e) => this.handleClick(e));
  }

  setCountries(map) {
    this.countries = { ...this.countries, ...map };
  }

  /** Which color the local player is allowed to click-move right now.
   * Pass null to disable all interaction (e.g. waiting on the computer,
   * waiting on an opponent, or spectating online). */
  setInteractive(color) {
    this.interactiveColor = color;
    if (!color) this.clearSelectionVisuals();
  }

  squareEl(row, col) {
    return this.boardEl.querySelector(`[data-row="${row}"][data-col="${col}"]`);
  }

  /** Render (or re-render) the whole board from scratch to match `state`.
   * If `move` is given, plays the move/capture/castle animation first
   * using the OLD DOM, then swaps to the fully-rendered new state so the
   * animation and the final position always agree exactly. */
  setState(state, move) {
    const previousState = this.state;
    this.state = state;
    if (move && previousState) {
      this.animateThenRender(previousState, move, state);
    } else {
      this.fullRender(state);
    }
  }

  fullRender(state) {
    this.boardEl.innerHTML = '';
    this.selected = null;
    this.legalFromSelected = [];

    for (let row = 7; row >= 0; row--) {
      for (let col = 0; col < 8; col++) {
        const sq = document.createElement('div');
        sq.className = `square ${(row + col) % 2 === 0 ? 'dark' : 'light'}`;
        sq.dataset.row = String(row);
        sq.dataset.col = String(col);

        if (col === 0) {
          const rankLabel = document.createElement('span');
          rankLabel.className = 'coord';
          rankLabel.textContent = String(row + 1);
          sq.appendChild(rankLabel);
        } else if (row === 0) {
          const fileLabel = document.createElement('span');
          fileLabel.className = 'coord';
          fileLabel.textContent = FILES[col];
          sq.appendChild(fileLabel);
        }

        const piece = state.board[row][col];
        if (piece) {
          sq.classList.add('occupied');
          sq.insertAdjacentHTML('beforeend', pieceMarkup(piece.type, this.countries[piece.color]));
        }

        if (state.lastMove && this.squareMatchesLastMove(state.lastMove, row, col)) {
          sq.classList.add('last-move');
        }

        this.boardEl.appendChild(sq);
      }
    }

    const status = getGameStatus(state);
    if (status === 'check' || status === 'checkmate') {
      const kingPos = findKing(state.board, state.turn);
      if (kingPos) this.squareEl(kingPos.row, kingPos.col).classList.add('in-check');
    }

    this.onAfterRender(state, status);
  }

  squareMatchesLastMove(lastMove, row, col) {
    return (
      (lastMove.from.row === row && lastMove.from.col === col) ||
      (lastMove.to.row === row && lastMove.to.col === col)
    );
  }

  async animateThenRender(oldState, move, newState) {
    const fromSquare = this.squareEl(move.from.row, move.from.col);
    const toSquare = this.squareEl(move.to.row, move.to.col);
    const promises = [];

    if (move.captured) {
      const capSquare = move.isEnPassant
        ? this.squareEl(move.from.row, move.to.col)
        : toSquare;
      const capEl = capSquare && capSquare.querySelector('.piece');
      if (capEl) promises.push(animateCapture(capEl));
    }

    if (fromSquare) {
      const movingPieceEl = fromSquare.querySelector('.piece');
      if (movingPieceEl) movingPieceEl.style.visibility = 'hidden';
      const clone = this.createFlightClone(move.piece, move.promotion, move.color, fromSquare);
      promises.push(this.flyClone(clone, fromSquare, toSquare));
    }

    if (move.castle) {
      const homeRow = move.color === 'w' ? 0 : 7;
      const rookFromCol = move.castle === 'K' ? 7 : 0;
      const rookToCol = move.castle === 'K' ? 5 : 3;
      const rookFromSq = this.squareEl(homeRow, rookFromCol);
      const rookToSq = this.squareEl(homeRow, rookToCol);
      if (rookFromSq && rookToSq) {
        const rookEl = rookFromSq.querySelector('.piece');
        if (rookEl) rookEl.style.visibility = 'hidden';
        const rookClone = this.createFlightClone('r', null, move.color, rookFromSq);
        promises.push(this.flyClone(rookClone, rookFromSq, rookToSq));
      }
    }

    await Promise.all(promises);
    this.boardEl.querySelectorAll('.piece-flight').forEach((el) => el.remove());
    this.fullRender(newState);
  }

  createFlightClone(type, promotion, color, originSquareEl) {
    const boardRect = this.boardEl.getBoundingClientRect();
    const rect = originSquareEl.getBoundingClientRect();
    const wrap = document.createElement('div');
    wrap.className = 'piece-flight';
    Object.assign(wrap.style, {
      position: 'absolute',
      left: `${rect.left - boardRect.left}px`,
      top: `${rect.top - boardRect.top}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      pointerEvents: 'none',
      zIndex: '20',
    });
    wrap.insertAdjacentHTML('beforeend', pieceMarkup(promotion || type, this.countries[color]));
    this.boardEl.appendChild(wrap);
    return wrap;
  }

  flyClone(clone, fromSquareEl, toSquareEl) {
    if (!clone.animate) return Promise.resolve();
    const fromRect = fromSquareEl.getBoundingClientRect();
    const toRect = toSquareEl.getBoundingClientRect();
    const dx = toRect.left - fromRect.left;
    const dy = toRect.top - fromRect.top;
    return clone
      .animate(
        [{ transform: 'translate(0, 0)' }, { transform: `translate(${dx}px, ${dy}px)` }],
        { duration: 260, easing: 'cubic-bezier(0.3, 0.1, 0.2, 1)', fill: 'forwards' }
      )
      .finished.catch(() => {});
  }

  clearSelectionVisuals() {
    this.boardEl.querySelectorAll('.square.selected').forEach((s) => s.classList.remove('selected'));
    this.boardEl
      .querySelectorAll('.square.legal-move')
      .forEach((s) => s.classList.remove('legal-move', 'legal-empty', 'legal-capture'));
    this.selected = null;
    this.legalFromSelected = [];
  }

  select(row, col) {
    this.clearSelectionVisuals();
    this.selected = { row, col };
    this.legalFromSelected = legalMovesForSquare(this.state, row, col);
    const sq = this.squareEl(row, col);
    sq.classList.add('selected');
    for (const move of this.legalFromSelected) {
      const destSq = this.squareEl(move.to.row, move.to.col);
      destSq.classList.add('legal-move', move.captured || move.isEnPassant ? 'legal-capture' : 'legal-empty');
    }
    const pieceEl = sq.querySelector('.piece');
    if (pieceEl) triggerSelectFlourish(pieceEl);
  }

  handleClick(e) {
    const sq = e.target.closest('.square');
    if (!sq || !this.state || !this.interactiveColor) return;
    const row = Number(sq.dataset.row);
    const col = Number(sq.dataset.col);
    const piece = this.state.board[row][col];

    if (this.selected) {
      const matches = this.legalFromSelected.filter((m) => m.to.row === row && m.to.col === col);
      if (matches.length === 1) {
        this.commitMove(matches[0]);
        return;
      }
      if (matches.length > 1) {
        this.promptPromotion(matches).then((move) => {
          if (move) this.commitMove(move);
        });
        return;
      }
    }

    if (piece && piece.color === this.interactiveColor) {
      this.select(row, col);
    } else {
      this.clearSelectionVisuals();
    }
  }

  commitMove(move) {
    this.clearSelectionVisuals();
    this.onMove(move);
  }

  promptPromotion(matches) {
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      Object.assign(overlay.style, {
        position: 'fixed',
        inset: '0',
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: '50',
      });
      const picker = document.createElement('div');
      picker.className = 'promotion-picker';
      const color = matches[0].color;
      const order = ['q', 'r', 'b', 'n'];
      for (const pieceType of order) {
        const move = matches.find((m) => m.promotion === pieceType);
        if (!move) continue;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.insertAdjacentHTML('beforeend', pieceMarkup(pieceType, this.countries[color]));
        btn.addEventListener('click', () => {
          overlay.remove();
          resolve(move);
        });
        picker.appendChild(btn);
      }
      overlay.appendChild(picker);
      document.body.appendChild(overlay);
    });
  }
}

export { BoardView };
