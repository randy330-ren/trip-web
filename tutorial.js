(function () {
    const NAMES = ['小明', '小華', '小美'];
    const vis = (q) => { for (const e of document.querySelectorAll(q)) if (e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden') return e; return null; };
    const find = (s) => (typeof s === 'function' ? s() : s ? vis(s) : null);
    const stayCard = () => [...document.querySelectorAll('#page-itinerary .tl-card')].find(c => c.getClientRects().length && /住宿/.test((c.querySelector('.tl-tag') || {}).textContent || '')) || null;
    const parentOf = (id) => () => { const b = document.getElementById(id); return b && b.getClientRects().length ? b.parentElement : null; };
    const idBar = () => vis('#identity-bar #edit-controls') || vis('#identity-bar #member-controls') || vis('#id-tab');
    const L_ADD = ['#lg-tabs [data-v="add"]'], L_LIST = ['#lg-tabs [data-v="list"]', '#lg-subs [data-v="list"]'], L_SETTLE = ['#lg-tabs [data-v="list"]', '#lg-subs [data-v="settle"]'], L_FX = ['#lg-tabs [data-v="fx"]'];

    // 自動展開：on 在進入該小項時執行，off 在離開時還原（只還原自己展開的）
    const rosterEx = { on() { const l = document.getElementById('roster-list'); if (l && l.classList.contains('hidden') && window.toggleRoster) { toggleRoster(); return () => { if (!l.classList.contains('hidden')) toggleRoster(); }; } } };
    const idEx = { on() { const b = document.getElementById('identity-bar'); if (b && !b.classList.contains('open')) { b.classList.add('open'); return () => b.classList.remove('open'); } } };
    const toolsEx = { on() { const t = document.getElementById('mp-tools'); if (t && !t.classList.contains('open')) { t.classList.add('open'); return () => t.classList.remove('open'); } } };

    const SEC = [
        {
            nav: '歡迎', tab: 'itinerary', sel: '#main-nav',
            cats: [{
                n: '歡迎', it: [
                    { q: '🧭 五大功能', a: '下方導覽列有行程、地圖、記帳、更多、花絮。點視窗最上方的分頁列，可直接跳到該功能的說明。餐食與住宿總覽收在「行程」裡。', sel: '#main-nav' },
                    { q: '👤 登入與權限', a: '會員可使用記帳、花絮、清單與留言。登入後左下角會顯示你的身分標籤（會員是 👤 加名字，管理員是 ✏️），點開可以修改名稱、修改密碼或登出。', sel: idBar, ex: idEx },
                    { q: '✏️ 管理員編輯模式', ad: 1, a: '管理員登入後，左下角 ✏️ 選單有「儲存」「管理設定」「閱讀模式／編輯模式」與「登出」。編輯模式下，行程、地圖、餐食、住宿、提醒都能新增與修改；切到閱讀模式可避免誤改。', sel: idBar, ex: idEx },
                    { q: '🧪 試試看', a: '標示「🧪 試試看」的區塊是範例操作，用的是範例資料，不會儲存，也不會改到任何真實資料。畫面上有框起來的按鈕與手指，代表真實畫面的位置，教學中不會真的按下去。' },
                    { q: '📖 重看教學', a: '隨時到「更多」頁最下方，點「📖 新手教學」即可重看。', tab: 'more', sel: '#tour-card' }
                ]
            }]
        },
        {
            nav: '行程', tab: 'itinerary', sel: '#nav-itinerary',
            cats: [
                {
                    n: '日期與天氣', it: [
                        { q: '📅 日期列與倒數', a: '最上方日期列可橫向滑動，點日期跳到那一天，開啟時會自動定位到今天。出發前會顯示倒數天數。', sel: '#date-strip', demo: 'dates' },
                        { q: '🌤️ 天氣', a: '每天會顯示天氣預報（資料來源 Open-Meteo），點卡片可看每小時天氣，並可在設定中調整天氣地點。', sel: '#page-itinerary .wx-card' }
                    ]
                },
                {
                    n: '路線卡', it: [
                        { q: '🎯 路線卡怎麼點', a: '路線卡右上角的準星按鈕會切到地圖頁並定位該站；餐食卡點整張會開啟餐食總覽；一般景點卡的導航在地圖頁。', sel: '#page-itinerary .tl-map', demo: 'route' },
                        { q: '🏨 住宿卡', a: '住宿卡點下去會跳到地圖上的住宿位置。連住只顯示一張。', sel: stayCard },
                        { q: '🔖 備選標籤', a: '同一餐有多間候選時，第一間是主要安排，其餘在地圖列表會變成淡色並標示「備選」。', demo: 'alt' }
                    ]
                },
                {
                    n: '餐食總覽', sel: '#fab-food', it: [
                        { q: '📂 怎麼開啟', a: '點行程頁右側的「餐食」浮動按鈕，或直接點行程裡的餐食卡。返回即可關閉。', sel: '#fab-food' },
                        { q: '📍 點餐廳導航', a: '點選餐廳名稱會開啟 Google 地圖導航，資料與行程頁同步。', demo: 'meal' },
                        { q: '🔖 候選餐廳', a: '同一餐可能有多間候選：第一間是主要安排，其餘是候選，可依當天人數與營業狀況選擇。', demo: 'cand' }
                    ]
                },
                {
                    n: '住宿總覽', sel: '#fab-stay', it: [
                        { q: '📂 怎麼開啟', a: '點行程頁右側的「住宿」浮動按鈕，連住只顯示一張。', sel: '#fab-stay' },
                        { q: '🎯 地圖與 📍 導航', a: '每間住宿都有「地圖」按鈕可跳到位置，以及「導航」按鈕開啟 Google 地圖。', demo: 'stay' }
                    ]
                },
                {
                    n: '管理員', it: [
                        { q: '✏️ 新增與排序', ad: 1, a: '可新增路線項目、貼心提醒與住宿，並拖曳「≡」調整順序。', sel: '.add-route-btn' },
                        { q: '🍽️ 修改餐廳', ad: 1, a: '餐食旁點 ✏️ 可新增、修改或調整候選餐廳，也能設定連結。', sel: '.meal-edit-btn' },
                        { q: '🏨 新增住宿', ad: 1, a: '住宿可新增、修改與刪除，與行程頁資料同步。', sel: '.add-route-btn' }
                    ]
                }
            ]
        },
        {
            nav: '地圖', tab: 'map', sel: '#nav-map',
            cats: [
                {
                    n: '看地圖', it: [
                        { q: '📌 釘子與逐站導覽', a: '點釘子會彈出名稱與說明，「📍 導航」開啟 Google 地圖。按「下一站 ›」「‹ 上一站」依序走訪每一站。', sel: '.mp-nav', demo: 'map' },
                        { q: '🧰 ☰ 工具', a: '點左上 ☰ 展開：⛶ 全螢幕、🗂️ 切換底圖、📍 我的位置、〰️ 路線虛線開關。', sel: '#mp-tools', ex: toolsEx }
                    ]
                },
                {
                    n: '進階', it: [
                        { q: '📌 固定地圖', a: '左下釘子可固定地圖在畫面上方，捲動列表時仍看得到地圖。', sel: '#mp-pin-btn' },
                        { q: '↕️ 調整高度', a: '右下箭頭按鈕可上下拖拉調整地圖高度，點一下切換最矮／最高。', sel: '#mp-resize' }
                    ]
                },
                { n: '管理員', it: [{ q: '✏️ 新增與調整地點', ad: 1, a: '框起來的是整個地圖區（含圖層名稱與 ☰ 選單）。長按地圖空白處可新增地點或住宿，長按釘子可修改或拖曳調整位置。下方可實際點點看示範。', sel: '#mp-wrap', demo: 'madm' }] }
            ]
        },
        {
            nav: '記帳', tab: 'ledger', sel: '#nav-ledger',
            cats: [
                {
                    n: '基本設定', it: [
                        { q: '👥 先設定團員', a: '記帳前要先有團員名單。可新增團員，並「綁定我」把自己的帳號對應到自己的名字；綁定後才能以本人身分標記轉帳與確認收款。已用在帳目裡的團員只能改名或停用。', pre: L_ADD, sel: '#lg-roster' }
                    ]
                },
                {
                    n: '記一筆', it: [
                        { q: '📝 怎麼記一筆', a: '到「記帳」分頁：填支出名稱、金額與幣別、日期，選擇付款人、勾選分攤成員（可全選），再選類別與備註，確認預覽後按「儲存支出」。', pre: L_ADD, sel: '#lg-form' },
                        { q: '🏷️ 類別與編輯', a: '類別可「＋ 新增類別」自訂。編輯舊帳時上方會出現「正在編輯」提示，可隨時取消編輯。', pre: L_ADD, sel: '#lg-f-cats' }
                    ]
                },
                {
                    n: '分帳與匯率', it: [
                        { q: '➗ 三種分帳方式', a: '「平均」均分，除不盡的尾數依名單順序分配。「自訂金額」每人填各自金額，加總需等於總額。「按比例」每人填比例。', pre: L_ADD, sel: '#lg-f-mode', demo: 'split' },
                        { q: '💱 外幣與匯率', a: '外幣預設用「匯率表」換算成台幣；若這一筆想用別的匯率，點「改為自訂此筆匯率」，只影響這一筆，不會改到匯率表。', pre: L_ADD, sel: '#lg-f-cur', demo: 'fx' }
                    ]
                },
                {
                    n: '明細與結算', it: [
                        { q: '📋 明細與篩選', a: '「明細 → 支出紀錄」列出所有支出，可依類別、付款人、分攤成員、幣別篩選與排序。點開一筆可編輯或刪除，也能匯出 CSV。', pre: L_LIST, sel: '#lg-filters' },
                        { q: '🏦 先轉帳', a: '在支出明細中，分攤者可對單筆支出按「先轉帳」，表示已先把錢轉給付款人，對方確認後會計入結算。', pre: L_LIST, sel: '.lg-pt-b', demo: 'prepay' },
                        { q: '🧮 自動結算', a: '「明細 → 自動結算」會算出最少的轉帳建議，可切換「總和」或「依日期」。依日期只是查看，要標記轉帳請切回「總和」。', pre: L_LIST, sel: '#lg-subs [data-v="settle"]' },
                        { q: '✅ 標記轉帳與確認收款', a: '付款方按「標記已轉帳」，收款方會看到「待確認」，核對後按「確認收款」；金額不對可按「退回」。', pre: L_SETTLE, sel: '#lg-s-settle', demo: 'transfer' }
                    ]
                },
                { n: '匯率表', it: [{ q: '💹 匯率分頁', a: '「匯率」分頁顯示目前的匯率表與來源、更新時間。一般會員只能查看。', pre: L_FX, sel: '#lg-p-fx' }] },
                { n: '管理員', it: [{ q: '🔄 維護匯率表', ad: 1, a: '可新增幣別、修改匯率、抓取最新匯率並一鍵套用。已有支出使用的幣別不能刪除。', pre: L_FX, sel: '#lg-fx-table' }] }
            ]
        },
        {
            nav: '更多', tab: 'more', sel: '#nav-more',
            cats: [
                {
                    n: '清單', it: [
                        { q: '✅ 待辦與必買', a: '清單上方可切換「待辦」與「必買」，按「＋ 新增」加入項目。', sel: parentOf('list-kind-todo') },
                        { q: '👥 團體 vs 🔒 我的', a: '待辦分「團體」與「我的」：團體清單所有人共用，「我的」只有自己看得到。', sel: '#todo-tabs' },
                        { q: '↕️ 排序與沉底', a: '「我的」清單每筆左邊的「≡」按住 0.5 秒可拖曳排序。「已完成沉底」開啟後，打勾的項目會排到最後（此時不能拖曳）。', pre: ['#todo-tab-mine'], sel: '#todo-sort-bar' }
                    ]
                },
                {
                    n: '其他', it: [
                        { q: '🧳 出發前的小提醒', a: '整理行前注意事項，出發前可以再看一次。', sel: parentOf('notes-list-container') },
                        { q: '👤 成員名單', a: '「成員」卡片點一下展開，可看目前有哪些人加入、誰正在使用。教學會自動幫你展開。', sel: '#roster-card', ex: rosterEx },
                        { q: '☁️ 離線與同步', a: '登入後「更多」頁與左下角都會顯示連線狀態（已連線／連線中斷）。資料會即時與雲端同步；網路中斷時，畫面最上方會出現橘色「離線中・顯示最後同步資料」提示列，此時看到的是最後一次同步的內容。', sel: '#more-sync' }
                    ]
                },
                { n: '管理員', it: [{ q: '↕️ 團體清單排序', ad: 1, a: '團體清單只有管理員（編輯模式）能拖曳「≡」調整順序，所有人看到的順序都會一起更新。', pre: ['#todo-tab-group'], sel: '#todo-list-container' }] }
            ]
        },
        {
            nav: '花絮', tab: 'highlights', sel: '#nav-highlights',
            cats: [
                {
                    n: '分享與瀏覽', it: [
                        { q: '📤 分享照片', a: '按「＋ 分享照片」選擇照片，指定所屬日期並加上簡短說明。每人每天有上傳張數上限，超過的不會上傳。', sel: '.hl-acts [data-a="share"]' },
                        { q: '🗓️ 每日花絮', a: '依日期瀏覽相簿，每天預設顯示前幾張，可按「查看全部」展開，也能用「全部日期」切換。', sel: '#hl-root [data-a="days"]' },
                        { q: '🎲 隨機回憶與 ✨ 精選', a: '「隨機回憶」隨機翻看一張照片；「本次旅行精選」是自動挑出的照片，點「看看回憶」查看。', sel: '.hl-acts [data-a="random"]' }
                    ]
                },
                {
                    n: '互動', it: [
                        { q: '💬 留言與心情', a: '點開照片可送出留言（上限 50 字）並按心情表情；自己的留言與照片可刪除，照片說明也能編輯。', demo: 'react' },
                        { q: '🏅 每日稱號', a: '每天依分享、心情與留言的表現頒發稱號，共有 7 種：準時王、分享王、歡迎王、話題王、熱心王，整趟旅程另有旅程人氣王與全勤王。點下面的稱號看得獎條件。', demo: 'titles' }
                    ]
                },
                { n: '管理員', it: [{ q: '🙂 管理表情', ad: 1, a: '照片的心情列最右邊的「＋」可新增或刪除心情表情（已被使用的表情不能刪除）。', sel: '#hl-root [data-a="emo"]' }] }
            ]
        }
    ];

    const money = (n) => Math.round(n).toLocaleString();
    const lbl = (t) => `<p class="dl2">${t}</p>`;
    const head = '<p class="dl">🧪 試試看・範例資料，不會儲存</p>';
    const chip = (on, act, attrs, t) => `<button type="button" class="chip${on ? ' on' : ''}" data-do="${act}" ${attrs}>${t}</button>`;
    const D = {};
    const reset = () => {
        D.split = { amt: '900', m: [1, 1, 1], mode: 'equal', a: ['', '', ''], r: ['1', '1', '1'] };
        D.fx = { amt: '10000', src: 'table', rate: '0.21' };
        D.transfer = { s: 0 };
        D.prepay = { s: 0 };
        D.map = { i: -1 };
        D.route = { msg: '' };
        D.meal = { msg: '' };
        D.stay = { msg: '' };
        D.dates = { d: 0 };
        D.titles = { i: 1 };
        D.cand = { pick: 0 };
        D.alt = { msg: '' };
        D.madm = { m: '', sel: -1, t: 0, moved: 0, msg: '' };
        D.react = { on: [0, 0, 0], list: ['小華：好好看！'], txt: '' };
    };

    const tapDemo = (key, cards) => ({
        draw(h) {
            h.innerHTML = `${head}${cards.map((c, i) => `<div class="rc"><b>${c.t}</b><small>${c.s}</small><div class="chips">${c.b.map((b, j) => `<button type="button" class="dbtn" data-do="tap" data-i="${i}" data-j="${j}">${b[0]}</button>`).join('')}</div></div>`).join('')}<p class="dl3">${D[key].msg || '點點看上面的按鈕'}</p>`;
        },
        act(h, b) { D[key].msg = cards[+b.dataset.i].b[+b.dataset.j][1]; this.draw(h); }
    });

    const DEMOS = {
        split: {
            draw(h) {
                const S = D.split;
                const parts = S.mode === 'equal' ? '<p class="dl3">由所選成員平均分攤，除不盡的尾數依名單順序分配。</p>'
                    : NAMES.map((n, i) => S.m[i] ? `<div class="dr"><span>${n}</span><input class="in" inputmode="numeric" data-k="${S.mode === 'amount' ? 'a' : 'r'}" data-i="${i}" value="${S.mode === 'amount' ? S.a[i] : S.r[i]}" placeholder="${S.mode === 'amount' ? '金額' : '比例'}"></div>` : '').join('');
                h.innerHTML = `${head}${lbl('金額（TWD）')}<input class="in" inputmode="numeric" data-k="amt" value="${S.amt}">${lbl('分攤成員')}<div class="chips">${NAMES.map((n, i) => chip(S.m[i], 'mem', `data-i="${i}"`, n)).join('')}</div>${lbl('分帳方式')}<div class="chips">${[['equal', '平均'], ['amount', '自訂金額'], ['ratio', '按比例']].map(([k, t]) => chip(S.mode === k, 'mode', `data-v="${k}"`, t)).join('')}</div>${parts}<div class="pv"></div>`;
                this.pv(h);
            },
            pv(h) {
                const S = D.split, amt = parseInt(S.amt) || 0, idx = [0, 1, 2].filter(i => S.m[i]);
                let sh = idx.map(() => 0), msg = '';
                if (S.mode === 'equal') {
                    const b = Math.floor(amt / idx.length), r = amt - b * idx.length;
                    sh = idx.map((_, k) => b + (k < r ? 1 : 0));
                } else if (S.mode === 'ratio') {
                    const rs = idx.map(i => parseFloat(S.r[i]) || 0), sum = rs.reduce((a, b) => a + b, 0);
                    if (sum <= 0) msg = '請輸入比例';
                    else { sh = rs.map(x => Math.floor(amt * x / sum)); let r = amt - sh.reduce((a, b) => a + b, 0); for (let k = 0; r > 0; k = (k + 1) % sh.length, r--) sh[k]++; }
                } else {
                    sh = idx.map(i => parseInt(S.a[i]) || 0);
                    const diff = amt - sh.reduce((a, b) => a + b, 0);
                    msg = diff === 0 ? '✓ 金額吻合，可以儲存' : `加總不符，${diff > 0 ? '尚差' : '超出'} ${money(Math.abs(diff))}`;
                }
                h.querySelector('.pv').innerHTML = `<p class="dl2">分攤預覽</p>${idx.map((i, k) => `<div class="dr b"><span>${NAMES[i]}</span><span>TWD ${money(sh[k])}</span></div>`).join('')}${msg ? `<p class="dl3">${msg}</p>` : ''}`;
            },
            act(h, b) {
                const S = D.split;
                if (b.dataset.do === 'mem') { const i = +b.dataset.i; if (S.m[i] && S.m.filter(Boolean).length === 1) return; S.m[i] = S.m[i] ? 0 : 1; }
                if (b.dataset.do === 'mode') S.mode = b.dataset.v;
                this.draw(h);
            },
            inp(h, t) {
                const S = D.split;
                if (t.dataset.k === 'amt') S.amt = t.value;
                else S[t.dataset.k][+t.dataset.i] = t.value;
                this.pv(h);
            }
        },
        fx: {
            draw(h) {
                const S = D.fx;
                h.innerHTML = `${head}${lbl('金額（JPY）')}<input class="in" inputmode="numeric" data-k="amt" value="${S.amt}">${lbl('匯率')}<div class="chips">${chip(S.src === 'table', 'src', 'data-v="table"', '匯率表 1 JPY = 0.21')}${chip(S.src === 'custom', 'src', 'data-v="custom"', '自訂此筆匯率')}</div>${S.src === 'custom' ? `<div class="dr"><span>1 JPY =</span><input class="in" inputmode="decimal" data-k="rate" value="${S.rate}"><span>TWD</span></div>` : ''}<div class="pv"></div>`;
                this.pv(h);
            },
            pv(h) {
                const S = D.fx, rate = S.src === 'table' ? 0.21 : (parseFloat(S.rate) || 0);
                h.querySelector('.pv').innerHTML = `<div class="dr b"><span>換算台幣</span><span>≈ TWD ${money((parseFloat(S.amt) || 0) * rate)}</span></div><p class="dl3">${S.src === 'custom' ? '只影響這一筆，不會改到匯率表。' : '使用匯率表的匯率，管理員更新後會跟著變動。'}</p>`;
            },
            act(h, b) { D.fx.src = b.dataset.v; this.draw(h); },
            inp(h, t) { D.fx[t.dataset.k] = t.value; this.pv(h); }
        },
        transfer: {
            draw(h) {
                const s = D.transfer.s;
                const row = '<div class="dr"><span><b>小明</b> → <b>小華</b></span><b>TWD 300</b></div>';
                const body = s === 0 ? `${row}<p class="dl3">付款：未轉帳　收款：未確認</p><button type="button" class="dbtn" data-do="pay">標記已轉帳</button>`
                    : s === 1 ? `${row}<p class="dl3">付款：已轉帳　收款：待小華確認</p><div class="chips"><button type="button" class="dbtn" data-do="ok">確認收款</button><button type="button" class="dbtn ghost" data-do="void">退回</button></div>`
                        : `${row}<p class="dl3">✅ 已完成</p><button type="button" class="dbtn ghost" data-do="again">重新示範</button>`;
                h.innerHTML = head + body;
            },
            act(h, b) { D.transfer.s = { pay: 1, ok: 2, void: 0, again: 0 }[b.dataset.do]; this.draw(h); }
        },
        prepay: {
            draw(h) {
                const s = D.prepay.s;
                h.innerHTML = `${head}<div class="rc"><b>午餐 迴轉壽司</b><small>小明 付款・3 人分攤・每人 TWD 300</small>${s === 0 ? '<button type="button" class="dbtn" data-do="go">先轉帳</button>' : '<p class="dl3">已先轉帳・待小明確認</p><button type="button" class="dbtn ghost" data-do="back">重新示範</button>'}</div><p class="dl3">${s === 0 ? '小華按下「先轉帳」，表示已先把 300 轉給小明。' : '小明確認後，這筆會計入結算。'}</p>`;
            },
            act(h, b) { D.prepay.s = b.dataset.do === 'go' ? 1 : 0; this.draw(h); }
        },
        map: {
            draw(h) {
                const i = D.map.i, P = [['境港波止場', 18, 62], ['水木茂之路', 48, 30], ['鬼太郎機場', 78, 58]];
                h.innerHTML = `${head}<div class="mm">${P.map((p, k) => `<button type="button" class="pin${k === i ? ' on' : ''}" style="left:${p[1]}%;top:${p[2]}%" data-do="pin" data-i="${k}">📍</button>`).join('')}</div><div class="dr b"><span>${i < 0 ? '點釘子或按「下一站」' : P[i][0]}</span>${i < 0 ? '' : '<span class="dl3">📍 導航（實際會開啟 Google 地圖）</span>'}</div><div class="chips"><button type="button" class="dbtn ghost" data-do="step" data-v="-1">‹ 上一站</button><button type="button" class="dbtn" data-do="step" data-v="1">下一站 ›</button></div>`;
            },
            act(h, b) {
                const M = D.map;
                M.i = b.dataset.do === 'pin' ? +b.dataset.i : Math.max(0, Math.min(2, M.i + +b.dataset.v));
                this.draw(h);
            }
        },
        route: {
            draw(h) {
                h.innerHTML = `${head}<div class="rc" data-do="stay"><button type="button" class="tm" data-do="goto" data-v="景點卡">🎯</button><b>水木茂之路散步</b><small>一般景點卡</small></div><div class="rc meal" data-do="meal"><button type="button" class="tm" data-do="goto" data-v="餐食卡">🎯</button><b>午餐・海鮮丼</b><small>餐食卡</small></div><p class="dl3">${D.route.msg || '點點看上面的卡片與 🎯 按鈕'}</p>`;
            },
            act(h, b) {
                const v = b.dataset.do;
                D.route.msg = v === 'goto' ? `→ 實際會切到地圖頁並定位「${b.dataset.v}」` : v === 'meal' ? '→ 實際會開啟餐食總覽，再點餐廳名稱導航' : '→ 一般景點卡沒有導航，請點 🎯 到地圖頁';
                this.draw(h);
            }
        },
        dates: {
            draw(h) {
                const d = D.dates.d;
                h.innerHTML = `${head}<div class="chips ds">${[...Array(8)].map((_, i) => chip(i === d, 'day', `data-i="${i}"`, `D${i + 1}`)).join('')}</div><p class="dl3">11/0${2 + d} 的行程會顯示在日期列下方；開啟時自動停在今天。</p>`;
            },
            act(h, b) { D.dates.d = +b.dataset.i; this.draw(h); }
        },
        react: {
            draw(h) {
                const R = D.react, E = ['❤️', '😂', '👍'], base = [3, 1, 2];
                h.innerHTML = `${head}<div class="mm" style="display:flex;align-items:center;justify-content:center;font-size:34px">🖼️</div><div class="chips" style="margin-top:6px">${E.map((e, i) => chip(R.on[i], 'emo', `data-i="${i}"`, `${e} ${base[i] + R.on[i]}`)).join('')}</div>${R.list.map(t => `<p class="dl3">💬 ${t}</p>`).join('')}<div class="dr"><input class="in" maxlength="50" placeholder="留言（最多 50 字）" value="${R.txt}"><button type="button" class="dbtn" style="margin-top:0" data-do="send">送出</button></div>`;
            },
            act(h, b) {
                const R = D.react;
                if (b.dataset.do === 'emo') { const i = +b.dataset.i; R.on[i] = R.on[i] ? 0 : 1; }
                else if (R.txt.trim()) { R.list.push('小明：' + R.txt.trim()); R.txt = ''; }
                this.draw(h);
            },
            inp(h, t) { D.react.txt = t.value; }
        },
        titles: {
            draw(h) {
                const T = [['⏰', '準時王', '當天第一個分享照片的旅伴'], ['📸', '分享王', '當天分享最多照片的旅伴'], ['💖', '歡迎王', '當天你的照片收到最多心情'], ['💬', '話題王', '當天最多留言的照片是你分享的'], ['🙌', '熱心王', '當天幫大家按最多心情'], ['👑', '旅程人氣王', '整趟旅程收到最多心情'], ['📅', '全勤王', '每天都有分享照片']], i = D.titles.i;
                h.innerHTML = `${head}<p class="dl3" style="margin:0 0 4px">範例：11/03 D2 的稱號列</p><div class="chips">${T.map((t, k) => chip(k === i, 'tt', `data-i="${k}"`, `${t[0]} ${t[1]}`)).join('')}</div><div class="rc" style="padding-right:12px"><b>${T[i][0]} ${T[i][1]}</b><small>得獎條件：${T[i][2]}</small></div>`;
            },
            act(h, b) { D.titles.i = +b.dataset.i; this.draw(h); }
        },
        cand: {
            draw(h) {
                const R = [['漁港回転寿司 境港波止場店', '主要安排'], ['元氣亭丼飯', '候選'], ['中浦（螃蟹托羅碗）', '候選']], k = D.cand.pick;
                h.innerHTML = `${head}<p class="dl3" style="margin:0 0 4px">午餐（11/04）</p>${R.map((r, i) => `<div class="rc${i === k ? ' on' : ''}${i ? ' cand' : ''}" data-do="pick" data-i="${i}"><b>${r[0]}</b><span class="tg">${r[1]}</span></div>`).join('')}<p class="dl3">${k ? '→ 當天改選這間候選，點名稱即可導航。' : '→ 目前是主要安排，點其他間可改選候選。'}</p>`;
            },
            act(h, b) { D.cand.pick = +b.dataset.i; this.draw(h); }
        },
        alt: {
            draw(h) {
                const R = [['水木茂之路散步', '景點', 0], ['午餐・漁港回転寿司', '餐食', 0], ['午餐・元氣亭丼飯', '餐食', 1]];
                h.innerHTML = `${head}${R.map((r, i) => `<div class="rc${r[2] ? ' cand' : ''}" data-do="row" data-i="${i}"><b>${i + 1}. ${r[0]}</b><span class="tg">${r[1]}</span>${r[2] ? '<span class="tg">備選</span>' : ''}</div>`).join('')}<p class="dl3">${D.alt.msg || '地圖列表中，備選的項目是淡色並有「備選」標籤。點點看'}</p>`;
            },
            act(h, b) { D.alt.msg = '→ 實際會在地圖上定位第 ' + (+b.dataset.i + 1) + ' 站'; this.draw(h); }
        },
        madm: {
            draw(h) {
                const S = D.madm, P = [['境港波止場', 18, 62], ['水木茂之路', 48, 30], ['鬼太郎機場', 78, 58]];
                const pins = P.map((p, k) => `<button type="button" class="pin${S.sel === k ? ' on' : ''}" style="left:${k === S.sel && S.moved ? 62 : p[1]}%;top:${k === S.sel && S.moved ? 70 : p[2]}%" data-do="pin" data-i="${k}">📍</button>`).join('');
                const tags = '<span class="tg" style="position:absolute;left:6px;top:6px;margin:0">衛星</span><span class="tg" style="position:absolute;right:6px;top:6px;margin:0">☰</span>';
                let body = '<p class="dl3">點地圖空白處＝長按空白處；點釘子＝長按釘子（實際操作是長按）。</p>';
                if (S.m === 'add') body = `${lbl('新增地點')}<div class="chips">${['景點', '餐廳', '住宿'].map((t, i) => chip(S.t === i, 'type', `data-i="${i}"`, t)).join('')}</div><input class="in" style="margin-top:6px" placeholder="地點名稱（示範）"><p class="dl3">填好名稱與座標後儲存，地點會出現在地圖與列表。</p>`;
                else if (S.m === 'edit') body = `${lbl('「' + P[S.sel][0] + '」')}<div class="chips"><button type="button" class="dbtn" data-do="info">✏️ 修改名稱與說明</button><button type="button" class="dbtn ghost" data-do="move">↔ 拖曳調整位置</button></div><p class="dl3">${S.msg || '選一個動作'}</p>`;
                h.innerHTML = `${head}<div class="mm" data-do="blank">${tags}${pins}</div>${body}`;
            },
            act(h, b) {
                const S = D.madm, d = b.dataset.do;
                if (d === 'blank') { S.m = 'add'; S.sel = -1; S.moved = 0; }
                else if (d === 'pin') { S.m = 'edit'; S.sel = +b.dataset.i; S.moved = 0; S.msg = ''; }
                else if (d === 'type') S.t = +b.dataset.i;
                else if (d === 'info') S.msg = '→ 實際會開啟修改視窗，可改名稱、說明與類型。';
                else if (d === 'move') { S.moved = 1; S.msg = '→ 長按後拖到新位置放開，座標會自動儲存。'; }
                this.draw(h);
            }
        },
        meal: tapDemo('meal', [
            { t: '漁港回転寿司 境港波止場店', s: '午餐・主要安排', b: [['📍 導航', '→ 實際會開啟 Google 地圖，導航到「漁港回転寿司」']] },
            { t: '元氣亭丼飯', s: '午餐・備選', b: [['📍 導航', '→ 實際會開啟 Google 地圖，導航到「元氣亭丼飯」']] }
        ]),
        stay: tapDemo('stay', [
            { t: '境港 ○○飯店', s: '住宿', b: [['🎯 地圖', '→ 實際會切到地圖頁並定位這間住宿'], ['📍 導航', '→ 實際會開啟 Google 地圖導航']] }
        ])
    };

    let undo = null, undoKey = '', restoreRead = false, pages = [], steps = [], secs = [], pi = 0, opts = {}, from = 'itinerary', el = null, open = 0, token = 0, poll = 0, rt = 0;

    function build() {
        secs = SEC.map(s => ({ ...s, cats: s.cats.map(c => ({ ...c, it: c.it.filter(i => !i.ad || opts.admin) })).filter(c => c.it.length) }));
        pages = [];
        secs.forEach((s, si) => s.cats.forEach((_, ci) => pages.push({ s: si, c: ci })));
        steps = pages.flatMap((p, k) => secs[p.s].cats[p.c].it.map((_, i) => ({ pi: k, i })));
    }

    function css() {
        if (document.getElementById('tr-css')) return;
        const s = document.createElement('style');
        s.id = 'tr-css';
        s.textContent = '#tr-root{position:fixed;inset:0;z-index:9000}#tr-spot{position:fixed;border-radius:14px;box-shadow:0 0 0 9999px rgba(0,0,0,.62);outline:3px solid rgba(224,194,143,.95);transition:all .25s;pointer-events:none;animation:trPulse 1.2s infinite}#tr-spot.fl{animation:trFlash .5s 3,trPulse 1.2s 1.5s infinite}@keyframes trFlash{0%,100%{background:rgba(255,255,255,0)}50%{background:rgba(255,255,255,.4)}}@keyframes trPulse{0%,100%{outline-offset:0}50%{outline-offset:5px}}#tr-hand{position:fixed;display:none;font-size:30px;line-height:1;pointer-events:none;filter:drop-shadow(0 2px 3px rgba(0,0,0,.45));animation:trTap 1.1s infinite}#tr-hand.dn{animation-name:trTapD}@keyframes trTapD{0%,100%{transform:translate(0,0) scale(1)}50%{transform:translate(3px,8px) scale(.88)}}@keyframes trTap{0%,100%{transform:translate(0,0) scale(1)}50%{transform:translate(-3px,-8px) scale(.88)}}#tr-card{position:fixed;left:50%;transform:translateX(-50%);width:calc(100% - 2rem);max-width:26rem;background:#fff;border-radius:18px;box-shadow:0 8px 28px rgba(0,0,0,.3);color:#333;font-size:13px;line-height:1.6;display:flex;flex-direction:column;overflow:hidden}#tr-card button{font-family:inherit}.tr-strip{display:flex;background:#3b4d43;flex:none;overflow-x:auto}.tr-strip button{background:transparent;border:0;flex:1 0 auto;padding:10px 8px;font-size:13px;font-weight:700;color:rgba(255,255,255,.65)}.tr-strip button.on{color:#fff;box-shadow:inset 0 -3px 0 #e0c28f}.tr-cats{display:flex;gap:6px;overflow-x:auto;padding:8px 12px;flex:none;border-bottom:1px solid #eee}.tr-cats button{flex:none;padding:5px 12px;border-radius:9999px;background:#f0eee8;color:#3b4d43;font-size:12px;font-weight:700}.tr-cats button.on{background:#3b4d43;color:#fff}.tr-cats button.ad{background:#f6ecde;color:#8a6234}.tr-cats button.ad.on{background:#8a6234;color:#fff}#tr-card .q.on{animation:trQ .5s 3}@keyframes trQ{0%,100%{background:#f0eee8}50%{background:#ffe6a8}}#tr-card .bd{padding:10px 14px;overflow-y:auto;overscroll-behavior:contain;flex:1;-webkit-overflow-scrolling:touch}#tr-card .q{display:flex;justify-content:space-between;align-items:center;width:100%;text-align:left;padding:9px 12px;margin-top:6px;border-radius:10px;background:#f0eee8;color:#3b4d43;font-weight:700;font-size:13px}#tr-card .q.ad{background:#f6ecde;color:#8a6234}#tr-card .q i{font-style:normal;opacity:.6;transition:transform .2s}#tr-card .q.on i{transform:rotate(90deg)}#tr-card .a{display:none;padding:8px 12px 4px;color:#555}#tr-card .a.on{display:block}#tr-card .tag{font-size:10px;font-weight:700;color:#8a6234;margin-left:6px}#tr-card .ft{padding:10px 14px 14px;border-top:1px solid #eee;flex:none}#tr-card .dots{text-align:center;font-size:11px;color:#a39a8e;margin-bottom:8px}#tr-card .row{display:flex;gap:8px}#tr-card .row button{padding:13px 0;border-radius:14px;font-size:15px;font-weight:700}#tr-card .pri{flex:1.3;background:#3b4d43;color:#fff}#tr-card .sec{flex:1;background:#e7e4db;color:#3b4d43}#tr-card .skip{flex:1;background:#fff;color:#777;border:1.5px solid #cfcac0}#tr-card .row button:disabled{opacity:.35}.demo{margin-top:8px;padding:10px;border:1.5px dashed #cfcac0;border-radius:12px;background:#faf9f5}.demo .dl{font-size:11px;font-weight:700;color:#8a6234;margin-bottom:4px}.demo .dl2{font-size:11px;color:#888;margin:6px 0 3px}.demo .dl3{font-size:12px;color:#777;margin-top:4px}.demo .in{width:100%;padding:8px 10px;border:1.5px solid #ddd;border-radius:10px;font-size:14px;background:#fff}.demo .chips{display:flex;gap:6px;flex-wrap:wrap}.demo .chip{padding:6px 12px;border-radius:9999px;background:#fff;border:1.5px solid #ddd;font-size:12px;font-weight:700;color:#777}.demo .chip.on{background:#3b4d43;border-color:#3b4d43;color:#fff}.demo .dr{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:5px 0;font-size:13px}.demo .dr.b{border-top:1px solid #e8e4da}.demo .dbtn{padding:9px 14px;border-radius:10px;background:#3b4d43;color:#fff;font-size:13px;font-weight:700;margin-top:6px}.demo .dbtn.ghost{background:#e7e4db;color:#3b4d43}.demo .mm{position:relative;height:110px;border-radius:10px;background:linear-gradient(135deg,#dfe8dc,#cfdccb);margin-bottom:6px}.demo .pin{position:absolute;transform:translate(-50%,-50%);font-size:20px;opacity:.55}.demo .pin.on{opacity:1;font-size:26px}.demo .rc{position:relative;padding:10px 40px 10px 12px;margin-top:6px;border-radius:10px;background:#fff;border:1.5px solid #ddd}.demo .rc.meal{background:#fdf3e3}.demo .rc small{display:block;color:#999;font-size:11px}.demo .tg{display:inline-block;margin-left:6px;padding:0 7px;border-radius:9px;font-size:10px;font-weight:700;background:#eef2ee;color:#5c6e63}.demo .rc{padding-right:12px;cursor:pointer}.demo .rc.cand{background:#eef2ee;opacity:.85}.demo .rc.on{border-color:#3b4d43;box-shadow:0 0 0 2px rgba(59,77,67,.25);opacity:1}.demo .tm{position:absolute;right:6px;top:6px;width:30px;height:30px;border-radius:8px;background:#f0eee8;font-size:14px}#tr-root.adm .tr-strip{background:#7a5428}#tr-root.adm #tr-spot{outline-color:#f0b35c}#tr-root.adm #tr-card{box-shadow:0 8px 28px rgba(0,0,0,.3),0 0 0 3px #b08758}#tr-root.adm .tr-cats button{background:#f3e8d6;color:#7a5428}#tr-root.adm .tr-cats button.on{background:#7a5428;color:#fff}#tr-root.adm .tr-cats button.ad{background:#e8c99a;color:#5c3a14}#tr-root.adm .tr-cats button.ad.on{background:#5c3a14;color:#fff}#tr-root.adm #tr-card .q{background:#f3e8d6;color:#7a5428}#tr-root.adm #tr-card .q.ad{background:#7a5428;color:#fff}#tr-root.adm #tr-card .q.ad .tag{color:#ffd9a0}#tr-root.adm #tr-card .pri{background:#7a5428}#tr-root.adm #tr-card .sec{background:#efe2cc;color:#7a5428}#tr-root.adm #tr-card .dots{color:#a8845a}#tr-root.adm .demo .chip.on,#tr-root.adm .demo .dbtn{background:#7a5428;border-color:#7a5428;color:#fff}#tr-root.adm .demo .dbtn.ghost{background:#efe2cc;color:#7a5428}#tr-root.adm .demo .rc.on{border-color:#7a5428}.tr-ch{padding:16px}.tr-ch h3{font-size:16px;font-weight:700;color:#3b4d43}.tr-ch p{color:#777;font-size:12px;margin:2px 0 6px}.tr-ch .opt{display:block;width:100%;text-align:left;padding:14px;border-radius:14px;margin-top:8px;font-size:14px;font-weight:700;border:2px solid #cfcac0;background:#fff;color:#3b4d43}.tr-ch .opt small{display:block;font-weight:400;color:#888;font-size:12px;margin-top:2px}.tr-ch .opt.ad{border-color:#b08758;background:#fbf4e8;color:#7a5428}.tr-ch .skip{display:block;width:100%;margin-top:10px;padding:10px 0;border-radius:12px;background:#fff;color:#777;border:1.5px solid #cfcac0;font-size:13px;font-weight:700}';
        document.head.appendChild(s);
    }

    function itemsHtml(cat) {
        return cat.it.map((d, i) => `<button class="q${d.ad ? ' ad' : ''}${i === open ? ' on' : ''}" data-q="${i}"><span>${d.q}${d.ad ? '<span class="tag">管理員</span>' : ''}</span><i>▸</i></button><div class="a${i === open ? ' on' : ''}">${d.a}${d.demo ? `<div class="demo" data-demo="${d.demo}"></div>` : ''}</div>`).join('');
    }

    function drawDemos() {
        el.querySelectorAll('.demo').forEach(h => DEMOS[h.dataset.demo].draw(h));
    }

    function isPinned(n) {
        for (; n && n.nodeType === 1; n = n.parentElement) { const p = getComputedStyle(n).position; if (p === 'fixed' || p === 'sticky') return true; }
        return false;
    }

    // 遮罩、手指與卡片位置：目標貼在標題列下方，卡片撐滿其餘空間
    const GAP = 34, SIDE = 12;
    let cur = null, curReal = false, tick = 0, trackId = 0;
    const headerBottom = () => { const h = document.getElementById('sticky-wrapper'); return h ? h.getBoundingClientRect().bottom : 0; };

    // 標題列底部；記帳頁的分頁列也是 sticky，目標要再往下避開它
    function topInset(t) {
        const lt = document.getElementById('lg-tabs');
        return headerBottom() + (lt && lt.getClientRects().length && !lt.contains(t) ? lt.offsetHeight + 14 : 0);
    }

    function anchor(t) {
        if (isPinned(t)) return;
        const d = t.getBoundingClientRect().top - (topInset(t) + 14);
        if (Math.abs(d) > 6) window.scrollBy({ top: d, left: 0, behavior: 'instant' });
    }

    function layout(t, real) {
        const spot = el.querySelector('#tr-spot'), hand = el.querySelector('#tr-hand'), card = el.querySelector('#tr-card'), H = innerHeight;
        const r = t.getBoundingClientRect(), tall = r.height > H * 0.5, low = !tall && r.top + r.height / 2 > H / 2, min = Math.min(300, H * 0.42), cap = H * 0.8;
        const ch = tall ? Math.max(min, H * 0.42) : Math.max(min, Math.min(cap, low ? r.top - GAP - SIDE : H - r.bottom - GAP - SIDE));
        const ct = tall ? H - SIDE - ch : low ? Math.max(SIDE, r.top - GAP - ch) : Math.min(H - SIDE - ch, r.bottom + GAP);
        Object.assign(card.style, { height: ch + 'px', top: ct + 'px', bottom: 'auto' });
        const top = Math.max(r.top, 4), bot = Math.min(r.bottom, H - 4), left = Math.max(r.left, 4), right = Math.min(r.right, innerWidth - 4);
        spot.style.cssText = `left:${left - 6}px;top:${top - 6}px;width:${right - left + 12}px;height:${bot - top + 12}px`;
        hand.textContent = low ? '👇' : '👆';
        hand.className = low ? 'dn' : '';
        hand.style.display = real ? 'block' : 'none';
        hand.style.left = Math.max(4, Math.min((left + right) / 2, innerWidth - 20) - 14) + 'px';
        hand.style.top = (tall ? top + 24 : low ? top - 32 : bot + 2) + 'px';
    }

    // 放好後持續校正：前 1.2 秒每格重量，之後每 0.5 秒一次（天氣、記帳等內容載入會讓版面位移）
    function track(id, n) {
        clearTimeout(tick);
        tick = setTimeout(() => {
            if (!el || id !== trackId || !cur) return;
            if (!cur.isConnected) return focus();
            anchor(cur);
            layout(cur, curReal);
            track(id, n + 1);
        }, n < 75 ? 16 : 500);
    }

    // real 為 true 表示框的是小項對應的真實按鈕：才出現手指與閃爍；否則只框大項，不指著它
    function place(t, real) {
        if (!el) return;
        cur = t;
        curReal = !!real;
        trackId++;
        const spot = el.querySelector('#tr-spot'), hand = el.querySelector('#tr-hand'), card = el.querySelector('#tr-card');
        if (!t) {
            spot.style.cssText = 'left:50%;top:50%;width:0;height:0';
            hand.style.display = 'none';
            Object.assign(card.style, { height: Math.min(innerHeight * 0.82, innerHeight - 32) + 'px', top: '1rem', bottom: 'auto' });
            return;
        }
        anchor(t);
        layout(t, real);
        spot.classList.remove('fl');
        if (real) { void spot.offsetWidth; spot.classList.add('fl'); }
        track(trackId, 0);
    }

    // 教學中鎖住主畫面，避免手指或滾輪帶動背景捲動
    function lock(on) {
        document.documentElement.style.overflow = on ? 'hidden' : '';
        document.documentElement.style.overscrollBehavior = on ? 'none' : '';
    }

    // 依目前展開的小項聚焦：先框頁面預設按鈕，找得到小項的按鈕就改框它（動態內容會輪詢等待）
    function focus() {
        if (!el || !pages.length) return;
        clearTimeout(poll);
        const tk = ++token, p = pages[pi], sec = secs[p.s], cat = sec.cats[p.c], it = open >= 0 ? cat.it[open] : null;
        const want = (it && it.tab) || sec.tab || 'itinerary';
        if (currentTab !== want) switchTab(want);
        const key = pi + ':' + open;
        if (undoKey !== key) {
            if (undo) { undo(); undo = null; }
            undoKey = key;
            if (it && it.ex) undo = it.ex.on() || null;
        }
        const dflt = () => find(cat.sel || sec.sel);
        if (!it || !it.sel) return void place(dflt(), false);
        let preDone = !it.pre;
        const attempt = (n) => {
            if (tk !== token || !el) return;
            if (!preDone) preDone = it.pre.every(s => { const b = document.querySelector(s); if (b) b.click(); return !!b; });
            const t = preDone && find(it.sel);
            if (t) return place(t, true);
            if (n === 0) place(dflt(), false);
            if (n < 60) poll = setTimeout(() => attempt(n + 1), 250);
        };
        poll = setTimeout(() => attempt(0), 120);
    }

    const stepNo = () => steps.findIndex(x => x.pi === pi && x.i === Math.max(open, 0));

    function ftHtml() {
        const n = stepNo(), last = n === steps.length - 1;
        return `<div class="dots">第 ${n + 1} / ${steps.length} 項・點項目可展開或收合</div><div class="row">${last ? '' : '<button class="skip" data-nav="end">略過</button>'}<button class="sec" data-nav="prev"${n ? '' : ' disabled'}>上一步</button><button class="pri" data-nav="next">${last ? '完成' : '下一步'}</button></div>`;
    }

    // 讓目前選中的分頁／分類按鈕捲到橫向列的中間，才找得到教到哪裡
    function reveal(box, btn) {
        if (box && btn) box.scrollLeft += btn.getBoundingClientRect().left - box.getBoundingClientRect().left - (box.clientWidth - btn.offsetWidth) / 2;
    }

    function chooser() {
        const card = el.querySelector('#tr-card');
        place(null, false);
        card.innerHTML = '<div class="tr-ch"><h3>📖 新手教學</h3><p>請先選擇要看的教學內容</p><button type="button" class="opt" data-mode="member">👤 一般會員教學<small>行程、地圖、記帳、清單、花絮等一般功能</small></button><button type="button" class="opt ad" data-mode="admin">✏️ 管理員教學<small>完整教學，管理員專屬項目另外標色（教學期間會暫時切到編輯模式，結束後還原）</small></button><button type="button" class="skip" data-nav="end">略過</button></div>';
        Object.assign(card.style, { height: 'auto', top: '50%', transform: 'translate(-50%,-50%)' });
    }

    function begin(mode) {
        opts.admin = mode === 'admin';
        el.classList.toggle('adm', opts.admin);
        if (opts.admin && opts.isRead && opts.setRead) { opts.setRead(false); restoreRead = true; }
        el.querySelector('#tr-card').style.transform = '';
        pi = 0;
        build();
        render();
    }

    function render(i) {
        const p = pages[pi], sec = secs[p.s], cat = sec.cats[p.c];
        open = i || 0;
        el.querySelector('#tr-card').innerHTML = `<div class="tr-strip">${secs.map((s, k) => s.nav ? `<button data-s="${k}" class="${k === p.s ? 'on' : ''}">${s.nav}</button>` : '').join('')}</div><div class="tr-cats">${sec.cats.map((c, k) => `<button data-c="${k}" class="${c.n === '管理員' ? 'ad ' : ''}${k === p.c ? 'on' : ''}">${c.n}</button>`).join('')}</div><div class="bd">${itemsHtml(cat)}</div><div class="ft">${ftHtml()}</div>`;
        drawDemos();
        reveal(el.querySelector('.tr-strip'), el.querySelector('.tr-strip .on'));
        reveal(el.querySelector('.tr-cats'), el.querySelector('.tr-cats .on'));
        if (open > 0) { const bd = el.querySelector('.bd'), q = el.querySelectorAll('.q')[open]; bd.scrollTop = q.offsetTop - bd.offsetTop - 6; }
        focus();
    }

    // 展開第 i 項（-1 為全部收合），並更新遮罩與底部進度
    function setOpen(i) {
        const qs = el.querySelectorAll('.q'), as = el.querySelectorAll('.a');
        qs.forEach(b => b.classList.remove('on'));
        as.forEach(a => a.classList.remove('on'));
        open = i;
        if (i >= 0) { qs[i].classList.add('on'); as[i].classList.add('on'); const bd = el.querySelector('.bd'); bd.scrollTo({ top: qs[i].offsetTop - bd.offsetTop - 6, behavior: 'smooth' }); }
        el.querySelector('.ft').innerHTML = ftHtml();
        focus();
    }

    const toggle = (i) => setOpen(open === i ? -1 : i);

    // 下一步／上一步：逐個小項前進，跨分類、跨大項
    function step(d) {
        const n = open < 0 ? steps.findIndex(x => x.pi === pi && x.i === 0) + (d < 0 ? -1 : 0) : stepNo() + d;
        if (n >= steps.length) return end();
        const t = steps[n];
        if (!t) return;
        if (t.pi === pi) setOpen(t.i);
        else { pi = t.pi; render(t.i); }
    }

    function go(n) { pi = n; render(); }

    function onResize() { clearTimeout(rt); rt = setTimeout(focus, 200); }

    function end() {
        clearTimeout(poll); clearTimeout(rt); clearTimeout(tick); trackId++; cur = null; lock(false);
        if (undo) { undo(); undo = null; }
        undoKey = '';
        window.removeEventListener('resize', onResize);
        if (el) { el.remove(); el = null; }
        if (window.hintDone) hintDone('tour');
        switchTab(from);
        if (restoreRead && opts.setRead) { restoreRead = false; opts.setRead(true); }
    }

    window.TOUR = {
        start(o) {
            if (el) return;
            opts = o || {};
            from = (typeof currentTab === 'string' && currentTab !== 'food' && currentTab !== 'stays') ? currentTab : 'itinerary';
            pi = 0; pages = []; undo = null; undoKey = ''; restoreRead = false;
            reset(); css();
            el = document.createElement('div');
            el.id = 'tr-root';
            el.innerHTML = '<div id="tr-spot"></div><div id="tr-hand">👆</div><div id="tr-card"></div>';
            el.addEventListener('click', (e) => {
                e.stopPropagation();
                const T = e.target;
                const demo = T.closest('[data-demo]');
                if (demo) { const b = T.closest('[data-do]'); if (b && DEMOS[demo.dataset.demo].act) DEMOS[demo.dataset.demo].act(demo, b); return; }
                const md = T.closest('[data-mode]');
                if (md) return begin(md.dataset.mode);
                const s = T.closest('[data-s]'), c = T.closest('[data-c]'), q = T.closest('[data-q]'), n = T.closest('[data-nav]');
                if (s) return go(pages.findIndex(p => p.s === +s.dataset.s));
                if (c) return go(pages.findIndex(p => p.s === pages[pi].s && p.c === +c.dataset.c));
                if (q) return toggle(+q.dataset.q);
                if (!n) return;
                if (n.dataset.nav === 'end') return end();
                step(n.dataset.nav === 'prev' ? -1 : 1);
            });
            el.addEventListener('input', (e) => {
                const demo = e.target.closest('[data-demo]');
                if (demo && DEMOS[demo.dataset.demo].inp) DEMOS[demo.dataset.demo].inp(demo, e.target);
            });
            let ty = 0;
            el.addEventListener('touchstart', (e) => { ty = e.touches[0].clientY; }, { passive: true });
            el.addEventListener('touchmove', (e) => {
                const bd = e.target.closest('.bd');
                if (!bd) { if (!e.target.closest('.tr-cats')) e.preventDefault(); return; }
                const dy = e.touches[0].clientY - ty;
                if (bd.scrollHeight <= bd.clientHeight || (dy > 0 && bd.scrollTop <= 0) || (dy < 0 && bd.scrollTop + bd.clientHeight >= bd.scrollHeight - 1)) e.preventDefault();
            }, { passive: false });
            el.addEventListener('wheel', (e) => { if (!e.target.closest('.bd')) e.preventDefault(); }, { passive: false });
            document.body.appendChild(el);
            lock(true);
            window.addEventListener('resize', onResize);
            if (opts.canAdmin) chooser(); else begin('member');
        }
    };
})();
