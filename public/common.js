// Shared helpers for every staff page (and esc/money/api/toast for the guest app).
window.TS = (() => {
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let currency = 'Rs';
  const money = n => `${currency} ${Number(n || 0).toLocaleString('en-IN')}`;
  async function api(url, opts = {}) {
    const res = await fetch(url, {
      method: opts.method || (opts.body ? 'POST' : 'GET'),
      headers: { 'content-type': 'application/json', ...(opts.headers || {}) },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { const e = new Error(data.error || 'Something went wrong.'); e.status = res.status; throw e; }
    return data;
  }
  function toast(text) {
    document.querySelectorAll('.toast').forEach(t => t.remove());
    const el = document.createElement('div');
    el.className = 'toast'; el.textContent = text; el.setAttribute('role', 'status');
    document.body.appendChild(el); setTimeout(() => el.remove(), 2600);
  }

  /* ---------- English / Hindi for staff screens ---------- */
  const WORDS = {
    en: {
      floor: 'Floor & alerts', kitchen: 'Kitchen', owner: 'Owner', qr: 'QR codes', settings: 'Menu & settings', logout: 'Log out', lang: 'हिंदी',
      loginTitle: 'Staff login', enterPin: 'Enter your PIN', login: 'Log in',
      justNow: 'just now', min: m => `${m} min`, hmin: (h, m) => `${h} h ${m} min`,
      floorTitle: 'Floor', inUse: (n, t, g) => `${n}/${t} tables in use · ${g} guests`, alerts: 'Alerts', open: n => `${n} open`, noAlerts: 'No alerts. Every table is looked after.',
      state: { free: 'Free', seated: 'Seated · no order', ordered: 'Ordered', eating: 'Eating', dirty: 'Needs cleaning' },
      guests: n => `${n} guest${n > 1 ? 's' : ''}`, seats: n => `${n} seats`, waiterVisited: 'Waiter visited', noWaiter: 'No waiter yet', qrScanned: 'QR scanned',
      billDue: (t, d) => `Bill ${t} · due ${d}`, billPaid: t => `Bill ${t} · paid`,
      seatGuests: 'Seat guests', markWaiter: 'Waiter visited', guestsLeft: 'Guests left', cleaned: 'Cleaned', onMyWay: 'On my way', served: 'Served', checked: 'Checked', ok: 'OK',
      confirm: a => `Confirm ${a}`, done: 'Done', doneBy: n => `Done · ${n}`, paymentConfirmed: 'Payment confirmed.',
      src: { camera: 'camera', 'guest app': 'guest app', kitchen: 'kitchen' },
      reason: { water: 'want water', bill: 'asked for the bill', help: 'need help' },
      alert: {
        waiting: (t, p) => `${p.guests} guest${p.guests > 1 ? 's' : ''} at ${t} for ${p.min} min with no order and no waiter. Go to the table.`,
        call: (t, p, w) => `Guests at ${t} ${w.reason[p.reason] || w.reason.help}.`,
        bill: t => `Guests at ${t} asked for the bill.`,
        ready: (t, p) => `Food for ${t} has been ready for ${p.min} min. Take it to the table.`,
        payment: (t, p, w) => `${t} is paying ${money(p.amount)} by ${w.method[p.method] || p.method}. Confirm the payment.`,
        clean: t => `Guests left ${t}. Clean and reset the table.`,
        unpaid: (t, p) => `Guests left ${t} with ${money(p.amount)} unpaid. Check with the cashier.`,
      },
      method: { cash: 'cash', card: 'card', upi: 'UPI', bank: 'bank transfer' }, methodName: { cash: 'Cash', card: 'Card', upi: 'UPI', bank: 'Bank transfer' },
      colNew: 'New', colCooking: 'Cooking', colReady: 'Ready to serve', startCooking: 'Start cooking', markReady: 'Mark ready', nothing: 'Nothing here.',
      kSales: 'Sales today (confirmed)', kWaiting: a => `${a} waiting for staff to confirm`, kTips: 'Tips for staff', kInUse: 'Tables in use now', kGuests: 'Guests today',
      kToOrder: 'Avg. minutes until first order', kStay: 'Avg. minutes per table', kTurn: 'Tables turned over', kLeft: 'Guests left waiting 5+ min',
      perHour: 'Guests per hour', fromCam: 'From camera + QR', topDishes: 'Top dishes', today: 'Today', noOrders: 'No orders yet.', fillIn: 'Numbers fill in as guests arrive today.',
      tipWaiter: (n, h) => `${n} time${n > 1 ? 's' : ''} today guests sat for over 5 minutes with no waiter. Add a waiter around ${h}.`,
      tipAvg: m => `Guests take ${m} min on average from sitting down to ordering.`, tipWalk: n => `${n} table${n > 1 ? 's' : ''} left with an unpaid bill.`,
      team: 'Team today', tName: 'Name', tAlerts: 'Alerts handled', tResp: 'Avg. minutes to respond', tPay: 'Payments confirmed', tServed: 'Orders served', noTeam: 'Nobody has handled anything yet today.',
      qrHint: "Print this page and stick one code on each table. Each code only opens its own table. Open a code's link to test it.", scanFor: t => `Scan for menu · Table ${t}`, openT: t => `Open ${t}`,
      restaurant: 'Restaurant', rName: 'Restaurant name', currency: 'Currency sign', wifi: 'Guest Wi-Fi', network: 'Network', password: 'Password',
      alertsSet: 'Alerts', waitMin: 'Alert when guests wait with no order or waiter for (min)', readyMin: "Alert when ready food isn't served for (min)",
      payWays: 'Ways to pay', upiId: 'UPI ID', upiName: 'Name shown in UPI app',
      upiHelp: 'With UPI, guests get a link and QR code for the exact amount, and the money goes straight to this UPI ID. Staff confirm it on the floor screen.',
      tables: 'Tables', newTable: 'New table, e.g. T9', addTable: 'Add table', seatsWord: 'seats', tablesHelp: 'New tables need a QR code printed from the QR codes page, and a zone drawn in the camera setup.',
      saveSettings: 'Save settings', settingsSaved: 'Settings saved.', menu: 'Menu', dishes: n => `${n} dishes`,
      mPhoto: 'Photo', mDish: 'Dish', mHindi: 'Hindi name', mDesc: 'Description', mCat: 'Category', mPrice: 'Price', mVeg: 'Veg', mShow: 'Show',
      addPhoto: '+ Photo', removePhoto: 'Remove', photoAdded: 'Photo added. Save the menu to keep it.', photoRemoved: 'Photo removed. Save the menu to keep this change.',
      addDish: 'Add dish', saveMenu: 'Save menu', menuSaved: 'Menu saved.', menuHelp: 'Untick "Show" when a dish runs out. It disappears from guests\' phones right away.',
      typeTable: 'Type a name for the new table.', exists: t => `${t} already exists.`, optional: 'optional',
      staff: 'Staff', role: 'Role', roles: { owner: 'Owner (everything)', waiter: 'Waiter (floor + kitchen)', kitchen: 'Kitchen only' },
      newPin: 'New PIN', pinKeep: 'leave empty to keep', active: 'Active', addPerson: 'Add person', saveTeam: 'Save staff', teamSaved: 'Staff saved.',
      teamHelp: 'Each person logs in with their own 4 to 8 digit PIN, so the dashboard shows who handled what. Untick Active to stop someone logging in.',
    },
    hi: {
      floor: 'फ़्लोर और अलर्ट', kitchen: 'किचन', owner: 'मालिक', qr: 'QR कोड', settings: 'मेन्यू और सेटिंग', logout: 'लॉग आउट', lang: 'English',
      loginTitle: 'स्टाफ़ लॉगिन', enterPin: 'अपना PIN डालें', login: 'लॉग इन',
      justNow: 'अभी', min: m => `${m} मिनट`, hmin: (h, m) => `${h} घंटे ${m} मिनट`,
      floorTitle: 'फ़्लोर', inUse: (n, t, g) => `${t} में से ${n} टेबल भरी · ${g} मेहमान`, alerts: 'अलर्ट', open: n => `${n} बाकी`, noAlerts: 'कोई अलर्ट नहीं। हर टेबल का ध्यान रखा जा रहा है।',
      state: { free: 'खाली', seated: 'बैठे · ऑर्डर नहीं', ordered: 'ऑर्डर हुआ', eating: 'खा रहे हैं', dirty: 'साफ़ करनी है' },
      guests: n => `${n} मेहमान`, seats: n => `${n} सीट`, waiterVisited: 'वेटर जा चुके', noWaiter: 'अभी कोई वेटर नहीं गया', qrScanned: 'QR स्कैन हुआ',
      billDue: (t, d) => `बिल ${t} · बाकी ${d}`, billPaid: t => `बिल ${t} · भुगतान हुआ`,
      seatGuests: 'मेहमान बैठाएं', markWaiter: 'वेटर गए', guestsLeft: 'मेहमान चले गए', cleaned: 'साफ़ हो गई', onMyWay: 'आ रहा हूँ', served: 'परोस दिया', checked: 'देख लिया', ok: 'ठीक है',
      confirm: a => `${a} पुष्टि करें`, done: 'हो गया', doneBy: n => `हो गया · ${n}`, paymentConfirmed: 'भुगतान की पुष्टि हो गई।',
      src: { camera: 'कैमरा', 'guest app': 'मेहमान ऐप', kitchen: 'किचन' },
      reason: { water: 'को पानी चाहिए', bill: 'ने बिल माँगा', help: 'को मदद चाहिए' },
      alert: {
        waiting: (t, p) => `${t} पर ${p.guests} मेहमान ${p.min} मिनट से बैठे हैं, न ऑर्डर हुआ न वेटर गया। टेबल पर जाएं।`,
        call: (t, p, w) => `${t} के मेहमानों ${w.reason[p.reason] || w.reason.help}।`,
        bill: t => `${t} के मेहमानों ने बिल माँगा।`,
        ready: (t, p) => `${t} का खाना ${p.min} मिनट से तैयार है। टेबल पर ले जाएं।`,
        payment: (t, p, w) => `${t} ${w.method[p.method] || p.method} से ${money(p.amount)} दे रहा है। भुगतान की पुष्टि करें।`,
        clean: t => `${t} के मेहमान चले गए। टेबल साफ़ करके तैयार करें।`,
        unpaid: (t, p) => `${t} के मेहमान ${money(p.amount)} बिना चुकाए चले गए। कैशियर से पूछें।`,
      },
      method: { cash: 'नकद', card: 'कार्ड', upi: 'UPI', bank: 'बैंक ट्रांसफ़र' }, methodName: { cash: 'नकद', card: 'कार्ड', upi: 'UPI', bank: 'बैंक ट्रांसफ़र' },
      colNew: 'नया', colCooking: 'बन रहा है', colReady: 'परोसने को तैयार', startCooking: 'बनाना शुरू करें', markReady: 'तैयार है', nothing: 'यहाँ कुछ नहीं।',
      kSales: 'आज की बिक्री (पुष्टि हुई)', kWaiting: a => `${a} पुष्टि बाकी`, kTips: 'स्टाफ़ की टिप', kInUse: 'अभी भरी टेबल', kGuests: 'आज के मेहमान',
      kToOrder: 'ऑर्डर तक औसत मिनट', kStay: 'प्रति टेबल औसत मिनट', kTurn: 'टेबल कितनी बार भरीं', kLeft: '5+ मिनट इंतज़ार करते मेहमान',
      perHour: 'हर घंटे मेहमान', fromCam: 'कैमरा + QR से', topDishes: 'सबसे ज़्यादा बिकी डिश', today: 'आज', noOrders: 'अभी कोई ऑर्डर नहीं।', fillIn: 'मेहमान आने पर आँकड़े भरेंगे।',
      tipWaiter: (n, h) => `आज ${n} बार मेहमान 5 मिनट से ज़्यादा बिना वेटर के बैठे रहे। ${h} के आसपास एक वेटर और रखें।`,
      tipAvg: m => `मेहमान बैठने से ऑर्डर तक औसतन ${m} मिनट लेते हैं।`, tipWalk: n => `${n} टेबल बिना पूरा भुगतान किए चली गईं।`,
      team: 'आज की टीम', tName: 'नाम', tAlerts: 'अलर्ट संभाले', tResp: 'जवाब में औसत मिनट', tPay: 'भुगतान पुष्टि', tServed: 'ऑर्डर परोसे', noTeam: 'आज अभी किसी ने कुछ नहीं संभाला।',
      qrHint: 'यह पेज प्रिंट करें और हर टेबल पर एक कोड लगाएं। हर कोड सिर्फ़ अपनी टेबल खोलता है। जाँचने के लिए लिंक खोलें।', scanFor: t => `मेन्यू के लिए स्कैन करें · टेबल ${t}`, openT: t => `${t} खोलें`,
      restaurant: 'रेस्टोरेंट', rName: 'रेस्टोरेंट का नाम', currency: 'मुद्रा चिह्न', wifi: 'मेहमान Wi-Fi', network: 'नेटवर्क', password: 'पासवर्ड',
      alertsSet: 'अलर्ट', waitMin: 'मेहमान बिना ऑर्डर या वेटर के कितने मिनट बैठें तो अलर्ट', readyMin: 'तैयार खाना कितने मिनट न परोसा जाए तो अलर्ट',
      payWays: 'भुगतान के तरीके', upiId: 'UPI ID', upiName: 'UPI ऐप में दिखने वाला नाम',
      upiHelp: 'UPI से मेहमानों को सही रकम का लिंक और QR कोड मिलता है, और पैसा सीधे इस UPI ID में आता है। स्टाफ़ फ़्लोर स्क्रीन पर पुष्टि करता है।',
      tables: 'टेबल', newTable: 'नई टेबल, जैसे T9', addTable: 'टेबल जोड़ें', seatsWord: 'सीट', tablesHelp: 'नई टेबल के लिए QR कोड पेज से कोड प्रिंट करें, और कैमरा सेटअप में उसका हिस्सा बनाएं।',
      saveSettings: 'सेटिंग सेव करें', settingsSaved: 'सेटिंग सेव हो गई।', menu: 'मेन्यू', dishes: n => `${n} डिश`,
      mPhoto: 'फ़ोटो', mDish: 'डिश', mHindi: 'हिंदी नाम', mDesc: 'विवरण', mCat: 'श्रेणी', mPrice: 'दाम', mVeg: 'शाकाहारी', mShow: 'दिखाएं',
      addPhoto: '+ फ़ोटो', removePhoto: 'हटाएं', photoAdded: 'फ़ोटो जुड़ गई। रखने के लिए मेन्यू सेव करें।', photoRemoved: 'फ़ोटो हटी। बदलाव रखने के लिए मेन्यू सेव करें।',
      addDish: 'डिश जोड़ें', saveMenu: 'मेन्यू सेव करें', menuSaved: 'मेन्यू सेव हो गया।', menuHelp: 'डिश खत्म होने पर "दिखाएं" हटा दें। वह मेहमानों के फ़ोन से तुरंत हट जाएगी।',
      typeTable: 'नई टेबल का नाम लिखें।', exists: t => `${t} पहले से है।`, optional: 'वैकल्पिक',
      staff: 'स्टाफ़', role: 'काम', roles: { owner: 'मालिक (सब कुछ)', waiter: 'वेटर (फ़्लोर + किचन)', kitchen: 'सिर्फ़ किचन' },
      newPin: 'नया PIN', pinKeep: 'पुराना रखने के लिए खाली छोड़ें', active: 'चालू', addPerson: 'व्यक्ति जोड़ें', saveTeam: 'स्टाफ़ सेव करें', teamSaved: 'स्टाफ़ सेव हो गया।',
      teamHelp: 'हर व्यक्ति अपने 4 से 8 अंकों के PIN से लॉग इन करता है, ताकि डैशबोर्ड पर दिखे किसने क्या संभाला। किसी को रोकने के लिए "चालू" हटा दें।',
    },
  };
  let lang = 'en';
  try { lang = localStorage.getItem('ts_staff_lang') || 'en'; } catch {}
  document.documentElement.lang = lang;
  const w = () => WORDS[lang] || WORDS.en;
  const alertText = a => {
    const f = a.params && Object.keys(a.params).length && w().alert[a.kind];
    try { return f ? f(a.tableId, a.params, w()) : a.text; } catch { return a.text; }
  };
  function setLang(l) { lang = l; try { localStorage.setItem('ts_staff_lang', l); } catch {} location.reload(); }

  const ago = ts => { const m = Math.floor((Date.now() - ts) / 60000); return m < 1 ? w().justNow : m < 60 ? w().min(m) : w().hmin(Math.floor(m / 60), m % 60); };
  const time = ts => new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

  let me = null;
  // Staff pages: show a PIN form until logged in, then call start().
  async function staffGate(start, area) {
    me = await api('/api/me');
    if (me.staff && (!area || me.areas.includes(area))) return start(me);
    if (me.staff) {
      // Logged in, but this screen isn't for this role: send them to the first screen they can use.
      const home = { floor: '/staff', kitchen: '/kitchen', owner: '/owner', settings: '/settings' }[me.areas[0]];
      location.replace(home); return;
    }
    document.body.innerHTML = `<form class="login" id="login"><h1>${w().loginTitle}</h1><label for="pin" class="muted">${w().enterPin}</label>
      <input id="pin" inputmode="numeric" autocomplete="current-password" type="password" required><button class="primary">${w().login}</button><div class="err" id="err"></div>
      <button type="button" class="mini" id="langBtn">${w().lang}</button></form>`;
    document.getElementById('langBtn').onclick = () => setLang(lang === 'hi' ? 'en' : 'hi');
    document.getElementById('login').onsubmit = async e => {
      e.preventDefault();
      try { await api('/api/login', { body: { pin: document.getElementById('pin').value } }); location.reload(); }
      catch (err) { document.getElementById('err').textContent = err.message; }
    };
  }
  function nav(current) {
    const links = [['/staff', 'floor', 'floor'], ['/kitchen', 'kitchen', 'kitchen'], ['/owner', 'owner', 'owner'], ['/qr', 'qr', 'settings'], ['/settings', 'settings', 'settings']]
      .filter(([, , area]) => !me || me.areas.includes(area));
    return `<nav class="top"><h1>TableSense</h1><div class="chips" style="align-items:center">${links.map(([h, k]) => `<a href="${h}" class="${h === current ? 'on' : ''}">${w()[k]}</a>`).join('')}
      <button class="mini" data-ts="lang">${w().lang}</button>${me ? `<span class="muted" style="font-size:.85rem">${esc(me.name)}</span><button class="mini" data-ts="logout">${w().logout}</button>` : ''}</div></nav>`;
  }
  document.addEventListener('click', async e => {
    const b = e.target.closest('[data-ts]'); if (!b) return;
    if (b.dataset.ts === 'lang') setLang(lang === 'hi' ? 'en' : 'hi');
    if (b.dataset.ts === 'logout') { await api('/api/logout', { body: {} }).catch(() => {}); location.reload(); }
  });
  function live(onUpdate, auth) {
    const socket = io({ auth });
    let t; socket.on('update', () => { clearTimeout(t); t = setTimeout(onUpdate, 80); });
    socket.on('connect', onUpdate);
    setInterval(onUpdate, 30000); // timers on screen + safety net
    return socket;
  }
  return { esc, money, api, toast, ago, time, staffGate, nav, live, alertText, t: () => w(), lang: () => lang, setCurrency: c => (currency = c || currency) };
})();
