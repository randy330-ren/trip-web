(function () {
    const STEPS = [
        {
            tab: 'itinerary', title: '👋 歡迎使用山陰・秋日紀行',
            sum: ['下方導覽列有 5 大項：行程、地圖、記帳、更多、花絮', '另有「餐食」「住宿」總覽，從行程頁右側的浮動按鈕進入', '每一步下方的項目可以點開看詳細說明'],
            det: [
                { q: '👤 登入與權限', a: '會員可使用記帳、花絮、清單與留言。登入入口在「更多」頁左下角的「登入」按鈕。' },
                { q: '✏️ 管理員編輯模式', ad: 1, a: '在「更多」頁左下角登入 → 編輯模式，輸入密碼後，行程、地圖、餐食、住宿、提醒都能新增與修改。' },
                { q: '📖 重看教學', a: '隨時到「更多」頁最下方，點「📖 新手教學」即可重看。' }
            ]
        },
        {
            tab: 'itinerary', sel: '#nav-itinerary', title: '🗓️ 行程',
            sum: ['每天的路線、時間、餐食、住宿與提醒都在這裡'],
            det: [
                { q: '📅 日期列與倒數', a: '最上方日期列可橫向滑動，點日期跳到那一天，開啟時會自動定位到今天。出發前會顯示倒數天數。' },
                { q: '🎯 路線卡：跳到地圖', a: '每張路線卡右上角的準星按鈕，會切到地圖頁並定位該站。' },
                { q: '🍽️ 餐食卡：導航', a: '早餐、午餐、晚餐等餐食卡，點整張卡會開啟「餐食總覽」，在那裡點餐廳名稱即可用 Google 地圖導航。' },
                { q: '🏨 住宿卡', a: '住宿卡點下去會跳到地圖上的住宿位置。連住只顯示一張。' },
                { q: '🔖 備選標籤', a: '同一餐有多間候選時，第一間是主要安排，其餘在地圖列表會標示「備選」。' },
                { q: '🌤️ 天氣', a: '每天會顯示天氣預報（資料來源 Open-Meteo），可在設定中調整天氣地點。' },
                { q: '✏️ 新增與排序', ad: 1, a: '管理員可新增路線項目、貼心提醒與住宿，並拖曳「≡」調整順序，餐食旁的 ✏️ 可修改餐廳。' }
            ]
        },
        {
            tab: 'itinerary', sel: '#fab-food', title: '🍱 餐食總覽',
            sum: ['集中列出整趟旅程每一餐的安排'],
            det: [
                { q: '📂 怎麼開啟', a: '點行程頁右側的「餐食」浮動按鈕，或直接點行程裡的餐食卡。返回即可關閉。' },
                { q: '📍 點餐廳導航', a: '點選餐廳名稱會開啟 Google 地圖導航，資料與行程頁同步。' },
                { q: '🔖 候選餐廳', a: '同一餐可能有多間候選，可依當天狀況選擇。' },
                { q: '✏️ 修改餐廳', ad: 1, a: '管理員可在餐食旁點 ✏️ 新增、修改或調整候選餐廳，也能設定連結。' }
            ]
        },
        {
            tab: 'itinerary', sel: '#fab-stay', title: '🏨 住宿總覽',
            sum: ['集中列出每晚住宿'],
            det: [
                { q: '📂 怎麼開啟', a: '點行程頁右側的「住宿」浮動按鈕，連住只顯示一張。' },
                { q: '🎯 地圖與 📍 導航', a: '每間住宿都有「地圖」按鈕可跳到位置，以及「導航」按鈕開啟 Google 地圖。' },
                { q: '✏️ 新增住宿', ad: 1, a: '管理員可新增、修改與刪除住宿，與行程頁資料同步。' }
            ]
        },
        {
            tab: 'map', sel: '#nav-map', title: '🗺️ 地圖',
            sum: ['所有景點、餐廳與住宿都標在這張地圖上'],
            det: [
                { q: '📌 點釘子看說明與導航', a: '點地圖上的釘子會彈出名稱與說明，按「📍 導航」開啟 Google 地圖。' },
                { q: '➡️ 逐站導覽', a: '按「下一站 ›」「‹ 上一站」依序走訪每一站，也可以點下方列表直接跳到該處。' },
                { q: '🧰 ☰ 工具', a: '點左上 ☰ 展開：⛶ 全螢幕、🗂️ 切換底圖、📍 我的位置、〰️ 路線虛線開關。' },
                { q: '📌 固定與調整高度', a: '左下釘子可固定地圖在畫面上方，捲動時仍看得到；右下箭頭按鈕可上下拖拉調整地圖高度。' },
                { q: '✏️ 新增與調整地點', ad: 1, a: '管理員長按地圖空白處可新增地點或住宿，長按釘子可修改或拖曳調整位置。' }
            ]
        },
        {
            tab: 'ledger', sel: '#nav-ledger', title: '💰 記帳',
            sum: ['記帳頁分「記帳」「明細」「匯率」三個分頁', '需要會員登入才能使用'],
            det: [
                { q: '👥 先設定團員', a: '記帳前要先有團員名單。可新增團員，並「綁定我」把自己的帳號對應到自己的名字；綁定後才能以本人身分標記轉帳與確認收款。已用在帳目裡的團員只能改名或停用。' },
                { q: '📝 怎麼記一筆', a: '到「記帳」分頁：填支出名稱、金額與幣別、日期，選擇付款人、勾選分攤成員（可全選），再選類別與備註，確認預覽後按「儲存支出」。' },
                { q: '➗ 三種分帳方式', a: '「平均」：所選成員均分，除不盡的尾數依名單順序分配。「自訂金額」：每人填各自的金額，加總需等於總額。「按比例」：每人填比例，例如 2:1:1。兩種自訂方式都有「平均填入」按鈕可快速起手。' },
                { q: '💱 外幣與匯率', a: '金額旁可切換幣別。外幣預設使用「匯率表」的匯率換算成台幣；若這一筆想用別的匯率，點「改為自訂此筆匯率」，只影響這一筆，不會改到匯率表。' },
                { q: '📋 明細與篩選', a: '「明細 → 支出紀錄」列出所有支出，可依類別、付款人、分攤成員、幣別篩選與排序。點開一筆可編輯或刪除，也能匯出 CSV。' },
                { q: '🏦 先轉帳', a: '在支出明細中，分攤者可對單筆支出按「先轉帳」，表示已先把錢轉給付款人，對方確認後會計入結算。' },
                { q: '🧮 自動結算', a: '「明細 → 自動結算」會算出最少的轉帳建議，可切換「總和」或「依日期」。依日期只是查看，要標記轉帳請切回「總和」。' },
                { q: '✅ 標記轉帳與確認收款', a: '付款方按「標記已轉帳」，收款方會看到「待確認」，核對無誤後按「確認收款」；若金額不對可按「退回」。確認後該筆轉帳才算完成。' },
                { q: '💹 匯率分頁', a: '「匯率」分頁顯示目前的匯率表與來源、更新時間。一般會員只能查看。' },
                { q: '🔄 維護匯率表', ad: 1, a: '管理員可新增幣別、修改匯率、抓取最新匯率並一鍵套用。已有支出使用的幣別不能刪除。' }
            ]
        },
        {
            tab: 'more', sel: '#nav-more', title: '✅ 更多',
            sum: ['待辦、必買、行前提醒、成員與登入都在這裡'],
            det: [
                { q: '✅ 待辦與必買', a: '清單上方可切換「待辦」與「必買」，按「＋ 新增」加入項目。' },
                { q: '👥 團體 vs 🔒 我的', a: '待辦分「團體」與「我的」：團體清單所有人共用，「我的」只有自己看得到。' },
                { q: '🧳 出發前的小提醒', a: '整理行前注意事項，出發前可以再看一次。' },
                { q: '👤 成員名單', a: '「成員」卡片點一下展開，可看目前有哪些人加入。' },
                { q: '☁️ 登入與同步狀態', a: '畫面下方左側是登入按鈕，右側顯示雲端同步狀態。離線時會顯示最後同步的資料。' }
            ]
        },
        {
            tab: 'highlights', sel: '#nav-highlights', title: '📸 花絮',
            sum: ['旅途中的共同相簿，登入後才能分享與互動'],
            det: [
                { q: '📤 分享照片', a: '按「＋ 分享照片」選擇照片，並指定所屬日期，加上簡短說明。每人每天有上傳張數上限，超過的不會上傳。' },
                { q: '🗓️ 每日花絮', a: '依日期瀏覽相簿，每天預設顯示前幾張，可按「查看全部」展開，也能用「全部日期」切換。' },
                { q: '🎲 隨機回憶', a: '隨機翻看一張大家分享過的照片。' },
                { q: '✨ 本次旅行精選', a: '自動挑出的精選照片，點「看看回憶」查看。' },
                { q: '💬 留言與心情', a: '點開照片可送出留言（上限 50 字）並按心情表情；自己的留言與照片可刪除，照片說明也能編輯。' },
                { q: '🏅 每日稱號', a: '依當天分享、獲得心情與留言數，會頒發分享王、歡迎王、話題王、熱心王等稱號，整趟最多心情的是「旅程人氣王」。' },
                { q: '🙂 管理表情', ad: 1, a: '管理員可新增或刪除心情表情（已被使用的表情不能刪除）。' }
            ]
        }
    ];
    let idx = 0, opts = {}, from = 'itinerary', el = null, timer = 0, open = -1;

    function css() {
        if (document.getElementById('tr-css')) return;
        const s = document.createElement('style');
        s.id = 'tr-css';
        s.textContent = '#tr-root{position:fixed;inset:0;z-index:9000}#tr-spot{position:fixed;border-radius:14px;box-shadow:0 0 0 9999px rgba(0,0,0,.62);transition:all .25s;pointer-events:none}#tr-card{position:fixed;left:50%;transform:translateX(-50%);width:calc(100% - 2rem);max-width:26rem;background:#fff;border-radius:18px;box-shadow:0 8px 28px rgba(0,0,0,.3);color:#333;font-size:13px;line-height:1.6;display:flex;flex-direction:column;overflow:hidden}#tr-card .bd{padding:16px 16px 8px;overflow-y:auto;-webkit-overflow-scrolling:touch}#tr-card h3{font-size:16px;font-weight:700;color:#3b4d43;margin-bottom:6px}#tr-card ul{padding-left:1.1em;list-style:disc;margin-bottom:8px}#tr-card .q{display:flex;justify-content:space-between;align-items:center;width:100%;text-align:left;padding:9px 12px;margin-top:6px;border-radius:10px;background:#f0eee8;color:#3b4d43;font-weight:700;font-size:13px}#tr-card .q.ad{background:#f6ecde;color:#8a6234}#tr-card .q i{font-style:normal;opacity:.6;transition:transform .2s}#tr-card .q.on i{transform:rotate(90deg)}#tr-card .a{display:none;padding:8px 12px 4px;color:#555}#tr-card .a.on{display:block}#tr-card .tag{font-size:10px;font-weight:700;color:#8a6234;margin-left:6px}#tr-card .ft{padding:10px 16px 14px;border-top:1px solid #eee;background:#fff}#tr-card .dots{text-align:center;font-size:11px;color:#a39a8e;margin-bottom:8px}#tr-card .row{display:flex;gap:8px}#tr-card .row button{padding:13px 0;border-radius:14px;font-size:15px;font-weight:700}#tr-card .pri{flex:1.3;background:#3b4d43;color:#fff}#tr-card .sec{flex:1;background:#e7e4db;color:#3b4d43}#tr-card .skip{flex:1;background:#fff;color:#777;border:1.5px solid #cfcac0}#tr-card button:disabled{opacity:.35}';
        document.head.appendChild(s);
    }

    function render() {
        const st = STEPS[idx];
        open = -1;
        switchTab(st.tab);
        clearTimeout(timer);
        timer = setTimeout(() => {
            if (!el) return;
            const spot = el.querySelector('#tr-spot'), card = el.querySelector('#tr-card');
            const t = st.sel && document.querySelector(st.sel);
            const r = t && t.offsetParent !== null ? t.getBoundingClientRect() : null;
            const low = r && r.top > innerHeight / 2;
            if (r) spot.style.cssText = `left:${r.left - 6}px;top:${r.top - 6}px;width:${r.width + 12}px;height:${r.height + 12}px`;
            else spot.style.cssText = 'left:50%;top:50%;width:0;height:0';
            const room = r ? (low ? r.top - 30 : innerHeight - r.bottom - 30) : innerHeight - 32;
            card.style.top = low || !r ? '1rem' : 'auto';
            card.style.bottom = low || !r ? 'auto' : '1rem';
            card.style.maxHeight = Math.max(240, room) + 'px';
            const last = idx === STEPS.length - 1;
            const det = st.det.filter(d => !d.ad || opts.admin);
            card.innerHTML = `<div class="bd"><h3>${st.title}</h3><ul>${st.sum.map(i => `<li>${i}</li>`).join('')}</ul>${det.map((d, i) => `<button class="q${d.ad ? ' ad' : ''}" data-q="${i}"><span>${d.q}${d.ad ? '<span class="tag">管理員</span>' : ''}</span><i>▸</i></button><div class="a" data-a="${i}">${d.a}</div>`).join('')}</div><div class="ft"><div class="dots">${idx + 1} / ${STEPS.length}・點上方項目可展開說明</div><div class="row">${last ? '' : '<button class="skip" data-a="end">略過</button>'}<button class="sec" data-a="prev"${idx ? '' : ' disabled'}>上一步</button><button class="pri" data-a="next">${last ? '完成' : '下一步'}</button></div></div>`;
        }, 450);
    }

    function toggle(i) {
        const qs = el.querySelectorAll('.q'), as = el.querySelectorAll('.a');
        const was = open === i;
        qs.forEach(b => b.classList.remove('on'));
        as.forEach(a => a.classList.remove('on'));
        open = was ? -1 : i;
        if (!was) { qs[i].classList.add('on'); as[i].classList.add('on'); qs[i].scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
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
                const q = e.target.closest('[data-q]');
                if (q) return toggle(+q.dataset.q);
                const b = e.target.closest('[data-a]');
                const a = b && b.dataset.a;
                if (!a || b.classList.contains('a')) return;
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
