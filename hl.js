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
        early: ['⏰', '準時王', '當天第一個分享照片的旅伴'],
        share: ['📸', '分享王', '當天分享最多照片的旅伴'],
        welcome: ['💖', '歡迎王', '當天你的照片收到最多心情'],
        topic: ['💬', '話題王', '當天最多留言的照片是你分享的'],
        helper: ['🙌', '熱心王', '當天幫大家按最多心情'],
        pop: ['👑', '旅程人氣王', '整趟旅程收到最多心情'],
        full: ['📅', '全勤王', '每天都有分享照片']
    };

    const S = {
        built: false, active: false, jumped: false,
        photos: cacheLoad('highlights') || {}, photosLive: false, emojis: cacheLoad('hl_emojis'), emoLoaded: false, seeding: false,
        react: {}, comments: {}, members: {}, ready: {}, pubRefs: [], privRefs: [], privKey: null,
        open: new Set(), html: {}, raf: 0, det: null, zoom: false, toBottom: false, sheet: null, pickDay: null, winOpen: false
    };

    const signed = () => !!currentUserUid;
    const privDb = () => (memberUser ? db : (adminUser ? adminDb : null));
    const fail = (e) => alert('操作失敗：' + (e && e.code === 'PERMISSION_DENIED' ? '沒有權限（請確認 Firebase Rules 已更新）' : (e && e.message) || e));
    const guard = () => { if (isOffline()) { offlineAlert(); return false; } return true; };

    // ---------- 資料 ----------
    function dayList(k) {
        return Object.entries(S.photos[k] || {}).filter(([, p]) => p && p.url)
            .map(([id, p]) => ({ ...p, id, day: k, ts: keyTs(id) })).sort((a, b) => a.ts - b.ts);
    }
    const allList = () => dayMeta.flatMap(d => dayList('d' + d.n));
    const listOf = (l) => (l === 'all' ? allList() : dayList(l));
    const reacts = (p) => ((S.react[p.day] || {})[p.id]) || {};
    const rCount = (p) => Object.keys(reacts(p)).length;
    const comments = (p) => Object.entries(((S.comments[p.day] || {})[p.id]) || {})
        .map(([cid, c]) => ({ ...c, cid })).sort((a, b) => (a.ts || 0) - (b.ts || 0));
    const myCount = (k) => dayList(k).filter(p => p.uid === currentUserUid).length;
    const quota = (k) => (isEditor ? Infinity : Math.max(0, MAX_HIGHLIGHTS_PER_DAY - myCount(k)));
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
    function dayTitles(k) {
        const ps = dayList(k).filter(p => !isAdm(p.uid, p.author));
        const out = {};
        if (!ps.length) return out;
        out.early = ps[0].uid;
        const by = groupBy(ps);
        const sh = pickMax(Object.entries(by).map(([u, l]) => ({ u, n: l.length, t: l[l.length - 1].ts, min: 2 })));
        if (sh) out.share = sh.u;
        if (!signed()) return out;
        const wl = pickMax(Object.entries(by).map(([u, l]) => ({ u, n: l.reduce((s, p) => s + rCount(p), 0), t: l[0].ts, min: 1 })));
        if (wl) out.welcome = wl.u;
        const tp = pickMax(ps.map(p => { const cl = comments(p); return { u: p.uid, n: cl.length, t: cl.length ? (cl[cl.length - 1].ts || 0) : 0, min: 1 }; }));
        if (tp) out.topic = tp.u;
        const given = {};
        dayList(k).forEach(p => Object.keys(reacts(p)).forEach(ru => { if (ru !== p.uid && !isAdm(ru)) given[ru] = (given[ru] || 0) + 1; }));
        const hp = pickMax(Object.entries(given).map(([u, n]) => ({ u, n, t: 0, min: 1 })).sort((a, b) => nameOf(a.u).localeCompare(nameOf(b.u))));
        if (hp) out.helper = hp.u;
        return out;
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
        return out;
    }
    const medal = (id, uids, dark) => `<span class="hl-md${dark ? ' dark' : ''}">${TITLES[id][0]} ${TITLES[id][1]} ${esc([].concat(uids).map(nameOf).join('、'))}</span>`;
    const medalsHtml = (t, order, dark) => order.filter(id => t[id]).map(id => medal(id, t[id], dark && id === 'pop')).join('');

    // ---------- 監聽 ----------
    function on(ref, bag, cb) { const f = ref.on('value', (s) => cb(s.val()), () => { }); bag.push([ref, f]); }
    function off(bag) { bag.forEach(([r, f]) => r.off('value', f)); bag.length = 0; }
    function bindPub() {
        if (!S.active || S.pubRefs.length) return;
        on(db.ref('highlights'), S.pubRefs, (v) => { S.photos = v || {}; S.photosLive = true; cacheSave('highlights', S.photos); sched(); });
        on(db.ref('settings/hl_emojis'), S.pubRefs, (v) => { S.emojis = v; S.emoLoaded = true; cacheSave('hl_emojis', v); seed(); sched(); });
    }
    function bindPriv() {
        const d = privDb();
        const key = S.active && d ? (memberUser ? 'm' + memberUser.uid : 'a') : '';
        if (key === S.privKey) return;
        off(S.privRefs);
        S.privKey = key;
        S.ready = {};
        const c = key ? cacheLoad('hl_priv_' + key) : null;
        S.react = (c && c.r) || {};
        S.comments = (c && c.c) || {};
        S.members = (c && c.m) || {};
        const save = () => cacheSave('hl_priv_' + key, { r: S.react, c: S.comments, m: S.members });
        if (key) {
            on(d.ref('hl_react'), S.privRefs, (v) => { S.react = v || {}; S.ready.react = 1; save(); sched(); });
            on(d.ref('hl_comments'), S.privRefs, (v) => { S.comments = v || {}; S.ready.comments = 1; save(); sched(); });
            on(d.ref('members'), S.privRefs, (v) => { S.members = v || {}; S.ready.members = 1; save(); sched(); });
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
        $('hl-root').innerHTML = `<div class="hl-wrap"><div id="hl-head" class="hl-head"></div><div id="hl-feat"></div>
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
        const vv = window.visualViewport;
        if (vv) { vv.addEventListener('resize', fitVV); vv.addEventListener('scroll', fitVV); }
        document.addEventListener('keydown', (e) => {
            if (!S.det || e.target.tagName === 'INPUT') return;
            if (e.key === 'Escape') closeDet();
            else if (e.key === 'ArrowLeft') stepDet(-1);
            else if (e.key === 'ArrowRight') stepDet(1);
        });
    }
    function sched() { if (!S.raf) S.raf = requestAnimationFrame(() => { S.raf = 0; renderNow(); }); }
    function put(id, html) { if (S.html[id] === html) return; S.html[id] = html; const el = $(id); if (el) el.innerHTML = html; }
    function featured(all, si) {
        let f = null;
        all.forEach(p => {
            if (!f) { f = p; return; }
            const a = si ? rCount(p) : 0, b = si ? rCount(f) : 0;
            if (a > b || (a === b && p.ts > f.ts)) f = p;
        });
        return f;
    }

    function renderNow() {
        if (!S.built) return;
        const all = allList(), si = signed();
        const real = all.filter(p => !isAdm(p.uid, p.author));
        const nc = si ? all.reduce((n, p) => n + comments(p).length, 0) : 0;
        const stats = [[all.length, '張旅行照片'], [new Set(real.map(p => p.uid)).size, '位旅伴分享']];
        if (si) stats.push([nc, '則留言']);
        const trip = medalsHtml(tripTitles(), ['pop', 'full'], true);
        put('hl-head', `<div class="hl-ht"><h2>📸 旅途花絮</h2><button type="button" data-a="album" class="hl-pill"${all.length ? '' : ' disabled'}>共同相簿</button></div>
            <p class="hl-sub">${si ? `每人每天最多分享 ${MAX_HIGHLIGHTS_PER_DAY} 張，記錄這趟旅程的片刻` : '登入後可以分享照片、留言和心情'}</p>
            <div class="hl-stats c${stats.length}">${stats.map(([v, l]) => `<div><b>${v}</b><small>${l}</small></div>`).join('')}</div>
            ${trip ? `<div class="hl-mds">${trip}</div>` : ''}
            <div class="hl-acts">${si ? '<button type="button" data-a="share" class="hl-btn pri">＋ 分享照片</button>' : '<button type="button" data-a="login" class="hl-btn pri">👤 會員登入</button>'}
            <button type="button" data-a="random" class="hl-btn soft"${all.length ? '' : ' disabled'}>🎲 隨機回憶</button></div>`);
        const f = featured(all, si);
        put('hl-feat', f ? `<div class="hl-sec"><span>✨ 本次旅行精選</span><button type="button" data-a="det" data-l="all" data-d="${f.day}" data-i="${esc(f.id)}">看看回憶 →</button></div>
            <button type="button" class="hl-feat" data-a="det" data-l="all" data-d="${f.day}" data-i="${esc(f.id)}">
            <span class="hl-fbg" style="background-image:url('${cssUrl(f.thumb || f.url)}')"></span>
            <img class="hl-fimg" src="${esc(f.url)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">
            <span class="hl-fov"><span class="hl-ftag">TRIP HIGHLIGHT · DAY ${meta(f.day).n}</span>
            <span class="hl-ft">${esc(f.caption || '（無說明）')}</span>
            <span class="hl-fm">${si ? `<span>${emoText(Object.values(reacts(f)))}</span><span>💬 ${comments(f).length}</span>` : ''}<span>${esc(f.author || '')} 上傳</span></span></span></button>` : '');
        dayMeta.forEach(d => put('hl-day' + d.n, dayHtml('d' + d.n)));
        if (S.det) renderDet();
        checkWins();
    }
    function dayHtml(k) {
        const ps = dayList(k), exp = S.open.has(k), si = signed(), m = meta(k);
        const show = exp ? ps : ps.slice(0, SHOW);
        const tt = document.querySelector(`#page-itinerary [data-key="${k}_title"]`);
        const sub = [tt ? tt.textContent.trim() : '', m.tag].filter(Boolean).join('｜');
        const tile = (p) => `<button type="button" class="hl-tile" data-a="det" data-l="${k}" data-d="${k}" data-i="${esc(p.id)}">
            <span class="hl-ti"><img src="${esc(p.thumb || p.url)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'"></span>
            <span class="hl-tx"><span class="hl-tc">${esc(p.caption || '（無說明）')}</span>
            <span class="hl-tm"><span class="hl-ta">${esc(p.author || '')}</span>${si ? `<span class="hl-cnt"><span>${emoText(Object.values(reacts(p)))}</span><span>💬 ${comments(p).length}</span></span>` : ''}</span></span></button>`;
        const sum = si && ps.length ? `<span class="hl-dsum">${emoText(ps.flatMap(p => Object.values(reacts(p))))} · 💬 ${ps.reduce((n, p) => n + comments(p).length, 0)} 則留言</span>` : '<span></span>';
        const more = ps.length > SHOW ? `<button type="button" data-a="more" data-d="${k}" class="hl-link">${exp ? '收合 ▲' : `查看全部 ${ps.length} 張 →`}</button>` : '';
        const md = medalsHtml(dayTitles(k), ['early', 'share', 'welcome', 'topic', 'helper']);
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
        if (!me || !S.active || !S.photosLive || S.winOpen || !S.ready.react || !S.ready.comments || !S.ready.members || (S.sheet && S.sheet.busy)) return;
        const lsKey = 'hl_won_' + me;
        let seen = {};
        try { seen = JSON.parse(localStorage.getItem(lsKey) || '{}') || {}; } catch (e) { }
        const fresh = [];
        dayMeta.forEach(d => {
            const k = 'd' + d.n, t = dayTitles(k);
            Object.entries(t).forEach(([id, u]) => { if (u === me && !seen[k + '_' + id]) fresh.push({ key: k + '_' + id, id, k }); });
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
            <p class="hl-wt">你是${m.k ? '今天的' : ''}${T[1]}！</p><p class="hl-wd">${T[2]}</p>
            ${rest.length ? `<div class="hl-mds c">${rest.map(r => `<span class="hl-md">${TITLES[r.id][0]} 同時獲得：${r.k ? `D${meta(r.k).n} ` : ''}${TITLES[r.id][1]}</span>`).join('')}</div>` : ''}
            <button type="button" class="hl-btn pri">太棒了</button></div>`;
        document.body.appendChild(ov);
        setTimeout(() => { const c = ov.querySelector('.hl-conf'); if (c) c.remove(); }, 2600);
        ov.querySelector('button').addEventListener('click', () => { ov.remove(); S.winOpen = false; });
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
        let body = `${p.caption ? `<p class="hl-dcap">${esc(p.caption)}</p>` : ''}<p class="hl-dmeta">📷 ${esc(p.author || '')}・${dayLabel(p.day)}・${hm(p.ts)}</p>`;
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
        const ref = createDb().ref(`hl_react/${p.day}/${p.id}/${currentUserUid}`);
        (reacts(p)[currentUserUid] === k ? ref.remove() : ref.set(k)).catch(fail);
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
            manageDb().ref(`highlights/${p.day}/${p.id}`).update({ caption: r.caption || '' })
                .catch((e) => alert('儲存失敗：' + (e.code === 'PERMISSION_DENIED' ? '沒有權限，或這張是舊照片（請刪除後重新上傳）。' : e.message)));
        } else if (confirm('確定要刪除這張照片嗎？留言和心情也會一起刪除。' + (isCld(p.url) ? '\n\n（這張存在 Cloudinary，原圖需要管理員到 Cloudinary 後台刪除）' : ''))) {
            manageDb().ref().update({ [`highlights/${p.day}/${p.id}`]: null, [`hl_react/${p.day}/${p.id}`]: null, [`hl_comments/${p.day}/${p.id}`]: null })
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
            else if (a === 'srm') { const it = S.sheet.items.splice(+x, 1)[0]; if (it) URL.revokeObjectURL(it.prev); if (!S.sheet.items.length) closeSheet(); else renderSheet(); }
            else if (a === 'sgo') startUpload();
            else if (a === 'sretry') runAll(S.sheet.items.filter((it, i) => it.st === 'fail' && (x === undefined || i === +x)));
        });
        sheetEl.addEventListener('input', (e) => {
            const ix = e.target.dataset.ix;
            if (ix !== undefined && S.sheet && S.sheet.items[+ix]) S.sheet.items[+ix].cap = e.target.value;
        });
    }
    function share(d) {
        if (!signed()) { openMemberModal(); return; }
        if (!guard()) return;
        S.pickDay = d || (todayDayN() ? 'd' + todayDayN() : 'd1');
        $('hl-file').click();
    }
    function onFiles(e) {
        const files = [...e.target.files].filter(f => /^image\//.test(f.type) || /\.(heic|heif)$/i.test(f.name));
        e.target.value = '';
        if (!files.length) return;
        const items = files.map(file => ({ file, prev: URL.createObjectURL(file), cap: '', st: 'wait', pct: 0, err: '', host: '' }));
        if (S.sheet) { if (S.sheet.phase === 'edit') S.sheet.items.push(...items); else items.forEach(it => URL.revokeObjectURL(it.prev)); }
        else {
            S.sheet = { day: S.pickDay || 'd1', items, phase: 'edit', busy: false };
            sheetEl.classList.remove('hidden');
            lockScroll();
            try { history.pushState({ hls: 1 }, ''); } catch (err) { }
            fitVV();
        }
        renderSheet();
    }
    function closeSheet(fromPop) {
        if (!S.sheet || (S.sheet.busy && fromPop !== true)) return;
        if (fromPop !== true && history.state && history.state.hls) { history.back(); return; }
        if (S.sheet.busy) { try { history.pushState({ hls: 1 }, ''); } catch (e) { } return; }
        S.sheet.items.forEach(it => URL.revokeObjectURL(it.prev));
        S.sheet = null;
        sheetEl.classList.add('hidden');
        unlockScroll();
        sched();
    }
    const ST = { wait: '等待上傳', resize: '縮圖中…', up: '上傳中', save: '儲存中…', done: '✓ 已完成', fail: '' };
    function renderSheet() {
        const s = S.sheet;
        if (!s) return;
        const edit = s.phase === 'edit', q = quota(s.day), n = s.items.length;
        const doneN = s.items.filter(it => it.st === 'done').length;
        $('hl-stitle').textContent = edit ? `分享照片（${n} 張）` : (s.busy ? `上傳中 ${doneN} / ${n}` : `上傳結果 ${doneN} / ${n}`);
        $('hl-scancel').classList.toggle('hl-inv', s.busy || !edit);
        $('hl-sadd').classList.toggle('hl-inv', !edit);
        const days = dayMeta.map(d => `<button type="button" data-a="sday" data-d="d${d.n}" class="hl-dp${s.day === 'd' + d.n ? ' on' : ''}">D${d.n}</button>`).join('');
        const tip = isEditor ? '' : `<p class="hl-tip">你在 D${meta(s.day).n} 已分享 ${myCount(s.day)} 張，${q ? `這次最多還能上傳 ${q} 張` : '今天的額度已用完'}</p>`;
        const test = cldOnly() ? '<p class="hl-tip">🧪 測試模式：這次只會上傳到備用的 Cloudinary</p>' : '';
        const row = (it, i) => {
            const over = edit && i >= q;
            const bk = it.host === 'cld' ? '（備用）' : '';
            const st = it.st === 'fail' ? `<span class="hl-err">⚠️ ${esc(it.err || '上傳失敗')}</span>`
                : it.st === 'up' ? `<span class="hl-bar"><i style="width:${it.pct}%"></i></span><span class="hl-mu">上傳中${bk} ${it.pct}%</span>`
                    : `<span class="${it.st === 'done' ? 'hl-ok' : 'hl-mu'}">${ST[it.st]}${it.st === 'done' ? bk : ''}</span>`;
            return `<div class="hl-row${over ? ' over' : ''}${it.st === 'fail' ? ' bad' : ''}"><img src="${it.prev}" alt="">
                <div class="hl-rb">${edit ? `<input data-ix="${i}" maxlength="${CAP}" placeholder="寫一句說明（選填，${CAP} 字內）" value="${esc(it.cap)}">${over ? '<span class="hl-err">超過今天的上限，不會上傳</span>' : ''}`
                    : `<span class="hl-rc">${esc(it.cap || '（無說明）')}</span>${st}`}</div>
                ${edit ? `<button type="button" data-a="srm" data-x="${i}" class="hl-cx" aria-label="移除">✕</button>`
                    : (it.st === 'fail' && !s.busy ? `<button type="button" data-a="sretry" data-x="${i}" class="hl-btn line sm">重試</button>` : '')}</div>`;
        };
        $('hl-sbody').innerHTML = edit
            ? `${test}<p class="hl-lb">所屬日期</p><div class="hl-dps">${days}</div>${tip}${s.items.map(row).join('')}`
            : `${test}<p class="hl-lb">${dayLabel(s.day)}</p>${s.items.map(row).join('')}`;
        const go = Math.min(n, q);
        $('hl-sfoot').innerHTML = edit
            ? `<button type="button" data-a="sgo" class="hl-btn pri"${go ? '' : ' disabled'}>${go ? `上傳 ${go} 張` : '沒有可上傳的照片'}</button>`
            : (s.busy ? `<button type="button" class="hl-btn pri" disabled>上傳中，請勿關閉…</button>`
                : `<div class="hl-two">${s.items.some(it => it.st === 'fail') ? '<button type="button" data-a="sretry" class="hl-btn line">全部重試</button>' : ''}<button type="button" data-a="sdone" class="hl-btn pri">完成</button></div>`);
    }
    function startUpload() {
        const s = S.sheet;
        if (!s || s.phase !== 'edit' || !guard()) return;
        const q = quota(s.day);
        s.items.splice(q).forEach(it => URL.revokeObjectURL(it.prev));
        if (!s.items.length) return;
        s.items.forEach(it => { it.cap = it.cap.trim().slice(0, CAP); });
        s.phase = 'run';
        runAll(s.items);
    }
    async function runAll(items) {
        const s = S.sheet;
        if (!s || s.busy || !items.length) return;
        s.busy = true;
        items.forEach(it => { it.st = 'wait'; it.err = ''; it.host = ''; });
        renderSheet();
        for (const it of items) { if (S.sheet !== s) break; await runOne(s, it); }
        s.busy = false;
        renderSheet();
        sched();
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
    function xhrPost(url, fd, onp) {
        return new Promise((res, rej) => {
            const x = new XMLHttpRequest();
            x.open('POST', url);
            x.timeout = 120000;
            x.upload.onprogress = (e) => { if (e.lengthComputable) onp(Math.round(e.loaded / e.total * 100)); };
            x.onload = () => { let j = null; try { j = JSON.parse(x.responseText); } catch (e) { } res({ ok: x.status >= 200 && x.status < 300, j }); };
            x.onerror = () => rej(new Error('網路中斷'));
            x.ontimeout = () => rej(new Error('上傳逾時'));
            x.send(fd);
        });
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
    async function runOne(s, it) {
        const set = (st, extra = {}) => { Object.assign(it, { st }, extra); renderSheet(); };
        try {
            if (isOffline()) throw new Error('目前離線中');
            if (!isEditor && myCount(s.day) >= MAX_HIGHLIGHTS_PER_DAY) throw new Error('已達今天的上限');
            set('resize');
            const blob = await resizeImage(it.file);
            let last = 0;
            const onp = (pct) => { if (pct - last >= 5 || pct === 100) { last = pct; set('up', { pct }); } };
            let r = null, err1 = '';
            if (!cldOnly()) {
                set('up', { pct: 0, host: 'ibb' });
                try { r = await upImgbb(blob, onp); } catch (e) { err1 = 'ImgBB：' + e.message; }
            }
            if (!r) {
                last = 0;
                set('up', { pct: 0, host: 'cld' });
                try { r = await upCld(blob, onp); } catch (e) { throw new Error([err1, 'Cloudinary：' + e.message].filter(Boolean).join('；')); }
            }
            set('save');
            const ref = createDb().ref('highlights/' + s.day).push();
            await ref.set({ url: r.url, thumb: r.thumb, caption: it.cap, author: currentUserName || ADMIN_NAME, uid: currentUserUid });
            if (String(r.del).startsWith('https://ibb.co/')) createDb().ref('img_del/' + ref.key).set({ del: r.del, ...(r.thumb ? { thumb: r.thumb } : {}), author: currentUserName || ADMIN_NAME, uid: currentUserUid, ts: Date.now() }).catch(() => { });
            set('done');
        } catch (e) {
            set('fail', { err: e && e.code === 'PERMISSION_DENIED' ? '沒有權限（請確認 Firebase Rules 已更新）' : ((e && e.message) || '上傳失敗') });
        }
    }

    // ---------- 對外 ----------
    window.HL = {
        open() {
            if (!S.built) build();
            S.active = true;
            bindPub();
            bindPriv();
            seed();
            renderNow();
            if (!S.jumped && currentTab === 'highlights') {
                S.jumped = true;
                const n = tabDay.highlights || todayDayN();
                if (n) jumpToDay(n, { instant: true }); else setupScrollSpy();
            }
        },
        onTab(page) {
            S.active = page === 'highlights';
            if (!S.active) off(S.pubRefs); else bindPub();
            bindPriv();
        },
        onAuth() {
            if (!S.built) return;
            bindPriv();
            seed();
            if (S.sheet && S.sheet.phase === 'edit') renderSheet();
            sched();
        }
    };
})();
