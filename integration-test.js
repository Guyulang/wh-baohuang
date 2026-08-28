// 集成测试：模拟 5 个客户端完整玩一局
const WebSocket = require('ws');

const URL = 'ws://localhost:8080';
const clients = [];
const results = {};

function connect(name) {
  return new Promise((resolve) => {
    const ws = new WebSocket(URL);
    const c = { ws, name, hand: [], id: null, code: null, seat: -1, state: null, done: false };
    clients.push(c);
    ws.on('open', () => resolve(c));
    ws.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());
      handle(c, msg);
    });
  });
}

// 自动出牌策略：出最小的非6单张，或压单张
function autoPlay(c) {
  if (!c.state) return;
  const table = c.state.tableCards;
  const hand = c.hand.slice();
  // 排序：从小到大
  const rankOf = { '6':1,'7':2,'8':3,'9':4,'10':5,'J':6,'Q':7,'K':8,'A':9,'2':10,'SJ':11,'BJ':12,'EM':14,'GD':15 };
  hand.sort((a,b) => rankOf[a]-rankOf[b]);

  if (!table || table.length === 0) {
    // 自由出牌：出最小的非6（憋6），若只剩6则出6
    const non6 = hand.filter(x => x !== '6');
    if (non6.length > 0) { c.ws.send(JSON.stringify({ type: 'play', cards: [non6[0]] })); }
    else { c.ws.send(JSON.stringify({ type: 'play', cards: [hand[0]] })); }
    return;
  }
  // 跟牌：桌上是单张则出能压的单张，否则过
  if (table.length === 1) {
    const t = rankOf[table[0]];
    for (const card of hand) {
      if (card === '6') continue; // 憋6不跟
      if (rankOf[card] > t) { c.ws.send(JSON.stringify({ type: 'play', cards: [card] })); return; }
    }
  }
  c.ws.send(JSON.stringify({ type: 'pass' }));
}

function handle(c, msg) {
  switch (msg.type) {
    case 'joined': c.id = msg.playerId; c.code = msg.code; break;
    case 'state': c.state = msg.state; c.seat = msg.state.players.find(p => p.id === c.id).seat; break;
    case 'hand': c.hand = msg.cards; break;
    case 'prompt_emperor_choice': c.ws.send(JSON.stringify({ type: 'emperor_choice', transfer: false })); break;
    case 'prompt_transfer': {
      const me = c.state.players.find(p => p.id === c.id);
      const isEmperor = me && me.seat === c.state.emperorIdx;
      if (!isEmperor) c.ws.send(JSON.stringify({ type: 'transfer_decision', accept: false }));
      break;
    }
    case 'prompt_reveal': {
      const me = c.state.players.find(p => p.id === c.id);
      if (me && me.seat !== c.state.emperorIdx) c.ws.send(JSON.stringify({ type: 'reveal_decision', reveal: false }));
      break;
    }
    case 'prompt_play': autoPlay(c); break;
    case 'round_result':
      results[c.code] = msg.result;
      c.done = true;
      break;
    case 'error': console.log('  [error]', c.name, msg.message); break;
  }
}

async function main() {
  console.log('连接 5 个客户端…');
  const [a, b, c, d, e] = await Promise.all(['A','B','C','D','E'].map(connect));
  console.log('已连接，建房 + 加入…');
  a.ws.send(JSON.stringify({ type: 'create_room', name: 'A' }));
  await sleep(200);
  const code = a.code;
  for (const cl of [b,c,d,e]) cl.ws.send(JSON.stringify({ type: 'join_room', code, name: cl.name }));
  await sleep(300);
  console.log('房间码', code, '人数', a.state.players.length);
  if (a.state.players.length !== 5) { console.log('✗ 玩家未齐'); process.exit(1); }

  console.log('房主开始游戏…');
  a.ws.send(JSON.stringify({ type: 'start_game' }));

  // 等待游戏结束
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    if (clients.every(cl => cl.done)) break;
    await sleep(100);
  }
  const r = results[code];
  if (!r) { console.log('✗ 游戏未在 15 秒内结束'); process.exit(1); }

  console.log('=== 结算结果 ===');
  if (r.void) { console.log('本局作废：', r.message); }
  else {
    console.log('名次：', r.rank.map(x => `${x.name}(${x.rank}${x.forced?'·逼死':''})`).join(' '));
    console.log('扣分：', r.deduct);
    console.log('明保：', r.isMingbao, '| 独皇：', r.duoHuang);
  }
  // 校验：所有手牌出完或被逼死
  console.log('=== 集成测试完成 ===');
  process.exit(0);
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

main().catch(e => { console.error(e); process.exit(1); });
