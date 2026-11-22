// 旅程資料與版型：每趟旅程一份資料，頁面由資料產生（目前只有鳥取）
(function (g) {
    const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const pad = (n) => String(n).padStart(2, '0');

    const TRIPS = {
        tottori: {
            id: "tottori",
            year: 2026,
            shortName: "山陰",
            pageTitle: "2026 山陰鳥取秋日紀行",
            splash: {"from":"TPE","to":"YGJ","eyebrow":"2026 JAPAN / SAN-IN","title":"山陰・秋日紀行"},
            eyebrow: "2026 JAPAN / SAN-IN",
            title: "山陰・秋日紀行",
            subtitle: "島根 × 鳥取 ｜ 2026.11.02 - 11.09",
            map: {"center":[35.45,133.4],"zoom":9,"farKm":300,"region":"山陰地區"},
            weather: {"places":{"tama":["玉造",35.43,133.01],"matsue":["松江",35.4681,133.0484],"sakai":["境港",35.5409,133.2275],"izumo":["出雲",35.367,132.755],"tottori":["鳥取",35.5011,134.2351],"kura":["倉吉",35.4306,133.8228],"yonago":["米子",35.4283,133.331]}},
            notes: ["11/2 玉造溫泉首日以輕裝為主，請攜帶後背包。","11/3 原訂 14:00 取車；11/9 還車後搭機返台。","11/4 李白酒造營業至 18:00；11/5 鬼塚虎工廠營業 11:00–17:00。","11/3 早餐、11/7 晚餐、11/8 午餐等仍為待確認選項。"],
            days: [
            {"month":11,"day":2,"week":"MON","tag":"溫泉・移動","secTag":"溫泉・移動","title":"抵達米子・溫泉初日","note":"💡 貼心提醒：今日請攜帶後背包，輕裝上陣。","meals":["自行解決","視情況","A Coopm 超市"],"foodLabel":"玉造溫泉","wx":"tama","steps":["08:40-12:00 桃園飛往米子（航班）","米子機場搭巴士 ➔ 松江站寄放行李","搭電車前往玉造溫泉站","A Coopm 超市採買晚餐","入住玉井別館溫泉飯店"]},
            {"month":11,"day":3,"week":"TUE","tag":"自駕・購物","secTag":"自駕・購物","title":"松江取車・慢遊採買","meals":["待確認","中華中村製麺所","AEON 薩利亞"],"foodLabel":"松江","wx":"matsue","steps":["10:00 離開玉造溫泉，返回松江站拿行李","14:00 松江站取車（自駕開始）","午餐：中華中村製麵所","民宿放置行李","下午/晚餐：AEON 松江購物（薩利亞晚餐）"]},
            {"month":11,"day":4,"week":"WED","tag":"文化・散策","secTag":"文化・散策","title":"古城、神社與夕陽","meals":["珈琲館 京店店","姬路拉麵松江店／大阪王将","MAURI 超市（自煮）"],"foodLabel":"松江","wx":"matsue","steps":["早餐：珈琲館 京店店","八重垣神社 參拜","國寶松江城 散策","午餐：姬路拉麵松江店 / 大阪王將","島根縣立美術館 欣賞夕陽","李白酒造（營業至18:00）","晚餐：MAURI 超市（無印良品）採買自煮"]},
            {"month":11,"day":5,"week":"THU","tag":"庭園・海港","secTag":"庭園・海港","title":"庭園紅葉與港町漫遊","meals":["Lawson 松江馬潟店","漁港回転寿司 境港波止場店／元氣亭丼飯／中浦（螃蟹托羅碗）","燒肉若富"],"foodLabel":"境港・米子","wx":"sakai","steps":["早餐：Lawson 松江馬潟店","由志園（賞牡丹/紅葉，約 ¥1,400/人）","全家江島大橋店（拍美景）","美保神社","午餐候選：漁港回転寿司 境港波止場店／元氣亭丼飯／中浦（螃蟹托羅碗）","境港車站 + 妖怪神社","Onitsuka Tiger 鬼塚虎工廠（11:00-17:00）","唐吉訶德米子店 & LOFT 米子店購物","晚餐：燒肉若富"]},
            {"month":11,"day":6,"week":"FRI","tag":"參拜・祈願","secTag":"參拜祈願","title":"出雲巡禮・結緣之路","meals":["焙煎珈琲工房 梢庵","蕎麦処八雲／同級出雲そば","とんかつ一番"],"foodLabel":"出雲","wx":"izumo","steps":["早餐：焙煎珈琲工房 梢庵","宇美神社（切斷惡緣）","稻佐之濱（取沙）➔ 出雲大社（換沙參拜）","星巴克出雲大社店（買琉璃杯）","午餐：蕎麦処八雲 / 同級出雲そば","youme Town 出雲購物 & Workman Plus","PLANT 出雲店（扭蛋、蘋果派）","晚餐：とんかつ一番"]},
            {"month":11,"day":7,"week":"SAT","tag":"海岸・自然","secTag":"海岸・自然","title":"白兔海岸・鳥取砂丘","meals":["LAWSON 鳥取大栄店","賀露港・市場食堂（螃蟹）","待確定"],"foodLabel":"鳥取","wx":"tottori","steps":["早餐：LAWSON 鳥取大栄店","白兔神社 + 海岸 + 道の駅（約 90 分車程）","鳥取砂丘 + 砂之美術館 + Totto PURIN","午餐：賀露港・市場食堂（吃螃蟹）","the mills（選品店）","Shamine 鳥取（星巴克、扭蛋、LOFT）& AEON 鳥取","晚餐：待確定（可點擊修改）"]},
            {"month":11,"day":8,"week":"SUN","tag":"小鎮・散策","secTag":"小鎮・散策","title":"柯南小鎮與白壁街區","meals":["道の駅 ほうじょう（休息站）","待確定","居酒屋"],"foodLabel":"柯南小鎮・倉吉","wx":"kura","steps":["早餐：道の駅ほうじょう（休息站）","柯南小鎮","午餐：待確定（可點擊修改）","倉吉白壁土藏群 漫步","晚餐：在地居酒屋"]},
            {"month":11,"day":9,"week":"MON","tag":"返程・移動","secTag":"返程・移動","title":"咖啡、還車與返程","meals":["待確定","待確定","待確定"],"foodLabel":"米子・桃園","wx":"yonago","steps":["羅多倫咖啡・Shamine 松江店","前往米子機場還車","13:00 - 15:20 米子飛往桃園（航班）","平安返回台灣，展開工作日常"]}
            ]
        }
    };

    const dayLabel = (d, i) => `${pad(d.month)}/${pad(d.day)} ${d.week} D${i + 1}`;
    const meal = (cls, k, label, text) => `
                    <div>
                        <div class="meal-label">${label}</div>
                        <div class="meal-value${cls}" data-key="${k}">${esc(text)}</div>
                    </div>`;
    const MEALS = [['breakfast', '早餐'], ['lunch', '午餐'], ['dinner', '晚餐']];

    function daysHtml(T) {
        return T.days.map((d, i) => {
            const n = i + 1;
            return `
            <!-- DAY ${n} -->
            <section id="day${n}" class="card p-5 border-t-4 border-[#3b4d43]">
                <div class="flex justify-between items-center mb-3">
                    <span class="text-xs font-bold text-[#3b4d43] bg-[#3b4d43]/10 px-2.5 py-1 rounded-full">${dayLabel(d, i)}</span>
                    <span class="text-xs text-gray-500">${esc(d.secTag)}</span>
                </div>
                <h2 class="text-lg font-bold mb-3" data-key="d${n}_title">${esc(d.title)}</h2>
                <div class="space-y-1 text-sm">
                    <div class="flex justify-between items-center mb-1">
                        <p class="font-medium text-gray-700">📍 今日路線：</p>
                        <button onclick="openAddChoice('d${n}', this)"
                            class="hidden add-route-btn bg-[#3b4d43] text-white px-2 py-1 rounded-md text-[10px] font-bold hover:bg-[#2c3b33]">＋新增</button>
                    </div>
                    <div id="route-list-d${n}" class="space-y-1"></div>${d.note ? `
                    <div class="mt-3 bg-amber-50 border-l-4 border-amber-400 p-2 text-xs text-amber-800"
                        data-key="d${n}_note">
                        ${esc(d.note)}
                    </div>` : ''}
                </div>
                <div class="meal-strip">${MEALS.map(([k, l], x) => meal('', `d${n}_${k}`, l, d.meals[x])).join('')}
                </div>
            </section>`;
        }).join('\n');
    }

    function foodHtml(T) {
        return T.days.map((d, i) => {
            const n = i + 1;
            return `
                    <div id="food-day${n}" class="border border-gray-200 rounded-xl p-3">
                        <p class="text-xs font-bold text-[#3b4d43] mb-2">${dayLabel(d, i)} ${esc(d.foodLabel)}</p>
                        <div class="meal-strip border-t-0">${MEALS.map(([k, l]) => meal(' mirror', `d${n}_${k}`, l, '')).join('')}
                        </div>
                    </div>`;
        }).join('');
    }

    function applyHeader(T) {
        const set = (id, t) => { const el = document.getElementById(id); if (el) el.textContent = t; };
        document.title = T.pageTitle;
        set('splash-from', T.splash.from); set('splash-to', T.splash.to);
        set('splash-eyebrow', T.splash.eyebrow); set('splash-title', T.splash.title);
        set('site-eyebrow', T.eyebrow); set('site-title', T.title); set('site-subtitle', T.subtitle);
    }

    // ---- 決定這次開哪一趟旅程：網址 ?trip= → 上次開過的 → 鳥取 ----
    const ID_RE = /^[a-z0-9][a-z0-9-]{2,19}$/;
    const ls = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
    const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { } };
    const has = (id) => Object.prototype.hasOwnProperty.call(TRIPS, id);
    const fromUrl = (location.search.match(/[?&]trip=([^&#]*)/) || [])[1];
    const id = [fromUrl, ls('lastTrip'), 'tottori'].find((x) => x && ID_RE.test(x));

    // 從資料庫讀回來的資料可能缺空陣列（資料庫不存空陣列），補齊後才使用
    const normalize = (m, id) => {
        if (!m || !Array.isArray(m.days) || !m.days.length) return null;
        const days = m.days.map((d) => d && d.month && d.day && d.week ? Object.assign({ secTag: '', tag: '', title: '', foodLabel: '', wx: 'x', steps: [], meals: ['', '', ''] }, d, { meals: [0, 1, 2].map((i) => (d.meals && d.meals[i]) || '') }) : null);
        if (days.includes(null)) return null;
        return Object.assign({ year: new Date().getFullYear(), shortName: '旅程', pageTitle: m.title || '旅程', splash: { from: '', to: '', eyebrow: '', title: m.title || '' }, eyebrow: '', title: '', subtitle: '', notes: [], weather: { places: { x: ['東京', 35.68, 139.76] } }, map: { center: [35.68, 139.76], zoom: 5, farKm: 3000, region: '目的地' } }, m, { id, days });
    };
    const placeholder = (id) => {
        const t = new Date();
        return { id, placeholder: true, year: t.getFullYear(), shortName: '旅程', pageTitle: '旅程', splash: { from: '', to: '', eyebrow: '', title: '載入中' }, eyebrow: '', title: '載入中', subtitle: '', notes: [],
            map: { center: [35.68, 139.76], zoom: 5, farKm: 3000, region: '目的地' }, weather: { places: { x: ['東京', 35.68, 139.76] } },
            days: [{ month: t.getMonth() + 1, day: t.getDate(), week: ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'][t.getDay()], tag: '', secTag: '', title: '', meals: ['', '', ''], foodLabel: '', wx: 'x', steps: [] }] };
    };
    let T = has(id) ? TRIPS[id] : null;
    if (!T) { try { T = normalize(JSON.parse(ls('meta_' + id)), id); } catch (e) { T = null; } }
    if (T) lsSet('lastTrip', id); else T = placeholder(id);

    // 非鳥取的旅程：用旅程名稱產生安裝用的 manifest（已安裝的名稱不會變）
    if (id !== 'tottori' && !T.placeholder) {
        try {
            const o = location.origin, el = document.querySelector('link[rel="manifest"]');
            const m = { name: T.pageTitle, short_name: T.shortName, start_url: o + '/?trip=' + id, scope: o + '/', display: 'standalone', background_color: '#3b4d43', theme_color: '#3b4d43',
                icons: [{ src: o + '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' }, { src: o + '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }] };
            if (el) el.href = URL.createObjectURL(new Blob([JSON.stringify(m)], { type: 'application/manifest+json' }));
        } catch (e) { }
    }

    g.TRIPS = TRIPS;
    g.TRIP = T;
    g.TRIP_NS = id === 'tottori' ? '' : id + ':';
    g.tripRender = { days: daysHtml, food: foodHtml, header: applyHeader, normalize };
})(typeof window !== 'undefined' ? window : globalThis);
