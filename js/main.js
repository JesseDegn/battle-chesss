// main.js — the app shell: mode picker, country/setup screen, and
// dispatch into whichever mode controller (hotseat.js / computer.js /
// online.js) the player chose. No framework — just DOM APIs.

import { COUNTRIES } from './art.js';
import { startHotSeat } from './hotseat.js';
import { startComputerGame } from './computer.js';
import { startOnlineGame } from './online.js';

const screens = {
  mode: document.getElementById('screen-mode'),
  setup: document.getElementById('screen-setup'),
  game: document.getElementById('screen-game'),
};

function showScreen(name) {
  for (const key of Object.keys(screens)) {
    screens[key].hidden = key !== name;
  }
}

let currentMode = null;
let selection = {}; // built up by the setup screen, shape depends on mode
let activeController = null;

function renderCountrySwatches(container, onPick, excludeId) {
  const grid = document.createElement('div');
  grid.className = 'country-swatches';
  for (const country of COUNTRIES) {
    if (excludeId && country.id === excludeId) continue;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'country-swatch';
    btn.dataset.countryId = country.id;
    btn.innerHTML = `<span class="swatch-bar" style="background:${country.colors.primary}"></span>${country.name}`;
    btn.addEventListener('click', () => {
      grid.querySelectorAll('.country-swatch').forEach((b) => b.classList.remove('selected'));
      btn.classList.add('selected');
      onPick(country.id);
    });
    grid.appendChild(btn);
  }
  container.appendChild(grid);
}

function buildSetupScreen(mode) {
  const title = document.getElementById('setup-title');
  const body = document.getElementById('setup-body');
  const startBtn = document.getElementById('setup-start-btn');
  body.innerHTML = '';
  selection = {};
  startBtn.disabled = true;

  if (mode === 'hotseat') {
    title.textContent = 'Choose both countries';
    const sideA = document.createElement('div');
    sideA.className = 'country-side';
    sideA.innerHTML = '<h3>Player 1 — moves first</h3>';
    renderCountrySwatches(sideA, (id) => {
      selection.w = id;
      checkReady();
    });
    const sideB = document.createElement('div');
    sideB.className = 'country-side';
    sideB.innerHTML = '<h3>Player 2</h3>';
    renderCountrySwatches(sideB, (id) => {
      selection.b = id;
      checkReady();
    });
    body.append(sideA, sideB);
    startBtn.textContent = 'Start';
  } else if (mode === 'computer') {
    title.textContent = 'Choose your country';
    const sideA = document.createElement('div');
    sideA.className = 'country-side';
    sideA.innerHTML =
      '<h3>Your country (you move first)</h3><p style="font-size:0.82rem;opacity:0.8;max-width:260px;">The computer will command a randomly assigned army, revealed at kickoff.</p>';
    renderCountrySwatches(sideA, (id) => {
      selection.w = id;
      checkReady();
    });
    body.append(sideA);
    startBtn.textContent = 'Start';
  } else if (mode === 'online') {
    title.textContent = 'Join or create a room';
    const sideA = document.createElement('div');
    sideA.className = 'country-side';
    sideA.innerHTML = '<h3>Your country</h3>';
    renderCountrySwatches(sideA, (id) => {
      selection.myCountry = id;
      checkReady();
    });

    const roomBox = document.createElement('div');
    roomBox.className = 'country-side';
    roomBox.innerHTML = `
      <h3>Room code</h3>
      <div class="online-join-form">
        <input type="text" id="room-code-input" maxlength="8" placeholder="e.g. FALCON" />
        <p style="font-size:0.8rem;opacity:0.8;max-width:220px;text-align:center;">
          Type any code. Share the same code with the other player — first one in plays their
          chosen country and moves first, second one in takes the other side, anyone after that
          just watches.
        </p>
      </div>
    `;
    roomBox.querySelector('#room-code-input').addEventListener('input', (e) => {
      selection.roomCode = e.target.value.trim().toUpperCase();
      checkReady();
    });

    body.append(sideA, roomBox);
    startBtn.textContent = 'Join Room';
  }

  function checkReady() {
    if (mode === 'hotseat') startBtn.disabled = !(selection.w && selection.b);
    else if (mode === 'computer') startBtn.disabled = !selection.w;
    else if (mode === 'online') startBtn.disabled = !(selection.myCountry && selection.roomCode);
  }
}

document.querySelectorAll('.mode-card').forEach((card) => {
  card.addEventListener('click', () => {
    currentMode = card.dataset.mode;
    buildSetupScreen(currentMode);
    showScreen('setup');
  });
});

document.getElementById('setup-back-btn').addEventListener('click', () => {
  showScreen('mode');
});

document.getElementById('setup-start-btn').addEventListener('click', () => {
  if (activeController) activeController.teardown();

  if (currentMode === 'hotseat') {
    activeController = startHotSeat({ w: selection.w, b: selection.b });
  } else if (currentMode === 'computer') {
    const remaining = COUNTRIES.filter((c) => c.id !== selection.w);
    const computerCountry = remaining[Math.floor(Math.random() * remaining.length)].id;
    activeController = startComputerGame({ w: selection.w, b: computerCountry });
  } else if (currentMode === 'online') {
    activeController = startOnlineGame({ myCountry: selection.myCountry, roomCode: selection.roomCode });
  }

  showScreen('game');
});

document.getElementById('menu-btn').addEventListener('click', () => {
  if (activeController) activeController.teardown();
  activeController = null;
  showScreen('mode');
});

document.getElementById('new-game-btn').addEventListener('click', () => {
  if (activeController) activeController.newGame();
});

showScreen('mode');
