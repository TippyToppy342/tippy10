// ═══════════════════════════════════════════
//  ai.js — Tippy AI for single-player mode
// ═══════════════════════════════════════════
//
// Three difficulties (lowest → highest):
//   sleepy   — Sleepy Tippy (Easy):  competent, plays clean and steady.
//   alert    — Alert Tippy  (Medium): strategic — grabs wilds from the discard,
//                                     NEVER discards a wild.
//   hungry   — Hungry Tippy (Hard):   ruthless — never wastes wilds, holds skips
//                                     until a threatening opponent is next up,
//                                     and lays down phases using the fewest wilds.
//
// Backward compatibility: old keys 'tippy' and 'gameface' are mapped to the
// closest new equivalents ('sleepy' and 'alert').
//
// soloState API exposed by solo.js:
//   soloState.topDiscard()
//   soloState.melds              { ownerId: [{cards, partType, ...}] }
//   soloState.players            { pid: { name, icon, phase, score, handCount, phaseDone, isHuman } }
//   soloState.playerOrder        [pid, ...]
//   soloState.currentTurn        pid
//   soloState.draw(ai, source)
//   soloState.layDown(ai, groups)
//   soloState.hit(ai, ownerId, groupIndex, card)
//   soloState.discard(ai, card)
//   soloState.tippyChat(ai, text)   (optional — for personality lines)

import { PHASES, validatePhase, canHit, cardPoints } from './cards.js';

export const TIPPY_DIFFICULTIES = {
  sleepy: {
    key:   'sleepy',
    name:  'Sleepy Tippy',
    label: 'Easy',
    icon:  '😴',
    blurb: 'Plays clean and steady. Doesn\'t scheme.',
  },
  alert: {
    key:   'alert',
    name:  'Alert Tippy',
    label: 'Medium',
    icon:  '👀',
    blurb: 'Watches every card. Hoards wilds, never wastes one.',
  },
  hungry: {
    key:   'hungry',
    name:  'Hungry Tippy',
    label: 'Hard',
    icon:  '🦴',
    blurb: 'Out for blood. Optimizes every move and never wastes a wild.',
  },
};

// Map legacy keys ('tippy', 'gameface') from earlier saves to new equivalents.
export function normalizeDifficulty(d) {
  if (d === 'tippy')    return 'sleepy';   // old "Tippy" (competent) is now Easy
  if (d === 'gameface') return 'alert';    // old "Game-Face" is now Medium
  if (TIPPY_DIFFICULTIES[d]) return d;
  return 'sleepy';
}

// ─────────────────────────────────────────────
//  Phase-laydown search
//  Finds a subset of the hand that completes the phase. For Hungry difficulty,
//  prefers subsets that use the FEWEST wild cards (so wilds are saved for
//  later hits / next phases).
// ─────────────────────────────────────────────
export function findPhaseLaydown(hand, phaseId, opts = {}) {
  const preferFewWilds = !!opts.preferFewWilds;
  const phaseObj = PHASES[phaseId - 1];
  if (!phaseObj) return null;
  const need = phaseObj.parts.reduce((s, p) => s + p.count, 0);
  if (hand.length < need) return null;

  const combos = kCombinations(hand, need);
  if (!preferFewWilds) {
    // Fast path: return the first valid laydown
    for (const combo of combos) {
      const result = validatePhase(combo, phaseId);
      if (result) return result;
    }
    return null;
  }

  // Slow path: search all valid laydowns, pick the one with the fewest wilds
  let best = null;
  let bestWildCount = Infinity;
  for (const combo of combos) {
    const result = validatePhase(combo, phaseId);
    if (!result) continue;
    const wildCount = result.flat().filter(c => c.type === 'wild').length;
    if (wildCount < bestWildCount) {
      best = result;
      bestWildCount = wildCount;
      if (wildCount === 0) return best; // can't do better than zero
    }
  }
  return best;
}

function kCombinations(arr, k) {
  const result = [];
  const n = arr.length;
  if (k > n || k < 0) return result;
  const indices = Array.from({ length: k }, (_, i) => i);
  while (true) {
    result.push(indices.map(i => arr[i]));
    let i = k - 1;
    while (i >= 0 && indices[i] === n - k + i) i--;
    if (i < 0) break;
    indices[i]++;
    for (let j = i + 1; j < k; j++) indices[j] = indices[j - 1] + 1;
  }
  return result;
}

// ─────────────────────────────────────────────
//  Draw source decision
// ─────────────────────────────────────────────
function chooseDrawSource(ai, soloState, difficulty) {
  const top = soloState.topDiscard();
  if (!top) return 'draw';
  if (top.type === 'skip') return 'draw'; // skips can't be picked up from discard

  // All difficulties: take discard if it would complete the phase
  if (!ai.phaseDone) {
    const withTop = [...ai.hand, top];
    if (findPhaseLaydown(withTop, ai.phase)) return 'discard';
  } else if (canHitAnyMeld(top, soloState)) {
    return 'discard';
  }

  // Alert + Hungry: also grab wilds from the discard (they're valuable)
  if (difficulty !== 'sleepy' && top.type === 'wild') return 'discard';

  // Hungry: also grab if the card matches anything in our hand (set/run potential)
  if (difficulty === 'hungry' && !ai.phaseDone && top.type === 'number') {
    const matchesNumber = ai.hand.some(c => c.type === 'number' && c.number === top.number);
    const matchesColor  = ai.hand.some(c => c.type === 'number' && c.color === top.color);
    if (matchesNumber || matchesColor) return 'discard';
  }

  return 'draw';
}

function canHitAnyMeld(card, soloState) {
  const melds = soloState.melds || {};
  for (const ownerId of Object.keys(melds)) {
    const groups = melds[ownerId] || [];
    for (const g of groups) {
      const cards = g.cards || [];
      if (canHit(card, cards, { type: g.partType })) return true;
    }
  }
  return false;
}

// ─────────────────────────────────────────────
//  Meld-hit decision
// ─────────────────────────────────────────────
function chooseHit(ai, soloState, difficulty) {
  if (ai.hand.length <= 1) return null;

  const candidates = [];
  const melds = soloState.melds || {};
  for (const [ownerId, groups] of Object.entries(melds)) {
    (groups || []).forEach((g, gi) => {
      for (const c of ai.hand) {
        if (canHit(c, g.cards || [], { type: g.partType })) {
          candidates.push({ ownerId, groupIndex: gi, card: c });
        }
      }
    });
  }
  if (!candidates.length) return null;

  // Prefer non-wild hits (don't waste wilds); within that, prefer highest-point card
  const nonWild = candidates.filter(c => c.card.type !== 'wild');
  const pool = nonWild.length ? nonWild : candidates;
  pool.sort((a, b) => cardPoints(b.card) - cardPoints(a.card));
  return pool[0];
}

// ─────────────────────────────────────────────
//  Discard decision
//  Must leave at least 1 card behind; the discard itself is the last action.
//
//  Wild-card protection:
//    sleepy  — prefers not to discard a wild (still might if all unused are wilds)
//    alert   — NEVER discards a wild unless hand is literally all wilds
//    hungry  — NEVER discards a wild; also holds skips unless next player threat
// ─────────────────────────────────────────────
function chooseDiscard(ai, soloState, difficulty) {
  if (!ai.hand.length) return null;

  // Figure out which cards are "unused" — not part of an immediate phase plan
  let unused = ai.hand;
  if (!ai.phaseDone) {
    const laydown = findPhaseLaydown(ai.hand, ai.phase, {
      preferFewWilds: difficulty === 'hungry',
    });
    if (laydown) {
      const usedIds = new Set(laydown.flat().map(c => c.id));
      unused = ai.hand.filter(c => !usedIds.has(c.id));
      if (!unused.length) unused = ai.hand;
    }
  }

  // Sort highest-point first
  const sorted = [...unused].sort((a, b) => cardPoints(b) - cardPoints(a));

  // ── Hard rule (Alert + Hungry): never discard a wild if any alternative ──
  if (difficulty === 'alert' || difficulty === 'hungry') {
    const nonWild = sorted.filter(c => c.type !== 'wild');
    if (nonWild.length === 0) {
      // Forced to discard a wild — only happens if hand is somehow all wilds.
      return sorted[0];
    }

    // Hungry: also hold skips unless the next player is a threat
    if (difficulty === 'hungry') {
      const nonWildNonSkip = nonWild.filter(c => c.type !== 'skip');
      if (nonWildNonSkip.length > 0) {
        // Strategic skip play: if the next player is a "threat" (close to going out
        // or leading on phases), dump the skip on them. Otherwise hoard.
        const skipInHand = nonWild.find(c => c.type === 'skip');
        if (skipInHand && nextPlayerIsThreat(ai, soloState)) {
          return skipInHand;
        }
        return nonWildNonSkip[0]; // highest-point non-wild non-skip
      }
      // Only skips and/or wilds left — prefer skip over wild
      return nonWild[0];
    }

    return nonWild[0]; // alert: highest-point non-wild
  }

  // ── Sleepy (Easy): prefer not to discard a wild but don't go to extremes ──
  if (sorted[0]?.type === 'wild' && sorted.length > 1) return sorted[1];
  return sorted[0];
}

// Threat assessment: is the player who'd receive a skip about to win or already
// laid down and close to going out?
function nextPlayerIsThreat(ai, soloState) {
  const order = soloState.playerOrder || [];
  if (!order.length) return false;
  const myIdx = order.indexOf(ai.id);
  if (myIdx < 0) return false;
  const nextPid = order[(myIdx + 1) % order.length];
  const nextP   = soloState.players?.[nextPid];
  if (!nextP) return false;
  // Threat if they've laid down AND have few cards left
  if (nextP.phaseDone && (nextP.handCount || 0) <= 4) return true;
  // Or if they're way ahead on phases
  const myPhase = ai.phase || 1;
  if ((nextP.phase || 1) - myPhase >= 2) return true;
  return false;
}

// ─────────────────────────────────────────────
//  Wild-card resolution helpers
// ─────────────────────────────────────────────
function resolveWildsForLaydown(groups, phaseId) {
  const phaseObj = PHASES[phaseId - 1];
  return groups.map((group, i) => {
    const part = phaseObj.parts[i];
    if (part.type !== 'run') return group;
    const reals = group.filter(c => c.type !== 'wild').sort((a, b) => a.number - b.number);
    const wilds = group.filter(c => c.type === 'wild');
    if (!reals.length) {
      return wilds.map((w, k) => ({ ...w, declaredValue: k + 1 }));
    }
    let start = reals[0].number;
    const maxStart = Math.min(start, 13 - part.count);
    start = Math.min(start, maxStart);
    const result = new Array(part.count).fill(null);
    for (const r of reals) {
      const idx = r.number - start;
      if (idx >= 0 && idx < part.count) result[idx] = r;
    }
    let wi = 0;
    for (let i = 0; i < part.count; i++) {
      if (!result[i] && wi < wilds.length) {
        result[i] = { ...wilds[wi++], declaredValue: start + i };
      }
    }
    return result.filter(Boolean);
  });
}

function resolveWildHit(card, group) {
  if (card.type !== 'wild') return card;
  if (group.partType !== 'run') return card;
  const vals = (group.cards || []).map(c => c.declaredValue ?? c.number).sort((a, b) => a - b);
  const lo = vals[0], hi = vals[vals.length - 1];
  if (hi < 12) return { ...card, declaredValue: hi + 1 };
  if (lo > 1)  return { ...card, declaredValue: lo - 1 };
  return card;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ─────────────────────────────────────────────
//  Personality chat lines
// ─────────────────────────────────────────────
const PERSONALITY_LINES = {
  sleepy: [
    'yawn… is it my turn again?',
    '*Tippy stretches*',
    'mmm just one more nap',
    'okay okay, I\'m playing',
    'don\'t mind me, half asleep',
    '*Tippy yawns at the discard pile*',
    'I think I dreamt of phase 5',
    'are we done yet? nap time',
  ],
  alert: [
    '👀 I see that',
    'noted.',
    'careful with that one',
    'hmm. interesting.',
    'watching the discard pile…',
    'you sure about that move?',
    'I\'ve been tracking your colors',
    'I\'ll remember that',
  ],
  hungry: [
    '🦴 mine.',
    'time to feast',
    'you\'re tasty bait',
    'I smell phase down 🍖',
    'bones for me, scraps for you',
    'don\'t make me hungrier',
    'I eat phases for breakfast',
    '*Tippy licks chops*',
    'tippy says: bone appétit',
    'feed me your discards',
  ],
};

function maybePostPersonalityLine(ai, soloState) {
  if (typeof soloState.tippyChat !== 'function') return;
  // ~22% chance per turn — chatty but not spammy
  if (Math.random() > 0.22) return;
  const difficulty = normalizeDifficulty(ai.difficulty);
  const pool = PERSONALITY_LINES[difficulty] || PERSONALITY_LINES.sleepy;
  const line = pool[Math.floor(Math.random() * pool.length)];
  soloState.tippyChat(ai, line);
}

// ─────────────────────────────────────────────
//  Public: play the AI's entire turn
// ─────────────────────────────────────────────
export async function playAiTurn(ai, soloState, opts = {}) {
  const difficulty = normalizeDifficulty(ai.difficulty);
  const pace = opts.pace ?? 1;

  // "Thinking" pause + a chance of a personality line at the start of the turn
  await sleep(pace * (500 + Math.random() * 700));
  maybePostPersonalityLine(ai, soloState);

  // 1. Draw
  const source = chooseDrawSource(ai, soloState, difficulty);
  soloState.draw(ai, source);
  await sleep(pace * 350);

  // 2. Phase laydown if possible
  if (!ai.phaseDone) {
    const laydown = findPhaseLaydown(ai.hand, ai.phase, {
      preferFewWilds: difficulty === 'hungry',
    });
    if (laydown) {
      const resolved = resolveWildsForLaydown(laydown, ai.phase);
      soloState.layDown(ai, resolved);
      await sleep(pace * 600);
    }
  }

  // 3. Hit melds (greedy, always leaving ≥1 card)
  if (ai.phaseDone) {
    let safety = 12;
    while (ai.hand.length > 1 && safety-- > 0) {
      const hit = chooseHit(ai, soloState, difficulty);
      if (!hit) break;
      const group = soloState.melds[hit.ownerId]?.[hit.groupIndex];
      if (!group) break;
      const cardToHit = resolveWildHit(hit.card, group);
      soloState.hit(ai, hit.ownerId, hit.groupIndex, cardToHit);
      await sleep(pace * 350);
    }
  }

  // 4. Discard
  const dc = chooseDiscard(ai, soloState, difficulty);
  if (dc) {
    soloState.discard(ai, dc);
    await sleep(pace * 250);
  }
}
