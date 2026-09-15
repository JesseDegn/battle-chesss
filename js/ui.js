// ui.js — small shared helpers for the side panel (turn indicators,
// status text) so hot-seat, vs-computer, and online don't each
// reimplement the same DOM updates.

import { countryById } from './art.js';

function renderTurnIndicators(countries) {
  for (const color of ['w', 'b']) {
    const el = document.getElementById(`turn-indicator-${color}`);
    if (!el) continue;
    const country = countryById(countries[color]);
    el.querySelector('.swatch-bar').style.background = country.colors.primary;
    el.querySelector('.turn-label').textContent = country.name;
  }
}

function setActiveTurn(turnColor) {
  for (const color of ['w', 'b']) {
    const el = document.getElementById(`turn-indicator-${color}`);
    if (el) el.classList.toggle('active', color === turnColor);
  }
}

function statusText(status, turnColor, countries) {
  const mover = countryById(countries[turnColor]).name;
  const other = countryById(countries[turnColor === 'w' ? 'b' : 'w']).name;
  switch (status) {
    case 'checkmate':
      return `Checkmate — ${other} wins!`;
    case 'stalemate':
      return 'Stalemate — the game is a draw.';
    case 'check':
      return `${mover} is in check!`;
    default:
      return '';
  }
}

function setStatusMessage(text) {
  const el = document.getElementById('status-message');
  if (el) el.textContent = text;
}

export { renderTurnIndicators, setActiveTurn, statusText, setStatusMessage };
