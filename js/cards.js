// ═══════════════════════════════════════════
//  cards.js  — deck, rendering, phases
// ═══════════════════════════════════════════

export const COLORS = ['red', 'blue', 'green', 'yellow'];

export const PHASES = [
  { id:1,  desc: '2 Sets of 3',            parts: [{type:'set',count:3},{type:'set',count:3}] },
  { id:2,  desc: '1 Set of 3 + 1 Run of 4',parts: [{type:'set',count:3},{type:'run',count:4}] },
  { id:3,  desc: '1 Set of 4 + 1 Run of 4',parts: [{type:'set',count:4},{type:'run',count:4}] },
  { id:4,  desc: '1 Run of 7',             parts: [{type:'run',count:7}] },
  { id:5,  desc: '1 Run of 8',             parts: [{type:'run',count:8}] },
  { id:6,  desc: '1 Run of 9',             parts: [{type:'run',count:9}] },
  { id:7,  desc: '2 Sets of 4',            parts: [{type:'set',count:4},{type:'set',count:4}] },
  { id:8,  desc: '7 Cards of 1 Color',     parts: [{type:'color',count:7}] },
  { id:9,  desc: '1 Set of 5 + 1 Set of 2',parts: [{type:'set',count:5},{type:'set',count:2}] },
  { id:10, desc: '1 Set of 5 + 1 Set of 3',parts: [{type:'set',count:5},{type:'set',count:3}] },
];

let _cardId = 0;
function makeCard(type, color, number) {
  return { id: _cardId++, type, color, number };
}

export function buildDeck() {
  _cardId = 0;
  const deck = [];
  // 2 copies of each number (1-12) per color
  for (let copy = 0; copy < 2; copy++) {
    for (const color of COLORS) {
      for (let n = 1; n <= 12; n++) {
        deck.push(makeCard('number', color, n));
      }
    }
  }
  // 8 Wild, 4 Skip
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

// ── Card point value ──
export function cardPoints(card) {
  if (card.type === 'wild') return 25;
  if (card.type === 'skip') return 15;
  if (card.number >= 10)    return 10;
  return 5;
}

// ── Render a card element ──
export function renderCard(card, opts = {}) {
  const el = document.createElement('div');
  el.className = `card card-${card.color}`;
  el.dataset.cardId = card.id;

  if (card.type === 'wild') {
    el.innerHTML = `<span class="corner tl">W</span><span class="center-num">★</span><span class="corner br">W</span>`;
  } else if (card.type === 'skip') {
    el.innerHTML = `<span class="corner tl">⊘</span><span class="center-num">⊘</span><span class="corner br">⊘</span>`;
  } else {
    el.innerHTML = `<span class="corner tl">${card.number}</span><span class="center-num">${card.number}</span><span class="corner br">${card.number}</span>`;
  }

  if (opts.onClick) el.addEventListener('click', () => opts.onClick(card, el));
  return el;
}

// ── Phase validation ──
export function validatePhase(cards, phaseId) {
  const phase = PHASES[phaseId - 1];
  // Try to split cards into the required groups
  return tryAssign(cards, phase.parts, []);
}

function tryAssign(cards, parts, assignment) {
  if (parts.length === 0) return assignment;
  const [part, ...rest] = parts;
  // Get all combinations of the right size
  const wilds = cards.filter(c => c.type === 'wild');
  const nonWilds = cards.filter(c => c.type !== 'wild');
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
    return unique.length <= 1; // all same number (wilds fill in)
  }
  if (part.type === 'run') {
    if (real.length === 0) return true; // all wilds
    const nums = real.map(c => c.number).sort((a,b)=>a-b);
    // Remove duplicates only possible with wilds filling
    const span = nums[nums.length-1] - nums[0] + 1;
    const uniqueNums = [...new Set(nums)];
    if (uniqueNums.length !== real.length) return false; // duplicates in run
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

// ── Check if a card can be "hit" onto an existing meld group ──
export function canHit(card, meldGroup, part) {
  if (card.type === 'wild') return true;
  if (part.type === 'set') {
    const nums = meldGroup.filter(c=>c.type!=='wild').map(c=>c.number);
    return nums.includes(card.number) || nums.length === 0;
  }
  if (part.type === 'run') {
    const nums = meldGroup.filter(c=>c.type!=='wild').map(c=>c.number).sort((a,b)=>a-b);
    if (!nums.length) return true;
    return card.number === nums[0]-1 || card.number === nums[nums.length-1]+1;
  }
  if (part.type === 'color') {
    const colors = meldGroup.filter(c=>c.type!=='wild').map(c=>c.color);
    return colors.includes(card.color) || colors.length === 0;
  }
  return false;
}
