// ═══════════════════════════════════════════
//  cards.js  — deck, rendering, phases
// ═══════════════════════════════════════════

export const COLORS = ['red', 'blue', 'green', 'yellow'];

export const PHASES = [
  { id:1,  desc: '2 Sets of 3',             parts: [{type:'set',count:3},{type:'set',count:3}] },
  { id:2,  desc: '1 Set of 3 + 1 Run of 4', parts: [{type:'set',count:3},{type:'run',count:4}] },
  { id:3,  desc: '1 Set of 4 + 1 Run of 4', parts: [{type:'set',count:4},{type:'run',count:4}] },
  { id:4,  desc: '1 Run of 7',              parts: [{type:'run',count:7}] },
  { id:5,  desc: '1 Run of 8',              parts: [{type:'run',count:8}] },
  { id:6,  desc: '1 Run of 9',              parts: [{type:'run',count:9}] },
  { id:7,  desc: '2 Sets of 4',             parts: [{type:'set',count:4},{type:'set',count:4}] },
  { id:8,  desc: '7 Cards of 1 Color',      parts: [{type:'color',count:7}] },
  { id:9,  desc: '1 Set of 5 + 1 Set of 2', parts: [{type:'set',count:5},{type:'set',count:2}] },
  { id:10, desc: '1 Set of 5 + 1 Set of 3', parts: [{type:'set',count:5},{type:'set',count:3}] },
];

// ── Firebase stores arrays as objects with numeric string keys.
//    This converts them back to real JS arrays.
export function firebaseToArray(val) {
  if (Array.isArray(val)) return val;
  if (!val || typeof val !== 'object') return [];
  return Object.keys(val)
    .filter(k => !isNaN(k))
    .sort((a, b) => Number(a) - Number(b))
    .map(k => val[k]);
}

let _cardId = 0;
function makeCard(type, color, number) {
  return { id: _cardId++, type, color, number };
}

export function buildDeck() {
  _cardId = 0;
  const deck = [];
  for (let copy = 0; copy < 2; copy++) {
    for (const color of COLORS) {
      for (let n = 1; n <= 12; n++) {
        deck.push(makeCard('number', color, n));
      }
    }
  }
  for (let i = 0; i < 8; i++) deck.push(makeCard('wild', 'wild', 0));
  for (let i = 0; i < 4; i++) deck.push(makeCard('skip', 'skip', 0));
  return shuffle(deck);
}

export function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function cardPoints(card) {
  if (card.type === 'wild') return 25;
  if (card.type === 'skip') return 15;
  if (card.number >= 10)    return 10;
  return 5;
}

export function renderCard(card, opts = {}) {
  const el = document.createElement('div');
  el.className = `card card-${card.color}`;
  el.dataset.cardId = card.id;

  if (card.type === 'wild') {
    // Pug tail SVG — a curled spiral in the card background
    const tail = `<svg class="pug-tail-svg" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M12,17 C7,17 5,14 5,11 C5,6 10,4 14,6 C17,7 18,11 16,14 C14,16 11,16 10,14 C9,13 10,11 12,11 C13,11 14,12 13,13" stroke="rgba(255,255,255,0.35)" stroke-width="1.6" stroke-linecap="round" fill="none"/></svg>`;
    const dv = card.declaredValue;
    el.innerHTML = dv
      ? `${tail}<span class="corner tl">${dv}</span><span class="center-num">★</span><span class="corner br">${dv}</span>`
      : `${tail}<span class="corner tl">W</span><span class="center-num">★</span><span class="corner br">W</span>`;
  } else if (card.type === 'skip') {
    el.innerHTML = `<span class="corner tl">⊘</span><span class="center-num">⊘</span><span class="corner br">⊘</span>`;
  } else {
    el.innerHTML = `<span class="corner tl">${card.number}</span><span class="center-num">${card.number}</span><span class="corner br">${card.number}</span>`;
  }

  if (opts.onClick) el.addEventListener('click', () => opts.onClick(card, el));
  return el;
}

export function validatePhase(cards, phaseId) {
  const phase = PHASES[phaseId - 1];
  return tryAssign(cards, phase.parts, []);
}

function tryAssign(cards, parts, assignment) {
  if (parts.length === 0) return assignment;
  const [part, ...rest] = parts;
  const combos = combinations(cards, part.count);
  for (const combo of combos) {
    if (matchesPart(combo, part)) {
      const remaining = cards.filter(c => !combo.includes(c));
      const result = tryAssign(remaining, rest, [...assignment, combo]);
      if (result) return result;
    }
  }
  return null;
}

function matchesPart(cards, part) {
  const wilds = cards.filter(c => c.type === 'wild');
  const real   = cards.filter(c => c.type !== 'wild');
  if (part.type === 'set') {
    const nums = real.map(c => c.number);
    const unique = [...new Set(nums)];
    return unique.length <= 1;
  }
  if (part.type === 'run') {
    if (real.length === 0) return true;
    const nums = real.map(c => c.number).sort((a,b)=>a-b);
    const span = nums[nums.length-1] - nums[0] + 1;
    const uniqueNums = [...new Set(nums)];
    if (uniqueNums.length !== real.length) return false;
    return span <= cards.length && uniqueNums.length + wilds.length >= cards.length;
  }
  if (part.type === 'color') {
    const colors = real.map(c => c.color);
    const unique = [...new Set(colors)];
    return unique.length <= 1;
  }
  return false;
}

function combinations(arr, k) {
  if (k === 0) return [[]];
  if (arr.length < k) return [];
  const [first, ...rest] = arr;
  const withFirst    = combinations(rest, k-1).map(c => [first, ...c]);
  const withoutFirst = combinations(rest, k);
  return [...withFirst, ...withoutFirst];
}

export function canHit(card, meldGroup, part) {
  if (part.type === 'set') {
    if (card.type === 'wild') return true;
    const nums = meldGroup.filter(c=>c.type!=='wild').map(c=>c.number);
    return nums.includes(card.number) || nums.length === 0;
  }
  if (part.type === 'run') {
    if (card.type === 'wild') {
      // Wild can extend the run at either end (if there's room in 1-12)
      const allVals = meldGroup.map(c => c.declaredValue ?? c.number).sort((a,b)=>a-b);
      return allVals[0] > 1 || allVals[allVals.length-1] < 12;
    }
    // Use declaredValue for wilds already in the meld
    const allVals = meldGroup.map(c => c.declaredValue ?? c.number).sort((a,b)=>a-b);
    if (!allVals.length) return true;
    return card.number === allVals[0]-1 || card.number === allVals[allVals.length-1]+1;
  }
  if (part.type === 'color') {
    if (card.type === 'wild') return true;
    const colors = meldGroup.filter(c=>c.type!=='wild').map(c=>c.color);
    return colors.includes(card.color) || colors.length === 0;
  }
  return false;
}
