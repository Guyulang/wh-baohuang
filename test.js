const { buildDeck, canBeat, settleNormal, settleDuoHuang, violatesBisheng } = require('./server.js');

let pass = 0, fail = 0;
function t(name, cond) {
  if (cond) { pass++; console.log('  ✓', name); }
  else { fail++; console.log('  ✗ FAIL:', name); }
}

console.log('=== 牌组 ===');
t('牌组 168 张', buildDeck().length === 168);
const deck = buildDeck();
t('6 有 16 张', deck.filter(c => c === '6').length === 16);
t('大王 3 张', deck.filter(c => c === 'BJ').length === 3);
t('皇帝 1 张', deck.filter(c => c === 'EM').length === 1);

console.log('=== 单张压牌 ===');
t('大王压小王', canBeat(['BJ'], ['SJ']).ok);
t('小王不压大王', !canBeat(['SJ'], ['BJ']).ok);
t('皇帝压大王', canBeat(['EM'], ['BJ']).ok);
t('侍卫压皇帝', canBeat(['GD'], ['EM']).ok);
t('2 压 A', canBeat(['2'], ['A']).ok);
t('同牌不能压(6压6)', !canBeat(['6'], ['6']).ok);

console.log('=== 叠加压单张 ===');
t('三张小王 > 大王', canBeat(['SJ','SJ','SJ'], ['BJ']).ok);
t('两张大王 > 皇帝', canBeat(['BJ','BJ'], ['EM']).ok);
t('两张大王 > 侍卫', canBeat(['BJ','BJ'], ['GD']).ok);
t('一王两小王 > 皇帝', canBeat(['BJ','SJ','SJ'], ['EM']).ok);
t('一王两小王 > 侍卫', canBeat(['BJ','SJ','SJ'], ['GD']).ok);
t('一王两小王 > 大王', canBeat(['BJ','SJ','SJ'], ['BJ']).ok);
t('两张大王 > 一王两小王', canBeat(['BJ','BJ'], ['BJ','SJ','SJ']).ok);
t('三张小王不压侍卫', !canBeat(['SJ','SJ','SJ'], ['GD']).ok);

console.log('=== 普通牌型 ===');
t('对子7压对子6', canBeat(['7','7'], ['6','6']).ok);
t('对子6不压对子7', !canBeat(['6','6'], ['7','7']).ok);
t('三张8压三张7', canBeat(['8','8','8'], ['7','7','7']).ok);
t('对子大王压对子小王', canBeat(['BJ','BJ'], ['SJ','SJ']).ok);
t('牌数不同不能压(三张压对子)', !canBeat(['7','7','7'], ['6','6']).ok);

console.log('=== 软硬牌 ===');
t('软牌(皇帝+两张7)压硬牌(三张6)', canBeat(['EM','7','7'], ['6','6','6']).ok);
t('软牌(皇帝+两张6)压不了硬牌(三张6)因6=6平', !canBeat(['EM','6','6'], ['6','6','6']).ok);
t('硬牌(三张A)不能压软牌(皇帝+两张6)', !canBeat(['A','A','A'], ['EM','6','6']).ok);
t('软牌(皇帝+两张7)压不了软牌(皇帝+两张6)因皇帝平级', !canBeat(['EM','7','7'], ['EM','6','6']).ok);
t('软牌(侍卫+两张7)压软牌(皇帝+两张6)', canBeat(['GD','7','7'], ['EM','6','6']).ok);
t('软牌平级不能压(皇帝+两张6 压 皇帝+两张6)', !canBeat(['EM','6','6'], ['EM','6','6']).ok);

console.log('=== 憋6 ===');
t('出6后手里还有非6 → 违规', violatesBisheng(['6'], ['7','8']));
t('出6后手里只剩6 → 不违规', !violatesBisheng(['6'], ['6']));
t('出6后手里空 → 不违规', !violatesBisheng(['6'], []));
t('不出6 → 不违规', !violatesBisheng(['7'], ['6']));

console.log('=== 计分：普通情况 ===');
// 名次数组 rankOf[i] = 玩家i的名次
// 皇帝侍卫 1,2 → 平民各 -6
{
  const rankOf = [1,2,3,4,5]; // 皇帝1 侍卫2 平民3,4,5
  const r = settleNormal(rankOf, 0, 1, [true,false,false,false,false], []);
  t('皇帝方大胜平民各-6', r.deduct[2]===6 && r.deduct[3]===6 && r.deduct[4]===6 && r.deduct[0]===0 && r.deduct[1]===0);
}
{
  // 皇帝侍卫 1,3 → 平民各 -4
  const rankOf = [1,3,2,4,5];
  const r = settleNormal(rankOf, 0, 1, [true,false,false,false,false], []);
  t('皇帝方中胜平民各-4', r.deduct[2]===4 && r.deduct[3]===4 && r.deduct[4]===4);
}
{
  // 皇帝侍卫 3,4 → 平民大胜，皇帝-9 侍卫-6
  const rankOf = [3,4,1,2,5];
  const r = settleNormal(rankOf, 0, 1, [true,false,false,false,false], []);
  t('平民大胜皇帝-9侍卫-6', r.deduct[0]===9 && r.deduct[1]===6);
}
{
  // 明保翻倍：皇帝侍卫 1,2，侍卫亮
  const rankOf = [1,2,3,4,5];
  const r = settleNormal(rankOf, 0, 1, [true,true,false,false,false], []);
  t('明保翻倍平民各-12', r.deduct[2]===12 && r.isMingbao===true);
}
{
  // 逼死加扣：皇帝侍卫1,2，平民3被逼死，暗保 → 平民3额外-3
  const rankOf = [1,2,3,4,5];
  const r = settleNormal(rankOf, 0, 1, [true,false,false,false,false], [{player:2}]);
  t('逼死暗保加扣3', r.deduct[2]===6+3);
}
{
  // 明保逼死加扣6
  const rankOf = [1,2,3,4,5];
  const r = settleNormal(rankOf, 0, 1, [true,true,false,false,false], [{player:2}]);
  t('明保逼死加扣6(先翻倍再加)', r.deduct[2]===12+6);
}

console.log('=== 计分：独皇 ===');
{
  // 独皇先出完，暗保 → 平民各 -6
  const r = settleDuoHuang(true, [true,false,false,false,false], [], 0);
  t('独皇胜暗保平民各-6', r.deduct[1]===6 && r.deduct[2]===6 && r.deduct[3]===6 && r.deduct[4]===6);
}
{
  // 独皇先出完，明保(两平民亮) → 平民各 -12
  const r = settleDuoHuang(true, [true,true,true,false,false], [], 0);
  t('独皇胜明保平民各-12', r.deduct[1]===12 && r.isMingbao===true);
}
{
  // 平民先出完，暗保 → 皇帝 -12
  const r = settleDuoHuang(false, [true,false,false,false,false], [], 0);
  t('平民胜暗保皇帝-12', r.deduct[0]===12);
}
{
  // 平民先出完，明保 → 皇帝 -21
  const r = settleDuoHuang(false, [true,true,true,false,false], [], 0);
  t('平民胜明保皇帝-21', r.deduct[0]===21);
}

console.log(`\n结果：${pass} 通过，${fail} 失败`);
process.exit(fail > 0 ? 1 : 0);
