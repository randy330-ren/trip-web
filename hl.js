(function () {
    const $ = (id) => document.getElementById(id);
    const esc = escapeHtml;
    const CAP = 50, SHOW = 4, ADMIN_NAME = '管理員';
    const DEF_EMO = ['👍', '❤️', '😂', '😮', '🥹', '🔥'];
    const PUSH = '-0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz';
    const keyTs = (k) => { let t = 0; for (let i = 0; i < 8; i++) t = t * 64 + Math.max(0, PUSH.indexOf(String(k).charAt(i))); return t; };
    const pad = (n) => String(n).padStart(2, '0');
    const hm = (ts) => { const d = new Date(ts); return `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
    const meta = (k) => dayMeta[+String(k).slice(1) - 1];
    const dayLabel = (k) => { const m = meta(k); return m ? `${pad(m.month)}/${pad(m.day)} ${m.week}・D${m.n}` : k; };
    const cssUrl = (u) => esc(String(u).replace(/["'()\\\s]/g, (c) => encodeURIComponent(c)));
    const isCld = (u) => /^https:\/\/res\.cloudinary\.com\//.test(String(u || ''));
    const TITLES = {
        early: ['⏰', '頭香王', '當天第一個分享照片的旅伴'],
        share: ['📸', '分享王', '當天分享最多照片的旅伴'],
        welcome: ['💖', '歡迎王', '當天你的照片收到最多心情'],
        topic: ['💬', '話題王', '當天最多留言的照片是你分享的'],
        helper: ['🙌', '熱心王', '當天幫大家按最多心情'],
        pop: ['👑', '旅程人氣王', '整趟旅程收到最多心情'],
        full: ['📅', '全勤王', '每天都有分享照片'],
        pay: ['💳', '墊費王', '當天墊付金額最多的旅伴', '整趟旅程墊付金額最多的旅伴'],
        cnt: ['📝', '記帳王', '當天記帳筆數最多的旅伴', '整趟旅程記帳筆數最多的旅伴'],
        spend: ['💸', '花錢王', '當天應分攤金額最多的旅伴', '整趟旅程應分攤金額最多的旅伴'],
        save: ['🪙', '最省王', '當天應分攤金額最少的旅伴', '整趟旅程應分攤金額最少的旅伴']
    };

    const ORDER = ['topic', 'early', 'helper', 'share', 'welcome'];
    const LG = ['pay', 'cnt', 'spend', 'save'];
    const ALLD = ORDER.concat(LG);
    const NT = { at: ['📌', '有人在貼文中標注你'], all: ['📌', '有人@全部'], myl: ['❤️', '有人對你的貼文按讚'], myc: ['💬', '有人對你的貼文留言'], photo: ['📸', '有人新增了貼文'], cmt: ['💬', '有人對貼文留言'] };

    const S = {
        built: false, active: false, live: false, booted: false, jumped: false,
        photos: cacheLoad('highlights') || {}, photosLive: false, emojis: cacheLoad('hl_emojis'), emoLoaded: false, seeding: false,
        tasks: [], gone: new Set(), qerr: '',
        react: {}, comments: {}, members: {}, rts: {}, award: {}, lg: { people: {}, exps: {}, ok: true }, ready: {}, tload: null, fid: null, pubRefs: [], privRefs: [], privKey: null,
        seen: null, dis: new Set(), nl: [], settling: new Set(),
        open: new Set(), html: {}, raf: 0, det: null, zoom: false, toBottom: false, sheet: null, pickDay: null, winOpen: false
    };

    const signed = () => !!currentUserUid;
    const privDb = () => (memberUser ? db : (adminUser ? adminDb : null));
    const fail = (e) => alert('操作失敗：' + (e && e.code === 'PERMISSION_DENIED' ? '沒有權限（請確認 Firebase Rules 已更新）' : (e && e.message) || e));
    const guard = () => { if (isOffline()) { offlineAlert(); return false; } return true; };

    // ---------- 離線上傳佇列（IndexedDB，撐得過關 App / 重開機） ----------
    const QDB = 'hl-queue', QST = 'q', QMAX = 6;
    let qdbP = null;
    function qdb() {
        if (!qdbP) qdbP = new Promise((res, rej) => {
            const r = indexedDB.open(QDB, 1);
            r.onupgradeneeded = () => {
                const d = r.result;
                const st = d.objectStoreNames.contains(QST) ? r.transaction.objectStore(QST) : d.createObjectStore(QST, { keyPath: 'id' });
                if (!st.indexNames.contains('uid')) st.createIndex('uid', 'uid');
            };
            r.onsuccess = () => { r.result.onversionchange = () => { r.result.close(); qdbP = null; }; res(r.result); };
            r.onerror = () => rej(r.error || new Error('無法開啟本機暫存'));
            r.onblocked = () => rej(new Error('本機暫存被其他分頁占用'));
        });
        qdbP.catch(() => { qdbP = null; });
        return qdbP;
    }
    function qTx(mode, fn) {
        return qdb().then(d => new Promise((res, rej) => {
            const t = d.transaction(QST, mode), rq = fn(t.objectStore(QST));
            t.oncomplete = () => res(rq ? rq.result : undefined);
            t.onerror = t.onabort = () => rej(t.error || new Error('本機暫存失敗'));
        }));
    }
    const qPut = (rec) => qTx('readwrite', st => st.put(rec));
    const errName = (e) => (e && (e.name || e.message)) ? String(e.name || e.message).slice(0, 60) : '未知錯誤';
    async function qSave(rec) {
        try { await qPut(rec); return; } catch (e1) {
            try {
                const { blob, ...rest } = rec;
                await qPut({ ...rest, buf: await blob.arrayBuffer(), type: blob.type || 'image/jpeg' });
            } catch (e2) { throw new Error(errName(e1) + ' / ' + errName(e2)); }
        }
    }
    const recBlob = (r) => (r && (r.blob || (r.buf ? new Blob([r.buf], { type: r.type || 'image/jpeg' }) : null)));
    const qDel = (id) => qTx('readwrite', st => st.delete(id));
    const qMine = (uid) => (uid ? qTx('readonly', st => st.index('uid').getAll(uid)) : Promise.resolve([]));
    const qTries = (id, n) => qTx('readwrite', st => { const g = st.get(id); g.onsuccess = () => { const r = g.result; if (r) { r.tries = n; st.put(r); } }; return g; });
    const qSafe = (p) => p.catch(() => null);
    const qid = () => 'q' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

    // ---------- 資料 ----------
    function dayList(k, cut) {
        return Object.entries(S.photos[k] || {}).filter(([, p]) => p && p.url)
            .map(([id, p]) => ({ ...p, id, day: k, ts: keyTs(id) })).filter(p => !cut || p.ts < cut).sort((a, b) => a.ts - b.ts);
    }
    const allList = () => dayMeta.flatMap(d => dayList('d' + d.n));
    const listOf = (l) => (l === 'all' ? allList() : dayList(l));
    const reacts = (p) => ((S.react[p.day] || {})[p.id]) || {};
    const rtsOf = (p) => ((S.rts[p.day] || {})[p.id]) || {};
    const rCount = (p, cut) => {
        const r = Object.keys(reacts(p));
        if (!cut) return r.length;
        const t = rtsOf(p);
        return r.filter(u => !(t[u] >= cut)).length;
    };
    const comments = (p, cut) => Object.entries(((S.comments[p.day] || {})[p.id]) || {})
        .map(([cid, c]) => ({ ...c, cid })).filter(c => !cut || (c.ts || 0) < cut).sort((a, b) => (a.ts || 0) - (b.ts || 0));
    const myCount = (k) => dayList(k).filter(p => p.uid === currentUserUid).length;
    const quota = (k) => (isEditor ? Infinity : Math.max(0, MAX_HIGHLIGHTS_PER_DAY - myCount(k) - taskCount(k)));
    function emoList() {
        const src = S.emojis || Object.fromEntries(DEF_EMO.map((e, i) => ['e' + (i + 1), { e, o: i }]));
        return Object.entries(src).filter(([, v]) => v && v.e).map(([k, v]) => ({ k, e: v.e, o: +v.o || 0 })).sort((a, b) => a.o - b.o);
    }
    const emoUses = (k) => Object.values(S.react).reduce((n, d) => n + Object.values(d || {}).reduce((m, p) => m + Object.values(p || {}).filter(v => v === k).length, 0), 0);
    function topEmo(votes) {
        const n = {};
        votes.forEach(v => { n[v] = (n[v] || 0) + 1; });
        let best = null;
        emoList().forEach(em => { if (n[em.k] && (!best || n[em.k] > best.n)) best = { e: em.e, n: n[em.k] }; });
        return best;
    }
    const emoText = (votes) => { const t = topEmo(votes); return t ? `${esc(t.e)} ${t.n}` : '🤍 0'; };

    // ---------- 稱號 ----------
    const membersReady = () => !!S.ready.members && Object.keys(S.members).length > 0;
    const isAdm = (uid, label) => (adminUser && adminUser.uid === uid) || label === ADMIN_NAME || (membersReady() && !S.members[uid]);
    function nameOf(uid) {
        if (S.members[uid] && S.members[uid].name) return S.members[uid].name;
        const p = allList().reverse().find(x => x.uid === uid);
        return (p && p.author) || '旅伴';
    }
    const groupBy = (ps) => { const by = {}; ps.forEach(p => (by[p.uid] = by[p.uid] || []).push(p)); return by; };
    function pickMax(cands) {
        let best = null;
        cands.forEach(c => { if (c.n >= c.min && (!best || c.n > best.n || (c.n === best.n && c.t < best.t))) best = c; });
        return best;
    }
    const dayEnd = (k) => { const m = meta(k); return Date.UTC(TRIP_YEAR, m.month - 1, m.day + 1) - 9 * 36e5; };
    const uniq = (a) => [...new Set(a)];
    const rank = (cands) => uniq(cands.filter(c => c.n >= c.min).sort((a, b) => b.n - a.n || a.t - b.t).map(c => c.u));
    function ranks(k, cut) {
        const all = dayList(k, cut), ps = all.filter(p => !isAdm(p.uid, p.author));
        const r = { early: uniq(ps.map(p => p.uid)) };
        if (!ps.length) return r;
        const by = groupBy(ps);
        r.share = rank(Object.entries(by).map(([u, l]) => ({ u, n: l.length, t: l[l.length - 1].ts, min: 2 })));
        if (!signed()) return r;
        r.welcome = rank(Object.entries(by).map(([u, l]) => ({ u, n: l.reduce((s, p) => s + rCount(p, cut), 0), t: l[0].ts, min: 1 })));
        r.topic = rank(ps.map(p => { const cl = comments(p, cut); return { u: p.uid, n: cl.length, t: cl.length ? (cl[cl.length - 1].ts || 0) : 0, min: 1 }; }));
        const given = {};
        all.forEach(p => {
            const t = rtsOf(p);
            Object.keys(reacts(p)).forEach(ru => { if (ru !== p.uid && !isAdm(ru) && !(cut && t[ru] >= cut)) given[ru] = (given[ru] || 0) + 1; });
        });
        r.helper = rank(Object.entries(given).map(([u, n]) => ({ u, n, t: 0, min: 1 })).sort((a, b) => nameOf(a.u).localeCompare(nameOf(b.u))));
        return r;
    }
    function assign(r) {
        const used = new Set(), out = {};
        ORDER.forEach(id => { const u = (r[id] || []).find(x => !used.has(x)); if (u) { out[id] = u; used.add(u); } });
        return out;
    }
    // ---------- 記帳獎（團體記帳；金額用基準幣別；只算有綁定帳號的團員） ----------
    const lgOn = () => signed() && !!S.ready.lgp && !!S.ready.lge && S.lg.ok;
    const lgNew = () => ({ pay: {}, cnt: {}, spend: {} });
    let lgMemo = null;
    function lgAgg() {
        const L = S.lg;
        if (lgMemo && lgMemo.e === L.exps && lgMemo.p === L.people && lgMemo.m === S.members) return lgMemo.r;
        const pu = {};
        Object.entries(L.people).forEach(([pid, p]) => { if (p && p.uid) pu[pid] = p.uid; });
        const byDate = {}, all = lgNew();
        const add = (m, u, n, t) => { if (!u || isAdm(u)) return; const x = m[u] || (m[u] = { n: 0, t }); x.n += n; if (t < x.t) x.t = t; };
        Object.values(L.exps).forEach(e => {
            if (!e || !e.shares) return;
            const t = e.ts || 0, bd = byDate[e.date] || (byDate[e.date] = lgNew());
            [bd, all].forEach(g => {
                add(g.pay, pu[e.payer], Number.isInteger(e.baseAmt) ? e.baseAmt : 0, t);
                add(g.cnt, e.by, 1, t);
                Object.entries(e.shares).forEach(([pid, s]) => add(g.spend, pu[pid], s && Number.isInteger(s.b) ? s.b : 0, t));
            });
        });
        const r = { byDate, all };
        lgMemo = { e: L.exps, p: L.people, m: S.members, r };
        return r;
    }
    function lgPick(g) {
        const out = {}, best = (m) => {
            let b = null;
            Object.entries(m).forEach(([u, v]) => { if (v.n > 0 && (!b || v.n > b.n || (v.n === b.n && v.t < b.t))) b = { u, n: v.n, t: v.t }; });
            return b;
        };
        const p = best(g.pay), c = best(g.cnt), s = best(g.spend);
        if (p) out.pay = p.u;
        if (c) out.cnt = c.u;
        if (s) out.spend = s.u;
        const es = Object.entries(g.spend);
        if (es.length >= 2) {
            let lo = null, hi = 0;
            es.forEach(([u, v]) => { hi = Math.max(hi, v.n); if (!lo || v.n < lo.n || (v.n === lo.n && v.t < lo.t)) lo = { u, n: v.n, t: v.t }; });
            if (lo.n < hi) out.save = lo.u;
        }
        return out;
    }
    const lgDay = (k) => {
        if (!lgOn()) return {};
        const m = meta(k);
        return lgPick(lgAgg().byDate[`${TRIP_YEAR}-${pad(m.month)}-${pad(m.day)}`] || lgNew());
    };
    function dayTitles(k) {
        const f = S.award[k];
        const lg = f && f.lg ? Object.fromEntries(LG.filter(id => f[id]).map(id => [id, f[id]])) : lgDay(k);
        if (signed() && S.ready.award && f) return { ...Object.fromEntries(ORDER.filter(id => f[id]).map(id => [id, f[id]])), ...lg };
        const end = dayEnd(k);
        return { ...assign(ranks(k, Date.now() >= end ? end : 0)), ...lg };
    }
    // 日本時間當天 24:00 過後，第一位開啟花絮的會員把結果寫進資料庫；先寫入者為準，之後不再變動
    function settle() {
        if (!signed() || !allReady() || !S.ready.lgp || !S.ready.lge) return;
        dayMeta.forEach(d => {
            const k = 'd' + d.n, end = dayEnd(k), f = S.award[k];
            if (S.settling.has(k) || Date.now() < end || (f && (f.lg || !S.lg.ok))) return;
            S.settling.add(k);
            const lg = S.lg.ok ? { ...lgDay(k), lg: true } : {};
            const ref = createDb().ref('hl_award/' + k);
            (f ? ref.update(lg) : ref.set({ ...assign(ranks(k, end)), ...lg, ts: firebase.database.ServerValue.TIMESTAMP })).catch(() => { });
        });
    }
    function tripTitles() {
        const ps = allList().filter(p => !isAdm(p.uid, p.author));
        const out = {};
        const days = dayMeta.map(d => 'd' + d.n);
        const last = days.reduce((m, k, i) => (ps.some(p => p.day === k) ? i : m), -1);
        if (last >= 1) {
            const full = Object.keys(groupBy(ps)).filter(u => days.slice(0, last + 1).every(k => ps.some(p => p.day === k && p.uid === u)));
            if (full.length) out.full = full;
        }
        if (signed()) {
            const pp = pickMax(Object.entries(groupBy(ps)).map(([u, l]) => ({ u, n: l.reduce((s, p) => s + rCount(p), 0), t: l[0].ts, min: 1 })));
            if (pp) out.pop = pp.u;
        }
        if (lgOn()) Object.assign(out, lgPick(lgAgg().all));
        return out;
    }
    const medal = (id, uids, dark) => `<span class="hl-md${dark ? ' dark' : ''}">${TITLES[id][0]} ${TITLES[id][1]} ${esc([].concat(uids).map(nameOf).join('、'))}</span>`;
    const medalsHtml = (t, order, dark) => order.filter(id => t[id]).map(id => medal(id, t[id], dark && id === 'pop')).join('');

    // ---------- 監聽 ----------
    function on(ref, bag, cb, onErr) { const f = ref.on('value', (s) => cb(s.val()), onErr || (() => { })); bag.push([ref, f]); }
    function off(bag) { bag.forEach(([r, f]) => r.off('value', f)); bag.length = 0; }
    function bindPub() {
        if (!(S.active || S.live) || S.pubRefs.length) return;
        on(db.ref('highlights'), S.pubRefs, (v) => { S.photos = v || {}; S.photosLive = true; cacheSave('highlights', S.photos); sched(); pump(); });
        on(db.ref('settings/hl_emojis'), S.pubRefs, (v) => { S.emojis = v; S.emoLoaded = true; cacheSave('hl_emojis', v); seed(); sched(); });
    }
    function bindPriv() {
        const d = privDb();
        const key = S.live && d ? (memberUser ? 'm' + memberUser.uid : 'a') : '';
        if (key === S.privKey) return;
        off(S.privRefs);
        S.privKey = key;
        S.ready = {};
        S.lg = { people: {}, exps: {}, ok: true };
        const c = key ? cacheLoad('hl_priv_' + key) : null;
        S.react = (c && c.r) || {};
        S.comments = (c && c.c) || {};
        S.members = (c && c.m) || {};
        S.rts = (c && c.t) || {};
        S.award = (c && c.a) || {};
        S.seen = key ? loadSeen() : null;
        const save = () => cacheSave('hl_priv_' + key, { r: S.react, c: S.comments, m: S.members, t: S.rts, a: S.award });
        if (key) {
            on(d.ref('hl_react'), S.privRefs, (v) => { S.react = v || {}; S.ready.react = 1; save(); sched(); });
            on(d.ref('hl_comments'), S.privRefs, (v) => { S.comments = v || {}; S.ready.comments = 1; save(); sched(); });
            on(d.ref('members'), S.privRefs, (v) => { S.members = v || {}; S.ready.members = 1; save(); sched(); });
            on(d.ref('hl_rts'), S.privRefs, (v) => { S.rts = v || {}; S.ready.rts = 1; save(); sched(); }, () => { S.ready.rts = 1; sched(); });
            on(d.ref('ledger/people'), S.privRefs, (v) => { S.lg.people = v || {}; S.ready.lgp = 1; sched(); }, () => { S.lg.ok = false; S.ready.lgp = 1; sched(); });
            on(d.ref('ledger/expenses'), S.privRefs, (v) => { S.lg.exps = v || {}; S.ready.lge = 1; sched(); }, () => { S.lg.ok = false; S.ready.lge = 1; sched(); });
            on(d.ref('hl_award'), S.privRefs, (v) => { S.award = v || {}; S.ready.award = 1; save(); sched(); }, () => { S.ready.award = 1; sched(); });
        }
        sched();
    }
    function seed() {
        if (!S.emoLoaded || S.emojis || !isEditor || S.seeding) return;
        S.seeding = true;
        const up = {};
        DEF_EMO.forEach((e, i) => { up['e' + (i + 1)] = { e, o: i }; });
        adminDb.ref('settings/hl_emojis').set(up).catch(() => { }).then(() => { S.seeding = false; });
    }

    // ---------- 主畫面 ----------
    function build() {
        S.built = true;
        $('hl-root').innerHTML = `<div class="hl-wrap"><div id="hl-head" class="hl-head"></div><div id="hl-pend"></div><div id="hl-feat"></div>
            <div class="hl-sec"><span>🗓️ 每日花絮</span><button type="button" data-a="days">全部日期 ∨</button></div>
            ${dayMeta.map(d => `<section id="hl-day${d.n}" class="card hl-day"></section>`).join('')}
            <input type="file" id="hl-file" accept="image/*" multiple hidden></div>`;
        $('hl-root').addEventListener('click', onRootClick);
        $('hl-file').addEventListener('change', onFiles);
        buildDet();
        buildSheet();
        window.addEventListener('popstate', () => {
            const st = history.state || {};
            if (S.det && !st.hl) closeDet(true);
            if (S.sheet && !st.hls) closeSheet(true);
        });
        window.addEventListener('online', () => {
            S.tasks.forEach(t => { if (t.st === 'fail' && t.soft) { t.st = 'wait'; t.tries = 0; } });
            pumpAt = 0; tick(); pump();
        });
        document.addEventListener('visibilitychange', () => { if (!document.hidden) pump(); });
        const vv = window.visualViewport;
        if (vv) { vv.addEventListener('resize', fitVV); vv.addEventListener('scroll', fitVV); }
        document.addEventListener('keydown', (e) => {
            if (!S.det || e.target.tagName === 'INPUT') return;
            if (e.key === 'Escape') closeDet();
            else if (e.key === 'ArrowLeft') stepDet(-1);
            else if (e.key === 'ArrowRight') stepDet(1);
        });
    }
    // 登入後在任何分頁都會監聽花絮資料，頂部提示才能在每個分頁出現
    function boot() {
        if (S.booted) return;
        S.booted = true;
        document.addEventListener('visibilitychange', () => { if (document.hidden && S.active) markRead(); });
        window.addEventListener('pagehide', () => { if (S.active) markRead(); });
        setInterval(() => { if (S.live) renderNotices(); }, 60000);
    }
    function sched() { if (!S.raf) S.raf = requestAnimationFrame(() => { S.raf = 0; renderNow(); }); }
    function put(id, html) { if (S.html[id] === html) return; S.html[id] = html; const el = $(id); if (el) el.innerHTML = html; }
    function featured(all) {
        let f = S.fid && all.find(p => p.id === S.fid);
        if (!f && all.length) { f = all[Math.floor(Math.random() * all.length)]; S.fid = f.id; }
        return f || null;
    }

    function renderNow() {
        if (!S.built) { settle(); renderNotices(); return; }
        const all = allList(), si = signed();
        const real = all.filter(p => !isAdm(p.uid, p.author));
        const nc = si ? all.reduce((n, p) => n + comments(p).length, 0) : 0;
        const stats = [[all.length, '張旅行照片'], [new Set(real.map(p => p.uid)).size, '位旅伴分享']];
        if (si) stats.push([nc, '則留言']);
        const trip = medalsHtml(tripTitles(), ['pop', 'full', ...LG], true);
        const act = activeTasks(), running = act.some(t => BUSY.includes(t.st));
        put('hl-head', `<div class="hl-ht"><h2>📸 旅途花絮</h2><span class="hl-pills">${si ? `<button type="button" data-a="tasks" class="hl-pill">📋 任務${act.length ? `<b class="hl-bdg">${act.length}</b>` : ''}</button>` : ''}<button type="button" data-a="album" class="hl-pill"${all.length ? '' : ' disabled'}>共同相簿</button></span></div>
            <p class="hl-sub">${si ? `每人每天最多分享 ${MAX_HIGHLIGHTS_PER_DAY} 張，記錄這趟旅程的片刻` : '登入後可以分享照片、留言和心情'}</p>
            <div class="hl-stats c${stats.length}">${stats.map(([v, l]) => `<div><b>${v}</b><small>${l}</small></div>`).join('')}</div>
            ${trip ? `<div class="hl-mds">${trip}</div>` : ''}
            <div class="hl-acts">${si ? '<button type="button" data-a="share" class="hl-btn pri">＋ 分享照片</button>' : '<button type="button" data-a="login" class="hl-btn pri">👤 會員登入</button>'}
            <button type="button" data-a="random" class="hl-btn soft"${all.length ? '' : ' disabled'}>🎲 隨機回憶</button></div>`);
        put('hl-pend', act.length ? `<div class="hl-pend"><span>${running ? `📤 正在上傳…（還剩 ${act.length} 張）` : `📤 還有 ${act.length} 張照片待上傳，連上網路會自動上傳`}</span><button type="button" data-a="tasks" class="hl-btn line sm">查看任務</button></div>` : '');
        const f = featured(all);
        put('hl-feat', f ? `<div class="hl-sec"><span>✨ 本次旅行精選</span><button type="button" data-a="det" data-l="all" data-d="${f.day}" data-i="${esc(f.id)}">看看回憶 →</button></div>
            <button type="button" class="hl-feat" data-a="det" data-l="all" data-d="${f.day}" data-i="${esc(f.id)}">
            <span class="hl-fbg" style="background-image:url('${cssUrl(f.thumb || f.url)}')"></span>
            <img class="hl-fimg" src="${esc(f.url)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">
            <span class="hl-fov"><span class="hl-ftag">TRIP HIGHLIGHT · DAY ${meta(f.day).n}</span>
            ${f.caption ? `<span class="hl-ft">${esc(f.caption)}</span>` : ''}
            <span class="hl-fm">${si ? `<span>${emoText(Object.values(reacts(f)))}</span><span>💬 ${comments(f).length}</span>` : ''}<span>${esc(f.author || '')} 上傳</span></span></span></button>` : '');
        dayMeta.forEach(d => put('hl-day' + d.n, dayHtml('d' + d.n)));
        if (S.det) renderDet();
        settle();
        checkWins();
        renderNotices();
    }
    function dayHtml(k) {
        const ps = dayList(k), exp = S.open.has(k), si = signed(), m = meta(k);
        const show = exp ? ps : ps.slice(0, SHOW);
        const tt = document.querySelector(`#page-itinerary [data-key="${k}_title"]`);
        const sub = [tt ? tt.textContent.trim() : '', m.tag].filter(Boolean).join('｜');
        const tile = (p) => `<button type="button" class="hl-tile" data-a="det" data-l="${k}" data-d="${k}" data-i="${esc(p.id)}">
            <span class="hl-ti"><img src="${esc(p.thumb || p.url)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'"></span>
            <span class="hl-tx">${p.caption ? `<span class="hl-tc">${esc(p.caption)}</span>` : ''}
            <span class="hl-tm"><span class="hl-ta">${esc(p.author || '')}</span>${si ? `<span class="hl-cnt"><span>${emoText(Object.values(reacts(p)))}</span><span>💬 ${comments(p).length}</span></span>` : ''}</span></span></button>`;
        const sum = si && ps.length ? `<span class="hl-dsum">${emoText(ps.flatMap(p => Object.values(reacts(p))))} · 💬 ${ps.reduce((n, p) => n + comments(p).length, 0)} 則留言</span>` : '<span></span>';
        const more = ps.length > SHOW ? `<button type="button" data-a="more" data-d="${k}" class="hl-link">${exp ? '收合 ▲' : `查看全部 ${ps.length} 張 →`}</button>` : '';
        const md = medalsHtml(dayTitles(k), ['early', 'share', 'welcome', 'topic', 'helper', ...LG]);
        return `<div class="hl-dh"><div><p class="hl-dt">${pad(m.month)}/${pad(m.day)} ${m.week} · DAY ${m.n}</p>${sub ? `<p class="hl-ds">${esc(sub)}</p>` : ''}</div>${ps.length ? `<span class="hl-pill sm">${ps.length} 張照片</span>` : ''}</div>
            ${md ? `<div class="hl-mds">${md}</div>` : ''}
            ${ps.length ? `<div class="hl-grid">${show.map(tile).join('')}</div>` : '<p class="hl-empty">還沒有人分享這天的照片。</p>'}
            ${ps.length && (si || more) ? `<div class="hl-dfoot">${sum}${more}</div>` : ''}
            ${si ? `<button type="button" data-a="share" data-d="${k}" class="hl-btn dash">＋ 新增到 D${m.n}</button>` : ''}`;
    }

    async function onRootClick(e) {
        const b = e.target.closest('[data-a]');
        if (!b || b.disabled) return;
        const { a, d, l, i } = b.dataset;
        if (a === 'share') share(d);
        else if (a === 'tasks') openTasks();
        else if (a === 'login') openMemberModal();
        else if (a === 'det') openDet(l, d, i);
        else if (a === 'album') { const p = allList()[0]; if (p) openDet('all', p.day, p.id); }
        else if (a === 'random') {
            const all = allList();
            if (all.length) { const p = all[Math.floor(Math.random() * all.length)]; openDet('all', p.day, p.id); }
        } else if (a === 'days') {
            const n = await openChoiceModal({ title: '跳到哪一天？', options: dayMeta.map(x => ({ label: `D${x.n}・${x.month}/${x.day} ${x.week}（${dayList('d' + x.n).length} 張）`, value: x.n })) });
            if (n) jumpToDay(n, { flash: true });
        } else if (a === 'more') {
            if (S.open.has(d)) {
                S.open.delete(d);
                renderNow();
                const el = $('hl-day' + meta(d).n);
                const top = el.getBoundingClientRect().top + window.scrollY - $('sticky-wrapper').offsetHeight - 10;
                if (top < window.scrollY) window.scrollTo({ top, behavior: 'auto' });
            } else { S.open.add(d); renderNow(); }
        }
    }

    // ---------- 獲得稱號 ----------
    function checkWins() {
        const me = memberUser && memberUser.uid;
        if (!me || !S.active || !S.photosLive || S.winOpen || !S.ready.react || !S.ready.comments || !S.ready.members || !S.ready.award || (S.sheet && S.sheet.busy)) return;
        const lsKey = 'hl_won_' + me;
        let seen = {};
        try { seen = JSON.parse(localStorage.getItem(lsKey) || '{}') || {}; } catch (e) { }
        const fresh = [];
        dayMeta.forEach(d => {
            const k = 'd' + d.n, f = S.award[k];
            if (f) ALLD.forEach(id => { if (f[id] === me && !seen['a_' + k + '_' + id]) fresh.push({ key: 'a_' + k + '_' + id, id, k }); });
        });
        Object.entries(tripTitles()).forEach(([id, u]) => { if ([].concat(u).includes(me) && !seen['trip_' + id]) fresh.push({ key: 'trip_' + id, id, k: null }); });
        if (!fresh.length) return;
        fresh.forEach(f => { seen[f.key] = Date.now(); });
        try { localStorage.setItem(lsKey, JSON.stringify(seen)); } catch (e) { }
        showWin(fresh);
    }
    function showWin(list) {
        S.winOpen = true;
        const [m, ...rest] = list, T = TITLES[m.id];
        const ov = document.createElement('div');
        ov.className = 'hl-win';
        const colors = ['#b08758', '#3b4d43', '#f59e0b', '#e11d48', '#10b981', '#60a5fa'];
        ov.innerHTML = `<div class="hl-conf">${Array.from({ length: 28 }, (_, i) => `<i style="left:${Math.random() * 100}%;background:${colors[i % colors.length]};animation-delay:${(Math.random() * .5).toFixed(2)}s;transform:rotate(${Math.round(Math.random() * 360)}deg)"></i>`).join('')}</div>
            <div class="hl-wcard"><div class="hl-wic">${T[0]}</div>
            <p class="hl-wk">${m.k ? `D${meta(m.k).n} 花絮小挑戰` : '旅程挑戰'}</p>
            <p class="hl-wt">你是${m.k ? '今天的' : ''}${T[1]}！</p><p class="hl-wd">${m.k ? T[2] : (T[3] || T[2])}</p>
            ${rest.length ? `<div class="hl-mds c">${rest.map(r => `<span class="hl-md">${TITLES[r.id][0]} 同時獲得：${r.k ? `D${meta(r.k).n} ` : ''}${TITLES[r.id][1]}</span>`).join('')}</div>` : ''}
            <button type="button" class="hl-btn pri">太棒了</button></div>`;
        document.body.appendChild(ov);
        setTimeout(() => { const c = ov.querySelector('.hl-conf'); if (c) c.remove(); }, 2600);
        ov.querySelector('button').addEventListener('click', () => { ov.remove(); S.winOpen = false; });
    }

    // ---------- 頂部提示（按讚／留言／新貼文／標注／得獎） ----------
    const allReady = () => !!(S.photosLive && S.ready.react && S.ready.comments && S.ready.members && S.ready.rts && S.ready.award);
    const seenKey = () => 'hl_seen_' + currentUserUid;
    function loadSeen() {
        try { const v = localStorage.getItem(seenKey()); return v === null ? null : (+v || 0); } catch (e) { return null; }
    }
    function saveSeen() { try { localStorage.setItem(seenKey(), String(S.seen)); } catch (e) { } }
    function latest() {
        let m = 0;
        allList().forEach(p => {
            m = Math.max(m, p.ts);
            comments(p).forEach(c => { m = Math.max(m, c.ts || 0); });
            Object.values(rtsOf(p)).forEach(t => { m = Math.max(m, +t || 0); });
        });
        Object.values(S.award).forEach(a => { m = Math.max(m, (a && a.ts) || 0); });
        return m;
    }
    function markRead() {
        if (!currentUserUid || !allReady() || S.seen === null) return;
        const m = latest();
        if (m > S.seen) { S.seen = m; saveSeen(); }
    }
    function calcNotices() {
        const me = currentUserUid;
        if (!me || !S.live || !allReady()) return [];
        if (S.seen === null) { S.seen = latest(); saveSeen(); return []; }
        const seen = S.seen, best = {};
        const add = (type, ts, p) => { if (ts > seen && !(best[type] && best[type].ts >= ts)) best[type] = { type, ts, day: p.day, id: p.id, key: type + ':' + ts }; };
        allList().forEach(p => {
            const mine = p.uid === me;
            if (!mine) add(p.mentions && p.mentions[me] ? 'at' : p.mentionAll ? 'all' : 'photo', p.ts, p);
            comments(p).forEach(c => { if (c.uid !== me) add(mine ? 'myc' : 'cmt', c.ts || 0, p); });
            if (mine) { const rs = reacts(p); Object.entries(rtsOf(p)).forEach(([u, t]) => { if (u !== me && rs[u]) add('myl', +t || 0, p); }); }
        });
        const out = Object.values(best);
        Object.entries(S.award).forEach(([k, f]) => {
            if (!f || !(f.ts > seen) || !meta(k)) return;
            const ids = ALLD.filter(id => f[id]);
            if (!ids.length || ids.some(id => f[id] === me)) return;
            out.push({ type: 'award', ts: f.ts, n: meta(k).n, key: 'award:' + k, text: `D${meta(k).n} 恭喜 ${ids.map(id => nameOf(f[id]) + '成為' + TITLES[id][1]).join('、')}` });
        });
        return out.filter(n => !S.dis.has(n.key)).sort((a, b) => b.ts - a.ts);
    }
    // ---------- 發文提醒（日本時間：8:00 起提醒昨天、12:00 起提醒今天；打開 App 時判斷） ----------
    const prKey = () => 'hl_pr_' + currentUserUid;
    function prLoad() { try { return JSON.parse(localStorage.getItem(prKey()) || '{}') || {}; } catch (e) { return {}; } }
    function prView(keys) {
        const v = prLoad();
        keys.forEach(k => { v[k] = Date.now(); });
        try { localStorage.setItem(prKey(), JSON.stringify(v)); } catch (e) { }
    }
    function postDue() {
        const me = memberUser && memberUser.uid;
        if (!me || !S.live || !S.photosLive || !S.ready.members || S.tload !== me || isEditor || isAdm(me)) return [];
        const j = new Date(Date.now() + 9 * 36e5), h = j.getUTCHours();
        const t = j.getUTCFullYear() === TRIP_YEAR && dayMeta.find(d => d.month === j.getUTCMonth() + 1 && d.day === j.getUTCDate());
        if (!t) return [];
        const posted = (k) => myCount(k) + taskCount(k) > 0, out = [];
        if (h >= 8 && t.n >= 2 && !posted('d' + (t.n - 1))) out.push({ key: 'post:yest:d' + (t.n - 1), k: 'd' + (t.n - 1), txt: '📝 昨天沒有發貼文哦，點擊發貼文？' });
        if (h >= 12 && !posted('d' + t.n)) out.push({ key: 'post:today:d' + t.n, k: 'd' + t.n, txt: '📝 今天還沒有發文哦，點擊發貼文' });
        return out;
    }
    function postEntries() {
        const seen = prLoad();
        return postDue().filter(p => !seen[p.key]).map(p => ({
            key: p.key, txt: p.txt,
            act: () => goPost(p.k, p.key),
            close: () => { prView([p.key]); renderNotices(); }
        }));
    }
    function goPost(k, key) {
        if (key) prView([key]);
        S.jumped = true;
        if (currentTab !== 'highlights') switchTab('highlights', { skipScrollTop: true });
        if (!S.built) build();
        renderNow();
        const n = meta(k).n;
        jumpToDay(n, { instant: true });
        setTimeout(() => {
            const b = document.querySelector(`#hl-day${n} [data-a="share"]`);
            if (b) { b.scrollIntoView({ block: 'center' }); window.flashEl(b); }
        }, 450);
    }
    function goNotice(n) {
        S.dis.add(n.key);
        S.jumped = true;
        if (currentTab !== 'highlights') switchTab('highlights', { skipScrollTop: true });
        if (!S.built) build();
        renderNow();
        if (n.type === 'award') jumpToDay(n.n, { flash: true }); else openDet(n.day, n.day, n.id);
        renderNotices();
    }
    function renderNotices() {
        if (!window.NOTI) return;
        S.nl = calcNotices();
        NOTI.set('hl', S.nl.map(n => ({
            key: n.key, dk: n.type === 'award',
            txt: n.type === 'award' ? '🎉 ' + n.text : NT[n.type][0] + ' ' + NT[n.type][1],
            act: () => goNotice(n),
            close: () => { S.dis.add(n.key); renderNotices(); }
        })));
        NOTI.set('post', postEntries());
    }

    // ---------- 照片詳細畫面 ----------
    let det;
    function buildDet() {
        det = document.createElement('div');
        det.id = 'hl-det';
        det.className = 'hl-ov hidden';
        det.innerHTML = `<div class="hl-pan dark">
            <div class="hl-dbar"><button type="button" data-a="close">‹ 返回</button><span id="hl-dpos"></span><button type="button" data-a="menu" id="hl-dmenu" aria-label="照片選項">⋯</button></div>
            <div class="hl-dscroll" id="hl-dscroll">
                <div class="hl-dimg" id="hl-dimg"><img id="hl-dimgel" alt="">
                    <button type="button" class="hl-nav l" data-a="prev" aria-label="上一張">‹</button>
                    <button type="button" class="hl-nav r" data-a="next" aria-label="下一張">›</button></div>
                <div class="hl-dinfo" id="hl-dinfo"></div>
            </div>
            <form class="hl-dinput" id="hl-dinput"><input id="hl-cin" maxlength="${CAP}" placeholder="寫點留言（${CAP} 字內）" enterkeyhint="send" autocomplete="off"><button type="submit">送出</button></form>
        </div>`;
        document.body.appendChild(det);
        det.addEventListener('click', (e) => {
            if (e.target.id === 'hl-dimgel') { S.zoom = !S.zoom; det.classList.toggle('zoom', S.zoom); return; }
            const b = e.target.closest('[data-a]');
            if (!b) return;
            const a = b.dataset.a;
            if (a === 'close') closeDet();
            else if (a === 'prev') stepDet(-1);
            else if (a === 'next') stepDet(1);
            else if (a === 'menu') photoMenu();
            else if (a === 'react') react(b.dataset.k);
            else if (a === 'emo') emoMenu();
            else if (a === 'cdel') delComment(b.dataset.c);
            else if (a === 'login') { closeDet(); openMemberModal(); }
        });
        $('hl-dinput').addEventListener('submit', (e) => { e.preventDefault(); sendComment(); });
        let x = null, y = 0;
        const img = $('hl-dimg');
        img.addEventListener('touchstart', (e) => { if (e.touches.length === 1) { x = e.touches[0].clientX; y = e.touches[0].clientY; } else x = null; }, { passive: true });
        img.addEventListener('touchend', (e) => {
            if (x === null) return;
            const dx = e.changedTouches[0].clientX - x, dy = e.changedTouches[0].clientY - y;
            x = null;
            if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) stepDet(dx < 0 ? 1 : -1);
        }, { passive: true });
    }
    function fitVV() {
        const vv = window.visualViewport;
        [det, sheetEl].forEach(el => {
            if (!el) return;
            el.style.height = vv ? vv.height + 'px' : '';
            el.style.top = vv ? vv.offsetTop + 'px' : '0px';
        });
    }
    const capHtml = (p) => {
        let h = esc(p.caption);
        if (p.mentionAll) h = h.split('@全部').join('<span class="hl-at">@全部</span>');
        Object.keys(p.mentions || {}).forEach(u => { const n = S.members[u] && S.members[u].name; if (n) h = h.split(esc('@' + n)).join(`<span class="hl-at">${esc('@' + n)}</span>`); });
        return h;
    };
    const curPhoto = () => S.det && dayList(S.det.d).find(p => p.id === S.det.i);
    function openDet(l, d, i) {
        if (!dayList(d).some(p => p.id === i)) return;
        const was = !!S.det;
        S.det = { l, d, i };
        S.zoom = false;
        det.classList.remove('zoom', 'hidden');
        if (!was) {
            lockScroll();
            try { history.pushState({ hl: 1 }, ''); } catch (e) { }
        }
        fitVV();
        renderDet();
        $('hl-dscroll').scrollTop = 0;
    }
    function closeDet(fromPop) {
        if (!S.det) return;
        if (fromPop !== true && history.state && history.state.hl) { history.back(); return; }
        S.det = null;
        $('hl-cin').blur();
        det.classList.add('hidden');
        unlockScroll();
    }
    function stepDet(dir) {
        if (!S.det) return;
        const ls = listOf(S.det.l), i = ls.findIndex(p => p.day === S.det.d && p.id === S.det.i), q = ls[i + dir];
        if (!q) return;
        S.det = { l: S.det.l, d: q.day, i: q.id };
        renderDet();
        $('hl-dscroll').scrollTop = 0;
    }
    function renderDet() {
        const p = curPhoto();
        if (!p) { closeDet(); return; }
        const ls = listOf(S.det.l), idx = ls.findIndex(q => q.day === p.day && q.id === p.id), si = signed();
        const img = $('hl-dimgel');
        if (img.dataset.src !== p.url) { img.dataset.src = p.url; img.src = p.url; }
        [ls[idx - 1], ls[idx + 1]].forEach(q => { if (q) new Image().src = q.url; });
        $('hl-dpos').textContent = `${idx + 1} / ${ls.length}`;
        det.querySelector('.hl-nav.l').classList.toggle('hidden', idx <= 0);
        det.querySelector('.hl-nav.r').classList.toggle('hidden', idx >= ls.length - 1);
        $('hl-dmenu').classList.toggle('hl-inv', !(isEditor || (si && p.uid === currentUserUid)));
        $('hl-dinput').classList.toggle('hidden', !si);
        let body = `${p.caption ? `<p class="hl-dcap">${capHtml(p)}</p>` : ''}<p class="hl-dmeta">📷 ${esc(p.author || '')}・${dayLabel(p.day)}・${hm(p.ts)}</p>`;
        if (si) {
            const rs = reacts(p), mine = rs[currentUserUid];
            const cl = comments(p);
            body += `<div class="hl-reacts">${emoList().map(em => {
                const n = Object.values(rs).filter(v => v === em.k).length;
                return `<button type="button" data-a="react" data-k="${esc(em.k)}" class="hl-rp${mine === em.k ? ' on' : ''}">${esc(em.e)}<b>${n}</b></button>`;
            }).join('')}${isEditor ? '<button type="button" data-a="emo" class="hl-rp add" aria-label="管理表情">＋</button>' : ''}</div>
                <div class="hl-cm"><p class="hl-cmh">留言 ${cl.length}</p>${cl.length ? cl.map(c => {
                const canDel = isEditor || c.uid === currentUserUid || p.uid === currentUserUid;
                return `<div class="hl-c"><span class="hl-av">${esc(Array.from(String(c.name || '?'))[0])}</span>
                    <div class="hl-cb"><p><b>${esc(c.name || '')}</b><small>${c.ts ? hm(c.ts) : ''}</small></p><p class="hl-ct">${esc(c.text || '')}</p></div>
                    ${canDel ? `<button type="button" data-a="cdel" data-c="${esc(c.cid)}" class="hl-cx" aria-label="刪除留言">✕</button>` : ''}</div>`;
            }).join('') : '<p class="hl-empty">還沒有留言，來當第一個吧。</p>'}</div>`;
        } else {
            body += '<div class="hl-guest"><p>登入後可以看留言和心情</p><button type="button" data-a="login" class="hl-btn pri">👤 會員登入</button></div>';
        }
        const info = $('hl-dinfo'), sc = $('hl-dscroll');
        if (info.dataset.h !== body) {
            const keep = sc.scrollTop;
            info.dataset.h = body;
            info.innerHTML = body;
            sc.scrollTop = S.toBottom ? sc.scrollHeight : keep;
            S.toBottom = false;
        }
    }

    function react(k) {
        const p = curPhoto();
        if (!p || !signed() || !guard()) return;
        if (!S.emojis) { alert('表情尚未啟用，請管理員登入後開啟一次花絮頁。'); return; }
        const db2 = createDb(), ref = db2.ref(`hl_react/${p.day}/${p.id}/${currentUserUid}`), tref = db2.ref(`hl_rts/${p.day}/${p.id}/${currentUserUid}`);
        const had = reacts(p)[currentUserUid] === k;
        (had ? ref.remove() : ref.set(k)).then(() => (had ? tref.remove() : tref.set(firebase.database.ServerValue.TIMESTAMP)).catch(() => { })).catch(fail);
    }
    function sendComment() {
        const p = curPhoto(), inp = $('hl-cin'), t = inp.value.trim();
        if (!p || !t || !signed() || !guard()) return;
        if (t.length > CAP) { alert(`留言最多 ${CAP} 字`); return; }
        inp.value = '';
        S.toBottom = true;
        createDb().ref(`hl_comments/${p.day}/${p.id}`).push({ uid: currentUserUid, name: (currentUserName || ADMIN_NAME).slice(0, 30), text: t, ts: firebase.database.ServerValue.TIMESTAMP })
            .catch((e) => { inp.value = t; fail(e); });
    }
    function delComment(cid) {
        const p = curPhoto();
        if (!p || !guard() || !confirm('確定要刪除這則留言嗎？')) return;
        manageDb().ref(`hl_comments/${p.day}/${p.id}/${cid}`).remove().catch(fail);
    }
    async function photoMenu() {
        const p = curPhoto();
        if (!p || !(isEditor || p.uid === currentUserUid)) return;
        const v = await openChoiceModal({ title: '照片選項', options: [{ label: '✏️ 編輯說明', value: 'edit' }, { label: '🗑️ 刪除照片', value: 'del', danger: true }] });
        if (!v || !guard()) return;
        if (v === 'edit') {
            const r = await openInputModal({ title: '編輯說明', fields: [{ key: 'caption', value: p.caption || '', placeholder: `說明文字（${CAP} 字內）`, max: CAP }], submitLabel: '儲存' });
            if (!r) return;
            if ((r.caption || '').length > CAP) { alert(`說明最多 ${CAP} 字，請縮短後再儲存`); return; }
            manageDb().ref(`highlights/${p.day}/${p.id}`).update({ caption: r.caption || '', mentions: mentionsOrNull(r.caption || ''), mentionAll: hasAll(r.caption) || null })
                .catch((e) => alert('儲存失敗：' + (e.code === 'PERMISSION_DENIED' ? '沒有權限，或這張是舊照片（請刪除後重新上傳）。' : e.message)));
        } else if (confirm('確定要刪除這張照片嗎？留言和心情也會一起刪除。' + (isCld(p.url) ? '\n\n（這張存在 Cloudinary，原圖需要管理員到 Cloudinary 後台刪除）' : ''))) {
            manageDb().ref(`hl_rts/${p.day}/${p.id}`).remove().catch(() => { })
                .then(() => manageDb().ref().update({ [`highlights/${p.day}/${p.id}`]: null, [`hl_react/${p.day}/${p.id}`]: null, [`hl_comments/${p.day}/${p.id}`]: null }))
                .then(() => { if (!isCld(p.url)) markImgDeleted(p.id); }).catch(fail);
        }
    }
    async function emoMenu() {
        if (!isEditor) return;
        const list = emoList();
        const v = await openChoiceModal({ title: '管理表情', options: [{ label: '＋ 新增表情', value: '+' },
            ...list.map(em => ({ label: `🗑️ 刪除 ${em.e}（${emoUses(em.k)} 人使用中）`, value: em.k, danger: true }))] });
        if (!v || !guard()) return;
        const ref = adminDb.ref('settings/hl_emojis');
        if (v === '+') {
            const r = await openInputModal({ title: '新增表情', fields: [{ key: 'e', placeholder: '貼上一個 emoji', max: 16 }], submitLabel: '新增' });
            if (!r || !r.e) return;
            if (list.some(em => em.e === r.e)) { alert('這個表情已經有了'); return; }
            const o = list.reduce((m, em) => Math.max(m, em.o), -1) + 1;
            (S.emojis ? ref.push({ e: r.e, o }) : ref.set({ ...Object.fromEntries(list.map(em => [em.k, { e: em.e, o: em.o }])), x1: { e: r.e, o } })).catch(fail);
        } else {
            const em = list.find(x => x.k === v);
            if (emoUses(v)) { alert(`已經有人用過 ${em.e}，不能刪除。`); return; }
            if (list.length <= 1) { alert('至少要保留一個表情'); return; }
            if (confirm(`確定要刪除 ${em.e} 嗎？`)) ref.child(v).remove().catch(fail);
        }
    }

    // ---------- 標注（@會員名字） ----------
    function mentionsOf(cap) {
        const byName = {};
        Object.entries(S.members).forEach(([u, m]) => { if (m && m.name && u !== currentUserUid) (byName[m.name] = byName[m.name] || []).push(u); });
        const out = {};
        let t = String(cap || '');
        Object.keys(byName).sort((a, b) => b.length - a.length).forEach(n => {
            const tag = '@' + n;
            if (t.includes(tag)) { byName[n].forEach(u => { out[u] = true; }); t = t.split(tag).join(' '.repeat(tag.length)); }
        });
        return out;
    }
    const hasAll = (cap) => String(cap || '').includes('@全部');
    const mentionsOrNull = (cap) => { const m = mentionsOf(cap); return Object.keys(m).length ? m : null; };
    let atEl = null, atInp = null;
    function atHide() { if (atEl) atEl.classList.add('hidden'); atInp = null; }
    function atSuggest(inp) {
        const pos = inp.selectionStart == null ? inp.value.length : inp.selectionStart;
        const m = /@([^\s@]*)$/.exec(inp.value.slice(0, pos));
        const q = m ? m[1].toLowerCase() : '';
        const list = m ? Object.entries(S.members).filter(([u, v]) => v && v.name && u !== currentUserUid && v.name.toLowerCase().includes(q)).slice(0, 8) : [];
        if (m && '全部'.includes(q)) list.unshift(['all', { name: '全部' }]);
        if (!list.length) { atHide(); return; }
        if (!atEl) {
            atEl = document.createElement('div');
            atEl.className = 'hl-at-list hidden';
            atEl.addEventListener('mousedown', (e) => e.preventDefault());
            atEl.addEventListener('click', (e) => {
                const b = e.target.closest('[data-n]');
                if (!b || !atInp || !S.sheet) return;
                const inp = atInp, it = S.sheet.items[+inp.dataset.ix];
                const cur = inp.selectionStart == null ? inp.value.length : inp.selectionStart;
                const before = inp.value.slice(0, cur).replace(/@([^\s@]*)$/, '@' + b.dataset.n + ' ');
                const v = before + inp.value.slice(cur);
                if (!it) return;
                if (v.length > CAP) { atEl.innerHTML = `<p>字數不夠，放不下 @${esc(b.dataset.n)}</p>`; return; }
                inp.value = v; it.cap = v;
                inp.focus();
                inp.setSelectionRange(before.length, before.length);
                const clr = inp.parentNode.querySelector('.hl-clr');
                if (clr) clr.classList.remove('hl-inv');
                atHide();
            });
            sheetEl.appendChild(atEl);
        }
        atInp = inp;
        atEl.innerHTML = list.map(([u, v]) => `<button type="button" data-n="${esc(v.name)}">@${esc(v.name)}</button>`).join('');
        atEl.classList.remove('hidden');
        const r = inp.getBoundingClientRect(), h = atEl.offsetHeight, vv = window.visualViewport;
        const vh = vv ? vv.offsetTop + vv.height : window.innerHeight;
        atEl.style.left = r.left + 'px';
        atEl.style.width = r.width + 'px';
        atEl.style.top = (r.bottom + h + 8 > vh ? Math.max(4, r.top - h - 4) : r.bottom + 4) + 'px';
    }

    // ---------- 上傳 ----------
    let sheetEl;
    function buildSheet() {
        sheetEl = document.createElement('div');
        sheetEl.id = 'hl-sheet';
        sheetEl.className = 'hl-ov hidden';
        sheetEl.innerHTML = `<div class="hl-pan"><div class="hl-sbar"><button type="button" data-a="scancel" id="hl-scancel">取消</button><b id="hl-stitle"></b><button type="button" data-a="sadd" id="hl-sadd">＋ 再加</button></div>
            <div class="hl-sbody" id="hl-sbody"></div><div class="hl-sfoot" id="hl-sfoot"></div></div>`;
        document.body.appendChild(sheetEl);
        sheetEl.addEventListener('click', (e) => {
            const b = e.target.closest('[data-a]');
            if (!b || !S.sheet) return;
            const { a, d, x } = b.dataset;
            if (a === 'scancel' || a === 'sdone') closeSheet();
            else if (a === 'sadd') $('hl-file').click();
            else if (a === 'sday') { S.sheet.day = d; renderSheet(); }
            else if (a === 'sclr') {
                const it = S.sheet.items[+x], inp = b.parentNode.querySelector('input');
                if (it && inp) { it.cap = ''; inp.value = ''; b.classList.add('hl-inv'); inp.focus(); atHide(); }
            } else if (a === 'srm') { const it = S.sheet.items.splice(+x, 1)[0]; if (it) URL.revokeObjectURL(it.prev); if (!S.sheet.items.length) closeSheet(); else renderSheet(); }
            else if (a === 'sgo') startUpload();
            else if (a === 'sretry') retryTasks(x);
            else if (a === 'tdel') delTask(x);
        });
        sheetEl.addEventListener('input', (e) => {
            const ix = e.target.dataset.ix;
            if (ix === undefined || !S.sheet || !S.sheet.items[+ix]) return;
            S.sheet.items[+ix].cap = e.target.value;
            const clr = e.target.parentNode.querySelector('.hl-clr');
            if (clr) clr.classList.toggle('hl-inv', !e.target.value);
            atSuggest(e.target);
        });
        sheetEl.addEventListener('focusout', () => setTimeout(atHide, 150));
    }
    function share(d) {
        if (!signed()) { openMemberModal(); return; }
        S.pickDay = d || (todayDayN() ? 'd' + todayDayN() : 'd1');
        $('hl-file').click();
    }
    function showSheet(sh) {
        S.sheet = sh;
        sheetEl.classList.remove('hidden');
        lockScroll();
        try { history.pushState({ hls: 1 }, ''); } catch (err) { }
        fitVV();
    }
    function onFiles(e) {
        const files = [...e.target.files].filter(f => /^image\//.test(f.type) || /\.(heic|heif)$/i.test(f.name));
        e.target.value = '';
        if (!files.length) return;
        const items = files.map(file => ({ file, prev: URL.createObjectURL(file), cap: '' }));
        const s = S.sheet;
        if (s && s.busy) { items.forEach(it => URL.revokeObjectURL(it.prev)); return; }
        if (s && s.phase === 'edit') s.items.push(...items);
        else if (s) { s.phase = 'edit'; s.items = items; s.day = S.pickDay || 'd1'; }
        else showSheet({ day: S.pickDay || 'd1', items, phase: 'edit', busy: false });
        renderSheet();
    }
    function openTasks() {
        if (!signed()) { openMemberModal(); return; }
        if (!S.sheet) showSheet({ day: 'd1', items: [], phase: 'tasks', busy: false });
        renderSheet();
    }
    function closeSheet(fromPop) {
        const s = S.sheet;
        if (!s || (s.busy && fromPop !== true)) return;
        if (fromPop !== true && history.state && history.state.hls) { history.back(); return; }
        if (s.busy) { try { history.pushState({ hls: 1 }, ''); } catch (e) { } return; }
        atHide();
        s.items.forEach(it => URL.revokeObjectURL(it.prev));
        S.sheet = null;
        sheetEl.classList.add('hidden');
        unlockScroll();
        S.tasks.filter(t => t.st === 'done').forEach(dropTask);
        sched();
    }

    // 任務 = 已確定要上傳的照片；記憶體與手機暫存（IndexedDB）同步，手動重試與自動補傳共用同一條流程
    const BUSY = ['resize', 'up', 'save'];
    const myTasks = () => S.tasks.filter(t => t.uid === currentUserUid);
    const activeTasks = () => myTasks().filter(t => t.st !== 'done');
    const taskCount = (k) => activeTasks().filter(t => t.day === k).length;
    function tick() { sched(); if (S.sheet && S.sheet.phase === 'tasks') renderSheet(); }
    function dropTask(t) {
        S.tasks = S.tasks.filter(x => x !== t);
        S.gone.add(t.id);
        URL.revokeObjectURL(t.prev);
        qSafe(qDel(t.id));
    }
    function retryTasks(id) {
        myTasks().filter(t => t.st === 'fail' && (!id || t.id === id)).forEach(t => { t.st = 'wait'; t.err = ''; t.tries = 0; if (!t.mem) qSafe(qTries(t.id, 0)); });
        tick();
        pump({ force: true });
    }
    function delTask(id) {
        const t = S.tasks.find(x => x.id === id);
        if (!t || BUSY.includes(t.st)) return;
        if (!confirm('確定要刪除這張還沒上傳的照片嗎？刪掉就救不回來了。')) return;
        dropTask(t);
        tick();
    }

    const ST = { wait: '等待上傳', resize: '處理中…', save: '儲存中…', done: '✓ 已完成' };
    function renderSheet() {
        const s = S.sheet;
        if (!s) return;
        atHide();
        if (s.phase === 'edit') renderEdit(s); else renderTaskList(s);
    }
    function renderEdit(s) {
        const q = quota(s.day), n = s.items.length, pend = taskCount(s.day);
        $('hl-stitle').textContent = `分享照片（${n} 張）`;
        $('hl-scancel').textContent = '取消';
        $('hl-scancel').classList.toggle('hl-inv', s.busy);
        $('hl-sadd').classList.toggle('hl-inv', s.busy);
        const days = dayMeta.map(d => `<button type="button" data-a="sday" data-d="d${d.n}" class="hl-dp${s.day === 'd' + d.n ? ' on' : ''}">D${d.n}</button>`).join('');
        const tip = isEditor ? '' : `<p class="hl-tip">你在 D${meta(s.day).n} 已分享 ${myCount(s.day)} 張${pend ? `、待上傳 ${pend} 張` : ''}，${q ? `這次最多還能上傳 ${q} 張` : '今天的額度已用完'}</p>`;
        const test = (cldOnly() ? '<p class="hl-tip">🧪 測試模式：這次只會上傳到備用的 Cloudinary</p>' : '')
            + (isOffline() ? '<p class="hl-tip">📶 目前偵測不到網路。還是可以先選好照片按上傳，照片會存在手機裡，等有網路自動補傳。</p>' : '');
        const row = (it, i) => {
            const over = i >= q;
            const dis = s.busy ? ' disabled' : '';
            return `<div class="hl-row${over ? ' over' : ''}"><span class="hl-pv"><img src="${it.prev}" alt=""><button type="button" data-a="srm" data-x="${i}" class="hl-prm" aria-label="移除這張照片"${dis}>✕</button></span>
                <div class="hl-rb"><div class="hl-ib"><input data-ix="${i}" maxlength="${CAP}" placeholder="說點什麼吧，可以@標注人員" value="${esc(it.cap)}" autocomplete="off"${dis}><button type="button" data-a="sclr" data-x="${i}" class="hl-clr${it.cap ? '' : ' hl-inv'}" aria-label="清除文字"${dis}>✕</button></div>${over ? '<span class="hl-err">超過今天的上限，不會上傳</span>' : ''}</div></div>`;
        };
        $('hl-sbody').innerHTML = `${test}<p class="hl-lb">所屬日期</p><div class="hl-dps">${days}</div>${tip}${s.items.map(row).join('')}`;
        const go = Math.min(n, q);
        $('hl-sfoot').innerHTML = s.busy ? '<button type="button" class="hl-btn pri" disabled>處理並存入手機中…</button>'
            : `<button type="button" data-a="sgo" class="hl-btn pri"${go ? '' : ' disabled'}>${go ? `上傳 ${go} 張` : '沒有可上傳的照片'}</button>`;
    }
    function renderTaskList(s) {
        const ts = myTasks(), doneN = ts.filter(t => t.st === 'done').length;
        $('hl-stitle').textContent = `上傳任務 ${doneN} / ${ts.length}`;
        $('hl-scancel').textContent = '稍後處理';
        $('hl-scancel').classList.remove('hl-inv');
        $('hl-sadd').classList.add('hl-inv');
        const row = (t) => {
            const bk = t.host === 'cld' ? '（備用）' : '';
            const st = t.st === 'fail' ? `<span class="hl-err">⚠️ ${esc(t.err || '上傳失敗')}</span>`
                : t.st === 'up' ? `<span class="hl-bar"><i style="width:${t.pct}%"></i></span><span class="hl-mu">上傳中${bk} ${t.pct}%</span>`
                    : t.st === 'wait' ? `<span class="hl-mu">${isOffline() ? '排隊中，連上網路會自動上傳' : '等待上傳'}</span>`
                        : `<span class="${t.st === 'done' ? 'hl-ok' : 'hl-mu'}">${ST[t.st]}${t.st === 'done' ? bk : ''}</span>`;
            const acts = (t.st === 'fail' ? `<button type="button" data-a="sretry" data-x="${esc(t.id)}" class="hl-btn line sm">重試</button>` : '')
                + (t.st === 'fail' || t.st === 'wait' ? `<button type="button" data-a="tdel" data-x="${esc(t.id)}" class="hl-cx" aria-label="刪除">✕</button>` : '');
            return `<div class="hl-row${t.st === 'fail' ? ' bad' : ''}"><img src="${t.prev}" alt="">
                <div class="hl-rb"><span class="hl-mu">${dayLabel(t.day)}</span><span class="hl-rc${t.cap ? '' : ' none'}">${esc(t.cap || '（無說明）')}</span>${st}</div>
                ${acts ? `<div class="hl-ra">${acts}</div>` : ''}</div>`;
        };
        const open = ts.filter(t => t.st !== 'done');
        const memN = open.filter(t => t.mem).length;
        const tips = (open.some(t => t.big) ? '<p class="hl-tip">⚠️ 有照片無法縮圖，會以原檔上傳，訊號弱時比較容易失敗。</p>' : '')
            + (memN ? `<p class="hl-tip">⚠️ 有 ${memN} 張照片無法存進手機（原因：${esc(S.qerr || '未知')}），關掉 App 就會消失，請保持此畫面開啟直到上傳完成。</p>`
                : (open.length ? '<p class="hl-tip">📥 未完成的照片都已存在手機裡，連上網路會自動上傳，可以先按「稍後處理」離開，之後從花絮頁的「任務」回來看。</p>' : ''));
        $('hl-sbody').innerHTML = ts.length ? tips + ts.map(row).join('') : '<p class="hl-empty">目前沒有上傳任務。</p>';
        $('hl-sfoot').innerHTML = `<div class="hl-two">${ts.some(t => t.st === 'fail') ? '<button type="button" data-a="sretry" class="hl-btn line">全部重試</button>' : ''}<button type="button" data-a="sdone" class="hl-btn pri">完成</button></div>`;
    }
    async function startUpload() {
        const s = S.sheet;
        if (!s || s.phase !== 'edit' || s.busy) return;
        s.items.splice(quota(s.day)).forEach(it => URL.revokeObjectURL(it.prev));
        if (!s.items.length) return;
        s.busy = true;
        renderSheet();
        S.qerr = '';
        // 先縮圖並存進手機，之後就算關掉 App 或重開機也不會掉
        for (const it of s.items) {
            const blob = await toBlob(it.file);
            const t = {
                id: qid(), day: s.day, cap: it.cap.trim().slice(0, CAP), blob, uid: currentUserUid, name: currentUserName || ADMIN_NAME,
                ts: Date.now(), tries: 0, st: 'wait', pct: 0, err: '', host: '', soft: false, mem: false,
                prev: URL.createObjectURL(blob), big: blob === it.file && it.file.size > 4e6
            };
            try { await qSave({ id: t.id, day: t.day, cap: t.cap, blob, uid: t.uid, name: t.name, ts: t.ts, tries: 0 }); }
            catch (e) { t.mem = true; S.qerr = (e && e.message) || '未知錯誤'; }
            S.tasks.push(t);
            URL.revokeObjectURL(it.prev);
        }
        s.items = [];
        s.busy = false;
        s.phase = 'tasks';
        tick();
        pump({ force: true });
    }

    const cldOnly = () => /[?&]hltest=cld\b/.test(location.search);
    let cldCache = null;
    async function cldCfg() {
        if (cldCache) return cldCache;
        const v = (await createDb().ref('secrets/cloudinary').once('value')).val() || {};
        if (!v.cloud || !v.preset) throw new Error('尚未設定 Cloudinary');
        cldCache = { cloud: String(v.cloud).trim(), preset: String(v.preset).trim() };
        return cldCache;
    }
    const soft = (m) => Object.assign(new Error(m), { soft: true });
    function xhrPost(url, fd, onp) {
        return new Promise((res, rej) => {
            const x = new XMLHttpRequest();
            x.open('POST', url);
            x.timeout = 120000;
            x.upload.onprogress = (e) => { if (e.lengthComputable) onp(Math.round(e.loaded / e.total * 100)); };
            x.onload = () => {
                let j = null; try { j = JSON.parse(x.responseText); } catch (e) { }
                if (x.status === 429 || x.status >= 500) return rej(soft('圖床忙碌中'));
                res({ ok: x.status >= 200 && x.status < 300, j, status: x.status });
            };
            // status 0 = 連線根本沒建立（訊號弱、機艙、電信商阻擋），不是伺服器回錯
            x.onerror = () => rej(soft('網路太弱，傳不出去'));
            x.ontimeout = () => rej(soft('上傳逾時'));
            x.send(fd);
        });
    }
    // 縮圖：createImageBitmap 失敗時改用 <img> 解碼，兩者都失敗才退回原檔
    async function toBlob(file) {
        const b = await resizeImage(file);
        if (b && b !== file) return b;
        let url = '';
        try {
            url = URL.createObjectURL(file);
            const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('decode')); i.src = url; });
            const sc = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
            const c = document.createElement('canvas');
            c.width = Math.round(img.naturalWidth * sc); c.height = Math.round(img.naturalHeight * sc);
            const x = c.getContext('2d');
            x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height);
            x.drawImage(img, 0, 0, c.width, c.height);
            const out = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.85));
            if (out) return out;
        } catch (e) { } finally { if (url) URL.revokeObjectURL(url); }
        return file;
    }
    async function upImgbb(blob, onp) {
        const fd = new FormData();
        fd.append('image', blob, 'photo.jpg');
        const { j } = await xhrPost('https://api.imgbb.com/1/upload?key=' + encodeURIComponent(await imgbbKey()), fd, onp);
        if (!j || !j.success) throw new Error((j && j.error && j.error.message) || '上傳失敗');
        const d = j.data;
        return { url: d.url, thumb: (d.thumb && d.thumb.url) || (d.medium && d.medium.url) || '', del: d.delete_url || '' };
    }
    async function upCld(blob, onp) {
        const c = await cldCfg();
        const fd = new FormData();
        fd.append('file', blob, 'photo.jpg');
        fd.append('upload_preset', c.preset);
        const { ok, j } = await xhrPost(`https://api.cloudinary.com/v1_1/${encodeURIComponent(c.cloud)}/image/upload`, fd, onp);
        if (!ok || !j || !j.secure_url) throw new Error((j && j.error && j.error.message) || '上傳失敗');
        return { url: j.secure_url, thumb: j.secure_url.replace('/image/upload/', '/image/upload/c_fill,w_480,h_480,q_auto,f_auto/'), del: '' };
    }
    async function doUpload(blob, onp, onHost) {
        let r = null, err1 = '', soft1 = false;
        if (!cldOnly()) {
            onHost('ibb');
            try { r = await upImgbb(blob, onp); } catch (e) { err1 = 'ImgBB：' + e.message; soft1 = !!e.soft; }
        }
        if (!r) {
            onHost('cld');
            try { r = await upCld(blob, onp); }
            catch (e) { throw Object.assign(new Error([err1, 'Cloudinary：' + e.message].filter(Boolean).join('；')), { soft: !!e.soft || soft1 }); }
        }
        return r;
    }
    async function saveRec(day, r, cap, name, uid) {
        const who = name || ADMIN_NAME;
        const ref = createDb().ref('highlights/' + day).push();
        const m = mentionsOf(cap || '');
        await ref.set({ url: r.url, thumb: r.thumb, caption: cap || '', author: who, uid, ...(Object.keys(m).length ? { mentions: m } : {}), ...(hasAll(cap) ? { mentionAll: true } : {}) });
        if (String(r.del).startsWith('https://ibb.co/')) createDb().ref('img_del/' + ref.key).set({ del: r.del, ...(r.thumb ? { thumb: r.thumb } : {}), author: who, uid, ts: Date.now() }).catch(() => { });
    }
    async function runTask(t) {
        const set = (st, extra = {}) => { Object.assign(t, { st }, extra); tick(); };
        try {
            if (!navigator.onLine) throw soft('目前離線中');
            if (!isEditor && myCount(t.day) >= MAX_HIGHLIGHTS_PER_DAY) throw Object.assign(new Error('已達今天的上限'), { hard: true });
            let last = 0;
            const onp = (pct) => { if (pct - last >= 5 || pct === 100) { last = pct; set('up', { pct }); } };
            if (!t.r) t.r = await doUpload(t.blob, onp, (h) => { last = 0; set('up', { pct: 0, host: h }); });
            set('save');
            await saveRec(t.day, t.r, t.cap, t.name, t.uid);
            await qSafe(qDel(t.id));
            set('done', { err: '' });
            if (!S.sheet || S.sheet.phase !== 'tasks') dropTask(t);
            return true;
        } catch (e) {
            t.tries++;
            t.soft = !!(e && e.soft);
            if (e && e.hard) t.tries = QMAX;
            set('fail', { err: e && e.code === 'PERMISSION_DENIED' ? '沒有權限（請確認 Firebase Rules 已更新）' : ((e && e.message) || '上傳失敗') });
            if (!t.mem) qSafe(qTries(t.id, t.tries));
            return false;
        }
    }

    // ---------- 自動補傳 ----------
    let pumping = false, pumpAt = 0;
    async function pump(o = {}) {
        if (pumping || !signed() || !S.photosLive || (!o.force && !navigator.onLine)) return;
        const todo = myTasks().filter(t => t.st === 'wait' || (t.st === 'fail' && t.tries < QMAX));
        if (!todo.length) return;
        if (!o.force) {
            if (Date.now() - pumpAt < 20000) return;
            pumpAt = Date.now();
        }
        pumping = true;
        tick();
        try {
            for (const t of todo) {
                if (!S.tasks.includes(t) || t.uid !== currentUserUid) continue;
                if (!(await runTask(t)) && t.soft) break; // 網路不通就別硬撐，省電省流量
            }
        } finally { pumping = false; tick(); }
    }
    async function loadTasks() {
        const uid = currentUserUid;
        S.tasks = S.tasks.filter(t => { if (t.uid === uid) return true; URL.revokeObjectURL(t.prev); return false; });
        if (uid) {
            const recs = ((await qSafe(qMine(uid))) || []).sort((a, b) => (a.ts || 0) - (b.ts || 0));
            if (uid !== currentUserUid) return;
            recs.forEach(r => {
                const blob = recBlob(r);
                if (!blob || S.gone.has(r.id) || S.tasks.some(t => t.id === r.id)) return;
                const tries = r.tries || 0, dead = tries >= QMAX;
                S.tasks.push({
                    id: r.id, day: r.day, cap: r.cap || '', blob, uid: r.uid, name: r.name, ts: r.ts || 0, tries, st: dead ? 'fail' : 'wait',
                    err: dead ? '已多次失敗，請按「重試」' : '', pct: 0, host: '', soft: false, mem: false, prev: URL.createObjectURL(blob), big: false
                });
            });
            S.tasks.sort((a, b) => a.ts - b.ts);
        }
        S.tload = uid || null;
        tick();
        sched();
    }

    // ---------- 對外 ----------
    window.HL = {
        open() {
            boot();
            if (!S.built) build();
            S.active = true;
            S.live = signed();
            bindPub();
            bindPriv();
            seed();
            renderNow();
            loadTasks().then(() => pump());
            if (!S.jumped && currentTab === 'highlights') {
                S.jumped = true;
                const n = tabDay.highlights || todayDayN();
                if (n) jumpToDay(n, { instant: true }); else setupScrollSpy();
            }
        },
        onTab(page) {
            const was = S.active;
            if (was && page !== 'highlights') markRead();
            S.active = page === 'highlights';
            if (S.active && currentUserUid) { prView(postDue().map(p => p.key)); renderNotices(); }
            if (!S.active && !S.live) off(S.pubRefs); else bindPub();
            bindPriv();
            sched();
        },
        onAuth() {
            boot();
            S.live = signed();
            if (S.live || S.active) bindPub(); else off(S.pubRefs);
            bindPriv();
            seed();
            if (S.built) {
                if (S.sheet && S.sheet.phase === 'edit') renderSheet();
                loadTasks().then(() => pump());
            }
            sched();
        }
    };
})();
