(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.LedgerDetail = api;
})(typeof self !== 'undefined' ? self : this, function () {
    // ---------- 純計算（可用 node 測試） ----------
    function parseNum(v) {
        if (typeof v === 'number') return isFinite(v) ? v : NaN;
        if (typeof v === 'string') { const t = v.replace(/[^0-9.\-]/g, ''); return t === '' ? NaN : parseFloat(t); }
        return NaN;
    }
    function toBool(v, d) {
        if (v === undefined || v === null) return d;
        if (typeof v === 'string') return !/^(false|0|no|n|否)$/i.test(v.trim());
        return !!v;
    }
    // lines: [{item, n}]；s: {basis:'before'|'after', disc:乘數, taxMode:'excl'|'incl'}；結果皆為整數日圓
    function calcPerson(lines, s) {
        const disc = s.disc == null ? 1 : s.disc, incl = s.taxMode === 'incl';
        let base = 0, tax = 0, refund = 0;
        for (const { item, n } of lines) {
            const p = item.unit * n * disc, r = item.rate / 100;
            const b = incl ? p / (1 + r) : p, t = incl ? p - b : p * r;
            base += b; tax += t;
            if (item.star) refund += t;
        }
        const gross = base + tax;
        return { raw: gross, base: Math.round(base), tax: Math.round(tax), gross: Math.round(gross), refund: Math.round(refund), amount: Math.round(s.basis === 'after' ? gross - refund : gross) };
    }
    // 最大餘數法：把各人未進位的金額調成整數，且加總剛好等於 total（差幾円分給小數餘數最大的人）
    function alignTotals(raws, total) {
        const fl = raws.map(Math.floor), fr = raws.map((x, i) => x - fl[i]), idx = raws.map((_, i) => i);
        let diff = total - fl.reduce((a, b) => a + b, 0);
        idx.sort((a, b) => (diff >= 0 ? fr[b] - fr[a] : fr[a] - fr[b]) || a - b);
        const out = fl.slice();
        for (let k = 0; diff !== 0 && k < 1000; k++) { const i = idx[k % idx.length]; if (diff > 0) { out[i]++; diff--; } else { out[i]--; diff++; } }
        return out;
    }
    // 把每人明細整理成一段文字，放進支出備註
    function buildNote(rows, S, receipt, notes) {
        const y = (n) => '¥' + Math.round(Math.abs(n)).toLocaleString('en-US');
        const head = `【明細分帳】${receipt.name}（${S.basis === 'after' ? '免稅後' : '免稅前'}${S.disc < 1 ? `，含 ${receipt.couponPercent}% 折扣` : ''}）`;
        const body = rows.map(({ p, lines, c, adj, amount }) => {
            const L = lines.map((l) => `  ・${l.item.zh || l.item.jp} × ${l.n}　${y(l.item.unit * l.n * S.disc)}${l.item.star ? '' : '（不退稅）'}`).join('\n');
            const eq = `  小計 ${y(c.base)} ＋ 稅 ${y(c.tax)}${S.basis === 'after' ? ` － 退稅 ${y(c.refund)}` : ''}${adj ? ` ${adj > 0 ? '＋' : '－'} 進位 ${y(adj)}` : ''} ＝ ${y(amount)}`;
            const rf = S.basis === 'before' && c.refund > 0 ? `\n  預計可退 ${y(c.refund)}` : '', nt = ((notes || {})[p.id] || '').trim();
            return `▸ ${p.name}　${y(amount)}\n${L}\n${eq}${rf}${nt ? `\n  備註：${nt}` : ''}`;
        });
        return [head, ...body].join('\n');
    }
    function extractJSON(text) {
        if (typeof text !== 'string' || !text.trim()) return { error: '內容是空的' };
        const t = text.trim();
        try { return { value: JSON.parse(t) }; } catch (e) { }
        const a = t.indexOf('{'), b = t.lastIndexOf('}');
        if (a >= 0 && b > a) {
            try { return { value: JSON.parse(t.slice(a, b + 1)) }; } catch (e) { return { error: '格式有誤：' + e.message }; }
        }
        return { error: '找不到 JSON 內容（需要以 { 開頭、} 結尾）' };
    }
    function parseReceipt(text) {
        const j = extractJSON(text);
        if (j.error) return { error: j.error };
        return parseReceiptObj(j.value);
    }
    // 個人記帳可一次匯入多張：{"receipts":[…]}；單張格式也照樣接受
    function parseReceipts(text) {
        const j = extractJSON(text);
        if (j.error) return { error: j.error };
        const v = j.value;
        if (v && Array.isArray(v.receipts)) {
            const list = [], errs = [];
            v.receipts.forEach((x, i) => { const p = parseReceiptObj(x && (x.receipt || x)); if (p.error) errs.push(`第 ${i + 1} 張：${p.error}`); else list.push(p.receipt); });
            return list.length ? { receipts: list, errs } : { error: errs.join('；') || 'receipts 是空的' };
        }
        const p = parseReceiptObj(v);
        return p.error ? { error: p.error } : { receipts: [p.receipt], errs: [] };
    }
    function parseReceiptObj(obj) {
        const raw = obj && (obj.receipt || (Array.isArray(obj.items) ? obj : null));
        if (!raw || !Array.isArray(raw.items) || !raw.items.length) return { error: '缺少 items（品項清單），或清單是空的' };
        const items = [], errs = [], idMap = {};
        raw.items.forEach((it, i) => {
            if (!it || typeof it !== 'object') { errs.push(`第 ${i + 1} 筆不是物件`); return; }
            const label = it.jp || it.zh || '?';
            const unit = parseNum(it.unit);
            const qty = it.qty == null ? 1 : parseNum(it.qty);
            const rate = it.rate == null ? 10 : parseNum(it.rate);
            if (!(unit >= 0)) { errs.push(`第 ${i + 1} 筆（${label}）的 unit 不是有效數字`); return; }
            if (!(qty >= 1) || Math.floor(qty) !== qty) { errs.push(`第 ${i + 1} 筆（${label}）的 qty 必須是 1 以上的整數`); return; }
            if (!(rate >= 0 && rate <= 100)) { errs.push(`第 ${i + 1} 筆（${label}）的 rate 不是有效稅率`); return; }
            idMap[String(it.id != null ? it.id : i + 1)] = items.length + 1;
            items.push({ id: items.length + 1, jp: String(it.jp || it.zh || '品項 ' + (i + 1)), zh: String(it.zh || it.jp || ''), unit, qty, rate, star: toBool(it.star, true), rate0: rate, star0: toBool(it.star, true), cat: String(it.cat || '').trim().slice(0, 20) });
        });
        if (errs.length) return { error: errs.slice(0, 4).join('；') + (errs.length > 4 ? `…（共 ${errs.length} 處）` : '') };
        const cp = parseNum(raw.couponPercent), total = parseNum(raw.receiptTotal !== undefined ? raw.receiptTotal : raw.total);
        const refund = parseNum(raw.receiptRefund !== undefined ? raw.receiptRefund : raw.refund);
        const ic = parseNum(raw.itemCount);
        const ds = String(raw.date || '').replace(/\//g, '-');
        const date = /^\d{4}-\d{2}-\d{2}$/.test(ds) ? ds : '', store = String(raw.store || '');
        return {
            idMap,
            receipt: {
                name: (String(raw.name || '').trim() || [store, date].filter(Boolean).join(' ') || '未命名收據').slice(0, 50),
                store, date, taxMode: raw.taxMode === 'incl' || raw.taxMode === 'included' ? 'incl' : 'excl',
                couponPercent: cp >= 0 && cp <= 100 ? cp : 0, total: total > 0 ? total : null, refund: refund >= 0 ? refund : null, itemCount: ic > 0 ? Math.floor(ic) : null, items
            }
        };
    }
    // 個人記帳用：每個品項各自的日圓金額；品項全收、與收據合計差 5 円內時，用最大餘數法對齊合計
    function itemAmounts(r, coupon, basis) {
        const disc = coupon && r.couponPercent > 0 ? 1 - r.couponPercent / 100 : 1;
        const cs = r.items.map((item) => calcPerson([{ item, n: item.qty }], { basis, taxMode: r.taxMode, disc }));
        if (basis !== 'after' && r.total > 0 && (coupon || !(r.couponPercent > 0))) {
            const raws = cs.map((c) => c.raw);
            if (Math.abs(Math.round(raws.reduce((a, b) => a + b, 0)) - r.total) <= 5) return alignTotals(raws, r.total);
        }
        return cs.map((c) => c.amount);
    }
    // 完整性檢查：回傳警告文字陣列（漏拍／混入別張／缺合計）；applyCoupon 為是否套用收據折扣
    function checkReceipt(r, applyCoupon) {
        const w = [], items = r.items || [];
        const disc = applyCoupon !== false && r.couponPercent > 0 ? 1 - r.couponPercent / 100 : 1;
        const qty = items.reduce((a, i) => a + i.qty, 0);
        if (r.itemCount && r.itemCount !== qty) w.push(`件數對不上：收據點數 ${r.itemCount} 件，匯入 ${qty} 件（${qty < r.itemCount ? `少 ${r.itemCount - qty} 件，可能漏拍或 AI 漏列` : `多 ${qty - r.itemCount} 件，可能混入別張或重複`}）`);
        let over = !!(r.itemCount && qty > r.itemCount);
        if (!(r.total > 0)) w.push('沒有收據合計，無法核對是否漏拍或混入別張');
        else if (disc < 1 || !(r.couponPercent > 0)) {
            const gross = calcPerson(items.map((item) => ({ item, n: item.qty })), { basis: 'before', taxMode: r.taxMode, disc }).gross, diff = gross - r.total;
            if (Math.abs(diff) > 5) { over = over || diff > 0; w.push(`金額對不上：品項加總 ¥${gross.toLocaleString('en-US')}，收據 ¥${r.total.toLocaleString('en-US')}（${diff < 0 ? `少 ¥${-diff}，可能漏拍上／下半部` : `多 ¥${diff}，可能混入別張或重複拍到`}）`); }
        }
        if (r.refund != null) {
            const rf = calcPerson(items.map((item) => ({ item, n: item.qty })), { basis: 'before', taxMode: r.taxMode, disc }).refund, d = rf - r.refund;
            if (Math.abs(d) > 5) w.push(`退稅額對不上：預計退稅 ¥${rf.toLocaleString('en-US')}，收據 ¥${r.refund.toLocaleString('en-US')}（${d < 0 ? '少' : '多'} ¥${Math.abs(d)}，請檢查 ★ 退稅標記與稅率）`);
        }
        if (over) {
            const seen = {}, dup = [];
            items.forEach((i) => { const k = [i.jp, i.unit, i.qty].join('|'); if (seen[k] && !dup.includes(i.jp)) dup.push(i.jp); seen[k] = 1; });
            if (dup.length) w.push(`疑似重複品項：${dup.slice(0, 5).join('、')}${dup.length > 5 ? '…' : ''}（多張照片重疊拍到時常見）`);
        }
        return w;
    }
    // 匯入檔若含舊版的朋友與分配（朋友名單 people、分配 assign），依名字對應到目前的團員
    function parseImport(text, people) {
        const p = parseReceipt(text);
        if (p.error) return p;
        const res = { receipt: p.receipt, assign: null, basis: null, coupon: null, matched: [], missing: [] };
        const j = extractJSON(text).value;
        if (!j || !Array.isArray(j.people) || !j.assign || typeof j.assign !== 'object') return res;
        const norm = (x) => String(x || '').trim().toLowerCase(), byName = {}, pmap = {}, used = new Set();
        (people || []).forEach((x) => { if (!(norm(x.name) in byName)) byName[norm(x.name)] = x.id; });
        Object.values(j.assign).forEach((row) => { if (row && typeof row === 'object') Object.keys(row).forEach((k) => { if (parseNum(row[k]) > 0) used.add(k); }); });
        j.people.forEach((op) => {
            if (!op || typeof op.id !== 'string' || !used.has(op.id)) return;
            const nid = byName[norm(op.name)];
            if (nid) { pmap[op.id] = nid; res.matched.push(String(op.name)); } else res.missing.push(String(op.name));
        });
        res.assign = {};
        for (const oid in j.assign) {
            const nid = p.idMap[oid], row = j.assign[oid];
            if (!nid || !row || typeof row !== 'object') continue;
            let left = p.receipt.items[nid - 1].qty;
            const out = {};
            for (const op in row) {
                const np = pmap[op];
                let n = Math.floor(parseNum(row[op]));
                if (!np || !(n > 0) || left <= 0) continue;
                n = Math.min(n, left); out[np] = (out[np] || 0) + n; left -= n;
            }
            if (Object.keys(out).length) res.assign[nid] = out;
        }
        const so = j.s || j.settings || {};
        res.basis = so.basis === 'after' ? 'after' : 'before';
        res.coupon = so.coupon !== false;
        return res;
    }
    function buildPrompt(cats, multi) {
        const withCat = Array.isArray(cats) && cats.length;
        return [
            '你是收據資料整理助手。我會附上日本購物收據的照片（可能有多張，是同一張收據的不同段落）。請把所有品項整理成下面格式的 JSON。請只輸出一個 json 程式碼區塊，欄位名稱不要改。',
            '', 'JSON 格式：', '{', '  "receipt": {', '    "name": "店名 日期（例如：唐吉訶德米子店 2026-11-05）",', '    "store": "店名",', '    "date": "YYYY-MM-DD",',
            '    "taxMode": "excl",', '    "couponPercent": 0,', '    "receiptTotal": 0,', '    "receiptRefund": null,', '    "itemCount": 0,', '    "items": [',
            '      {"jp": "收據上的原文品名", "zh": "簡短中文品名（可推測）", "unit": 249, "qty": 1, "star": true, "rate": 8' + (withCat ? ', "cat": "餐飲"' : '') + '}', '    ]', '  }', '}', '',
            '欄位規則：',
            '1. items：每個品項一筆。收據寫「3コ×単227 ¥681」就是 unit=227、qty=3。同名但條碼不同的品項要分成兩筆。',
            '2. unit：收據上的單價數字，不要自己換算或加減稅。',
            '3. taxMode：品項價格是未稅（合計 ＝ 小計 ＋ 稅額）填 "excl"；價格已含稅（內稅／税込）填 "incl"。請用「小計、稅額、合計」是否相加成立來判斷。',
            '4. rate：消費稅率，只填 8 或 10。標示「*」或軽減税率的食品飲料（酒類除外）是 8，其餘是 10。',
            '5. star：該品項是否為免稅對象。收據上有 ★ 標記的填 true，沒有的填 false。若收據完全沒有免稅標記，全部填 true，並在 JSON 外面告訴我。',
            '6. couponPercent：收據上的整單折扣百分比（例如「クーポン割引 5%」填 5），沒有填 0。若折扣是固定金額而不是百分比，填 0，並在 JSON 外面告訴我金額。',
            '7. receiptTotal：收據最終合計（含稅總額，日圓整數）。receiptRefund：收據上的免稅返金額／退稅額，沒有就填 null。',
            '8. 請自行核對：所有品項 unit × qty 加總要等於收據的折扣前小計，總件數要等於收據的點數。不一致時，請在 JSON 外面列出可能漏掉或看錯的品項。',
            '9. 看不清楚的品名請用最接近的文字，並在 JSON 外面標註。',
            '10. itemCount：收據上印的總點數／總件數（例如「点数 12」填 12），沒印就填 0。',
            (multi ? '11. 若照片只拍到收據的一部分（缺上半或下半、沒看到合計），請先在 JSON 外面說明並詢問我，不要硬湊；多張照片重疊的品項只列一次。' : '11. 若照片只拍到收據的一部分（缺上半或下半、沒看到合計），或混入不屬於同一張收據的照片，請先在 JSON 外面說明並詢問我，不要硬湊；多張照片重疊的品項只列一次。')
        ].concat(withCat ? [`12. cat：每個品項的分類，只能從這些選一個：${cats.map((c) => `「${c}」`).join('')}。判斷不出來填「其他」。`] : [],
            multi ? ['13. 我可能一次附上好幾張「不同的收據」。每張收據各整理成一包（就是上面 receipt 裡面的那包欄位），全部放進陣列，輸出成 {"receipts": [第一張收據, 第二張收據, …]}；同一張收據拍成多張照片（上半、下半）請合併成一包。每張收據的 name、date、receiptTotal、itemCount 要分開填。無法判斷某張照片屬於哪一張收據時，請先在 JSON 外面詢問我。'] : []).join('\n');
    }

    // ---------- 介面（只在瀏覽器執行） ----------
    const COLORS = ['#d9381e', '#2b7de9', '#1f9d6b', '#a855f7', '#e8a317', '#0ea5b7'];
    const KEY = 'ledger_dt';
    const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const yen = (n) => '¥' + Math.round(n).toLocaleString('en-US');
    const blank = () => ({ id: 'd' + Date.now().toString(36), ts: Date.now(), name: '', date: '', payer: '', notes: {}, receipt: null, assign: {}, basis: 'before', coupon: true, active: '' });
    // 待處理資料：每份收據一個草稿（名稱、日期、付款人各自獨立），每次輸入都會暫存，按 ✕ 不會刪除
    let DB = { drafts: {} };
    try {
        const v = typeof cacheLoad === 'function' && cacheLoad(KEY);
        if (v && v.drafts && typeof v.drafts === 'object') DB = { drafts: v.drafts };
        else if (v && v.receipt && Array.isArray(v.receipt.items)) { const d = { ...blank(), ...v, name: v.receipt.name || '', date: v.receipt.date || '' }; DB.drafts[d.id] = d; }
    } catch (e) { }
    const meaningful = (d) => !!(d.receipt || d.name || d.date || d.payer);
    const flush = () => { try { if (typeof cacheSave === 'function') cacheSave(KEY, DB); } catch (e) { } };
    const keep = (d) => { if (meaningful(d)) { d.ts = Date.now(); DB.drafts[d.id] = d; } else delete DB.drafts[d.id]; flush(); };
    function list() {
        return Object.values(DB.drafts).sort((a, b) => b.ts - a.ts).map((d) => {
            const its = d.receipt ? d.receipt.items : [];
            return { id: d.id, title: d.name || (d.receipt && d.receipt.name) || '未命名收據', date: d.date || '', qty: its.reduce((a, i) => a + i.qty, 0),
                got: Object.values(d.assign || {}).reduce((a, r) => a + Object.values(r).reduce((x, y) => x + y, 0), 0), has: !!d.receipt };
        });
    }
    function remove(id) { delete DB.drafts[id]; flush(); }
    let cur = null, curOpts = null;

    // ---------- 加速 AI 流程（複製並開啟 AI、貼上匯入） ----------
    const AI_URL = { 'ai-claude': 'https://claude.ai/new?q=', 'ai-gpt': 'https://chatgpt.com/?q=', 'ai-gemini': 'https://gemini.google.com/app' };
    function copyText(t) {
        try { if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(t).then(() => true, () => false); } catch (e) { }
        try { const ta = document.createElement('textarea'); ta.value = t; ta.style.cssText = 'position:fixed;opacity:0'; document.body.appendChild(ta); ta.select(); const ok = document.execCommand('copy'); ta.remove(); return Promise.resolve(!!ok); } catch (e) { return Promise.resolve(false); }
    }
    function aiToolsHtml(fileId) {
        return `<p class="ld-sec">① 把提示詞送去 AI</p>
            <div class="ld-btns"><button type="button" class="lg-btn sm" data-a="ai-claude">開啟 Claude</button><button type="button" class="lg-btn sm" data-a="ai-gpt">開啟 ChatGPT</button><button type="button" class="lg-btn sm" data-a="ai-gemini">開啟 Gemini</button><button type="button" class="lg-btn sm ghost" data-a="ai-copy">只複製提示詞</button></div>
            <p class="lg-muted">按下按鈕會先複製提示詞，再開啟該 AI。Claude、ChatGPT 會自動帶入提示詞；Gemini 需要在輸入框長按貼上。收據照片要在 AI 裡手動選擇上傳，再送出。</p>
            <p class="ld-sec">② 把 AI 的回覆帶回來</p>
            <div class="ld-btns"><button type="button" class="lg-btn sm" data-a="ai-paste">📋 貼上並匯入</button><label class="lg-btn sm ghost" for="${fileId}">選擇檔案匯入</label><input type="file" id="${fileId}" hidden accept=".json,.txt,application/json,text/plain"></div>
            <p class="lg-muted">AI 回覆後，複製它給的 JSON，回到這裡按「貼上並匯入」；也可以貼到下方文字框。</p>`;
    }
    // o: {prompt: () => 提示詞, onText(text, 來源), say(文字, 是否錯誤)}
    function wireAi(root, o) {
        root.addEventListener('click', (ev) => {
            const b = ev.target.closest && ev.target.closest('[data-a^="ai-"]');
            if (!b) return;
            const a = b.dataset.a, t = o.prompt();
            if (AI_URL[a]) {
                copyText(t);
                window.open(a === 'ai-gemini' ? AI_URL[a] : AI_URL[a] + encodeURIComponent(t), '_blank');
                o.say(a === 'ai-gemini' ? '已複製提示詞並開啟 Gemini。請在輸入框長按貼上提示詞，手動上傳收據照片後送出；AI 回覆後複製 JSON，再回來按「貼上並匯入」。'
                    : '已複製提示詞並開啟 AI；若沒有自動帶入，請在輸入框長按貼上。請手動上傳收據照片後送出；AI 回覆後複製 JSON，再回來按「貼上並匯入」。');
            } else if (a === 'ai-copy') {
                copyText(t).then((ok) => (ok ? o.say('已複製提示詞。貼給 AI 並手動上傳收據照片，再把回傳的 JSON 帶回來。') : o.say('無法自動複製，請改用「開啟 Claude／ChatGPT」。', true)));
            } else if (a === 'ai-paste') {
                if (!navigator.clipboard || !navigator.clipboard.readText) return o.say('此瀏覽器不能自動讀取剪貼簿，請把 JSON 貼到下方文字框再按匯入。', true);
                navigator.clipboard.readText().then((x) => o.onText(x, '剪貼簿'), () => o.say('沒有取得剪貼簿權限，請把 JSON 貼到下方文字框再按匯入。', true));
            }
        });
    }

    // ---------- 個人記帳：逐品項匯入（可多張收據，每張各自的支付方式） ----------
    // 待處理草稿：只存在本機（與團體的明細分帳分開存），每次變動都會暫存，按 ✕ 不會刪除，寫入個人記帳成功才清掉
    const PKEY = 'ledger_dp';
    const rk = () => 'k' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
    // 舊版草稿（單張收據）轉成收據清單
    function migrateP(d) {
        if (d && d.receipt && !Array.isArray(d.receipts)) {
            d.receipts = [{ key: rk(), receipt: d.receipt, name: d.name || '', date: d.date || '', pay: d.pay || '', basis: d.basis || 'before', coupon: d.coupon !== false, cat: d.cat || {}, flag: d.flag || {}, off: d.off || {} }];
        }
        if (d) { delete d.receipt; delete d.name; delete d.date; delete d.pay; delete d.basis; delete d.coupon; delete d.cat; delete d.flag; delete d.off; if (!Array.isArray(d.receipts)) d.receipts = []; }
        return d;
    }
    let PDB = { drafts: {} };
    try { const v = typeof cacheLoad === 'function' && cacheLoad(PKEY); if (v && v.drafts && typeof v.drafts === 'object') { PDB = { drafts: v.drafts }; Object.values(PDB.drafts).forEach(migrateP); } } catch (e) { }
    const flushP = () => { try { if (typeof cacheSave === 'function') cacheSave(PKEY, PDB); } catch (e) { } };
    function listPersonal() {
        return Object.values(PDB.drafts).filter((d) => d && d.receipts && d.receipts.length).sort((a, b) => b.ts - a.ts).map((d) => {
            const f = d.receipts[0], n = d.receipts.length;
            return { id: d.id, title: (f.name || f.receipt.name || '未命名收據') + (n > 1 ? `　等 ${n} 張` : ''), date: f.date || '', count: d.receipts.reduce((a, x) => a + x.receipt.items.length, 0) };
        });
    }
    function removePersonal(id) { delete PDB.drafts[id]; flushP(); }
    let curPOpts = null;
    function closePersonal() {
        const el = typeof document !== 'undefined' && document.getElementById('ldp-root');
        if (!el) return;
        el.remove(); document.body.style.overflow = '';
        const o = curPOpts; curPOpts = null;
        if (o && o.onClose) o.onClose();
    }
    function openPersonal(opts) {
        closePersonal();
        const cats = opts.cats || [], pays = opts.pays || [], dflt = cats.includes('其他') ? '其他' : cats[0];
        curPOpts = opts;
        const fresh = () => ({ id: 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), ts: Date.now(), receipts: [], target: 'add' });
        const st = Object.assign(fresh(), migrateP((opts.id && PDB.drafts[opts.id]) || {}));
        st.receipts.forEach((x) => x.receipt.items.forEach((it) => { if (!cats.includes(x.cat[it.id])) x.cat[it.id] = dflt; }));
        const keepP = () => { if (st.receipts.length) { st.ts = Date.now(); PDB.drafts[st.id] = { ...st }; flushP(); } };
        const el = document.createElement('div');
        el.id = 'ldp-root'; el.className = 'ld';
        el.innerHTML = `<div class="ld-head"><b>🧾 逐品項匯入個人記帳</b><button type="button" data-a="p-close" aria-label="關閉">✕</button></div>
            <div class="ld-scroll">
                <details class="ld-card" id="ldp-imp" open><summary>匯入收據（AI 整理的 JSON，可一次多張）</summary>
                    <p class="lg-muted lg-mt">每個品項會各記一筆個人支出（日圓），並由 AI 先分好類，匯入後可逐項修改。可一次匯入多張收據，每張各自選支付方式。</p>
                    <div id="ldp-target"></div>
                    ${aiToolsHtml('ldp-file')}
                    <textarea id="ldp-paste" class="lg-in lg-mt" rows="4" placeholder="把 AI 回傳的 JSON 貼在這裡"></textarea>
                    <button type="button" class="lg-btn sm lg-mt" data-a="p-import">匯入貼上的內容</button>
                </details>
                <p class="ld-msg" id="ldp-msg" role="status"></p>
                <div id="ldp-main"></div>
            </div>
            <div class="ld-foot"><button type="button" class="lg-btn wide" id="ldp-apply" data-a="p-apply" disabled>寫入個人記帳</button></div>`;
        document.body.appendChild(el);
        document.body.style.overflow = 'hidden';
        const $ = (q) => el.querySelector(q);
        const say = (t, bad) => { const m = $('#ldp-msg'); m.textContent = t; m.className = 'ld-msg' + (bad ? ' bad' : ''); };
        const byKey = (k) => st.receipts.find((x) => x.key === k);
        const amts = (x) => itemAmounts(x.receipt, x.coupon, x.basis);
        const picked = (x) => { const am = amts(x); return x.receipt.items.map((it, i) => ({ it, amount: am[i] })).filter((y) => !x.off[y.it.id] && y.amount > 0); };
        const okDate = (x) => /^\d{4}-\d{2}-\d{2}$/.test(x.date);
        function renderTarget() {
            $('#ldp-target').innerHTML = st.receipts.length ? `<p class="ld-sec">這次匯入的收據要放在</p><div class="lg-seg sm">${[['add', '加入目前這份草稿'], ['new', '另存為新草稿']].map(([k, l]) => `<button type="button" data-a="p-target" data-v="${k}" class="${st.target === k ? 'on' : ''}">${l}</button>`).join('')}</div>` : '';
        }
        function renderFoot() {
            const b = $('#ldp-apply'), act = st.receipts.map((x) => ({ x, ps: picked(x) })).filter((y) => y.ps.length);
            if (!st.receipts.length) { b.disabled = true; b.textContent = '寫入個人記帳'; return; }
            const n = act.reduce((a, y) => a + y.ps.length, 0), sum = act.reduce((a, y) => a + y.ps.reduce((u, v) => u + v.amount, 0), 0);
            const noPay = act.some((y) => !y.x.pay), noDate = act.some((y) => !okDate(y.x));
            b.disabled = !act.length || noPay || noDate;
            b.textContent = !act.length ? '沒有可寫入的品項' : noPay ? '請先為每張收據選擇支付方式' : noDate ? '請為每張收據選擇日期' : `寫入個人記帳（${act.length} 張・${n} 筆・${yen(sum)}）`;
        }
        function recHtml(x, idx) {
            const r = x.receipt, am = amts(x), q = r.items.reduce((a, i) => a + i.qty, 0), warns = checkReceipt(r, x.coupon), k = esc(x.key);
            const cp = r.couponPercent > 0 ? `<label class="ld-chk"><input type="checkbox" data-a="p-coupon" data-k="${k}" ${x.coupon ? 'checked' : ''}> 套用收據上的 ${r.couponPercent}% 折扣</label>` : '';
            return `<div class="ld-card ldp-rec"><div class="ldp-rh"><p class="lg-h">${st.receipts.length > 1 ? `第 ${idx + 1} 張　` : ''}${esc(r.name)}<small>　${r.items.length} 項／${q} 件・價格為${r.taxMode === 'incl' ? '含稅' : '未稅'}${r.total ? '・收據合計 ' + yen(r.total) : ''}</small></p><button type="button" class="lg-btn sm ghost danger" data-a="p-rm" data-k="${k}">移除這張</button></div>
                <label class="lg-lbl">收據名稱（列表群組標題）</label><input class="lg-in" data-a="p-name" data-k="${k}" maxlength="50" value="${esc(x.name)}">
                <label class="lg-lbl">日期</label><input type="date" class="lg-in" data-a="p-date" data-k="${k}" value="${esc(x.date)}">
                <label class="lg-lbl">支付方式</label><div class="lg-seg sm">${pays.map(([pk, l]) => `<button type="button" data-a="p-pay" data-k="${k}" data-v="${esc(pk)}" class="${x.pay === pk ? 'on' : ''}">${esc(l)}</button>`).join('')}</div>
                <div class="lg-seg sm lg-mt">${[['before', '免稅前（含稅價）'], ['after', '免稅後（扣預計退稅）']].map(([bk, l]) => `<button type="button" data-a="p-basis" data-k="${k}" data-v="${bk}" class="${x.basis === bk ? 'on' : ''}">${l}</button>`).join('')}</div>
                ${cp}
                ${warns.map((w) => `<p class="ld-note warn">⚠️ ${esc(w)}</p>`).join('')}
                <p class="ld-sec">各品項分類（取消勾選＝不記這一項）</p>
                <div class="ld-items">${r.items.map((it, i) => `<div class="ld-item"><input type="checkbox" data-a="p-on" data-k="${k}" data-i="${it.id}" ${x.off[it.id] ? '' : 'checked'} aria-label="記入"><div class="ld-i"><b>${esc(it.zh && it.zh !== it.jp ? it.zh : it.jp)}</b><small class="ld-meta">${yen(it.unit)} × ${it.qty}</small>${x.flag[it.id] ? `<small class="ld-flag">AI 填「${esc(x.flag[it.id])}」不在分類清單，已先歸「${esc(dflt)}」</small>` : ''}</div><div class="ldp-r"><b>${yen(am[i])}</b><select class="lg-in ldp-cat" data-a="p-cat" data-k="${k}" data-i="${it.id}">${cats.map((c) => `<option value="${esc(c)}" ${x.cat[it.id] === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></div></div>`).join('')}</div></div>`;
        }
        function renderMain() {
            $('#ldp-main').innerHTML = st.receipts.length ? st.receipts.map(recHtml).join('') : '<div class="ld-card"><p class="lg-muted">還沒有收據。請先匯入。</p></div>';
            renderTarget(); renderFoot();
        }
        function doImport(text, from) {
            const p = parseReceipts(text);
            if (p.error) { say(`匯入失敗${from ? '（' + from + '）' : ''}：${p.error}`, true); return; }
            if (st.receipts.length && st.target === 'new') { keepP(); Object.assign(st, fresh()); }
            let nf = 0, nw = 0;
            p.receipts.forEach((r) => {
                const x = { key: rk(), receipt: r, name: r.name, date: r.date || opts.today || '', pay: (st.receipts[st.receipts.length - 1] || {}).pay || '', basis: 'before', coupon: true, cat: {}, flag: {}, off: {} };
                r.items.forEach((it) => { if (cats.includes(it.cat)) x.cat[it.id] = it.cat; else { x.cat[it.id] = dflt; if (it.cat) x.flag[it.id] = it.cat; } });
                nf += Object.keys(x.flag).length; nw += checkReceipt(r, true).length;
                st.receipts.push(x);
            });
            st.target = 'add';
            renderMain();
            say([`已匯入 ${p.receipts.length} 張收據：${p.receipts.map((r) => `「${r.name}」${r.items.length} 項`).join('、')}。`, p.errs.length ? `有 ${p.errs.length} 張無法匯入：${p.errs.join('；')}` : '', nf ? `${nf} 項的分類不在清單內，已先歸「${dflt}」，請確認。` : '', nw ? '⚠️ 有收據可能不完整，請看各張收據下方的警告（仍可繼續）。' : ''].filter(Boolean).join('\n'), p.errs.length > 0 || nf > 0 || nw > 0);
            keepP();
            $('#ldp-imp').open = false;
            $('#ldp-paste').value = '';
        }
        wireAi(el, { prompt: () => buildPrompt(cats, true), onText: doImport, say });
        el.addEventListener('click', (ev) => {
            const b = ev.target.closest && ev.target.closest('[data-a^="p-"]');
            if (!b) return;
            const a = b.dataset.a, x = b.dataset.k && byKey(b.dataset.k);
            if (a === 'p-close') closePersonal();
            else if (a === 'p-import') doImport($('#ldp-paste').value);
            else if (a === 'p-target') { st.target = b.dataset.v; renderTarget(); }
            else if (a === 'p-pay' && x) { x.pay = b.dataset.v; keepP(); renderMain(); }
            else if (a === 'p-basis' && x) { x.basis = b.dataset.v; keepP(); renderMain(); }
            else if (a === 'p-rm' && x) {
                if (!confirm(`移除「${x.name || x.receipt.name}」這張收據？`)) return;
                st.receipts = st.receipts.filter((y) => y !== x);
                if (st.receipts.length) keepP(); else { removePersonal(st.id); }
                renderMain();
            }
            else if (a === 'p-apply') {
                if (b.disabled) return;
                const receipts = st.receipts.map((y) => ({ rid: 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), name: y.name.trim() || y.receipt.name, date: y.date, pay: y.pay,
                    rows: picked(y).map((z) => ({ title: (z.it.zh && z.it.zh !== z.it.jp ? z.it.zh : z.it.jp) + (z.it.qty > 1 ? ` ×${z.it.qty}` : ''), jp: z.it.jp, amount: z.amount, cat: y.cat[z.it.id] || dflt })) })).filter((y) => y.rows.length);
                b.disabled = true;
                Promise.resolve(opts.onApply({ receipts })).then((ok) => { if (ok !== false) { removePersonal(st.id); closePersonal(); } else renderFoot(); }, () => renderFoot());
            }
        });
        el.addEventListener('change', (ev) => {
            const t = ev.target, d = t.dataset || {}, x = d.k && byKey(d.k);
            if (t.id === 'ldp-file') {
                const f = t.files && t.files[0]; if (!f) return;
                const rd = new FileReader();
                rd.onload = () => doImport(String(rd.result), f.name);
                rd.onerror = () => say('讀取檔案失敗', true);
                rd.readAsText(f); t.value = '';
            } else if (!x) return;
            else if (d.a === 'p-cat') { x.cat[+d.i] = t.value; keepP(); }
            else if (d.a === 'p-on') { if (t.checked) delete x.off[+d.i]; else x.off[+d.i] = true; keepP(); renderFoot(); }
            else if (d.a === 'p-coupon') { x.coupon = t.checked; keepP(); renderMain(); }
            else if (d.a === 'p-date') { x.date = t.value; keepP(); renderFoot(); }
        });
        el.addEventListener('input', (ev) => { const t = ev.target, x = t.dataset && t.dataset.a === 'p-name' && byKey(t.dataset.k); if (x) { x.name = t.value; keepP(); } });
        renderMain();
        if (st.receipts.length) $('#ldp-imp').open = false;
    }

    function open(opts) {
        close();
        const people = opts.people || [];
        if (!people.length) return;
        curOpts = opts;
        const st = cur = (opts.id && DB.drafts[opts.id]) || blank();
        if (!st.notes || typeof st.notes !== 'object') st.notes = {};
        if (!people.some((p) => p.id === st.active)) st.active = people[0].id;
        const el = document.createElement('div');
        el.id = 'ld-root'; el.className = 'ld';
        el.innerHTML = `<div class="ld-head"><b>🧾 明細分帳</b><button type="button" data-a="close" aria-label="關閉">✕</button></div>
            <div class="ld-scroll">
                <details class="ld-card" id="ld-imp"><summary>匯入收據（AI 整理的 JSON，或舊版匯出檔）</summary>
                    <p class="lg-muted lg-mt">新收據：用下方按鈕把提示詞帶去 AI、上傳收據照片，再把回傳的 JSON 貼回來。可一次匯入多張收據：一張收據一份草稿，這份還沒有收據時第一張放進來，其餘（或這份已有收據時）會另存為新的待處理草稿，不會蓋掉現有內容。舊版匯出檔（含朋友與分配）會依名字對應到團員。</p>
                    ${aiToolsHtml('ld-file')}
                    <textarea id="ld-paste" class="lg-in lg-mt" rows="4" placeholder="把 AI 回傳的 JSON 貼在這裡（含 \`\`\`json 也沒關係）"></textarea>
                    <button type="button" class="lg-btn sm lg-mt" data-a="import">匯入貼上的內容</button>
                </details>
                <div class="ld-card">
                    <p class="lg-h">這筆記帳資料<small>　獨立暫存，按 ✕ 不會刪除，可從記帳頁「待處理」繼續</small></p>
                    <label class="lg-lbl" for="ld-name">名稱</label><input id="ld-name" class="lg-in" maxlength="50" placeholder="例：唐吉訶德 米子店">
                    <label class="lg-lbl" for="ld-date">日期</label><input id="ld-date" type="date" class="lg-in">
                    <label class="lg-lbl" for="ld-payer">付款人</label><select id="ld-payer" class="lg-in"><option value="">請選擇付款人</option>${people.map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('')}</select>
                </div>
                <p class="ld-msg" id="ld-msg" role="status"></p>
                <div class="ld-card" id="ld-main"></div>
                <div class="ld-card" id="ld-res"></div>
            </div>
            <div class="ld-foot"><button type="button" class="lg-btn wide" id="ld-apply" data-a="apply">套用到記帳</button></div>`;
        document.body.appendChild(el);
        document.body.style.overflow = 'hidden';
        const $ = (s) => el.querySelector(s);
        $('#ld-name').value = st.name; $('#ld-date').value = st.date; $('#ld-payer').value = people.some((p) => p.id === st.payer) ? st.payer : '';
        const items = () => (st.receipt ? st.receipt.items : []);
        const asg = (iid, pid) => ((st.assign[iid] || {})[pid]) || 0;
        const tot = (iid) => Object.values(st.assign[iid] || {}).reduce((a, b) => a + b, 0);
        const cnt = (pid) => items().reduce((a, it) => a + asg(it.id, pid), 0);
        const linesFor = (pid) => items().map((item) => ({ item, n: asg(item.id, pid) })).filter((l) => l.n > 0);
        const cfg = () => { const r = st.receipt; return { basis: st.basis, taxMode: r.taxMode, disc: st.coupon && r.couponPercent > 0 ? 1 - r.couponPercent / 100 : 1 }; };
        const edited = (it) => { const m = []; if (it.rate0 != null && it.rate !== it.rate0) m.push(`稅率原 ${it.rate0}%`); if (it.star0 != null && it.star !== it.star0) m.push(`退稅原${it.star0 ? '為 ★' : '為不退稅'}`); return m.length ? `<span class="ld-edt">✎ 已手動改（${m.join('、')}）</span>` : ''; };
        const shut = {};
        let itemsShut = false;
        // 每人結果；品項全部分完、收據有合計、折扣設定一致、差距在 5 円內時，把每人金額對齊收據合計
        const rows = () => {
            const S = cfg(), r = st.receipt, out = [];
            people.forEach((p) => { const lines = linesFor(p.id); if (lines.length) { const c = calcPerson(lines, S); out.push({ p, lines, c, adj: 0, amount: c.amount }); } });
            out.aligned = false;
            if (out.length && r.total > 0 && items().every((it) => tot(it.id) === it.qty) && (st.coupon || !(r.couponPercent > 0))
                && Math.abs(Math.round(out.reduce((a, x) => a + x.c.raw, 0)) - r.total) <= 5) {
                const al = alignTotals(out.map((x) => x.c.raw), r.total);
                out.forEach((x, i) => { x.adj = al[i] - x.c.gross; x.amount = x.c.amount + x.adj; });
                out.aligned = true;
            }
            return out;
        };
        const color = (pid) => COLORS[Math.max(0, people.findIndex((p) => p.id === pid)) % COLORS.length];
        function setQty(iid, pid, n) {
            const it = items().find((x) => x.id === iid); if (!it) return;
            n = Math.max(0, Math.min(n, it.qty - (tot(iid) - asg(iid, pid))));
            const row = st.assign[iid] = st.assign[iid] || {};
            if (n) row[pid] = n; else delete row[pid];
        }
        function say(t, bad) { const m = $('#ld-msg'); m.textContent = t; m.className = 'ld-msg' + (bad ? ' bad' : ''); }

        function renderMain() {
            const r = st.receipt, box = $('#ld-main');
            if (!r) { box.innerHTML = '<p class="lg-muted">還沒有收據。請先展開上方「匯入收據」。</p>'; return; }
            const cp = r.couponPercent > 0 ? `<label class="ld-chk"><input type="checkbox" data-a="coupon" ${st.coupon ? 'checked' : ''}> 套用收據上的 ${r.couponPercent}% 折扣</label>` : '';
            const q = items().reduce((a, i) => a + i.qty, 0);
            box.innerHTML = `<p class="lg-h">${esc(r.name)}<small>　${items().length} 項／${q} 件・價格為${r.taxMode === 'incl' ? '含稅' : '未稅'}${r.total ? '・收據合計 ' + yen(r.total) : ''}</small></p>
                <div class="lg-seg sm">${[['before', '免稅前（含稅價）'], ['after', '免稅後（扣預計退稅）']].map(([k, l]) => `<button type="button" data-a="basis" data-v="${k}" class="${st.basis === k ? 'on' : ''}">${l}</button>`).join('')}</div>
                <p class="lg-muted">${st.basis === 'before' ? '依刷卡當下的價格記帳，預計退稅會一併記下，旅程結束後可在支出明細用「退稅分配」還給大家。' : '直接扣掉預計退稅後記帳，之後不需要再分配退稅。'}</p>
                ${cp}
                <p class="lg-muted">品項右邊的「★ 退稅／不退稅」和「8%／10%」可以點一下切換，用來修正 AI 看錯的地方。</p>
                <p class="ld-sec">分配給誰</p>
                <div class="lg-chips">${people.map((p) => `<button type="button" data-a="pick" data-id="${esc(p.id)}" class="lg-chip ${p.id === st.active ? 'on' : ''}" style="--c:${color(p.id)}">${esc(p.name)} ${cnt(p.id)}</button>`).join('')}</div>
                <div class="ld-btns"><button type="button" class="lg-btn sm ghost" data-a="takeall">拿走剩餘</button><button type="button" class="lg-btn sm ghost" data-a="clearp">清除此人</button><button type="button" class="lg-btn sm ghost danger" data-a="resetall">清除全部</button><button type="button" class="lg-btn sm ghost" data-a="items">${itemsShut ? '展開品項' : '全部收合'}</button></div>
                <div class="ld-items">${itemsShut ? `<p class="lg-muted">品項已收合（共 ${items().length} 項）。</p>` : items().map((it) => {
                    const mine = asg(it.id, st.active), rem = it.qty - tot(it.id);
                    const badges = people.map((p) => (asg(it.id, p.id) ? `<span class="ld-bdg" style="--c:${color(p.id)}">${esc(p.name)}×${asg(it.id, p.id)}</span>` : '')).join('');
                    return `<div class="ld-item ${mine ? 'sel' : ''}"><div class="ld-i"><b>${esc(it.jp)}</b>${it.zh && it.zh !== it.jp ? `<small>${esc(it.zh)}</small>` : ''}
                        <small class="ld-meta">${yen(it.unit)} × ${it.qty}<button type="button" class="ld-tg ${it.star ? 'on' : ''}" data-a="star" data-i="${it.id}">${it.star ? '★ 退稅' : '不退稅'}</button><button type="button" class="ld-tg" data-a="rate" data-i="${it.id}">${it.rate}%</button>${edited(it)}${it.qty > 1 ? `剩 ${rem}` : ''}</small>${badges ? `<span class="ld-bdgs">${badges}</span>` : ''}</div>
                        <div class="ld-step"><button type="button" data-a="dec" data-i="${it.id}" ${mine ? '' : 'disabled'} aria-label="減少">−</button><span>${mine}</span><button type="button" data-a="inc" data-i="${it.id}" ${rem > 0 ? '' : 'disabled'} aria-label="增加">＋</button></div></div>`;
                }).join('')}</div>`;
        }
        function renderRes() {
            const box = $('#ld-res'), btn = $('#ld-apply');
            if (!st.receipt) { box.innerHTML = ''; btn.disabled = true; btn.textContent = '套用到記帳'; return; }
            const S = cfg(), r = st.receipt;
            const RW = rows(), anyOpen = RW.some((x) => !shut[x.p.id]);
            let html = `<div class="ld-rhead"><p class="lg-h">每人結果</p>${RW.length ? `<button type="button" class="lg-btn sm ghost" data-a="rall">${anyOpen ? '全部收合' : '全部展開'}</button>` : ''}</div>`, sum = 0, any = false;
            RW.forEach(({ p, lines, c, adj, amount }) => {
                any = true; sum += amount;
                const open = !shut[p.id];
                html += `<div class="ld-rp"><button type="button" class="ld-rh" data-a="rexp" data-id="${esc(p.id)}"><span style="color:${color(p.id)};font-weight:800">${esc(p.name)}<i>${open ? '▲' : '▼'}</i><small>${lines.reduce((a, l) => a + l.n, 0)} 件${S.basis === 'before' && c.refund > 0 ? `・預計退稅 ${yen(c.refund)}` : ''}</small></span><b>${yen(amount)}</b></button>` + (!open && st.notes[p.id] ? `<p class="ld-pnote">📝 ${esc(st.notes[p.id])}</p>` : '') +
                    (open ? `<ul class="ld-rl">${lines.map((l) => `<li><span>${esc(l.item.zh || l.item.jp)} × ${l.n}${l.item.star ? '' : '（不退稅）'}</span><span>${yen(l.item.unit * l.n * S.disc)}</span></li>`).join('')}</ul>
                        <div class="ld-rb"><div><span>品項小計（${S.disc < 1 ? '折後、' : ''}未稅）</span><span>${yen(c.base)}</span></div><div><span>消費稅</span><span>${yen(c.tax)}</span></div>
                        ${S.basis === 'after' ? `<div class="neg"><span>預計退稅</span><span>−${yen(c.refund)}</span></div>` : ''}${adj ? `<div class="note"><span>進位調整（對齊收據合計）</span><span>${adj > 0 ? '+' : '−'}${yen(Math.abs(adj))}</span></div>` : ''}<div><b>應付（${S.basis === 'after' ? '免稅後' : '免稅前'}）</b><b>${yen(amount)}</b></div>
                        ${S.basis === 'before' && c.refund > 0 ? `<div class="note"><span>出境後預計可退（不含於上方）</span><span>${yen(c.refund)}</span></div>` : ''}</div>
                        <input class="lg-in ld-pn" data-pn="${esc(p.id)}" maxlength="60" placeholder="${esc(p.name)} 的備註（選填）" value="${esc(st.notes[p.id] || '')}">` : '') + '</div>';
            });
            if (!any) html += '<p class="lg-muted">尚未分配任何品項。</p>';
            checkReceipt(r, st.coupon).forEach((x) => { html += `<p class="ld-note warn">⚠️ ${esc(x)}</p>`; });
            const left = items().map((item) => ({ item, n: item.qty - tot(item.id) })).filter((l) => l.n > 0);
            if (left.length) {
                const c = calcPerson(left, S);
                html += `<p class="ld-note warn">還有 ${left.reduce((a, l) => a + l.n, 0)} 件（${yen(c.amount)}）沒人認領，不會計入這筆記帳。</p>`;
            } else if (RW.aligned) {
                html += `<p class="ld-note">已對齊收據合計 ${yen(r.total)}（每人金額最多調整 ¥1）。</p>`;
            } else if (any && r.total > 0 && (st.coupon || !(r.couponPercent > 0))) {
                const full = calcPerson(items().map((item) => ({ item, n: item.qty })), { ...S, basis: 'before' }), diff = full.gross - r.total;
                html += `<p class="ld-note ${Math.abs(diff) > 5 ? 'warn' : ''}">對帳：品項加總 ${yen(full.gross)}，收據 ${yen(r.total)}（差 ${diff} 円${Math.abs(diff) <= 5 ? '，逐筆進位造成' : '，請確認品項、數量、稅率與稅別'}）。</p>`;
            }
            box.innerHTML = html;
            btn.disabled = !any;
            btn.textContent = any ? `套用到記帳（共 ${yen(sum)}）` : '套用到記帳';
        }
        const renderAll = () => { renderMain(); renderRes(); keep(st); };

        // 把解析結果填進草稿（不覆蓋已有的名稱與日期）
        function fillDraft(d, p) {
            d.receipt = p.receipt; d.assign = p.assign || {};
            if (p.assign) { d.basis = p.basis; d.coupon = p.coupon; } else d.coupon = true;
            if (!d.name) d.name = p.receipt.name;
            if (!d.date && p.receipt.date) d.date = p.receipt.date;
        }
        // 一張收據一份草稿：目前這份還沒有收據時，第一張放進來；其餘（或這份已有收據時的全部）另存為新的待處理草稿，不會蓋掉現有內容
        function doImport(text, from) {
            const j = extractJSON(text).value;
            let list, errs = [];
            if (j && Array.isArray(j.receipts)) {
                const m = parseReceipts(text);
                if (m.error) { say(`匯入失敗${from ? '（' + from + '）' : ''}：${m.error}`, true); return; }
                list = m.receipts.map((receipt) => ({ receipt, assign: null, matched: [], missing: [] })); errs = m.errs;
            } else {
                const p = parseImport(text, people);
                if (p.error) { say(`匯入失敗${from ? '（' + from + '）' : ''}：${p.error}`, true); return; }
                list = [p];
            }
            const fresh = [], lines = [];
            let warnAny = false;
            list.forEach((p) => {
                const intoCur = !st.receipt;
                const d = intoCur ? st : blank();
                if (!intoCur) d.id = 'd' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
                fillDraft(d, p);
                if (!intoCur) { keep(d); fresh.push(d); }
                const warns = checkReceipt(p.receipt, d.coupon);
                if (warns.length) warnAny = true;
                lines.push(`${intoCur ? '放進目前這份' : '另存為新的待處理草稿'}：「${p.receipt.name}」，共 ${p.receipt.items.length} 項。`
                    + (p.assign ? (p.matched.length ? `\n  已依名字帶入分配：${p.matched.join('、')}` : '\n  檔案裡的朋友名字都和團員名單對不上，分配沒有帶入。') : '')
                    + (p.missing.length ? `\n  找不到對應團員，這些人的分配沒帶入：${p.missing.join('、')}（請先在團員名單用相同名字新增，再重新匯入）` : '')
                    + (warns.length ? '\n  ⚠️ 收據可能不完整：' + warns.join('；') : ''));
            });
            $('#ld-name').value = st.name; $('#ld-date').value = st.date;
            renderAll();
            const miss = list.some((p) => p.missing.length);
            say([...lines, errs.length ? `有 ${errs.length} 張無法匯入：${errs.join('；')}` : '',
                fresh.length ? `新草稿已存好，不會動到目前這份。關閉後到記帳頁「待處理」按「繼續」處理（共 ${fresh.length} 份）。` : '',
                warnAny ? '請確認照片是否完整、有無混入別張收據；仍可繼續。' : ''].filter(Boolean).join('\n'), miss || warnAny || errs.length > 0);
            $('#ld-imp').open = miss || warnAny || errs.length > 0 || fresh.length > 0;
            $('#ld-paste').value = '';
        }
        function copy(t) {
            try { if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(t).then(() => true, () => false); } catch (e) { }
            try { const ta = document.createElement('textarea'); ta.value = t; ta.style.cssText = 'position:fixed;opacity:0'; document.body.appendChild(ta); ta.select(); const ok = document.execCommand('copy'); ta.remove(); return Promise.resolve(!!ok); } catch (e) { return Promise.resolve(false); }
        }
        el.addEventListener('click', (ev) => {
            const b = ev.target.closest('[data-a]'); if (!b || b.disabled || b.tagName === 'INPUT') return;
            const a = b.dataset.a, iid = +b.dataset.i;
            if (a === 'close') close();
            else if (a === 'basis') { st.basis = b.dataset.v; renderAll(); }
            else if (a === 'star' || a === 'rate') {
                const it = items().find((x) => x.id === iid);
                if (it) { if (a === 'star') it.star = !it.star; else it.rate = it.rate === 8 ? 10 : 8; renderAll(); }
            }
            else if (a === 'items') { itemsShut = !itemsShut; renderMain(); }
            else if (a === 'rall') { const RW = rows(), anyOpen = RW.some((x) => !shut[x.p.id]); RW.forEach((x) => { shut[x.p.id] = anyOpen; }); renderRes(); }
            else if (a === 'rexp') { shut[b.dataset.id] = !shut[b.dataset.id]; renderRes(); }
            else if (a === 'pick') { st.active = b.dataset.id; renderAll(); }
            else if (a === 'inc' || a === 'dec') { setQty(iid, st.active, asg(iid, st.active) + (a === 'inc' ? 1 : -1)); renderAll(); }
            else if (a === 'takeall') { items().forEach((it) => { const rem = it.qty - tot(it.id); if (rem > 0) setQty(it.id, st.active, asg(it.id, st.active) + rem); }); renderAll(); }
            else if (a === 'clearp') { items().forEach((it) => setQty(it.id, st.active, 0)); renderAll(); }
            else if (a === 'resetall') { if (confirm('清除所有人的品項分配？')) { st.assign = {}; renderAll(); } }
            else if (a === 'import') doImport($('#ld-paste').value);
            else if (a === 'apply') {
                const S = cfg(), parts = {}, rf = {}, members = [];
                const RW = rows();
                RW.forEach(({ p, c, amount }) => {
                    if (amount <= 0) return;
                    parts[p.id] = String(amount); members.push(p.id);
                    if (S.basis === 'before' && c.refund > 0) rf[p.id] = c.refund;
                });
                if (!members.length) return;
                const out = { id: st.id, name: st.name.trim() || st.receipt.name, date: st.date || st.receipt.date, payer: people.some((p) => p.id === st.payer) ? st.payer : '', members, parts, rf, note: buildNote(RW.filter((x) => x.amount > 0), cfg(), st.receipt, st.notes) };
                const o = curOpts;
                close();
                o.onApply(out);
            }
        });
        el.addEventListener('input', (ev) => {
            const t = ev.target;
            if (t.dataset && t.dataset.pn) { if (t.value.trim()) st.notes[t.dataset.pn] = t.value; else delete st.notes[t.dataset.pn]; keep(st); }
            else if (t.id === 'ld-name') { st.name = t.value; keep(st); }
            else if (t.id === 'ld-date') { st.date = t.value; keep(st); }
        });
        el.addEventListener('change', (ev) => {
            const t = ev.target;
            if (t.id === 'ld-payer') { st.payer = t.value; keep(st); }
            else if (t.id === 'ld-date') { st.date = t.value; keep(st); }
            else if (t.dataset && t.dataset.a === 'coupon') { st.coupon = t.checked; renderAll(); }
            else if (t.id === 'ld-file') {
                const f = t.files && t.files[0]; if (!f) return;
                const rd = new FileReader();
                rd.onload = () => doImport(String(rd.result), f.name);
                rd.onerror = () => say('讀取檔案失敗', true);
                rd.readAsText(f); t.value = '';
            }
        });
        wireAi(el, { prompt: () => buildPrompt(opts.cats, true), onText: doImport, say });
        $('#ld-imp').open = !st.receipt;
        renderAll();
    }
    function close() {
        const el = typeof document !== 'undefined' && document.getElementById('ld-root');
        if (!el) return;
        el.remove(); document.body.style.overflow = '';
        if (cur) keep(cur);
        const o = curOpts; cur = curOpts = null;
        if (o && o.onClose) o.onClose();
    }
    return { open, close, openPersonal, closePersonal, listPersonal, removePersonal, itemAmounts, parseReceipts, list, remove, calcPerson, alignTotals, buildNote, parseReceipt, parseImport, buildPrompt, parseNum, checkReceipt };
});
