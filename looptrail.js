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
  clover:    { name: 'Lucky Clover',      icon: '🍀', desc: '+1 coin whenever you gain coins.' },
  idol:      { name: 'Green Idol',        icon: '🗿', desc: '+2 coins each time you complete a lap.' },
  hourglass: { name: 'Patient Hourglass', icon: '⏳', desc: '+2 turn limit on every board.' },
  charm:     { name: 'Thief Charm',       icon: '🧿', desc: 'Thieves steal only half as much from you.' },
  ring:      { name: 'Bargain Ring',      icon: '💍', desc: 'Merchant prices reduced by 2 (min 1).' },
  seal:      { name: 'Quest Seal',        icon: '📜', desc: '+3 coins from every quest reward.' },
  compass:   { name: 'Old Compass',       icon: '🧭', desc: 'Gust tiles no longer restrict your direction.' },
  bell:      { name: 'Warning Bell',      icon: '🔔', desc: 'Hidden thief traps are revealed to you.' },
  // hidden-mode exclusives — they shape the animation system, nothing else
  egg_hourglass: { name: 'Hourglass of Indulgence', icon: '⌛', desc: 'Every animation lasts 3 seconds longer.', egg: true },
  egg_bell:      { name: "Siren's Bell",            icon: '🛎️', desc: 'Meeting any NPC plays a bonus animation.', egg: true },
  egg_prism:     { name: 'Echo Prism',              icon: '🔮', desc: 'Animations may echo: 25% chance a second one of the same length follows.', egg: true },
  egg_chain:     { name: 'Gilded Chain',            icon: '⛓️', desc: 'Coin losses play animations half again as long.', egg: true },
  egg_die:       { name: 'Velvet Die',              icon: '🎲', desc: 'Every animation gains 0–4 bonus seconds, rolled each time.', egg: true },
};

function artifactPool(src) {
  // src: 'tile' | 'shop' | 'reward'
  return Object.keys(ARTIFACTS).filter(id => {
    if (hasArt(id)) return false;
    const a = ARTIFACTS[id];
    if (a.egg && !EGG.active) return false;
    if (a.shopOnly && src !== 'shop') return false;
    return true;
  });
}

const SPECIALS = {
  echo:   { value: 0, name: 'Echo',      desc: 'Stay in place and trigger this tile again.' },
  charge: { value: 6, name: 'Charge',    desc: 'Move 6 tiles — clockwise only.' },
  cycle:  { value: 1, name: 'Cycle',     desc: 'Draw a card and discard a card, then move 1.' },
  sneak:  { value: 2, name: 'Soft Step', desc: 'Move 2 without triggering the tile you land on.' },
  stride: { value: 3, name: 'Stride',    desc: 'Move 3, then draw a card.' },
};

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
const turnLimit = () => S.board.turnLimit + (hasArt('hourglass') ? 2 : 0);

// ---------- board generation ----------
function makeBoard(b) {
  // rubber-band: after a decent previous run, the first boards are brisk
  const easy = (saveData.best || 0) >= 3 && b <= 2;
  const size = easy ? 14 : Math.min(24, 15 + b);

  // objective — never the same type twice in a row
  const lastType = (S && S.board) ? S.board.objective.type : null;
  const type = pick(['laps', 'coins', 'arts', 'quests', 'survive', 'hand', 'visit', 'home']
    .filter(t => t !== lastType));

  let target, limit;
  switch (type) {
    case 'laps':    target = easy ? 1 : 2 + Math.floor(b / 5); limit = target * Math.ceil(size / 3) + 6; break;
    case 'coins':   target = (easy ? 8 : 10) + 2 * b;          limit = 13 + Math.floor(b / 2); break;
    case 'arts':    target = b < 3 ? 1 : (b < 9 ? 2 : 3);      limit = 6 + target * 5; break;
    case 'quests':  target = b < 4 ? 1 : 2;                    limit = 6 + target * 7; break;
    case 'survive': target = 10 + b;                           limit = target + 2; break;
    case 'hand':    target = 5;                                limit = 12; break;
    case 'visit':   target = Math.min(size - 4, (easy ? 6 : 8) + b); limit = target + 5; break;
    case 'home':    target = b < 6 ? 2 : 3;                    limit = target * 5 + 2; break;
  }
  if (easy) limit += 2;
  const objective = { type, target };

  // tile bag: objective-critical tiles first, extras trimmed to fit
  const hell = type === 'survive'; // survival boards are meant to be brutal
  const coinAmt = 2 + Math.floor(b / 3);
  const lossAmt = (hell ? 3 : 2) + Math.floor(b / 3);
  const crit = [], extra = [];
  const add = (list, tile, n) => { for (let i = 0; i < n; i++) list.push({ ...tile }); };
  add(crit, { type: 'coin', amt: coinAmt }, (type === 'coins' ? 5 : 2) + Math.floor(size / 20));
  add(crit, { type: 'coin', amt: coinAmt + 2 }, 1);
  add(crit, { type: 'artifact' }, type === 'arts' ? target + 1 : 1);
  add(crit, { type: 'draw' }, type === 'hand' ? 4 : 1);
  add(crit, { type: 'quest' }, type === 'quests' ? target + 1 : (Math.random() < 0.5 ? 1 : 0));
  if (hell) {
    add(crit, { type: 'loss', amt: lossAmt }, 3);
    add(crit, { type: 'loss', half: true }, 2);
    add(crit, { type: 'trap' }, 3 + (b > 5 ? 1 : 0));
  } else {
    add(extra, { type: 'loss', amt: lossAmt }, 2 + Math.floor(b / 3));
    add(extra, { type: 'trap' }, 1 + (b > 5 ? 1 : 0));
  }
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
  return { size, tiles, objective, turnLimit: limit, merchant, hardThief: hell };
}

function objectiveDesc() {
  const o = S.board.objective;
  switch (o.type) {
    case 'laps':    return `Complete ${o.target} lap${o.target > 1 ? 's' : ''} of the loop.`;
    case 'coins':   return `Earn ${o.target} coins on this board.`;
    case 'arts':    return `Pick up ${o.target} artifact${o.target > 1 ? 's' : ''} on this board.`;
    case 'quests':  return `Complete ${o.target} quest${o.target > 1 ? 's' : ''}.`;
    case 'survive': return `Survive ${o.target} turns.`;
    case 'hand':    return `End a turn with ${o.target} cards in hand.`;
    case 'visit':   return `Visit ${o.target} different tiles.`;
    case 'home':    return `Land on the start tile ⌂ ${o.target} times.`;
  }
}

function objProgress() {
  const o = S.board.objective;
  switch (o.type) {
    case 'laps':    return Math.max(0, Math.floor(S.net / S.board.size));
    case 'coins':   return S.boardCoins;
    case 'arts':    return S.boardArts;
    case 'quests':  return S.boardQuests;
    case 'survive': return S.turn;
    case 'hand':    return S.hand.length;
    case 'visit':   return S.visited.size;
    case 'home':    return S.homeLands;
  }
}

// ---------- run / board lifecycle ----------
function startRun() {
  S = {
    boardIndex: 1,
    pos: 0,
    turn: 0,
    net: 0,
    lapsPaid: 0,
    coins: 5,
    artifacts: [],
    questsDone: 0,
    draw: shuffle(startingDeck()),
    discard: [],
    hand: [],
    selected: null,
    busy: false,
    over: false,
    forcedDir: 0,
    thief: null,
    quest: null,
    questOffer: null,
    pendingDiscard: null,
    purchases: [],
    boardCoins: 0,
    boardArts: 0,
    boardQuests: 0,
    homeLands: 0,
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
  S.lapsPaid = 0;
  S.over = false;
  S.forcedDir = 0;
  S.thief = null;
  S.quest = null;
  S.pendingDiscard = null;
  S.purchases = [];
  S.boardCoins = 0;
  S.boardArts = 0;
  S.boardQuests = 0;
  S.homeLands = 0;
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
function addCoins(n, src) {
  if (n > 0 && hasArt('clover')) n += 1;
  if (n > 0 && src === 'quest' && hasArt('seal')) n += 3;
  S.coins += n;
  if (n > 0) S.boardCoins += n;
  eggCoinGif(n);
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
  const base = c.spec ? `${SPECIALS[c.spec].name} (${c.value})` : `${c.value}`;
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
  if (S.quest && S.quest.type === 'relay') {
    addMsg(`★ Relay: touch marked tile #${S.quest.next + 1} next.`);
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
  layoutBoard();
  renderTiles();
}

function ensureThiefEl() {
  if (!document.getElementById('npc-thief')) {
    const t = document.createElement('div');
    t.className = 'npc thief';
    t.id = 'npc-thief';
    t.textContent = '🥷';
    $('board').appendChild(t);
  }
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
  const th = document.getElementById('npc-thief');
  if (th) {
    if (S.thief) {
      const { x, y } = tileCenter(S.thief.pos);
      th.style.left = x + '%';
      th.style.top = y + '%';
      th.style.display = '';
    } else {
      th.style.display = 'none';
    }
  }
}

function renderTiles() {
  tileEls.forEach((el, i) => {
    const t = S.board.tiles[i];
    const hiddenTrap = t.type === 'trap' && !t.used;
    const shownType = hiddenTrap && !hasArt('bell') ? 'blank' : t.type;
    el.className = 'tile t-' + shownType + (t.used ? ' used' : '');
    let icon = TILE_ICONS[shownType] || '';
    if (t.type === 'loss' && t.half) icon = '💀';
    if (t.type === 'trap' && t.used) icon = '⚠️';
    if (hiddenTrap && hasArt('bell')) { icon = '⚠️'; el.classList.add('revealed'); }
    el.innerHTML = icon ? `<span>${icon}</span>` : '';
    if (S.quest) {
      if (S.quest.type === 'relay') {
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
      }
    }
  });
}

window.addEventListener('resize', () => { if (S) layoutBoard(); });

// ---------- card selection & movement ----------
function reachableFrom(card) {
  const n = S.board.size;
  if (card.spec === 'echo') return [{ tile: S.pos, dir: 1 }];
  const opts = [];
  if (S.forcedDir !== -1 && card.dir !== -1) opts.push({ tile: mod(S.pos + card.value, n), dir: 1 });
  if (S.forcedDir !== 1 && card.spec !== 'charge' && card.dir !== 1) {
    const ccw = mod(S.pos - card.value, n);
    if (!opts.some(o => o.tile === ccw)) opts.push({ tile: ccw, dir: -1 });
  }
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
    case 'quest':    return ['★ Quest', t.done ? 'Quest completed.' : 'A quest giver — land here to hear the offer.'];
    case 'ferry':    return ['⛵ Ferry', 'Carries you straight to the far side of the loop.'];
    case 'trap':     return ['⚠️ Trap', t.used ? 'A sprung thief trap.' : 'Your bell senses a hidden thief trap!'];
  }
  return ['', ''];
}

function onTileClick(i) {
  if (S.busy || S.over || S.pendingDiscard) return;
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
  S.discard.push(card);
  S.selected = null;
  S.busy = true;
  S.forcedDir = 0;
  clearHighlights();
  renderHand();

  const exec = () => {
    if (card.spec === 'echo') {
      setMsg('⟳ Echo — you stay put and the tile triggers again.');
      renderAll();
      setTimeout(() => resolveLanding(1, 0, false), 400);
      return;
    }
    setMsg(`Moved ${card.value} ${opt.dir === 1 ? 'clockwise ↻' : 'counterclockwise ↺'}.`);
    animateToken(S.pos, opt.tile, opt.dir, () => {
      moveTo(opt.tile, card.value * opt.dir);
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
  S.pos = tile;
  S.net += netDelta;
  S.visited.add(tile);
  if (tile === 0) S.homeLands++;
  updateLaps();
  positionToken();
  renderHUD();
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

function updateLaps() {
  const laps = Math.max(0, Math.floor(S.net / S.board.size));
  while (laps > S.lapsPaid) {
    S.lapsPaid++;
    addMsg('➰ Lap complete!');
    floatText(0, '➰', 'good');
    if (hasArt('idol')) { addMsg('🗿 The Green Idol pays you 2 coins.'); if (!addCoins(2)) return; }
  }
}

// ---------- tile resolution ----------
function resolveLanding(dir, depth, sneak) {
  if (S.over) return;
  const t = S.board.tiles[S.pos];
  const done = () => { checkQuestAt(S.pos); afterEffects(); };

  if (sneak) {
    addMsg('✧ Soft Step — the tile does not trigger.');
    done();
    return;
  }

  switch (t.type) {
    case 'coin':
      addMsg(`🪙 +${t.amt} coins.`);
      floatText(S.pos, `+${t.amt} 🪙`, 'good');
      if (!addCoins(t.amt)) return;
      break;
    case 'loss': {
      const lost = t.half ? Math.ceil(Math.max(0, S.coins) / 2) : t.amt;
      addMsg(t.half ? `💀 The pit swallows half your coins (−${lost}).` : `🕳 You lose ${t.amt} coins.`);
      floatText(S.pos, `−${lost} 🪙`, 'bad');
      if (lost > 0 && !addCoins(-lost)) return;
      break;
    }
    case 'artifact':
      if (!t.used) {
        t.used = true;
        const unowned = artifactPool('tile');
        S.boardArts++;
        if (unowned.length) {
          const id = pick(unowned);
          S.artifacts.push(id);
          addMsg(`🏺 Found artifact: ${ARTIFACTS[id].icon} ${ARTIFACTS[id].name}!`);
          floatText(S.pos, ARTIFACTS[id].icon, 'good');
        } else {
          addMsg('🏺 The urn holds 3 coins.');
          floatText(S.pos, '+3 🪙', 'good');
          if (!addCoins(3)) return;
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
        addMsg(`➤ The tile slides you ${t.amt} further.`);
        const dest = mod(S.pos + t.amt * dir, S.board.size);
        animateToken(S.pos, dest, dir, () => {
          moveTo(dest, t.amt * dir);
          if (S.over) return;
          renderAll();
          resolveLanding(dir, depth + 1, false);
        });
        return;
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
        S.thief = { pos: mod(S.pos + Math.floor(S.board.size / 2), S.board.size) };
        ensureThiefEl();
        addMsg('⚠️ A hidden trap! A thief appears across the board and starts hunting you.');
        floatText(S.pos, '⚠️', 'bad');
      }
      break;
    case 'ferry': {
      if (depth < 3) {
        const dest = mod(S.pos + Math.floor(S.board.size / 2), S.board.size);
        addMsg('⛵ The ferry carries you to the far side of the loop.');
        animateToken(S.pos, dest, dir, () => {
          moveTo(dest, 0);
          if (S.over) return;
          renderAll();
          resolveLanding(dir, depth + 1, false);
        });
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
  if (S.thief && S.thief.pos === S.pos) {
    addMsg('🥷 You caught the thief! +4 coins bounty.');
    eggBonusGif();
    floatText(S.pos, '+4 🪙', 'good');
    S.thief = null;
    positionNPCs();
    if (!addCoins(4)) return;
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

function moveNPCs() {
  const n = S.board.size;
  if (S.board.merchant) {
    S.board.merchant.pos = mod(S.board.merchant.pos + 1, n);
  }
  if (S.thief) {
    const speed = S.board.hardThief ? 3 : 2;
    let d = mod(S.pos - S.thief.pos, n);
    if (d > n / 2) d -= n;
    const step = Math.sign(d) * Math.min(Math.abs(d), speed);
    S.thief.pos = mod(S.thief.pos + step, n);
    if (S.thief.pos === S.pos) {
      let amt = S.board.hardThief ? rand(6, 10) : rand(3, 6);
      if (hasArt('charm')) amt = Math.ceil(amt / 2);
      addMsg(`🥷 The thief catches you and steals ${amt} coins, then vanishes!`);
      eggBonusGif();
      floatText(S.pos, `−${amt} 🪙`, 'bad');
      S.thief = null;
      if (!addCoins(-amt)) return;
    }
  }
  positionNPCs();
}

// ---------- discard choice ----------
function onCardClick(idx) {
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
  let q;
  if (Math.random() < 0.5) {
    const count = rand(2, 3);
    const candidates = [];
    for (let i = 0; i < n; i++) {
      if (i !== giverTile && S.board.tiles[i].type !== 'quest') candidates.push(i);
    }
    shuffle(candidates);
    q = { type: 'relay', giver: giverTile, targets: candidates.slice(0, count), next: 0, reward: 4 + count * 2 };
    $('quest-text').textContent =
      `“Touch the ${count} marked tiles in order — I'll pay you ${q.reward} coins.”`;
  } else {
    const target = mod(giverTile + rand(5, n - 5), n);
    const turns = rand(3, 4);
    q = { type: 'delivery', giver: giverTile, target, deadline: S.turn + turns, reward: 7 };
    $('quest-text').textContent =
      `“Deliver this parcel to the flagged tile within ${turns} turns — ${q.reward} coins on delivery.”`;
  }
  S.questOffer = { quest: q, cont };
  $('quest').hidden = false;
}

function acceptQuest() {
  S.quest = S.questOffer.quest;
  const cont = S.questOffer.cont;
  S.questOffer = null;
  $('quest').hidden = true;
  addMsg('★ Quest accepted!');
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
  if (q.type === 'relay') {
    if (q.targets[q.next] === pos) {
      q.next++;
      if (q.next >= q.targets.length) completeQuest();
      else addMsg(`★ Marked tile touched — next is #${q.next + 1}.`);
    }
  } else if (q.type === 'delivery') {
    if (q.target === pos && S.turn <= q.deadline) completeQuest();
  }
}

function completeQuest() {
  const q = S.quest;
  S.quest = null;
  S.questsDone++;
  S.boardQuests++;
  const gt = S.board.tiles[q.giver];
  if (gt && gt.type === 'quest') { gt.done = true; gt.used = true; }
  addMsg(`★ Quest complete! +${q.reward} coins.`);
  floatText(S.pos, `+${q.reward} 🪙`, 'good');
  renderTiles();
  addCoins(q.reward, 'quest');
}

// ---------- merchant shop ----------
let shopCont = null;

function shopStock() {
  if (!S.board.shopStock) {
    const stock = [];
    const markup = S.boardIndex - 1;              // merchant prices climb with each board
    const smallMarkup = Math.floor(markup / 2);
    const unowned = shuffle(artifactPool('shop').filter(id => id !== 'bond'));
    if (!hasArt('bond') && Math.random() < 0.45) {
      stock.push({ kind: 'artifact', id: 'bond', price: rand(7, 9) + markup });
    }
    if (unowned[0]) stock.push({ kind: 'artifact', id: unowned[0], price: rand(8, 10) + markup });
    if (unowned[1] && stock.length < 3 && Math.random() < 0.5) stock.push({ kind: 'artifact', id: unowned[1], price: rand(8, 10) + markup });
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
  S.coins -= p;
  eggCoinGif(-p);
  if (item.kind === 'artifact') {
    S.artifacts.push(item.id);
    S.boardArts++;
    S.purchases.push({ kind: 'artifact', id: item.id, cost: p });
    addMsg(`Bought ${ARTIFACTS[item.id].icon} ${ARTIFACTS[item.id].name} (refunded on board win).`);
  } else {
    const card = item.kind === 'special'
      ? { value: SPECIALS[item.id].value, spec: item.id }
      : item.card;
    S.purchases.push({ kind: 'card', card, cost: p });
    S.discard.push(card);
    addMsg(`Bought a ${cardLabel(card)} card (refunded on board win).`);
  }
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
    eggCoinGif(value); // one animation per refunded item, sized to its own value
    if (pu.kind === 'artifact') {
      S.artifacts = S.artifacts.filter(id => id !== pu.id);
    } else {
      for (const pile of [S.draw, S.discard, S.hand]) {
        const k = pile.indexOf(pu.card);
        if (k >= 0) { pile.splice(k, 1); break; }
      }
    }
  }
  S.purchases = [];
  S.coins += total;
  return ` The merchant takes back your purchases and refunds ${total} coins.`;
}

// ---------- objective / win / loss ----------
function checkBoardEnd() {
  if (objProgress() >= S.board.objective.target) { boardWon(); return true; }
  if (S.turn >= turnLimit()) {
    runLost(`You ran out of turns on board ${S.boardIndex}.`);
    return true;
  }
  return false;
}

function boardWon() {
  S.over = true;
  const refundNote = refundPurchases();
  saveBest(S.boardIndex);
  renderAll();
  showReward(refundNote);
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
  const specs = shuffle(Object.keys(SPECIALS));
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
      if (offer.kind === 'artifact') S.artifacts.push(offer.id);
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
  if (S.selected === null || S.pendingDiscard) return;
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
      + (S.selected === i && !S.pendingDiscard ? ' selected' : '');
    const dirMark = c.dir === 1 ? '<div class="cdir">↻</div>' : c.dir === -1 ? '<div class="cdir ccw">↺</div>' : '';
    el.dataset.v = c.value;
    el.innerHTML = `<div class="val">${c.value}</div>` + (c.spec ? `<div class="name">${SPECIALS[c.spec].name}</div>` : '') + dirMark;
    el.addEventListener('click', () => onCardClick(i));
    hand.appendChild(el);
  });
  const sel = S.selected !== null ? S.hand[S.selected] : null;
  $('hand-hint').textContent = S.pendingDiscard
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
    chip.textContent = a.icon;
    chip.addEventListener('click', () => addMsg(`${a.icon} <b>${a.name}</b> — ${a.desc}`));
    shelf.appendChild(chip);
  });
}

function renderHUD() {
  $('hud-board').textContent = `Board ${S.boardIndex}${S.boardIndex > 10 ? ' ∞' : ''}`;
  $('hud-turns').textContent = `Turn ${S.turn}/${turnLimit()}`;
  $('hud-coins').textContent = `🪙 ${S.coins}`;
  $('hud-deck').textContent = `Deck ${S.draw.length} · Disc ${S.discard.length}`;
  const o = S.board.objective;
  $('objective-bar').textContent = `🎯 ${objectiveDesc()} (${Math.min(objProgress(), o.target)}/${o.target})`;
}

function renderAll() {
  renderHUD();
  renderTiles();
  renderHand();
  renderArtifacts();
  renderHighlights();
  positionNPCs();
  document.body.classList.toggle('pick-hand', !!S.pendingDiscard);
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
  $('egg-load-count').textContent = total ? `Loading ${loaded} / ${total} files…` : '';
}

async function eggLoadZip(file) {
  const ov = $('egg-loading');
  ov.hidden = false; // immediate feedback, before any processing starts
  eggLoadUI(0, 0, 'Opening collection…');
  const preview = $('egg-preview');
  preview.classList.remove('on');
  let previewTimer = null, lastPrev = -1;
  const showPreview = pool => {
    if (!pool.length) return;
    let i = rand(0, pool.length - 1);
    if (pool.length > 1 && i === lastPrev) i = (i + 1) % pool.length;
    lastPrev = i;
    preview.src = pool[i];
    preview.classList.add('on');
  };
  const fresh = [];
  try {
    await loadJSZip();
    const zip = await JSZip.loadAsync(file);
    // shuffled so every load extracts (and previews) in a different order
    const entries = shuffle(Object.values(zip.files).filter(f => !f.dir && /\.gif$/i.test(f.name)));
    if (!entries.length) {
      eggLoadUI(0, 0, 'No animations found in that file.');
      setTimeout(() => { ov.hidden = true; }, 1800);
      return;
    }
    eggLoadUI(0, entries.length, 'Loading collection…');
    previewTimer = setInterval(() => showPreview(fresh), 5000);
    let loaded = 0;
    for (const entry of entries) {
      const blob = await entry.async('blob');
      fresh.push(URL.createObjectURL(new Blob([blob], { type: 'image/gif' })));
      loaded++;
      eggLoadUI(loaded, entries.length);
      if (loaded === 1) showPreview(fresh);
    }
    EGG.gifs.forEach(u => URL.revokeObjectURL(u));
    EGG.gifs = fresh.slice();
    EGG.order = shuffle(EGG.gifs.map((_, i) => i));
    EGG.pos = 0;
    if (!EGG.active) eggActivate();
    eggLoadUI(EGG.gifs.length, EGG.gifs.length, `Ready! ${EGG.gifs.length} animations loaded`);
    $('egg-load-count').textContent = '';
    setTimeout(() => { ov.hidden = true; }, 1400);
  } catch (err) {
    fresh.forEach(u => URL.revokeObjectURL(u));
    eggLoadUI(0, 0, 'Could not read that file.');
    setTimeout(() => { ov.hidden = true; }, 1800);
  } finally {
    clearInterval(previewTimer);
  }
}

function eggActivate() {
  EGG.active = true;
  EGG.totalSecs = 0;
  EGG.startTime = Date.now();
  document.body.classList.add('egg');
  $('btn-ilost').hidden = false;
}

// gif deck: every gif plays once before any repeats, then reshuffle
function eggDrawGif() {
  if (EGG.pos >= EGG.order.length) { shuffle(EGG.order); EGG.pos = 0; }
  return EGG.gifs[EGG.order[EGG.pos++]];
}

// coin-change trigger: duration in seconds = |coin delta|, no minimum floor
function eggCoinGif(delta) {
  if (!EGG.active || !EGG.gifs.length || !delta) return;
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
  const ms = item.secs * 1000;
  setTimeout(() => { $('egg-gif-secs').textContent = item.secs + 's'; }, Math.max(0, ms - 500));
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
