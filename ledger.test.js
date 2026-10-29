// 執行：node ledger.test.js
const assert = require('assert');
const C = require('./ledger-core.js');

let pass = 0;
const t = (name, fn) => { fn(); pass++; console.log('✓ ' + name); };
const sum = (o) => Object.values(o).reduce((s, x) => s + x.b, 0);

t('金額解析：整數幣別不可有小數、格式錯誤會被擋', () => {
    assert.deepStrictEqual(C.parseAmount('1,234', 0), { ok: true, v: 1234 });
    assert.strictEqual(C.parseAmount('1.5', 0).ok, false);
    assert.strictEqual(C.parseAmount('abc', 0).ok, false);
    assert.strictEqual(C.parseAmount('-5', 0).ok, false);
    assert.deepStrictEqual(C.parseAmount('12.3', 2), { ok: true, v: 1230 });
    assert.strictEqual(C.parseAmount('12.345', 2).ok, false);
});

t('匯率解析：必須大於零、最多 6 位小數', () => {
    assert.strictEqual(C.parseRate('0.2134').s, '0.2134');
    assert.strictEqual(C.parseRate('0.213400').s, '0.2134');
    assert.strictEqual(C.parseRate('0').ok, false);
    assert.strictEqual(C.parseRate('0.1234567').ok, false);
    assert.strictEqual(C.parseRate('1e3').ok, false);
});

t('換算：四捨五入（半數進位）', () => {
    assert.strictEqual(C.convert(12345, 0, '0.2134', 0), 2634);   // 2634.423
    assert.strictEqual(C.convert(10, 0, '0.25', 0), 3);           // 2.5 → 3
    assert.strictEqual(C.convert(1234, 2, '32.5', 0), 401);       // 12.34 USD → 401.05
    assert.strictEqual(C.convertBack(2634, 0, '0.2134', 0), 12343); // 12343.04
    assert.strictEqual(0.1 + 0.2 === 0.3, false);                   // 提醒：浮點數不可靠，核心全用整數
});

t('跨幣別換算：只四捨五入一次，且與台幣換算一致', () => {
    assert.strictEqual(C.convertCross(10000, 0, '0.2134', 2, '32.5'), 6566);   // 10000 JPY → 65.66 USD
    assert.strictEqual(C.convertCross(12345, 0, '0.2134', 0, '1'), C.convert(12345, 0, '0.2134', 0));
    assert.strictEqual(C.convertCross(2634, 0, '1', 0, '0.2134'), C.convertBack(2634, 0, '0.2134', 0));
});

t('最大餘數法：加總不變、平手依順序', () => {
    assert.deepStrictEqual(C.allocate(1000, [1, 1, 1]), [334, 333, 333]);
    assert.deepStrictEqual(C.allocate(999, [5000, 3000, 2000]), [499, 300, 200]);
    assert.deepStrictEqual(C.allocate(213, [334, 333, 333]), [71, 71, 71]);
    assert.deepStrictEqual(C.allocate(0, [1, 2]), [0, 0]);
    assert.deepStrictEqual(C.allocate(10000, [1, 1, 1]), [3334, 3333, 3333]);
});

t('平均分攤（外幣）：原幣與台幣加總都正確', () => {
    const r = C.computeSplit({ amount: 1000, dec: 0, mode: 'equal', members: ['a', 'b', 'c'], rate: '0.2134', baseDec: 0 });
    assert.ok(r.ok);
    assert.strictEqual(r.baseAmt, 213);
    assert.deepStrictEqual(r.shares, { a: { o: 334, b: 71 }, b: { o: 333, b: 71 }, c: { o: 333, b: 71 } });
    assert.strictEqual(sum(r.shares), r.baseAmt);
});

t('自訂金額：加總不等於總額時禁止', () => {
    const bad = C.computeSplit({ amount: 3000, dec: 0, mode: 'amount', members: ['a', 'b'], parts: { a: '1000', b: '1500' }, rate: '0.2', baseDec: 0 });
    assert.strictEqual(bad.ok, false);
    assert.match(bad.errors[0], /相差 500/);
    const ok = C.computeSplit({ amount: 3000, dec: 0, mode: 'amount', members: ['a', 'b'], parts: { a: '1000', b: '2000' }, rate: '0.2', baseDec: 0 });
    assert.deepStrictEqual(ok.shares, { a: { o: 1000, b: 200 }, b: { o: 2000, b: 400 } });
});

t('按比例：加總必須 100%，尾差依最大餘數分配', () => {
    const bad = C.computeSplit({ amount: 999, dec: 0, mode: 'ratio', members: ['a', 'b'], parts: { a: '50', b: '40' }, rate: '1', baseDec: 0 });
    assert.strictEqual(bad.ok, false);
    const ok = C.computeSplit({ amount: 999, dec: 0, mode: 'ratio', members: ['a', 'b', 'c'], parts: { a: '50', b: '30', c: '20' }, rate: '1', baseDec: 0 });
    assert.deepStrictEqual(ok.shares, { a: { o: 499, b: 499 }, b: { o: 300, b: 300 }, c: { o: 200, b: 200 } });
    const thirds = C.computeSplit({ amount: 100, dec: 0, mode: 'ratio', members: ['a', 'b', 'c'], parts: { a: '33.34', b: '33.33', c: '33.33' }, rate: '1', baseDec: 0 });
    assert.strictEqual(sum(thirds.shares), 100);
});

t('驗證：金額 0、沒選成員都會被擋', () => {
    assert.strictEqual(C.computeSplit({ amount: 0, dec: 0, mode: 'equal', members: ['a'], rate: '1', baseDec: 0 }).ok, false);
    assert.strictEqual(C.computeSplit({ amount: 100, dec: 0, mode: 'equal', members: [], rate: '1', baseDec: 0 }).ok, false);
});

t('結算：淨額加總為零、轉帳建議筆數最少化', () => {
    const order = ['A', 'B', 'C'];
    const e1 = C.computeSplit({ amount: 900, dec: 0, mode: 'equal', members: order, rate: '1', baseDec: 0 });
    const e2 = C.computeSplit({ amount: 300, dec: 0, mode: 'equal', members: ['B', 'C'], rate: '1', baseDec: 0 });
    const exps = { x: { payer: 'A', baseAmt: e1.baseAmt, shares: e1.shares }, y: { payer: 'B', baseAmt: e2.baseAmt, shares: e2.shares } };
    const B = C.balances(order, exps, {});
    assert.deepStrictEqual([B.A.net, B.B.net, B.C.net], [600, -150, -450]);
    assert.strictEqual(B.A.net + B.B.net + B.C.net, 0);
    assert.deepStrictEqual(C.settle(order, B), [{ from: 'C', to: 'A', amt: 450 }, { from: 'B', to: 'A', amt: 150 }]);

    const tr = { t1: { from: 'B', to: 'A', amt: 150, status: 'paid' }, t2: { from: 'C', to: 'A', amt: 999, status: 'void' } };
    const B2 = C.balances(order, exps, tr);
    assert.deepStrictEqual(C.settle(order, B2), [{ from: 'C', to: 'A', amt: 450 }]);
});

t('支出刪除後重算：既有轉帳保留，方向自動反轉', () => {
    const order = ['A', 'B'];
    const tr = { t1: { from: 'B', to: 'A', amt: 100, status: 'done' } };
    const B = C.balances(order, {}, tr);
    assert.deepStrictEqual([B.A.net, B.B.net], [-100, 100]);
    assert.deepStrictEqual(C.settle(order, B), [{ from: 'A', to: 'B', amt: 100 }]);
});

t('多幣別混合：全部以台幣結算且加總為零', () => {
    const order = ['A', 'B', 'C'];
    const j = C.computeSplit({ amount: 12345, dec: 0, mode: 'equal', members: order, rate: '0.2134', baseDec: 0 });
    const u = C.computeSplit({ amount: 1999, dec: 2, mode: 'ratio', members: ['A', 'C'], parts: { A: '70', C: '30' }, rate: '32.4567', baseDec: 0 });
    const B = C.balances(order, { j: { payer: 'B', baseAmt: j.baseAmt, shares: j.shares }, u: { payer: 'C', baseAmt: u.baseAmt, shares: u.shares } }, {});
    assert.strictEqual(Object.values(B).reduce((s, x) => s + x.net, 0), 0);
    assert.strictEqual(sum(j.shares), j.baseAmt);
    assert.strictEqual(sum(u.shares), u.baseAmt);
});

t('金額格式化', () => {
    assert.strictEqual(C.formatAmount(1234567, 0), '1,234,567');
    assert.strictEqual(C.formatAmount(5, 2), '0.05');
    assert.strictEqual(C.formatAmount(-1500, 0), '-1,500');
    assert.strictEqual(C.toPlain(3334, 2), '33.34');
});

console.log(`\n全部通過：${pass} 項`);
