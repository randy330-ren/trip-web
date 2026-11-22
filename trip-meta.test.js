// 執行：node trip-meta.test.js
global.location = { search: '', origin: 'http://x' };
const store = {};
global.localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } };
global.document = { querySelector: () => null, getElementById: () => null };
require('./trip-meta.js');
const R = global.tripRender;
let ok = 0, bad = 0;
const t = (name, cond) => { if (cond) ok++; else { bad++; console.log('✗', name); } };

const good = { pageTitle: '2027 沖繩', year: 2027, days: [{ month: 3, day: 10, title: '抵達', meals: ['a', 'b'], steps: ['x', ''], wx: 'naha' }, { month: 3, day: 11 }], weather: { places: { naha: ['那霸', 26.2, 127.7] } } };
let r = R.validate(good);
t('正常資料通過', r.ok && r.meta.days.length === 2);
t('星期由日期自動算出', r.meta.days[0].week === 'WED' && r.meta.days[1].week === 'THU');
t('缺的欄位補預設', r.meta.days[1].title === '第 2 天' && r.meta.days[1].meals.length === 3 && r.meta.days[0].steps.length === 1);
t('地圖預設取第一個天氣地點', r.meta.map.center[0] === 26.2 && r.meta.map.zoom === 10);
t('不認識的天氣地點改用第一個', R.validate({ ...good, days: [{ month: 3, day: 10, wx: 'zzz' }] }).meta.days[0].wx === 'naha');
t('沒有天氣地點時給預設', R.validate({ pageTitle: 'a', days: [{ month: 1, day: 1 }] }).meta.weather.places.x[0] === '東京');
t('不是物件', !R.validate([]).ok && !R.validate(null).ok);
t('沒有 days', !R.validate({ pageTitle: 'a' }).ok);
t('沒有名稱', !R.validate({ days: [{ month: 1, day: 1 }] }).ok);
t('日期不存在', !R.validate({ pageTitle: 'a', year: 2027, days: [{ month: 2, day: 30 }] }).ok);
t('日期倒退', !R.validate({ pageTitle: 'a', days: [{ month: 3, day: 5 }, { month: 3, day: 4 }] }).ok);
t('超過 31 天', !R.validate({ pageTitle: 'a', days: Array.from({ length: 32 }, (_, i) => ({ month: 1 + Math.floor(i / 28), day: (i % 28) + 1 })) }).ok);
t('天氣座標超出範圍', !R.validate({ pageTitle: 'a', days: [{ month: 1, day: 1 }], weather: { places: { a: ['x', 99, 0] } } }).ok);
t('過長文字被截斷', R.validate({ pageTitle: 'a'.repeat(100), days: [{ month: 1, day: 1 }] }).meta.pageTitle.length === 60);
t('多餘欄位被丟掉', !('evil' in R.validate({ ...good, evil: 1 }).meta));

const b = R.blank('測試', '2027-05-30', 3);
t('空白旅程', b.ok && b.meta.days.length === 3 && b.meta.days[2].month === 6 && b.meta.days[2].day === 1);
t('空白旅程副標題', b.meta.subtitle === '2027.05.30 - 06.01');
t('跨年被擋', !R.blank('a', '2027-12-30', 5).ok);
t('天數不合法', !R.blank('a', '2027-05-30', 0).ok && !R.blank('a', 'xx', 3).ok);

const dbShape = { year: 2027, pageTitle: 'p', days: { 0: undefined }, splash: { title: 't' } };
const n = R.normalize({ year: 2027, pageTitle: 'p', splash: { title: 't' }, days: [{ month: 1, day: 1, week: 'FRI' }] }, 'abc-def');
t('從資料庫讀回的資料補齊', n.id === 'abc-def' && n.splash.from === '' && n.days[0].steps.length === 0 && n.days[0].meals.length === 3 && n.map.zoom === 5);
t('缺 days 回傳 null', R.normalize({ year: 1 }, 'a') === null);
t('canon 與欄位順序無關', R.canon({ a: 1, b: { c: 2, d: [1, { y: 1, x: 2 }] } }) === R.canon({ b: { d: [1, { x: 2, y: 1 }], c: 2 }, a: 1 }));
t('匯入結果重新整理後穩定', R.canon(R.normalize(R.validate(good).meta, 'a-b-c')) === R.canon(R.normalize(JSON.parse(JSON.stringify(R.validate(good).meta)), 'a-b-c')));
console.log(bad ? `失敗 ${bad} 項` : `全部通過：${ok} 項`);
process.exit(bad ? 1 : 0);
