// 5人扑克牌联机游戏 —— 服务端
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');

// ============ 常量与牌 ============
// 牌面字符串：普通牌 6~2；SJ 小王 BJ 大王；EM 皇帝 GD 侍卫
const NORMAL = ['6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A', '2'];
const WILD = ['EM', 'GD', 'BJ', 'SJ']; // 万能牌

// 单张牌基础 rank（越大越强）
const RANK = {
  '6': 1, '7': 2, '8': 3, '9': 4, '10': 5, 'J': 6, 'Q': 7, 'K': 8, 'A': 9, '2': 10,
  'SJ': 11, 'BJ': 12, 'EM': 14, 'GD': 15
};
// 叠加牌 rank
const STACK_RANK = {
  'SJ,SJ,SJ': 13, // 三张小王
  'BJ,SJ,SJ': 16, // 一王+两小王
  'BJ,BJ': 17      // 两张大王
};

const RANK_NAME = { 1:'6',2:'7',3:'8',4:'9',5:'10',6:'J',7:'Q',8:'K',9:'A',10:'2',11:'小王',12:'大王',13:'三张小王',14:'皇帝',15:'侍卫',16:'一王两小王',17:'两张大王' };

// ============ 牌组与发牌 ============
function buildDeck() {
  const deck = [];
  for (const r of NORMAL) for (let i = 0; i < 16; i++) deck.push(r);
  for (let i = 0; i < 3; i++) deck.push('SJ');
  for (let i = 0; i < 3; i++) deck.push('BJ');
  deck.push('EM');
  deck.push('GD');
  return deck; // 168 张
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// 从 startIdx 开始顺时针发完，返回 5 份手牌
function deal(deck, startIdx) {
  const hands = [[], [], [], [], []];
  let idx = startIdx;
  for (const c of deck) {
    hands[idx % 5].push(c);
    idx++;
  }
  return hands;
}

// 排序手牌（从大到小）
function sortHand(hand) {
  return hand.slice().sort((a, b) => RANK[b] - RANK[a]);
}

// ============ 牌型识别与压牌 ============
function isWild(c) { return WILD.includes(c); }

// 识别叠加组合，返回叠加 rank 或 null
function stackRankOf(cards) {
  if (cards.length < 2) return null;
  const key = cards.slice().sort((a, b) => RANK[b] - RANK[a]).join(',');
  return STACK_RANK[key] ?? null;
}

// 一手牌是否构成合法的「N 张相同点数」牌型（万能牌可顶任意点数）
function isValidNormal(cards) {
  if (cards.length === 0) return false;
  const nonWild = cards.filter(c => !isWild(c));
  if (nonWild.length === 0) return true; // 全万能牌也算（如对子大王）
  const first = nonWild[0];
  return nonWild.every(c => c === first);
}

// 判断一手出牌的类型与值
// 返回 { type: 'single'|'stack'|'normal', value }
function analyzePlay(cards) {
  if (cards.length === 1) {
    return { type: 'single', value: RANK[cards[0]], cards };
  }
  const sr = stackRankOf(cards);
  if (sr !== null) {
    // 若构成叠加组合，优先按叠加（用于单张对决），但也保留 normal 属性
    return { type: 'stack', value: sr, cards, alsoNormal: isValidNormal(cards) };
  }
  if (isValidNormal(cards)) {
    return { type: 'normal', value: null, cards };
  }
  return null; // 非法出牌
}

function hasWild(cards) { return cards.some(c => isWild(c)); }

// 逐张比较用：把普通牌型的牌按实际 rank 从大到小返回
function ranksOf(cards) {
  return cards.map(c => RANK[c]).sort((a, b) => b - a);
}

// 判断 play 能否压过 table（table 为 null 表示自由出牌）
function canBeat(play, table) {
  const p = analyzePlay(play);
  if (p === null) return { ok: false, reason: '非法牌型' };

  if (!table || table.length === 0) {
    return { ok: true };
  }
  const t = analyzePlay(table);
  if (t === null) return { ok: false, reason: '桌上牌非法' };

  // 桌上是单张
  if (t.type === 'single') {
    if (p.type === 'single') return { ok: p.value > t.value };
    if (p.type === 'stack') return { ok: p.value > t.value };
    return { ok: false, reason: '牌数不符' };
  }
  // 桌上是叠加
  if (t.type === 'stack') {
    if (p.type === 'stack') return { ok: p.value > t.value };
    if (p.type === 'single') return { ok: p.value > t.value };
    return { ok: false, reason: '牌数不符' };
  }
  // 桌上是普通牌型
  if (t.type === 'normal') {
    // 叠加组合若同时也是合法普通牌型（如对子大王），按普通牌型处理
    let pType = p.type;
    if (pType === 'stack' && p.alsoNormal) pType = 'normal';
    if (pType !== 'normal') return { ok: false, reason: '牌数不符' };
    if (play.length !== table.length) return { ok: false, reason: '牌数不符' };
    const tSoft = hasWild(table), pSoft = hasWild(play);
    if (tSoft && !pSoft) return { ok: false, reason: '硬牌压不过软牌' };
    const pr = ranksOf(play), tr = ranksOf(table);
    for (let i = 0; i < pr.length; i++) {
      if (pr[i] <= tr[i]) return { ok: false, reason: '需每张都大于对方' };
    }
    return { ok: true };
  }
  return { ok: false, reason: '无法压牌' };
}

// 憋6检查：出的牌含 6，则出完后手里不能还有非 6 牌
function violatesBisheng(play, handAfter) {
  if (!play.some(c => c === '6')) return false;
  return handAfter.some(c => c !== '6');
}

// 判断玩家是否「逼死」：手里只剩 6，且需要跟牌（无出牌权）
function isForcedDeath(hand, table) {
  if (hand.length === 0) return false;
  if (!hand.every(c => c === '6')) return false;
  return !!(table && table.length > 0);
}

// ============ 计分 ============
// 普通情况：按皇帝+侍卫名次结算（返回各玩家扣分数组，正数表示扣分）
function settleNormal(rankOf, emperorIdx, guardIdx, revealed, bishengList) {
  const n = 5;
  const deduct = new Array(n).fill(0);
  const eR = rankOf[emperorIdx], gR = rankOf[guardIdx];
  const set = [eR, gR].sort((a, b) => a - b); // 从小到大
  const key = set.join(',');
  let winnerIsEmperor = null;
  // 皇帝方胜：平民各扣
  const table = {
    '1,2': 6, '1,3': 4, '1,4': 2, '2,3': 4, '2,4': 2
  };
  if (key in table) {
    winnerIsEmperor = true;
    const per = table[key];
    for (let i = 0; i < n; i++) {
      if (i !== emperorIdx && i !== guardIdx) deduct[i] += per;
    }
  } else if (key === '1,5') {
    winnerIsEmperor = null; // 平局
  } else {
    // 平民胜：皇帝/侍卫扣分
    winnerIsEmperor = false;
    if (key === '2,5') { deduct[emperorIdx] += 6; deduct[guardIdx] += 4; }
    else { deduct[emperorIdx] += 9; deduct[guardIdx] += 6; } // 3,4 / 3,5 / 4,5
  }

  // 明保翻倍
  const isMingbao = (revealed[guardIdx] || revealed.filter((v, i) => i !== emperorIdx && i !== guardIdx).filter(Boolean).length >= 2);
  if (winnerIsEmperor !== null && isMingbao) {
    for (let i = 0; i < n; i++) deduct[i] *= 2;
  }

  // 逼死加扣
  for (const bi of bishengList) {
    deduct[bi.player] += (isMingbao ? 6 : 3);
  }
  return { deduct, isMingbao };
}

// 独皇情况：谁先出完谁赢
function settleDuoHuang(isEmperorWin, revealed, bishengList, emperorIdx) {
  const n = 5;
  const deduct = new Array(n).fill(0);
  // 明保 = 两个平民亮
  const commoners = [];
  for (let i = 0; i < n; i++) if (i !== emperorIdx) commoners.push(i);
  const commonerRevealed = commoners.filter(i => revealed[i]).length;
  const isMingbao = commonerRevealed >= 2;

  if (isEmperorWin) {
    const per = isMingbao ? 12 : 6;
    for (const i of commoners) deduct[i] += per;
  } else {
    deduct[emperorIdx] += (isMingbao ? 21 : 12);
  }

  for (const bi of bishengList) {
    deduct[bi.player] += (isMingbao ? 6 : 3);
  }
  return { deduct, isMingbao };
}

// ============ 房间 ============
const rooms = new Map(); // code -> room

function makeCode() {
  let code;
  do {
    code = String(crypto.randomInt(100000, 1000000));
  } while (rooms.has(code));
  return code;
}

function createRoom() {
  const room = {
    code: makeCode(),
    players: [], // {id, name, socket, hand, role, revealed, score, alive}
    hostId: null,
    state: 'waiting', // waiting|dealing|emperor_reveal|transfer|reveal|playing|over
    deck: null,
    tableCards: null,
    tablePlayer: null,
    currentPlayer: null,
    passCount: 0,
    round: 0,
    lastEmperorIdx: -1,
    // 本局
    emperorIdx: -1, guardIdx: -1, duoHuang: false,
    revealed: [],
    transferQueue: [], // 让皇询问队列
    finRank: [], // 出完/逼死顺序 [{player, rank, forced}]
    forcedCount: 0,
    logs: []
  };
  rooms.set(room.code, room);
  return room;
}

function roomPublic(room) {
  return {
    code: room.code,
    state: room.state,
    round: room.round,
    players: room.players.map(p => ({
      id: p.id, name: p.name, role: p.role, revealed: p.revealed,
      handCount: p.hand ? p.hand.length : 0, score: p.score, alive: p.alive,
      seat: p.seat
    })),
    tableCards: room.tableCards,
    tablePlayer: room.tablePlayer,
    currentPlayer: room.currentPlayer,
    emperorIdx: room.emperorIdx, guardIdx: room.guardIdx, duoHuang: room.duoHuang,
    finRank: room.finRank, logs: room.logs
  };
}

function broadcast(room, msg, exceptId) {
  for (const p of room.players) {
    if (p.socket && p.socket.readyState === 1 && p.id !== exceptId) {
      p.socket.send(JSON.stringify(msg));
    }
  }
}
function send(ws, msg) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg)); }

function sendHand(room, player) {
  send(player.socket, { type: 'hand', cards: sortHand(player.hand) });
}

function broadcastPublic(room, exceptId) {
  broadcast(room, { type: 'state', state: roomPublic(room) }, exceptId);
}

// ============ 游戏流程 ============
function startGame(room) {
  room.round++;
  const deck = shuffle(buildDeck());
  room.deck = deck;
  // 发牌起点：第一把随机，之后从上一把皇帝
  const startIdx = (room.round === 1) ? crypto.randomInt(5) : room.lastEmperorIdx;
  const hands = deal(deck, startIdx);
  room.players.forEach((p, i) => {
    p.hand = hands[i];
    p.role = null; p.revealed = false; p.alive = true; p.seat = i;
  });
  // 身份
  room.duoHuang = false;
  room.emperorIdx = room.players.findIndex(p => p.hand.includes('EM'));
  room.guardIdx = room.players.findIndex(p => p.hand.includes('GD'));
  if (room.emperorIdx === room.guardIdx) {
    room.duoHuang = true;
    room.guardIdx = -1; // 无独立侍卫
  }
  room.revealed = [false, false, false, false, false];
  room.revealed[room.emperorIdx] = true; // 皇帝必亮
  // 设置角色
  room.players.forEach((p, i) => {
    p.role = (i === room.emperorIdx) ? 'emperor' : (i === room.guardIdx) ? 'guard' : 'commoner';
    p.revealDone = false;
  });
  room.finRank = [];
  room.forcedCount = 0;
  room.tableCards = null;
  room.tablePlayer = null;
  room.transferQueue = [];
  room.logs = [];
  room.logs.push(`第 ${room.round} 局开始，${room.players[room.emperorIdx].name} 为皇帝`);
  if (room.duoHuang) room.logs.push('【独皇】皇帝与侍卫同人！');

  room.state = 'emperor_choice';
  room.currentPlayer = null;

  room.players.forEach(p => sendHand(room, p));
  broadcastPublic(room);
  // 通知皇帝选择是否让皇
  send(room.players[room.emperorIdx].socket, { type: 'prompt_emperor_choice' });
}

function pushTransferPrompt(room) {
  if (room.transferQueue.length === 0) {
    // 无人要，作废本局
    room.state = 'over';
    room.logs.push('无人接受让皇，本局作废，全员 0 分');
    broadcastPublic(room);
    setTimeout(() => {
      broadcast(room, { type: 'round_result', result: { void: true, message: '无人接受让皇，本局作废' } });
      room.state = 'waiting';
      room.lastEmperorIdx = room.emperorIdx;
      broadcastPublic(room);
    }, 2500);
    return;
  }
  const next = room.transferQueue.shift();
  room.currentPlayer = next;
  broadcast(room, { type: 'prompt_transfer', to: next, name: room.players[room.emperorIdx].name });
  broadcastPublic(room);
}

function acceptTransfer(room, playerIdx) {
  const oldEmperor = room.emperorIdx;
  const oldHand = room.players[oldEmperor].hand;
  const newHand = room.players[playerIdx].hand;
  if (room.duoHuang) {
    // 独皇让皇：皇帝牌让出，自己留侍卫牌变侍卫
    const i = oldHand.indexOf('EM');
    oldHand.splice(i, 1);
    newHand.push('EM');
    room.emperorIdx = playerIdx;
    room.guardIdx = oldEmperor; // 原独皇变侍卫
    room.duoHuang = false;
    room.players[oldEmperor].role = 'guard';
    room.players[playerIdx].role = 'emperor';
    room.logs.push(`${room.players[oldEmperor].name} 让出皇帝，自己成为侍卫；${room.players[playerIdx].name} 成为新皇帝`);
  } else {
    // 普通让皇：皇帝牌转给新皇帝，侍卫不变
    const i = oldHand.indexOf('EM');
    oldHand.splice(i, 1);
    newHand.push('EM');
    room.emperorIdx = playerIdx;
    room.players[playerIdx].role = 'emperor';
    room.logs.push(`${room.players[oldEmperor].name} 让出皇帝，${room.players[playerIdx].name} 成为新皇帝`);
  }
  room.revealed = [false, false, false, false, false];
  room.revealed[room.emperorIdx] = true;
  room.players[oldEmperor].revealed = false;
  room.players[playerIdx].revealed = true;
  room.transferQueue = [];
  room.state = 'reveal';
  room.currentPlayer = null;
  room.players.forEach(p => sendHand(room, p));
  broadcastPublic(room);
  startReveal(room);
}

function startReveal(room) {
  room.state = 'reveal';
  room.logs.push('进入亮身份阶段');
  broadcast(room, { type: 'prompt_reveal' });
  broadcastPublic(room);
}

function tryFinishReveal(room) {
  // 检查是否所有人都已表态（侍卫/平民可选，最多等所有人确认）
  // 简化：房主/服务器等待所有非皇帝玩家确认（亮或不亮）
  const pending = room.players.filter(p => p.alive && p.seat !== room.emperorIdx && !p.revealed && p.revealDone === undefined);
  // 这里由玩家点击"确认"推进，见 handleReveal
}

// 结算并开始出牌
function startPlaying(room) {
  room.state = 'playing';
  room.tableCards = null;
  room.tablePlayer = null;
  room.passCount = 0;
  room.currentPlayer = room.emperorIdx;
  room.logs.push('开始出牌，皇帝先出');
  broadcastPublic(room);
  pushPlayPrompt(room);
}

function pushPlayPrompt(room) {
  const p = room.players[room.currentPlayer];
  send(p.socket, { type: 'prompt_play', canPass: !!(room.tableCards && room.tableCards.length > 0) });
}

function nextPlayer(room, fromIdx) {
  // 下一个存活玩家
  let i = (fromIdx + 1) % 5;
  let guard = 0;
  while (!room.players[i].alive && guard < 6) { i = (i + 1) % 5; guard++; }
  return i;
}

function handlePlay(room, playerIdx, cards) {
  if (room.state !== 'playing' || room.currentPlayer !== playerIdx) return;
  const player = room.players[playerIdx];
  // 检查牌是否在手牌中
  const handCopy = player.hand.slice();
  for (const c of cards) {
    const idx = handCopy.indexOf(c);
    if (idx < 0) { send(player.socket, { type: 'error', message: '出的牌不在手中' }); return; }
    handCopy.splice(idx, 1);
  }
  // 憋6检查
  if (violatesBisheng(cards, handCopy)) {
    send(player.socket, { type: 'error', message: '憋6：6 必须最后出' });
    return;
  }
  // 压牌检查
  const res = canBeat(cards, room.tableCards);
  if (!res.ok) {
    send(player.socket, { type: 'error', message: res.reason || '压不住' });
    return;
  }
  // 执行出牌
  for (const c of cards) {
    const idx = player.hand.indexOf(c);
    if (idx >= 0) player.hand.splice(idx, 1);
  }
  room.tableCards = cards;
  room.tablePlayer = playerIdx;
  room.passCount = 0;
  room.logs.push(`${player.name} 出了 ${formatCards(cards)}`);
  sendHand(room, player);

  if (player.hand.length === 0) {
    // 出完：正常出完的名次从 1 开始递增
    player.alive = false;
    const normalCount = room.finRank.filter(r => !r.forced).length;
    const rank = normalCount + 1;
    room.finRank.push({ player: playerIdx, rank, forced: false });
    room.logs.push(`${player.name} 出完，第 ${rank} 名`);
    room.tableCards = null; room.tablePlayer = null; room.passCount = 0;
    if (room.finRank.length >= 4) {
      // 剩最后一人，结束
      finishGame(room, playerIdx);
      return;
    }
  }
  room.currentPlayer = nextPlayer(room, playerIdx);
  broadcastPublic(room);
  pushPlayPrompt(room);
}

function handlePass(room, playerIdx) {
  if (room.state !== 'playing' || room.currentPlayer !== playerIdx) return;
  if (!room.tableCards || room.tableCards.length === 0) {
    send(room.players[playerIdx].socket, { type: 'error', message: '你是先手，必须出牌' });
    return;
  }
  // 逼死检查：手里只剩6且需要跟牌 → 逼死
  const player = room.players[playerIdx];
  if (isForcedDeath(player.hand, room.tableCards)) {
    doForcedDeath(room, playerIdx);
    return;
  }
  room.passCount++;
  room.logs.push(`${player.name} 过`);
  const next = nextPlayer(room, playerIdx);
  if (room.passCount >= countAlive(room) - 1) {
    // 除出牌者外都过，出牌者重新自由出牌
    room.currentPlayer = room.tablePlayer;
    room.passCount = 0;
    room.tableCards = null;
    room.tablePlayer = null;
  } else {
    room.currentPlayer = next;
  }
  broadcastPublic(room);
  pushPlayPrompt(room);
}

function doForcedDeath(room, playerIdx) {
  const player = room.players[playerIdx];
  player.alive = false;
  room.forcedCount++;
  // 逼死排名：第一个逼死排第5、第二个排第4...
  const rank = 5 - room.forcedCount + 1;
  room.finRank.push({ player: playerIdx, rank, forced: true });
  room.logs.push(`${player.name} 被逼死！第 ${rank} 名`);
  room.passCount = 0;
  if (countAlive(room) === 1) {
    // 只剩一人存活，结束
    const aliveIdx = room.players.findIndex(p => p.alive);
    finishGame(room, aliveIdx);
    return;
  }
  // 逼死者无牌可出，轮到下家；若桌上仍是原出牌者，需处理
  if (room.tablePlayer === playerIdx) {
    room.tableCards = null; room.tablePlayer = null; room.passCount = 0;
  }
  room.currentPlayer = nextPlayer(room, playerIdx);
  broadcastPublic(room);
  pushPlayPrompt(room);
}

function finishGame(room, lastIdx) {
  // 补齐未记录名次的玩家（最后存活者），占用剩余的名次
  for (let i = 0; i < 5; i++) {
    if (!room.finRank.some(r => r.player === i)) {
      const used = room.finRank.map(r => r.rank);
      const remaining = [1, 2, 3, 4, 5].find(r => !used.includes(r));
      room.finRank.push({ player: i, rank: remaining, forced: false });
      room.logs.push(`${room.players[i].name} 出完，第 ${remaining} 名`);
    }
  }
  room.finRank.sort((a, b) => a.rank - b.rank);
  const rankOf = new Array(5).fill(0);
  for (const r of room.finRank) rankOf[r.player] = r.rank;

  const bishengList = room.finRank.filter(r => r.forced);
  let result;
  if (room.duoHuang) {
    // 独皇：谁先出完（第1名是谁）
    const first = room.finRank.find(r => r.rank === 1).player;
    const isEmperorWin = (first === room.emperorIdx);
    result = settleDuoHuang(isEmperorWin, room.revealed, bishengList, room.emperorIdx);
  } else {
    result = settleNormal(rankOf, room.emperorIdx, room.guardIdx, room.revealed, bishengList);
  }
  // 应用扣分
  room.players.forEach((p, i) => { p.score -= result.deduct[i]; });

  const detail = {
    void: false,
    rank: room.finRank.map(r => ({ name: room.players[r.player].name, rank: r.rank, forced: r.forced })),
    deduct: result.deduct,
    scores: room.players.map(p => p.score),
    isMingbao: result.isMingbao,
    duoHuang: room.duoHuang,
    message: `本局${result.isMingbao ? '【明保】' : '【暗保】'}结算完成`
  };
  room.state = 'over';
  room.lastEmperorIdx = room.emperorIdx;
  room.logs.push('本局结束');
  broadcast(room, { type: 'round_result', result: detail });
  broadcastPublic(room);
}

function countAlive(room) {
  return room.players.filter(p => p.alive).length;
}

function formatCards(cards) {
  const name = { 'SJ': '小王', 'BJ': '大王', 'EM': '皇帝', 'GD': '侍卫' };
  const cnt = {};
  for (const c of cards) cnt[c] = (cnt[c] || 0) + 1;
  return Object.entries(cnt).map(([c, n]) => (name[c] || c) + (n > 1 ? `×${n}` : '')).join(' ');
}

// ============ 消息处理 ============
function handleMessage(ws, room, player, msg) {
  switch (msg.type) {
    case 'start_game': {
      if (room.hostId !== player.id) { send(ws, { type: 'error', message: '只有房主能开局' }); return; }
      if (room.players.length < 5) { send(ws, { type: 'error', message: '需要 5 人才能开局' }); return; }
      if (room.state === 'playing' || room.state === 'transfer' || room.state === 'reveal') return;
      startGame(room);
      break;
    }
    case 'emperor_choice': {
      if (room.state !== 'emperor_choice') return;
      const idx = room.players.indexOf(player);
      if (idx !== room.emperorIdx) return;
      if (msg.transfer) {
        // 发起让皇：从皇帝隔一人（下下家）开始顺时针询问
        room.state = 'transfer';
        const q = [];
        for (let k = 2; k <= 5; k++) q.push((room.emperorIdx + k) % 5);
        room.transferQueue = q;
        room.logs.push(`${player.name} 发起让皇`);
        pushTransferPrompt(room);
      } else {
        room.logs.push(`${player.name} 不让皇`);
        startReveal(room);
      }
      break;
    }
    case 'transfer_decision': {
      if (room.state !== 'transfer') return;
      const idx = room.players.indexOf(player);
      if (idx !== room.currentPlayer) return;
      if (msg.accept) acceptTransfer(room, idx);
      else {
        // 不要，继续问下一个
        if (room.transferQueue.length === 0) {
          // 全不要 → 作废
          room.state = 'over';
          room.logs.push('无人接受让皇，本局作废，全员 0 分');
          broadcastPublic(room);
          setTimeout(() => {
            broadcast(room, { type: 'round_result', result: { void: true, message: '无人接受让皇，本局作废' } });
            room.state = 'waiting';
            broadcastPublic(room);
          }, 2500);
        } else {
          pushTransferPrompt(room);
        }
      }
      break;
    }
    case 'reveal_decision': {
      if (room.state !== 'reveal') return;
      const idx = room.players.indexOf(player);
      if (idx === room.emperorIdx) return; // 皇帝已亮
      player.revealed = !!msg.reveal;
      player.revealDone = true;
      room.revealed[idx] = !!msg.reveal;
      const roleName = player.role || (idx === room.guardIdx ? '侍卫' : '平民');
      room.logs.push(`${player.name} ${msg.reveal ? '亮身份（' + roleName + '）' : '不亮'}`);
      broadcastPublic(room);
      // 检查是否所有非皇帝玩家已表态
      const pending = room.players.filter(p => p.alive && p.seat !== room.emperorIdx && !p.revealDone);
      if (pending.length === 0) {
        startPlaying(room);
      }
      break;
    }
    case 'play': {
      const idx = room.players.indexOf(player);
      handlePlay(room, idx, msg.cards || []);
      break;
    }
    case 'pass': {
      const idx = room.players.indexOf(player);
      handlePass(room, idx);
      break;
    }
  }
}

// ============ 静态服务 + WebSocket ============
const PORT = process.env.PORT || 8080;
const server = http.createServer((req, res) => {
  let url = req.url.split('?')[0];
  if (url === '/health') { res.writeHead(200, { 'Content-Type': 'text/plain' }); res.end('ok'); return; }
  if (url === '/') url = '/index.html';
  const filePath = path.join(__dirname, 'public', url);
  const ext = path.extname(filePath);
  const mime = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon'
  }[ext] || 'application/octet-stream';
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('404'); return; }
    res.writeHead(200, { 'Content-Type': mime });
    res.end(data);
  });
});

const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
  let room = null, player = null;
  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }

    if (msg.type === 'create_room') {
      room = createRoom();
      player = { id: crypto.randomUUID(), name: (msg.name || '玩家').slice(0, 12), socket: ws, hand: [], role: null, revealed: false, score: 0, alive: true, seat: -1, revealDone: false };
      room.hostId = player.id;
      room.players.push(player);
      send(ws, { type: 'joined', code: room.code, playerId: player.id, isHost: true });
      broadcastPublic(room);
      return;
    }
    if (msg.type === 'join_room') {
      const r = rooms.get(msg.code);
      if (!r) { send(ws, { type: 'error', message: '房间不存在' }); return; }
      if (r.players.length >= 5) { send(ws, { type: 'error', message: '房间已满' }); return; }
      if (r.state !== 'waiting') { send(ws, { type: 'error', message: '游戏已开始' }); return; }
      room = r;
      player = { id: crypto.randomUUID(), name: (msg.name || '玩家').slice(0, 12), socket: ws, hand: [], role: null, revealed: false, score: 0, alive: true, seat: -1, revealDone: false };
      room.players.push(player);
      send(ws, { type: 'joined', code: room.code, playerId: player.id, isHost: false });
      broadcastPublic(room);
      return;
    }
    if (!room || !player) { send(ws, { type: 'error', message: '请先加入房间' }); return; }
    handleMessage(ws, room, player, msg);
  });

  ws.on('close', () => {
    if (room && player) {
      room.players = room.players.filter(p => p.id !== player.id);
      if (room.hostId === player.id && room.players.length > 0) room.hostId = room.players[0].id;
      if (room.players.length === 0) rooms.delete(room.code);
      else broadcastPublic(room);
    }
  });
});

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`服务器已启动：http://localhost:${PORT}`);
  });
}

module.exports = { buildDeck, shuffle, deal, canBeat, analyzePlay, settleNormal, settleDuoHuang, violatesBisheng, isForcedDeath, stackRankOf, RANK };
