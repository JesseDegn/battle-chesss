// online.js — ONLINE mode. This file never decides whether a move is
// legal — it only ever sends a move *request* to the server (the Room
// Durable Object, src/room.js) and redraws the board according to
// whatever state the server sends back. That's what "the server decides
// every move" means in practice: even if this code had a bug that let
// you click an illegal destination, the server would simply reject it
// and nothing would change on screen.

import { BoardView } from './boardview.js';
import { renderTurnIndicators, setActiveTurn, statusText, setStatusMessage } from './ui.js';
import { recordCapture, resetMaterial, renderMaterial } from './material.js';

const PLAYER_ID_KEY = 'battle-chess-player-id';

function getOrCreatePlayerId() {
  try {
    let id = localStorage.getItem(PLAYER_ID_KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(PLAYER_ID_KEY, id);
    }
    return id;
  } catch {
    // Private-browsing / storage blocked: still works for this tab, just
    // won't survive a refresh into the same seat.
    return crypto.randomUUID();
  }
}

function startOnlineGame({ myCountry, roomCode }) {
  const boardEl = document.getElementById('board');
  const onlinePanel = document.getElementById('online-panel');
  const roomCodeDisplay = document.getElementById('room-code-display');
  const onlineStatusEl = document.getElementById('online-status');
  const spectatorBadge = document.getElementById('spectator-badge');
  document.getElementById('online-resign-btn').hidden = true; // not in scope for this build

  onlinePanel.hidden = false;
  roomCodeDisplay.textContent = roomCode;
  spectatorBadge.hidden = true;
  resetMaterial();

  const playerId = getOrCreatePlayerId();
  let mySeat = null;
  let countries = { w: null, b: null };
  let socket = null;
  let closedByUs = false;

  const view = new BoardView(boardEl, {
    onMove: (move) => {
      view.setInteractive(null); // don't allow another click while the server hasn't answered yet
      sendMessage({ type: 'move', payload: { from: move.from, to: move.to, promotion: move.promotion } });
    },
    onAfterRender: (state, status) => afterRender(state, status),
  });

  connect();

  function wsUrl() {
    const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
    const params = new URLSearchParams({ room: roomCode, player: playerId, country: myCountry });
    return `${protocol}://${location.host}/ws?${params.toString()}`;
  }

  function connect() {
    onlineStatusEl.textContent = 'Connecting…';
    socket = new WebSocket(wsUrl());

    socket.addEventListener('message', (event) => {
      let msg;
      try {
        msg = JSON.parse(event.data);
      } catch {
        return;
      }
      if (msg.type === 'welcome') {
        mySeat = msg.payload.seat;
        spectatorBadge.hidden = mySeat !== 'spectator';
        applyServerState(msg.payload);
      } else if (msg.type === 'state') {
        applyServerState(msg.payload);
      } else if (msg.type === 'error') {
        onlineStatusEl.textContent = msg.payload.message;
      }
    });

    socket.addEventListener('close', () => {
      if (closedByUs) return;
      onlineStatusEl.textContent = 'Connection lost — reconnecting…';
      view.setInteractive(null);
      setTimeout(connect, 1200);
    });
  }

  function sendMessage(payload) {
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(payload));
    }
  }

  function applyServerState(payload) {
    countries = payload.countries;
    const displayCountries = { w: countries.w || 'france', b: countries.b || 'japan' };
    view.setCountries(displayCountries);
    renderTurnIndicators(displayCountries);

    if (payload.move && payload.move.captured) {
      recordCapture(payload.move.color, payload.move.captured);
    } else if (!payload.move && isFreshStartingPosition(payload.state)) {
      // No move attached AND the position is the untouched starting
      // layout: this is either the very first welcome or a New Game
      // reset broadcast from the server. Either way, the captured-
      // pieces panel should start empty to match.
      resetMaterial();
    }
    renderMaterial(displayCountries);

    view.setState(payload.state, payload.move || undefined);
  }

  function isFreshStartingPosition(state) {
    let pieceCount = 0;
    for (const row of state.board) {
      for (const sq of row) {
        if (sq) pieceCount++;
      }
    }
    return pieceCount === 32;
  }

  function afterRender(state, status) {
    setActiveTurn(state.turn);

    if (!countries.w || !countries.b) {
      setStatusMessage('');
      onlineStatusEl.textContent = `Waiting for an opponent to enter room code "${roomCode}"…`;
      view.setInteractive(null);
      return;
    }

    const displayCountries = { w: countries.w, b: countries.b };
    if (mySeat === 'spectator') {
      onlineStatusEl.textContent = 'You are spectating this game.';
    } else {
      onlineStatusEl.textContent = `You are playing ${mySeat === 'w' ? 'first' : 'second'}.`;
    }

    if (status === 'checkmate' || status === 'stalemate') {
      setStatusMessage(statusText(status, state.turn, displayCountries));
      view.setInteractive(null);
      return;
    }

    setStatusMessage(statusText(status, state.turn, displayCountries));
    view.setInteractive(mySeat === state.turn ? mySeat : null);
  }

  function newGame() {
    sendMessage({ type: 'newGame', payload: {} });
  }

  function teardown() {
    closedByUs = true;
    view.setInteractive(null);
    if (socket) {
      try {
        socket.close();
      } catch {
        // ignore
      }
    }
  }

  return { newGame, teardown };
}

export { startOnlineGame };
