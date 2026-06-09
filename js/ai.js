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
  sneaky: {
    key:   'sneaky',
    name:  'Sneaky Tippy',
    label: 'Medium',
    icon:  '🦊',
    blurb: 'Slips cards away when you\'re not looking. Hoards wilds, picks moments.',
  },
  hungry: {
    key:   'hungry',
    name:  'Hungry Tippy',
    label: 'Hard',
    icon:  '🦴',
    blurb: 'Out for blood. Reads the table, calculates every move, never gifts you a card.',
  },
};

// Map legacy keys from earlier saves to current equivalents.
export function normalizeDifficulty(d) {
  if (d === 'tippy')    return 'sleepy';   // very old: was competent → Easy
  if (d === 'alert')    return 'sneaky';   // recent: was medium → Sneaky now
  if (d === 'gameface') return 'hungry';   // very old: was hard → Hungry now
  if (d === 'boss')     return 'hungry';   // recent: Boss tier renamed → Hungry
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
//  Phase-progress score
//  Measures how close the hand is to completing the phase. Higher = closer.
//  Counts the largest set/run/color the hand can build for each phase part,
//  plus 1 per wild card (wilds are universally useful).
//  This lets the AI judge whether a candidate card MEANINGFULLY advances
//  its plan, rather than just "matches something in hand".
// ─────────────────────────────────────────────
function phaseProgressScore(hand, phaseId) {
  const phaseObj = PHASES[phaseId - 1];
  if (!phaseObj) return 0;

  const wilds = hand.filter(c => c.type === 'wild').length;
  const numbers = hand.filter(c => c.type === 'number');
  const used = new Set();
  let total = 0;

  for (const part of phaseObj.parts) {
    const pool = numbers.filter(c => !used.has(c.id));

    if (part.type === 'set') {
      // Largest group by number
      const buckets = new Map();
      for (const c of pool) {
        if (!buckets.has(c.number)) buckets.set(c.number, []);
        buckets.get(c.number).push(c);
      }
      let best = [];
      for (const arr of buckets.values()) {
        if (arr.length > best.length) best = arr;
      }
      const take = Math.min(part.count, best.length);
      total += take;
      best.slice(0, take).forEach(c => used.add(c.id));
    }
    else if (part.type === 'color') {
      // Largest group by color
      const buckets = new Map();
      for (const c of pool) {
        if (!buckets.has(c.color)) buckets.set(c.color, []);
        buckets.get(c.color).push(c);
      }
      let best = [];
      for (const arr of buckets.values()) {
        if (arr.length > best.length) best = arr;
      }
      const take = Math.min(part.count, best.length);
      total += take;
      best.slice(0, take).forEach(c => used.add(c.id));
    }
    else if (part.type === 'run') {
      // Longest consecutive sequence (unique numbers)
      const uniqueNums = [...new Set(pool.map(c => c.number))].sort((a, b) => a - b);
      let bestLen = 0, bestEnd = -1;
      let runLen = 1, runStart = 0;
      for (let i = 1; i <= uniqueNums.length; i++) {
        if (i < uniqueNums.length && uniqueNums[i] === uniqueNums[i - 1] + 1) {
          runLen++;
        } else {
          if (runLen > bestLen) { bestLen = runLen; bestEnd = i - 1; }
          runStart = i;
          runLen = 1;
        }
      }
      const take = Math.min(part.count, bestLen);
      total += take;
      // Mark the cards used by the best run
      for (let i = 0; i < take; i++) {
        const num = uniqueNums[bestEnd - take + 1 + i];
        const c = pool.find(x => x.number === num && !used.has(x.id));
        if (c) used.add(c.id);
      }
    }
  }

  // Each wild contributes ~1 toward progress (versatile)
  total += wilds;
  return total;
}

// ─────────────────────────────────────────────
//  Draw source decision
//
//  Hungry rule: only take from discard if doing so STRICTLY ADVANCES phase
//  progress (or completes the phase, or is a wild). Then a final predictive
//  check ensures we never pick up a card we'd immediately discard back.
// ─────────────────────────────────────────────
function chooseDrawSource(ai, soloState, difficulty) {
  const top = soloState.topDiscard();
  if (!top) return 'draw';
  if (top.type === 'skip') return 'draw';

  // All difficulties: take discard if it would complete the phase NOW
  if (!ai.phaseDone) {
    const withTop = [...ai.hand, top];
    if (findPhaseLaydown(withTop, ai.phase)) return 'discard';
  } else if (canHitAnyMeld(top, soloState)) {
    return 'discard';
  }

  // All difficulties grab wilds from the discard — it's a no-brainer even for
  // casual players, and ignoring a wild would feel obviously dumb.
  if (top.type === 'wild') return 'discard';

  // Hungry + Boss: take from discard if it MEASURABLY advances phase progress
  // and we wouldn't just turn around and discard it back.
  if ((difficulty === 'sneaky' || difficulty === 'hungry') && !ai.phaseDone) {
    const before = phaseProgressScore(ai.hand, ai.phase);
    const after  = phaseProgressScore([...ai.hand, top], ai.phase);
    if (after > before) {
      const simAi = { ...ai, hand: [...ai.hand, top] };
      const simDiscard = chooseDiscard(simAi, soloState, difficulty);
      if (!simDiscard || simDiscard.id !== top.id) return 'discard';
    }
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
    const laydown = difficulty === 'hungry'
      ? findHungryLaydown(ai.hand, ai.phase, soloState)
      : findPhaseLaydown(ai.hand, ai.phase, { preferFewWilds: difficulty === 'sneaky' });
    if (laydown) {
      const usedIds = new Set(laydown.flat().map(c => c.id));
      unused = ai.hand.filter(c => !usedIds.has(c.id));
      if (!unused.length) unused = ai.hand;
    }
  }

  // Sort highest-point first
  const sorted = [...unused].sort((a, b) => cardPoints(b) - cardPoints(a));

  // ── Strategic AIs (Sneaky + Hungry): never discard a wild if any alternative,
  //     and pick the card that hurts our plan least and the opponent most. Hungry
  //     weights opponent-usefulness twice as heavily as Sneaky.
  if (difficulty === 'sneaky' || difficulty === 'hungry') {
    const nonWild = sorted.filter(c => c.type !== 'wild');
    if (nonWild.length === 0) return sorted[0]; // forced — hand is all wilds

    const nonWildNonSkip = nonWild.filter(c => c.type !== 'skip');
    const skipInHand = nonWild.find(c => c.type === 'skip');
    if (skipInHand && nextPlayerIsThreat(ai, soloState, difficulty)) return skipInHand;

    const candidates = nonWildNonSkip.length ? nonWildNonSkip : nonWild;
    const opUsefulWeight = difficulty === 'hungry' ? 2.0 : 0.6;
    const baseScore = ai.phaseDone ? 0 : phaseProgressScore(ai.hand, ai.phase);
    let best = candidates[0];
    let bestRank = -Infinity;
    for (const c of candidates) {
      const remaining = ai.hand.filter(x => x.id !== c.id);
      const progressLoss = ai.phaseDone
        ? 0
        : (baseScore - phaseProgressScore(remaining, ai.phase));
      const opUseful = opponentUsefulness(c, ai, soloState);
      const rank = (cardPoints(c) * 1)
                 - (progressLoss * 100)
                 - (opUseful * opUsefulWeight);
      if (rank > bestRank) { bestRank = rank; best = c; }
    }
    return best;
  }

  // ── Sleepy (Easy): never discard a wild if there's any non-wild option. ──
  // (Previous logic only checked sorted[0], so with 2+ wilds Sleepy would
  // discard the second wild — silly even for Easy mode.)
  const sleepyPick = sorted.find(c => c.type !== 'wild');
  return sleepyPick || sorted[0]; // fall back to a wild only if hand is all wilds
}

// Threat assessment: is the player who'd receive a skip about to win or already
// laid down and close to going out? Boss has a lower threshold — plays skips
// more aggressively.
function nextPlayerIsThreat(ai, soloState, difficulty) {
  const order = soloState.playerOrder || [];
  if (!order.length) return false;
  const myIdx = order.indexOf(ai.id);
  if (myIdx < 0) return false;
  const nextPid = order[(myIdx + 1) % order.length];
  const nextP   = soloState.players?.[nextPid];
  if (!nextP) return false;
  const myPhase = ai.phase || 1;
  const theirPhase = nextP.phase || 1;
  const theirCount = nextP.handCount || 0;
  if (difficulty === 'hungry') {
    if (nextP.phaseDone && theirCount <= 5) return true;
    if (theirPhase - myPhase >= 1) return true;
    return false;
  }
  // Hungry (medium):
  if (nextP.phaseDone && theirCount <= 4) return true;
  if (theirPhase - myPhase >= 2) return true;
  return false;
}

// How useful would this card be to the player whose turn comes next?
// Higher = more useful (better for them, worse for us to give away).
// Used by Hungry to avoid handing the next player exactly what they need.
function opponentUsefulness(card, ai, soloState) {
  if (card.type === 'skip') return 0;     // can't be picked up from discard
  if (card.type === 'wild') return 1000;  // always gold for anyone

  const order = soloState.playerOrder || [];
  const myIdx = order.indexOf(ai.id);
  if (myIdx < 0) return 0;
  const nextPid = order[(myIdx + 1) % order.length];
  const nextP   = soloState.players?.[nextPid];
  if (!nextP) return 0;

  const phase = nextP.phase || 1;
  const phaseObj = PHASES[phase - 1];
  if (!phaseObj) return 0;

  let score = 0;
  for (const part of phaseObj.parts) {
    if (part.type === 'set') {
      score += 30;
    } else if (part.type === 'run') {
      if (card.number >= 3 && card.number <= 10) score += 60;
      else score += 20;
    } else if (part.type === 'color') {
      score += 50;
    }
  }

  // TARGETED meld-hit penalty — instead of a flat +40 for "laid down", check if
  // THIS card can actually hit one of their melds. Way more accurate.
  if (nextP.phaseDone) {
    const meldsOfNext = soloState.melds?.[nextPid] || [];
    let canHitTheirMeld = false;
    for (const g of meldsOfNext) {
      if (canHit(card, g.cards || [], { type: g.partType })) {
        canHitTheirMeld = true;
        break;
      }
    }
    if (canHitTheirMeld) score += 150;  // very bad: directly extends their meld
  }

  // PICKUP MEMORY — if they recently picked this card up from the discard pile,
  // they want cards related to it. Penalise discarding anything that completes
  // a set, run, or color around what they grabbed.
  const lastPickup = nextP.lastDrawFromDiscard;
  if (lastPickup && lastPickup.type === 'number') {
    if (card.type === 'number') {
      if (card.number === lastPickup.number) score += 80;             // same number → set ammo
      if (card.color  === lastPickup.color)  score += 40;             // same color → color phase ammo
      const numGap = Math.abs(card.number - lastPickup.number);
      if (numGap === 1) score += 70;                                   // adjacent → run ammo
      else if (numGap === 2) score += 40;                              // near → run ammo with a wild
    }
  }

  return score;
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

// Should the strategic AI lay down its phase RIGHT NOW, or wait a turn?
// Laying down opens our melds to hits once opponents lay down their phases too.
// Boss is stricter than Hungry — any wild use + opponents laid down means delay.
function shouldStrategicallyLayDownNow(ai, laydown, soloState, difficulty) {
  if (!laydown) return false;
  const usedCount = laydown.flat().length;
  const remainingAfter = ai.hand.length - usedCount;

  if (remainingAfter <= 1) return true;          // can race to go out

  const players = soloState.players || {};
  const opponents = Object.entries(players)
    .filter(([pid]) => pid !== ai.id)
    .map(([, p]) => p);
  if (!opponents.length) return true;

  const closeThreshold = difficulty === 'hungry' ? 4 : 3;
  const anyClose = opponents.some(p => p.phaseDone && (p.handCount || 0) <= closeThreshold);
  if (anyClose) return true;

  const anyLaidDown = opponents.some(p => p.phaseDone);
  if (!anyLaidDown) return true;

  // Careful zone — opponents have laid down. Hungry plays aggressive Phase 10:
  // lay down ASAP since the opponent is also racing. Sneaky stays cautious.
  const wildsUsed = laydown.flat().filter(c => c.type === 'wild').length;
  if (difficulty === 'hungry') {
    // Hungry only delays in the most extreme cases — way too many wilds used AND
    // a fat hand remaining. Otherwise, race for the win.
    if (wildsUsed >= 3 && remainingAfter >= 6) return false;
  } else {
    // Sneaky stays cautious
    if (wildsUsed >= 2) return false;
    if (remainingAfter >= 4) return false;
  }
  return true;
}

// Find the laydown subset that LEAVES THE BEST REMAINING HAND.
// Hungry picks subsets that:
//   • result in an immediate or near go-out      (huge bonus)
//   • use the fewest wilds in the laydown        (saves them for later)
//   • leave the most wilds in hand               (flexibility for hits)
//   • leave the most skips in hand               (offensive cards)
//   • leave the most cards that can hit melds    (dump-ready)
function findHungryLaydown(hand, phaseId, soloState) {
  const phaseObj = PHASES[phaseId - 1];
  if (!phaseObj) return null;
  const need = phaseObj.parts.reduce((s, p) => s + p.count, 0);
  if (hand.length < need) return null;

  // Build a hypothetical melds map including this laydown so canHit calls
  // can see the cards we're laying down too.
  const baseMelds = soloState.melds || {};

  const combos = kCombinations(hand, need);
  let best = null;
  let bestScore = -Infinity;
  for (const combo of combos) {
    const result = validatePhase(combo, phaseId);
    if (!result) continue;
    const usedIds = new Set(result.flat().map(c => c.id));
    const remaining = hand.filter(c => !usedIds.has(c.id));

    // What melds will exist AFTER this laydown — the AI can hit its own melds too
    const ourMeldsAfter = result.map((cards, i) => ({
      cards,
      partType: phaseObj.parts[i].type,
    }));
    const hittableAfter = (card) => {
      if (card.type === 'skip') return false;
      for (const owner of Object.keys(baseMelds)) {
        for (const g of (baseMelds[owner] || [])) {
          if (canHit(card, g.cards || [], { type: g.partType })) return true;
        }
      }
      for (const g of ourMeldsAfter) {
        if (canHit(card, g.cards, { type: g.partType })) return true;
      }
      return false;
    };

    const wildsInLaydown   = result.flat().filter(c => c.type === 'wild').length;
    const wildsRemaining   = remaining.filter(c => c.type === 'wild').length;
    const skipsRemaining   = remaining.filter(c => c.type === 'skip').length;
    const hittableCount    = remaining.filter(c => hittableAfter(c)).length;

    // GO-OUT BONUS — the whole point of Phase 10 is going out first.
    // The fewer cards left, the closer we are. Massive bonus if we can dump
    // the rest as hits and discard one to finish.
    let goOutBonus = 0;
    const rem = remaining.length;
    if (rem === 1) {
      // Immediate go-out: lay down → discard the one remaining card. PERFECT.
      goOutBonus = 5000;
    } else if (rem === 2 && hittableCount >= 1) {
      // One hit + discard = go-out.
      goOutBonus = 3000;
    } else if (rem === 3 && hittableCount >= 2) {
      // Two hits + discard = go-out.
      goOutBonus = 1500;
    } else if (rem <= 4 && hittableCount >= rem - 1) {
      // Multi-hit go-out plausible.
      goOutBonus = 600;
    }

    const score = goOutBonus
                + wildsRemaining    * 60
                + skipsRemaining    * 25
                + hittableCount     * 30      // doubled — hits are how we go out
                - wildsInLaydown    * 40;
    if (score > bestScore) { bestScore = score; best = result; }
  }
  return best;
}

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
  sneaky: [
    '🦊 you didn\'t see that',
    '*Tippy slinks toward the discard*',
    'sneaky sneaky',
    'outfoxed by a pug',
    'let me just… slide this here',
    '👀 got my eye on you',
    'you won\'t notice this card missing',
    'sly as a pug',
    'I\'ll hide my plan, you guess',
    '*Tippy peeks*',
  ],
  hungry: [
    '🦴 MINE.',
    'time to FEAST',
    'I eat phases for breakfast',
    'the bones, the meat, all mine',
    '*Tippy crunches victoriously*',
    'I have not eaten in 47 turns. you LOSE.',
    '🍖 tasty discards, give me MORE',
    'MINE. MINE. MINE.',
    'feed me your losses',
    'I AM the bone master',
    'you cannot satisfy my hunger',
    'tippy says: bone appétit',
    'I will not be denied a meal',
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
    // Pick the laydown subset:
    //   Boss:   chooses the subset that leaves the best remaining hand
    //   Hungry: chooses the subset using the fewest wilds
    //   Sleepy: first valid subset found
    const laydown = difficulty === 'hungry'
      ? findHungryLaydown(ai.hand, ai.phase, soloState)
      : findPhaseLaydown(ai.hand, ai.phase, { preferFewWilds: difficulty === 'sneaky' });

    // Hungry + Boss are strategic about WHEN to lay down; Sleepy lays down ASAP.
    const isStrategic = (difficulty === 'sneaky' || difficulty === 'hungry');
    const willLayDown = laydown && (!isStrategic
      || shouldStrategicallyLayDownNow(ai, laydown, soloState, difficulty));
    if (willLayDown) {
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
