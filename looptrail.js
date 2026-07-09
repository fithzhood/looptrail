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
  satchel:   { name: 'Deep Satchel',      icon: '🎒', desc: '+1 max hand size.' },
  quill:     { name: 'Oaken Quill',       icon: '🪶', desc: 'Draw an extra card each turn (up to your hand limit).' },
  clover:    { name: 'Lucky Clover',      icon: '🍀', desc: '+1 coin whenever you gain coins.' },
  idol:      { name: 'Green Idol',        icon: '🗿', desc: '+2 coins each time you complete a lap.' },
  hourglass: { name: 'Patient Hourglass', icon: '⏳', desc: '+2 turn limit on every board.' },
  charm:     { name: 'Thief Charm',       icon: '🧿', desc: 'Thieves steal only half as much from you.' },
  ring:      { name: 'Bargain Ring',      icon: '💍', desc: 'Merchant prices reduced by 2 (min 1).' },
  seal:      { name: 'Quest Seal',        icon: '📜', desc: '+3 coins from every quest reward.' },
  compass:   { name: 'Old Compass',       icon: '🧭', desc: 'Gust tiles no longer restrict your direction.' },
  bell:      { name: 'Warning Bell',      icon: '🔔', desc: 'Hidden thief traps are revealed to you.' },
};

const SPECIALS = {
  echo:   { value: 0, name: 'Echo',      desc: 'Stay in place and trigger this tile again.' },
  charge: { value: 6, name: 'Charge',    desc: 'Move 6 tiles — clockwise only.' },
  cycle:  { value: 1, name: 'Cycle',     desc: 'Draw a card and discard a card, then move 1.' },
  sneak:  { value: 2, name: 'Soft Step', desc: 'Move 2 without triggering the tile you land on.' },
  stride: { value: 3, name: 'Stride',    desc: 'Move 3, then draw a card.' },
};

const TILE_ICONS = {
  start: '⌂', blank: '', coin: '🪙', loss: '🕳', artifact: '🏺',
  draw: '🃏', discard: '✂️', slide: '➤', gust: '🌀', quest: '★', trap: '', ferry: '⛵',
};

const OBJ_LABELS = {
  laps: '➰ Laps', coins: '🪙 Earned', arts: '🏺 Artifacts', quests: '★ Quests',
  survive: '⏳ Turns', hand: '🃏 In hand', visit: '👣 Tiles', home: '⌂ Returns',
};

function startingDeck() {
  // 1x1, 2x2, 3x3, 4x2, 5x1
  return [1, 2, 2, 3, 3, 3, 4, 4, 5].map(v => ({ value: v }));
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
const maxHand = () => 5 + (hasArt('satchel') ? 1 : 0);
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
  const crit = [], extra = [];
  const add = (list, tile, n) => { for (let i = 0; i < n; i++) list.push({ ...tile }); };
  add(crit, { type: 'coin', amt: 2 }, (type === 'coins' ? 5 : 2) + Math.floor(size / 20));
  add(crit, { type: 'coin', amt: 4 }, 1);
  add(crit, { type: 'artifact' }, type === 'arts' ? target + 1 : 1);
  add(crit, { type: 'draw' }, type === 'hand' ? 3 : 1);
  add(crit, { type: 'quest' }, type === 'quests' ? target + 1 : (Math.random() < 0.5 ? 1 : 0));
  add(extra, { type: 'loss', amt: 2 + Math.floor(b / 4) }, 2 + Math.floor(b / 3) + (type === 'survive' ? 1 : 0));
  add(extra, { type: 'discard' }, 1);
  add(extra, { type: 'slide', amt: 2 }, 1 + (size > 18 ? 1 : 0));
  add(extra, { type: 'gust' }, 1 + (size > 20 ? 1 : 0));
  add(extra, { type: 'trap' }, 1 + (b > 5 || type === 'survive' ? 1 : 0));
  add(extra, { type: 'ferry' }, size > 16 ? 1 : 0);
  shuffle(extra);
  let bag = crit.concat(extra).slice(0, size - 1);
  while (bag.length < size - 1) bag.push({ type: 'blank' });
  shuffle(bag);
  const tiles = [{ type: 'start' }, ...bag];

  const merchant = (type === 'arts' || Math.random() < 0.6) ? { pos: rand(2, size - 2) } : null;
  return { size, tiles, objective, turnLimit: limit, merchant };
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
  for (let i = 0; i < 3; i++) drawCard(true);
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
  for (let i = 0; i < 3; i++) drawCard(true);
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

const cardLabel = c => c.spec ? `${SPECIALS[c.spec].name} (${c.value})` : `${c.value}`;

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
  return Math.max(30, Math.min(60, circ / n * (n > 19 ? 0.9 : 0.82)));
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
  if (S.forcedDir !== -1) opts.push({ tile: mod(S.pos + card.value, n), dir: 1 });
  if (S.forcedDir !== 1 && card.spec !== 'charge') {
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

function onTileClick(i) {
  if (S.busy || S.over || S.selected === null || S.pendingDiscard) return;
  const card = S.hand[S.selected];
  const opt = reachableFrom(card).find(o => o.tile === i);
  if (!opt) return;
  playCard(S.selected, opt);
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
    case 'loss':
      addMsg(`🕳 You lose ${t.amt} coins.`);
      floatText(S.pos, `−${t.amt} 🪙`, 'bad');
      if (!addCoins(-t.amt)) return;
      break;
    case 'artifact':
      if (!t.used) {
        t.used = true;
        const unowned = Object.keys(ARTIFACTS).filter(id => !hasArt(id));
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
    let d = mod(S.pos - S.thief.pos, n);
    if (d > n / 2) d -= n;
    const step = Math.sign(d) * Math.min(Math.abs(d), 2);
    S.thief.pos = mod(S.thief.pos + step, n);
    if (S.thief.pos === S.pos) {
      let amt = rand(3, 6);
      if (hasArt('charm')) amt = Math.ceil(amt / 2);
      addMsg(`🥷 The thief catches you and steals ${amt} coins, then vanishes!`);
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
    const unowned = shuffle(Object.keys(ARTIFACTS).filter(id => !hasArt(id)));
    if (unowned[0]) stock.push({ kind: 'artifact', id: unowned[0], price: rand(8, 10) });
    if (unowned[1] && Math.random() < 0.5) stock.push({ kind: 'artifact', id: unowned[1], price: rand(8, 10) });
    while (stock.length < 3) {
      if (Math.random() < 0.3) {
        stock.push({ kind: 'special', id: pick(Object.keys(SPECIALS)), price: rand(6, 8) });
      } else {
        const v = pick([2, 3, 4]);
        stock.push({ kind: 'card', card: { value: v }, price: 3 + v });
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
    total += pu.cost;
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
function objectiveText() {
  const o = S.board.objective;
  return `${OBJ_LABELS[o.type]} ${Math.min(objProgress(), o.target)}/${o.target}`;
}

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
  const unowned = shuffle(Object.keys(ARTIFACTS).filter(id => !hasArt(id)));
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
    el.innerHTML = `<div class="val">${c.value}</div>` + (c.spec ? `<div class="name">${SPECIALS[c.spec].name}</div>` : '');
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
  $('hud-objective').textContent = objectiveText();
  $('hud-deck').textContent = `Deck ${S.draw.length} · Disc ${S.discard.length}`;
}

function renderAll() {
  renderHUD();
  renderTiles();
  renderHand();
  renderArtifacts();
  renderHighlights();
  positionNPCs();
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
