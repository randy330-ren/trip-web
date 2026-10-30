(function () {
    const STEPS = [
        { tab: 'itinerary', title: '👋 歡迎使用山陰・秋日紀行', items: ['下方導覽列有 5 大項：行程、地圖、記帳、更多、花絮', '另有「餐食」「住宿」兩個總覽，從行程頁右側的浮動按鈕進入', '會員可使用記帳、花絮、清單；管理員輸入密碼後可編輯內容', '隨時可到「更多」頁點「📖 新手教學」重看'] },
        { tab: 'itinerary', sel: '#nav-itinerary', title: '🗓️ 行程', items: ['最上方日期列可切換每一天，今天會自動定位', '出發前會顯示倒數天數', '每天包含路線、時間、天氣與貼心提醒', '點行程項目可展開詳細說明'], admin: ['管理員：每天可新增路線、提醒、住宿並拖曳排序'] },
        { tab: 'itinerary', sel: '#fab-food', title: '🍱 餐食總覽', items: ['集中列出整趟旅程每一餐的安排', '點右側「餐食」浮動按鈕開啟，再點一次或返回即可關閉', '資料與行程頁同步'] },
        { tab: 'itinerary', sel: '#fab-stay', title: '🏨 住宿總覽', items: ['集中列出每晚住宿，連住只顯示一張', '點右側「住宿」浮動按鈕開啟', '與行程頁的住宿資料同步'], admin: ['管理員：可新增與修改住宿'] },
        { tab: 'map', sel: '#nav-map', title: '🗺️ 地圖', items: ['點地圖上的釘子可看說明並一鍵導航', '按「下一站 ›」「‹ 上一站」依序導覽景點', '左上 ☰ 工具：全螢幕、切換底圖、我的位置、路線虛線', '地圖左下釘子可固定地圖，右下箭頭可拖拉調整高度'], admin: ['管理員：長按空白處新增地點，長按釘子修改或調整位置'] },
        { tab: 'ledger', sel: '#nav-ledger', title: '💰 記帳', items: ['新增支出：填金額、類別與付款人，選擇分帳方式', '支援多幣別，可自訂匯率或使用匯率表', '可用類別、日期篩選查詢明細，也能編輯或刪除', '結算頁可看「總和」或「依日期」的轉帳建議，收款後按「確認收款」'] },
        { tab: 'more', sel: '#nav-more', title: '✅ 更多', items: ['清單分「待辦」與「必買」', '「👥 團體」全員共用，「🔒 我的」只有自己看得到', '「出發前的小提醒」整理行前注意事項', '「成員」可查看目前參加的人', '登入入口與雲端同步狀態在畫面下方'] },
        { tab: 'highlights', sel: '#nav-highlights', title: '📸 花絮', items: ['「＋ 分享照片」上傳旅途照片並選擇所屬日期', '「每日花絮」依日期瀏覽共同相簿', '「🎲 隨機回憶」隨機翻看照片，「✨ 本次旅行精選」收錄精選', '點開照片可留言、送出心情'] }
    ];
    let idx = 0, opts = {}, from = 'itinerary', el = null, timer = 0;

    function css() {
        if (document.getElementById('tr-css')) return;
        const s = document.createElement('style');
        s.id = 'tr-css';
        s.textContent = '#tr-root{position:fixed;inset:0;z-index:9000}#tr-spot{position:fixed;border-radius:14px;box-shadow:0 0 0 9999px rgba(0,0,0,.62);transition:all .25s;pointer-events:none}#tr-card{position:fixed;left:50%;transform:translateX(-50%);width:calc(100% - 2rem);max-width:26rem;background:#fff;border-radius:18px;padding:16px;box-shadow:0 8px 28px rgba(0,0,0,.3);color:#333;font-size:13px;line-height:1.6}#tr-card h3{font-size:16px;font-weight:700;color:#3b4d43;margin-bottom:6px}#tr-card ul{padding-left:1.1em;list-style:disc}#tr-card li.ad{color:#b08758;font-weight:700;list-style:"✏️ "}#tr-card .row{display:flex;align-items:center;justify-content:space-between;margin-top:12px;gap:8px}#tr-card button{padding:6px 14px;border-radius:9999px;font-size:12px;font-weight:700}#tr-card .pri{background:#3b4d43;color:#fff}#tr-card .sec{background:#f0eee8;color:#3b4d43}#tr-card .skip{color:#999;padding:6px 4px}#tr-card .dots{font-size:11px;color:#a39a8e}';
        document.head.appendChild(s);
    }

    function render() {
        const st = STEPS[idx];
        switchTab(st.tab, { skipScrollTop: false });
        clearTimeout(timer);
        timer = setTimeout(() => {
            if (!el) return;
            const spot = el.querySelector('#tr-spot'), card = el.querySelector('#tr-card');
            const t = st.sel && document.querySelector(st.sel);
            const r = t && t.offsetParent !== null ? t.getBoundingClientRect() : null;
            if (r) {
                spot.style.cssText = `left:${r.left - 6}px;top:${r.top - 6}px;width:${r.width + 12}px;height:${r.height + 12}px`;
            } else {
                spot.style.cssText = 'left:50%;top:50%;width:0;height:0';
            }
            const low = r && r.top > innerHeight / 2;
            card.style.top = low ? '1rem' : 'auto';
            card.style.bottom = low ? 'auto' : '1rem';
            const li = st.items.map(i => `<li>${i}</li>`).join('') + (opts.admin && st.admin ? st.admin.map(i => `<li class="ad">${i}</li>`).join('') : '');
            const last = idx === STEPS.length - 1;
            card.innerHTML = `<h3>${st.title}</h3><ul>${li}</ul><div class="row"><span class="dots">${idx + 1} / ${STEPS.length}</span><span><button class="skip" data-a="end">${last ? '' : '略過'}</button>${idx ? '<button class="sec" data-a="prev">上一步</button> ' : ''}<button class="pri" data-a="next">${last ? '完成' : '下一步'}</button></span></div>`;
        }, 450);
    }

    function end() {
        clearTimeout(timer);
        if (el) { el.remove(); el = null; }
        if (window.hintDone) hintDone('tour');
        switchTab(from);
    }

    window.TOUR = {
        start(o) {
            if (el) return;
            opts = o || {};
            from = (typeof currentTab === 'string' && currentTab !== 'food' && currentTab !== 'stays') ? currentTab : 'itinerary';
            idx = 0;
            css();
            el = document.createElement('div');
            el.id = 'tr-root';
            el.innerHTML = '<div id="tr-spot"></div><div id="tr-card"></div>';
            el.addEventListener('click', (e) => {
                const a = e.target.dataset && e.target.dataset.a;
                if (!a) return;
                if (a === 'end') return end();
                if (a === 'next') { if (idx === STEPS.length - 1) return end(); idx++; }
                if (a === 'prev') idx--;
                render();
            });
            document.body.appendChild(el);
            render();
        }
    };
})();
