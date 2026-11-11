// Core rules that join the camera (who is seated) with the QR app (what they want).
// Every action mutates the store and calls onChange so the server can push live updates.
const EventEmitter = require('events');

const MIN = 60 * 1000;
const METHOD_LABEL = { cash: 'Cash', card: 'Card', upi: 'UPI', bank: 'Bank transfer', wallet: 'Wallet' };

class Restaurant extends EventEmitter {
  constructor(store, now = () => Date.now()) {
    super();
    this.store = store;
    this.now = now;
  }
  get d() { return this.store.data; }
  changed() { this.store.save(); this.emit('change'); }

  table(id) {
    const t = this.d.tables.find(x => x.id === id);
    if (!t) throw httpError(404, `No table called ${id}`);
    return t;
  }
  visit(id) { return id ? this.d.visits.find(v => v.id === id) : null; }
  currentVisit(tableId) { return this.visit(this.table(tableId).visitId); }

  setState(t, state) { if (t.state !== state) { t.state = state; t.since = this.now(); } }

  /* ---------- alerts ---------- */
  raise(tableId, kind, text, source) {
    const open = this.d.alerts.find(a => !a.doneAt && a.tableId === tableId && a.kind === kind);
    if (open) return open;
    const a = { id: this.store.id('A'), tableId, kind, text, source, at: this.now(), doneAt: null, doneBy: null };
    this.d.alerts.push(a);
    this.emit('alert', a);
    return a;
  }
  resolve(tableId, kinds, by = 'system') {
    for (const a of this.d.alerts) {
      if (!a.doneAt && a.tableId === tableId && (!kinds || kinds.includes(a.kind))) { a.doneAt = this.now(); a.doneBy = by; }
    }
  }
  ackAlert(alertId, by = 'staff') {
    const a = this.d.alerts.find(x => x.id === alertId);
    if (!a) throw httpError(404, 'Alert not found');
    if (a.doneAt) return a;
    a.doneAt = this.now(); a.doneBy = by;
    const t = this.table(a.tableId);
    const v = this.visit(t.visitId);
    if ((a.kind === 'waiting' || a.kind === 'call') && v) { v.waiterAt = v.waiterAt || this.now(); t.waiterSeenAt = this.now(); }
    if (a.kind === 'clean') this.markClean(t.id, by, false);
    this.changed();
    return a;
  }

  /* ---------- camera ---------- */
  // reports: [{ tableId, people, staffNearby }]
  cameraReport(reports) {
    for (const r of reports) {
      const t = this.d.tables.find(x => x.id === r.tableId);
      if (!t) continue;
      const people = Math.max(0, r.people | 0);
      t.people = people;
      if (r.staffNearby) this.waiterVisited(t);
      if (people > 0 && (t.state === 'free' || t.state === 'dirty')) this.seat(t, people, 'camera');
      else if (people > 0 && t.visitId) { const v = this.visit(t.visitId); v.guests = Math.max(v.guests, people); }
      else if (people === 0 && t.visitId && !['free', 'dirty'].includes(t.state)) this.guestsLeft(t);
    }
    this.changed();
  }
  waiterVisited(t) {
    t.waiterSeenAt = this.now();
    const v = this.visit(t.visitId);
    if (v && !v.waiterAt) v.waiterAt = this.now();
    this.resolve(t.id, ['waiting', 'call'], 'camera');
  }
  seat(t, people, source) {
    if (t.visitId) return this.visit(t.visitId);
    const v = { id: this.store.id('V'), tableId: t.id, guests: people, seatedAt: this.now(), source, scannedAt: null, firstOrderAt: null, waiterAt: null, paidAt: null, leftAt: null, payments: [] };
    this.d.visits.push(v);
    t.visitId = v.id;
    this.resolve(t.id, ['clean'], source);
    this.setState(t, 'seated');
    return v;
  }
  guestsLeft(t) {
    const v = this.visit(t.visitId);
    if (v) v.leftAt = this.now();
    t.visitId = null; t.people = 0;
    this.resolve(t.id, ['waiting', 'call', 'ready', 'bill']);
    const unpaid = v && this.billFor(v).due > 0;
    this.setState(t, 'dirty');
    if (unpaid) this.raise(t.id, 'unpaid', `Guests left ${t.id} with ${this.money(this.billFor(v).due)} unpaid. Check with the cashier.`, 'camera');
    this.raise(t.id, 'clean', `Guests left ${t.id}. Clean and reset the table.`, 'camera');
  }
  markClean(tableId, by = 'staff', save = true) {
    const t = this.table(tableId);
    if (t.state !== 'dirty') return t;
    this.resolve(t.id, ['clean'], by);
    this.setState(t, 'free');
    if (save) this.changed();
    return t;
  }

  /* ---------- guest app ---------- */
  guestOpen(tableId) {
    const t = this.table(tableId);
    // QR scan can happen before the camera notices (or with no camera at all).
    let v = this.visit(t.visitId);
    if (!v) v = this.seat(t, Math.max(1, t.people), 'qr');
    if (!v.scannedAt) v.scannedAt = this.now();
    this.changed();
    return v;
  }
  placeOrder(tableId, items) {
    const t = this.table(tableId);
    if (!Array.isArray(items) || !items.length) throw httpError(400, 'The order is empty.');
    const lines = items.map(i => {
      const m = this.d.menu.find(x => x.id === i.id && !x.hidden);
      const qty = Math.min(50, Math.max(0, i.qty | 0));
      if (!m) throw httpError(400, `"${i.id}" is not on the menu.`);
      return { id: m.id, name: m.name, price: m.price, qty, note: String(i.note || '').slice(0, 140) };
    }).filter(l => l.qty > 0);
    if (!lines.length) throw httpError(400, 'The order is empty.');
    let v = this.visit(t.visitId) || this.guestOpen(tableId);
    const o = { id: this.store.id('O'), tableId, visitId: v.id, lines, total: lines.reduce((a, l) => a + l.price * l.qty, 0), status: 'new', at: this.now(), readyAt: null, servedAt: null };
    this.d.orders.push(o);
    if (!v.firstOrderAt) v.firstOrderAt = this.now();
    this.resolve(t.id, ['waiting']);
    if (t.state === 'seated' || t.state === 'eating') this.setState(t, 'ordered');
    this.changed();
    return o;
  }
  callWaiter(tableId, reason = 'help') {
    const t = this.table(tableId);
    const words = { water: 'wants water', bill: 'asked for the bill', help: 'needs help' }[reason] || 'needs help';
    const a = this.raise(t.id, reason === 'bill' ? 'bill' : 'call', `Guests at ${t.id} ${words}.`, 'guest app');
    this.changed();
    return a;
  }
  billFor(v) {
    const orders = this.d.orders.filter(o => o.visitId === v.id && o.status !== 'cancelled');
    const total = orders.reduce((a, o) => a + o.total, 0);
    const paid = v.payments.reduce((a, p) => a + p.amount, 0);
    const tips = v.payments.reduce((a, p) => a + (p.tip || 0), 0);
    const lines = {};
    for (const o of orders) for (const l of o.lines) {
      lines[l.id] = lines[l.id] || { id: l.id, name: l.name, price: l.price, qty: 0 };
      lines[l.id].qty += l.qty;
    }
    const unconfirmed = v.payments.filter(p => !p.confirmed).reduce((a, p) => a + p.amount + (p.tip || 0), 0);
    return { total, paid, tips, unconfirmed, due: Math.max(0, total - paid), lines: Object.values(lines) };
  }
  pay(tableId, { amount, tip = 0, method }) {
    const t = this.table(tableId);
    const v = this.visit(t.visitId);
    if (!v) throw httpError(400, 'There is no open bill for this table.');
    const bill = this.billFor(v);
    amount = Math.round(Number(amount)); tip = Math.max(0, Math.round(Number(tip) || 0));
    if (!(amount > 0)) throw httpError(400, 'Enter an amount to pay.');
    if (amount > bill.due) throw httpError(400, `Only ${this.money(bill.due)} is left to pay.`);
    if (!this.paymentMethods().includes(method)) throw httpError(400, 'Choose how you are paying.');
    // Cash and card are collected by a waiter. UPI and bank transfer go straight to the restaurant's account;
    // staff confirm when the money shows up. A gateway with automatic confirmation can replace this later.
    const p = { id: this.store.id('P'), amount, tip, method, at: this.now(), confirmed: false };
    if (method === 'upi') p.upiLink = this.upiLink(amount + tip, `${t.id} ${p.id}`);
    v.payments.push(p);
    const left = bill.due - amount;
    if (left === 0) v.paidAt = this.now();
    this.raise(t.id, 'payment', `${t.id} is paying ${this.money(amount + tip)} by ${METHOD_LABEL[method] || method}. Confirm the payment.`, 'guest app');
    this.changed();
    return { payment: p, due: left };
  }
  confirmPayment(tableId, paymentId) {
    const v = this.currentVisit(tableId) || this.d.visits.find(x => x.payments.some(p => p.id === paymentId));
    const p = v && v.payments.find(x => x.id === paymentId);
    if (!p) throw httpError(404, 'Payment not found');
    p.confirmed = true;
    if (v.payments.every(x => x.confirmed)) this.resolve(v.tableId, ['payment'], 'staff');
    this.changed();
    return p;
  }

  paymentMethods() {
    const pay = this.d.settings.payments || { methods: ['cash', 'card'] };
    return pay.methods.filter(m => m !== 'upi' || (pay.upi && pay.upi.vpa));
  }
  upiLink(amount, note) {
    const { vpa, payee } = this.d.settings.payments.upi;
    const q = new URLSearchParams({ pa: vpa, pn: payee || this.d.settings.name, am: Number(amount).toFixed(2), cu: 'INR', tn: `${this.d.settings.name} ${note}`.slice(0, 50) });
    return 'upi://pay?' + q.toString().replace(/\+/g, '%20');
  }

  /* ---------- owner settings ---------- */
  updateSettings(patch = {}) {
    const s = this.d.settings;
    const text = (v, max = 60) => String(v ?? '').trim().slice(0, max);
    const mins = (v, name) => { const n = Number(v); if (!(n >= 1 && n <= 60)) throw httpError(400, `${name} must be between 1 and 60 minutes.`); return n; };
    if ('name' in patch) { if (!text(patch.name)) throw httpError(400, 'Enter the restaurant name.'); s.name = text(patch.name); }
    if ('currency' in patch) s.currency = text(patch.currency, 5) || 'Rs';
    if (patch.wifi) s.wifi = { network: text(patch.wifi.network), password: text(patch.wifi.password) };
    if ('noOrderAlertMin' in patch) s.noOrderAlertMin = mins(patch.noOrderAlertMin, 'The no-order alert');
    if ('readyNotServedAlertMin' in patch) s.readyNotServedAlertMin = mins(patch.readyNotServedAlertMin, 'The food-ready alert');
    if (patch.payments) {
      const methods = (patch.payments.methods || []).filter(m => Object.keys(METHOD_LABEL).includes(m));
      if (!methods.length) throw httpError(400, 'Turn on at least one way to pay.');
      const vpa = text(patch.payments.upi && patch.payments.upi.vpa, 80);
      if (methods.includes('upi') && !/^[\w.\-]{2,}@[a-zA-Z][\w.\-]*$/.test(vpa)) throw httpError(400, 'Enter a valid UPI ID, like restaurant@okhdfcbank.');
      s.payments = { methods, upi: { vpa, payee: text(patch.payments.upi && patch.payments.upi.payee) } };
    }
    if (Array.isArray(patch.tables)) this.setTables(patch.tables);
    this.changed();
    return s;
  }
  setTables(list) {
    const ids = new Set();
    const next = list.map(x => {
      const id = text(x.id).toUpperCase();
      if (!/^[A-Z0-9-]{1,8}$/.test(id)) throw httpError(400, `"${x.id}" is not a valid table name. Use letters and numbers, like T9.`);
      if (ids.has(id)) throw httpError(400, `Table ${id} is listed twice.`);
      ids.add(id);
      const old = this.d.tables.find(t => t.id === id);
      const seats = Math.min(30, Math.max(1, Number(x.seats) || 4));
      return old ? { ...old, seats } : { id, seats, state: 'free', people: 0, visitId: null, since: this.now(), waiterSeenAt: null, key: require('crypto').randomBytes(6).toString('hex') };
    });
    if (!next.length) throw httpError(400, 'Keep at least one table.');
    for (const t of this.d.tables) if (!ids.has(t.id) && t.visitId) throw httpError(400, `${t.id} has guests right now, so it can't be removed.`);
    this.d.tables = next;
    function text(v) { return String(v ?? '').trim(); }
  }
  setMenu(menu) {
    if (!Array.isArray(menu)) throw httpError(400, 'Send the full menu list.');
    const ids = new Set();
    this.d.menu = menu.map(m => {
      const name = String(m.name || '').trim().slice(0, 60);
      if (!name) throw httpError(400, 'Every dish needs a name.');
      let id = String(m.id || '').trim() || name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'dish';
      while (ids.has(id)) id += '-2';
      ids.add(id);
      const price = Math.round(Number(m.price));
      if (!(price >= 0)) throw httpError(400, `Enter a price for ${name}.`);
      const photo = /^\/photos\/[a-f0-9]{16}\.(jpg|png|webp)$/.test(m.photo || '') ? m.photo : '';
      const nameHi = String(m.nameHi || '').trim().slice(0, 60);
      return { id, cat: String(m.cat || 'Other').trim().slice(0, 30) || 'Other', name, nameHi, desc: String(m.desc || '').trim().slice(0, 140), price, hidden: !!m.hidden, veg: !!m.veg, photo };
    });
    this.changed();
    return this.d.menu;
  }

  /* ---------- kitchen ---------- */
  advanceOrder(orderId, status) {
    const o = this.d.orders.find(x => x.id === orderId);
    if (!o) throw httpError(404, 'Order not found');
    const flow = ['new', 'cooking', 'ready', 'served'];
    const next = status || flow[flow.indexOf(o.status) + 1];
    if (!flow.includes(next) && next !== 'cancelled') throw httpError(400, 'Unknown status');
    o.status = next;
    if (next === 'ready') { o.readyAt = this.now(); }
    if (next === 'served' || next === 'cancelled') {
      o.servedAt = this.now();
      const t = this.table(o.tableId);
      const pending = this.d.orders.some(x => x.visitId === o.visitId && ['new', 'cooking', 'ready'].includes(x.status));
      if (!pending) { this.resolve(t.id, ['ready']); if (t.state === 'ordered') this.setState(t, 'eating'); }
    }
    this.changed();
    return o;
  }

  /* ---------- timed checks (run every few seconds) ---------- */
  sweep() {
    const now = this.now(), s = this.d.settings;
    let dirty = false;
    for (const t of this.d.tables) {
      const v = this.visit(t.visitId);
      if (!v) continue;
      const waited = (now - v.seatedAt) / MIN;
      if (!v.firstOrderAt && !v.waiterAt && waited >= s.noOrderAlertMin) {
        const before = this.d.alerts.length;
        this.raise(t.id, 'waiting', `${v.guests} guest${v.guests > 1 ? 's' : ''} at ${t.id} for ${Math.floor(waited)} min with no order and no waiter. Go to the table.`, 'camera');
        dirty = dirty || this.d.alerts.length !== before;
      }
    }
    for (const o of this.d.orders) {
      if (o.status === 'ready' && (now - o.readyAt) / MIN >= s.readyNotServedAlertMin) {
        const before = this.d.alerts.length;
        this.raise(o.tableId, 'ready', `Food for ${o.tableId} has been ready for ${Math.floor((now - o.readyAt) / MIN)} min. Take it to the table.`, 'kitchen');
        dirty = dirty || this.d.alerts.length !== before;
      }
    }
    if (dirty) this.changed();
  }

  /* ---------- owner numbers ---------- */
  stats(dayStart = startOfDay(this.now())) {
    const visits = this.d.visits.filter(v => v.seatedAt >= dayStart);
    const all = visits.flatMap(v => v.payments), payments = all.filter(p => p.confirmed);
    const sales = payments.reduce((a, p) => a + p.amount, 0);
    const tips = payments.reduce((a, p) => a + (p.tip || 0), 0);
    const waits = visits.filter(v => v.firstOrderAt).map(v => (v.firstOrderAt - v.seatedAt) / MIN);
    const stays = visits.filter(v => v.leftAt).map(v => (v.leftAt - v.seatedAt) / MIN);
    const byHour = Array(24).fill(0);
    for (const v of visits) byHour[new Date(v.seatedAt).getHours()] += v.guests;
    const items = {};
    for (const o of this.d.orders.filter(o => o.at >= dayStart && o.status !== 'cancelled')) for (const l of o.lines) {
      items[l.name] = (items[l.name] || 0) + l.qty;
    }
    const waitAlerts = this.d.alerts.filter(a => a.at >= dayStart && a.kind === 'waiting').length;
    return {
      sales, tips, awaitingConfirm: all.filter(p => !p.confirmed).reduce((a, p) => a + p.amount + (p.tip || 0), 0), guests: visits.reduce((a, v) => a + v.guests, 0), visits: visits.length,
      tablesInUse: this.d.tables.filter(t => !['free', 'dirty'].includes(t.state)).length, tables: this.d.tables.length,
      avgMinToOrder: avg(waits), avgStayMin: avg(stays), turnovers: visits.filter(v => v.leftAt).length,
      noOrderAlerts: waitAlerts, byHour,
      topItems: Object.entries(items).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, qty]) => ({ name, qty })),
      walkouts: this.d.alerts.filter(a => a.at >= dayStart && a.kind === 'unpaid').length,
    };
  }

  money(n) { return `${this.d.settings.currency} ${Number(n).toLocaleString('en-IN')}`; }

  // What the guest at a table may see (no other tables' data).
  guestView(tableId) {
    const t = this.table(tableId);
    const v = this.visit(t.visitId);
    const orders = v ? this.d.orders.filter(o => o.visitId === v.id) : [];
    return {
      table: { id: t.id, state: t.state }, restaurant: this.d.settings.name, currency: this.d.settings.currency, wifi: this.d.settings.wifi,
      menu: this.d.menu.filter(m => !m.hidden), orders, bill: v ? this.billFor(v) : null,
      payMethods: this.paymentMethods().map(m => ({ id: m, label: METHOD_LABEL[m] })),
      waiterCalled: this.d.alerts.some(a => !a.doneAt && a.tableId === t.id && (a.kind === 'call' || a.kind === 'bill')),
    };
  }
  staffView() {
    const recent = this.now() - 12 * 60 * MIN;
    return {
      settings: this.d.settings,
      tables: this.d.tables.map(t => ({ ...t, visit: this.visit(t.visitId), bill: t.visitId ? this.billFor(this.visit(t.visitId)) : null })),
      alerts: this.d.alerts.filter(a => !a.doneAt || a.doneAt > this.now() - 10 * MIN).slice(-60).reverse(),
      orders: this.d.orders.filter(o => o.at > recent && !['served', 'cancelled'].includes(o.status)),
      menu: this.d.menu, now: this.now(),
    };
  }
}

function avg(a) { return a.length ? Math.round((a.reduce((x, y) => x + y, 0) / a.length) * 10) / 10 : null; }
function startOfDay(ts) { const d = new Date(ts); d.setHours(0, 0, 0, 0); return d.getTime(); }
function httpError(status, message) { const e = new Error(message); e.status = status; return e; }

module.exports = { Restaurant, httpError, MIN, METHOD_LABEL };
