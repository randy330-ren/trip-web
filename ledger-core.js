(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.LedgerCore = api;
})(typeof self !== 'undefined' ? self : this, function () {
    const RATE_DP = 6;
    const RATE_SCALE = 10n ** BigInt(RATE_DP);
    const MAX_MINOR = 10n ** 13n;
    const pow10 = (n) => 10n ** BigInt(n);

    function divRound(a, b) {
        if (a < 0n) return -divRound(-a, b);
        return (a * 2n + b) / (b * 2n);
    }

    function parseAmount(str, dec) {
        const s = String(str ?? '').trim().replace(/,/g, '');
        if (!s) return { ok: false, err: '請輸入金額' };
        if (!/^\d+(\.\d+)?$/.test(s)) return { ok: false, err: '格式錯誤，只能輸入數字' };
        const [i, f = ''] = s.split('.');
        if (f.length > dec) return { ok: false, err: dec ? `最多 ${dec} 位小數` : '此幣別不可有小數' };
        const v = BigInt(i) * pow10(dec) + BigInt((f + '0'.repeat(dec)).slice(0, dec) || '0');
        if (v > MAX_MINOR) return { ok: false, err: '金額過大' };
        return { ok: true, v: Number(v) };
    }

    function formatAmount(minor, dec) {
        const s = String(Math.abs(minor)).padStart(dec + 1, '0');
        const i = dec ? s.slice(0, -dec) : s, f = dec ? s.slice(-dec) : '';
        return (minor < 0 ? '-' : '') + i.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (f ? '.' + f : '');
    }
    const toPlain = (minor, dec) => formatAmount(minor, dec).replace(/,/g, '');

    function rateString(n) {
        const f = (n % RATE_SCALE).toString().padStart(RATE_DP, '0').replace(/0+$/, '');
        return f ? `${n / RATE_SCALE}.${f}` : `${n / RATE_SCALE}`;
    }
    function parseRate(str) {
        const s = String(str ?? '').trim();
        if (!/^\d+(\.\d+)?$/.test(s)) return { ok: false, err: '格式錯誤' };
        const [i, f = ''] = s.split('.');
        if (f.length > RATE_DP) return { ok: false, err: `最多 ${RATE_DP} 位小數` };
        const n = BigInt(i) * RATE_SCALE + BigInt((f + '0'.repeat(RATE_DP)).slice(0, RATE_DP));
        if (n <= 0n) return { ok: false, err: '必須大於零' };
        return { ok: true, n, s: rateString(n) };
    }
    function mustRate(rate) {
        const r = parseRate(rate);
        if (!r.ok) throw new Error('invalid rate: ' + rate);
        return r;
    }

    // 外幣最小單位 → 基準幣別最小單位（四捨五入，半數進位）
    function convert(minor, fromDec, rate, toDec) {
        return Number(divRound(BigInt(minor) * mustRate(rate).n * pow10(toDec), pow10(fromDec) * RATE_SCALE));
    }
    // 基準幣別最小單位 → 外幣最小單位
    function convertBack(baseMinor, baseDec, rate, toDec) {
        return Number(divRound(BigInt(baseMinor) * RATE_SCALE * pow10(toDec), mustRate(rate).n * pow10(baseDec)));
    }

    // 外幣 A → 外幣 B：直接用兩邊對基準幣別的匯率一次算出，只四捨五入一次
    function convertCross(minor, fromDec, rateFrom, toDec, rateTo) {
        return Number(divRound(BigInt(minor) * mustRate(rateFrom).n * pow10(toDec), pow10(fromDec) * mustRate(rateTo).n));
    }

    // 最大餘數法：依權重把整數 total 拆開，加總必等於 total；餘數相同時依順序優先（seed 讓優先起點輪替，尾數不固定落在前面的人）
    // bias（選填）：餘數相同時，累計多拿尾數較少的人優先
    function allocate(total, weights, seed = 0, bias = null) {
        const n = weights.length, rot = (i) => (((i - seed) % n) + n) % n;
        const W = weights.reduce((s, w) => s + BigInt(w), 0n);
        if (W <= 0n) return weights.map(() => 0);
        const T = BigInt(total);
        const rows = weights.map((w, i) => { const p = T * BigInt(w); return { i, q: p / W, r: p % W }; });
        let left = T - rows.reduce((s, x) => s + x.q, 0n);
        [...rows].sort((a, b) => (b.r > a.r ? 1 : b.r < a.r ? -1 : (bias ? (bias[a.i] || 0) - (bias[b.i] || 0) : 0) || rot(a.i) - rot(b.i))).forEach((x) => {
            if (left > 0n) { x.q += 1n; left -= 1n; }
        });
        return rows.map((x) => Number(x.q));
    }

    // 先依原幣別分攤，再把基準幣別總額依原幣別份額分配，確保兩邊加總都正確
    function computeSplit({ amount, dec, mode, members, parts = {}, rate, baseDec, seed = 0, bias = null }) {
        const errors = [];
        if (!(Number.isInteger(amount) && amount > 0)) errors.push('支出金額必須大於零');
        if (!members || !members.length) errors.push('請至少選擇一位分攤成員');
        const r = parseRate(rate);
        if (!r.ok) errors.push('匯率' + r.err);
        if (errors.length) return { ok: false, errors };

        const bs = mode === 'equal' ? bias : null;
        let orig;
        if (mode === 'equal') {
            orig = allocate(amount, members.map(() => 1), seed, bs);
        } else if (mode === 'amount') {
            const vals = members.map((p) => parseAmount(String(parts[p] ?? '').trim() || '0', dec));
            const bad = vals.findIndex((v) => !v.ok);
            if (bad >= 0) return { ok: false, errors: [`自訂金額格式錯誤：${vals[bad].err}`] };
            orig = vals.map((v) => v.v);
            const sum = orig.reduce((s, v) => s + v, 0);
            if (sum !== amount) return { ok: false, errors: [`自訂金額加總 ${formatAmount(sum, dec)}，與總額 ${formatAmount(amount, dec)} 相差 ${formatAmount(amount - sum, dec)}`] };
        } else if (mode === 'ratio') {
            const vals = members.map((p) => parseAmount(String(parts[p] ?? '').trim() || '0', 2));
            const bad = vals.findIndex((v) => !v.ok);
            if (bad >= 0) return { ok: false, errors: [`比例格式錯誤：${vals[bad].err}`] };
            const w = vals.map((v) => v.v);
            const sum = w.reduce((s, v) => s + v, 0);
            if (sum !== 10000) return { ok: false, errors: [`比例加總 ${formatAmount(sum, 2)}%，必須等於 100%`] };
            orig = allocate(amount, w, seed);
        } else {
            return { ok: false, errors: ['未知的分帳方式'] };
        }

        const baseAmt = convert(amount, dec, r.s, baseDec);
        const base = allocate(baseAmt, orig, seed, bs);
        const shares = {};
        members.forEach((p, i) => { shares[p] = { o: orig[i], b: base[i] }; });
        return { ok: true, errors: [], baseAmt, shares, rate: r.s };
    }

    // 平均分攤的累計尾數：每人在各筆多拿（正）或少拿（負）的金額，放大 2520 倍以保持整數；只累計 upto 之前（建立順序）的支出
    const TAIL_K = 2520;
    const chrono = (expenses) => Object.entries(expenses || {}).filter(([, e]) => e).sort(([a, x], [b, y]) => ((x.ts || 0) - (y.ts || 0)) || (a < b ? -1 : a > b ? 1 : 0));
    function tailDelta(bias, e, shares) {
        const ps = Object.keys(shares), n = ps.length;
        if (!n || !Number.isInteger(e.baseAmt)) return;
        ps.forEach((p) => { bias[p] = (bias[p] || 0) + Math.round((n * shares[p].b - e.baseAmt) * TAIL_K / n); });
    }
    function tailBias(expenses, upto) {
        const bias = {};
        for (const [id, e] of chrono(expenses)) {
            if (id === upto) break;
            if (e.mode === 'equal' && e.shares) tailDelta(bias, e, e.shares);
        }
        return bias;
    }

    // 依建立順序重算所有「平均分攤」的尾數，讓長期兩邊差距最多 1 元；總額與已付不動，每人每筆只允許 ±1，否則整批中止
    function rebalanceTails(expenses, order, baseDec) {
        const bias = {}, changes = {};
        for (const [id, e] of chrono(expenses)) {
            if (e.mode !== 'equal' || !e.shares || !Number.isInteger(e.amount) || !Number.isInteger(e.dec)) continue;
            const ids = Object.keys(e.shares), members = [...(order || []).filter((p) => e.shares[p]), ...ids.filter((p) => !(order || []).includes(p))];
            const sp = computeSplit({ amount: e.amount, dec: e.dec, mode: 'equal', members, rate: e.rate, baseDec, seed: e.seed | 0, bias: members.map((p) => bias[p] || 0) });
            if (!sp.ok || sp.baseAmt !== e.baseAmt) return { ok: false, err: `無法重算：${id}` };
            if (members.some((p) => Math.abs(sp.shares[p].b - e.shares[p].b) > 1 || Math.abs(sp.shares[p].o - e.shares[p].o) > 1)) return { ok: false, err: `尾數差異過大：${id}` };
            tailDelta(bias, e, sp.shares);
            if (members.some((p) => sp.shares[p].b !== e.shares[p].b || sp.shares[p].o !== e.shares[p].o)) changes[id] = { shares: sp.shares, old: e.shares };
        }
        return { ok: true, changes };
    }

    // 淨額 = 已付 − 應負擔 + 已轉出 − 已收到（已轉帳、已完成的轉帳都計入）
    function balances(order, expenses, transfers) {
        const B = {};
        const get = (p) => B[p] || (B[p] = { paid: 0, owe: 0, sent: 0, recv: 0, net: 0 });
        (order || []).forEach(get);
        Object.values(expenses || {}).forEach((e) => {
            if (!e || !e.shares || !Number.isInteger(e.baseAmt)) return;
            get(e.payer).paid += e.baseAmt;
            Object.entries(e.shares).forEach(([p, s]) => { get(p).owe += s && Number.isInteger(s.b) ? s.b : 0; });
        });
        Object.values(transfers || {}).forEach((t) => {
            if (!t || (t.status !== 'paid' && t.status !== 'done') || !Number.isInteger(t.amt)) return;
            get(t.from).sent += t.amt;
            get(t.to).recv += t.amt;
        });
        Object.values(B).forEach((x) => { x.net = x.paid - x.owe + x.sent - x.recv; });
        return B;
    }

    // 每次讓「欠最多的人」付給「應收最多的人」，n 人最多 n−1 筆
    function settle(order, B) {
        const rank = (p) => { const i = (order || []).indexOf(p); return i < 0 ? 1e9 : i; };
        const cmp = (a, b) => (b.v - a.v) || (rank(a.p) - rank(b.p)) || (a.p < b.p ? -1 : 1);
        const cred = Object.entries(B).filter(([, x]) => x.net > 0).map(([p, x]) => ({ p, v: x.net })).sort(cmp);
        const debt = Object.entries(B).filter(([, x]) => x.net < 0).map(([p, x]) => ({ p, v: -x.net })).sort(cmp);
        const out = [];
        while (cred.length && debt.length) {
            const c = cred[0], d = debt[0], amt = Math.min(c.v, d.v);
            out.push({ from: d.p, to: c.p, amt });
            c.v -= amt; d.v -= amt;
            if (!c.v) cred.shift();
            if (!d.v) debt.shift();
            cred.sort(cmp); debt.sort(cmp);
        }
        return out;
    }

    // 小算盤：解析含 + - × ÷ 的算式，用整數分數運算，最後依 dec 四捨五入（半數進位）
    function evalCalc(expr, dec) {
        const s = String(expr ?? '').replace(/[,\s]/g, '').replace(/×/g, '*').replace(/÷/g, '/');
        if (!s) return { ok: false, err: '請輸入' };
        const toFrac = (t) => { const [i, f = ''] = t.split('.'); return { n: BigInt((i || '0') + f), d: pow10(f.length) }; };
        const toks = [];
        let i = 0;
        while (i < s.length) {
            const c = s[i];
            if ('+-*/'.includes(c)) { toks.push({ op: c }); i++; continue; }
            const m = /^\d*\.?\d*/.exec(s.slice(i));
            if (!m || !m[0] || m[0] === '.' || (m[0].match(/\./g) || []).length > 1) return { ok: false, err: '格式錯誤' };
            toks.push({ num: toFrac(m[0]) }); i += m[0].length;
        }
        if (!toks.length || toks[0].op || toks[toks.length - 1].op) return { ok: false, err: '格式錯誤' };
        for (let k = 1; k < toks.length; k++) if (!!toks[k].op === !!toks[k - 1].op) return { ok: false, err: '格式錯誤' };
        const nums = [toks[0].num], ops = [];
        for (let k = 1; k < toks.length; k += 2) {
            const op = toks[k].op, b = toks[k + 1].num, a = nums[nums.length - 1];
            if (op === '*') nums[nums.length - 1] = { n: a.n * b.n, d: a.d * b.d };
            else if (op === '/') { if (b.n === 0n) return { ok: false, err: '不能除以零' }; nums[nums.length - 1] = { n: a.n * b.d, d: a.d * b.n }; }
            else { ops.push(op); nums.push(b); }
        }
        let acc = nums[0];
        for (let k = 0; k < ops.length; k++) { const b = nums[k + 1]; acc = ops[k] === '+' ? { n: acc.n * b.d + b.n * acc.d, d: acc.d * b.d } : { n: acc.n * b.d - b.n * acc.d, d: acc.d * b.d }; }
        if (acc.d < 0n) acc = { n: -acc.n, d: -acc.d };
        const v = Number(divRound(acc.n * pow10(dec), acc.d));
        if (v > Number(MAX_MINOR)) return { ok: false, err: '金額過大' };
        return { ok: true, v };
    }

    return { RATE_DP, parseAmount, formatAmount, toPlain, parseRate, convert, convertBack, convertCross, allocate, computeSplit, tailBias, rebalanceTails, balances, settle, evalCalc };
});
