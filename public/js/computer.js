// computer.js — VS COMPUTER mode. The human is always side 'w' (moves
// first); the computer is always side 'b', picking its moves with
// ai.js's minimax + alpha-beta search. Everything runs in this tab —
// no server involvement at all.

import { createInitialState, applyMove, getGameStatus } from './rules.js';
import { chooseComputerMove } from './ai.js';
import { BoardView } from './boardview.js';
import { renderTurnIndicators, setActiveTurn, statusText, setStatusMessage } from './ui.js';
import { recordCapture, resetMaterial, renderMaterial } from './material.js';

const HUMAN_COLOR = 'w';
const COMPUTER_COLOR = 'b';
const SEARCH_DEPTH = 2;

function startComputerGame(countries) {
  const boardEl = document.getElementById('board');
  document.getElementById('online-panel').hidden = true;
  document.getElementById('online-resign-btn').hidden = true;

  let state = createInitialState();
  let computerThinking = false;
  resetMaterial();
  renderMaterial(countries);
  renderTurnIndicators(countries);

  const view = new BoardView(boardEl, {
    onMove: (move) => handleHumanMove(move),
    onAfterRender: (s, status) => afterRender(s, status),
  });
  view.setCountries(countries);
  view.setState(state);
  setActiveTurn(state.turn);
  view.setInteractive(HUMAN_COLOR);

  function handleHumanMove(move) {
    if (move.captured) recordCapture(move.color, move.captured, countries);
    state = applyMove(state, move);
    view.setState(state, move);
  }

  function afterRender(s, status) {
    setActiveTurn(s.turn);
    renderMaterial(countries);

    if (status === 'checkmate' || status === 'stalemate') {
      setStatusMessage(statusText(status, s.turn, countries));
      view.setInteractive(null);
      return;
    }

    if (s.turn === COMPUTER_COLOR && !computerThinking) {
      setStatusMessage(statusText(status, s.turn, countries) || 'The computer is thinking…');
      view.setInteractive(null);
      computerThinking = true;
      const startedAt = performance.now();
      // A brief setTimeout(0) lets the browser repaint (show "thinking…")
      // before running the synchronous search.
      setTimeout(() => {
        const move = chooseComputerMove(state, SEARCH_DEPTH);
        const elapsedMs = performance.now() - startedAt;
        if (elapsedMs > 2000) {
          // Should never happen at depth 2 with a material-only
          // evaluation, but the brief requires this guarantee, so it's
          // checked and logged rather than silently assumed.
          console.warn(`Computer move took ${elapsedMs.toFixed(0)}ms, over the 2s budget.`);
        }
        if (move.captured) recordCapture(move.color, move.captured, countries);
        state = applyMove(state, move);
        computerThinking = false;
        view.setState(state, move);
      }, 250);
    } else {
      setStatusMessage(statusText(status, s.turn, countries));
      view.setInteractive(s.turn === HUMAN_COLOR ? HUMAN_COLOR : null);
    }
  }

  function newGame() {
    state = createInitialState();
    computerThinking = false;
    resetMaterial();
    view.setState(state);
    setActiveTurn(state.turn);
    setStatusMessage('');
    view.setInteractive(HUMAN_COLOR);
  }

  function teardown() {
    view.setInteractive(null);
  }

  return { newGame, teardown };
}

export { startComputerGame };
