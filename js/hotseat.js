// hotseat.js — HOT-SEAT mode: two people, one screen, taking turns.
// Fully client-side; the only "server" is rules.js running in this tab.

import { createInitialState, applyMove, getGameStatus } from './rules.js';
import { BoardView } from './boardview.js';
import { renderTurnIndicators, setActiveTurn, statusText, setStatusMessage } from './ui.js';
import { recordCapture, resetMaterial, renderMaterial } from './material.js';

function startHotSeat(countries) {
  const boardEl = document.getElementById('board');
  document.getElementById('online-panel').hidden = true;
  document.getElementById('online-resign-btn').hidden = true;

  let state = createInitialState();
  resetMaterial();
  renderMaterial(countries);
  renderTurnIndicators(countries);

  const view = new BoardView(boardEl, {
    onMove: (move) => handleMove(move),
    onAfterRender: (s, status) => afterRender(s, status),
  });
  view.setCountries(countries);
  view.setState(state);
  setActiveTurn(state.turn);
  view.setInteractive(state.turn);

  function handleMove(move) {
    if (move.captured) recordCapture(move.color, move.captured, countries);
    state = applyMove(state, move);
    view.setState(state, move);
  }

  function afterRender(s, status) {
    setActiveTurn(s.turn);
    setStatusMessage(statusText(status, s.turn, countries));
    renderMaterial(countries);
    view.setInteractive(status === 'checkmate' || status === 'stalemate' ? null : s.turn);
  }

  function newGame() {
    state = createInitialState();
    resetMaterial();
    view.setState(state);
    setActiveTurn(state.turn);
    setStatusMessage('');
    view.setInteractive(state.turn);
  }

  function teardown() {
    view.setInteractive(null);
  }

  return { newGame, teardown };
}

export { startHotSeat };
