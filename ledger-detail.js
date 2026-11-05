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
        return { gross: Math.round(gross), refund: Math.round(refund), amount: Math.round(s.basis === 'after' ? gross - refund : gross) };
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
        const obj = j.value, raw = obj && (obj.receipt || (Array.isArray(obj.items) ? obj : null));
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
            items.push({ id: items.length + 1, jp: String(it.jp || it.zh || '品項 ' + (i + 1)), zh: String(it.zh || it.jp || ''), unit, qty, rate, star: toBool(it.star, true) });
        });
        if (errs.length) return { error: errs.slice(0, 4).join('；') + (errs.length > 4 ? `…（共 ${errs.length} 處）` : '') };
        const cp = parseNum(raw.couponPercent), total = parseNum(raw.receiptTotal !== undefined ? raw.receiptTotal : raw.total);
        const refund = parseNum(raw.receiptRefund !== undefined ? raw.receiptRefund : raw.refund);
        const ds = String(raw.date || '').replace(/\//g, '-');
        const date = /^\d{4}-\d{2}-\d{2}$/.test(ds) ? ds : '', store = String(raw.store || '');
        return {
            idMap,
            receipt: {
                name: (String(raw.name || '').trim() || [store, date].filter(Boolean).join(' ') || '未命名收據').slice(0, 50),
                store, date, taxMode: raw.taxMode === 'incl' || raw.taxMode === 'included' ? 'incl' : 'excl',
                couponPercent: cp >= 0 && cp <= 100 ? cp : 0, total: total > 0 ? total : null, refund: refund >= 0 ? refund : null, items
            }
        };
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
    function buildPrompt() {
        return [
            '你是收據資料整理助手。我會附上日本購物收據的照片（可能有多張，是同一張收據的不同段落）。請把所有品項整理成下面格式的 JSON。請只輸出一個 json 程式碼區塊，欄位名稱不要改。',
            '', 'JSON 格式：', '{', '  "receipt": {', '    "name": "店名 日期（例如：唐吉訶德米子店 2026-11-05）",', '    "store": "店名",', '    "date": "YYYY-MM-DD",',
            '    "taxMode": "excl",', '    "couponPercent": 0,', '    "receiptTotal": 0,', '    "receiptRefund": null,', '    "items": [',
            '      {"jp": "收據上的原文品名", "zh": "簡短中文品名（可推測）", "unit": 249, "qty": 1, "star": true, "rate": 8}', '    ]', '  }', '}', '',
            '欄位規則：',
            '1. items：每個品項一筆。收據寫「3コ×単227 ¥681」就是 unit=227、qty=3。同名但條碼不同的品項要分成兩筆。',
            '2. unit：收據上的單價數字，不要自己換算或加減稅。',
            '3. taxMode：品項價格是未稅（合計 ＝ 小計 ＋ 稅額）填 "excl"；價格已含稅（內稅／税込）填 "incl"。請用「小計、稅額、合計」是否相加成立來判斷。',
            '4. rate：消費稅率，只填 8 或 10。標示「*」或軽減税率的食品飲料（酒類除外）是 8，其餘是 10。',
            '5. star：該品項是否為免稅對象。收據上有 ★ 標記的填 true，沒有的填 false。若收據完全沒有免稅標記，全部填 true，並在 JSON 外面告訴我。',
            '6. couponPercent：收據上的整單折扣百分比（例如「クーポン割引 5%」填 5），沒有填 0。若折扣是固定金額而不是百分比，填 0，並在 JSON 外面告訴我金額。',
            '7. receiptTotal：收據最終合計（含稅總額，日圓整數）。receiptRefund：收據上的免稅返金額／退稅額，沒有就填 null。',
            '8. 請自行核對：所有品項 unit × qty 加總要等於收據的折扣前小計，總件數要等於收據的點數。不一致時，請在 JSON 外面列出可能漏掉或看錯的品項。',
            '9. 看不清楚的品名請用最接近的文字，並在 JSON 外面標註。'
        ].join('\n');
    }

    // ---------- 介面（只在瀏覽器執行） ----------
    const COLORS = ['#d9381e', '#2b7de9', '#1f9d6b', '#a855f7', '#e8a317', '#0ea5b7'];
    const KEY = 'ledger_dt';
    const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const yen = (n) => '¥' + Math.round(n).toLocaleString('en-US');
    const blank = () => ({ id: 'd' + Date.now().toString(36), ts: Date.now(), name: '', date: '', payer: '', receipt: null, assign: {}, basis: 'before', coupon: true, active: '' });
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

    function open(opts) {
        close();
        const people = opts.people || [];
        if (!people.length) return;
        curOpts = opts;
        const st = cur = (opts.id && DB.drafts[opts.id]) || blank();
        if (!people.some((p) => p.id === st.active)) st.active = people[0].id;
        const el = document.createElement('div');
        el.id = 'ld-root'; el.className = 'ld';
        el.innerHTML = `<div class="ld-head"><b>🧾 明細分帳</b><button type="button" data-a="close" aria-label="關閉">✕</button></div>
            <div class="ld-scroll">
                <div class="ld-card">
                    <p class="lg-h">這筆記帳資料<small>　獨立暫存，按 ✕ 不會刪除，可從記帳頁「待處理」繼續</small></p>
                    <label class="lg-lbl" for="ld-name">名稱</label><input id="ld-name" class="lg-in" maxlength="50" placeholder="例：唐吉訶德 米子店">
                    <label class="lg-lbl" for="ld-date">日期</label><input id="ld-date" type="date" class="lg-in">
                    <label class="lg-lbl" for="ld-payer">付款人</label><select id="ld-payer" class="lg-in"><option value="">請選擇付款人</option>${people.map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('')}</select>
                </div>
                <details class="ld-card" id="ld-imp"><summary>匯入收據（AI 整理的 JSON，或舊版匯出檔）</summary>
                    <p class="lg-muted lg-mt">新收據：① 複製提示詞 ② 連同收據照片丟給 AI ③ 把回傳的 JSON 貼到下面。舊版匯出檔（含朋友與分配）會依名字對應到團員。匯入會清空目前的品項分配。</p>
                    <div class="ld-btns"><button type="button" class="lg-btn sm ghost" data-a="prompt">複製 AI 提示詞</button><label class="lg-btn sm ghost" for="ld-file">選擇檔案匯入</label><input type="file" id="ld-file" hidden accept=".json,.txt,application/json,text/plain"></div>
                    <textarea id="ld-paste" class="lg-in lg-mt" rows="4" placeholder="把 AI 回傳的 JSON 貼在這裡（含 \`\`\`json 也沒關係）"></textarea>
                    <button type="button" class="lg-btn sm lg-mt" data-a="import">匯入貼上的內容</button>
                </details>
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
                <p class="ld-sec">分配給誰</p>
                <div class="lg-chips">${people.map((p) => `<button type="button" data-a="pick" data-id="${esc(p.id)}" class="lg-chip ${p.id === st.active ? 'on' : ''}" style="--c:${color(p.id)}">${esc(p.name)} ${cnt(p.id)}</button>`).join('')}</div>
                <div class="ld-btns"><button type="button" class="lg-btn sm ghost" data-a="takeall">拿走剩餘</button><button type="button" class="lg-btn sm ghost" data-a="clearp">清除此人</button><button type="button" class="lg-btn sm ghost danger" data-a="resetall">清除全部</button></div>
                <div class="ld-items">${items().map((it) => {
                    const mine = asg(it.id, st.active), rem = it.qty - tot(it.id);
                    const badges = people.map((p) => (asg(it.id, p.id) ? `<span class="ld-bdg" style="--c:${color(p.id)}">${esc(p.name)}×${asg(it.id, p.id)}</span>` : '')).join('');
                    return `<div class="ld-item ${mine ? 'sel' : ''}"><div class="ld-i"><b>${esc(it.jp)}</b>${it.zh && it.zh !== it.jp ? `<small>${esc(it.zh)}</small>` : ''}
                        <small>${yen(it.unit)} × ${it.qty}　${it.star ? `★ ${it.rate}%` : `不退稅 ${it.rate}%`}${it.qty > 1 ? `　剩 ${rem}` : ''}</small>${badges ? `<span class="ld-bdgs">${badges}</span>` : ''}</div>
                        <div class="ld-step"><button type="button" data-a="dec" data-i="${it.id}" ${mine ? '' : 'disabled'} aria-label="減少">−</button><span>${mine}</span><button type="button" data-a="inc" data-i="${it.id}" ${rem > 0 ? '' : 'disabled'} aria-label="增加">＋</button></div></div>`;
                }).join('')}</div>`;
        }
        function renderRes() {
            const box = $('#ld-res'), btn = $('#ld-apply');
            if (!st.receipt) { box.innerHTML = ''; btn.disabled = true; btn.textContent = '套用到記帳'; return; }
            const S = cfg(), r = st.receipt;
            let html = '<p class="lg-h">每人結果</p>', sum = 0, any = false;
            people.forEach((p) => {
                const lines = linesFor(p.id); if (!lines.length) return;
                const c = calcPerson(lines, S); any = true; sum += c.amount;
                html += `<div class="lg-pv-row"><span style="color:${color(p.id)};font-weight:800">${esc(p.name)}<small>${lines.reduce((a, l) => a + l.n, 0)} 件${S.basis === 'before' && c.refund > 0 ? `・預計退稅 ${yen(c.refund)}` : ''}</small></span><span>${yen(c.amount)}</span></div>`;
            });
            if (!any) html += '<p class="lg-muted">尚未分配任何品項。</p>';
            const left = items().map((item) => ({ item, n: item.qty - tot(item.id) })).filter((l) => l.n > 0);
            if (left.length) {
                const c = calcPerson(left, S);
                html += `<p class="ld-note warn">還有 ${left.reduce((a, l) => a + l.n, 0)} 件（${yen(c.amount)}）沒人認領，不會計入這筆記帳。</p>`;
            } else if (any && r.total > 0 && (st.coupon || !(r.couponPercent > 0))) {
                const full = calcPerson(items().map((item) => ({ item, n: item.qty })), { ...S, basis: 'before' }), diff = full.gross - r.total;
                html += `<p class="ld-note ${Math.abs(diff) > 5 ? 'warn' : ''}">對帳：品項加總 ${yen(full.gross)}，收據 ${yen(r.total)}（差 ${diff} 円${Math.abs(diff) <= 5 ? '，逐筆進位造成' : '，請確認品項、數量、稅率與稅別'}）。</p>`;
            }
            box.innerHTML = html;
            btn.disabled = !any;
            btn.textContent = any ? `套用到記帳（共 ${yen(sum)}）` : '套用到記帳';
        }
        const renderAll = () => { renderMain(); renderRes(); keep(st); };

        function doImport(text, from) {
            const p = parseImport(text, people);
            if (p.error) { say(`匯入失敗${from ? '（' + from + '）' : ''}：${p.error}`, true); return; }
            if (Object.values(st.assign).some((r) => Object.keys(r).length) && !confirm('匯入新收據會清空目前的品項分配，確定嗎？')) return;
            st.receipt = p.receipt; st.assign = p.assign || {};
            if (p.assign) { st.basis = p.basis; st.coupon = p.coupon; } else st.coupon = true;
            if (!st.name) { st.name = p.receipt.name; $('#ld-name').value = st.name; }
            if (!st.date && p.receipt.date) { st.date = p.receipt.date; $('#ld-date').value = st.date; }
            renderAll();
            say([`已匯入「${p.receipt.name}」，共 ${p.receipt.items.length} 項。`,
                p.assign ? (p.matched.length ? `已依名字帶入分配：${p.matched.join('、')}` : '檔案裡的朋友名字都和團員名單對不上，分配沒有帶入。') : '',
                p.missing.length ? `找不到對應團員，這些人的分配沒帶入：${p.missing.join('、')}（請先在團員名單用相同名字新增，再重新匯入）` : ''].filter(Boolean).join('\n'), p.missing.length > 0);
            $('#ld-imp').open = !!p.missing.length;
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
            else if (a === 'pick') { st.active = b.dataset.id; renderAll(); }
            else if (a === 'inc' || a === 'dec') { setQty(iid, st.active, asg(iid, st.active) + (a === 'inc' ? 1 : -1)); renderAll(); }
            else if (a === 'takeall') { items().forEach((it) => { const rem = it.qty - tot(it.id); if (rem > 0) setQty(it.id, st.active, asg(it.id, st.active) + rem); }); renderAll(); }
            else if (a === 'clearp') { items().forEach((it) => setQty(it.id, st.active, 0)); renderAll(); }
            else if (a === 'resetall') { if (confirm('清除所有人的品項分配？')) { st.assign = {}; renderAll(); } }
            else if (a === 'prompt') copy(buildPrompt()).then((ok) => { if (ok) say('已複製 AI 提示詞。貼給 AI 並附上收據照片，再把回傳的 JSON 貼到下方匯入。'); else { $('#ld-paste').value = buildPrompt(); $('#ld-paste').select(); say('無法自動複製，提示詞已放進下方文字框，請全選複製。', true); } });
            else if (a === 'import') doImport($('#ld-paste').value);
            else if (a === 'apply') {
                const S = cfg(), parts = {}, rf = {}, members = [];
                people.forEach((p) => {
                    const lines = linesFor(p.id); if (!lines.length) return;
                    const c = calcPerson(lines, S);
                    if (c.amount > 0) { parts[p.id] = String(c.amount); members.push(p.id); if (S.basis === 'before' && c.refund > 0) rf[p.id] = c.refund; }
                });
                if (!members.length) return;
                const out = { id: st.id, name: st.name.trim() || st.receipt.name, date: st.date || st.receipt.date, payer: people.some((p) => p.id === st.payer) ? st.payer : '', members, parts, rf };
                const o = curOpts;
                close();
                o.onApply(out);
            }
        });
        el.addEventListener('input', (ev) => {
            const t = ev.target;
            if (t.id === 'ld-name') { st.name = t.value; keep(st); }
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
    return { open, close, list, remove, calcPerson, parseReceipt, parseImport, buildPrompt, parseNum };
});
