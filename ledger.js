(function () {
    'use strict';
    const C = window.LedgerCore;
    const VER = '11';
    const BASE = 'TWD', BASE_DEC = 0;
    const CATS = ['餐飲', '交通', '住宿', '門票', '購物', '其他'];
    const DEC_FIX = { TWD: 0, JPY: 0, KRW: 0 };
    const MODES = [['equal', '平均'], ['amount', '自訂金額'], ['ratio', '按比例']];
    const TABS = ['add', 'list', 'fx'];
    const up = (m) => Object.fromEntries(Object.entries(m || {}).map(([k, v]) => [k.toUpperCase(), v]));
    const FX_SRC = [
        ['fawazahmed0', 'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/twd.min.json', (j) => ({ date: j.date, map: up(j.twd) })],
        ['fawazahmed0', 'https://latest.currency-api.pages.dev/v1/currencies/twd.min.json', (j) => ({ date: j.date, map: up(j.twd) })],
        ['ExchangeRate-API', 'https://open.er-api.com/v6/latest/TWD', (j) => ({ date: j.time_last_update_unix ? new Date(j.time_last_update_unix * 1000).toISOString().slice(0, 10) : '', map: j.rates })]
    ];

    const S = {
        tab: 'add', sub: 'list', data: null, err: null, ref: null, cb: null, key: '', built: false,
        form: null, editId: null, editOrig: null, partsSig: null, rateSig: null, saving: false,
        rosterOpen: false, open: null, showVoid: false,
        stMode: 'all', stDay: '', stCur: 'TWD', fold: { bal: false, sug: false, tr: false },
        listShut: (cacheLoad('ledger_fold') || {}).days || {}, fs: null,
        filter: { sort: 'desc', cat: '', payer: '', members: [], cur: '', q: '' },
        fx: cacheLoad('fx'), fxBusy: false, fxErr: ''
    };

    const $ = (id) => document.getElementById(id);
    const esc = escapeHtml;
    const TS = () => firebase.database.ServerValue.TIMESTAMP;
    const signed = () => !!(memberUser || adminUser);
    const myUid = () => (memberUser ? memberUser.uid : '');
    const me = () => ({ uid: currentUserUid, name: currentUserName || '管理員' });
    const wdb = () => (memberUser ? db : adminDb);
    const D = () => S.data || {};
    const P = () => D().people || {};
    const E = () => D().expenses || {};
    const T = () => D().transfers || {};
    const R = () => D().rates || {};
    const order = () => Object.keys(P()).sort();
    const activeIds = () => order().filter((id) => P()[id].active !== false);
    const pname = (id) => (P()[id] && P()[id].name) || '（已刪除）';
    const curs = () => [BASE, ...Object.keys(R()).filter((c) => c !== BASE).sort()];
    const customCats = () => Object.entries(D().cats || {}).filter(([, c]) => c && c.name).sort(([a, x], [b, y]) => ((x.ts || 0) - (y.ts || 0)) || (a < b ? -1 : 1));
    const cats = () => [...new Set([...CATS, ...customCats().map(([, c]) => c.name)])];
    const catEntry = (name) => customCats().find(([, c]) => c.name === name);
    const catUses = (name) => Object.values(E()).filter((e) => e.cat === name).length;
    const canDelCat = (name) => !!catEntry(name) && signed() && !catUses(name);
    function decOf(cur) {
        if (cur === BASE) return BASE_DEC;
        const r = R()[cur];
        if (r && Number.isInteger(r.dec)) return r.dec;
        return cur in DEC_FIX ? DEC_FIX[cur] : 2;
    }
    const money = (v, cur) => `${C.formatAmount(v, decOf(cur))} ${cur}`;
    const today = () => { const t = getToday(); return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`; };
    const when = (ts) => { if (!ts) return ''; const d = new Date(ts); return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
    const srcLabel = (s) => (!s ? '' : s === 'manual' ? '手動' : String(s).startsWith('api:') ? `API（${String(s).slice(4)}）` : s);
    const selOpts = (list, val) => list.map(([v, l]) => `<option value="${esc(v)}" ${v === val ? 'selected' : ''}>${esc(l)}</option>`).join('');
    function usedPeople() {
        const u = new Set();
        Object.values(E()).forEach((e) => { u.add(e.payer); Object.keys(e.shares || {}).forEach((p) => u.add(p)); });
        Object.values(T()).forEach((t) => { u.add(t.from); u.add(t.to); });
        return u;
    }
    const usedCurs = () => new Set(Object.values(E()).map((e) => e.cur));
    const boundToMe = (pid) => !!memberUser && !!P()[pid] && P()[pid].uid === memberUser.uid;
    const canAct = (pid) => isEditor || boundToMe(pid);
    const actDb = (pid) => (boundToMe(pid) ? db : adminDb);
    function guard() { if (isOffline()) { offlineAlert(); return false; } return true; }
    function fail(e) { alert('操作失敗：' + (e && e.code === 'PERMISSION_DENIED' ? '沒有權限（請確認 Firebase Rules 已更新）' : (e && e.message) || e)); }
    let toastT = null;
    function toast(t) {
        const el = $('lg-toast');
        el.textContent = t;
        el.classList.add('show');
        clearTimeout(toastT);
        toastT = setTimeout(() => el.classList.remove('show'), 2200);
    }

    // ---------- 資料 ----------
    function bind() {
        const key = memberUser ? 'm' + memberUser.uid : (adminUser ? 'a' : '');
        if (key === S.key) return;
        if (S.ref) S.ref.off('value', S.cb);
        S.ref = null; S.key = key; S.err = null;
        S.data = key ? cacheLoad('ledger_' + key) : null;
        if (!key) return;
        S.ref = (memberUser ? db : adminDb).ref('ledger');
        S.cb = S.ref.on('value', (snap) => {
            S.data = snap.val() || {};
            S.err = null;
            cacheSave('ledger_' + key, S.data);
            render();
        }, (e) => {
            S.err = e && e.code === 'PERMISSION_DENIED' ? '沒有讀取權限，請確認 Firebase Rules 已更新。' : ((e && e.message) || '讀取失敗');
            S.key = '';
            render();
        });
    }

    // ---------- 外框 ----------
    function build() {
        if (S.built) return;
        S.built = true;
        $('ledger-root').innerHTML = `
        <div id="lg-gate" class="hidden"></div>
        <div id="lg-main" class="hidden">
            <div class="lg-seg" id="lg-tabs">${[['add', '記帳'], ['list', '明細'], ['fx', '匯率']].map(([k, l]) => `<button type="button" data-act="tab" data-v="${k}">${l}</button>`).join('')}</div>
            <div id="lg-panels">
                <section id="lg-p-add" class="lg-stack"><div class="card lg-card" id="lg-roster"></div><div class="card lg-card" id="lg-form"></div></section>
                <section id="lg-p-list" class="lg-stack hidden">
                    <div class="lg-seg sm" id="lg-subs"><button type="button" data-act="sub" data-v="list">支出紀錄</button><button type="button" data-act="sub" data-v="settle">自動結算</button></div>
                    <div id="lg-s-list" class="lg-stack"><div class="card lg-card" id="lg-filters"></div><div id="lg-items" class="lg-stack sm"></div></div>
                    <div id="lg-s-settle" class="lg-stack hidden"></div>
                </section>
                <section id="lg-p-fx" class="lg-stack hidden">
                    <div class="card lg-card" id="lg-fx-calc"></div>
                    <div class="card lg-card" id="lg-fx-table"></div>
                    <div class="card lg-card" id="lg-fx-api"></div>
                </section>
            </div>
        </div>
        <div id="lg-toast" class="lg-toast"></div>`;
        buildForm();
        buildFilters();
        buildCalc();
        bindEvents();
        setTab(S.tab);
        setSub(S.sub);
    }

    function render() {
        if (!S.built) return;
        let msg = '';
        if (!signed()) msg = `<div class="card lg-card lg-center"><p class="lg-h">💰 記帳</p><p class="lg-muted">記帳只開放會員使用，請先登入。</p><button type="button" class="lg-btn" onclick="openMemberModal()">👤 會員登入</button></div>`;
        else if (!S.data && S.err) msg = `<div class="card lg-card lg-center"><p class="lg-h">⚠️ 載入失敗</p><p class="lg-muted">${esc(S.err)}</p><button type="button" class="lg-btn" data-act="retry">重新載入</button></div>`;
        else if (!S.data) msg = `<div class="card lg-card lg-center"><p class="lg-muted">記帳資料載入中...</p></div>`;
        $('lg-gate').innerHTML = msg;
        $('lg-gate').classList.toggle('hidden', !msg);
        $('lg-main').classList.toggle('hidden', !!msg);
        if (msg) return;
        renderRoster();
        refreshForm();
        renderFilterOpts();
        renderItems();
        renderSettle();
        renderFx();
    }

    function setTab(t, dir) {
        S.tab = t;
        document.querySelectorAll('#lg-tabs [data-v]').forEach((b) => b.classList.toggle('on', b.dataset.v === t));
        TABS.forEach((k) => {
            const el = $('lg-p-' + k);
            el.classList.toggle('hidden', k !== t);
            el.classList.remove('swipe-in-r', 'swipe-in-l');
            if (k === t && dir) { void el.offsetWidth; el.classList.add(dir > 0 ? 'swipe-in-r' : 'swipe-in-l'); }
        });
        if (t === 'fx' && signed() && (!S.fx || Date.now() - S.fx.ts > 12 * 3600e3)) fetchFx(true);
    }
    function setSub(s) {
        S.sub = s;
        document.querySelectorAll('#lg-subs [data-v]').forEach((b) => b.classList.toggle('on', b.dataset.v === s));
        $('lg-s-list').classList.toggle('hidden', s !== 'list');
        $('lg-s-settle').classList.toggle('hidden', s !== 'settle');
    }

    // ---------- 團員名單 ----------
    function renderRoster() {
        const box = $('lg-roster');
        const keep = $('lg-p-name') ? $('lg-p-name').value : '';
        const focused = document.activeElement && document.activeElement.id === 'lg-p-name';
        const ids = order(), used = usedPeople(), mine = myUid();
        const boundMe = ids.some((id) => mine && P()[id].uid === mine);
        if (!ids.length) S.rosterOpen = true;
        const open = S.rosterOpen;
        let h = `<button type="button" class="lg-fold" data-act="roster">👥 團員名單（${activeIds().length} 人）<span>${open ? '收合 ▲' : '展開 ▼'}</span></button>`;
        if (open) {
            h += ids.map((id) => {
                const p = P()[id], act = p.active !== false;
                const tag = (p.uid ? (p.uid === mine ? '<em class="lg-tag me">你</em>' : '<em class="lg-tag">已綁定</em>') : '') + (act ? '' : '<em class="lg-tag">停用</em>');
                const btns = [
                    `<button type="button" data-act="p-rename" data-id="${id}">改名</button>`,
                    !p.uid && memberUser && !boundMe ? `<button type="button" data-act="p-bind" data-id="${id}">綁定我</button>` : '',
                    p.uid && (p.uid === mine || isEditor) ? `<button type="button" data-act="p-unbind" data-id="${id}">解除綁定</button>` : '',
                    `<button type="button" data-act="p-active" data-id="${id}">${act ? '停用' : '啟用'}</button>`,
                    used.has(id) ? '' : `<button type="button" data-act="p-del" data-id="${id}" class="danger">刪除</button>`
                ].join('');
                return `<div class="lg-person ${act ? '' : 'off'}"><span class="lg-pn">${esc(p.name)}${tag}</span><span class="lg-pb">${btns}</span></div>`;
            }).join('') +
                `<div class="lg-row lg-mt"><input id="lg-p-name" class="lg-in" maxlength="20" placeholder="新增團員名稱"><button type="button" class="lg-btn sm" data-act="p-add">新增</button></div>` +
                (ids.length ? '<p class="lg-muted lg-mt">綁定自己的帳號後，才能以本人身分標記轉帳與確認收款；已用在帳目裡的團員只能改名或停用。</p>' : '<p class="lg-muted lg-mt">先新增一起旅行的團員，才能開始記帳。</p>');
        }
        box.innerHTML = h;
        const inp = $('lg-p-name');
        if (inp) { inp.value = keep; if (focused) inp.focus(); }
    }
    async function rosterAct(act, id) {
        if (!guard()) return;
        const p = P()[id];
        const ref = (d) => d.ref('ledger/people/' + id);
        if (act === 'p-add') {
            const name = ($('lg-p-name').value || '').trim();
            if (!name) return toast('請輸入名稱');
            if (name.length > 20) return toast('名稱最多 20 字');
            if (order().some((k) => P()[k].name === name)) return toast('名單裡已經有這個名字');
            wdb().ref('ledger/people').push({ name, active: true, ts: TS() }).then(() => { $('lg-p-name').value = ''; toast('已新增團員'); }).catch(fail);
            return;
        }
        if (!p) return;
        if (act === 'p-rename') {
            const r = await openInputModal({ title: '修改團員名稱', fields: [{ key: 'name', value: p.name, max: 20 }], submitLabel: '儲存' });
            if (!r || !r.name || r.name === p.name) return;
            if (order().some((k) => k !== id && P()[k].name === r.name)) return alert('名單裡已經有這個名字');
            ref(wdb()).update({ name: r.name }).catch(fail);
        } else if (act === 'p-bind') {
            if (!memberUser) return;
            if (!confirm(`把你的帳號（${currentUserName}）綁定到「${p.name}」？\n綁定後才能以本人身分標記轉帳與確認收款。`)) return;
            ref(db).update({ uid: memberUser.uid }).then(() => toast('已綁定')).catch(fail);
        } else if (act === 'p-unbind') {
            const own = p.uid === myUid();
            if (!own && !isEditor) return;
            if (!confirm(`解除「${p.name}」的帳號綁定？`)) return;
            ref(own ? db : adminDb).update({ uid: null }).then(() => toast('已解除綁定')).catch(fail);
        } else if (act === 'p-active') {
            ref(wdb()).update({ active: p.active === false }).catch(fail);
        } else if (act === 'p-del') {
            if (usedPeople().has(id)) return alert('這位團員已經出現在帳目裡，只能改名或停用。');
            if (p.uid && p.uid !== myUid() && !isEditor) return alert('這位團員已綁定其他帳號，需由本人或管理員先解除綁定。');
            if (!confirm(`確定要刪除團員「${p.name}」嗎？`)) return;
            ref(p.uid && p.uid !== myUid() ? adminDb : wdb()).remove().catch(fail);
        }
    }

    // ---------- 記帳表單 ----------
    function blankForm(keep) {
        const k = keep || {};
        return {
            title: '', amount: '', note: '', parts: {}, rate: null,
            cur: k.cur || (curs().includes('JPY') ? 'JPY' : BASE), date: k.date || today(),
            payer: k.payer || '', members: k.members ? k.members.slice() : [], mode: k.mode || 'equal', cat: k.cat || '餐飲'
        };
    }
    function buildForm() {
        $('lg-form').innerHTML = `
            <div id="lg-f-banner" class="lg-banner hidden">✏️ 正在編輯：<b id="lg-f-etitle"></b><button type="button" data-act="cancel-edit">取消編輯</button></div>
            <label class="lg-lbl" for="lg-f-title">支出名稱</label>
            <input id="lg-f-title" class="lg-in" maxlength="50" placeholder="例：午餐 迴轉壽司">
            <label class="lg-lbl" for="lg-f-amount">金額</label>
            <div class="lg-row"><input id="lg-f-amount" class="lg-in lg-amt" inputmode="none" readonly placeholder="0"><input id="lg-f-cur" class="lg-in lg-cur" data-pick="f-cur" readonly autocomplete="off"></div>
            <label class="lg-lbl" for="lg-f-date">日期</label>
            <input id="lg-f-date" type="date" class="lg-in">
            <label class="lg-lbl" for="lg-f-payer">付款人</label>
            <select id="lg-f-payer" class="lg-in"></select>
            <label class="lg-lbl">分攤成員（可多選）</label>
            <div id="lg-f-members" class="lg-chips"></div>
            <label class="lg-lbl">分帳方式</label>
            <div id="lg-f-mode" class="lg-seg sm"></div>
            <div id="lg-f-parts"></div>
            <label class="lg-lbl">類別</label>
            <div id="lg-f-cats" class="lg-chips"></div>
            <label class="lg-lbl" for="lg-f-note">備註</label>
            <textarea id="lg-f-note" class="lg-in" maxlength="200" rows="2" placeholder="選填"></textarea>
            <div id="lg-f-rate"></div>
            <div id="lg-f-preview" class="lg-preview"></div>
            <button type="button" id="lg-f-save" class="lg-btn wide" data-act="save">儲存支出</button>`;
    }
    function writeForm() {
        const f = S.form;
        $('lg-f-title').value = f.title;
        $('lg-f-amount').value = f.amount;
        $('lg-f-date').value = f.date;
        $('lg-f-note').value = f.note;
        S.partsSig = S.rateSig = null;
        refreshForm();
    }
    function refreshForm() {
        if (!S.form) { S.form = blankForm(); writeForm(); return; }
        const f = S.form;
        $('lg-f-banner').classList.toggle('hidden', !S.editId);
        if (S.editId) $('lg-f-etitle').textContent = f.title || (E()[S.editId] || {}).title || '';
        pickSet($('lg-f-cur'), f.cur);
        const pay = activeIds();
        if (f.payer && P()[f.payer] && !pay.includes(f.payer)) pay.push(f.payer);
        $('lg-f-payer').innerHTML = `<option value="">請選擇付款人</option>` + selOpts(pay.map((p) => [p, pname(p)]), f.payer);
        const mem = activeIds();
        f.members.forEach((p) => { if (P()[p] && !mem.includes(p)) mem.push(p); });
        $('lg-f-members').innerHTML = mem.length
            ? mem.map((p) => `<button type="button" data-act="mem" data-id="${p}" class="lg-chip ${f.members.includes(p) ? 'on' : ''}">${esc(pname(p))}</button>`).join('') +
              `<button type="button" data-act="all" class="lg-chip ghost">${activeIds().length && activeIds().every((p) => f.members.includes(p)) ? '全不選' : '全選'}</button>`
            : '<p class="lg-muted">請先在上方「團員名單」新增團員。</p>';
        $('lg-f-mode').innerHTML = MODES.map(([k, l]) => `<button type="button" data-act="mode" data-v="${k}" class="${f.mode === k ? 'on' : ''}">${l}</button>`).join('');
        const cl2 = cats();
        if (f.cat && !cl2.includes(f.cat)) cl2.push(f.cat);
        $('lg-f-cats').innerHTML = cl2.map((c) => `<button type="button" data-act="cat" data-v="${esc(c)}" class="lg-chip ${f.cat === c ? 'on' : ''}">${esc(c)}</button>`).join('') +
            `<button type="button" data-act="cat-add" class="lg-chip ghost">＋ 新增類別</button>` +
            (customCats().length ? `<button type="button" data-act="cat-edit" class="lg-chip ghost">✏️ 編輯類別</button>` : '') +
            (canDelCat(f.cat) ? `<button type="button" data-act="cat-del" class="lg-link">刪除「${esc(f.cat)}」類別</button>` : '');
        renderParts();
        renderRate();
        renderPreview();
    }
    function renderParts(force) {
        const f = S.form, sig = [f.mode, f.cur, ...f.members].join('|');
        if (!force && sig === S.partsSig) return;
        S.partsSig = sig;
        const box = $('lg-f-parts');
        if (!f.members.length) { box.innerHTML = ''; return; }
        if (f.mode === 'equal') { box.innerHTML = `<p class="lg-muted lg-mt">由 ${f.members.length} 人平均分攤，除不盡的尾數依團員名單順序分配。</p>`; return; }
        const unit = f.mode === 'ratio' ? '%' : f.cur;
        box.innerHTML = `<div class="lg-parts">` + f.members.map((p) =>
            `<div class="lg-part"><span>${esc(pname(p))}</span><input class="lg-in" inputmode="none" readonly data-part="${p}" value="${esc(f.parts[p] || '')}" placeholder="0"><small>${esc(unit)}</small></div>`).join('') +
            `</div><button type="button" class="lg-link" data-act="fill">${f.mode === 'ratio' ? '平均填入比例' : '平均填入金額'}</button>`;
    }
    function rateInfo() {
        const f = S.form, t = R()[f.cur];
        if (f.cur === BASE) return { rate: '1' };
        if (S.editId && f.rate !== null) return { rate: f.rate, t, custom: true };
        return { rate: t ? t.rate : '', t };
    }
    function renderRate() {
        const f = S.form, ri = rateInfo(), t = ri.t;
        const sig = [f.cur, S.editId, !!ri.custom, t && t.rate, t && t.ts].join('|');
        if (sig === S.rateSig) return;
        S.rateSig = sig;
        const box = $('lg-f-rate');
        if (f.cur === BASE) { box.innerHTML = ''; return; }
        if (ri.custom) {
            box.innerHTML = `<label class="lg-lbl" for="lg-f-rate-in">此筆匯率（1 ${esc(f.cur)} = ? ${BASE}）</label>
                <input id="lg-f-rate-in" class="lg-in" inputmode="decimal" value="${esc(f.rate)}">
                <p class="lg-muted">只影響這一筆，不會改到匯率表。${t ? `匯率表目前為 ${esc(t.rate)}・<button type="button" class="lg-link" data-act="rate-table">改用匯率表</button>` : ''}</p>`;
            return;
        }
        box.innerHTML = t
            ? `<p class="lg-rate">匯率：1 ${esc(f.cur)} = <b>${esc(t.rate)}</b> ${BASE}<small>（匯率表・${esc(srcLabel(t.src))}・${when(t.ts)}）</small>${S.editId ? ` <button type="button" class="lg-link" data-act="rate-custom">改為自訂此筆匯率</button>` : ''}</p>`
            : `<p class="lg-err-p">匯率表沒有 ${esc(f.cur)}，請管理員先到「匯率」頁新增。</p>`;
    }
    function computeForm() {
        const f = S.form, errs = [], dec = decOf(f.cur);
        if (!f.title.trim()) errs.push('請輸入支出名稱');
        const amt = C.parseAmount(f.amount, dec);
        if (!amt.ok) errs.push('金額：' + amt.err);
        else if (amt.v <= 0) errs.push('支出金額必須大於零');
        const ri = rateInfo(), r = C.parseRate(ri.rate);
        if (!ri.rate) errs.push(`匯率表沒有 ${f.cur}，請管理員先新增`);
        else if (!r.ok) errs.push('匯率' + r.err);
        if (!f.payer || !P()[f.payer]) errs.push('請選擇付款人');
        if (!/^\d{4}-\d{2}-\d{2}$/.test(f.date)) errs.push('請選擇日期');
        let sp = null;
        if (amt.ok && amt.v > 0 && r.ok) {
            sp = C.computeSplit({ amount: amt.v, dec, mode: f.mode, members: f.members, parts: f.parts, rate: r.s, baseDec: BASE_DEC });
            errs.push(...sp.errors);
        } else if (!f.members.length) errs.push('請至少選擇一位分攤成員');
        return { errs, amt, dec, rate: r.ok ? r.s : '', sp };
    }
    function renderPreview() {
        const f = S.form, c = computeForm();
        const btn = $('lg-f-save');
        btn.disabled = !!c.errs.length || S.saving;
        btn.textContent = S.saving ? '儲存中...' : (S.editId ? '儲存修改' : '儲存支出');
        let h = '';
        if (c.sp && c.sp.ok) {
            const fx = f.cur !== BASE;
            h += `<p class="lg-pv-h">分攤預覽</p><div class="lg-pv-row b"><span>總額</span><span>${money(c.amt.v, f.cur)}${fx ? `<small>≈ ${money(c.sp.baseAmt, BASE)}</small>` : ''}</span></div>`;
            if (fx) h += `<p class="lg-muted">使用匯率：1 ${esc(f.cur)} = ${esc(c.rate)} ${BASE}</p>`;
            h += f.members.map((p) => {
                const s = c.sp.shares[p];
                return `<div class="lg-pv-row"><span>${esc(pname(p))}</span><span>${fx ? `${money(s.o, f.cur)}<small>≈ ${money(s.b, BASE)}</small>` : money(s.b, BASE)}</span></div>`;
            }).join('');
        }
        if (c.errs.length) h += `<ul class="lg-errs">${c.errs.map((e) => `<li>${esc(e)}</li>`).join('')}</ul>`;
        $('lg-f-preview').innerHTML = h;
    }
    async function saveExpense() {
        if (S.saving || !guard()) return;
        const c = computeForm();
        if (c.errs.length) return;
        const f = S.form, m = me(), t = R()[f.cur], o = S.editOrig;
        if (S.editId && !E()[S.editId]) { alert('這筆支出已經被刪除了。'); cancelEdit(); return; }
        const rateRef = f.cur === BASE ? 'base'
            : (o && o.cur === f.cur && o.rate === c.rate) ? (o.rateRef || 'manual')
            : (t && t.rate === c.rate) ? `table:${f.cur}@${t.ts || 0}` : 'manual';
        const rec = {
            title: f.title.trim(), amount: c.amt.v, cur: f.cur, dec: c.dec, rate: c.rate, rateRef,
            base: BASE, baseAmt: c.sp.baseAmt, date: f.date, payer: f.payer, mode: f.mode,
            parts: f.mode === 'equal' ? null : Object.fromEntries(f.members.map((p) => [p, String(f.parts[p] || '0').trim()])),
            shares: c.sp.shares, cat: f.cat, note: f.note.trim(), updBy: m.uid, updName: m.name, uts: TS()
        };
        S.saving = true;
        renderPreview();
        const editing = S.editId;
        const job = editing
            ? wdb().ref('ledger/expenses/' + editing).update(rec)
            : wdb().ref('ledger/expenses').push({ ...rec, by: m.uid, byName: m.name, ts: TS() });
        try {
            await job;
            toast(editing ? '已儲存修改' : '已新增支出');
            if (editing) { cancelEdit(); setTab('list'); setSub('list'); S.open = editing; renderItems(); }
            else { S.form = blankForm(f); writeForm(); }
        } catch (e) { fail(e); }
        S.saving = false;
        renderPreview();
    }
    function startEdit(id) {
        const e = E()[id];
        if (!e) return;
        S.editId = id;
        S.editOrig = e;
        S.form = {
            title: e.title || '', amount: C.toPlain(e.amount, Number.isInteger(e.dec) ? e.dec : decOf(e.cur)), cur: e.cur, date: e.date || today(),
            payer: e.payer, members: order().filter((p) => e.shares && e.shares[p]), mode: e.mode || 'equal',
            parts: { ...(e.parts || {}) }, cat: e.cat || '其他', note: e.note || '', rate: e.cur === BASE ? null : e.rate
        };
        writeForm();
        setTab('add');
        window.scrollTo({ top: 0, behavior: 'auto' });
    }
    function cancelEdit() {
        const f = S.form;
        S.editId = S.editOrig = null;
        S.form = blankForm({ date: f.date, payer: f.payer, cur: f.cur });
        writeForm();
    }
    function fillParts() {
        const f = S.form, ones = f.members.map(() => 1);
        if (f.mode === 'ratio') {
            C.allocate(10000, ones).forEach((v, i) => { f.parts[f.members[i]] = C.toPlain(v, 2); });
        } else {
            const dec = decOf(f.cur), a = C.parseAmount(f.amount, dec);
            if (!a.ok || a.v <= 0) return toast('請先輸入總金額');
            C.allocate(a.v, ones).forEach((v, i) => { f.parts[f.members[i]] = C.toPlain(v, dec); });
        }
        renderParts(true);
        renderPreview();
    }

    async function addCat() {
        if (!guard()) return;
        const r = await openInputModal({ title: '新增類別', fields: [{ key: 'name', placeholder: '類別名稱（最多 10 字）', max: 10 }], submitLabel: '新增' });
        if (!r || !r.name) return;
        if (cats().includes(r.name)) { S.form.cat = r.name; refreshForm(); toast('已經有這個類別'); return; }
        wdb().ref('ledger/cats').push({ name: r.name, by: currentUserUid, ts: TS() })
            .then(() => { S.form.cat = r.name; refreshForm(); toast('已新增類別'); }).catch(fail);
    }
    function delCat(name = S.form.cat) {
        const c = catEntry(name);
        if (!c || !guard()) return;
        if (catUses(name)) return alert(`「${name}」還有 ${catUses(name)} 筆支出在使用，不能刪除。`);
        if (!confirm(`刪除「${name}」類別？`)) return;
        wdb().ref('ledger/cats/' + c[0]).remove()
            .then(() => { if (S.form.cat === name) S.form.cat = CATS[0]; refreshForm(); toast('已刪除類別'); }).catch(fail);
    }
    async function renameCat(name) {
        const c = catEntry(name);
        if (!c || !guard()) return;
        const r = await openInputModal({ title: `「${name}」改名`, fields: [{ key: 'name', value: name, placeholder: '類別名稱（最多 10 字）', max: 10 }], submitLabel: '儲存' });
        if (!r || !r.name || r.name === name) return;
        if (cats().includes(r.name)) return alert('已經有這個類別');
        const up = { [`cats/${c[0]}/name`]: r.name };
        Object.entries(E()).forEach(([id, e]) => { if (e.cat === name) up[`expenses/${id}/cat`] = r.name; });
        wdb().ref('ledger').update(up).then(() => {
            if (S.form.cat === name) S.form.cat = r.name;
            if (S.filter.cat === name) S.filter.cat = r.name;
            refreshForm();
            toast(`已改名，${Object.keys(up).length - 1} 筆支出一併更新`);
        }).catch(fail);
    }
    async function editCats() {
        const list = customCats();
        if (!list.length) return toast('還沒有自訂類別');
        const pick = await openChoiceModal({ title: '編輯類別（預設 6 個不能修改）', options: list.map(([id, c]) => ({ label: `${c.name}${catUses(c.name) ? `（${catUses(c.name)} 筆使用中）` : ''}`, value: id })) });
        const c = pick && (D().cats || {})[pick];
        if (!c) return;
        const used = catUses(c.name);
        const act = await openChoiceModal({ title: `「${c.name}」`, options: [
            { label: '✏️ 改名' + (used ? `（${used} 筆支出會一起改）` : ''), value: 'rename' },
            { label: used ? '🗑️ 刪除（使用中，不能刪）' : '🗑️ 刪除', value: 'del', danger: true }
        ] });
        if (act === 'rename') renameCat(c.name);
        else if (act === 'del') delCat(c.name);
    }

    // ---------- 支出紀錄 ----------
    const FL_KEYS = ['cat', 'payer', 'members', 'cur', 'sort'];
    const FL_T = { cat: '類別', payer: '付款人', members: '分攤成員（可複選）', cur: '幣別', sort: '排序' };
    function buildFilters() {
        $('lg-filters').innerHTML = `
            <input id="lg-q" class="lg-in" placeholder="🔍 搜尋名稱或備註">
            <div class="lg-grid2 lg-mt">
                ${FL_KEYS.map((k) => `<button type="button" id="lg-fl-${k}" class="lg-in lg-fbtn" data-act="fl-open" data-v="${k}"></button>`).join('')}
                <button type="button" class="lg-btn sm ghost" data-act="fl-clear">清除篩選</button>
            </div>`;
    }
    function flLabel(k) {
        const f = S.filter;
        if (k === 'cat') return f.cat || '全部類別';
        if (k === 'payer') return f.payer ? pname(f.payer) : '全部付款人';
        if (k === 'members') return f.members.length ? f.members.map(pname).join('、') : '全部分攤成員';
        if (k === 'cur') return f.cur ? curLabel(f.cur) : '全部幣別';
        return f.sort === 'asc' ? '日期：舊 → 新' : '日期：新 → 舊';
    }
    function renderFilterOpts() {
        const f = S.filter;
        f.members = f.members.filter((p) => P()[p]);
        FL_KEYS.forEach((k) => {
            const b = $('lg-fl-' + k);
            b.textContent = flLabel(k);
            b.classList.toggle('on', k === 'members' ? f.members.length > 0 : k !== 'sort' && !!f[k]);
        });
    }
    function flOpts(k) {
        if (k === 'cat') return [['', '全部類別'], ...[...new Set([...cats(), ...Object.values(E()).map((e) => e.cat).filter(Boolean)])].map((c) => [c, c])];
        if (k === 'payer') return [['', '全部付款人'], ...order().map((p) => [p, pname(p)])];
        if (k === 'members') return order().map((p) => [p, pname(p)]);
        if (k === 'cur') return [['', '全部幣別'], ...[...new Set([...curs(), ...usedCurs()])].map((c) => [c, curLabel(c)])];
        return [['desc', '日期：新 → 舊'], ['asc', '日期：舊 → 新']];
    }
    function flBox() {
        let b = $('lg-fl');
        if (b) return b;
        b = document.createElement('div');
        b.id = 'lg-fl';
        b.className = 'lg-sheet hidden';
        b.innerHTML = `<div class="lg-sheet-back" data-close></div>
            <div class="lg-sheet-in"><div class="lg-sheet-h"><b id="lg-fl-t"></b><button type="button" data-close>✕</button></div>
            <div id="lg-fl-list" class="lg-sheet-list"></div><div id="lg-fl-foot"></div></div>`;
        b.addEventListener('click', (e) => {
            if (e.target.closest('[data-close]')) return flClose();
            const o = e.target.closest('[data-fv]');
            if (o) return flPick(o.dataset.fv);
            const a = e.target.closest('[data-fa]');
            if (a) flMulti(a.dataset.fa);
        });
        document.body.appendChild(b);
        return b;
    }
    function flOpen(k) {
        S.fs = { k, sel: k === 'members' ? S.filter.members.slice() : null };
        flBox().classList.remove('hidden');
        $('lg-fl-t').textContent = FL_T[k];
        flDraw();
    }
    function flDraw() {
        const { k, sel } = S.fs, multi = k === 'members', cur = multi ? null : (S.filter[k] || '');
        $('lg-fl-list').innerHTML = flOpts(k).map(([v, l]) => {
            const on = multi ? sel.includes(v) : v === cur;
            return `<button type="button" data-fv="${esc(v)}" class="${on ? 'on' : ''}">${multi ? `<i>${on ? '✓' : ''}</i>` : ''}<span>${esc(l)}</span></button>`;
        }).join('') || '<p class="lg-pick-none">沒有選項</p>';
        $('lg-fl-foot').innerHTML = multi ? `<div class="lg-row lg-mt"><button type="button" class="lg-btn sm ghost" data-fa="clear">全部</button><button type="button" class="lg-btn sm" style="flex:1" data-fa="ok">套用${sel.length ? `（${sel.length} 人）` : '（全部）'}</button></div>` : '';
    }
    function flPick(v) {
        const s = S.fs;
        if (!s) return;
        if (s.k === 'members') { const i = s.sel.indexOf(v); if (i >= 0) s.sel.splice(i, 1); else s.sel.push(v); flDraw(); return; }
        S.filter[s.k] = v;
        flClose();
        flApply();
    }
    function flMulti(a) {
        if (a === 'clear') { S.fs.sel = []; flDraw(); return; }
        S.filter.members = order().filter((p) => S.fs.sel.includes(p));
        flClose();
        flApply();
    }
    function flClose() { S.fs = null; const b = $('lg-fl'); if (b) b.classList.add('hidden'); }
    function flApply() { renderFilterOpts(); renderItems(); }
    function filtered() {
        const f = S.filter, q = f.q.trim().toLowerCase();
        return Object.entries(E())
            .filter(([, e]) => (!f.cat || e.cat === f.cat) && (!f.payer || e.payer === f.payer) && (!f.members.length || f.members.some((p) => e.shares && e.shares[p])) &&
                (!f.cur || e.cur === f.cur) && (!q || `${e.title || ''} ${e.note || ''}`.toLowerCase().includes(q)))
            .sort(([ia, a], [ib, b]) => {
                const d = (a.date || '').localeCompare(b.date || '') || ((a.ts || 0) - (b.ts || 0)) || (ia < ib ? -1 : 1);
                return S.filter.sort === 'asc' ? d : -d;
            });
    }
    function saveFold() { cacheSave('ledger_fold', { days: S.listShut }); }
    function renderItems() {
        const box = $('lg-items'), all = Object.keys(E()).length, list = filtered();
        if (!all) { box.innerHTML = '<div class="card lg-card lg-center"><p class="lg-muted">還沒有支出紀錄，到「記帳」新增第一筆吧。</p></div>'; return; }
        const total = list.reduce((s, [, e]) => s + (Number.isInteger(e.baseAmt) ? e.baseAmt : 0), 0);
        const exportBtn = `<button type="button" class="lg-btn sm ghost lg-export" data-act="export">⬇️ 匯出目前列表（CSV，可用 Excel／Google 試算表開啟）</button>`;
        if (!list.length) { box.innerHTML = `<p class="lg-sum">共 0 筆</p><div class="card lg-card lg-center"><p class="lg-muted">沒有符合篩選條件的支出。</p></div>`; return; }
        const groups = [], idx = {};
        list.forEach(([id, e]) => {
            const d = e.date || '（無日期）';
            if (idx[d] == null) { idx[d] = groups.length; groups.push({ d, items: [], sum: 0 }); }
            const g = groups[idx[d]];
            g.items.push([id, e]);
            g.sum += Number.isInteger(e.baseAmt) ? e.baseAmt : 0;
        });
        const ti = trByExp(), allShut = groups.every((g) => S.listShut[g.d]);
        let h = `<div class="lg-items-head"><p class="lg-sum">共 ${list.length} 筆・合計 <b>${money(total, BASE)}</b></p><button type="button" class="lg-btn sm" data-act="fold-all">${allShut ? '全部展開' : '全部收合'}</button></div>`;
        h += groups.map((g) => {
            const shut = !!S.listShut[g.d];
            const label = /^\d{4}-\d{2}-\d{2}$/.test(g.d) ? `${+g.d.slice(5, 7)}/${+g.d.slice(8, 10)}` : g.d;
            return `<div class="lg-grp"><button type="button" class="lg-grp-h" data-act="grp" data-d="${esc(g.d)}"><span>${esc(label)}<small>${g.items.length} 筆</small></span><span class="lg-grp-r">${money(g.sum, BASE)}<em>${shut ? '▼' : '▲'}</em></span></button>${shut ? '' : `<div class="lg-stack sm lg-mt">${g.items.map(([id, e]) => itemHtml(id, e, ti)).join('')}</div>`}</div>`;
        }).join('');
        box.innerHTML = `<div class="lg-items-box">${h}</div>` + exportBtn;
    }
    function trByExp() {
        const m = {};
        Object.values(T()).forEach((t) => { if (t && t.eid && t.status !== 'void') (m[t.eid] = m[t.eid] || {})[t.from] = t; });
        return m;
    }
    function payTag(id, e, p, ti) {
        const s = e.shares[p];
        if (p === e.payer || !s || !(s.b > 0)) return '';
        const tr = (ti[id] || {})[p];
        if (tr) return `<em class="lg-pt ${tr.status === 'done' ? 'ok' : ''}">${tr.status === 'done' ? '✅ 已先轉帳' : '已先轉帳・待確認'}${tr.amt !== s.b ? `・${money(tr.amt, BASE)}` : ''}</em>`;
        return canAct(p) ? `<button type="button" class="lg-pt-b" data-act="exp-pay" data-id="${id}" data-p="${p}">先轉帳</button>` : '';
    }
    function itemHtml(id, e, ti = {}) {
        const fx = e.cur !== BASE, n = Object.keys(e.shares || {}).length, open = S.open === id;
        let h = `<div class="card lg-item ${open ? 'open' : ''}">
            <button type="button" class="lg-item-h" data-act="exp-open" data-id="${id}">
                <span class="lg-item-l"><b>${esc(e.title || '')}</b><small>${esc(e.date || '')}・${esc(pname(e.payer))} 付款・${n} 人分攤${e.cat ? '・' + esc(e.cat) : ''}</small></span>
                <span class="lg-item-r"><b>${money(e.amount, e.cur)}</b>${fx ? `<small>≈ ${money(e.baseAmt, BASE)}</small>` : ''}</span>
            </button>`;
        if (open) {
            const modeL = (MODES.find(([k]) => k === e.mode) || [, ''])[1];
            h += `<div class="lg-detail">
                ${order().filter((p) => e.shares && e.shares[p]).map((p) => {
                    const s = e.shares[p];
                    return `<div class="lg-pv-row"><span>${esc(pname(p))}${payTag(id, e, p, ti)}</span><span>${fx ? `${money(s.o, e.cur)}<small>≈ ${money(s.b, BASE)}</small>` : money(s.b, BASE)}</span></div>`;
                }).join('')}
                <p class="lg-muted lg-mt">分帳方式：${esc(modeL)}${fx ? `・匯率 1 ${esc(e.cur)} = ${esc(e.rate)} ${BASE}（${String(e.rateRef || '').startsWith('table:') ? '當時匯率表' : '自訂'}）` : ''}</p>
                ${e.note ? `<p class="lg-note">${esc(e.note)}</p>` : ''}
                <p class="lg-muted">建立：${esc(e.byName || '')} ${when(e.ts)}${e.updName && e.uts !== e.ts ? `・最後修改：${esc(e.updName)} ${when(e.uts)}` : ''}</p>
                <div class="lg-actions"><button type="button" class="lg-btn sm" data-act="exp-edit" data-id="${id}">✏️ 編輯</button><button type="button" class="lg-btn sm danger" data-act="exp-del" data-id="${id}">🗑️ 刪除</button></div>
            </div>`;
        }
        return h + '</div>';
    }
    // 匯出目前篩選後的支出（CSV，含每人分攤台幣與合計列）
    async function exportCsv() {
        let list = filtered();
        if (!list.length) return toast('沒有可匯出的支出');
        const go = await openChoiceModal({ title: '匯出 CSV', options: [{ label: `確認匯出目前 ${list.length} 筆（依現在的篩選條件）`, value: 'ok' }] });
        if (go !== 'ok') return;
        list = filtered();
        if (!list.length) return toast('沒有可匯出的支出');
        const ppl = order().filter((p) => list.some(([, e]) => e.shares && e.shares[p]));
        const cell = (v) => {
            let t = String(v ?? '');
            if (/^[=+\-@\t\r]/.test(t)) t = "'" + t;
            return /[",\r\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
        };
        const modeL = (m) => (MODES.find(([k]) => k === m) || [, m || ''])[1];
        const shareOf = (e, p) => (e.shares && e.shares[p] && Number.isInteger(e.shares[p].b) ? e.shares[p].b : null);
        const head = ['日期', '名稱', '類別', '付款人', '幣別', '原始金額', `匯率（1 外幣 = ? ${BASE}）`, `${BASE} 金額`, '分帳方式',
            ...ppl.map((p) => `${pname(p)} 分攤（${BASE}）`), '備註', '建立者', '最後修改者'];
        const rows = list.map(([, e]) => [e.date, e.title, e.cat || '', pname(e.payer), e.cur,
            C.toPlain(e.amount, Number.isInteger(e.dec) ? e.dec : decOf(e.cur)), e.rate, C.toPlain(e.baseAmt || 0, BASE_DEC), modeL(e.mode),
            ...ppl.map((p) => { const b = shareOf(e, p); return b === null ? '' : C.toPlain(b, BASE_DEC); }),
            e.note || '', e.byName || '', e.updName || '']);
        rows.push(['', '合計', '', '', '', '', '', C.toPlain(list.reduce((s, [, e]) => s + (e.baseAmt || 0), 0), BASE_DEC), '',
            ...ppl.map((p) => C.toPlain(list.reduce((s, [, e]) => s + (shareOf(e, p) || 0), 0), BASE_DEC)), '', '', '']);
        const csv = '\ufeff' + [head, ...rows].map((r) => r.map(cell).join(',')).join('\r\n');
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
        a.download = `山陰記帳明細_${today()}.csv`;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
        toast(`已匯出 ${list.length} 筆`);
    }
    function delExpense(id) {
        const e = E()[id];
        if (!e || !guard()) return;
        if (!confirm(`確定要刪除「${e.title}」嗎？\n刪除後結算會自動重新計算，已記錄的轉帳不會被刪除。`)) return;
        wdb().ref('ledger/expenses/' + id).remove().then(() => { toast('已刪除'); if (S.editId === id) cancelEdit(); }).catch(fail);
    }

    // ---------- 自動結算 ----------
    const stDates = () => [...new Set(Object.values(E()).map((e) => e.date).filter(Boolean))].sort();
    const mdLabel = (d) => { const [, m, dd] = d.split('-'); return `${+m}/${+dd}`; };
    function foldCard(k, title, body) {
        const shut = S.fold[k];
        return `<div class="card lg-card"><button type="button" class="lg-fold" data-act="fold" data-v="${k}">${title}<span>${shut ? '展開 ▼' : '收合 ▲'}</span></button>${shut ? '' : `<div class="lg-mt">${body}</div>`}</div>`;
    }
    function renderSettle() {
        const ids = order(), dates = stDates(), day = S.stMode === 'day';
        if (day && !dates.includes(S.stDay)) S.stDay = dates.includes(today()) ? today() : (dates[dates.length - 1] || '');
        const exps = day ? Object.fromEntries(Object.entries(E()).filter(([, e]) => e.date === S.stDay)) : E();
        const trs = day ? Object.fromEntries(Object.entries(T()).filter(([, t]) => t.eid && E()[t.eid] && E()[t.eid].date === S.stDay)) : T();
        const B = C.balances(ids, exps, trs), sug = C.settle(ids, B);
        const curList = curs();
        if (!curList.includes(S.stCur)) S.stCur = BASE;
        const dc = S.stCur, rate = dc === BASE ? null : R()[dc].rate, ddec = decOf(dc);
        const conv = (v) => (rate ? C.convertBack(v, BASE_DEC, rate, ddec) : v);
        const num = (v) => C.formatAmount(conv(v), ddec);
        const amt = (v) => (rate ? `${money(conv(v), dc)}<small>≈ ${money(v, BASE)}</small>` : money(v, BASE));
        const rows = Object.keys(B).filter((p) => (P()[p] && P()[p].active !== false) || B[p].paid || B[p].owe || B[p].sent || B[p].recv);
        const open = Object.values(B).reduce((s, x) => s + Math.max(0, x.net), 0);
        const netCell = (v) => v > 0 ? `<b class="pos">+${num(v)}</b><small>應收</small>` : v < 0 ? `<b class="neg">${num(v)}</b><small>應付</small>` : `<b>0</b><small>平衡</small>`;
        const trE = (t) => { if (!t.eid) return ''; const x = E()[t.eid]; return `<small class="lg-tr-e">📌 依「${esc(x ? x.title : '已刪除的支出')}」${x && x.date ? `（${mdLabel(x.date)}）` : ''}先轉帳</small>`; };
        const trLine = ([, t], btns) => `<div class="lg-tr"><p><b>${esc(pname(t.from))}</b> → <b>${esc(pname(t.to))}</b><span>${amt(t.amt)}</span></p>${trE(t)}${btns}</div>`;

        let h = `<div class="card lg-card">
            <div class="lg-seg sm">${[['all', '總和'], ['day', '依日期']].map(([k, l]) => `<button type="button" data-act="st-mode" data-v="${k}" class="${S.stMode === k ? 'on' : ''}">${l}</button>`).join('')}</div>
            <div class="lg-row lg-mt">${day ? `<select id="lg-st-day" class="lg-in">${dates.length ? selOpts(dates.map((d) => [d, mdLabel(d)]), S.stDay) : '<option value="">沒有支出</option>'}</select>` : ''}
                <input id="lg-st-cur" class="lg-in lg-cur" data-pick="st-cur" data-val="${esc(dc)}" value="${esc(curLabel(dc))}" readonly autocomplete="off"></div>
            ${rate ? `<p class="lg-muted lg-mt">以目前匯率 1 ${esc(dc)} = ${esc(rate)} ${BASE} 換算，僅供參考；實際以 ${BASE} 結算與記錄轉帳。</p>` : ''}
            ${day ? '<p class="lg-muted lg-mt">依日期只計算當天的支出，以及指定當天支出的先轉帳，僅供查看；標記轉帳請切回「總和」。</p>' : ''}
        </div>`;
        if (day && !dates.length) { $('lg-s-settle').innerHTML = h + '<div class="card lg-card lg-center"><p class="lg-muted">還沒有支出紀錄。</p></div>'; return; }

        h += foldCard('bal', `📊 每人帳務 <small>（${esc(dc)}${day ? `・${mdLabel(S.stDay)}` : ''}）</small>`,
            (rows.length ? `<div class="lg-bal"><div class="lg-bal-r h"><span>成員</span><span>已付</span><span>應負擔</span><span>淨額</span></div>
            ${rows.map((p) => {
                const x = B[p];
                return `<div class="lg-bal-r"><span>${esc(pname(p))}${x.sent || x.recv ? `<small>轉出 ${num(x.sent)}・收到 ${num(x.recv)}</small>` : ''}</span><span>${num(x.paid)}</span><span>${num(x.owe)}</span><span>${netCell(x.net)}</span></div>`;
            }).join('')}</div>` : '<p class="lg-muted">還沒有團員。</p>') +
            `<p class="lg-sum lg-mt">${day ? '當天未平衡' : '尚未結清'}：<b>${amt(open)}</b></p>
            <p class="lg-muted">淨額 ＝ 已付 − 應負擔 ＋ 已轉出 − 已收到；已標記轉帳的金額會立即計入${day ? '（只算指定當天支出的先轉帳）' : ''}。</p>`);

        h += foldCard('sug', '💸 清帳建議', sug.length ? sug.map((s) =>
            `<div class="lg-tr"><p><b>${esc(pname(s.from))}</b> → <b>${esc(pname(s.to))}</b><span>${amt(s.amt)}</span></p>
            <div class="lg-st">${day ? '<small>依日期檢視，僅供參考</small>' : `<em>付款：未轉帳</em><em>收款：未確認</em>${canAct(s.from)
                ? `<button type="button" class="lg-btn sm" data-act="st-pay" data-from="${s.from}" data-to="${s.to}" data-amt="${s.amt}">標記已轉帳</button>`
                : `<small>由 ${esc(pname(s.from))} 本人或管理員標記</small>`}`}</div></div>`).join('')
            : `<p class="lg-muted">🎉 ${day ? '這天' : ''}帳務已平衡，沒有需要轉帳的項目。</p>`);

        if (!day) {
            const tr = Object.entries(T()).sort(([a], [b]) => (a < b ? 1 : -1));
            const pend = tr.filter(([, t]) => t.status === 'paid'), done = tr.filter(([, t]) => t.status === 'done'), voids = tr.filter(([, t]) => t.status === 'void');
            let b = (!pend.length && !done.length) ? '<p class="lg-muted">還沒有轉帳紀錄。</p>' : '';
            b += pend.map(([id, t]) => trLine([id, t], `<div class="lg-st"><em>付款：已轉帳 ${when(t.paidTs)}</em><em class="wait">收款：待 ${esc(pname(t.to))} 確認</em>
                ${canAct(t.to) ? `<button type="button" class="lg-btn sm" data-act="tr-done" data-id="${id}">確認收款</button><button type="button" class="lg-btn sm ghost" data-act="tr-void" data-id="${id}">退回</button>`
                    : canAct(t.from) ? `<button type="button" class="lg-btn sm ghost" data-act="tr-void" data-id="${id}">取消</button>` : ''}</div>`)).join('');
            b += done.map(([id, t]) => trLine([id, t], `<div class="lg-st"><em class="ok">✅ 已完成</em><small>轉帳 ${when(t.paidTs)}・${esc(t.doneName || '')} 確認 ${when(t.doneTs)}</small></div>`)).join('');
            if (voids.length) {
                b += `<button type="button" class="lg-link lg-mt" data-act="void-toggle">${S.showVoid ? '隱藏' : '顯示'}已退回／取消的紀錄（${voids.length}）</button>`;
                if (S.showVoid) b += voids.map(([id, t]) => trLine([id, t], `<div class="lg-st"><em>已退回／取消</em><small>${esc(t.voidName || '')} ${when(t.voidTs)}</small></div>`)).join('');
            }
            h += foldCard('tr', `🧾 轉帳紀錄 <small>（${pend.length} 筆待確認）</small>`, b);
        }
        $('lg-s-settle').innerHTML = h;
    }
    function markPaid(from, to, amt, eid) {
        if (!guard() || !canAct(from) || !(amt > 0)) return;
        const e = eid ? E()[eid] : null;
        if (eid && !e) return;
        if (eid && Object.values(T()).some((t) => t.eid === eid && t.from === from && t.status !== 'void')) return toast('這筆已經先轉帳過了');
        if (!confirm(`確認 ${pname(from)} 已轉帳 ${money(amt, BASE)} 給 ${pname(to)}？${e ? `\n（依「${e.title}」的分攤先轉帳）` : ''}\n\n會先計入餘額，等待 ${pname(to)} 確認收款。`)) return;
        const m = me();
        actDb(from).ref('ledger/transfers').push({ from, to, amt, cur: BASE, status: 'paid', ...(eid ? { eid } : {}), paidBy: m.uid, paidName: m.name, paidTs: TS() })
            .then(() => toast('已標記轉帳')).catch(fail);
    }
    function setTransfer(id, status) {
        const t = T()[id];
        if (!t || t.status !== 'paid' || !guard()) return;
        const who = status === 'done' || canAct(t.to) ? t.to : t.from;
        if (!canAct(who)) return;
        const msg = status === 'done' ? `確認已收到 ${pname(t.from)} 轉來的 ${money(t.amt, BASE)}？`
            : `確定要${who === t.to ? '退回' : '取消'}這筆轉帳嗎？金額會重新列入待結清。`;
        if (!confirm(msg)) return;
        const m = me(), k = status === 'done' ? 'done' : 'void';
        actDb(who).ref('ledger/transfers/' + id).update({ status, [k + 'By']: m.uid, [k + 'Name']: m.name, [k + 'Ts']: TS() })
            .then(() => toast(status === 'done' ? '已確認收款' : '已退回')).catch(fail);
    }

    // ---------- 匯率 ----------
    function sugg(cur) {
        const x = S.fx && S.fx.map && Number(S.fx.map[cur]);
        if (!(x > 0)) return null;
        const r = C.parseRate((1 / x).toFixed(C.RATE_DP));
        return r.ok ? r.s : null;
    }
    function renderFx() {
        const rt = R(), used = usedCurs(), list = Object.keys(rt).filter((c) => c !== BASE).sort();
        $('lg-fx-table').innerHTML = `
            <p class="lg-h">💱 匯率表</p>
            <div class="lg-base">基準幣別：<b>${BASE}</b><small>已鎖定，所有結算以台幣計</small></div>
            <p class="lg-muted">匯率 ＝ 1 單位外幣可換算的台幣金額。修改匯率不會影響已記錄的支出。</p>
            ${list.length ? list.map((c) => {
                const r = rt[c];
                return `<div class="lg-fx-r"><span class="lg-fx-c">${esc(c)}<small>${esc(curName(c))}</small></span><span class="lg-fx-v">1 ${esc(c)} = <b>${esc(r.rate)}</b> ${BASE}<small>${esc(srcLabel(r.src))}・${when(r.ts)}${r.by ? '・' + esc(r.by) : ''}</small></span>
                    ${isEditor ? `<span class="lg-fx-b"><button type="button" data-act="fx-edit" data-v="${esc(c)}">修改</button>${used.has(c) ? '' : `<button type="button" class="danger" data-act="fx-del" data-v="${esc(c)}">刪除</button>`}</span>` : ''}</div>`;
            }).join('') : '<p class="lg-muted lg-mt">還沒有外幣，請管理員新增（例如 JPY）。</p>'}
            ${isEditor ? '<button type="button" class="lg-btn sm lg-mt" data-act="fx-add">＋ 新增幣別</button>' : '<p class="lg-muted lg-mt">只有管理員可以修改匯率表。</p>'}
            <p class="lg-muted lg-mt" style="text-align:right">記帳模組 v${VER}</p>`;
        renderFxApi();
        renderCalc();
    }
    function renderFxApi() {
        const fx = S.fx, rt = R();
        const cs = [...new Set([...Object.keys(rt).filter((c) => c !== BASE), 'JPY'])].sort();
        let h = `<p class="lg-h">🌐 自動匯率（建議值）</p>
            <button type="button" class="lg-btn sm" data-act="fx-fetch" ${S.fxBusy ? 'disabled' : ''}>${S.fxBusy ? '抓取中...' : '🔄 抓取最新匯率'}</button>`;
        if (S.fxErr) h += `<p class="lg-err-p">${esc(S.fxErr)}</p>`;
        if (fx && fx.map) {
            h += `<p class="lg-muted lg-mt">來源：${esc(fx.src)}・資料日期 ${esc(fx.date || '—')}・抓取於 ${when(fx.ts)}</p>` + cs.map((c) => {
                const s = sugg(c), cur = rt[c];
                const btn = isEditor && s && (!cur || cur.rate !== s) ? `<button type="button" data-act="fx-apply" data-v="${esc(c)}">${cur ? '套用' : '新增並套用'}</button>` : '';
                return `<div class="lg-fx-r"><span class="lg-fx-c">${esc(c)}<small>${esc(curName(c))}</small></span><span class="lg-fx-v">建議 <b>${s ? esc(s) : '—'}</b><small>目前：${cur ? esc(cur.rate) : '未設定'}</small></span>${btn ? `<span class="lg-fx-b">${btn}</span>` : ''}</div>`;
            }).join('');
            h += `<p class="lg-muted lg-mt">API 提供的是市場中間價，跟實際刷卡或換現金的匯率會有落差，套用前請自行確認。</p>` +
                (fx.src === 'ExchangeRate-API' ? '<p class="lg-muted"><a href="https://www.exchangerate-api.com" target="_blank" rel="noopener">Rates By Exchange Rate API</a></p>'
                    : '<p class="lg-muted">資料來源：<a href="https://github.com/fawazahmed0/exchange-api" target="_blank" rel="noopener">fawazahmed0/exchange-api</a></p>');
        } else if (!S.fxBusy) h += '<p class="lg-muted lg-mt">尚未抓取。</p>';
        $('lg-fx-api').innerHTML = h;
    }
    async function fetchFx(auto) {
        if (S.fxBusy) return;
        if (isOffline()) { if (!auto) offlineAlert(); return; }
        S.fxBusy = true; S.fxErr = '';
        if (S.built) renderFxApi();
        let ok = false;
        for (const [src, url, pick] of FX_SRC) {
            try {
                const res = await fetch(url, { cache: 'no-store' });
                if (!res.ok) continue;
                const p = pick(await res.json());
                if (!p.map || !Object.keys(p.map).length) continue;
                S.fx = { src, date: p.date || '', map: p.map, ts: Date.now() };
                cacheSave('fx', S.fx);
                ok = true;
                break;
            } catch (e) { }
        }
        S.fxBusy = false;
        if (!ok) S.fxErr = '抓取失敗，請稍後再試（可能是網路問題）。';
        if (S.built && S.data) renderFx(); else if (S.built) renderFxApi();
    }
    function writeRate(cur, rate, dec, src) {
        return adminDb.ref('ledger/rates/' + cur).set({ rate, dec, src, ts: TS(), by: '管理員' });
    }
    async function fxAct(act, cur) {
        if (!isEditor || !guard()) return;
        const rt = R();
        if (act === 'fx-add') {
            const iso = isoCurs();
            const ask = openInputModal({ title: '新增幣別', fields: [{ key: 'code', placeholder: '點選或打字搜尋，例：泰銖、THB', max: 30 }, { key: 'rate', placeholder: '1 單位外幣 = ? TWD（留空＝用 API 建議值）' }], submitLabel: '新增' });
            const ci = document.getElementById('im-code');
            if (ci) { ci.dataset.pick = 'iso'; ci.setAttribute('autocomplete', 'off'); ci.readOnly = true; ci.setAttribute('inputmode', 'none'); }
            const r = await ask;
            if (!r) return;
            const code = resolveCur(r.code, iso) || String(r.code || '').trim().toUpperCase();
            if (!/^[A-Z]{3}$/.test(code)) return alert('請輸入 3 個英文字母的幣別代碼');
            if (code === BASE || rt[code]) return alert('這個幣別已經存在');
            let dec = DEC_FIX[code];
            if (dec === undefined) { try { dec = new Intl.NumberFormat('en', { style: 'currency', currency: code }).resolvedOptions().maximumFractionDigits; } catch (e) { return alert('無法辨識的幣別代碼'); } }
            const raw = r.rate || sugg(code) || '';
            const p = C.parseRate(raw);
            if (!p.ok) return alert(raw ? '匯率' + p.err : '請輸入匯率，或先抓取 API 匯率');
            writeRate(code, p.s, dec, r.rate ? 'manual' : 'api:' + S.fx.src).then(() => toast('已新增 ' + code)).catch(fail);
        } else if (act === 'fx-edit') {
            const cr = rt[cur];
            if (!cr) return;
            const r = await openInputModal({ title: `修改 ${curLabel(cur)} 匯率`, fields: [{ type: 'note', text: `1 ${cur} = ? ${BASE}\n只影響之後新增的支出，已記錄的支出不會變動。` }, { key: 'rate', value: cr.rate }], submitLabel: '儲存' });
            if (!r) return;
            const p = C.parseRate(r.rate);
            if (!p.ok) return alert('匯率' + p.err);
            if (p.s === cr.rate) return;
            writeRate(cur, p.s, decOf(cur), 'manual').then(() => toast('已更新匯率')).catch(fail);
        } else if (act === 'fx-apply') {
            const s = sugg(cur);
            if (!s) return;
            if (!confirm(`把 ${cur} 匯率${rt[cur] ? `從 ${rt[cur].rate} ` : ''}改成 ${s}？\n只影響之後新增的支出。`)) return;
            let dec = rt[cur] ? decOf(cur) : DEC_FIX[cur];
            if (dec === undefined) { try { dec = new Intl.NumberFormat('en', { style: 'currency', currency: cur }).resolvedOptions().maximumFractionDigits; } catch (e) { dec = 2; } }
            writeRate(cur, s, dec, 'api:' + S.fx.src).then(() => toast('已套用')).catch(fail);
        } else if (act === 'fx-del') {
            if (usedCurs().has(cur)) return alert('已經有支出使用這個幣別，不能刪除。');
            if (!confirm(`確定要刪除 ${cur} 嗎？`)) return;
            adminDb.ref('ledger/rates/' + cur).remove().catch(fail);
        }
    }

    // ---------- 換算計算器（輸入 1 種、輸出最多 3 種；打字＋清單選幣別；只存在本機）----------
    const ISO = (() => { try { return new Set(Intl.supportedValuesOf('currency')); } catch (e) { return null; } })();
    const CUR_NAMES = (() => { try { return new Intl.DisplayNames(['zh-TW'], { type: 'currency' }); } catch (e) { return null; } })();
    const curName = (c) => { try { const n = CUR_NAMES && CUR_NAMES.of(c); return n && n !== c ? n : ''; } catch (e) { return ''; } };
    const curLabel = (c) => { const n = curName(c); return n ? `${c} ${n}` : c; };
    function calcRate(cur) {
        if (cur === BASE) return { rate: '1', table: true };
        const t = R()[cur];
        if (t) return { rate: t.rate, table: true };
        const s = sugg(cur);
        return s ? { rate: s, table: false } : null;
    }
    function calcDec(cur) {
        if (cur === BASE || R()[cur] || cur in DEC_FIX) return decOf(cur);
        try { return new Intl.NumberFormat('en', { style: 'currency', currency: cur }).resolvedOptions().maximumFractionDigits; } catch (e) { return 2; }
    }
    function calcCurs() {
        const table = curs();
        const api = Object.keys((S.fx && S.fx.map) || {}).filter((c) => /^[A-Z]{3}$/.test(c) && !table.includes(c) && (!ISO || ISO.has(c)) && sugg(c)).sort();
        return [...table, ...api];
    }
    const isoCurs = () => (ISO ? [...ISO] : [...new Set([...curs(), ...Object.keys((S.fx && S.fx.map) || {}).filter((c) => /^[A-Z]{3}$/.test(c))])]).filter((c) => c !== BASE).sort();
    function resolveCur(text, all) {
        const t = String(text || '').trim();
        if (!t) return null;
        const m = t.match(/^([A-Za-z]{3})(\s|$)/);
        if (m && all.includes(m[1].toUpperCase())) return m[1].toUpperCase();
        const up = t.toUpperCase();
        const hit = all.filter((c) => c.includes(up) || curName(c).includes(t));
        return hit.length === 1 ? hit[0] : null;
    }
    function calcState() {
        if (!S.calc) {
            const c = cacheLoad('calc') || {};
            S.calc = { from: c.from || 'JPY', to: Array.isArray(c.to) && c.to.length ? c.to.slice(0, 3) : [BASE] };
        }
        return S.calc;
    }
    const calcSave = () => cacheSave('calc', { from: S.calc.from, to: S.calc.to });
    function buildCalc() {
        $('lg-fx-calc').innerHTML = `
            <p class="lg-h">🧮 換算計算器</p>
            <div class="lg-row"><input id="lg-c-amt" class="lg-in lg-amt" inputmode="none" readonly placeholder="輸入金額"><input id="lg-c-from" class="lg-in lg-cur" data-pick="c-from" readonly autocomplete="off" placeholder="幣別"></div>
            <div id="lg-c-res" class="lg-mt"></div>
            <p id="lg-c-msg" class="lg-muted lg-mt"></p>`;
    }
    function calcMsg(t) { $('lg-c-msg').textContent = t || (calcCurs().length > curs().length ? '點換算結果可改用該幣別輸入（數字不變）；選擇只存在這支手機。' : '抓取自動匯率後，也可以選匯率表以外的幣別（僅供參考）。'); }
    function renderCalc(force) {
        const st = calcState(), all = calcCurs();
        if (!all.includes(st.from)) st.from = all.find((c) => c !== BASE) || BASE;
        st.to = st.to.filter((c, i, a) => all.includes(c) && c !== st.from && a.indexOf(c) === i);
        if (!st.to.length && all.length > 1) st.to = [st.from === BASE ? all.find((c) => c !== BASE) : BASE];
        pickSet($('lg-c-from'), st.from);
        const sig = [st.from, ...st.to].join('|');
        const box = $('lg-c-res');
        if (force || sig !== S.calcSig || !box.querySelector('.lg-c-row') && st.to.length) {
            if (!(PK.el && box.contains(PK.el)) || force) {
                S.calcSig = sig;
                box.innerHTML = st.to.map((c, i) => `<div class="lg-c-row" data-i="${i}">
                    <button type="button" class="lg-c-val" data-act="calc-swap" data-i="${i}" title="點一下改用這個幣別輸入（數字不變）"><b></b><small></small></button>
                    <input class="lg-in lg-cur" data-pick="c-to" data-i="${i}" data-val="${esc(c)}" readonly autocomplete="off" value="${esc(curLabel(c))}">
                    ${st.to.length > 1 ? `<button type="button" class="lg-c-del" data-act="calc-del" data-i="${i}" aria-label="移除">✕</button>` : ''}
                </div>`).join('') +
                    (st.to.length < 3 ? `<input id="lg-c-add" class="lg-in lg-mt" data-pick="c-add" data-val="" readonly autocomplete="off" placeholder="＋ 加入換算幣別（點一下選擇，最多 3 種）">` : '');
            }
        }
        calcValues();
    }
    function calcValues() {
        const st = calcState(), fr = calcRate(st.from), fdec = calcDec(st.from);
        const raw = ($('lg-c-amt').value || '').trim(), a = C.parseAmount(raw, fdec);
        $('lg-c-res').querySelectorAll('.lg-c-row').forEach((row) => {
            const c = st.to[+row.dataset.i], r = c && calcRate(c);
            let val = '—', info = '沒有匯率';
            if (r && fr) {
                if (a.ok) val = C.formatAmount(C.convertCross(a.v, fdec, fr.rate, calcDec(c), r.rate), calcDec(c));
                info = `1 ${st.from} = ${cross(st.from, c)} ${c}${!r.table || !fr.table ? '（API 參考）' : ''}`;
            }
            row.querySelector('.lg-c-val b').textContent = val;
            row.querySelector('.lg-c-val small').textContent = info;
        });
        calcMsg(raw && !a.ok ? a.err : '');
    }
    function cross(from, to) {
        const a = calcRate(from), b = calcRate(to);
        const r = C.parseRate(C.toPlain(C.convertCross(1000000, 6, a.rate, 6, b.rate), 6));
        return r.ok ? r.s : '0';
    }
    function calcApply(kind, i, c) {
        const st = calcState();
        if (kind === 'c-from') {
            if (c !== st.from) { const j = st.to.indexOf(c); if (j >= 0) st.to[j] = st.from; st.from = c; }
        } else if (kind === 'c-add') {
            if (c === st.from || st.to.includes(c)) { renderCalc(true); calcMsg(`${c} 已經在計算器裡`); return; }
            st.to.push(c);
        } else {
            if (c === st.from) { renderCalc(true); calcMsg('跟輸入幣別相同'); return; }
            const j = st.to.indexOf(c);
            if (j >= 0 && j !== i) { renderCalc(true); calcMsg(`${c} 已經在結果裡`); return; }
            st.to[i] = c;
        }
        calcSave();
        renderCalc(true);
    }

    // ---------- 可打字的幣別選單：點一下列出全部，打字即時篩選，點選套用 ----------
    const PK = { el: null, q: '' };
    const pickLabel = (kind, v) => (v ? curLabel(v) : (kind === 'fl-cur' ? '全部幣別' : ''));
    function pickSet(el, v) {
        if (!el) return;
        el.dataset.val = v || '';
        if (PK.el !== el) el.value = pickLabel(el.dataset.pick, v);
    }
    function pickOpts(kind) {
        if (kind === 'c-from' || kind === 'c-to' || kind === 'c-add') {
            const t = curs();
            return calcCurs().map((v) => ({ v, g: t.includes(v) ? '匯率表' : 'API（參考）' }));
        }
        if (kind === 'iso') { const t = R(); return isoCurs().map((v) => ({ v, g: t[v] ? '已在匯率表' : '可新增' })).sort((a, b) => (a.g === b.g ? 0 : a.g === '可新增' ? 1 : -1)); }
        if (kind === 'fl-cur') return [{ v: '' }, ...[...new Set([...curs(), ...usedCurs()])].map((v) => ({ v }))];
        return curs().map((v) => ({ v }));
    }
    function pickBox() {
        let b = document.getElementById('lg-pick');
        if (b) return b;
        b = document.createElement('div');
        b.id = 'lg-pick';
        b.className = 'lg-pick hidden';
        b.innerHTML = `<div class="lg-pick-back" data-close></div>
            <div class="lg-pick-sheet">
                <div class="lg-pick-top"><input id="lg-pick-q" class="lg-in" autocomplete="off" placeholder="輸入代碼或名稱搜尋，例：JPY、日圓"><button type="button" class="lg-pick-x" data-close>✕</button></div>
                <div id="lg-pick-list" class="lg-pick-list"></div>
            </div>`;
        b.addEventListener('pointerdown', (e) => { if (e.target.closest('[data-close],[data-v]')) e.preventDefault(); });
        b.addEventListener('click', (e) => {
            if (e.target.closest('[data-close]')) return pickClose();
            const o = e.target.closest('[data-v]');
            if (o) pickChoose(o.dataset.v);
        });
        const q = b.querySelector('#lg-pick-q');
        q.addEventListener('input', () => { PK.q = q.value; pickList(); });
        q.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); const m = pickMatches(); if (m.length) pickChoose(m[0].v); }
            else if (e.key === 'Escape') pickClose();
        });
        document.body.appendChild(b);
        return b;
    }
    function pickMatches() {
        const q = PK.q.trim(), up = q.toUpperCase();
        return pickOpts(PK.el.dataset.pick).filter((o) => !q || (o.v ? o.v.includes(up) || curName(o.v).includes(q) : '全部幣別'.includes(q)));
    }
    function pickList() {
        const el = PK.el, box = document.getElementById('lg-pick-list');
        if (!el || !box) return;
        const list = pickMatches(), cur = el.dataset.val || '';
        let g = null;
        box.innerHTML = list.length ? list.map((o) => {
            const head = o.g && o.g !== g ? `<p class="lg-pick-g">${esc((g = o.g))}</p>` : '';
            return `${head}<button type="button" data-v="${esc(o.v)}" class="${o.v === cur ? 'on' : ''}"><b>${esc(o.v || '全部幣別')}</b><span>${esc(o.v ? curName(o.v) : '')}</span></button>`;
        }).join('') : '<p class="lg-pick-none">找不到符合的幣別</p>';
    }
    function pickOpen(el) {
        PK.el = el; PK.q = '';
        const b = pickBox(), q = document.getElementById('lg-pick-q');
        q.value = '';
        pickList();
        b.classList.remove('hidden');
        setTimeout(() => q.focus(), 30);
    }
    function pickClose() {
        const el = PK.el;
        PK.el = null; PK.q = '';
        const b = document.getElementById('lg-pick');
        if (b) b.classList.add('hidden');
        if (el && el.isConnected) { if (!(el.dataset.pick === 'iso' && !el.dataset.val)) el.value = pickLabel(el.dataset.pick, el.dataset.val); el.blur(); }
    }
    function pickChoose(v) {
        const el = PK.el;
        if (!el) return;
        const kind = el.dataset.pick, i = +el.dataset.i;
        el.dataset.val = v;
        pickClose();
        if (kind === 'iso') return;
        if (kind === 'f-cur') { if (S.form.cur !== v) { S.form.cur = v; if (S.editId) S.form.rate = null; } refreshForm(); }
        else if (kind === 'st-cur') { S.stCur = v; renderSettle(); }
        else if (kind === 'fl-cur') { S.filter.cur = v; renderItems(); }
        else calcApply(kind, i, v);
    }

    // ---------- 自製小算盤（整數分數運算，支援 + − × ÷）----------
    const PAD = { el: null, dec: 0, expr: '' };
    function padDec(el) {
        if (el.id === 'lg-f-amount') return decOf(S.form.cur);
        if (el.dataset.part != null) return S.form.mode === 'ratio' ? 2 : decOf(S.form.cur);
        if (el.id === 'lg-c-amt') return calcDec(calcState().from);
        return 2;
    }
    function padBox() {
        let b = document.getElementById('lg-pad');
        if (b) return b;
        b = document.createElement('div');
        b.id = 'lg-pad';
        b.className = 'lg-pad hidden';
        const KEYS = [['C', 'fn'], ['back', 'fn'], ['/', 'op'], ['*', 'op'], ['7', ''], ['8', ''], ['9', ''], ['-', 'op'], ['4', ''], ['5', ''], ['6', ''], ['+', 'op'], ['1', ''], ['2', ''], ['3', ''], ['=', 'op'], ['0', 'wide'], ['.', ''], ['ok', 'ok']];
        const LBL = { back: '⌫', '/': '÷', '*': '×', '-': '−', '+': '＋', ok: '確認' };
        b.innerHTML = `<div class="lg-pad-back" data-close></div>
            <div class="lg-pad-sheet">
                <div class="lg-pad-disp"><div id="lg-pad-expr" class="lg-pad-expr"></div><div id="lg-pad-res" class="lg-pad-res"></div></div>
                <div class="lg-pad-grid">${KEYS.map(([k, c]) => `<button type="button" class="${c}" data-pk="${esc(k)}">${esc(LBL[k] || k)}</button>`).join('')}</div>
            </div>`;
        b.addEventListener('pointerdown', (e) => e.preventDefault());
        b.addEventListener('click', (e) => { const t = e.target.closest('[data-pk]'); if (t) padKey(t.dataset.pk); else if (e.target.closest('[data-close]')) padClose(); });
        document.body.appendChild(b);
        return b;
    }
    function padDraw() {
        $('lg-pad-expr').textContent = PAD.expr || '0';
        const el = $('lg-pad-res');
        if (!PAD.expr) { el.textContent = ''; el.className = 'lg-pad-res'; return; }
        const r = C.evalCalc(PAD.expr, PAD.dec);
        if (r.ok) { el.textContent = '= ' + C.formatAmount(r.v, PAD.dec); el.className = 'lg-pad-res'; }
        else { el.textContent = r.err || '…'; el.className = 'lg-pad-res err'; }
    }
    function padOpen(el) {
        PAD.el = el; PAD.dec = padDec(el);
        const v = String(el.value || '').replace(/[,\s]/g, '');
        PAD.expr = /^[\d.]+$/.test(v) ? v : '';
        padBox().classList.remove('hidden');
        padDraw();
    }
    function padClose() {
        PAD.el = null;
        const b = document.getElementById('lg-pad');
        if (b) b.classList.add('hidden');
    }
    function padKey(k) {
        if (!PAD.el) return;
        if (k === 'C') PAD.expr = '';
        else if (k === 'back') PAD.expr = PAD.expr.slice(0, -1);
        else if (k === '=') { const r = C.evalCalc(PAD.expr, PAD.dec); if (r.ok) PAD.expr = C.toPlain(r.v, PAD.dec); }
        else if (k === 'ok') return padCommit();
        else if ('+-*/'.includes(k)) { if (PAD.expr && !/[+\-*/]$/.test(PAD.expr)) PAD.expr += k; else if (PAD.expr) PAD.expr = PAD.expr.slice(0, -1) + k; }
        else if (k === '.') { const seg = PAD.expr.split(/[+\-*/]/).pop(); if (!seg.includes('.')) PAD.expr += /\d$/.test(PAD.expr) ? '.' : '0.'; }
        else PAD.expr += k;
        padDraw();
    }
    function padCommit() {
        const r = C.evalCalc(PAD.expr, PAD.dec);
        if (!r.ok) return toast(r.err || '算式錯誤');
        if (!(r.v > 0)) return toast('結果必須大於零');
        const el = PAD.el;
        el.value = C.toPlain(r.v, PAD.dec);
        padClose();
        el.dispatchEvent(new Event('input', { bubbles: true }));
    }

    document.addEventListener('focusin', (e) => {
        const t = e.target;
        if (!t || !t.matches) return;
        if (t.matches('input[data-pick]')) { if (PK.el !== t) pickOpen(t); return; }
        if (t.id === 'lg-f-amount' || t.id === 'lg-c-amt' || (t.dataset && t.dataset.part != null)) { if (PAD.el !== t) { t.blur(); padOpen(t); } }
    });
    document.addEventListener('keydown', (e) => {
        if (!PAD.el) return;
        const k = e.key;
        if (/^[0-9.]$/.test(k)) padKey(k);
        else if ('+-*/'.includes(k)) padKey(k);
        else if (k === 'Enter') padKey('ok');
        else if (k === '=') padKey('=');
        else if (k === 'Backspace') padKey('back');
        else if (k === 'Escape') padClose();
        else return;
        e.preventDefault();
    });

    function calcAct(act, i) {
        const st = calcState();
        if (act === 'calc-del') st.to.splice(i, 1);
        else if (act === 'calc-swap') {
            const c = st.to[i];
            if (!c) return;
            st.to[i] = st.from;
            st.from = c;
        }
        calcSave();
        renderCalc(true);
    }

    // ---------- 事件 ----------
    function bindEvents() {
        const root = $('ledger-root');
        root.addEventListener('click', (ev) => {
            const b = ev.target.closest('[data-act]');
            if (!b || !root.contains(b) || b.disabled) return;
            const act = b.dataset.act, v = b.dataset.v, id = b.dataset.id, f = S.form;
            if (act === 'tab') { const d = TABS.indexOf(v) - TABS.indexOf(S.tab); setTab(v, d); }
            else if (act === 'sub') setSub(v);
            else if (act === 'retry') { S.key = ''; S.err = null; bind(); render(); }
            else if (act === 'roster') { S.rosterOpen = !S.rosterOpen; renderRoster(); }
            else if (act.startsWith('p-')) rosterAct(act, id);
            else if (act === 'mem') {
                const set = new Set(f.members);
                if (set.has(id)) { set.delete(id); delete f.parts[id]; } else set.add(id);
                f.members = order().filter((p) => set.has(p));
                refreshForm();
            } else if (act === 'all') {
                const act2 = activeIds(), allOn = act2.every((p) => f.members.includes(p));
                f.members = allOn ? [] : act2;
                f.parts = {};
                refreshForm();
            } else if (act === 'mode') { if (f.mode !== v) { f.mode = v; f.parts = {}; refreshForm(); } }
            else if (act === 'cat') { f.cat = v; refreshForm(); }
            else if (act === 'cat-add') addCat();
            else if (act === 'cat-del') delCat(f.cat);
            else if (act === 'cat-edit') editCats();
            else if (act === 'calc-swap' || act === 'calc-del') calcAct(act, +b.dataset.i);
            else if (act === 'st-mode') { S.stMode = v; renderSettle(); }
            else if (act === 'fold') { S.fold[v] = !S.fold[v]; renderSettle(); }
            else if (act === 'fill') fillParts();
            else if (act === 'rate-table') { f.rate = null; renderRate(); renderPreview(); }
            else if (act === 'rate-custom') { const t = R()[f.cur]; f.rate = t ? t.rate : ''; renderRate(); renderPreview(); }
            else if (act === 'save') saveExpense();
            else if (act === 'cancel-edit') cancelEdit();
            else if (act === 'exp-open') { S.open = S.open === id ? null : id; renderItems(); }
            else if (act === 'fold-all') {
                const ds = [...new Set(filtered().map(([, e]) => e.date || '（無日期）'))], shut = !ds.every((d) => S.listShut[d]);
                ds.forEach((d) => { if (shut) S.listShut[d] = true; else delete S.listShut[d]; });
                saveFold(); renderItems();
            }
            else if (act === 'grp') { const d = b.dataset.d; if (S.listShut[d]) delete S.listShut[d]; else S.listShut[d] = true; saveFold(); renderItems(); }
            else if (act === 'fl-open') flOpen(v);
            else if (act === 'exp-pay') { const e = E()[id], p = b.dataset.p; if (e && e.shares && e.shares[p]) markPaid(p, e.payer, e.shares[p].b, id); }
            else if (act === 'exp-edit') startEdit(id);
            else if (act === 'exp-del') delExpense(id);
            else if (act === 'export') exportCsv();
            else if (act === 'fl-clear') { S.filter = { sort: S.filter.sort, cat: '', payer: '', members: [], cur: '', q: '' }; $('lg-q').value = ''; renderFilterOpts(); renderItems(); }
            else if (act === 'st-pay') markPaid(b.dataset.from, b.dataset.to, +b.dataset.amt);
            else if (act === 'tr-done') setTransfer(id, 'done');
            else if (act === 'tr-void') setTransfer(id, 'void');
            else if (act === 'void-toggle') { S.showVoid = !S.showVoid; renderSettle(); }
            else if (act === 'fx-fetch') fetchFx(false);
            else if (act.startsWith('fx-')) fxAct(act, v);
        });
        root.addEventListener('input', (ev) => {
            const el = ev.target, f = S.form;
            if (el.id === 'lg-c-amt') return calcValues();
            if (el.dataset.pick) return;
            if (!f) return;
            const map = { 'lg-f-title': 'title', 'lg-f-amount': 'amount', 'lg-f-note': 'note', 'lg-f-date': 'date' };
            if (map[el.id]) { f[map[el.id]] = el.value; renderPreview(); }
            else if (el.dataset.part) { f.parts[el.dataset.part] = el.value; renderPreview(); }
            else if (el.id === 'lg-f-rate-in') { f.rate = el.value.trim(); renderPreview(); }
            else if (el.id === 'lg-q') { S.filter.q = el.value; renderItems(); }
        });
        root.addEventListener('change', (ev) => {
            const el = ev.target, f = S.form;
            if (el.dataset.pick) return;
            if (el.id === 'lg-f-payer' && f) { f.payer = el.value; renderPreview(); }
            else if (el.id === 'lg-f-date' && f) { f.date = el.value; renderPreview(); }
            else if (el.dataset.f) { S.filter[el.dataset.f] = el.value; renderItems(); }
            else if (el.id === 'lg-st-day') { S.stDay = el.value; renderSettle(); }
        });
        const panels = $('lg-panels');
        let sx = 0, sy = 0, ok = false;
        panels.addEventListener('touchstart', (e) => {
            ok = e.touches.length === 1 && !e.target.closest('input,select,textarea,.lg-noswipe');
            if (ok) { sx = e.touches[0].clientX; sy = e.touches[0].clientY; }
        }, { passive: true });
        panels.addEventListener('touchend', (e) => {
            if (!ok) return;
            ok = false;
            const dx = e.changedTouches[0].clientX - sx, dy = e.changedTouches[0].clientY - sy;
            if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 2) return;
            const dir = dx < 0 ? 1 : -1, next = TABS[TABS.indexOf(S.tab) + dir];
            if (next) setTab(next, dir);
        }, { passive: true });
    }

    window.LEDGER = {
        open() { build(); bind(); render(); if (S.tab === 'fx') setTab('fx'); },
        onAuth() { bind(); render(); }
    };
})();
