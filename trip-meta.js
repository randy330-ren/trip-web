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
        const dm = { center: [35.68, 139.76], zoom: 5, farKm: 3000, region: '目的地' };
        return Object.assign({ year: new Date().getFullYear(), shortName: '旅程', pageTitle: m.title || '旅程', eyebrow: '', title: '', subtitle: '', notes: [] }, m, {
            id, days,
            splash: Object.assign({ from: '', to: '', eyebrow: '', title: m.title || '' }, m.splash),
            map: Object.assign(dm, m.map),
            weather: { places: m.weather && m.weather.places && Object.keys(m.weather.places).length ? m.weather.places : { x: ['東京', 35.68, 139.76] } },
            notes: m.notes || []
        });
    };
    const placeholder = (id) => {
        const t = new Date();
        return { id, placeholder: true, year: t.getFullYear(), shortName: '旅程', pageTitle: '旅程', splash: { from: '', to: '', eyebrow: '', title: '載入中' }, eyebrow: '', title: '載入中', subtitle: '', notes: [],
            map: { center: [35.68, 139.76], zoom: 5, farKm: 3000, region: '目的地' }, weather: { places: { x: ['東京', 35.68, 139.76] } },
            days: [{ month: t.getMonth() + 1, day: t.getDate(), week: ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'][t.getDay()], tag: '', secTag: '', title: '', meals: ['', '', ''], foodLabel: '', wx: 'x', steps: [] }] };
    };
    // ---- 給 AI 的提示詞與範例（視窗上的複製按鈕、docs/trip-import-format.md 共用同一份）----
    const EXAMPLE = {"pageTitle": "2027 沖繩自由行", "title": "沖繩・春日紀行", "subtitle": "那霸 ｜ 2027.03.10 - 03.12", "eyebrow": "2027 JAPAN / OKINAWA", "shortName": "沖繩", "year": 2027, "splash": {"from": "TPE", "to": "OKA", "eyebrow": "2027 JAPAN / OKINAWA", "title": "沖繩・春日紀行"}, "map": {"center": [26.2124, 127.6809], "zoom": 10, "farKm": 150, "region": "沖繩地區"}, "weather": {"places": {"naha": ["那霸", 26.2124, 127.6809], "motobu": ["本部", 26.6577, 127.8985]}}, "notes": ["3/10 抵達後先到飯店寄放行李。", "3/12 退房後前往機場。"], "days": [{"month": 3, "day": 10, "tag": "抵達・市區", "title": "抵達那霸・國際通散步", "note": "貼心提醒：第一天請輕裝。", "meals": ["機上", "機場輕食", "國際通居酒屋"], "foodLabel": "那霸", "wx": "naha", "steps": ["08:40 桃園出發", "12:30 抵達那霸機場", "搭單軌電車前往飯店", "國際通散步"]}, {"month": 3, "day": 11, "tag": "海洋・景點", "title": "美麗海水族館", "meals": ["飯店早餐", "備瀨福木並木道午餐", "自由用餐"], "foodLabel": "本部", "wx": "motobu", "steps": ["自駕前往本部", "美麗海水族館", "備瀨福木並木道"]}]};
    const PROMPT = [
        "請把我提供的旅遊行程整理成一份 JSON，只輸出 JSON 本身（不要加說明文字或程式碼框）。",
        "格式與欄位如下：pageTitle、title、subtitle、eyebrow、shortName、year、splash（from、to、eyebrow、title）、map（center 為 [緯度, 經度]、zoom、farKm、region）、weather.places（每個地點為 \"代碼\": [\"名稱\", 緯度, 經度]，代碼用英文小寫）、notes（出發前提醒字串陣列）、days（陣列）。",
        "days 每一天包含：month、day（數字）、tag（8 字內短標籤）、title（當天主題）、note（可省略）、meals（[早餐, 午餐, 晚餐] 三個字串，未知填「待確認」）、foodLabel（地點名稱）、wx（天氣地點代碼，必須存在於 weather.places）、steps（當天路線，每個項目一個字串，保留時間與重點）。",
        "規則：日期依先後排列、不可跨年；不要輸出 week；經緯度請給大致正確的數字；沒有資訊的欄位請省略，不要編造；請勿輸出任何個人資料。",
        "以下是我的行程內容："
    ].join('\n');

    // ---- 匯入／建立旅程：檢查並整理成標準格式（星期自動由日期算出）----
    const WEEK = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
    function validate(raw, id) {
        const o = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : null;
        if (!o) return { ok: false, errors: ['內容不是有效的 JSON 物件'], meta: null };
        const errors = [];
        const s = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
        const num = (v, lo, hi) => (typeof v === 'number' && isFinite(v) && v >= lo && v <= hi ? v : null);
        if (!Array.isArray(o.days) || !o.days.length) errors.push('days 必須是至少一天的陣列');
        else if (o.days.length > 31) errors.push('days 最多 31 天');
        const year = Number.isInteger(o.year) && o.year >= 2000 && o.year <= 2100 ? o.year : new Date().getFullYear();
        const places = {};
        const wp = o.weather && o.weather.places && typeof o.weather.places === 'object' ? o.weather.places : {};
        Object.entries(wp).slice(0, 12).forEach(([k, p]) => {
            if (!/^[A-Za-z0-9_-]{1,20}$/.test(k)) return errors.push('天氣地點代碼「' + k + '」只能用英數、底線、連字號');
            if (!Array.isArray(p) || typeof p[0] !== 'string' || num(p[1], -90, 90) === null || num(p[2], -180, 180) === null) return errors.push('天氣地點「' + k + '」格式應為 ["名稱", 緯度, 經度]');
            places[k] = [s(p[0], 20), p[1], p[2]];
        });
        if (!Object.keys(places).length) places.x = ['東京', 35.68, 139.76];
        const first = Object.keys(places)[0];
        let prev = 0;
        const days = (Array.isArray(o.days) ? o.days.slice(0, 31) : []).map((d, i) => {
            const n = i + 1;
            if (!d || typeof d !== 'object') { errors.push('第 ' + n + ' 天不是物件'); return null; }
            const { month, day } = d;
            if (!Number.isInteger(month) || !Number.isInteger(day) || month < 1 || month > 12 || day < 1 || day > 31) { errors.push('第 ' + n + ' 天的 month／day 不正確'); return null; }
            const dt = new Date(year, month - 1, day);
            if (dt.getMonth() !== month - 1) { errors.push('第 ' + n + ' 天的日期不存在（' + month + '/' + day + '）'); return null; }
            if (month * 100 + day <= prev) errors.push('第 ' + n + ' 天的日期必須晚於前一天（目前不支援跨年）');
            prev = month * 100 + day;
            const tag = s(d.tag, 20), out = {
                month, day, week: WEEK[dt.getDay()], tag, secTag: s(d.secTag, 20) || tag, title: s(d.title, 60) || '第 ' + n + ' 天', foodLabel: s(d.foodLabel, 20),
                wx: places[d.wx] ? d.wx : first, meals: [0, 1, 2].map((j) => s(Array.isArray(d.meals) ? d.meals[j] : '', 60)),
                steps: (Array.isArray(d.steps) ? d.steps : []).slice(0, 40).map((t) => s(t, 200)).filter(Boolean)
            };
            if (s(d.note, 200)) out.note = s(d.note, 200);
            return out;
        });
        const pageTitle = s(o.pageTitle, 60) || s(o.title, 40);
        if (!pageTitle) errors.push('需要 pageTitle（旅程名稱）');
        const m = o.map && typeof o.map === 'object' ? o.map : {};
        const c = Array.isArray(m.center) && num(m.center[0], -90, 90) !== null && num(m.center[1], -180, 180) !== null ? [m.center[0], m.center[1]] : [places[first][1], places[first][2]];
        const sp = o.splash && typeof o.splash === 'object' ? o.splash : {};
        const title = s(o.title, 40) || pageTitle, eyebrow = s(o.eyebrow, 60);
        const meta = {
            year, shortName: s(o.shortName, 10) || pageTitle.slice(0, 4), pageTitle, eyebrow, title, subtitle: s(o.subtitle, 80),
            splash: { from: s(sp.from, 5), to: s(sp.to, 5), eyebrow: s(sp.eyebrow, 60) || eyebrow, title: s(sp.title, 40) || title },
            map: { center: c, zoom: num(m.zoom, 1, 18) || 10, farKm: num(m.farKm, 10, 20000) || 300, region: s(m.region, 20) || '目的地' },
            weather: { places }, notes: (Array.isArray(o.notes) ? o.notes : []).slice(0, 20).map((t) => s(t, 200)).filter(Boolean),
            days: days.filter(Boolean)
        };
        return { ok: !errors.length, errors, meta };
    }
    // 空白旅程：只有日期與標題，內容之後在網頁上補
    function blank(name, start, n) {
        const t = new Date(start + 'T00:00:00');
        if (isNaN(t) || !(n >= 1 && n <= 31)) return { ok: false, errors: ['請填寫正確的起始日期與天數（1～31）'] };
        const end = new Date(t.getFullYear(), t.getMonth(), t.getDate() + n - 1);
        if (end.getFullYear() !== t.getFullYear()) return { ok: false, errors: ['目前不支援跨年的旅程'] };
        const p2 = (x) => String(x).padStart(2, '0');
        const r = validate({
            pageTitle: name, title: name, year: t.getFullYear(), eyebrow: t.getFullYear() + ' TRIP',
            subtitle: t.getFullYear() + '.' + p2(t.getMonth() + 1) + '.' + p2(t.getDate()) + ' - ' + p2(end.getMonth() + 1) + '.' + p2(end.getDate()),
            days: Array.from({ length: n }, (_, i) => { const d = new Date(t.getFullYear(), t.getMonth(), t.getDate() + i); return { month: d.getMonth() + 1, day: d.getDate(), title: '第 ' + (i + 1) + ' 天', meals: ['待確認', '待確認', '待確認'] }; })
        });
        if (r.meta) r.meta.blank = true; // 空白旅程：管理員會看到「匯入行程」提示卡，匯入後這個標記就消失
        return r;
    }
    const canon = (v) => JSON.stringify(v, (k, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.keys(x).sort().reduce((a, y) => { a[y] = x[y]; return a; }, {}) : x));

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
    g.tripRender = { days: daysHtml, food: foodHtml, header: applyHeader, normalize, validate, blank, canon, example: EXAMPLE, prompt: PROMPT };
})(typeof window !== 'undefined' ? window : globalThis);
