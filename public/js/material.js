// material.js — the optional extra, built last per the brief: captured
// pieces + a running material-point count, shown in every mode. Each
// mode controller (hotseat.js, computer.js, online.js) calls these same
// three functions; that's why they already existed as no-op hooks
// during earlier phases (see FEATUREROADMAP_workplan.md, Phase 6).

import { PIECE_VALUES } from './rules.js';
import { pieceMarkup, countryById } from './art.js';

const STANDARD_VALUES = PIECE_VALUES; // pawn 1, knight/bishop 3, rook 5, queen 9, king 0

let captured = { w: [], b: [] }; // captured.w = the pieces White has captured (i.e. Black's pieces)

function resetMaterial() {
  captured = { w: [], b: [] };
}

/** Call with the color that DID the capturing and the piece TYPE that
 * was captured (exactly what move.color / move.captured already give
 * every mode controller after applying a move). */
function recordCapture(byColor, capturedPieceType) {
  if (!capturedPieceType) return;
  captured[byColor].push(capturedPieceType);
}

function materialValue(color) {
  return captured[color].reduce((sum, type) => sum + (STANDARD_VALUES[type] || 0), 0);
}

function renderMaterial(countries) {
  const panel = document.getElementById('material-panel');
  if (!panel) return;
  panel.innerHTML = '';

  const totals = { w: materialValue('w'), b: materialValue('b') };

  for (const color of ['w', 'b']) {
    const opponent = color === 'w' ? 'b' : 'w';
    const opponentCountryId = countries[opponent] || 'france';
    const ownCountry = countryById(countries[color] || 'france');

    const row = document.createElement('div');
    row.className = 'material-row';

    const label = document.createElement('span');
    label.className = 'material-label';
    label.textContent = `${ownCountry.name} captured`;
    row.appendChild(label);

    const icons = document.createElement('span');
    icons.className = 'material-icons';
    if (captured[color].length === 0) {
      icons.innerHTML = '<span class="material-none">—</span>';
    } else {
      for (const type of captured[color]) {
        icons.insertAdjacentHTML('beforeend', pieceMarkup(type, opponentCountryId));
      }
    }
    row.appendChild(icons);

    const diff = totals[color] - totals[opponent];
    if (diff > 0) {
      const adv = document.createElement('span');
      adv.className = 'material-advantage';
      adv.textContent = `+${diff}`;
      row.appendChild(adv);
    }

    panel.appendChild(row);
  }
}

export { resetMaterial, recordCapture, renderMaterial };
