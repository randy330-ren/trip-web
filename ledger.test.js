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

t('尾數依 seed 輪替，加總仍等於總額', () => {
    const tail = (seed) => C.allocate(100, [1, 1, 1], seed);
    assert.deepStrictEqual(tail(0), [34, 33, 33]);
    assert.deepStrictEqual(tail(1), [33, 34, 33]);
    assert.deepStrictEqual(tail(2), [33, 33, 34]);
    assert.deepStrictEqual(tail(3), [34, 33, 33]);
    const r = C.computeSplit({ amount: 100, dec: 0, mode: 'equal', members: ['a', 'b', 'c'], rate: '1', baseDec: 0, seed: 1 });
    assert.strictEqual(r.shares.b.b, 34);
});

t('累計尾數平衡：連續奇數金額兩人輪流多拿，差距最多 1 元', () => {
    const mk = (amount, ts) => ({ mode: 'equal', amount, dec: 0, rate: '1', baseAmt: amount, ts, seed: 0, shares: { a: { o: Math.ceil(amount / 2), b: Math.ceil(amount / 2) }, b: { o: Math.floor(amount / 2), b: Math.floor(amount / 2) } } });
    const ex = { e1: mk(6355, 1), e2: mk(1338, 2), e3: mk(495, 3), e4: mk(145 * 2, 4) };
    const r = C.rebalanceTails(ex, ['a', 'b'], 0);
    assert.strictEqual(r.ok, true);
    const fin = Object.fromEntries(Object.entries(ex).map(([k, e]) => [k, r.changes[k] ? { ...e, shares: r.changes[k].shares } : e]));
    const tot = (p) => Object.values(fin).reduce((s, e) => s + e.shares[p].b, 0);
    assert.strictEqual(tot('a') + tot('b'), 6355 + 1338 + 495 + 290);
    assert.ok(Math.abs(tot('a') - tot('b')) <= 1);
    assert.ok(!r.changes.e2 && !r.changes.e4);
    assert.deepStrictEqual(C.rebalanceTails(fin, ['a', 'b'], 0).changes, {});
    const bias = C.tailBias(fin);
    const nx = C.computeSplit({ amount: 101, dec: 0, mode: 'equal', members: ['a', 'b'], rate: '1', baseDec: 0, seed: 0, bias: ['a', 'b'].map((p) => bias[p] || 0) });
    assert.strictEqual(nx.shares.a.b + nx.shares.b.b, 101);
    assert.ok(Math.abs(tot('a') + nx.shares.a.b - tot('b') - nx.shares.b.b) <= 1);
});

t('累計尾數平衡：差異超過 ±1 時整批中止', () => {
    const bad = { e1: { mode: 'equal', amount: 100, dec: 0, rate: '1', baseAmt: 100, ts: 1, seed: 0, shares: { a: { o: 70, b: 70 }, b: { o: 30, b: 30 } } } };
    assert.strictEqual(C.rebalanceTails(bad, ['a', 'b'], 0).ok, false);
});

t('金額格式化', () => {
    assert.strictEqual(C.formatAmount(1234567, 0), '1,234,567');
    assert.strictEqual(C.formatAmount(5, 2), '0.05');
    assert.strictEqual(C.formatAmount(-1500, 0), '-1,500');
    assert.strictEqual(C.toPlain(3334, 2), '33.34');
});

t('刪除影響：已有轉帳且刪除會改變淨額才警告', () => {
    const ex = { e1: { payer: 'a', baseAmt: 200, shares: { a: { b: 100 }, b: { b: 100 } } }, e2: { payer: 'b', baseAmt: 60, shares: { a: { b: 30 }, b: { b: 30 } } } };
    const ord = ['a', 'b'];
    assert.strictEqual(C.deleteImpact(ord, ex, {}, 'e2').warn, false);   // 沒有轉帳：正常刪除
    const tr = { t1: { from: 'b', to: 'a', amt: 70, status: 'done' } };
    const r = C.deleteImpact(ord, ex, tr, 'e2');
    assert.strictEqual(r.warn, true);
    assert.strictEqual(r.open0, 0);
    assert.strictEqual(r.open1, 30);
    assert.deepStrictEqual(r.changes.map((c) => c.p), ['a', 'b']);
    assert.strictEqual(C.deleteImpact(ord, ex, { t1: { ...tr.t1, status: 'void' } }, 'e2').warn, false);
});

t('鎖定方案：狀態、過期偵測、完成後不再擋', () => {
    const ord = ['a', 'b', 'c'];
    let ex = { e1: { payer: 'a', baseAmt: 300, shares: { a: { b: 100 }, b: { b: 100 }, c: { b: 100 } } } };
    const plan = { id: 'p1', items: { i0: { from: 'b', to: 'a', amt: 100 }, i1: { from: 'c', to: 'a', amt: 100 } } };
    let r = C.planState(ord, ex, {}, plan);
    assert.deepStrictEqual(r.items.map((i) => i.status), ['todo', 'todo']);
    assert.strictEqual(r.stale, false);
    const tr = { t1: { from: 'b', to: 'a', amt: 100, status: 'paid', plan: 'p1', pk: 'i0' } };
    r = C.planState(ord, ex, tr, plan);
    assert.deepStrictEqual(r.items.map((i) => i.status), ['paid', 'todo']);
    assert.strictEqual(r.stale, false);
    ex = { ...ex, e2: { payer: 'b', baseAmt: 90, shares: { a: { b: 30 }, b: { b: 30 }, c: { b: 30 } } } };
    assert.strictEqual(C.planState(ord, ex, tr, plan).stale, true);          // 鎖定後新增支出
    const all = { t1: { ...tr.t1, status: 'done' }, t2: { from: 'c', to: 'a', amt: 100, status: 'done', plan: 'p1', pk: 'i1' } };
    r = C.planState(ord, { e1: ex.e1 }, all, plan);
    assert.strictEqual(r.done, true);
    assert.strictEqual(C.planState(ord, { e1: ex.e1 }, { t1: { ...tr.t1, status: 'void' } }, plan).items[0].status, 'todo');
    assert.strictEqual(C.planState(ord, ex, {}, null), null);
});

t('日圓結算：日圓支出用原始金額、舊轉帳由台幣換算、新轉帳用實際日圓', () => {
    const U = { cur: 'JPY', dec: 0, rate: '0.2064', baseDec: 0 };
    const ex = { e1: { payer: 'a', cur: 'JPY', dec: 0, amount: 30001, baseAmt: 6192, shares: { a: { o: 10001, b: 2064 }, b: { o: 10000, b: 2064 }, c: { o: 10000, b: 2064 } } } };
    let B = C.balances(['a', 'b', 'c'], ex, {}, U);
    assert.deepStrictEqual([B.a.paid, B.a.owe, B.a.net, B.b.net, B.c.net], [30001, 10001, 20000, -10000, -10000]);
    assert.strictEqual(C.transferAmount({ amt: 2064, status: 'done' }, U), 10000);                 // 舊紀錄：台幣 → 日圓
    assert.strictEqual(C.transferAmount({ amt: 2064, amtJ: 9990, status: 'done' }, U), 9990);      // 新紀錄：實際轉的日圓
    B = C.balances(['a', 'b', 'c'], ex, { t1: { from: 'b', to: 'a', amt: 2062, amtJ: 9990, status: 'done' } }, U);
    assert.deepStrictEqual([B.a.net, B.b.net, B.c.net], [20000 - 9990, -10, -10000]);
    assert.strictEqual(Object.values(B).reduce((x, y) => x + y.net, 0), 0);
    const tw = { e2: { payer: 'a', cur: 'TWD', dec: 0, amount: 100, baseAmt: 100, shares: { a: { o: 50, b: 50 }, c: { o: 50, b: 50 } } } };
    B = C.balances(['a', 'c'], tw, {}, U);                                                          // 非日圓支出：換算後按比例分
    assert.deepStrictEqual([B.a.paid, B.a.owe, B.c.owe], [484, 242, 242]);
    assert.strictEqual(Object.values(B).reduce((x, y) => x + y.net, 0), 0);
    const plan = { id: 'p', cur: 'JPY', items: { i0: { from: 'b', to: 'a', amt: 10000 }, i1: { from: 'c', to: 'a', amt: 10000 } } };
    assert.strictEqual(C.planState(['a', 'b', 'c'], ex, {}, plan, U).stale, false);
    assert.strictEqual(C.planState(['a', 'b', 'c'], ex, {}, { ...plan, cur: undefined }, U).curMismatch, true);   // 舊的台幣方案失效
    assert.strictEqual(C.deleteImpact(['a', 'b', 'c'], ex, { t1: { from: 'b', to: 'a', amt: 2064, status: 'done' } }, 'e1', U).changes.find((c) => c.p === 'b').from, 0);
});

const LD = require('./ledger-detail.js');
t('明細分帳：未稅 8%/10% 計稅、折扣、免稅前後與退稅取整', () => {
    const it = (unit, rate, star = true) => ({ unit, rate, star });
    const a = LD.calcPerson([{ item: it(227, 8), n: 3 }, { item: it(1980, 10, false), n: 1 }], { basis: 'before', taxMode: 'excl', disc: 1 });
    assert.deepStrictEqual(a, { gross: 2913, refund: 54, amount: 2913 });
    assert.strictEqual(LD.calcPerson([{ item: it(227, 8), n: 3 }], { basis: 'after', taxMode: 'excl', disc: 1 }).amount, 735 - 54);
    assert.strictEqual(LD.calcPerson([{ item: it(1100, 10), n: 1 }], { basis: 'before', taxMode: 'incl', disc: 1 }).refund, 100);
    assert.strictEqual(LD.calcPerson([{ item: it(1000, 10), n: 1 }], { basis: 'before', taxMode: 'excl', disc: 0.95 }).gross, 1045);
});
t('明細分帳：匯入 JSON 容錯與錯誤訊息', () => {
    const ok = LD.parseReceipt('好的：\n```json\n{"receipt":{"store":"X","date":"2026/11/05","items":[{"jp":"A","unit":"¥1,000","qty":2}]}}\n```');
    assert.strictEqual(ok.receipt.items[0].unit, 1000);
    assert.strictEqual(ok.receipt.items[0].rate, 10);
    assert.strictEqual(ok.receipt.date, '2026-11-05');
    assert.ok(LD.parseReceipt('{"items":[]}').error);
    assert.ok(LD.parseReceipt('{"items":[{"unit":10,"qty":1.5}]}').error);
    assert.ok(LD.parseReceipt('沒有json').error);
});
t('退稅分配：依預計退稅比例拆開，加總等於實際退稅', () => {
    const r = C.allocate(1500, [54, 120, 30]);
    assert.strictEqual(r.reduce((x, y) => x + y, 0), 1500);
});

console.log(`\n全部通過：${pass} 項`);
