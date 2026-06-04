// ═══════════════════════════════════════════
//  ai.js — Tippy AI for single-player mode
// ═══════════════════════════════════════════
//
// Three difficulties:
//   sleepy   — random legal moves; lazy
//   tippy    — competent / greedy: lay down ASAP, hit melds, dump points
//   gameface — strategic: holds wilds, hoards skips, plays for late-game
//
// The AI operates on a `soloState` object provided by solo.js that exposes:
//   soloState.topDiscard()              -> top card of discard pile (or null)
//   soloState.melds                      -> { ownerId: [{cards, partType, ...}] }
//   soloState.draw(ai, 'draw'|'discard')
//   soloState.layDown(ai, groups)
//   soloState.hit(ai, ownerId, groupIndex, card)
//   soloState.discard(ai, card)
//
// `ai` is the AI player object: { id, name, phase, hand, phaseDone, difficulty, ... }

import { PHASES, validatePhase, canHit, cardPoints } from './cards.js';

export const TIPPY_DIFFICULTIES = {
  sleepy: {
    key:   'sleepy',
    name:  'Sleepy Tippy',
    label: 'Easy',
    icon:  '😴',
    blurb: 'Naps a lot, plays whatever comes to mind.',
  },
  tippy: {
    key:   'tippy',
    name:  'Tippy',
    label: 'Medium',
    icon:  '🐶',
    blurb: 'Knows the rules. Plays clean and steady.',
  },
  gameface: {
    key:   'gameface',
    name:  'Game-Face Tippy',
    label: 'Hard',
    icon:  '👀',
    blurb: 'No mercy. Holds wilds. Saves skips for the perfect moment.',
  },
};

// ─────────────────────────────────────────────
//  Phase-laydown search
//  Finds ANY subset of the hand that completes the phase.
// ─────────────────────────────────────────────
export function findPhaseLaydown(hand, phaseId) {
  const phaseObj = PHASES[phaseId - 1];
  if (!phaseObj) return null;
  const need = phaseObj.parts.reduce((s, p) => s + p.count, 0);
  if (hand.length < need) return null;

  // Try every k-subset of size `need` from hand.
  // C(11, 9) = 55, C(11, 6) = 462 — fast.
  const combos = kCombinations(hand, need);
  for (const combo of combos) {
    const result = validatePhase(combo, phaseId);
    if (result) return result;
  }
  return null;
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

  if (difficulty === 'sleepy') return Math.random() < 0.5 ? 'discard' : 'draw';

  // For Tippy / Game-Face: take discard if it materially helps
  if (ai.phaseDone) {
    if (canHitAnyMeld(top, soloState)) return 'discard';
    return 'draw';
  }

  // If hand+top completes the phase, take it
  const withTop = [...ai.hand, top];
  if (findPhaseLaydown(withTop, ai.phase)) return 'discard';

  // Game-Face also values wilds even if they don't immediately complete
  if (difficulty === 'gameface' && top.type === 'wild') return 'discard';

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
//  Returns { ownerId, groupIndex, card } or null.
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

  if (difficulty === 'sleepy') {
    return candidates[Math.floor(Math.random() * candidates.length)];
  }

  // Prefer non-wild hits (don't waste wilds); within that, prefer highest-point card
  const nonWild = candidates.filter(c => c.card.type !== 'wild');
  const pool = nonWild.length ? nonWild : candidates;
  pool.sort((a, b) => cardPoints(b.card) - cardPoints(a.card));
  return pool[0];
}

// ─────────────────────────────────────────────
//  Discard decision
//  Must leave at least 1 card behind; the discard itself is the last action.
// ─────────────────────────────────────────────
function chooseDiscard(ai, soloState, difficulty) {
  if (!ai.hand.length) return null;

  if (difficulty === 'sleepy') {
    return ai.hand[Math.floor(Math.random() * ai.hand.length)];
  }

  // If we haven't laid down yet, figure out which cards we want to keep
  let unused = ai.hand;
  if (!ai.phaseDone) {
    const laydown = findPhaseLaydown(ai.hand, ai.phase);
    if (laydown) {
      const usedIds = new Set(laydown.flat().map(c => c.id));
      unused = ai.hand.filter(c => !usedIds.has(c.id));
      if (!unused.length) unused = ai.hand; // shouldn't happen but defensive
    }
  }

  // Sort highest-point first
  const sorted = [...unused].sort((a, b) => cardPoints(b) - cardPoints(a));

  // Game-Face: sometimes hold a skip for later instead of discarding it
  if (difficulty === 'gameface' && sorted[0]?.type === 'skip' && sorted.length > 1 && Math.random() < 0.6) {
    return sorted[1];
  }

  // Don't lead with a wild if there's a near-equivalent alternative
  if (sorted[0]?.type === 'wild' && sorted.length > 1) return sorted[1];

  return sorted[0];
}

// ─────────────────────────────────────────────
//  Resolve wilds in a phase-laydown into final groups with declaredValues
//  (parallel to declareWildsIfNeeded in game.js, but auto-resolves)
// ─────────────────────────────────────────────
function resolveWildsForLaydown(groups, phaseId) {
  const phaseObj = PHASES[phaseId - 1];
  return groups.map((group, i) => {
    const part = phaseObj.parts[i];
    if (part.type !== 'run') {
      // Sets and color phases don't need declared values; just preserve order
      return group;
    }
    const reals = group.filter(c => c.type !== 'wild').sort((a, b) => a.number - b.number);
    const wilds = group.filter(c => c.type === 'wild');
    if (!reals.length) {
      // All wilds: declare as 1..count
      return wilds.map((w, k) => ({ ...w, declaredValue: k + 1 }));
    }
    // Build a window of length `count` starting at the lowest real card
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
  // Prefer extending the high end (usually safer)
  if (hi < 12) return { ...card, declaredValue: hi + 1 };
  if (lo > 1)  return { ...card, declaredValue: lo - 1 };
  return card;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ─────────────────────────────────────────────
//  Public: play the AI's entire turn.
//  Awaits its own pacing delays so each action is visible to the player.
// ─────────────────────────────────────────────
export async function playAiTurn(ai, soloState, opts = {}) {
  const difficulty = ai.difficulty || 'tippy';
  const pace = opts.pace ?? 1; // multiplier for delays; 1 = normal

  // "Thinking" pause
  await sleep(pace * (600 + Math.random() * 800));

  // 1. Draw
  const source = chooseDrawSource(ai, soloState, difficulty);
  soloState.draw(ai, source);
  await sleep(pace * 350);

  // 2. Phase laydown if possible
  if (!ai.phaseDone) {
    const laydown = findPhaseLaydown(ai.hand, ai.phase);
    if (laydown) {
      const resolved = resolveWildsForLaydown(laydown, ai.phase);
      soloState.layDown(ai, resolved);
      await sleep(pace * 600);
    }
  }

  // 3. Hit melds — repeatedly, but always leave at least 1 card to discard
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
