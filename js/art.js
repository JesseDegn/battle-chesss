// art.js — country color palettes + the procedurally-drawn armored piece
// art (plain SVG, no image files, no art library) + the small animation
// helpers that give pieces a "ready" flourish on selection, a slide on
// move, and a piece-appropriate "defeat" animation on capture.
//
// Every piece is one silhouette design per piece TYPE, recolored per
// country. That recoloring is what makes two games "look" different
// depending on which countries were picked, without needing twelve
// separate art sets.

const COUNTRIES = [
  { id: 'france', name: 'France', colors: { primary: '#1E3A8A', secondary: '#F8FAFC', accent: '#DC2626' } },
  { id: 'japan', name: 'Japan', colors: { primary: '#F8FAFC', secondary: '#1F2937', accent: '#DC2626' } },
  { id: 'brazil', name: 'Brazil', colors: { primary: '#15803D', secondary: '#FACC15', accent: '#1D4ED8' } },
  { id: 'germany', name: 'Germany', colors: { primary: '#1F2937', secondary: '#DC2626', accent: '#F59E0B' } },
  { id: 'nigeria', name: 'Nigeria', colors: { primary: '#15803D', secondary: '#F8FAFC', accent: '#166534' } },
  { id: 'sweden', name: 'Sweden', colors: { primary: '#1D4ED8', secondary: '#FACC15', accent: '#FDE047' } },
  { id: 'india', name: 'India', colors: { primary: '#EA580C', secondary: '#F8FAFC', accent: '#15803D' } },
  { id: 'mexico', name: 'Mexico', colors: { primary: '#15803D', secondary: '#F8FAFC', accent: '#DC2626' } },
  { id: 'italy', name: 'Italy', colors: { primary: '#16A34A', secondary: '#F8FAFC', accent: '#DC2626' } },
  { id: 'south-korea', name: 'South Korea', colors: { primary: '#F8FAFC', secondary: '#DC2626', accent: '#1D4ED8' } },
  { id: 'usa', name: 'United States', colors: { primary: '#1D4ED8', secondary: '#F8FAFC', accent: '#DC2626' } },
  { id: 'kenya', name: 'Kenya', colors: { primary: '#1F2937', secondary: '#DC2626', accent: '#15803D' } },
];

function countryById(id) {
  return COUNTRIES.find((c) => c.id === id) || COUNTRIES[0];
}

const PIECE_NAMES = {
  p: 'Infantry (Pawn)',
  n: 'Cavalry (Knight)',
  b: 'Standard-Bearer (Bishop)',
  r: 'Siege Tower (Rook)',
  q: 'Commander (Queen)',
  k: 'King',
};

// Each builder returns an inner-SVG string (no outer <svg> tag) using
// `p` (primary), `s` (secondary), `a` (accent) fill colors, and a dark
// outline color `o` for readability against both light and dark board
// squares. Group classes (part-*) are animation hooks — see
// public/css/animations.css.
function pawnSVG(p, s, a, o) {
  return `
    <ellipse class="part-shadow" cx="50" cy="112" rx="26" ry="6" fill="#00000033"/>
    <path class="part-body" d="M35 108 Q30 70 42 60 Q34 52 40 40 Q44 30 50 30 Q56 30 60 40 Q66 52 58 60 Q70 70 65 108 Z" fill="${s}" stroke="${o}" stroke-width="3"/>
    <circle class="part-head" cx="50" cy="26" r="14" fill="${p}" stroke="${o}" stroke-width="3"/>
    <rect class="part-armor" x="38" y="54" width="24" height="14" rx="3" fill="${p}" stroke="${o}" stroke-width="2"/>
    <line class="part-weapon" x1="70" y1="20" x2="70" y2="80" stroke="${a}" stroke-width="4" stroke-linecap="round"/>
    <path class="part-weapon" d="M66 20 L70 8 L74 20 Z" fill="${a}" stroke="${o}" stroke-width="1.5"/>
  `;
}

function knightSVG(p, s, a, o) {
  return `
    <ellipse class="part-shadow" cx="50" cy="112" rx="30" ry="6" fill="#00000033"/>
    <path class="part-body" d="M30 108 Q28 90 34 80 L30 60 Q28 40 42 28 Q56 18 70 26 Q78 30 76 40 Q74 48 64 46 Q70 54 66 62 L74 62 Q80 62 80 68 Q80 74 72 74 L58 74 Q66 90 70 108 Z" fill="${p}" stroke="${o}" stroke-width="3"/>
    <path class="part-mane" d="M42 28 Q34 20 40 12 Q46 18 46 26 Z" fill="${a}" stroke="${o}" stroke-width="2"/>
    <circle class="part-eye" cx="63" cy="36" r="2.6" fill="${o}"/>
    <rect class="part-armor" x="34" y="62" width="26" height="12" rx="3" fill="${s}" stroke="${o}" stroke-width="2"/>
  `;
}

function bishopSVG(p, s, a, o) {
  return `
    <ellipse class="part-shadow" cx="50" cy="112" rx="26" ry="6" fill="#00000033"/>
    <path class="part-body" d="M34 108 Q28 74 40 58 Q32 50 40 38 Q46 30 50 30 Q54 30 60 38 Q68 50 60 58 Q72 74 66 108 Z" fill="${s}" stroke="${o}" stroke-width="3"/>
    <circle class="part-head" cx="50" cy="24" r="11" fill="${p}" stroke="${o}" stroke-width="3"/>
    <rect class="part-armor" x="38" y="52" width="24" height="12" rx="3" fill="${p}" stroke="${o}" stroke-width="2"/>
    <line class="part-pole" x1="78" y1="18" x2="78" y2="70" stroke="${o}" stroke-width="3" stroke-linecap="round"/>
    <path class="part-banner" d="M78 18 L100 24 L92 32 L100 40 L78 46 Z" fill="${a}" stroke="${o}" stroke-width="2"/>
  `;
}

function rookSVG(p, s, a, o) {
  return `
    <ellipse class="part-shadow" cx="50" cy="112" rx="28" ry="6" fill="#00000033"/>
    <circle class="part-wheels" cx="34" cy="106" r="7" fill="${o}"/>
    <circle class="part-wheels" cx="66" cy="106" r="7" fill="${o}"/>
    <rect class="part-body" x="28" y="40" width="44" height="62" rx="4" fill="${p}" stroke="${o}" stroke-width="3"/>
    <rect class="part-armor" x="32" y="56" width="36" height="10" fill="${s}" stroke="${o}" stroke-width="1.5"/>
    <path class="part-crenellation" d="M26 40 V26 H36 V34 H44 V26 H56 V34 H64 V26 H74 V40 Z" fill="${p}" stroke="${o}" stroke-width="3"/>
    <path class="part-door" d="M44 102 V80 Q44 72 50 72 Q56 72 56 80 V102 Z" fill="${a}" stroke="${o}" stroke-width="2"/>
  `;
}

function queenSVG(p, s, a, o) {
  return `
    <ellipse class="part-shadow" cx="50" cy="112" rx="27" ry="6" fill="#00000033"/>
    <path class="part-cape" d="M50 40 Q20 60 26 108 L38 100 Q34 66 50 50 Q66 66 62 100 L74 108 Q80 60 50 40 Z" fill="${s}" stroke="${o}" stroke-width="2.5"/>
    <path class="part-body" d="M38 108 Q34 76 42 62 Q36 54 42 44 Q46 36 50 36 Q54 36 58 44 Q64 54 58 62 Q66 76 62 108 Z" fill="${p}" stroke="${o}" stroke-width="3"/>
    <circle class="part-head" cx="50" cy="26" r="12" fill="${p}" stroke="${o}" stroke-width="3"/>
    <path class="part-crown" d="M38 18 L42 6 L47 16 L50 4 L53 16 L58 6 L62 18 Z" fill="${a}" stroke="${o}" stroke-width="2"/>
    <line class="part-weapon" x1="76" y1="46" x2="86" y2="90" stroke="${a}" stroke-width="4" stroke-linecap="round"/>
  `;
}

function kingSVG(p, s, a, o) {
  return `
    <ellipse class="part-shadow" cx="50" cy="112" rx="27" ry="6" fill="#00000033"/>
    <line class="part-pole" x1="78" y1="10" x2="78" y2="66" stroke="${o}" stroke-width="3" stroke-linecap="round"/>
    <path class="part-banner" d="M78 10 L102 18 L94 28 L102 38 L78 44 Z" fill="${s}" stroke="${o}" stroke-width="2"/>
    <path class="part-body" d="M36 108 Q30 76 40 60 Q34 52 40 42 Q45 34 50 34 Q55 34 60 42 Q66 52 60 60 Q70 76 64 108 Z" fill="${p}" stroke="${o}" stroke-width="3"/>
    <circle class="part-head" cx="50" cy="24" r="12" fill="${p}" stroke="${o}" stroke-width="3"/>
    <path class="part-crown" d="M37 16 L44 2 L50 14 L56 2 L63 16 Z" fill="${a}" stroke="${o}" stroke-width="2"/>
    <path class="part-crown" d="M46 2 V-4 M43 -1 H49" stroke="${a}" stroke-width="2.5" stroke-linecap="round" transform="translate(0,6)"/>
    <rect class="part-armor" x="38" y="58" width="24" height="12" rx="3" fill="${a}" stroke="${o}" stroke-width="2"/>
  `;
}

const BUILDERS = { p: pawnSVG, n: knightSVG, b: bishopSVG, r: rookSVG, q: queenSVG, k: kingSVG };

/** Returns an HTML string for a full piece element: a wrapper <div class="piece">
 * (the thing that gets positioned on the board and animated) containing the
 * piece's SVG. `type` is 'p'|'n'|'b'|'r'|'q'|'k', `side` is 'a'|'b' (the two
 * playing sides — see main.js for how side maps to a chosen country). */
function pieceMarkup(type, countryId) {
  const { colors } = countryById(countryId);
  const outline = '#1C1917';
  const build = BUILDERS[type];
  return `
    <div class="piece" data-type="${type}" data-country="${countryId}" title="${PIECE_NAMES[type]}">
      <svg class="piece-svg" viewBox="-6 -8 112 126" aria-hidden="true">
        ${build(colors.primary, colors.secondary, colors.accent, outline)}
      </svg>
    </div>
  `;
}

/** Slide a piece element from its current on-screen position to a target
 * board square element, using the FLIP technique: read where it is now,
 * where it needs to end up, and animate the difference. This keeps the
 * move animation decoupled from layout (works with any board size). */
function animatePieceMove(pieceEl, fromSquareEl, toSquareEl, duration = 260) {
  const fromRect = fromSquareEl.getBoundingClientRect();
  const toRect = toSquareEl.getBoundingClientRect();
  const dx = fromRect.left - toRect.left;
  const dy = fromRect.top - toRect.top;
  if (!pieceEl.animate) return Promise.resolve();
  return pieceEl
    .animate(
      [
        { transform: `translate(${dx}px, ${dy}px)` },
        { transform: 'translate(0, 0)' },
      ],
      { duration, easing: 'cubic-bezier(0.3, 0.1, 0.2, 1)' }
    )
    .finished.catch(() => {});
}

/** Brief "ready" flourish when a piece is selected. Implemented as a CSS
 * class toggle so each piece type's keyframes (defined in animations.css)
 * can differ — a cavalry rear vs. a banner ripple vs. a crown glint. */
function triggerSelectFlourish(pieceEl) {
  pieceEl.classList.remove('flourish');
  // Force reflow so re-adding the class restarts the animation if the
  // same piece is clicked twice in a row.
  void pieceEl.offsetWidth;
  pieceEl.classList.add('flourish');
}

/** Piece-appropriate "defeat" animation, then removal. Returns a promise
 * that resolves once the element has been removed from the DOM, so
 * callers can wait for it before continuing (though game logic itself
 * never has to wait — the move is already legal/recorded by this point). */
function animateCapture(pieceEl, duration = 480) {
  return new Promise((resolve) => {
    pieceEl.classList.add('capturing');
    setTimeout(() => {
      pieceEl.remove();
      resolve();
    }, duration);
  });
}

export { COUNTRIES, countryById, PIECE_NAMES, pieceMarkup, animatePieceMove, triggerSelectFlourish, animateCapture };
