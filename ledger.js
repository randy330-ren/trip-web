(function () {
    'use strict';
    const C = window.LedgerCore;
    const VER = '25';
    const BASE = 'TWD', BASE_DEC = 0;
    const CATS = ['餐飲', '交通', '住宿', '門票', '購物', '其他'];
    const DEC_FIX = { TWD: 0, JPY: 0, KRW: 0 };
    const MODES = [['equal', '平均'], ['amount', '自訂金額'], ['ratio', '按比例'], ['each', '每人同額']];
    const TABS = ['add', 'list', 'fx'];
    const up = (m) => Object.fromEntries(Object.entries(m || {}).map(([k, v]) => [k.toUpperCase(), v]));
    const FX_SRC = [
        ['fawazahmed0', 'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/twd.min.json', (j) => ({ date: j.date, map: up(j.twd) })],
        ['fawazahmed0', 'https://latest.currency-api.pages.dev/v1/currencies/twd.min.json', (j) => ({ date: j.date, map: up(j.twd) })],
        ['ExchangeRate-API', 'https://open.er-api.com/v6/latest/TWD', (j) => ({ date: j.time_last_update_unix ? new Date(j.time_last_update_unix * 1000).toISOString().slice(0, 10) : '', map: j.rates })]
    ];

    const S = {
        tab: 'add', sub: 'list', data: null, err: null, ref: null, cb: null, key: '', built: false,
        form: null, editId: null, editOrig: null, editSig: '', partsSig: null, rateSig: null, saving: false,
        rosterOpen: false, open: null, showVoid: false, showDel: false,
        stMode: 'all', stBal: 'all', stSug: 'all', stDays: [], stCats: [], stPays: [], stCur: 'JPY', pdata: null, pref: null, pcb: null, fold: { bal: false, sug: false, tr: false },
        listShut: (cacheLoad('ledger_fold') || {}).days || {}, fs: null,
        stOpen: {}, filter: { scope: 'group', sort: 'desc', dates: [], cats: [], pays: [], payer: '', members: [], cur: '', q: '' },
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
    const PE = () => S.pdata || {};
    const isP = (id) => !E()[id] && !!PE()[id];
    const XE = (id) => E()[id] || PE()[id];
    const xref = (personal) => wdb().ref(personal ? 'ledger_personal/' + currentUserUid + '/expenses' : 'ledger/expenses');
    const T = () => D().transfers || {};
    // 每位成員各自的「平衡時間點」：依時間累計他的淨額，最後一次歸零（且至少有一筆轉帳）的時刻
    function cpMap() {
        const U = unitOpts(), ev = {}, out = {};
        const add = (p, t, d, k) => { if (p) (ev[p] || (ev[p] = [])).push([t, d, k]); };
        Object.values(E()).forEach((e) => {
            if (!e || !e.shares || !Number.isInteger(e.baseAmt)) return;
            const v = C.unitView(e, U), t = e.ts || 0;
            add(e.payer, t, v.total, 0);
            Object.entries(v.sh).forEach(([p, n]) => add(p, t, -n, 0));
        });
        Object.values(T()).forEach((t) => {
            if (!t || (t.status !== 'paid' && t.status !== 'done') || !Number.isInteger(t.amt)) return;
            const a = C.transferAmount(t, U);
            if (!Number.isInteger(a)) return;
            add(t.from, t.paidTs || 0, a, 1);
            add(t.to, t.paidTs || 0, -a, 1);
        });
        Object.entries(ev).forEach(([p, l]) => {
            l.sort((x, y) => x[0] - y[0] || x[2] - y[2]);
            let net = 0, tr = false, cp = 0;
            l.forEach(([t, d, k]) => { net += d; if (k) tr = true; if (tr && net === 0) cp = t; });
            if (cp) out[p] = cp;
        });
        return out;
    }
    const settledExp = (e, cps) => !!e && [e.payer, ...Object.keys(e.shares || {})].some((p) => p && cps[p] !== undefined && (e.ts || 0) <= cps[p]);
    const sameShares = (a, b) => { const x = a || {}, y = b || {}, k = Object.keys(x); return k.length === Object.keys(y).length && k.every((q) => y[q] && x[q].o === y[q].o && x[q].b === y[q].b); };
    const SETTLED_MSG = '這筆支出相關的成員已經結清（淨額歸零），不能修改金額、幣別、付款人、分攤成員或分帳方式，也不能刪除。';
    const R = () => D().rates || {};
    const order = () => Object.keys(P()).sort();
    const activeIds = () => order().filter((id) => P()[id].active !== false);
    const pname = (id) => id === 'me' ? '自己' : (P()[id] && P()[id].name) || '（已刪除）';
    const curs = () => [BASE, ...Object.keys(R()).filter((c) => c !== BASE).sort()];
    const customCats = () => Object.entries(D().cats || {}).filter(([, c]) => c && c.name).sort(([a, x], [b, y]) => ((x.ts || 0) - (y.ts || 0)) || (a < b ? -1 : 1));
    const cats = () => [...new Set([...CATS, ...customCats().map(([, c]) => c.name)])];
    const catEntry = (name) => customCats().find(([, c]) => c.name === name);
    const catUses = (name) => Object.values(E()).concat(Object.values(PE())).filter((e) => e.cat === name).length;
    const canDelCat = (name) => !!catEntry(name) && signed() && !catUses(name);
    function decOf(cur) {
        if (cur === BASE) return BASE_DEC;
        const r = R()[cur];
        if (r && Number.isInteger(r.dec)) return r.dec;
        return cur in DEC_FIX ? DEC_FIX[cur] : 2;
    }
    const money = (v, cur) => `${C.formatAmount(v, decOf(cur))} ${cur}`;
    // 清帳以日圓為單位（有日圓匯率時）；沒有就退回以基準幣別（台幣）
    const unitOpts = () => { const r = R().JPY, p = r && C.parseRate(r.rate); return p && p.ok ? { cur: 'JPY', dec: decOf('JPY'), rate: p.s, baseDec: BASE_DEC } : null; };
    const unitCur = () => (unitOpts() ? 'JPY' : BASE);
    // 清帳方案鎖定中（還沒全部轉完）：團體支出不能新增、修改、刪除、還原，也不能先轉帳
    let lockMemo = { d: null, v: false };
    const LOCK_MSG = '清帳方案已鎖定，需管理員解除鎖定後才能新增或修改團體支出。';
    function planLocked() {
        if (lockMemo.d !== S.data) { const ps = C.planState(order(), E(), T(), D().plan, unitOpts()); lockMemo = { d: S.data, v: !!ps && !ps.done }; }
        return lockMemo.v;
    }
    const myPid = () => (myUid() ? order().find((p) => P()[p].uid === myUid()) : undefined);
    const today = () => { const t = getToday(); return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`; };
    const when = (ts) => { if (!ts) return ''; const d = new Date(ts); return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
    const srcLabel = (s) => (!s ? '' : s === 'manual' ? '手動' : String(s).startsWith('api:') ? `API（${String(s).slice(4)}）` : s);
    const selOpts = (list, val) => list.map(([v, l]) => `<option value="${esc(v)}" ${v === val ? 'selected' : ''}>${esc(l)}</option>`).join('');
    function usedPeople() {
        const u = new Set();
        Object.values(E()).forEach((e) => { u.add(e.payer); Object.keys(e.shares || {}).forEach((p) => u.add(p)); });
        Object.values(T()).forEach((t) => { u.add(t.from); u.add(t.to); });
        Object.values(D().deleted || {}).forEach((e) => { if (e) { u.add(e.payer); Object.keys(e.shares || {}).forEach((p) => u.add(p)); } });
        return u;
    }
    const usedCurs = () => new Set(Object.values(E()).concat(Object.values(PE())).map((e) => e.cur));
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
        if (S.pref) S.pref.off('value', S.pcb);
        S.ref = S.pref = null; S.key = key; S.err = null;
        S.data = key ? cacheLoad('ledger_' + key) : null;
        S.pdata = key ? cacheLoad('ledgerp_' + key) : null;
        if (!key) return;
        S.pref = (memberUser ? db : adminDb).ref('ledger_personal/' + currentUserUid + '/expenses');
        S.pcb = S.pref.on('value', (snap) => {
            S.pdata = snap.val() || {};
            cacheSave('ledgerp_' + key, S.pdata);
            render();
        }, (e) => console.warn('個人記帳讀取失敗（請確認 Firebase Rules 已加入 ledger_personal）', e));
        S.ref = (memberUser ? db : adminDb).ref('ledger');
        S.cb = S.ref.on('value', (snap) => {
            S.data = snap.val() || {};
            S.err = null;
            cacheSave('ledger_' + key, S.data);
            render();
            migrateTails();
        }, (e) => {
            S.err = e && e.code === 'PERMISSION_DENIED' ? '沒有讀取權限，請確認 Firebase Rules 已更新。' : ((e && e.message) || '讀取失敗');
            S.key = '';
            render();
        });
    }

    // 一次性：舊支出的平均分攤尾數依建立順序重算（旗標與資料同一筆寫入，舊值備份在 sharesBak）
    function migrateTails() {
        const d = D();
        if (S.migrated || !signed() || !d.expenses || (d.migr && d.migr.tails1)) return;
        S.migrated = true;
        const r = C.rebalanceTails(d.expenses, order(), BASE_DEC);
        if (!r.ok) return console.warn('尾數重算中止', r.err);
        const m = me(), up = { 'migr/tails1': { n: Object.keys(r.changes).length, by: m.uid, ts: TS() } };
        Object.entries(r.changes).forEach(([id, c]) => { up[`expenses/${id}/shares`] = c.shares; up[`expenses/${id}/sharesBak`] = c.old; });
        wdb().ref('ledger').update(up).catch((e) => console.warn('尾數重算失敗', e));
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
                    <div id="lg-s-list" class="lg-stack"><div class="card lg-card" id="lg-filters"></div><div id="lg-items" class="lg-stack sm"></div><div id="lg-del"></div></div>
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
        renderDeleted();
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
    const PAYS = [['cash', '現金'], ['card', '信用卡']];
    const payL = (k) => (PAYS.find(([x]) => x === k) || [, ''])[1];
    function blankForm(keep) {
        const k = keep || {};
        return {
            title: '', amount: '', note: '', parts: {}, rate: null, rf: null, dtId: null,
            cur: k.cur || (curs().includes('JPY') ? 'JPY' : BASE), date: k.date || today(), pay: '',
            scope: k.scope || 'group', payer: k.payer || '', members: k.members ? k.members.slice() : [], mode: k.mode || 'equal', cat: k.cat || '餐飲'
        };
    }
    function buildForm() {
        $('lg-form').innerHTML = `
            <div id="lg-f-scope" class="lg-seg sm lg-mt"></div>
            <div id="lg-f-lock" class="lg-warn hidden"></div>
            <div id="lg-f-banner" class="lg-banner hidden">✏️ 正在編輯：<b id="lg-f-etitle"></b><button type="button" data-act="cancel-edit">取消編輯</button></div>
            <div class="lg-lblrow"><label class="lg-lbl" for="lg-f-title">支出名稱</label><button type="button" id="lg-f-clear" class="lg-clr hidden" data-act="clear-form">取消新增</button></div>
            <input id="lg-f-title" class="lg-in" maxlength="50" placeholder="例：午餐 迴轉壽司">
            <label id="lg-f-amount-l" class="lg-lbl" for="lg-f-amount">金額</label>
            <div class="lg-row"><input id="lg-f-amount" class="lg-in lg-amt" inputmode="none" readonly placeholder="0"><input id="lg-f-cur" class="lg-in lg-cur" data-pick="f-cur" readonly autocomplete="off"></div>
            <div class="lg-dp"><div><label class="lg-lbl" for="lg-f-date">日期</label><input id="lg-f-date" type="date" class="lg-in"></div>
            <div><label class="lg-lbl">支付方式</label><div id="lg-f-pay" class="lg-seg sm"></div></div></div>
            <div id="lg-f-grp">
            <label class="lg-lbl" for="lg-f-payer">付款人</label>
            <select id="lg-f-payer" class="lg-in"></select>
            <label class="lg-lbl">分帳方式</label>
            <div id="lg-f-mode" class="lg-seg sm"></div>
            <label class="lg-lbl">分攤成員（可多選）</label>
            <div id="lg-f-members" class="lg-chips"></div>
            <div id="lg-f-parts"></div>
            </div>
            <label class="lg-lbl">類別</label>
            <div id="lg-f-cats" class="lg-chips"></div>
            <label class="lg-lbl" for="lg-f-note">備註</label>
            <textarea id="lg-f-note" class="lg-in" maxlength="3000" rows="3" placeholder="選填"></textarea>
            <div id="lg-f-rate"></div>
            <div id="lg-f-preview" class="lg-preview"></div>
            <button type="button" id="lg-f-save" class="lg-btn wide" data-act="save">儲存支出</button>
            <div id="lg-f-dtbox"><div id="lg-f-pend"></div><button type="button" class="lg-btn wide ld-open" data-act="detail">🧾 明細分帳</button></div>
            <div id="lg-f-pbox"><div id="lg-f-ppend"></div><button type="button" class="lg-btn wide ld-open" data-act="rcpt-open">🧾 匯入收據（逐品項）</button></div>`;
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
        const lk = planLocked() && f.scope !== 'personal', lb = $('lg-f-lock');
        lb.classList.toggle('hidden', !lk);
        lb.innerHTML = lk ? `🔒 ${LOCK_MSG}${isEditor ? '<button type="button" class="lg-link" data-act="plan-unlock">解除鎖定</button>' : ''}` : '';
        $('lg-f-banner').classList.toggle('hidden', !S.editId);
        if (S.editId) $('lg-f-etitle').textContent = f.title || (XE(S.editId) || {}).title || '';
        $('lg-f-scope').classList.toggle('hidden', !!S.editId);
        $('lg-f-scope').innerHTML = [['group', '團體記帳'], ['personal', '個人記帳']].map(([k, l]) => `<button type="button" data-act="scope" data-v="${k}" class="${f.scope === k ? 'on' : ''}">${l}</button>`).join('');
        $('lg-f-pay').innerHTML = PAYS.map(([k, l]) => `<button type="button" data-act="pay" data-v="${k}" class="${f.pay === k ? 'on' : ''}">${l}</button>`).join('');
        $('lg-f-grp').classList.toggle('hidden', f.scope === 'personal');
        $('lg-f-dtbox').classList.toggle('hidden', f.scope === 'personal');
        $('lg-f-pbox').classList.toggle('hidden', f.scope !== 'personal');
        renderPending();
        pickSet($('lg-f-cur'), f.cur);
        const auto = f.mode === 'amount' && f.scope !== 'personal';
        $('lg-f-amount-l').textContent = f.mode === 'each' ? '每人金額' : auto ? '總額（自動加總）' : '金額';
        $('lg-f-amount').classList.toggle('lg-auto', auto);
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
        if (f.mode === 'each') { box.innerHTML = `<p class="lg-muted lg-mt">每位成員各分攤上方「每人金額」，總額 = 每人金額 × ${f.members.length} 人。付款人也勾選即代表自己也要出。</p>`; return; }
        const unit = f.mode === 'ratio' ? '%' : f.cur;
        box.innerHTML = `<div class="lg-parts">` + f.members.map((p) =>
            `<div class="lg-part"><span>${esc(pname(p))}</span><input class="lg-in" inputmode="none" readonly data-part="${p}" value="${esc(f.parts[p] || '')}" placeholder="0"><small>${esc(unit)}</small></div>`).join('') +
            `</div>` + (f.mode === 'ratio' ? `<button type="button" class="lg-link" data-act="fill">平均填入比例</button>` : `<p class="lg-muted lg-mt">各成員金額加總即為總額，不用另外輸入。</p>`);
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
        const f = S.form, errs = [], dec = decOf(f.cur), pe = f.scope === 'personal';
        const members = pe ? ['me'] : f.members, mode = pe ? 'equal' : f.mode;
        if (!pe && planLocked()) errs.push('清帳方案已鎖定，暫時不能儲存團體支出');
        if (!f.title.trim()) errs.push('請輸入支出名稱');
        const each = mode === 'each';
        let amt;
        if (mode === 'amount') {
            const vals = members.map((p) => C.parseAmount(String(f.parts[p] ?? '').trim() || '0', dec));
            const bad = vals.findIndex((v) => !v.ok);
            amt = bad >= 0 ? { ok: false, err: '' } : { ok: true, v: vals.reduce((t, v) => t + v.v, 0) };
            if (bad >= 0) errs.push(`${pname(members[bad])} 的金額：${vals[bad].err}`);
            else if (members.length && amt.v <= 0) errs.push('分攤金額加總必須大於零');
        } else {
            amt = C.parseAmount(f.amount, dec);
            if (!amt.ok) errs.push((each ? '每人金額：' : '金額：') + amt.err);
            else if (amt.v <= 0) errs.push(each ? '每人金額必須大於零' : '支出金額必須大於零');
        }
        if (each && amt.ok) amt.v *= members.length;
        const ri = rateInfo(), r = C.parseRate(ri.rate);
        if (!ri.rate) errs.push(`匯率表沒有 ${f.cur}，請管理員先新增`);
        else if (!r.ok) errs.push('匯率' + r.err);
        if (!pe && (!f.payer || !P()[f.payer])) errs.push('請選擇付款人');
        if (!/^\d{4}-\d{2}-\d{2}$/.test(f.date)) errs.push('請選擇日期');
        if (!f.pay && (!S.editId || (S.editOrig && S.editOrig.pay))) errs.push('請選擇支付方式（現金或信用卡）');
        const seed = pe ? 0 : S.editId ? ((S.editOrig && S.editOrig.seed) | 0) : Object.keys(E()).length;
        const tb = pe ? {} : C.tailBias(E(), S.editId || undefined);
        let sp = null;
        if (amt.ok && amt.v > 0 && r.ok) {
            sp = C.computeSplit({ amount: amt.v, dec, mode: each ? 'amount' : mode, members, parts: each ? Object.fromEntries(members.map((p) => [p, f.amount])) : f.parts, rate: r.s, baseDec: BASE_DEC, seed, bias: members.map((p) => tb[p] || 0) });
            errs.push(...sp.errors);
        } else if (!members.length) errs.push('請至少選擇一位分攤成員');
        const o = S.editOrig;
        if (S.editId && o && !pe && sp && settledExp(o, cpMap()) && (amt.v !== o.amount || f.cur !== o.cur || r.s !== o.rate || f.payer !== o.payer || !sameShares(sp.shares, o.shares))) errs.push(SETTLED_MSG);
        return { errs, amt, dec, rate: r.ok ? r.s : '', sp, seed, members, pe };
    }
    function renderPreview() {
        const f = S.form, c = computeForm();
        if (f.mode === 'amount' && f.scope !== 'personal') {
            if (c.amt.ok && c.amt.v > 0) f.amount = C.toPlain(c.amt.v, c.dec);
            $('lg-f-amount').value = c.amt.ok && c.amt.v > 0 ? f.amount : '';
        }
        const btn = $('lg-f-save');
        btn.disabled = !!c.errs.length || S.saving;
        btn.textContent = S.saving ? '儲存中...' : (S.editId ? '儲存修改' : c.pe ? '儲存個人支出' : '儲存支出');
        $('lg-f-clear').classList.toggle('hidden', !!S.editId || !(f.title || f.amount || f.note || f.members.length || Object.keys(f.parts).length));
        let h = '';
        if (c.sp && c.sp.ok) {
            const fx = f.cur !== BASE;
            h += `<p class="lg-pv-h">${c.pe ? '個人支出預覽（只有你看得到）' : '分攤預覽'}</p><div class="lg-pv-row b"><span>總額</span><span>${money(c.amt.v, f.cur)}${fx ? `<small>≈ ${money(c.sp.baseAmt, BASE)}</small>` : ''}</span></div>`;
            if (fx) h += `<p class="lg-muted">使用匯率：1 ${esc(f.cur)} = ${esc(c.rate)} ${BASE}</p>`;
            h += c.members.map((p) => {
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
        if (S.editId && !XE(S.editId)) { alert('這筆支出已經被刪除了。'); cancelEdit(); return; }
        const rateRef = f.cur === BASE ? 'base'
            : (o && o.cur === f.cur && o.rate === c.rate) ? (o.rateRef || 'manual')
            : (t && t.rate === c.rate) ? `table:${f.cur}@${t.ts || 0}` : 'manual';
        const rec = {
            title: f.title.trim(), amount: c.amt.v, cur: f.cur, dec: c.dec, rate: c.rate, rateRef,
            base: BASE, baseAmt: c.sp.baseAmt, date: f.date, pay: f.pay || null, payer: c.pe ? 'me' : f.payer, mode: c.pe ? 'equal' : f.mode,
            unit: !c.pe && f.mode === 'each' ? f.amount.trim() : null,
            parts: c.pe || f.mode === 'equal' || f.mode === 'each' ? null : Object.fromEntries(f.members.map((p) => [p, String(f.parts[p] || '0').trim()])),
            rf: !c.pe && f.mode === 'amount' && f.rf ? Object.fromEntries(Object.entries(f.rf).filter(([p, v]) => f.members.includes(p) && v > 0)) : null,
            shares: c.sp.shares, seed: c.seed, cat: f.cat, note: f.note.trim(), updBy: m.uid, updName: m.name, uts: TS()
        };
        S.saving = true;
        renderPreview();
        const editing = S.editId;
        const job = editing
            ? xref(c.pe).child(editing).update(rec)
            : xref(c.pe).push({ ...rec, by: m.uid, byName: m.name, ts: TS() });
        try {
            await job;
            if (f.dtId && window.LedgerDetail) LedgerDetail.remove(f.dtId);
            toast(editing ? '已儲存修改' : c.pe ? '已新增個人支出' : '已新增支出');
            if (editing) { cancelEdit(); S.filter.scope = c.pe ? 'personal' : 'group'; renderFilterOpts(); setTab('list'); setSub('list'); S.open = editing; renderItems(); }
            else { S.form = blankForm(f); writeForm(); }
        } catch (e) { fail(e); }
        S.saving = false;
        renderPreview();
    }
    function startEdit(id) {
        const e = XE(id), pe = isP(id);
        if (!e) return;
        if (!pe && planLocked()) return alert(LOCK_MSG);
        if (editDirty() && !confirm('目前編輯中的支出有尚未儲存的修改，確定要放棄並改編輯這一筆嗎？')) return;
        S.editId = id;
        S.editOrig = e;
        S.form = {
            title: e.title || '', amount: e.mode === 'each' && e.unit ? e.unit : C.toPlain(e.amount, Number.isInteger(e.dec) ? e.dec : decOf(e.cur)), cur: e.cur, date: e.date || today(), pay: e.pay || '',
            scope: pe ? 'personal' : 'group', payer: pe ? '' : e.payer, members: pe ? [] : order().filter((p) => e.shares && e.shares[p]), mode: e.mode || 'equal',
            parts: { ...(e.parts || {}) }, cat: e.cat || '其他', note: e.note || '', rate: e.cur === BASE ? null : e.rate, rf: e.rf ? { ...e.rf } : null
        };
        writeForm();
        S.editSig = formSig();
        setTab('add');
        window.scrollTo({ top: 0, behavior: 'auto' });
    }
    // 編輯中的表單是否有改動（成員與分攤明細排序不同不算改動）
    function formSig() {
        const f = S.form;
        return JSON.stringify({ ...f, members: [...f.members].sort(), parts: Object.entries(f.parts || {}).sort() });
    }
    const editDirty = () => !!S.editId && S.form && S.editSig !== formSig();
    function cancelEdit() {
        const f = S.form;
        S.editId = S.editOrig = null;
        S.form = blankForm({ date: f.date, payer: f.payer, cur: f.cur, scope: f.scope });
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

    // ---------- 明細分帳與退稅分配 ----------
    function renderPending() {
        const box = $('lg-f-pend'), l = window.LedgerDetail ? LedgerDetail.list() : [];
        const pb = $('lg-f-ppend'); if (pb) pb.innerHTML = pendPersonalHtml();
        box.innerHTML = l.length ? `<label class="lg-lbl">待處理的明細分帳（${l.length}）</label>` + l.map((d) => `<div class="lg-pend"><span><b>${esc(d.title)}</b><small>${esc(d.date || '未填日期')}・${d.has ? `已分配 ${d.got}／${d.qty} 件` : '尚未匯入收據'}</small></span><span><button type="button" class="lg-btn sm" data-act="detail" data-id="${esc(d.id)}">繼續</button><button type="button" class="lg-btn sm danger" data-act="detail-del" data-id="${esc(d.id)}">刪除</button></span></div>`).join('') : '';
    }
    // 個人記帳逐品項匯入的待處理清單（本機暫存）
    function pendPersonalHtml() {
        const l = window.LedgerDetail && LedgerDetail.listPersonal ? LedgerDetail.listPersonal() : [];
        return l.length ? `<label class="lg-lbl">待處理的收據匯入（${l.length}）</label>` + l.map((d) => `<div class="lg-pend"><span><b>${esc(d.title)}</b><small>${esc(d.date || '未填日期')}・${d.count} 個品項</small></span><span><button type="button" class="lg-btn sm" data-act="rcpt-open" data-id="${esc(d.id)}">繼續</button><button type="button" class="lg-btn sm danger" data-act="rcpt-del" data-id="${esc(d.id)}">刪除</button></span></div>`).join('') : '';
    }
    function refreshPersonalPending() { renderPending(); if (S.filter.scope === 'personal') renderItems(); }
    function openDetail(did) {
        if (!window.LedgerDetail) return toast('明細分帳模組載入中，請稍後再試');
        if (!curs().includes('JPY')) return alert('匯率表沒有 JPY，請管理員先到「匯率」頁新增日圓。');
        const people = activeIds().map((id) => ({ id, name: pname(id) }));
        if (!people.length) return toast('請先在上方「團員名單」新增團員');
        LedgerDetail.open({
            people, id: did || '', onClose: renderPending,
            onApply(r) {
                const f = S.form;
                if (f.cur !== 'JPY') f.rate = null;
                f.cur = 'JPY'; f.mode = 'amount'; f.members = order().filter((p) => r.members.includes(p));
                f.parts = r.parts; f.rf = Object.keys(r.rf).length ? r.rf : null; f.dtId = r.id;
                if (r.name) f.title = r.name;
                const at = f.note.indexOf('【明細分帳】'), keepNote = (at >= 0 ? f.note.slice(0, at) : f.note).trim();
                f.note = (keepNote ? keepNote + '\n\n' : '') + r.note;
                if (r.date) f.date = r.date;
                if (r.payer && P()[r.payer]) f.payer = r.payer;
                if (cats().includes('購物')) f.cat = '購物';
                writeForm();
                toast('已帶入明細分帳，確認後按「儲存支出」');
            }
        });
    }
    const refundOf = (id) => Object.entries(E()).filter(([, x]) => x && x.rfOf === id);
    function refundHtml(id, e) {
        const rf = Object.entries(e.rf || {}).filter(([p, v]) => P()[p] && v > 0);
        if (!rf.length) return '';
        const done = refundOf(id), fees = Object.entries(E()).filter(([, x]) => x && x.feeOf === id);
        if (done.length) return `<p class="lg-muted lg-mt">💴 退稅已分配：${done.map(([, x]) => `${esc(pname(x.payer))} ${money(x.amount, x.cur)}`).join('、')}${fees.length ? `；手續費 ${money(fees[0][1].amount, fees[0][1].cur)} 已分攤` : ''}（要重做請先刪除這些「退稅返還」與「手續費」支出）</p>`;
        const sum = rf.reduce((s, [, v]) => s + v, 0), friends = rf.some(([p]) => p !== e.payer);
        return `<p class="lg-muted lg-mt">💴 預計退稅 ${money(sum, e.cur)}：${rf.map(([p, v]) => `${esc(pname(p))} ${money(v, e.cur)}`).join('、')}</p>` +
            (friends && !planLocked() ? `<div class="lg-actions"><button type="button" class="lg-btn sm" data-act="exp-refund" data-id="${id}">💴 退稅分配</button></div>` : '');
    }
    // 退稅收款人（原付款人）退還朋友：每位朋友一筆「朋友付款、收款人分攤」的日圓支出，匯率另外輸入，不動匯率表
    async function refundFlow(id) {
        if (!guard()) return;
        const e = E()[id];
        if (!e || !e.rf) return;
        if (planLocked()) return alert(LOCK_MSG);
        if (refundOf(id).length) return alert('這筆已經分配過退稅了。');
        const rf = Object.fromEntries(Object.entries(e.rf).filter(([p, v]) => P()[p] && v > 0));
        const keys = Object.keys(rf), sum = keys.reduce((s, p) => s + rf[p], 0), dec = Number.isInteger(e.dec) ? e.dec : decOf(e.cur);
        if (!keys.some((p) => p !== e.payer)) return alert('這筆沒有需要退還給朋友的退稅。');
        let amt, rate, fee = null, v = { amt: C.toPlain(sum, dec), rate: '', fee: '' };
        for (;;) {
            const r = await openInputModal({ title: '退稅分配', submitLabel: '下一步', fields: [
                { type: 'note', text: `退稅收款人：${pname(e.payer)}（原付款人）\n預計退稅合計 ${money(sum, e.cur)}（含收款人自己的份）\n匯率另外輸入，不會動到匯率表。\n手續費（台幣）選填：會依每人刷卡金額比例分攤給所有分攤成員。` },
                { key: 'amt', value: v.amt, placeholder: `實際退稅總額（${e.cur}）` },
                { key: 'rate', value: v.rate, placeholder: `匯率：1 ${e.cur} = ? ${BASE}` },
                { key: 'fee', value: v.fee, placeholder: `手續費（${BASE}，選填）` }
            ] });
            if (!r) return;
            v = { amt: r.amt, rate: r.rate, fee: r.fee };
            amt = C.parseAmount(r.amt, dec); rate = C.parseRate(r.rate);
            if (!amt.ok || amt.v <= 0) { alert('退稅總額：' + (amt.err || '必須大於零')); continue; }
            if (!rate.ok) { alert('匯率：' + rate.err); continue; }
            fee = r.fee ? C.parseAmount(r.fee, BASE_DEC) : null;
            if (fee && (!fee.ok || fee.v <= 0)) { alert('手續費：' + (fee.err || '必須大於零')); continue; }
            break;
        }
        const alloc = C.allocate(amt.v, keys.map((p) => rf[p])), m = me(), recs = [];
        keys.forEach((p, i) => {
            if (p === e.payer || alloc[i] <= 0) return;
            const sp = C.computeSplit({ amount: alloc[i], dec, mode: 'amount', members: [e.payer], parts: { [e.payer]: C.toPlain(alloc[i], dec) }, rate: rate.s, baseDec: BASE_DEC });
            if (!sp.ok) return;
            recs.push({ p, a: alloc[i], rec: {
                title: `退稅返還：${e.title || ''}`.slice(0, 50), amount: alloc[i], cur: e.cur, dec, rate: rate.s, rateRef: 'manual', base: BASE, baseAmt: sp.baseAmt,
                date: today(), payer: p, mode: 'amount', unit: null, parts: { [e.payer]: C.toPlain(alloc[i], dec) }, shares: sp.shares, seed: 0, cat: e.cat || '其他',
                note: `來自「${e.title || ''}」的退稅分配：實際退稅 ${money(amt.v, e.cur)}，匯率 1 ${e.cur} = ${rate.s} ${BASE}`, rfOf: id,
                by: m.uid, byName: m.name, ts: TS(), updBy: m.uid, updName: m.name, uts: TS()
            } });
        });
        let feeRec = null;
        if (fee) {
            const fp = order().filter((p) => e.shares && e.shares[p] && e.shares[p].o > 0), fa = C.allocate(fee.v, fp.map((p) => e.shares[p].o));
            const mem = fp.filter((p, i) => fa[i] > 0), parts = Object.fromEntries(fp.map((p, i) => [p, C.toPlain(fa[i], BASE_DEC)]).filter(([p]) => mem.includes(p)));
            const sp = mem.length ? C.computeSplit({ amount: fee.v, dec: BASE_DEC, mode: 'amount', members: mem, parts, rate: '1', baseDec: BASE_DEC }) : null;
            if (!sp || !sp.ok) return alert('手續費分攤失敗，這筆支出沒有可分攤的成員。');
            feeRec = { mem, fa: Object.fromEntries(fp.map((p, i) => [p, fa[i]])), rec: {
                title: `手續費：${e.title || ''}`.slice(0, 50), amount: fee.v, cur: BASE, dec: BASE_DEC, rate: '1', rateRef: 'base', base: BASE, baseAmt: sp.baseAmt,
                date: today(), payer: e.payer, mode: 'amount', unit: null, parts, shares: sp.shares, seed: 0, cat: e.cat || '其他',
                note: `來自「${e.title || ''}」的信用卡手續費，依每人刷卡金額比例分攤`, feeOf: id,
                by: m.uid, byName: m.name, ts: TS(), updBy: m.uid, updName: m.name, uts: TS()
            } };
        }
        if (!recs.length) return alert('分配後沒有朋友分到金額。');
        if (!confirm(`建立 ${recs.length} 筆退稅返還？\n` + recs.map((x) => `${pname(x.p)} 收到 ${money(x.a, e.cur)}（≈ ${money(x.rec.baseAmt, BASE)}）`).join('\n') + `\n\n由 ${pname(e.payer)} 退還，匯率 1 ${e.cur} = ${rate.s} ${BASE}` + (feeRec ? `\n\n另建立手續費 ${money(fee.v, BASE)}（${pname(e.payer)} 付款）：\n` + feeRec.mem.map((p) => `${pname(p)} 分攤 ${money(feeRec.fa[p], BASE)}`).join('\n') : ''))) return;
        const ref = wdb().ref('ledger/expenses'), up = {};
        recs.forEach((x) => { up[ref.push().key] = x.rec; });
        if (feeRec) up[ref.push().key] = feeRec.rec;
        try { await ref.update(up); toast(`已建立 ${recs.length} 筆退稅返還${feeRec ? '與手續費' : ''}`); } catch (err) { fail(err); }
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
        const pu = {};
        Object.entries(PE()).forEach(([id, e]) => { if (e.cat === name) pu[`${id}/cat`] = r.name; });
        if (Object.keys(pu).length) xref(true).update(pu).catch(() => {});
        wdb().ref('ledger').update(up).then(() => {
            if (S.form.cat === name) S.form.cat = r.name;
            S.filter.cats = S.filter.cats.map((c) => (c === name ? r.name : c));
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
    const FL_KEYS = ['date', 'cat', 'payer', 'members', 'cur', 'pay', 'sort'];
    const FL_T = { imp: '匯入我的分攤（可複選）', date: '日期（可複選）', stdate: '日期（可複選）', cat: '類別（可複選）', pay: '支付方式（可複選）', stpay: '支付方式（可複選）', payer: '付款人', members: '分攤成員（可複選）', cur: '幣別', sort: '排序' };
    function buildFilters() {
        $('lg-filters').innerHTML = `
            <input id="lg-q" class="lg-in" placeholder="🔍 搜尋名稱或備註">
            <div class="lg-grid2 lg-mt">
                <div id="lg-fl-scope" class="lg-seg sm">${[['group', '👥 團體'], ['personal', '🔒 個人']].map(([k, l]) => `<button type="button" data-act="fl-scope" data-v="${k}">${l}</button>`).join('')}</div>
                ${FL_KEYS.map((k) => `<button type="button" id="lg-fl-${k}" class="lg-in lg-fbtn" data-act="fl-open" data-v="${k}"></button>`).join('')}
                <button type="button" class="lg-btn sm ghost" data-act="fl-clear">清除篩選</button>
            </div>`;
    }
    const payName = (v) => (v === 'none' ? '未設定' : payL(v));
    function flLabel(k) {
        const f = S.filter;
        if (k === 'date') return f.dates.length ? f.dates.map(mdLabel).join('、') : '全部日期';
        if (k === 'cat') return f.cats.length ? f.cats.join('、') : '全部類別';
        if (k === 'payer') return f.payer ? pname(f.payer) : '全部付款人';
        if (k === 'members') return f.members.length ? f.members.map(pname).join('、') : '全部分攤成員';
        if (k === 'cur') return f.cur ? curLabel(f.cur) : '全部幣別';
        if (k === 'pay') return f.pays.length ? f.pays.map(payName).join('、') : '全部支付方式';
        return f.sort === 'asc' ? '日期：舊 → 新' : '日期：新 → 舊';
    }
    function renderFilterOpts() {
        const f = S.filter;
        f.members = f.members.filter((p) => P()[p]);
        document.querySelectorAll('#lg-fl-scope [data-v]').forEach((b) => b.classList.toggle('on', b.dataset.v === f.scope));
        FL_KEYS.forEach((k) => {
            const b = $('lg-fl-' + k);
            b.textContent = flLabel(k);
            b.classList.toggle('on', k === 'members' ? f.members.length > 0 : k === 'cat' ? f.cats.length > 0 : k === 'date' ? f.dates.length > 0 : k === 'pay' ? f.pays.length > 0 : k !== 'sort' && !!f[k]);
            b.classList.toggle('hidden', f.scope === 'personal' && (k === 'payer' || k === 'members'));
        });
    }
    function flOpts(k) {
        if (k === 'date') return [...new Set(Object.values(src()).map((e) => e.date).filter(Boolean))].sort().map((d) => [d, mdLabel(d)]);
        if (k === 'stdate') return stDates().map((d) => [d, mdLabel(d)]);
        if (k === 'cat') return [...[...new Set([...cats(), ...Object.values(src()).map((e) => e.cat).filter(Boolean)])].map((c) => [c, c])];
        if (k === 'pay' || k === 'stpay') return [...PAYS, ['none', '未設定']];
        if (k === 'payer') return [['', '全部付款人'], ...order().map((p) => [p, pname(p)])];
        if (k === 'members') return order().map((p) => [p, pname(p)]);
        if (k === 'imp') { const pid = myPid(); return impCands().map(([id, e]) => [id, `${e.date ? mdLabel(e.date) : ''}｜${e.title || ''}｜${money(e.shares[pid].o, e.cur)}`]); }
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
        S.fs = { k, sel: k === 'imp' ? [] : k === 'members' ? S.filter.members.slice() : k === 'cat' ? S.filter.cats.slice() : k === 'date' ? S.filter.dates.slice() : k === 'stdate' ? S.stDays.slice() : k === 'pay' ? S.filter.pays.slice() : k === 'stpay' ? S.stPays.slice() : null };
        flBox().classList.remove('hidden');
        lgLock();
        $('lg-fl-t').textContent = FL_T[k];
        flDraw();
    }
    function flDraw() {
        const { k, sel } = S.fs, multi = !!sel, cur = multi ? null : (S.filter[k] || '');
        $('lg-fl-list').innerHTML = flOpts(k).map(([v, l]) => {
            const on = multi ? sel.includes(v) : v === cur;
            return `<button type="button" data-fv="${esc(v)}" class="${on ? 'on' : ''}">${multi ? `<i>${on ? '✓' : ''}</i>` : ''}<span>${esc(l)}</span></button>`;
        }).join('') || '<p class="lg-pick-none">沒有選項</p>';
        $('lg-fl-foot').innerHTML = k === 'imp' ? `<div class="lg-row lg-mt"><button type="button" class="lg-btn sm ghost" data-fa="all">全選</button><button type="button" class="lg-btn sm" style="flex:1" data-fa="ok" ${sel.length ? '' : 'disabled'}>匯入${sel.length ? `（${sel.length} 筆）` : ''}</button></div>` : multi ? `<div class="lg-row lg-mt"><button type="button" class="lg-btn sm ghost" data-fa="clear">全部</button><button type="button" class="lg-btn sm" style="flex:1" data-fa="ok">套用${sel.length ? `（${sel.length} ${k === 'members' ? '人' : '項'}）` : '（全部）'}</button></div>` : '';
    }
    function flPick(v) {
        const s = S.fs;
        if (!s) return;
        if (s.sel) { const i = s.sel.indexOf(v); if (i >= 0) s.sel.splice(i, 1); else s.sel.push(v); flDraw(); return; }
        S.filter[s.k] = v;
        flClose();
        flApply();
    }
    function flMulti(a) {
        if (a === 'clear') { S.fs.sel = []; flDraw(); return; }
        if (a === 'all') { S.fs.sel = flOpts('imp').map(([v]) => v); flDraw(); return; }
        const k = S.fs.k, sel = S.fs.sel.slice();
        if (k === 'imp') { flClose(); importFromGroup(sel); return; }
        if (k === 'cat') S.filter.cats = sel;
        else if (k === 'date') S.filter.dates = sel.sort();
        else if (k === 'stdate') S.stDays = sel.sort();
        else if (k === 'pay') S.filter.pays = sel;
        else if (k === 'stpay') S.stPays = sel;
        else S.filter.members = order().filter((p) => sel.includes(p));
        flClose();
        if (k === 'stdate' || k === 'stpay') renderSettle(); else flApply();
    }
    function flClose() { S.fs = null; const b = $('lg-fl'); if (b) b.classList.add('hidden'); lgLock(); }
    const lgBlock = (e) => {
        const l = e.target.closest && e.target.closest('.lg-sheet-list,.lg-pick-list');
        if (!l || l.scrollHeight <= l.clientHeight) e.preventDefault();
    };
    function lgLock() {
        const open = document.querySelector('#lg-fl:not(.hidden),#lg-pick:not(.hidden),#lg-pad:not(.hidden)');
        document[open ? 'addEventListener' : 'removeEventListener']('touchmove', lgBlock, { passive: false });
    }
    // 團體支出裡「我」有分攤、而且還沒匯入過的
    function impCands() {
        const pid = myPid();
        if (!pid) return [];
        const done = new Set(Object.values(PE()).map((e) => e && e.src).filter(Boolean));
        return Object.entries(E()).filter(([id, e]) => {
            const sh = e && e.shares && e.shares[pid];
            return !done.has(id) && sh && Number.isInteger(sh.o) && Number.isInteger(sh.b) && sh.b > 0;
        }).sort(([, a], [, b]) => (b.date || '').localeCompare(a.date || '') || (b.ts || 0) - (a.ts || 0));
    }
    function openImport() {
        if (!guard()) return;
        if (!myPid()) return alert('要先綁定自己的帳號才能匯入：到「記帳」分頁的團員名單，按自己名字旁的「綁定我」。');
        if (!impCands().length) return toast('沒有可匯入的支出（都已匯入過，或你沒有分攤）');
        flOpen('imp');
    }
    function importFromGroup(ids) {
        const pid = myPid();
        if (!pid || !ids.length || !guard()) return;
        const ref = xref(true), m = me(), up = {};
        ids.forEach((id) => {
            const e = E()[id], sh = e && e.shares && e.shares[pid];
            if (!sh || !(sh.o > 0 || sh.b > 0)) return;
            up[ref.push().key] = {
                title: e.title || '', amount: sh.o, cur: e.cur, dec: Number.isInteger(e.dec) ? e.dec : decOf(e.cur), rate: e.rate, rateRef: e.rateRef || 'manual',
                base: BASE, baseAmt: sh.b, date: e.date, payer: 'me', mode: 'equal', shares: { me: { o: sh.o, b: sh.b } }, seed: 0, cat: e.cat || '其他', note: '',
                src: id, by: m.uid, byName: m.name, ts: TS(), updBy: m.uid, updName: m.name, uts: TS()
            };
        });
        const n = Object.keys(up).length;
        if (!n) return;
        ref.update(up).then(() => toast(`已匯入 ${n} 筆`)).catch(fail);
    }
    function openReceiptImport(did) {
        if (!guard()) return;
        if (!window.LedgerDetail || !LedgerDetail.openPersonal) return toast('明細分帳模組載入中，請稍後再試');
        const t = R().JPY, r = t && C.parseRate(t.rate);
        if (!r || !r.ok) return alert('匯率表沒有 JPY，請管理員先到「匯率」頁新增日圓。');
        LedgerDetail.openPersonal({ id: did || '', cats: cats(), pays: PAYS, today: today(), onApply: saveReceiptItems, onClose: refreshPersonalPending });
    }
    // 一張收據的每個品項各寫一筆個人支出（日圓），以同一個 rg 串成群組；一次批次寫入
    function saveReceiptItems(p) {
        if (!guard()) return false;
        const t = R().JPY, r = C.parseRate(t && t.rate), m = me(), ref = xref(true), up = {}, dec = decOf('JPY');
        if (!r.ok) { alert('JPY 匯率無效，請先到「匯率」頁確認。'); return false; }
        let n = 0;
        for (const rc of p.receipts) {
            for (const x of rc.rows) {
                const sp = C.computeSplit({ amount: x.amount, dec, mode: 'equal', members: ['me'], rate: r.s, baseDec: BASE_DEC, seed: 0, bias: [0] });
                if (!sp.ok) { alert(`「${x.title}」無法換算：${sp.errors.join('、')}`); return false; }
                up[ref.push().key] = {
                    title: x.title.slice(0, 50), amount: x.amount, cur: 'JPY', dec, rate: r.s, rateRef: `table:JPY@${t.ts || 0}`, base: BASE, baseAmt: sp.baseAmt,
                    date: rc.date, pay: rc.pay, payer: 'me', mode: 'equal', unit: null, parts: null, rf: null, shares: sp.shares, seed: 0, cat: x.cat,
                    note: x.jp && x.jp !== x.title ? `${rc.name}｜${x.jp}` : rc.name, rg: rc.rid, rgName: rc.name.slice(0, 50),
                    by: m.uid, byName: m.name, ts: TS(), updBy: m.uid, updName: m.name, uts: TS()
                };
                n++;
            }
        }
        return ref.update(up).then(() => { toast(`已新增 ${p.receipts.length} 張收據、${n} 筆個人支出`); S.filter.scope = 'personal'; return true; }).catch((e) => { fail(e); return false; });
    }
    function delReceipt(rid) {
        const ids = Object.entries(PE()).filter(([, e]) => e && e.rg === rid).map(([id]) => id);
        if (!ids.length || !guard()) return;
        if (!confirm(`確定要刪除整張收據「${PE()[ids[0]].rgName || ''}」的 ${ids.length} 筆個人支出嗎？此動作無法還原。`)) return;
        xref(true).update(Object.fromEntries(ids.map((id) => [id, null]))).then(() => { delete S.rgOpen[rid]; toast('已刪除'); }).catch(fail);
    }
    // 同一張收據的品項在列表收成一列，點開才展開
    function stackHtml(items, ti) {
        const seen = {}, ro = S.rgOpen || (S.rgOpen = {});
        return items.map(([id, e]) => {
            if (!e.rg) return itemHtml(id, e, ti);
            if (seen[e.rg]) return '';
            seen[e.rg] = 1;
            const mem = items.filter(([, x]) => x.rg === e.rg), open = !!ro[e.rg];
            const base = mem.reduce((a, [, x]) => a + (Number.isInteger(x.baseAmt) ? x.baseAmt : 0), 0), jpy = mem.reduce((a, [, x]) => a + (x.cur === 'JPY' && Number.isInteger(x.amount) ? x.amount : 0), 0);
            return `<div class="card lg-item lg-rg ${open ? 'open' : ''}"><button type="button" class="lg-item-h" data-act="rg-open" data-id="${esc(e.rg)}"><span class="lg-item-l"><b>🧾 ${esc(e.rgName || '收據')}</b><small>${esc(e.date || '')}・🔒 個人・${mem.length} 項${open ? '' : '（點開展開）'}</small></span><span class="lg-item-r"><b>${jpy ? money(jpy, 'JPY') : money(base, BASE)}</b>${jpy ? `<small>≈ ${money(base, BASE)}</small>` : ''}</span></button>${open ? `<div class="lg-stack sm lg-mt">${mem.map(([i, x]) => itemHtml(i, x, ti)).join('')}</div><div class="lg-actions"><button type="button" class="lg-btn sm danger" data-act="rg-del" data-id="${esc(e.rg)}">🗑️ 刪除整張收據</button></div>` : ''}</div>`;
        }).join('');
    }
    function flApply() { renderFilterOpts(); renderItems(); renderDeleted(); }
    const src = () => (S.filter.scope === 'personal' ? PE() : E());
    function filtered(anyMember) {
        const f = S.filter, q = f.q.trim().toLowerCase(), pe = f.scope === 'personal';
        return Object.entries(src())
            .filter(([, e]) => (!f.cats.length || f.cats.includes(e.cat)) && (!f.dates.length || f.dates.includes(e.date)) && (pe || ((!f.payer || e.payer === f.payer) && (anyMember || !f.members.length || f.members.some((p) => e.shares && e.shares[p])))) &&
                (!f.cur || e.cur === f.cur) && (!f.pays.length || f.pays.includes(e.pay || 'none')) && (!q || `${e.title || ''} ${e.note || ''}`.toLowerCase().includes(q)))
            .sort(([ia, a], [ib, b]) => {
                const d = (a.date || '').localeCompare(b.date || '') || ((a.ts || 0) - (b.ts || 0)) || (ia < ib ? -1 : 1);
                return S.filter.sort === 'asc' ? d : -d;
            });
    }
    function saveFold() { cacheSave('ledger_fold', { days: S.listShut }); }
    // 選了「分攤成員」時，列出每位成員在目前篩選範圍內的應負擔與已付合計
    function memberSumHtml(list) {
        const ids = order().filter((p) => S.filter.members.includes(p));
        if (S.filter.scope === 'personal' || !ids.length) return '';
        const jl = S.filter.cur === 'JPY' ? '' : '其中日圓 ';
        const fmt = (b, j) => `${money(b, BASE)}${j > 0 ? `<small>（${jl}${money(j, 'JPY')}）</small>` : ''}`;
        const all = filtered(true);
        const rows = ids.map((p) => {
            let owe = 0, oweJ = 0, paid = 0, paidJ = 0;
            list.forEach(([, e]) => {
                const sh = e.shares && e.shares[p];
                if (sh && Number.isInteger(sh.b)) { owe += sh.b; if (e.cur === 'JPY' && Number.isInteger(sh.o)) oweJ += sh.o; }
            });
            all.forEach(([, e]) => {
                if (e.payer === p && Number.isInteger(e.baseAmt)) { paid += e.baseAmt; if (e.cur === 'JPY' && Number.isInteger(e.amount)) paidJ += e.amount; }
            });
            return `<div class="lg-mem-r"><b>${esc(pname(p))}</b><div><span>應負擔　${fmt(owe, oweJ)}</span><span>墊付　${fmt(paid, paidJ)}</span></div></div>`;
        }).join('');
        return `<div class="lg-mem-sum"><p class="lg-mem-h">成員合計（目前篩選範圍）</p>${rows}<p class="lg-mem-n">墊付 ＝ 替大家付款的帳單。轉帳不在這裡，實際還要轉多少請看「自動結算」。</p></div>`;
    }
    function renderItems() {
        const box = $('lg-items'), all = Object.keys(src()).length, list = filtered();
        const impBtn = S.filter.scope === 'personal' ? '<button type="button" class="lg-btn sm lg-import" data-act="imp-open">⬇️ 從團體匯入我的分攤</button><button type="button" class="lg-btn sm lg-import" data-act="rcpt-open">🧾 匯入收據（逐品項）</button>' + pendPersonalHtml() : '';
        if (!all) { box.innerHTML = impBtn + '<div class="card lg-card lg-center"><p class="lg-muted">還沒有' + (S.filter.scope === 'personal' ? '個人' : '') + '支出紀錄，到「記帳」新增第一筆吧。</p></div>'; return; }
        const total = list.reduce((s, [, e]) => s + (Number.isInteger(e.baseAmt) ? e.baseAmt : 0), 0);
        const jpyOf = (e) => (e.cur === 'JPY' && Number.isInteger(e.amount) ? e.amount : 0), baseOf = (e) => (Number.isInteger(e.baseAmt) ? e.baseAmt : 0);
        const pair = (t, j) => [money(t, BASE), j > 0 ? money(j, 'JPY') : ''];
        const exportBtn = `<button type="button" class="lg-btn sm ghost lg-export" data-act="export">⬇️ 匯出目前列表（CSV，可用 Excel／Google 試算表開啟）</button>`;
        if (!list.length) { box.innerHTML = `${impBtn}<p class="lg-sum">共 0 筆</p><div class="card lg-card lg-center"><p class="lg-muted">沒有符合篩選條件的支出。</p></div>`; return; }
        const groups = [], idx = {};
        list.forEach(([id, e]) => {
            const d = e.date || '（無日期）';
            if (idx[d] == null) { idx[d] = groups.length; groups.push({ d, items: [], sum: 0, jpy: 0 }); }
            const g = groups[idx[d]];
            g.items.push([id, e]);
            g.sum += Number.isInteger(e.baseAmt) ? e.baseAmt : 0;
            g.jpy += jpyOf(e);
        });
        const ti = trByExp(), allShut = groups.every((g) => S.listShut[g.d]);
        const twdSum = list.reduce((s, [, e]) => s + (e.cur === BASE ? baseOf(e) : 0), 0), jpySum = list.reduce((s, [, e]) => s + jpyOf(e), 0), jpyBase = list.reduce((s, [, e]) => s + (e.cur === 'JPY' ? baseOf(e) : 0), 0);
        let h = `<div class="lg-items-head"><div class="lg-sum"><p class="lg-sum-t"><span>共 ${list.length} 筆</span><span>合計　<b>${money(total, BASE)}</b></span></p><p>其中新台幣支出　<b>${money(twdSum, BASE)}</b></p><p>其中日圓支出　<b>${money(jpySum, 'JPY')}</b>（≈ ${money(jpyBase, BASE)}）</p></div><button type="button" class="lg-btn sm" data-act="fold-all">${allShut ? '全部展開' : '全部收合'}</button></div>`;
        h += memberSumHtml(list);
        h += groups.map((g) => {
            const shut = !!S.listShut[g.d];
            const label = /^\d{4}-\d{2}-\d{2}$/.test(g.d) ? `${+g.d.slice(5, 7)}/${+g.d.slice(8, 10)}` : g.d;
            return `<div class="lg-grp"><button type="button" class="lg-grp-h" data-act="grp" data-d="${esc(g.d)}"><span>${esc(label)}<small>${g.items.length} 筆</small></span><span class="lg-grp-r"><span class="lg-grp-v">${pair(g.sum, g.jpy).filter(Boolean).map((x) => `<span>${x}</span>`).join('')}</span><em>${shut ? '▼' : '▲'}</em></span></button>${shut ? '' : `<div class="lg-stack sm lg-mt">${stackHtml(g.items, ti)}</div>`}</div>`;
        }).join('');
        box.innerHTML = impBtn + `<div class="lg-items-box">${h}</div>` + exportBtn;
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
        if (tr) { const U = unitOpts(), ta = C.transferAmount(tr, U); return `<em class="lg-pt ${tr.status === 'done' ? 'ok' : ''}">${tr.status === 'done' ? '✅ 已先轉帳' : '已先轉帳・待確認'}${ta !== C.unitView(e, U).sh[p] ? `・${money(ta, unitCur())}` : ''}</em>`; }
        return !planLocked() && canAct(p) ? `<button type="button" class="lg-pt-b" data-act="exp-pay" data-id="${id}" data-p="${p}">先轉帳</button>` : '';
    }
    function itemHtml(id, e, ti = {}) {
        const fx = e.cur !== BASE, n = Object.keys(e.shares || {}).length, open = S.open === id, pe = isP(id);
        let h = `<div class="card lg-item ${open ? 'open' : ''}">
            <button type="button" class="lg-item-h" data-act="exp-open" data-id="${id}">
                <span class="lg-item-l"><b>${esc(e.title || '')}</b><small>${esc(e.date || '')}・${pe ? `🔒 個人${e.src ? '・來自團體' : ''}` : `${esc(pname(e.payer))} 付款・${n} 人分攤`}${e.cat ? '・' + esc(e.cat) : ''}${e.pay ? '・' + payL(e.pay) : ''}</small></span>
                <span class="lg-item-r"><b>${money(e.amount, e.cur)}</b>${fx ? `<small>≈ ${money(e.baseAmt, BASE)}</small>` : ''}</span>
            </button>`;
        if (open) {
            const modeL = (MODES.find(([k]) => k === e.mode) || [, ''])[1];
            h += `<div class="lg-detail">
                ${pe ? '' : order().filter((p) => e.shares && e.shares[p]).map((p) => {
                    const s = e.shares[p];
                    return `<div class="lg-pv-row"><span>${esc(pname(p))}${payTag(id, e, p, ti)}</span><span>${fx ? `${money(s.o, e.cur)}<small>≈ ${money(s.b, BASE)}</small>` : money(s.b, BASE)}</span></div>`;
                }).join('')}
                <p class="lg-muted lg-mt">${pe ? '' : `分帳方式：${esc(modeL)}`}${fx ? `・匯率 1 ${esc(e.cur)} = ${esc(e.rate)} ${BASE}（${String(e.rateRef || '').startsWith('table:') ? '當時匯率表' : '自訂'}）` : ''}</p>
                ${e.note ? `<p class="lg-note">${esc(e.note)}</p>` : ''}
                ${pe ? '' : refundHtml(id, e)}
                <p class="lg-muted">建立：${esc(e.byName || '')} ${when(e.ts)}${e.updName && e.uts !== e.ts ? `・最後修改：${esc(e.updName)} ${when(e.uts)}` : ''}</p>
                ${!pe && planLocked() ? '<p class="lg-muted lg-mt">🔒 清帳方案已鎖定，需管理員解除鎖定後才能修改。</p>' : `<div class="lg-actions"><button type="button" class="lg-btn sm" data-act="exp-edit" data-id="${id}">✏️ 編輯</button><button type="button" class="lg-btn sm danger" data-act="exp-del" data-id="${id}">🗑️ 刪除</button></div>`}
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
        const head = ['日期', '名稱', '類別', '支付方式', '付款人', '幣別', '原始金額', `匯率（1 外幣 = ? ${BASE}）`, `${BASE} 金額`, '分帳方式',
            ...ppl.map((p) => `${pname(p)} 分攤（${BASE}）`), '備註', '建立者', '最後修改者'];
        const rows = list.map(([, e]) => [e.date, e.title, e.cat || '', payL(e.pay), pname(e.payer), e.cur,
            C.toPlain(e.amount, Number.isInteger(e.dec) ? e.dec : decOf(e.cur)), e.rate, C.toPlain(e.baseAmt || 0, BASE_DEC), S.filter.scope === 'personal' ? '個人' : modeL(e.mode),
            ...ppl.map((p) => { const b = shareOf(e, p); return b === null ? '' : C.toPlain(b, BASE_DEC); }),
            e.note || '', e.byName || '', e.updName || '']);
        rows.push(['', '合計', '', '', '', '', '', '', C.toPlain(list.reduce((s, [, e]) => s + (e.baseAmt || 0), 0), BASE_DEC), '',
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
        const e = XE(id), pe = isP(id);
        if (!e || !guard()) return;
        if (pe) {
            if (!confirm(`確定要刪除個人支出「${e.title}」嗎？`)) return;
            return xref(true).child(id).remove().then(() => { toast('已刪除'); if (S.editId === id) cancelEdit(); }).catch(fail);
        }
        if (planLocked()) return alert(LOCK_MSG);
        if (settledExp(e, cpMap())) return alert(SETTLED_MSG);
        const im = C.deleteImpact(order(), E(), T(), id, unitOpts()), UC = unitCur();
        const net = (v) => (v > 0 ? `應收 ${money(v, UC)}` : v < 0 ? `應付 ${money(-v, UC)}` : '平衡');
        const warn = im.warn ? `\n\n⚠️ 已有轉帳紀錄，刪除後清帳會失衡：\n未結清 ${money(im.open0, UC)} → ${money(im.open1, UC)}\n${im.changes.slice(0, 8).map((c) => `${pname(c.p)}：${net(c.from)} → ${net(c.to)}`).join('\n')}${im.eidTr ? '\n（已有人依這筆支出先轉帳）' : ''}\n已記錄的轉帳不會被刪除，需要另外補轉或退回。` : '';
        if (!confirm(`確定要刪除「${e.title}」嗎？\n刪除後結算會自動重新計算，並保留在「已刪除紀錄」，可以還原。${warn}`)) return;
        const m = me();
        wdb().ref('ledger').update({ ['expenses/' + id]: null, ['deleted/' + id]: { ...e, delBy: m.uid, delName: m.name, delTs: TS() } })
            .then(() => { toast('已刪除'); if (S.editId === id) cancelEdit(); }).catch(fail);
    }
    function restoreExpense(id) {
        const e = (D().deleted || {})[id];
        if (!e || !guard()) return;
        if (planLocked()) return alert(LOCK_MSG);
        if (E()[id]) return toast('這筆已經存在');
        if (!confirm(`還原「${e.title}」？\n會重新列入結算。`)) return;
        const { delBy, delName, delTs, ...rec } = e;
        wdb().ref('ledger').update({ ['expenses/' + id]: rec, ['deleted/' + id]: null }).then(() => toast('已還原')).catch(fail);
    }
    function renderDeleted() {
        const box = $('lg-del');
        if (!box) return;
        const list = Object.entries(D().deleted || {}).filter(([, e]) => e).sort(([, a], [, b]) => (b.delTs || 0) - (a.delTs || 0));
        if (S.filter.scope === 'personal' || !list.length) { box.innerHTML = ''; return; }
        let h = `<button type="button" class="lg-link" data-act="del-toggle">${S.showDel ? '隱藏' : '顯示'}已刪除紀錄（${list.length}）</button>`;
        if (S.showDel) {
            h += `<div class="card lg-card lg-mt">${list.map(([id, e]) => `<div class="lg-del-r"><div><b>${esc(e.title || '')}</b><small>${esc(e.date || '')}・${esc(pname(e.payer))} 付款・${Object.keys(e.shares || {}).length} 人分攤</small><small>${esc(e.delName || '')} 於 ${when(e.delTs)} 刪除</small></div><div class="lg-del-v"><b>${money(e.amount, e.cur)}</b>${e.cur !== BASE ? `<small>≈ ${money(e.baseAmt, BASE)}</small>` : ''}${planLocked() ? '<span class="lg-muted">🔒 已鎖定</span>' : `<button type="button" class="lg-btn sm" data-act="exp-restore" data-id="${id}">還原</button>`}</div></div>`).join('')}</div>`;
        }
        box.innerHTML = h;
    }

    // ---------- 自動結算 ----------
    const stCats = () => [...new Set(Object.values(E()).map((e) => e.cat || '其他'))];
    const stDates = () => [...new Set(Object.values(E()).map((e) => e.date).filter(Boolean))].sort();
    const mdLabel = (d) => { const [, m, dd] = d.split('-'); return `${+m}/${+dd}`; };
    function foldCard(k, title, body) {
        const shut = S.fold[k];
        return `<div class="card lg-card"><button type="button" class="lg-fold" data-act="fold" data-v="${k}">${title}<span>${shut ? '展開 ▼' : '收合 ▲'}</span></button>${shut ? '' : `<div class="lg-mt">${body}</div>`}</div>`;
    }
    function renderSettle() {
        const ids = order(), dates = stDates(), day = S.stMode === 'day', allCats = stCats();
        S.stDays = S.stDays.filter((d) => dates.includes(d));
        S.stCats = S.stCats.filter((c) => allCats.includes(c));
        const hit = (e) => e && (!S.stDays.length || S.stDays.includes(e.date)) && (!S.stCats.length || S.stCats.includes(e.cat || '其他')) && (!S.stPays.length || S.stPays.includes(e.pay || 'none'));
        const exps = day ? Object.fromEntries(Object.entries(E()).filter(([, e]) => hit(e))) : E();
        const trs = day ? Object.fromEntries(Object.entries(T()).filter(([, t]) => t.eid && hit(E()[t.eid]))) : T();
        const flt = S.stDays.length || S.stCats.length || S.stPays.length ? [S.stDays.map(mdLabel).join('、'), S.stCats.join('、'), S.stPays.map(payName).join('、')].filter(Boolean).join('・') : '全部';
        const U = unitOpts(), UC = U ? U.cur : BASE, urate = U ? U.rate : '1', udec = U ? U.dec : BASE_DEC;
        const B = C.balances(ids, exps, trs, U), sug = C.settle(ids, B);
        const ps = day ? null : C.planState(ids, E(), T(), D().plan, U), planOn = !!ps && !ps.done;
        const curList = curs();
        const dc = curList.includes(S.stCur) ? S.stCur : UC, ddec = decOf(dc), ref = dc !== BASE;
        const rateOf = (c) => (c === BASE ? '1' : R()[c].rate);
        const baseOf = (v) => (U ? C.convert(v, udec, urate, BASE_DEC) : v);
        const conv = (v) => (dc === UC ? v : dc === BASE ? baseOf(v) : C.convertCross(v, udec, urate, ddec, rateOf(dc)));
        const num = (v) => C.formatAmount(conv(v), ddec);
        const amt = (v) => (ref ? `${money(conv(v), dc)}<small>≈ ${money(baseOf(v), BASE)}</small>` : money(conv(v), dc));
        const tt = (v) => (ref ? `${money(conv(v), dc)}（≈ ${money(baseOf(v), BASE)}）` : money(conv(v), dc));
        const two = (prim, v) => (ref ? `${money(prim, dc)}<small>≈ ${money(baseOf(v), BASE)}</small>` : money(conv(v), dc));
        const sameCur = (e) => e.cur === dc && (Number.isInteger(e.dec) ? e.dec : decOf(e.cur)) === ddec;
        const rows = Object.keys(B).filter((p) => (P()[p] && P()[p].active !== false) || B[p].paid || B[p].owe || B[p].sent || B[p].recv);
        const open = Object.values(B).reduce((s, x) => s + Math.max(0, x.net), 0);
        const netCell = (v) => v > 0 ? `<small>應收</small><b class="pos">+${num(v)}</b>` : v < 0 ? `<small>應付</small><b class="neg">${num(v)}</b>` : `<small>平衡</small><b>0</b>`;
        const trE = (t) => { if (!t.eid) return ''; const x = E()[t.eid]; return `<small class="lg-tr-e">📌 依「${esc(x ? x.title : '已刪除的支出')}」${x && x.date ? `（${mdLabel(x.date)}）` : ''}先轉帳</small>`; };
        const li = (a, b) => `<div class="lg-bd-r"><span>${a}</span><span>${b}</span></div>`;
        const eLbl = (e) => `${esc(e.title || '')}${e.date ? `（${mdLabel(e.date)}）` : ''}`;
        const cps = cpMap(), anyCp = Object.keys(cps).length > 0;
        if (!anyCp) S.stBal = S.stSug = 'all';
        const bd = (p, m) => {
            const hide = m === 'open' && cps[p] !== undefined, cut = cps[p] || 0, x = B[p], ex = Object.values(exps).filter((e) => e && e.shares && Number.isInteger(e.baseAmt))            .filter((e) => !hide || (e.ts || 0) > cut).sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.ts || 0) - (a.ts || 0));
            const sec = (t, rows) => (rows.length ? `<p class="lg-bd-h">${t}</p>${rows.join('')}` : '');
            const live = Object.values(trs).filter((t) => t && (t.status === 'paid' || t.status === 'done') && Number.isInteger(t.amt)).sort((a, b) => (b.paidTs || 0) - (a.paidTs || 0));
            const paidV = (e) => { const v = C.unitView(e, U).total; return two(sameCur(e) && Number.isInteger(e.amount) ? e.amount : conv(v), v); };
            const oweV = (e) => { const v = C.unitView(e, U).sh[p], o = e.shares[p].o; return two(sameCur(e) && Number.isInteger(o) ? o : conv(v), v); };
            const trV = (t) => { const v = C.transferAmount(t, U); return two(conv(v), v); };
            const f = (k) => money(conv(x[k]), dc);
            return `<div class="lg-bd"><p class="lg-bd-n">${esc(pname(p))}</p>`
                + sec(`墊付 ${hide ? tt(ex.filter((e) => e.payer === p).reduce((a, e) => a + C.unitView(e, U).total, 0)) : tt(x.paid)}`, ex.filter((e) => e.payer === p).map((e) => li(eLbl(e), paidV(e))))
                + sec(`應負擔 ${hide ? tt(ex.filter((e) => e.shares[p] && e.shares[p].b > 0).reduce((a, e) => a + C.unitView(e, U).sh[p], 0)) : tt(x.owe)}`, ex.filter((e) => e.shares[p] && e.shares[p].b > 0).map((e) => li(`${eLbl(e)}${e.payer === p ? '（自己付）' : ''}`, oweV(e))))
                + (hide ? `<p class="lg-bd-h">已轉出 ${tt(0)}</p><p class="lg-bd-h">已收到 ${tt(0)}</p>`
                    : sec(`已轉出 ${tt(x.sent)}`, live.filter((t) => t.from === p).map((t) => li(`給 ${esc(pname(t.to))}`, trV(t))))
                    + sec(`已收到 ${tt(x.recv)}`, live.filter((t) => t.to === p).map((t) => li(`來自 ${esc(pname(t.from))}`, trV(t)))))
                + (hide ? '' : `<p class="lg-bd-s">淨額 ＝ ${f('paid')} − ${f('owe')} ＋ ${f('sent')} − ${f('recv')} ＝ <b>${money(conv(x.net), dc)}</b></p>`) + '</div>';
        };
        const trLine = ([id, t], btns) => {
            const k = 't:' + id, op = !!S.stOpen[k];
            return `<div class="lg-tr"><p class="lg-tap" data-act="st-open" data-k="${esc(k)}"><b>${esc(pname(t.from))}</b> → <b>${esc(pname(t.to))}</b><i class="lg-chev">${op ? '▲' : '▼'}</i><span>${amt(C.transferAmount(t, U))}</span></p>${trE(t)}${op && B[t.from] && B[t.to] ? bd(t.from) + bd(t.to) : ''}${btns}</div>`;
        };
        const tog = (k) => !anyCp ? '' : `<div class="lg-seg sm tg">${[['all', '全部'], ['open', '未結清']].map(([v, l]) => `<button type="button" data-act="st-flt" data-k="${k}" data-v="${v}" class="${S[k] === v ? 'on' : ''}">${l}</button>`).join('')}</div>`;

        let h = `<div class="card lg-card">
            <div class="lg-seg sm">${[['all', '總和'], ['day', '依日期類別']].map(([k, l]) => `<button type="button" data-act="st-mode" data-v="${k}" class="${S.stMode === k ? 'on' : ''}">${l}</button>`).join('')}</div>
            <div class="lg-row lg-mt">${day ? `<button type="button" class="lg-in lg-fbtn ${S.stDays.length ? 'on' : ''}" data-act="fl-open" data-v="stdate">${esc(S.stDays.length ? S.stDays.map(mdLabel).join('、') : '全部日期')}</button>` : ''}
                <input id="lg-st-cur" class="lg-in lg-cur" data-pick="st-cur" data-val="${esc(dc)}" value="${esc(curLabel(dc))}" readonly autocomplete="off"></div>
            ${day ? `<div class="lg-row lg-mt"><button type="button" class="lg-in lg-fbtn ${S.stPays.length ? 'on' : ''}" data-act="fl-open" data-v="stpay">${esc(S.stPays.length ? S.stPays.map(payName).join('、') : '全部支付方式')}</button></div>` : ''}
            ${day ? `<div class="lg-chips lg-mt">${allCats.map((c) => `<button type="button" data-act="st-cat" data-v="${esc(c)}" class="lg-chip ${S.stCats.includes(c) ? 'on' : ''}">${esc(c)}</button>`).join('')}${S.stCats.length ? '<button type="button" data-act="st-cat" data-v="" class="lg-chip ghost">全部類別</button>' : ''}</div>` : ''}
            ${U ? `<p class="lg-muted lg-mt">${dc === UC ? `清帳以 ${UC} 為單位，台幣依目前匯率 1 ${UC} = ${esc(urate)} ${BASE} 換算，僅供參考，不影響結算金額。` : `其他幣別依目前匯率換算，僅供參考；實際以 ${UC} 結算與記錄轉帳。`}</p>` : (ref ? `<p class="lg-muted lg-mt">以目前匯率換算，僅供參考；實際以 ${BASE} 結算與記錄轉帳。</p>` : '')}
            ${day ? '<p class="lg-muted lg-mt">依所選日期、類別與支付方式（都可複選，不選＝全部）計算支出，以及指定這些支出的先轉帳，僅供查看；標記轉帳請切回「總和」。</p>' : ''}
        </div>`;
        if (day && !dates.length) { $('lg-s-settle').innerHTML = h + '<div class="card lg-card lg-center"><p class="lg-muted">還沒有支出紀錄。</p></div>'; return; }

        h += foldCard('bal', `📊 每人帳務 <small>（${esc(dc)}${day ? `・${esc(flt)}` : ''}）</small>`,
            tog('stBal') + (rows.length ? `<div class="lg-bal"><div class="lg-bal-r h"><span>成員</span><span>墊付</span><span class="op">−</span><span>應負擔</span><span class="op">＋</span><span>已轉出</span><span class="op">−</span><span>已收到</span><span class="op">＝</span><span>應付(淨額)</span></div>
            ${rows.map((p) => {
                const x = B[p];
                const k = 'b:' + p, op = !!S.stOpen[k];
                return `<div class="lg-bal-r lg-tap" data-act="st-open" data-k="${esc(k)}"><span>${esc(pname(p))}<i class="lg-chev">${op ? '▲' : '▼'}</i></span><span>${num(x.paid)}</span><span class="op"></span><span>${num(x.owe)}</span><span class="op"></span><span>${num(x.sent)}</span><span class="op"></span><span>${num(x.recv)}</span><span class="op"></span><span>${netCell(x.net)}</span></div>${op ? bd(p, S.stBal) : ''}`;
            }).join('')}</div>` : '<p class="lg-muted">還沒有團員。</p>') +
            `<p class="lg-sum lg-mt">${day ? '篩選範圍未平衡' : '尚未結清'}：<b>${amt(open)}</b></p>
            <p class="lg-muted">淨額 ＝ 墊付 − 應負擔 ＋ 已轉出 − 已收到；已標記轉帳的金額會立即計入${day ? '（只算指定這些支出的先轉帳）' : ''}。</p>`);

        const planBody = () => {
            const pl = D().plan, fin = ps.items.filter((x) => x.status === 'done').length;
            let b = `<p class="lg-muted">${esc(pl.byName || '管理員')} 於 ${when(pl.ts)} 鎖定・已完成 ${fin} / ${ps.items.length} 筆</p>`;
            if (ps.stale) b += ps.curMismatch ? '<p class="lg-warn">⚠️ 結算幣別已改變，這份舊方案已失效，暫時不能標記轉帳，請管理員重新鎖定。</p>' : '<p class="lg-warn">⚠️ 鎖定後帳務有變動（可能新增、修改或刪除了支出），這份方案已過期，暫時不能標記轉帳，請管理員重新鎖定。</p>';
            b = tog('stSug') + b;
            b += ps.items.filter((x) => S.stSug !== 'open' || x.status !== 'done').map((x) => {
                const st = x.status === 'done' ? '<em class="ok">✅ 已完成</em>'
                    : x.status === 'paid' ? `<em>付款：已轉帳</em><em class="wait">收款：待 ${esc(pname(x.to))} 確認</em>${canAct(x.to) ? `<button type="button" class="lg-btn sm" data-act="tr-done" data-id="${x.tid}">確認收款</button><button type="button" class="lg-btn sm ghost" data-act="tr-void" data-id="${x.tid}">退回</button>` : canAct(x.from) ? `<button type="button" class="lg-btn sm ghost" data-act="tr-void" data-id="${x.tid}">取消</button>` : ''}`
                        : `<em>付款：未轉帳</em><em>收款：未確認</em>${ps.stale ? '<small>方案已過期</small>' : canAct(x.from)
                            ? `<button type="button" class="lg-btn sm" data-act="st-pay" data-from="${x.from}" data-to="${x.to}" data-amt="${x.amt}" data-pk="${x.key}">標記已轉帳</button>`
                            : `<small>由 ${esc(pname(x.from))} 本人或管理員標記</small>`}`;
                const k = 'p:' + x.key, op = !!S.stOpen[k];
                return `<div class="lg-tr"><p class="lg-tap" data-act="st-open" data-k="${esc(k)}"><b>${esc(pname(x.from))}</b> → <b>${esc(pname(x.to))}</b><i class="lg-chev">${op ? '▲' : '▼'}</i><span>${amt(x.amt)}</span></p>${op && B[x.from] && B[x.to] ? bd(x.from, S.stSug) + bd(x.to, S.stSug) : ''}<div class="lg-st">${st}</div></div>`;
            }).join('');
            if (isEditor) b += `<div class="lg-actions lg-mt">${ps.stale ? '<button type="button" class="lg-btn sm" data-act="plan-lock">重新鎖定</button>' : ''}<button type="button" class="lg-btn sm ghost" data-act="plan-unlock">解除鎖定</button></div>`;
            return b;
        };
        const sugBody = () => tog('stSug') + (sug.length ? sug.map((s) => {
            const k = `s:${s.from}>${s.to}`, op = !!S.stOpen[k];
            return `<div class="lg-tr"><p class="lg-tap" data-act="st-open" data-k="${esc(k)}"><b>${esc(pname(s.from))}</b> → <b>${esc(pname(s.to))}</b><i class="lg-chev">${op ? '▲' : '▼'}</i><span>${amt(s.amt)}</span></p>
            ${op ? `<div class="lg-sg"><div><span>應付｜${esc(pname(s.from))}</span><span>${tt(-B[s.from].net)}</span></div><div><span>應收｜${esc(pname(s.to))}</span><span>${tt(B[s.to].net)}</span></div><div><b>本筆</b><b>${tt(s.amt)}</b></div></div>${bd(s.from, S.stSug)}${bd(s.to, S.stSug)}` : ''}
            <div class="lg-st">${day ? '<small>依日期檢視，僅供參考</small>' : `<em>付款：未轉帳</em><em>收款：未確認</em>${canAct(s.from)
                ? `<button type="button" class="lg-btn sm" data-act="st-pay" data-from="${s.from}" data-to="${s.to}" data-amt="${s.amt}">標記已轉帳</button>`
                : `<small>由 ${esc(pname(s.from))} 本人或管理員標記</small>`}`}</div></div>`;
        }).join('') + '<p class="lg-muted">依淨額配對：由欠最多的人付給應收最多的人。</p>'
            : `<p class="lg-muted">🎉 ${day ? '這個範圍的' : ''}帳務已平衡，沒有需要轉帳的項目。</p>`) + (U && open > 0 && open < 100 ? `<p class="lg-muted">剩餘金額很小（不到 100 ${UC}），可以大家自行抵銷，或照建議轉帳。</p>` : '') + (!day && isEditor && sug.length ? '<div class="lg-actions lg-mt"><button type="button" class="lg-btn sm" data-act="plan-lock">🔒 鎖定目前建議</button></div><p class="lg-muted">鎖定後方案固定，不會因為誰先轉帳而改變。</p>' : '');
        h += foldCard('sug', planOn ? '🔒 清帳方案（已鎖定）' : '💸 清帳建議', planOn ? planBody() : sugBody());

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
    function markPaid(from, to, amt, eid, pk) {
        if (!guard() || !canAct(from) || !(amt > 0)) return;
        if (!pk && planLocked()) return alert('清帳方案已鎖定，請依方案裡的項目標記轉帳。');
        if (pk) {
            const ps = C.planState(order(), E(), T(), D().plan, unitOpts()), it = ps && !ps.done && ps.items.find((x) => x.key === pk);
            if (!it || it.status !== 'todo' || it.from !== from || it.to !== to || it.amt !== amt) return toast('這份清帳方案已變動，請重新整理');
            if (ps.stale) return toast('帳務在鎖定後有變動，請管理員重新鎖定方案');
        }
        const e = eid ? E()[eid] : null;
        if (eid && !e) return;
        if (eid && Object.values(T()).some((t) => t.eid === eid && t.from === from && t.status !== 'void')) return toast('這筆已經先轉帳過了');
        const U = unitOpts(), UC = unitCur();
        const shown = U ? `${money(amt, UC)}（≈ ${money(C.convert(amt, U.dec, U.rate, BASE_DEC), BASE)}）` : money(amt, BASE);
        if (!confirm(`確認 ${pname(from)} 已轉帳 ${shown} 給 ${pname(to)}？${e ? `\n（依「${e.title}」的分攤先轉帳）` : ''}\n\n會先計入餘額，等待 ${pname(to)} 確認收款。`)) return;
        const m = me();
        actDb(from).ref('ledger/transfers').push({ from, to, amt: U ? Math.max(1, C.convert(amt, U.dec, U.rate, BASE_DEC)) : amt, ...(U ? { amtJ: amt } : {}), cur: BASE, status: 'paid', ...(eid ? { eid } : {}), ...(pk ? { plan: D().plan.id, pk } : {}), paidBy: m.uid, paidName: m.name, paidTs: TS() })
            .then(() => toast('已標記轉帳')).catch(fail);
    }
    function lockPlan() {
        if (!isEditor || !guard()) return;
        const U = unitOpts(), sug = C.settle(order(), C.balances(order(), E(), T(), U));
        if (!sug.length) return toast('目前沒有需要轉帳的項目');
        const cur = D().plan ? C.planState(order(), E(), T(), D().plan, U) : null, re = !!cur && !cur.done;
        if (!confirm(`${re ? '重新鎖定' : '鎖定'}目前的清帳建議（共 ${sug.length} 筆）？\n鎖定後方案固定，不會因為誰先轉帳而改變；之後帳務有變動時需要重新鎖定。${re ? '\n舊方案會被取代，已完成的轉帳照常計入。' : ''}`)) return;
        const m = me();
        adminDb.ref('ledger/plan').set({ id: Date.now().toString(36), ts: TS(), by: m.uid, byName: m.name, cur: U ? U.cur : BASE, items: Object.fromEntries(sug.map((x, i) => ['i' + i, { from: x.from, to: x.to, amt: x.amt }])) })
            .then(() => toast('已鎖定清帳方案')).catch(fail);
    }
    function unlockPlan() {
        if (!isEditor || !guard() || !confirm('解除鎖定清帳方案？\n已記錄的轉帳不會被刪除，清帳建議會恢復成依目前帳務自動計算。')) return;
        adminDb.ref('ledger/plan').remove().then(() => toast('已解除鎖定')).catch(fail);
    }
    function setTransfer(id, status) {
        const t = T()[id];
        if (!t || t.status !== 'paid' || !guard()) return;
        const who = status === 'done' || canAct(t.to) ? t.to : t.from;
        if (!canAct(who)) return;
        const msg = status === 'done' ? `確認已收到 ${pname(t.from)} 轉來的 ${money(C.transferAmount(t, unitOpts()), unitCur())}？`
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
            <div class="lg-base">基準幣別：<b>${BASE}</b><small>已鎖定；支出一律同時記錄台幣，清帳以日圓為單位</small></div>
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
        lgLock();
        setTimeout(() => q.focus(), 30);
    }
    function pickClose() {
        const el = PK.el;
        PK.el = null; PK.q = '';
        const b = document.getElementById('lg-pick');
        if (b) b.classList.add('hidden');
        lgLock();
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
        lgLock();
        padDraw();
    }
    function padClose() {
        PAD.el = null;
        const b = document.getElementById('lg-pad');
        if (b) b.classList.add('hidden');
        lgLock();
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
        if (t.id === 'lg-f-amount' && S.form && S.form.mode === 'amount' && S.form.scope !== 'personal') { t.blur(); return; }
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
                f.rf = null;
                f.members = order().filter((p) => set.has(p));
                refreshForm();
            } else if (act === 'all') {
                const act2 = activeIds(), allOn = act2.every((p) => f.members.includes(p));
                f.members = allOn ? [] : act2;
                f.parts = {}; f.rf = null;
                refreshForm();
            } else if (act === 'mode') { if (f.mode !== v) { f.mode = v; f.parts = {}; f.rf = null; $('lg-f-amount').value = f.amount; refreshForm(); } }
            else if (act === 'scope') { if (f.scope !== v) { f.scope = v; refreshForm(); } }
            else if (act === 'pay') { f.pay = f.pay === v ? '' : v; refreshForm(); }
            else if (act === 'cat') { f.cat = v; refreshForm(); }
            else if (act === 'cat-add') addCat();
            else if (act === 'cat-del') delCat(f.cat);
            else if (act === 'cat-edit') editCats();
            else if (act === 'calc-swap' || act === 'calc-del') calcAct(act, +b.dataset.i);
            else if (act === 'st-cat') { S.stCats = !v ? [] : S.stCats.includes(v) ? S.stCats.filter((c) => c !== v) : [...S.stCats, v]; renderSettle(); }
            else if (act === 'st-flt') { if (b.dataset.k === 'stBal' || b.dataset.k === 'stSug') { S[b.dataset.k] = v; renderSettle(); } }
            else if (act === 'st-mode') { S.stMode = v; renderSettle(); }
            else if (act === 'fold') { S.fold[v] = !S.fold[v]; renderSettle(); }
            else if (act === 'st-open') { S.stOpen[b.dataset.k] = !S.stOpen[b.dataset.k]; renderSettle(); }
            else if (act === 'fill') fillParts();
            else if (act === 'detail') openDetail(id);
            else if (act === 'detail-del') { if (confirm('刪除這份待處理的明細分帳？')) { LedgerDetail.remove(id); if (f.dtId === id) f.dtId = null; renderPending(); } }
            else if (act === 'exp-refund') refundFlow(id);
            else if (act === 'rate-table') { f.rate = null; renderRate(); renderPreview(); }
            else if (act === 'rate-custom') { const t = R()[f.cur]; f.rate = t ? t.rate : ''; renderRate(); renderPreview(); }
            else if (act === 'save') saveExpense();
            else if (act === 'clear-form') { if (confirm('確定要清空目前輸入的內容嗎？')) { S.form = blankForm({ date: f.date, cur: f.cur, scope: f.scope }); writeForm(); } }
            else if (act === 'cancel-edit') { if (!editDirty() || confirm('這筆支出有尚未儲存的修改，確定要放棄嗎？')) cancelEdit(); }
            else if (act === 'exp-open') { S.open = S.open === id ? null : id; renderItems(); }
            else if (act === 'fold-all') {
                const ds = [...new Set(filtered().map(([, e]) => e.date || '（無日期）'))], shut = !ds.every((d) => S.listShut[d]);
                ds.forEach((d) => { if (shut) S.listShut[d] = true; else delete S.listShut[d]; });
                saveFold(); renderItems();
            }
            else if (act === 'grp') { const d = b.dataset.d; if (S.listShut[d]) delete S.listShut[d]; else S.listShut[d] = true; saveFold(); renderItems(); }
            else if (act === 'fl-open') flOpen(v);
            else if (act === 'fl-scope') { if (S.filter.scope !== v) { S.filter.scope = v; flApply(); } }
            else if (act === 'exp-pay') { const e = E()[id], p = b.dataset.p; if (e && e.shares && e.shares[p]) markPaid(p, e.payer, C.unitView(e, unitOpts()).sh[p], id); }
            else if (act === 'exp-edit') startEdit(id);
            else if (act === 'exp-del') delExpense(id);
            else if (act === 'exp-restore') restoreExpense(id);
            else if (act === 'imp-open') openImport();
            else if (act === 'rcpt-open') openReceiptImport(id);
            else if (act === 'rcpt-del') { if (confirm('刪除這份待處理的收據匯入？')) { LedgerDetail.removePersonal(id); refreshPersonalPending(); } }
            else if (act === 'rg-open') { const ro = S.rgOpen || (S.rgOpen = {}); ro[id] = !ro[id]; renderItems(); }
            else if (act === 'rg-del') delReceipt(id);
            else if (act === 'del-toggle') { S.showDel = !S.showDel; renderDeleted(); }
            else if (act === 'export') exportCsv();
            else if (act === 'fl-clear') { S.filter = { scope: 'group', sort: S.filter.sort, dates: [], cats: [], pays: [], payer: '', members: [], cur: '', q: '' }; $('lg-q').value = ''; renderFilterOpts(); renderItems(); }
            else if (act === 'st-pay') markPaid(b.dataset.from, b.dataset.to, +b.dataset.amt, null, b.dataset.pk);
            else if (act === 'plan-lock') lockPlan();
            else if (act === 'plan-unlock') unlockPlan();
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
            else if (el.dataset.part) { f.parts[el.dataset.part] = el.value; f.rf = null; renderPreview(); }
            else if (el.id === 'lg-f-rate-in') { f.rate = el.value.trim(); renderPreview(); }
            else if (el.id === 'lg-q') { S.filter.q = el.value; renderItems(); }
        });
        root.addEventListener('change', (ev) => {
            const el = ev.target, f = S.form;
            if (el.dataset.pick) return;
            if (el.id === 'lg-f-payer' && f) { f.payer = el.value; renderPreview(); }
            else if (el.id === 'lg-f-date' && f) { f.date = el.value; renderPreview(); }
            else if (el.dataset.f) { S.filter[el.dataset.f] = el.value; renderItems(); }
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

    // 從頂端帳務提醒跳進來：切到明細（或清帳）並讓相關項目閃兩下
    function focusItems(ex, tr) {
        build(); bind();
        const useEx = ex.length > 0;
        if (useEx) {
            S.filter = { ...S.filter, scope: 'group', dates: [], cats: [], payer: '', members: [], cur: '', q: '' };
            ex.forEach((id) => { const e = E()[id]; if (e && e.date) S.listShut[e.date] = false; });
            renderFilterOpts(); setTab('list'); setSub('list'); renderItems();
        } else {
            S.fold.tr = false;
            setTab('list'); setSub('settle'); renderSettle();
        }
        const t0 = Date.now();
        const find = () => (useEx
            ? ex.map((id) => document.querySelector(`#lg-items .lg-item-h[data-id="${id}"]`)).filter(Boolean).map((b) => b.closest('.lg-item'))
            : tr.map((id) => document.querySelector(`#lg-p-list [data-act="tr-done"][data-id="${id}"], #lg-s-settle [data-act="tr-done"][data-id="${id}"]`)).filter(Boolean).map((b) => b.closest('.lg-tr')).filter(Boolean));
        const tick = () => {
            const els = find();
            if (els.length) {
                els[0].scrollIntoView({ block: 'center' });
                els.forEach((el) => { el.classList.remove('lg-flash'); void el.offsetWidth; el.classList.add('lg-flash'); setTimeout(() => el.classList.remove('lg-flash'), 1600); });
            } else if (Date.now() - t0 < 5000) setTimeout(tick, 150);
        };
        tick();
    }

    window.LEDGER = {
        focus: focusItems,
        open() { build(); bind(); render(); if (S.tab === 'fx') setTab('fx'); },
        onAuth() { bind(); render(); }
    };
})();
