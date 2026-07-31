'use strict';
/* Looptrail — Goalpost 4: roguelike progression */

// ---------- helpers ----------
const $ = id => document.getElementById(id);
const rand = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;
const pick = arr => arr[rand(0, arr.length - 1)];
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = rand(0, i);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
const mod = (n, m) => ((n % m) + m) % m;

// ---------- content ----------
const ARTIFACTS = {
  satchel:   { name: 'Deep Satchel',      icon: '🎒', desc: '+1 max hand size.', shopOnly: true },
  quill:     { name: 'Oaken Quill',       icon: '🪶', desc: 'Draw an extra card each turn (up to your hand limit).', shopOnly: true },
  bond:      { name: "Merchant's Bond",   icon: '🧰', desc: 'A heavy strongbox: −1 max hand size while you carry it. The merchant buys it back at TRIPLE price when you complete the board.', shopOnly: true, refund3x: true },
  clover:    { name: 'Lucky Clover',      icon: '🍀', desc: '+1 coin whenever you gain coins (+2 while overcharged). Gains a charge on every quest you complete.', charges: 3 },
  idol:      { name: 'Green Idol',        icon: '🗿', desc: '+2 coins each time you complete a lap (+3 while overcharged), and every lap feeds it a charge.', charges: 3 },
  hourglass: { name: 'Patient Hourglass', icon: '⏳', desc: '+2 turn limit on every board.' },
  charm:     { name: 'Thief Charm',       icon: '🧿', desc: 'Thieves take only half as much when they spring on you. Cornering one feeds it a charge.', charges: 3 },
  ring:      { name: 'Bargain Ring',      icon: '💍', desc: 'Merchant prices reduced by 2 (min 1).' },
  seal:      { name: 'Quest Seal',        icon: '📜', desc: '+3 coins from every quest reward.' },
  compass:   { name: 'Old Compass',       icon: '🧭', desc: 'Gust tiles no longer restrict your direction.', charges: 3 },
  bell:      { name: 'Warning Bell',      icon: '🔔', desc: 'Hidden thief traps are revealed to you.', charges: 3 },
  map:       { name: "Cartographer's Map", icon: '🗺️', desc: '+1 coin whenever you step on a tile you have already visited (+2 while overcharged).', charges: 3 },
  warden:    { name: 'Warden Sigil',      icon: '🛡️', desc: 'While it holds, no other artifact spends charges — only the sigil itself.', charges: 3 },
  coffer:    { name: "Smuggler's Coffer", icon: '🧳', desc: 'On board completion you may keep a purchase instead of refunding it. Each item kept spends a charge.', charges: 3 },
  anchor:    { name: 'Iron Anchor',       icon: '⚓', desc: 'Slides and ferries become optional — you choose whether to be carried.' },
  resin:     { name: 'Amber Resin',       icon: '🍯', desc: 'Glass cards shatter only 5% of the time instead of 25%.' },
  // hidden-mode exclusives — they shape the animation system, nothing else
  egg_hourglass: { name: 'Hourglass of Indulgence', icon: '⌛', desc: 'Every animation lasts 3 seconds longer.', egg: true },
  egg_bell:      { name: "Siren's Bell",            icon: '🛎️', desc: 'Meeting any NPC plays a bonus animation.', egg: true },
  egg_prism:     { name: 'Echo Prism',              icon: '🔮', desc: 'Animations may echo: 25% chance a second one of the same length follows.', egg: true },
  egg_chain:     { name: 'Gilded Chain',            icon: '⛓️', desc: 'Coin losses play animations half again as long.', egg: true },
  egg_die:       { name: 'Velvet Die',              icon: '🎲', desc: 'Every animation gains 0–4 bonus seconds, rolled each time.', egg: true },
  egg_reel:      { name: 'Gathering Reel',          icon: '📽️', desc: 'Gains 3 charges at the end of every board and never spends them. Each board it plays an animation as long as its charge count.', egg: true, charges: 0, keepsCharges: true },
};

// artifacts that can hold charges; charge 0 is still a valid charge pool
const holdsCharges = id => ARTIFACTS[id].charges != null;
// stocked past its starting charge, a relic works harder
const overcharged = id => hasArt(id) && (S.artCharges[id] || 0) > ARTIFACTS[id].charges;

// feed a charge to a relic that thrives on a particular deed
function feedCharge(id) {
  if (!hasArt(id) || !holdsCharges(id)) return;
  S.artCharges[id] = (S.artCharges[id] || 0) + 1;
  floatText(S.pos, `${ARTIFACTS[id].icon}+`, 'good');
}

function addCharges(n) {
  const touched = S.artifacts.filter(holdsCharges);
  touched.forEach(id => { S.artCharges[id] = (S.artCharges[id] || 0) + n; });
  return touched.length;
}

function gainArtifact(id) {
  S.artifacts.push(id);
  if (holdsCharges(id)) S.artCharges[id] = ARTIFACTS[id].charges;
}

function artifactPool(src) {
  // src: 'tile' | 'shop' | 'reward'
  return Object.keys(ARTIFACTS).filter(id => {
    if (hasArt(id)) return false;
    const a = ARTIFACTS[id];
    if (a.egg && !EGG.active) return false;
    if (a.shopOnly && src !== 'shop') return false;
    // charge-limited relics are handed back at board end, so the merchant
    // would only be renting them out for a single board — not worth the price
    if (src === 'shop' && holdsCharges(id)) return false;
    return true;
  });
}

const SPECIALS = {
  echo:   { value: 0, name: 'Echo',      desc: 'Stay in place and trigger this tile again.' },
  charge: { value: 6, name: 'Charge',    desc: 'Move 6 tiles — clockwise only.' },
  cycle:  { value: 1, name: 'Cycle',     desc: 'Draw a card and discard a card, then move 1.' },
  sneak:  { value: 2, name: 'Soft Step', desc: 'Move 2 without triggering the tile you land on.' },
  stride: { value: 3, name: 'Stride',    desc: 'Move 3, then draw a card.', shopOnly: true },
  // glass cards are powerful but fragile: each use may shatter them for good
  leap:     { value: 3, name: 'Leap',      desc: 'Move 1, 2 or 3 — your choice, either way.', glass: true },
  longecho: { value: 0, name: 'Long Echo', desc: 'Stay put and trigger this tile twice more.', glass: true },
  shortcut: { value: 0, name: 'Shortcut',  desc: 'Travel straight to the nearest coin tile, either way.', glass: true },
  pace:     { value: 0, name: "Merchant's Pace", desc: 'Moves as far as the current turn number.' },
};

// Merchant's Pace grows with the board clock; everything else is fixed
const cardValue = c => c.spec === 'pace' ? Math.max(1, S.turn) : c.value;
const isGlass = c => !!(c.glass || (c.spec && SPECIALS[c.spec].glass));
const cardName = c => c.spec ? SPECIALS[c.spec].name : `${c.value}`;
const glassOdds = () => hasArt('resin') ? 0.05 : 0.25;

const PAWN_SVG = `
<svg viewBox="0 0 40 50" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="pawn-grad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#e0685c"/>
      <stop offset="1" stop-color="#9a2f26"/>
    </linearGradient>
  </defs>
  <ellipse cx="20" cy="46.5" rx="12" ry="2.8" fill="rgba(0,0,0,.30)"/>
  <rect x="8.5" y="37.5" width="23" height="7.5" rx="3.6" fill="url(#pawn-grad)" stroke="#5e1f1a" stroke-width="1.4"/>
  <path d="M15.8 17 C15.8 22 13.6 26.5 11.8 31 C10.9 33.4 10.4 35.6 10.3 38 H29.7 C29.6 35.6 29.1 33.4 28.2 31 C26.4 26.5 24.2 22 24.2 17 Z"
        fill="url(#pawn-grad)" stroke="#5e1f1a" stroke-width="1.4"/>
  <ellipse cx="20" cy="16.8" rx="5.4" ry="2.1" fill="url(#pawn-grad)" stroke="#5e1f1a" stroke-width="1.2"/>
  <circle cx="20" cy="10" r="7" fill="url(#pawn-grad)" stroke="#5e1f1a" stroke-width="1.4"/>
  <ellipse cx="17.2" cy="7.6" rx="2.1" ry="2.9" fill="#ffffff" opacity=".32"/>
</svg>`;

const TILE_ICONS = {
  start: '⌂', blank: '', coin: '🪙', loss: '🕳', artifact: '🏺',
  draw: '🃏', discard: '✂️', slide: '➤', gust: '🌀', quest: '★', trap: '', ferry: '⛵',
  boon: '⏱️', haste: '⌛', leech: '🕷️',
};

function startingDeck() {
  // 10 cards, randomized each run: 4 clockwise-only, 4 counterclockwise-only, 2 free
  const values = shuffle([1, 2, 2, 3, 3, 3, 3, 4, 4, 5]);
  return values.map((v, i) => {
    const c = { value: v };
    if (i < 4) c.dir = 1;
    else if (i < 8) c.dir = -1;
    return c;
  });
}

// ---------- save (rubber-band pacing) ----------
let saveData = {};
try { saveData = JSON.parse(localStorage.getItem('looptrail') || '{}'); } catch (e) {}
function saveBest(boardsCompleted) {
  saveData.best = Math.max(saveData.best || 0, boardsCompleted);
  try { localStorage.setItem('looptrail', JSON.stringify(saveData)); } catch (e) {}
}

// ---------- state ----------
let S = null;

const hasArt = id => S.artifacts.includes(id);
const maxHand = () => 5 + (hasArt('satchel') ? 1 : 0) - (hasArt('bond') ? 1 : 0);
const turnLimit = () => S.board.turnLimit + (hasArt('hourglass') ? 2 : 0) + S.turnMod;
// a finished quest is worth a quarter of the clock the board started with
const questTurnBonus = () => Math.max(1, Math.round((S.board.turnLimit + (hasArt('hourglass') ? 2 : 0)) / 4));

// ---------- board generation ----------
function makeBoard(b) {
  // rubber-band: after a decent previous run, the first boards are brisk
  const easy = (saveData.best || 0) >= 3 && b <= 2;
  const size = easy ? 14 : Math.min(24, 15 + b);

  // objective — never the same type twice in a row
  const lastType = (S && S.board) ? S.board.objective.type : null;
  // nothing here may hinge on completing a lap — the lap dial is a compass, not a scoreboard
  const types = ['coins', 'arts', 'quests', 'survive', 'visit', 'home'];
  if (S && S.coins >= 10) types.push('spend'); // needs a purse worth halving
  if (S) types.push('precision');
  if (EGG.active && EGG.gifs.length) types.push('film');
  const type = pick(types.filter(t => t !== lastType));

  let target, limit;
  switch (type) {
    case 'coins':   target = (S ? S.coins : 5) + (easy ? 7 : 9) + 2 * b; limit = 13 + Math.floor(b / 2); break;
    case 'arts':    target = b < 3 ? 1 : (b < 9 ? 2 : 3);      limit = 6 + target * 5; break;
    case 'quests':  target = b < 4 ? 1 : 2;                    limit = 6 + target * 7; break;
    case 'survive': target = 10 + b;                           limit = target + 2; break;
    case 'visit':   target = Math.min(size - 4, (easy ? 6 : 8) + b); limit = target + 5; break;
    case 'home':    target = b < 6 ? 2 : 3;                    limit = target * 5 + 2; break;
    case 'spend':   target = Math.round(S.coins / 2);          limit = 12 + Math.floor(b / 2); break;
    case 'precision': target = Math.max(3, S.coins + rand(4, 10)); limit = 14 + Math.floor(b / 2); break;
    case 'film':    target = 12 + 4 * b;                       limit = 14 + Math.floor(b / 2); break;
  }
  if (easy) limit += 2;
  const objective = { type, target };

  // tile bag: objective-critical tiles first, extras trimmed to fit
  const hell = type === 'survive'; // survival boards are meant to be brutal
  // coin values climb every board: 1-2 on board 1, 2-3 on board 2, and so on.
  // Boards that ask something of the purse get a wider spread so the target is reachable.
  const lo = Math.min(b, 14);
  const moneyBoard = type === 'coins' || type === 'spend' || type === 'precision';
  const coinAmt = () => moneyBoard ? rand(lo, lo + 3) : rand(lo, lo + 1);
  const lossAmt = () => moneyBoard ? rand(lo, lo + 2) : rand(lo, lo + 1);
  const crit = [], extra = [];
  const add = (list, tile, n) => { for (let i = 0; i < n; i++) list.push({ ...tile }); };
  const addEach = (list, make, n) => { for (let i = 0; i < n; i++) list.push(make()); };
  addEach(crit, () => ({ type: 'coin', amt: coinAmt() }), moneyBoard ? 5 : 2);
  if (moneyBoard) add(crit, { type: 'coin', amt: lo + 3 }, 1);
  add(crit, { type: 'artifact' }, type === 'arts' ? target + 1 : 1);
  add(crit, { type: 'draw' }, 1);
  // quest givers show up on most boards now, not just the ones that demand quests
  add(crit, { type: 'quest' }, type === 'quests' ? target + 1 : pick([0, 1, 1, 1, 2]));
  if (hell) {
    addEach(crit, () => ({ type: 'loss', amt: lossAmt() }), 3);
    add(crit, { type: 'loss', half: true }, 2);
    add(crit, { type: 'trap' }, 3 + (b > 5 ? 1 : 0));
  } else {
    addEach(extra, () => ({ type: 'loss', amt: lossAmt() }), 3 + Math.floor(b / 3));
    add(extra, { type: 'trap' }, 1 + (b > 5 ? 1 : 0));
  }
  add(extra, { type: 'tally' }, 1);
  add(extra, { type: 'leech' }, b > 2 ? 1 : 0);
  // time tiles: one grants turns, one sells them for coins
  add(crit, { type: 'boon', amt: 2 }, 1);
  add(extra, { type: 'boon', amt: 2 }, size > 18 ? 1 : 0);
  add(crit, { type: 'haste', amt: 2 }, 1);
  add(extra, { type: 'discard' }, 1);
  add(extra, { type: 'slide', amt: 2 }, 1 + (size > 18 ? 1 : 0));
  add(extra, { type: 'gust' }, 1 + (size > 20 ? 1 : 0));
  add(extra, { type: 'ferry' }, size > 16 ? 1 : 0);
  shuffle(extra);
  let bag = crit.concat(extra).slice(0, size - 1);
  while (bag.length < size - 1) bag.push({ type: 'blank' });
  shuffle(bag);
  const tiles = [{ type: 'start' }, ...bag];

  const merchant = (type === 'arts' || Math.random() < 0.6) ? { pos: rand(2, size - 2) } : null;
  // the whetstone shows up more often once the deck is getting bloated
  const deckSize = S ? S.draw.length + S.discard.length + S.hand.length : 10;
  const grinder = Math.random() < (deckSize > 13 ? 0.65 : 0.3) ? { pos: rand(2, size - 2) } : null;
  return { size, tiles, objective, turnLimit: limit, merchant, grinder, hardThief: hell };
}

function objectiveDesc() {
  const o = S.board.objective;
  switch (o.type) {
    case 'coins':   return `Build your purse up to ${o.target} coins.`;
    case 'arts':    return `Pick up ${o.target} artifact${o.target > 1 ? 's' : ''} on this board.`;
    case 'quests':  return `Complete ${o.target} quest${o.target > 1 ? 's' : ''}.`;
    case 'survive': return `Survive ${o.target} turns.`;
    case 'visit':   return `Visit ${o.target} different tiles.`;
    case 'home':    return `Land on the start tile ⌂ ${o.target} times.`;
    case 'spend':   return `Spend your way down to ${o.target} coins.`;
    case 'precision': return `Finish holding exactly ${o.target} coins.`;
    case 'film':    return `Sit through ${o.target} seconds of animation on this board.`;
  }
}

function objProgress() {
  const o = S.board.objective;
  switch (o.type) {
    case 'coins':   return S.coins;
    case 'arts':    return S.boardArts;
    case 'quests':  return S.boardQuests;
    case 'survive': return S.turn;
    case 'visit':   return S.visited.size;
    case 'home':    return S.homeLands;
    case 'spend':   return S.coins;
    case 'precision': return S.coins;
    case 'film':    return S.boardGifSecs;
  }
}

// most objectives count up to their target; these two read the purse instead
function objectiveMet() {
  const o = S.board.objective;
  if (o.type === 'spend') return S.coins <= o.target;
  if (o.type === 'precision') return S.coins === o.target;
  return objProgress() >= o.target;
}

function objectiveStatus() {
  const o = S.board.objective;
  if (o.type === 'spend' || o.type === 'precision' || o.type === 'coins') return `now ${S.coins} 🪙`;
  if (o.type === 'film') return `${S.boardGifSecs}s / ${o.target}s`;
  return `${Math.min(objProgress(), o.target)}/${o.target}`;
}

// ---------- run / board lifecycle ----------
function startRun() {
  S = {
    boardIndex: 1,
    pos: 0,
    turn: 0,
    net: 0,
    lapsDone: 0,
    coins: 5,
    tally: 0,         // run-wide stake carried by every tally stone
    artifacts: [],
    artCharges: {},   // boards left for charge-limited artifacts
    questsDone: 0,
    draw: shuffle(startingDeck()),
    discard: [],
    hand: [],
    selected: null,
    busy: false,
    over: false,
    forcedDir: 0,
    thieves: [],
    quest: null,
    questOffer: null,
    pendingDiscard: null,
    pendingGrind: false,
    purchases: [],
    boardCoins: 0,
    boardArts: 0,
    boardQuests: 0,
    homeLands: 0,
    turnMod: 0,       // turns gained/sold on this board
    echoAgain: 0,     // pending Long Echo re-triggers
    boardGifSecs: 0,  // animation seconds watched on this board
    visited: new Set([0]),
    msgs: [],
  };
  S.board = makeBoard(S.boardIndex);
  for (let i = 0; i < 2; i++) drawCard(true);
  $('menu').hidden = true;
  $('result').hidden = true;
  $('reward').hidden = true;
  $('game').hidden = false;
  buildBoardDOM();
  beginTurn(true);
}

function nextBoard() {
  S.boardIndex++;
  S.board = makeBoard(S.boardIndex);
  S.pos = 0;
  S.turn = 0;
  S.net = 0;
  S.lapsDone = 0;
  S.over = false;
  S.forcedDir = 0;
  S.thieves = [];
  S.quest = null;
  S.pendingDiscard = null;
  S.pendingGrind = false;
  S.purchases = [];
  S.boardCoins = 0;
  S.boardArts = 0;
  S.boardQuests = 0;
  S.homeLands = 0;
  S.turnMod = 0;
  S.echoAgain = 0;
  S.boardGifSecs = 0;
  S.visited = new Set([0]);
  S.draw = shuffle(S.draw.concat(S.discard, S.hand));
  S.discard = [];
  S.hand = [];
  for (let i = 0; i < 2; i++) drawCard(true);
  $('result').hidden = true;
  $('reward').hidden = true;
  buildBoardDOM();
  beginTurn(true);
}

// ---------- messages ----------
function setMsg(txt) { S.msgs = [txt]; renderMsg(); }
function addMsg(txt) { S.msgs.push(txt); if (S.msgs.length > 4) S.msgs.shift(); renderMsg(); }
function renderMsg() { $('center-msg').innerHTML = S.msgs.map(m => `<div>${m}</div>`).join(''); }

// ---------- coins ----------
// Every coin movement is announced. Changes landing in the same tick — several
// merchant refunds, say — share a single window, and in hidden mode the
// animations only start once that window is dismissed.
let coinBatch = [];
let coinFlush = null;

function addCoins(n, why, isQuest) {
  if (n > 0 && hasArt('clover')) n += overcharged('clover') ? 2 : 1;
  if (n > 0 && isQuest && hasArt('seal')) n += 3;
  S.coins += n;
  if (n > 0) S.boardCoins += n;
  if (n < 0) breakVow();
  if (n !== 0) {
    coinBatch.push({ n, why: why || (n > 0 ? 'You gain coins' : 'You lose coins') });
    if (!coinFlush) coinFlush = setTimeout(flushCoinBatch, 0);
  }
  renderHUD();
  const el = $('hud-coins');
  el.classList.remove('coin-flash');
  void el.offsetWidth;
  el.classList.add('coin-flash');
  if (S.coins < 0) {
    runLost('Your coins dropped below zero — the debt collectors end your run.');
    return false;
  }
  return true;
}

function flushCoinBatch() {
  coinFlush = null;
  const batch = coinBatch;
  coinBatch = [];
  if (!batch.length) return;
  const net = batch.reduce((s, e) => s + e.n, 0);
  const line = e => `${e.why} — ${e.n > 0 ? '+' : '−'}${Math.abs(e.n)} 🪙`;
  const body = batch.length === 1
    ? line(batch[0])
    : batch.map(line).join('\n') + `\n\nNet: ${net > 0 ? '+' : net < 0 ? '−' : ''}${Math.abs(net)} 🪙`;
  showNotice(net >= 0 ? '🪙' : '💸',
    net > 0 ? `You gained ${net} coins` : net < 0 ? `You lost ${Math.abs(net)} coins` : 'Coins changed hands',
    `${body}\n\nPurse: ${S.coins} 🪙`,
    // one animation per listed change, once the player has read the tally
    () => batch.forEach(e => eggCoinGif(e.n)));
}

// ---------- deck ----------
function drawCard(silent) {
  if (S.hand.length >= maxHand()) {
    if (!silent) addMsg('Hand is full — no card drawn.');
    return null;
  }
  if (S.draw.length === 0) {
    if (S.discard.length === 0) return null;
    S.draw = shuffle(S.discard);
    S.discard = [];
    addMsg('Discard pile shuffled back into the deck.');
  }
  const c = S.draw.pop();
  S.hand.push(c);
  return c;
}

const cardLabel = c => {
  // cards whose reach is chosen or variable read better without a number
  const fixed = !(c.spec === 'leap' || c.spec === 'shortcut' || c.spec === 'echo' || c.spec === 'longecho');
  const base = c.spec
    ? `${SPECIALS[c.spec].name}${fixed ? ` (${cardValue(c)})` : ''}`
    : `${c.value}`;
  return c.dir === 1 ? `${base} ↻` : c.dir === -1 ? `${base} ↺` : base;
};

function beginTurn(first) {
  if (S.over) return;
  S.turn++;
  S.msgs = [];
  if (first) {
    setMsg(`<b>Board ${S.boardIndex}${S.boardIndex > 10 ? ' ∞' : ''}</b> — ${objectiveDesc()}`);
  }
  const c = drawCard(true);
  addMsg(c ? `Turn ${S.turn} — you drew a ${cardLabel(c)}.` : `Turn ${S.turn} — hand full, no draw.`);
  if (hasArt('quill')) {
    const extra = drawCard(true);
    if (extra) addMsg(`🪶 Quill draws an extra ${cardLabel(extra)}.`);
  }
  // a gust can't lock the player out entirely (e.g. only Charge cards in hand)
  if (S.forcedDir && S.hand.length && S.hand.every(cd => reachableFrom(cd).length === 0)) {
    S.forcedDir = 0;
    addMsg('🌀 The gust dies down — you can move freely.');
  } else if (S.forcedDir) {
    addMsg(`🌀 The gust forces your next move ${S.forcedDir === 1 ? 'clockwise ↻' : 'counterclockwise ↺'}.`);
  }
  if (S.quest && S.quest.type === 'delivery') {
    if (S.turn > S.quest.deadline) {
      addMsg('🚩 Too late — the delivery quest failed.');
      S.quest = null;
    } else {
      addMsg(`🚩 Delivery: reach the flagged tile by turn ${S.quest.deadline}.`);
    }
  }
  if (S.quest && (S.quest.type === 'relay' || S.quest.type === 'rekindle')) {
    addMsg(`${S.quest.type === 'rekindle' ? '🔆 Flame' : '★ Relay'}: touch marked tile #${S.quest.next + 1} next.`);
  }
  if (S.quest && S.quest.type === 'vow') {
    // surviving past the deadline with the vow intact is the win
    if (S.turn > S.quest.deadline) completeQuest();
    else addMsg(`🕊️ Vow: hold on to your coins until turn ${S.quest.deadline}.`);
  }
  if (S.quest && S.quest.type === 'hunt') {
    if (S.turn > S.quest.deadline) {
      addMsg('🥷 The thief slipped away — the hunt is over.');
      S.quest = null;
    } else {
      addMsg(`🥷 Hunt: run down the thief by turn ${S.quest.deadline}.`);
    }
  }
  if (S.quest && S.quest.type === 'collection') {
    addMsg(`🧺 Collection: bring ${S.quest.due} coins back to the collector ★.`);
  }
  S.selected = null;
  renderAll();
}

// ---------- board DOM ----------
let tileEls = [];

function tileCenter(i) {
  const n = S.board.size;
  const angle = -Math.PI / 2 + (i / n) * Math.PI * 2;
  const r = 44;
  return { x: 50 + r * Math.cos(angle), y: 50 + r * Math.sin(angle) };
}

function tileSizePx() {
  const boardPx = $('board').clientWidth;
  const n = S.board.size;
  const circ = 2 * Math.PI * (boardPx * 0.44);
  return Math.max(30, Math.min(62, circ / n * (n > 19 ? 0.92 : 0.86)));
}

function buildBoardDOM() {
  const board = $('board');
  board.querySelectorAll('.tile, #player-token, .npc').forEach(el => el.remove());
  tileEls = [];
  for (let i = 0; i < S.board.size; i++) {
    const el = document.createElement('div');
    el.className = 'tile';
    el.dataset.i = i;
    el.addEventListener('click', () => onTileClick(i));
    board.appendChild(el);
    tileEls.push(el);
  }
  const token = document.createElement('div');
  token.id = 'player-token';
  token.innerHTML = PAWN_SVG;
  board.appendChild(token);
  if (S.board.merchant) {
    const m = document.createElement('div');
    m.className = 'npc merchant';
    m.id = 'npc-merchant';
    m.textContent = '🛒';
    board.appendChild(m);
  }
  if (S.board.grinder) {
    const g = document.createElement('div');
    g.className = 'npc grinder';
    g.id = 'npc-grinder';
    g.textContent = '🪓';
    board.appendChild(g);
  }
  layoutBoard();
  renderTiles();
}

// one token per thief on the board; they all stay until cornered
function syncThiefEls() {
  const board = $('board');
  const els = [...board.querySelectorAll('.npc.thief')];
  while (els.length < S.thieves.length) {
    const t = document.createElement('div');
    t.className = 'npc thief';
    t.textContent = '🥷';
    board.appendChild(t);
    els.push(t);
  }
  while (els.length > S.thieves.length) els.pop().remove();
  return els;
}

function layoutBoard() {
  const px = tileSizePx();
  $('board').style.setProperty('--tile-size', px + 'px');
  tileEls.forEach((el, i) => {
    const { x, y } = tileCenter(i);
    el.style.left = x + '%';
    el.style.top = y + '%';
  });
  positionToken();
  positionNPCs();
}

function positionToken() {
  const { x, y } = tileCenter(S.pos);
  const t = $('player-token');
  t.style.left = x + '%';
  t.style.top = y + '%';
}

function positionNPCs() {
  const m = document.getElementById('npc-merchant');
  if (m && S.board.merchant) {
    const { x, y } = tileCenter(S.board.merchant.pos);
    m.style.left = x + '%';
    m.style.top = y + '%';
  }
  const g = document.getElementById('npc-grinder');
  if (g) {
    if (S.board.grinder) {
      const { x, y } = tileCenter(S.board.grinder.pos);
      g.style.left = x + '%';
      g.style.top = y + '%';
      g.style.display = '';
    } else {
      g.style.display = 'none';
    }
  }
  syncThiefEls().forEach((el, i) => {
    const th = S.thieves[i];
    const { x, y } = tileCenter(th.pos);
    el.style.left = x + '%';
    el.style.top = y + '%';
    el.classList.toggle('loaded', th.loot > 0);
    el.innerHTML = th.loot > 0 ? `🥷<span class="loot">${th.loot}</span>` : '🥷';
  });
}

function renderTiles() {
  tileEls.forEach((el, i) => {
    const t = S.board.tiles[i];
    const hiddenTrap = t.type === 'trap' && !t.used;
    const sensed = hasArt('bell') || t.mapped;   // bell hears them, burnt map charts them
    const shownType = hiddenTrap && !sensed ? 'blank' : t.type;
    el.className = 'tile t-' + shownType + (t.used ? ' used' : '');
    let icon = TILE_ICONS[shownType] || '';
    if (t.type === 'trap' && t.used) icon = '⚠️';
    if (hiddenTrap && sensed) { icon = '⚠️'; el.classList.add('revealed'); }
    if (shownType === 'coin') {
      el.innerHTML = `<span class="coin-disc">${t.amt}</span>`;
    } else if (shownType === 'loss') {
      el.innerHTML = `<span class="loss-pit">${t.half ? '½' : '−' + t.amt}</span>`;
    } else if (shownType === 'tally') {
      el.innerHTML = `<span class="tally-stone">?${S.tally + 1}</span>`;
    } else {
      el.innerHTML = icon ? `<span>${icon}</span>` : '';
    }
    // visit objective: stamp the tiles you have already stepped on
    if (S.board.objective.type === 'visit' && S.visited.has(i)) {
      const v = document.createElement('div');
      v.className = 'v-badge';
      v.textContent = '✓';
      el.appendChild(v);
    }
    if (S.quest) {
      if (S.quest.type === 'relay' || S.quest.type === 'rekindle') {
        S.quest.targets.forEach((ti, k) => {
          if (ti === i && k >= S.quest.next) {
            el.classList.add('q-mark');
            const b = document.createElement('div');
            b.className = 'q-badge';
            b.textContent = k + 1;
            el.appendChild(b);
          }
        });
      } else if (S.quest.type === 'delivery' && S.quest.target === i) {
        el.classList.add('q-mark');
        const b = document.createElement('div');
        b.className = 'q-badge';
        b.textContent = '🚩';
        el.appendChild(b);
      } else if (S.quest.type === 'collection' && S.quest.giver === i) {
        el.classList.add('q-mark');
        const b = document.createElement('div');
        b.className = 'q-badge';
        b.textContent = '🧺';
        el.appendChild(b);
      }
    }
  });
}

window.addEventListener('resize', () => { if (S) layoutBoard(); });

// ---------- card selection & movement ----------
function reachableFrom(card) {
  const n = S.board.size;
  if (card.spec === 'echo' || card.spec === 'longecho') return [{ tile: S.pos, dir: 1, dist: 0 }];
  const opts = [];
  const push = (dist, dir) => {
    if (dist <= 0) return;
    if (S.forcedDir && S.forcedDir !== dir) return;   // a gust locks the direction
    if (card.dir && card.dir !== dir) return;         // one-way cards
    if (dir === -1 && card.spec === 'charge') return;
    const tile = mod(S.pos + dist * dir, n);
    if (!opts.some(o => o.tile === tile)) opts.push({ tile, dir, dist });
  };
  if (card.spec === 'leap') {
    for (const d of [1, 2, 3]) { push(d, 1); push(d, -1); }
    return opts;
  }
  if (card.spec === 'shortcut') {
    for (const dir of [1, -1]) {
      for (let d = 1; d < n; d++) {
        if (S.board.tiles[mod(S.pos + d * dir, n)].type === 'coin') { push(d, dir); break; }
      }
    }
    return opts;
  }
  const v = cardValue(card);
  push(v, 1);
  push(v, -1);
  return opts;
}

function selectCard(idx) {
  if (S.busy || S.over) return;
  S.selected = (S.selected === idx) ? null : idx;
  renderAll();
}

function tileInfo(t) {
  if (t.type === 'trap' && !t.used && !hasArt('bell')) return ['', 'An empty tile. Nothing happens.']; // stays secret
  switch (t.type) {
    case 'start':    return ['⌂ Start', 'The start tile — landing here counts as a return home.'];
    case 'blank':    return ['', 'An empty tile. Nothing happens.'];
    case 'coin':     return ['🪙 Coins', `Gain ${t.amt} coins when you land here.`];
    case 'loss':     return t.half ? ['💀 Pit', 'Lose HALF of your coins when you land here.'] : ['🕳 Toll', `Lose ${t.amt} coins when you land here.`];
    case 'artifact': return ['🏺 Artifact', t.used ? 'Already looted.' : 'One-time artifact pickup.'];
    case 'draw':     return ['🃏 Draw', t.used ? 'Already used.' : 'Draw a card (one-time).'];
    case 'discard':  return ['✂️ Discard', t.used ? 'Already used.' : 'Discard a card of your choice (one-time).'];
    case 'slide':    return ['➤ Slide', `Slides you ${t.amt} tiles onward in your direction of travel.`];
    case 'gust':     return ['🌀 Gust', 'A gust locks the direction of your next move.'];
    case 'boon':     return ['⏱️ Waystone', t.used ? 'Already claimed.' : `Grants ${t.amt} extra turns to finish the board (one-time).`];
    case 'haste':    return ['⌛ Time Broker', t.used ? 'Already traded.' : `Sells ${t.amt} of your remaining turns and pays you coins equal to the current turn number (one-time).`];
    case 'quest':    return ['★ Quest', t.done ? 'Quest completed.' : 'A quest giver — land here to hear the offer.'];
    case 'ferry':    return ['⛵ Ferry', 'Carries you straight to the far side of the loop.'];
    case 'trap':     return ['⚠️ Trap', t.used ? 'A sprung thief trap.' : 'A hidden thief trap — land here and a thief robs you on the spot.'];
    case 'leech':    return ['🕷️ Leech Nest', t.used ? 'Already drained.' : 'Drains one charge from a relic you carry.'];
    case 'tally': {
      const stake = S.tally + 1;
      return ['🪨 Tally Stone', `The stake stands at ${stake} coin${stake === 1 ? '' : 's'}. Land here and the stone takes it — or, one time in four, pays it instead. The stake then rises, and every tally stone in the run shares it.`];
    }
  }
  return ['', ''];
}

function onTileClick(i) {
  if (S.busy || S.over || S.pendingDiscard || S.pendingGrind) return;
  if (S.selected !== null) {
    const card = S.hand[S.selected];
    const opt = reachableFrom(card).find(o => o.tile === i);
    if (opt) { playCard(S.selected, opt); return; }
  }
  const [name, desc] = tileInfo(S.board.tiles[i]);
  setMsg(name ? `<b>${name}</b> — ${desc}` : desc);
}

function playCard(handIdx, opt) {
  const card = S.hand.splice(handIdx, 1)[0];
  // glass cards may not survive being played
  const shattered = isGlass(card) && Math.random() < glassOdds();
  if (!shattered) S.discard.push(card);
  S.selected = null;
  S.busy = true;
  S.forcedDir = 0;
  clearHighlights();
  renderHand();
  if (shattered) {
    // going out with a bang: the shards are worth the current board number
    const payout = S.boardIndex;
    let tale = `The glass gave way as you played it. That card is gone for the rest of the run, but the shards fetch ${payout} coins.`;
    if (card.spec === 'leap') {
      S.discard.push({ value: 1, shard: true });
      tale += ' One splinter stays usable as a Shard — a 1 that moves either way.';
    }
    showNotice('💥', `${cardName(card)} shattered`, tale);
    addCoins(payout, `You sell the shards of ${cardName(card)}`);
  }

  const exec = () => {
    if (card.spec === 'echo' || card.spec === 'longecho') {
      const twice = card.spec === 'longecho';
      if (twice) S.echoAgain = 1;
      setMsg(twice ? '⟳ Long Echo — you stay put and the tile triggers twice more.'
                   : '⟳ Echo — you stay put and the tile triggers again.');
      renderAll();
      setTimeout(() => resolveLanding(1, 0, false), 400);
      return;
    }
    setMsg(`Moved ${opt.dist} ${opt.dir === 1 ? 'clockwise ↻' : 'counterclockwise ↺'}.`);
    animateToken(S.pos, opt.tile, opt.dir, () => {
      moveTo(opt.tile, opt.dist * opt.dir);
      if (card.spec === 'stride') {
        const c = drawCard();
        if (c) addMsg(`🃏 Stride draws you a ${cardLabel(c)}.`);
      }
      if (S.over) return;
      resolveLanding(opt.dir, 0, card.spec === 'sneak');
    });
  };

  if (card.spec === 'cycle') {
    const c = drawCard();
    if (S.hand.length) {
      addMsg(c ? `♻ Cycle draws a ${cardLabel(c)} — now discard a card.` : '♻ Cycle: nothing to draw — discard a card.');
      S.pendingDiscard = exec;
      renderAll();
      return;
    }
  }
  exec();
}

function moveTo(tile, netDelta) {
  const revisit = S.visited.has(tile);
  S.pos = tile;
  S.net += netDelta;
  S.visited.add(tile);
  if (tile === 0) S.homeLands++;
  updateLaps();
  positionToken();
  renderHUD();
  renderLapDial();
  if (revisit && hasArt('map') && netDelta !== 0) {
    const pay = overcharged('map') ? 2 : 1;
    floatText(tile, `+${pay} 🪙`, 'good');
    addCoins(pay, '🗺️ The map pays for familiar ground');
  }
}

// ---------- yes/no prompt ----------
let choiceCont = null;
function askChoice(title, text, yes, no, cont) {
  $('choice-title').textContent = title;
  $('choice-text').textContent = text;
  $('btn-choice-yes').textContent = yes;
  $('btn-choice-no').textContent = no;
  choiceCont = cont;
  $('choice').hidden = false;
}
function answerChoice(ok) {
  $('choice').hidden = true;
  const cont = choiceCont;
  choiceCont = null;
  if (cont) cont(ok);
}

// ---------- event notices (queued, dismissed by tapping) ----------
const NOTICES = { queue: [], showing: false, current: null };

function showNotice(icon, title, text, after) {
  NOTICES.queue.push({ icon, title, text, after });
  pumpNotice();
}

function pumpNotice() {
  if (NOTICES.showing || !NOTICES.queue.length) return;
  NOTICES.showing = true;
  const n = NOTICES.queue.shift();
  NOTICES.current = n;
  $('notice-icon').textContent = n.icon;
  $('notice-title').textContent = n.title;
  $('notice-text').textContent = n.text;
  $('notice').hidden = false;
}

// stays up until the player taps it — never auto-dismissed
function closeNotice() {
  const n = NOTICES.current;
  NOTICES.current = null;
  $('notice').hidden = true;
  NOTICES.showing = false;
  if (n && n.after) n.after();
  setTimeout(pumpNotice, 200);
}

// floating effect text above a tile
function floatText(tile, txt, cls) {
  const { x, y } = tileCenter(tile);
  const el = document.createElement('div');
  el.className = 'float-txt' + (cls ? ' ' + cls : '');
  el.textContent = txt;
  el.style.left = x + '%';
  el.style.top = y + '%';
  $('board').appendChild(el);
  setTimeout(() => el.remove(), 950);
}

// hop the token tile-by-tile from its current position to `to`, then call done()
function animateToken(from, to, dir, done) {
  const n = S.board.size;
  const path = [];
  let p = from;
  while (p !== to) { p = mod(p + dir, n); path.push(p); }
  if (!path.length) { done(); return; }
  const stepMs = path.length > 4 ? 140 : 170;
  const token = $('player-token');
  let i = 0;
  const tick = () => {
    const { x, y } = tileCenter(path[i]);
    token.style.left = x + '%';
    token.style.top = y + '%';
    token.classList.remove('hop');
    void token.offsetWidth;
    token.classList.add('hop');
    i++;
    if (i < path.length) setTimeout(tick, stepMs);
    else setTimeout(() => { token.classList.remove('hop'); done(); }, stepMs + 80);
  };
  tick();
}

// A lap closes when the signed distance travelled since the last one covers the
// whole loop, in either direction. The sign of S.net is the direction currently
// being ridden, so a backward move stretches the lap instead of shortening it.
function updateLaps() {
  const n = S.board.size;
  while (Math.abs(S.net) >= n) {
    S.net -= Math.sign(S.net) * n;
    S.lapsDone++;
    addMsg('➰ Lap complete!');
    floatText(S.pos, '➰', 'good');
    if (hasArt('idol')) {
      const pay = overcharged('idol') ? 3 : 2;
      addMsg(`🗿 The Green Idol pays you ${pay} coins.`);
      feedCharge('idol');
      if (!addCoins(pay, '🗿 The Green Idol blesses a completed lap')) return;
    }
  }
}

function renderLapDial() {
  const dial = $('lap-dial');
  if (!S.net) { dial.hidden = true; return; }
  const cw = S.net > 0;
  dial.hidden = false;
  dial.classList.toggle('ccw', !cw);
  $('lap-arrow').textContent = cw ? '↻' : '↺';
  $('lap-count').textContent = S.board.size - Math.abs(S.net);
}

// ---------- tile resolution ----------
function resolveLanding(dir, depth, sneak) {
  if (S.over) return;
  // quest progress counts EVERY landing, including intermediate ones (slide/ferry hops)
  checkQuestAt(S.pos);
  const t = S.board.tiles[S.pos];
  const done = () => afterEffects();

  if (sneak) {
    addMsg('✧ Soft Step — the tile does not trigger.');
    done();
    return;
  }

  switch (t.type) {
    case 'coin':
      addMsg(`🪙 +${t.amt} coins.`);
      floatText(S.pos, `+${t.amt} 🪙`, 'good');
      if (!addCoins(t.amt, 'A coin cache on the trail')) return;
      break;
    case 'loss': {
      const lost = t.half ? Math.ceil(Math.max(0, S.coins) / 2) : t.amt;
      addMsg(t.half ? `💀 The pit swallows half your coins (−${lost}).` : `🕳 You lose ${t.amt} coins.`);
      floatText(S.pos, `−${lost} 🪙`, 'bad');
      if (lost > 0 && !addCoins(-lost, t.half ? 'A pit swallows half your purse' : 'A toll on the road')) return;
      break;
    }
    case 'artifact':
      if (!t.used) {
        t.used = true;
        const unowned = artifactPool('tile');
        S.boardArts++;
        if (unowned.length) {
          const id = pick(unowned);
          gainArtifact(id);
          addMsg(`🏺 Found artifact: ${ARTIFACTS[id].icon} ${ARTIFACTS[id].name}!`);
          floatText(S.pos, ARTIFACTS[id].icon, 'good');
          showNotice(ARTIFACTS[id].icon, `Artifact found: ${ARTIFACTS[id].name}`, ARTIFACTS[id].desc);
        } else {
          addMsg('🏺 The urn holds 3 coins.');
          floatText(S.pos, '+3 🪙', 'good');
          if (!addCoins(3, 'An urn with nothing but coins in it')) return;
        }
      }
      break;
    case 'draw':
      if (!t.used) {
        if (S.hand.length >= maxHand()) {
          addMsg('🃏 Hand full — the tile keeps its card for later.');
        } else {
          t.used = true;
          const c = drawCard();
          addMsg(c ? `🃏 You draw a ${cardLabel(c)}.` : '🃏 Nothing to draw.');
        }
      }
      break;
    case 'discard':
      if (!t.used && S.hand.length > 0) {
        t.used = true;
        addMsg('✂️ Choose a card to discard.');
        S.pendingDiscard = done;
        renderAll();
        return; // resumes when the player taps a card
      }
      break;
    case 'slide':
      if (depth < 3) {
        const dest = mod(S.pos + t.amt * dir, S.board.size);
        const ride = () => {
          addMsg(`➤ The tile slides you ${t.amt} further.`);
          animateToken(S.pos, dest, dir, () => {
            moveTo(dest, t.amt * dir);
            if (S.over) return;
            renderAll();
            resolveLanding(dir, depth + 1, false);
          });
        };
        if (hasArt('anchor')) {
          askChoice('➤ Slide', `This tile would carry you ${t.amt} further ${dir === 1 ? 'clockwise' : 'counterclockwise'}. Your anchor lets you refuse.`,
            'Let it carry me', 'Drop anchor',
            ok => ok ? ride() : (addMsg('⚓ You drop anchor and stay put.'), done()));
          return;
        }
        ride();
        return;
      }
      break;
    case 'boon':
      if (!t.used) {
        t.used = true;
        S.turnMod += t.amt;
        addMsg(`⏱️ A waystone — the road grants you ${t.amt} more turns.`);
        floatText(S.pos, `+${t.amt} ⏱️`, 'good');
        renderHUD();
      }
      break;
    case 'haste':
      if (!t.used) {
        t.used = true;
        // never sell the last turn out from under the player
        const cost = Math.min(t.amt, Math.max(0, turnLimit() - S.turn - 1));
        const paid = S.turn;
        S.turnMod -= cost;
        addMsg(`⌛ The time broker takes ${cost} turn${cost === 1 ? '' : 's'} and pays ${paid} coins.`);
        floatText(S.pos, `+${paid} 🪙`, 'good');
        renderHUD();
        if (paid > 0 && !addCoins(paid, `The time broker buys ${cost} turn${cost === 1 ? '' : 's'}`)) return;
      }
      break;
    case 'tally': {
      // one running stake for the whole run, shared by every tally stone
      const stake = ++S.tally;
      const pays = Math.random() < 0.25;
      addMsg(pays ? `🪨 The tally stone pays out ${stake} coins!` : `🪨 The tally stone claims ${stake} coins.`);
      floatText(S.pos, `${pays ? '+' : '−'}${stake} 🪙`, pays ? 'good' : 'bad');
      renderTiles();
      if (!addCoins(pays ? stake : -stake, pays ? 'The tally stone pays out' : 'The tally stone claims its due')) return;
      break;
    }
    case 'leech':
      if (!t.used) {
        t.used = true;
        const fed = S.artifacts.filter(id => holdsCharges(id) && (S.artCharges[id] || 0) > 0);
        if (!fed.length) {
          addMsg('🕷️ The nest finds nothing to drain.');
        } else {
          const victim = pick(fed);
          S.artCharges[victim]--;
          addMsg(`🕷️ The nest drains a charge from ${ARTIFACTS[victim].name}.`);
          floatText(S.pos, `${ARTIFACTS[victim].icon}−`, 'bad');
          if (S.artCharges[victim] <= 0) {
            S.artifacts = S.artifacts.filter(a => a !== victim);
            delete S.artCharges[victim];
            scatterAshes(victim);
          }
          renderAll();
        }
      }
      break;
    case 'gust':
      if (hasArt('compass')) {
        addMsg('🧭 Your compass steadies you against the gust.');
      } else {
        S.forcedDir = pick([1, -1]);
        addMsg(`🌀 A gust! Your next move must go ${S.forcedDir === 1 ? 'clockwise ↻' : 'counterclockwise ↺'}.`);
      }
      break;
    case 'trap':
      if (!t.used) {
        t.used = true;
        let amt = S.board.hardThief ? rand(6, 10) : rand(3, 6);
        if (hasArt('charm')) amt = Math.ceil(amt / 2);
        amt = Math.min(amt, Math.max(0, S.coins));   // it can empty your purse, never bury you
        // a fresh thief springs out right where you stand; any earlier ones stay out too
        S.thieves.push({ pos: S.pos, loot: amt, fresh: true });
        addMsg(amt ? `⚠️ A trap! A thief springs out and lifts ${amt} coins.`
                   : '⚠️ A trap! A thief springs out, finds your purse empty and stays put.');
        floatText(S.pos, amt ? `−${amt} 🪙` : '∅', 'bad');
        showNotice('🥷', amt ? `The thief takes ${amt} coins` : 'Nothing to steal',
          'It is standing on your tile. From your next move on it will bolt two tiles each turn, always the way that puts the most ground between you — land exactly on it, before it runs, to take everything back.');
        eggBonusGif();
        if (amt && !addCoins(-amt, 'A thief springs from a trap and robs you')) return;
      }
      break;
    case 'ferry': {
      if (depth < 3) {
        const dest = mod(S.pos + Math.floor(S.board.size / 2), S.board.size);
        const hop = Math.floor(S.board.size / 2);
        const sail = () => {
          addMsg('⛵ The ferry carries you to the far side of the loop.');
          animateToken(S.pos, dest, dir, () => {
            // the crossing covers real ground, so it counts toward the lap
            moveTo(dest, hop * dir);
            if (S.over) return;
            renderAll();
            resolveLanding(dir, depth + 1, false);
          });
        };
        if (hasArt('anchor')) {
          askChoice('⛵ Ferry', 'The ferry would take you straight across the loop. Your anchor lets you wave it off.',
            'Board the ferry', 'Drop anchor',
            ok => ok ? sail() : (addMsg('⚓ You drop anchor and let the ferry go.'), done()));
          return;
        }
        sail();
        return;
      }
      break;
    }
    case 'quest':
      if (!t.done && !S.quest) {
        offerQuest(S.pos, done);
        return;
      }
      break;
  }
  done();
}

function afterEffects() {
  if (S.over) return;
  renderAll();
  if (S.echoAgain > 0) {   // Long Echo: hit the same tile again before the turn ends
    S.echoAgain--;
    setTimeout(() => resolveLanding(1, 0, false), 420);
    return;
  }
  // caught only if you end your move on it — and not on the turn it sprang out
  const caught = S.thieves.find(t => !t.fresh && t.pos === S.pos);
  if (caught) {
    if (!meetThief(caught)) return;
    if (S.over) return;
  }
  if (S.board.grinder && S.board.grinder.pos === S.pos && S.hand.length) {
    eggBonusGif();
    askChoice('🪓 The Whetstone',
      'The grinder will either destroy a card outright, or grind one down to glass — fragile, but free of any one-way binding.',
      'Grind to dust', 'Temper to glass',
      dust => {
        S.grindMode = dust ? 'dust' : 'glass';
        S.pendingGrind = true;
        addMsg(dust ? '🪓 Choose the card to destroy.' : '🪓 Choose the card to temper.');
        renderAll();
      });
    return;
  }
  if (S.board.merchant && S.board.merchant.pos === S.pos) {
    openShop(() => finishTurn());
    return;
  }
  finishTurn();
}

function finishTurn() {
  if (S.over) return;
  moveNPCs();
  if (S.over) return;
  S.busy = false;
  if (!checkBoardEnd()) beginTurn();
}

// Landing on the thief before it runs gets the whole purse back.
// Returns false if the run ended.
function meetThief(thief) {
  const loot = thief.loot;
  eggBonusGif();
  addMsg(loot ? `🥷 You corner the thief and take back your ${loot} coins!` : '🥷 You corner the thief and it slips away empty-handed.');
  floatText(S.pos, loot ? `+${loot} 🪙` : '🥷', 'good');
  showNotice('🥷', 'Thief cornered', loot
    ? `You catch it flat-footed and recover all ${loot} coins.`
    : 'It had nothing on it, but at least it is gone.');
  S.thieves = S.thieves.filter(t => t !== thief);
  positionNPCs();
  if (hasArt('charm')) feedCharge('charm');
  if (loot && !addCoins(loot, 'You corner the thief and take your purse back')) return false;
  if (S.quest && S.quest.type === 'hunt' && S.turn <= S.quest.deadline) completeQuest();
  return true;
}

function moveNPCs() {
  const n = S.board.size;
  if (S.board.merchant) {
    S.board.merchant.pos = mod(S.board.merchant.pos + 1, n);
  }
  const gap = t => { const d = mod(t - S.pos, n); return Math.min(d, n - d); };
  for (const th of S.thieves) {
    if (th.fresh) {
      // the turn it appears it stays put, sharing your tile
      th.fresh = false;
      continue;
    }
    // two tiles whichever way opens the most ground between it and where you
    // now stand — and never onto your tile
    const cw = mod(th.pos + 2, n);
    const ccw = mod(th.pos - 2, n);
    if (cw === S.pos) th.pos = ccw;
    else if (ccw === S.pos) th.pos = cw;
    else th.pos = gap(cw) >= gap(ccw) ? cw : ccw;
  }
  positionNPCs();
}

// ---------- discard choice ----------
function onCardClick(idx) {
  if (S.pendingGrind) {
    const c = S.hand[idx];
    const was = cardLabel(c);
    if (S.grindMode === 'glass') {
      c.glass = true;
      delete c.dir;                       // tempering burns the one-way binding away
      S.hand.splice(idx, 1);
      S.discard.push(c);
      showNotice('🪓', `${was} tempered to glass`,
        'It now runs either way around the loop, but every use risks shattering it for good.');
    } else {
      S.hand.splice(idx, 1);              // destroyed, not discarded — gone for the run
      showNotice('🪓', `${was} destroyed`, 'The whetstone grinds it to dust. Your deck is one card leaner for the rest of the run.');
    }
    S.pendingGrind = false;
    S.board.grinder = null;               // its work done, the grinder packs up
    positionNPCs();
    renderAll();
    finishTurn();
    return;
  }
  if (S.pendingDiscard) {
    const c = S.hand.splice(idx, 1)[0];
    S.discard.push(c);
    addMsg(`✂️ Discarded a ${cardLabel(c)}.`);
    const cont = S.pendingDiscard;
    S.pendingDiscard = null;
    renderAll();
    cont();
    return;
  }
  selectCard(idx);
}

// ---------- quests ----------
function offerQuest(giverTile, cont) {
  eggBonusGif();
  const n = S.board.size;
  const bonus = 2 * (S.boardIndex - 1);
  const kinds = ['relay', 'delivery', 'vow'];
  if (artifactPool('reward').length && S.coins >= 6) kinds.push('collection');
  if (!S.board.hardThief || S.thieves.length) kinds.push('hunt');
  if (S.artifacts.some(holdsCharges)) kinds.push('rekindle');
  let q;
  switch (pick(kinds)) {
    case 'relay': {
      const count = rand(2, 3);
      const candidates = [];
      for (let i = 0; i < n; i++) {
        if (i !== giverTile && S.board.tiles[i].type !== 'quest') candidates.push(i);
      }
      shuffle(candidates);
      q = { type: 'relay', giver: giverTile, targets: candidates.slice(0, count), next: 0, reward: 4 + count * 2 + bonus };
      $('quest-text').textContent = `“Touch the ${count} marked tiles in order — I'll pay you ${q.reward} coins.”`;
      break;
    }
    case 'delivery': {
      const target = mod(giverTile + rand(5, n - 5), n);
      const turns = rand(3, 4);
      q = { type: 'delivery', giver: giverTile, target, deadline: S.turn + turns, reward: 7 + bonus };
      $('quest-text').textContent = `“Deliver this parcel to the flagged tile within ${turns} turns — ${q.reward} coins on delivery.”`;
      break;
    }
    case 'vow': {
      const turns = rand(3, 5);
      q = { type: 'vow', giver: giverTile, deadline: S.turn + turns, reward: 8 + bonus };
      $('quest-text').textContent = `“Walk ${turns} turns without losing a single coin to the road — tolls, pits, thieves. Spending at the merchant is fair game. ${q.reward} coins if you keep the vow.”`;
      break;
    }
    case 'collection': {
      const due = 5 + Math.floor(S.coins / 6) + S.boardIndex;
      q = { type: 'collection', giver: giverTile, due, reward: 0 };
      $('quest-text').textContent = `“Bring me ${due} coins — hand them over and I'll part with one of my relics instead of coin.”`;
      break;
    }
    case 'hunt': {
      const turns = rand(4, 6);
      q = { type: 'hunt', giver: giverTile, deadline: S.turn + turns, reward: 12 + bonus };
      $('quest-text').textContent = `“A thief prowls this loop. Run it down within ${turns} turns and ${q.reward} coins are yours.”`;
      break;
    }
    case 'rekindle': {
      const count = rand(2, 3);
      const candidates = [];
      for (let i = 0; i < n; i++) {
        if (i !== giverTile && S.board.tiles[i].type !== 'quest') candidates.push(i);
      }
      shuffle(candidates);
      q = { type: 'rekindle', giver: giverTile, targets: candidates.slice(0, count), next: 0, reward: 0 };
      $('quest-text').textContent = `“Carry my flame past the ${count} marked tiles and I'll rekindle every relic you hold — one charge apiece. No coin, just fire.”`;
      break;
    }
  }
  const gained = questTurnBonus();
  $('quest-text').textContent += `\n\nAny quest you finish also grants ${gained} extra turn${gained === 1 ? '' : 's'} on this board.`;
  S.questOffer = { quest: q, cont };
  $('quest').hidden = false;
}

function acceptQuest() {
  S.quest = S.questOffer.quest;
  const cont = S.questOffer.cont;
  S.questOffer = null;
  $('quest').hidden = true;
  addMsg('★ Quest accepted!');
  // a hunt needs prey: if no thief is about, one is flushed out of hiding
  if (S.quest.type === 'hunt' && !S.thieves.length) {
    S.thieves.push({ pos: mod(S.pos + Math.floor(S.board.size / 2), S.board.size), loot: rand(3, 6), fresh: false });
    addMsg('🥷 A thief breaks cover across the loop, someone else\'s purse in hand.');
  }
  renderAll();
  cont();
}

function declineQuest() {
  const cont = S.questOffer.cont;
  S.questOffer = null;
  $('quest').hidden = true;
  cont();
}

function checkQuestAt(pos) {
  if (!S.quest) return;
  const q = S.quest;
  if (q.type === 'relay' || q.type === 'rekindle') {
    if (q.targets[q.next] === pos) {
      q.next++;
      if (q.next >= q.targets.length) completeQuest();
      else addMsg(`★ Marked tile touched — next is #${q.next + 1}.`);
    }
  } else if (q.type === 'delivery') {
    if (q.target === pos && S.turn <= q.deadline) completeQuest();
  } else if (q.type === 'collection') {
    if (pos === q.giver && S.coins >= q.due) completeQuest();
  }
}

// the pilgrim's vow breaks the moment coins are lost for any reason
function breakVow() {
  if (S.quest && S.quest.type === 'vow') {
    S.quest = null;
    addMsg('🚩 A coin slips away — the vow is broken.');
    showNotice('🚩', 'Vow broken', 'You lost coins before the vow ran its course. The quest is off.');
  }
}

function completeQuest() {
  const q = S.quest;
  S.quest = null;
  S.questsDone++;
  S.boardQuests++;
  feedCharge('clover');
  const gt = S.board.tiles[q.giver];
  if (gt && gt.type === 'quest') { gt.done = true; gt.used = true; }
  renderTiles();

  // whatever else it pays, a finished quest always buys you time
  const gained = questTurnBonus();
  S.turnMod += gained;
  addMsg(`⏱️ The quest buys you ${gained} more turn${gained === 1 ? '' : 's'}.`);
  floatText(S.pos, `+${gained} ⏱️`, 'good');
  const timeLine = `\n\n⏱️ It also buys you ${gained} more turn${gained === 1 ? '' : 's'} on this board.`;
  renderHUD();

  if (q.type === 'rekindle') {
    // paid in charges rather than coin
    const touched = addCharges(1);
    addMsg(`★ The keeper rekindles ${touched} artifact${touched === 1 ? '' : 's'}.`);
    showNotice('🔆', 'Artifacts rekindled',
      (touched ? `Every relic you carry that holds charges gained one. (${touched} rekindled.)`
               : 'You carry nothing that holds a charge — the keeper shrugs and wishes you luck.') + timeLine);
    renderAll();
    return;
  }

  if (q.type === 'collection') {
    // paid in relics, not coin: the collector takes the purse and hands over an artifact
    const pool = artifactPool('reward');
    addMsg(`★ You hand over ${q.due} coins.`);
    floatText(S.pos, `−${q.due} 🪙`, 'bad');
    const traded = pool.length ? pick(pool) : null;
    addCoins(-q.due, traded ? `You hand the collector your coins for ${ARTIFACTS[traded].name}` : 'You hand the collector your coins');
    if (traded) {
      gainArtifact(traded);
      S.boardArts++;
      showNotice(ARTIFACTS[traded].icon, `Traded for ${ARTIFACTS[traded].name}`, ARTIFACTS[traded].desc + timeLine);
    } else {
      showNotice('★', 'Collection complete', 'The collector has nothing left worth trading, and returns half your coins.' + timeLine);
      addCoins(Math.floor(q.due / 2), 'The collector returns half, having nothing to trade');
    }
    if (S.coins < 0) { runLost('Your coins dropped below zero — the debt collectors end your run.'); return; }
    return;
  }

  addMsg(`★ Quest complete! +${q.reward} coins.`);
  floatText(S.pos, `+${q.reward} 🪙`, 'good');
  showNotice('★', 'Quest complete!',
    `The quest giver pays you ${q.reward} coins${hasArt('seal') ? ' (+3 from the Quest Seal)' : ''}.` + timeLine);
  addCoins(q.reward, 'A quest giver pays out', true);
}

// ---------- merchant shop ----------
let shopCont = null;

function shopStock() {
  if (!S.board.shopStock) {
    const stock = [];
    const markup = (S.boardIndex - 1) * 2;        // merchant prices climb with each board
    const smallMarkup = S.boardIndex - 1;
    const unowned = shuffle(artifactPool('shop').filter(id => id !== 'bond'));
    if (!hasArt('bond') && Math.random() < 0.45) {
      stock.push({ kind: 'artifact', id: 'bond', price: rand(7, 9) + markup });
    }
    if (unowned[0]) stock.push({ kind: 'artifact', id: unowned[0], price: rand(8, 10) + markup });
    if (unowned[1] && stock.length < 3 && Math.random() < 0.5) stock.push({ kind: 'artifact', id: unowned[1], price: rand(8, 10) + markup });
    // charges are worth stocking only if the player has something to pour them into
    if (S.artifacts.some(holdsCharges) && stock.length < 3 && Math.random() < 0.7) {
      stock.push({ kind: 'charge', price: rand(7, 9) + smallMarkup });
    }
    while (stock.length < 3) {
      if (Math.random() < 0.3) {
        stock.push({ kind: 'special', id: pick(Object.keys(SPECIALS)), price: rand(6, 8) + smallMarkup });
      } else {
        const v = pick([2, 3, 4]);
        stock.push({ kind: 'card', card: { value: v }, price: 3 + v + smallMarkup });
      }
    }
    S.board.shopStock = stock;
  }
  return S.board.shopStock;
}

function priceOf(item) {
  return hasArt('ring') ? Math.max(1, item.price - 2) : item.price;
}

function openShop(cont) {
  shopCont = cont;
  eggBonusGif();
  renderShop();
  $('shop').hidden = false;
}

function renderShop() {
  const wrap = $('shop-items');
  wrap.innerHTML = '';
  shopStock().forEach((item, i) => {
    const div = document.createElement('div');
    div.className = 'shop-item' + (item.sold ? ' sold' : '');
    const p = priceOf(item);
    let name, desc;
    if (item.kind === 'artifact') {
      const a = ARTIFACTS[item.id];
      name = `${a.icon} ${a.name}`;
      desc = a.desc;
    } else if (item.kind === 'charge') {
      name = '🔆 Vial of Embers';
      desc = `+1 charge to every artifact you carry that holds them (${S.artifacts.filter(holdsCharges).length} right now). Permanent — not refunded at board end.`;
    } else if (item.kind === 'special') {
      const sp = SPECIALS[item.id];
      name = `🂠 ${sp.name} card`;
      desc = sp.desc + ' (this board only)';
    } else {
      name = `🂠 Movement card ${item.card.value}`;
      desc = `Adds a ${item.card.value} to your deck for this board.`;
    }
    div.innerHTML = `<div class="info"><div class="name">${name}</div><div class="desc">${desc}</div></div>`;
    const btn = document.createElement('button');
    btn.className = 'btn';
    btn.textContent = item.sold ? 'Sold' : `${p} 🪙`;
    if (item.sold || S.coins < p) btn.disabled = true;
    btn.addEventListener('click', () => buyItem(i));
    div.appendChild(btn);
    wrap.appendChild(div);
  });
}

function buyItem(i) {
  const item = shopStock()[i];
  const p = priceOf(item);
  if (item.sold || S.coins < p) return;
  item.sold = true;
  let bought;
  if (item.kind === 'charge') {
    const touched = addCharges(1);   // no entry in purchases: embers are burned, not lent
    bought = 'a Vial of Embers';
    addMsg(`🔆 The embers recharge ${touched} artifact${touched === 1 ? '' : 's'}.`);
  } else if (item.kind === 'artifact') {
    gainArtifact(item.id);
    S.boardArts++;
    S.purchases.push({ kind: 'artifact', id: item.id, cost: p });
    bought = `${ARTIFACTS[item.id].icon} ${ARTIFACTS[item.id].name}`;
    addMsg(`Bought ${bought} (refunded on board win).`);
  } else {
    const card = item.kind === 'special'
      ? { value: SPECIALS[item.id].value, spec: item.id }
      : item.card;
    S.purchases.push({ kind: 'card', card, cost: p });
    S.discard.push(card);
    bought = `a ${cardLabel(card)} card`;
    addMsg(`Bought ${bought} (refunded on board win).`);
  }
  addCoins(-p, `You buy ${bought} from the merchant`);
  renderShop();
  renderAll();
}

function closeShop() {
  $('shop').hidden = true;
  const cont = shopCont;
  shopCont = null;
  if (cont) cont();
}

function refundPurchases() {
  if (!S.purchases.length) return '';
  let total = 0;
  for (const pu of S.purchases) {
    const value = (pu.kind === 'artifact' && ARTIFACTS[pu.id].refund3x) ? pu.cost * 3 : pu.cost;
    total += value;
    let what;
    if (pu.kind === 'artifact') {
      what = `${ARTIFACTS[pu.id].icon} ${ARTIFACTS[pu.id].name}`;
      S.artifacts = S.artifacts.filter(id => id !== pu.id);
      delete S.artCharges[pu.id];
    } else {
      what = `a ${cardLabel(pu.card)} card`;
      for (const pile of [S.draw, S.discard, S.hand]) {
        const k = pile.indexOf(pu.card);
        if (k >= 0) { pile.splice(k, 1); break; }
      }
    }
    // each item lands as its own line in the tally, and its own animation
    addCoins(value, `You return ${what} to the merchant${value > pu.cost ? ' at triple price' : ''}`);
  }
  S.purchases = [];
  return ` The merchant takes back your purchases and refunds ${total} coins.`;
}

// ---------- objective / win / loss ----------
function checkBoardEnd() {
  if (objectiveMet()) { boardWon(); return true; }
  if (S.turn >= turnLimit()) {
    runLost(`You ran out of turns on board ${S.boardIndex}.`);
    return true;
  }
  return false;
}

// the coffer lets the player smuggle purchases past the merchant, one charge each
function settlePurchases(done) {
  const canSmuggle = hasArt('coffer') && (S.artCharges.coffer || 0) > 0;
  if (!canSmuggle || !S.purchases.length) { done(refundPurchases()); return; }
  const queue = [...S.purchases];
  let kept = 0;
  const step = () => {
    if (!queue.length || (S.artCharges.coffer || 0) <= 0) {
      let note = refundPurchases();
      if (kept) note += ` 🧳 You smuggle ${kept} purchase${kept === 1 ? '' : 's'} out with you.`;
      done(note);
      return;
    }
    const pu = queue.shift();
    const label = pu.kind === 'artifact'
      ? `${ARTIFACTS[pu.id].icon} ${ARTIFACTS[pu.id].name}`
      : `a ${cardLabel(pu.card)} card`;
    askChoice('🧳 Smuggler\'s Coffer',
      `Keep ${label} for the rest of the run? It spends one coffer charge (${S.artCharges.coffer} left) and you give up the ${pu.cost}-coin refund.`,
      'Keep it', 'Take the refund',
      ok => {
        if (ok) {
          S.purchases = S.purchases.filter(p => p !== pu);
          S.artCharges.coffer--;
          kept++;
          if (S.artCharges.coffer <= 0) {
            S.artifacts = S.artifacts.filter(a => a !== 'coffer');
            delete S.artCharges.coffer;
            showNotice('🧳', 'Coffer worn out', 'The coffer splinters after its third smuggled prize. It is gone from your run.');
          }
        }
        step();
      });
  };
  step();
}

// a spent relic leaves something behind rather than just a refund
function scatterAshes(id) {
  const a = ARTIFACTS[id];
  let tale;
  switch (id) {
    case 'bell':
      S.discard.push({ value: 2 });
      tale = 'Its clapper cools into a movement card 2, which joins your deck.';
      break;
    case 'map':
      S.board.tiles.forEach(t => { if (t.type === 'trap') t.mapped = true; });
      tale = 'Its last ink bleeds across the parchment, marking every trap still hidden on this board.';
      break;
    case 'compass':
      S.turnMod += 2;
      tale = 'The needle spins itself out and buys you 2 extra turns.';
      break;
    case 'clover':
      addCoins(9, `${a.name} crumbles into coins`);
      tale = 'The withered leaves crumble into 9 coins.';
      break;
    default:
      addCoins(5, `${a.name} is bought back as a spent husk`);
      tale = 'The spirits of the trail buy the husk back for 5 coins.';
  }
  showNotice(a.icon, `${a.name} burned out`, tale);
  return `⏳ ${a.name} burned out. ${tale}`;
}

// one charge spent per completed board, unless something shields them
function burnCharges() {
  let note = '';
  const warded = hasArt('warden') && (S.artCharges.warden || 0) > 0;
  for (const id of [...S.artifacts]) {
    if (!holdsCharges(id)) continue;
    if (ARTIFACTS[id].keepsCharges) {         // gathers charges instead of spending them
      S.artCharges[id] = (S.artCharges[id] || 0) + 3;
      if (EGG.active) eggEnqueue(S.artCharges[id], false);
      continue;
    }
    if (warded && id !== 'warden') continue;  // the sigil takes the toll for everyone
    S.artCharges[id] = (S.artCharges[id] || 1) - 1;
    if (S.artCharges[id] <= 0) {
      S.artifacts = S.artifacts.filter(a => a !== id);
      delete S.artCharges[id];
      note += ' ' + scatterAshes(id);
    }
  }
  if (warded) note += ' 🛡️ The Warden Sigil bore the cost — your other relics kept their charges.';
  return note;
}

function boardWon() {
  S.over = true;
  saveBest(S.boardIndex);
  const spare = Math.max(0, turnLimit() - S.turn);   // measured before ashes tinker with the clock
  settlePurchases(refundNote => {
    const expiredNote = burnCharges();
    // the time you did not need is paid out in coin
    if (spare) addCoins(spare, `You finish with ${spare} turn${spare === 1 ? '' : 's'} to spare`);
    renderAll();
    showNotice('🏁', `Board ${S.boardIndex} complete!`,
      `${objectiveDesc()} Done with ${spare} turn${spare === 1 ? '' : 's'} to spare.` +
      (spare ? `\n\n⏱️ Unused time pays out: +${spare} coins.` : ''));
    showReward(refundNote + expiredNote + (spare ? ` ⏱️ ${spare} unused turn(s) paid out ${spare} coins.` : ''));
  });
}

function runLost(reason) {
  S.over = true;
  S.busy = false;
  saveBest(S.boardIndex - 1);
  $('shop').hidden = true;
  $('quest').hidden = true;
  renderAll();
  showResult(
    'Run Over',
    `${reason}\n\nBoards completed: ${S.boardIndex - 1}\nCoins: ${S.coins} · Artifacts: ${S.artifacts.length} · Quests: ${S.questsDone}\n\nThe run starts over from board 1.`,
    'New Run',
    () => { $('result').hidden = true; startRun(); }
  );
}

let resultAction = null;
function showResult(title, text, btnLabel, action) {
  $('result-title').textContent = title;
  $('result-text').textContent = text;
  $('btn-result').textContent = btnLabel;
  resultAction = action;
  $('result').hidden = false;
}

// ---------- rewards ----------
function buildRewardOffers() {
  const offers = [];
  const unowned = shuffle(artifactPool('reward'));
  const specs = shuffle(Object.keys(SPECIALS).filter(id => !SPECIALS[id].shopOnly));
  if (unowned[0]) offers.push({ kind: 'artifact', id: unowned[0] });
  offers.push({ kind: 'special', id: specs[0] });
  if (unowned[1] && Math.random() < 0.5) offers.push({ kind: 'artifact', id: unowned[1] });
  else if (Math.random() < 0.6) offers.push({ kind: 'special', id: specs[1] });
  else offers.push({ kind: 'card', value: pick([4, 5]) });
  while (offers.length < 3) offers.push({ kind: 'card', value: pick([3, 4, 5]) });
  return offers;
}

function showReward(refundNote) {
  const finished10 = S.boardIndex === 10;
  $('reward-title').textContent = finished10 ? '🏆 Trail Complete!' : `Board ${S.boardIndex} Complete!`;
  $('reward-text').textContent =
    (finished10 ? 'You conquered all 10 boards — endless mode begins, and the trail only gets harder. ' : '') +
    `Done with ${turnLimit() - S.turn} turn(s) to spare.` + refundNote;
  const wrap = $('reward-items');
  wrap.innerHTML = '';
  buildRewardOffers().forEach(offer => {
    const div = document.createElement('div');
    div.className = 'shop-item';
    let name, desc;
    if (offer.kind === 'artifact') {
      const a = ARTIFACTS[offer.id];
      name = `${a.icon} ${a.name}`;
      desc = a.desc;
    } else if (offer.kind === 'special') {
      const sp = SPECIALS[offer.id];
      name = `🂠 ${sp.name} card (${sp.value})`;
      desc = sp.desc;
    } else {
      name = `🂠 Movement card ${offer.value}`;
      desc = `A sturdy ${offer.value} for your deck.`;
    }
    div.innerHTML = `<div class="info"><div class="name">${name}</div><div class="desc">${desc}</div></div>`;
    const btn = document.createElement('button');
    btn.className = 'btn';
    btn.textContent = 'Take';
    btn.addEventListener('click', () => {
      if (offer.kind === 'artifact') gainArtifact(offer.id);
      else if (offer.kind === 'special') S.discard.push({ value: SPECIALS[offer.id].value, spec: offer.id });
      else S.discard.push({ value: offer.value });
      nextBoard();
    });
    div.appendChild(btn);
    wrap.appendChild(div);
  });
  $('reward').hidden = false;
}

// ---------- rendering ----------
function clearHighlights() {
  tileEls.forEach(el => {
    el.classList.remove('reachable');
    el.querySelectorAll('.dir-badge').forEach(b => b.remove());
  });
}

function renderHighlights() {
  clearHighlights();
  if (S.selected === null || S.pendingDiscard || S.pendingGrind) return;
  const card = S.hand[S.selected];
  reachableFrom(card).forEach(o => {
    const el = tileEls[o.tile];
    el.classList.add('reachable');
    const b = document.createElement('div');
    b.className = 'dir-badge';
    b.textContent = o.dir === 1 ? '↻' : '↺';
    el.appendChild(b);
  });
}

function renderHand() {
  const hand = $('hand');
  hand.innerHTML = '';
  S.hand.forEach((c, i) => {
    const el = document.createElement('div');
    el.className = 'card'
      + (c.spec ? ' special' : '')
      + (isGlass(c) ? ' glass' : '')
      + (S.selected === i && !S.pendingDiscard ? ' selected' : '');
    const dirMark = c.dir === 1 ? '<div class="cdir">↻</div>' : c.dir === -1 ? '<div class="cdir ccw">↺</div>' : '';
    // cards without a fixed distance show a glyph instead of a number
    const free = c.spec === 'leap' || c.spec === 'shortcut';
    const face = c.spec === 'leap' ? '⁙' : c.spec === 'shortcut' ? '⇢' : cardValue(c);
    el.dataset.v = free ? '' : cardValue(c);
    const label = c.spec ? SPECIALS[c.spec].name : (c.shard ? 'Shard' : (c.glass ? 'Tempered' : ''));
    el.innerHTML = `<div class="val">${face}</div>` + (label ? `<div class="name">${label}</div>` : '') + dirMark;
    el.addEventListener('click', () => onCardClick(i));
    hand.appendChild(el);
  });
  const sel = S.selected !== null ? S.hand[S.selected] : null;
  $('hand-hint').textContent = S.pendingGrind
    ? (S.grindMode === 'glass' ? '🪓 Tap the card to temper into glass.' : '🪓 Tap the card to destroy forever.')
    : S.pendingDiscard
    ? '✂️ Tap a card to discard it.'
    : sel
      ? (sel.spec ? SPECIALS[sel.spec].desc + ' — tap a glowing tile.' : 'Tap a glowing tile to move there.')
      : 'Select a card to see where you can move.';
}

function renderArtifacts() {
  const shelf = $('artifact-shelf');
  shelf.innerHTML = '';
  S.artifacts.forEach(id => {
    const a = ARTIFACTS[id];
    const chip = document.createElement('div');
    chip.className = 'artifact-chip' + (S.purchases.some(p => p.kind === 'artifact' && p.id === id) ? ' bought' : '');
    const left = S.artCharges[id];
    chip.innerHTML = a.icon + (left ? `<span class="charge">${left}</span>` : '');
    chip.addEventListener('click', () =>
      setMsg(`${a.icon} <b>${a.name}</b> — ${a.desc}${left ? ` <b>(${left} board${left > 1 ? 's' : ''} left)</b>` : ''}`));
    shelf.appendChild(chip);
  });
}

function renderHUD() {
  $('hud-board').textContent = `Board ${S.boardIndex}${S.boardIndex > 10 ? ' ∞' : ''}`;
  $('hud-turns').textContent = `Turn ${S.turn}/${turnLimit()}`;
  $('hud-coins').textContent = `🪙 ${S.coins}`;
  $('hud-deck').textContent = `Deck ${S.draw.length} · Disc ${S.discard.length}`;
  $('objective-bar').textContent = `🎯 ${objectiveDesc()} (${objectiveStatus()})`;
}

function renderAll() {
  renderHUD();
  renderLapDial();
  renderTiles();
  renderHand();
  renderArtifacts();
  renderHighlights();
  positionNPCs();
  document.body.classList.toggle('pick-hand', !!(S.pendingDiscard || S.pendingGrind));
}

// ---------- boot ----------
if (window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()) {
  document.body.classList.add('capacitor');
}
function renderMenu() {
  const best = saveData.best || 0;
  const el = $('menu-best');
  if (best > 0) {
    el.textContent = `Furthest board completed: ${best}${best >= 3 ? ' — early boards will be brisk.' : ''}`;
    el.hidden = false;
  }
}
renderMenu();
$('btn-start').addEventListener('click', startRun);
$('btn-result').addEventListener('click', () => { if (resultAction) resultAction(); });
$('btn-shop-close').addEventListener('click', closeShop);
$('btn-quest-accept').addEventListener('click', acceptQuest);
$('btn-quest-decline').addEventListener('click', declineQuest);
$('notice').addEventListener('click', closeNotice);
$('btn-choice-yes').addEventListener('click', () => answerChoice(true));
$('btn-choice-no').addEventListener('click', () => answerChoice(false));

// ---------- hidden mode ----------
const EGG = {
  active: false,
  gifs: [],       // object URLs, memory only — discarded on page close
  order: [],      // shuffled deck of gif indices
  pos: 0,
  queue: [],      // pending animations {secs, isEcho}
  playing: false,
  totalSecs: 0,
  startTime: 0,
};

let jszipPromise = null;
function loadJSZip() {
  if (window.JSZip) return Promise.resolve();
  if (!jszipPromise) {
    jszipPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
      s.onload = resolve;
      s.onerror = () => { jszipPromise = null; reject(new Error('JSZip load failed')); };
      document.head.appendChild(s);
    });
  }
  return jszipPromise;
}

// activation: triple-click the draw pile chip (no visual hint, no conflicting handler)
let eggClicks = 0, eggClickTimer = null;
$('hud-deck').addEventListener('click', () => {
  eggClicks++;
  clearTimeout(eggClickTimer);
  eggClickTimer = setTimeout(() => { eggClicks = 0; }, 600);
  if (eggClicks >= 3) { eggClicks = 0; $('egg-file').click(); }
});

$('egg-file').addEventListener('change', e => {
  const f = e.target.files && e.target.files[0];
  if (f) eggLoadZip(f);
  e.target.value = '';
});

function eggLoadUI(loaded, total, title) {
  if (title) $('egg-load-title').textContent = title;
  $('egg-progress-fill').style.width = total ? (loaded / total * 100) + '%' : '0%';
  $('egg-load-count').textContent = total ? `${loaded} / ${total}` : '';
}

// loads in the background: play continues, gifs become available as they arrive
async function eggLoadZip(file) {
  const bar = $('egg-loading');
  bar.hidden = false;              // immediate feedback, before any processing starts
  document.body.classList.add('gif-loading');
  eggActivate();                   // palette switches right away, during loading
  eggLoadUI(0, 0, 'Opening collection…');
  EGG.gifs.forEach(u => URL.revokeObjectURL(u));
  EGG.gifs = [];
  try {
    await loadJSZip();
    const zip = await JSZip.loadAsync(file);
    // shuffled so every load extracts in a different order
    const entries = shuffle(Object.values(zip.files).filter(f => !f.dir && /\.gif$/i.test(f.name)));
    if (!entries.length) {
      eggLoadUI(0, 0, 'No animations in that file.');
      setTimeout(() => { bar.hidden = true; document.body.classList.remove('gif-loading'); }, 2200);
      return;
    }
    eggLoadUI(0, entries.length, 'Loading');
    let loaded = 0;
    for (const entry of entries) {
      const blob = await entry.async('blob');
      EGG.gifs.push(URL.createObjectURL(new Blob([blob], { type: 'image/gif' })));
      loaded++;
      eggLoadUI(loaded, entries.length);
      await new Promise(r => setTimeout(r, 0)); // yield so the game stays responsive
    }
    eggLoadUI(EGG.gifs.length, EGG.gifs.length, `Ready — ${EGG.gifs.length} animations`);
    setTimeout(() => { bar.hidden = true; document.body.classList.remove('gif-loading'); }, 2200);
  } catch (err) {
    eggLoadUI(0, 0, 'Could not read that file.');
    setTimeout(() => { bar.hidden = true; document.body.classList.remove('gif-loading'); }, 2200);
  }
}

function eggActivate() {
  if (EGG.active) return;
  EGG.active = true;
  EGG.totalSecs = 0;
  EGG.startTime = Date.now();
  document.body.classList.add('egg');
  $('btn-ilost').hidden = false;
}

// gif deck over whatever is loaded so far; reshuffles (and picks up new arrivals) when spent
function eggDrawGif() {
  if (EGG.pos >= EGG.order.length || EGG.order.length !== EGG.gifs.length) {
    EGG.order = shuffle(EGG.gifs.map((_, i) => i));
    EGG.pos = 0;
  }
  return EGG.gifs[EGG.order[EGG.pos++]];
}

// coin-change trigger: duration in seconds = |coin delta|, no minimum floor
function eggCoinGif(delta) {
  if (!EGG.active || !EGG.gifs.length || !delta) return; // nothing loaded yet → skip silently
  let secs = Math.abs(delta);
  if (delta < 0 && hasArt('egg_chain')) secs = Math.ceil(secs * 1.5);
  if (hasArt('egg_hourglass')) secs += 3;
  if (hasArt('egg_die')) secs += rand(0, 4);
  eggEnqueue(secs, false);
}

// NPC-encounter bonus animation (Siren's Bell)
function eggBonusGif() {
  if (!EGG.active || !EGG.gifs.length || !hasArt('egg_bell')) return;
  let secs = rand(4, 7);
  if (hasArt('egg_hourglass')) secs += 3;
  eggEnqueue(secs, false);
}

function eggEnqueue(secs, isEcho) {
  EGG.queue.push({ secs, isEcho });
  eggPlayNext();
}

function eggPlayNext() {
  if (EGG.playing || !EGG.queue.length) return;
  if (!EGG.gifs.length) { EGG.queue = []; return; } // still loading → skip, no fuss
  EGG.playing = true;
  const item = EGG.queue.shift();
  const wrap = $('egg-gif-img');
  wrap.innerHTML = '';
  const img = document.createElement('img');
  img.src = eggDrawGif();
  wrap.appendChild(img);
  $('egg-gif-secs').textContent = ''; // no countdown while it plays
  $('egg-gif').hidden = false;
  $('btn-ilost').hidden = true;
  EGG.totalSecs += item.secs;
  if (S) { S.boardGifSecs = (S.boardGifSecs || 0) + item.secs; renderHUD(); }
  const ms = item.secs * 1000;
  setTimeout(() => { $('egg-gif-secs').textContent = item.secs + 's'; }, Math.max(0, ms - 1500));
  setTimeout(() => {
    EGG.playing = false;
    if (!item.isEcho && hasArt('egg_prism') && Math.random() < 0.25) {
      EGG.queue.unshift({ secs: item.secs, isEcho: true });
    }
    if (EGG.queue.length) {
      eggPlayNext();
    } else {
      $('egg-gif').hidden = true;
      $('egg-gif-img').innerHTML = '';
      if (EGG.active) $('btn-ilost').hidden = false;
    }
  }, ms);
}

// "I lost" — personal session data, framed plainly
const fmtTime = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

$('btn-ilost').addEventListener('click', () => {
  const cur = {
    boards: S ? S.boardIndex : 0,
    gif: Math.round(EGG.totalSecs),
    dur: Math.floor((Date.now() - EGG.startTime) / 1000),
  };
  const prev = saveData.alt || null;
  const bestLine = prev
    ? `Best so far — boards: ${prev.boards} · animation time: ${fmtTime(prev.gif)} · session: ${fmtTime(prev.dur)}`
    : 'This is your first recorded session.';
  $('egg-stats-text').innerHTML =
    `Boards reached: <b>${cur.boards}</b><br>` +
    `Animation time: <b>${fmtTime(cur.gif)}</b><br>` +
    `Session length: <b>${fmtTime(cur.dur)}</b><br><br>` +
    `<span class="small">${bestLine}</span>`;
  saveData.alt = {
    boards: Math.max(prev ? prev.boards : 0, cur.boards),
    gif: Math.max(prev ? prev.gif : 0, cur.gif),
    dur: Math.max(prev ? prev.dur : 0, cur.dur),
  };
  try { localStorage.setItem('looptrail', JSON.stringify(saveData)); } catch (e) {}
  $('egg-stats').hidden = false;
});

$('btn-egg-continue').addEventListener('click', () => { $('egg-stats').hidden = true; });
$('btn-egg-newrun').addEventListener('click', () => {
  $('egg-stats').hidden = true;
  EGG.totalSecs = 0;
  EGG.startTime = Date.now();
  startRun();
});
