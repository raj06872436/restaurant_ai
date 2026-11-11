const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const http = require('http');
const express = require('express');
const cookieParser = require('cookie-parser');
const QRCode = require('qrcode');
const { Server } = require('socket.io');
const { Store } = require('./store');
const { Restaurant, httpError } = require('./restaurant');
const { Team } = require('./team');

function createApp({
  dataFile = path.join(__dirname, '..', 'data', 'db.json'),
  staffPin = process.env.STAFF_PIN || '1234',
  cameraKey = process.env.CAMERA_KEY || 'change-me-camera-key',
  publicUrl = process.env.PUBLIC_URL || '',
  now,
} = {}) {
  const store = new Store(dataFile);
  const photoDir = path.join(dataFile ? path.dirname(dataFile) : require('os').tmpdir(), 'photos');
  const r = new Restaurant(store, now);
  const app = express();
  const server = http.createServer(app);
  const io = new Server(server);
  const team = new Team(r, staffPin);
  const sessions = new Map(); // session id -> staff id

  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());

  const memberOf = sid => team.byId(sessions.get(sid));
  const need = area => (req, res, next) => {
    const m = memberOf(req.cookies.ts_staff);
    if (!m) return res.status(401).json({ error: 'Log in with your staff PIN.' });
    if (!team.can(m, area)) return res.status(403).json({ error: "Your account can't use this screen. Ask the owner." });
    req.member = m; next();
  };
  const by = req => req.member.name;
  const guestTable = req => {
    const t = r.table(req.params.table);
    if (req.get('x-table-key') !== t.key && req.query.k !== t.key) throw httpError(403, 'This link is not valid. Scan the QR code on your table again.');
    return t;
  };
  const wrap = fn => (req, res) => {
    try { res.json(fn(req, res) ?? { ok: true }); }
    catch (e) { res.status(e.status || 500).json({ error: e.status ? e.message : 'Something went wrong.' }); if (!e.status) console.error(e); }
  };

  /* ---------- staff login ---------- */
  const tries = new Map(); // ip -> { n, until }, slows down PIN guessing
  app.post('/api/login', (req, res) => {
    const t = tries.get(req.ip) || { n: 0, until: 0 };
    if (Date.now() < t.until) return res.status(429).json({ error: 'Too many wrong PINs. Wait a minute and try again.' });
    const m = team.login(req.body.pin);
    if (!m) {
      t.n++; if (t.n >= 5) { t.until = Date.now() + 60e3; t.n = 0; }
      tries.set(req.ip, t);
      return res.status(401).json({ error: 'Wrong PIN. Try again.' });
    }
    tries.delete(req.ip);
    const sid = crypto.randomBytes(18).toString('hex');
    sessions.set(sid, m.id);
    res.cookie('ts_staff', sid, { httpOnly: true, sameSite: 'lax', maxAge: 14 * 24 * 3600e3 });
    res.json({ ok: true, name: m.name, role: m.role });
  });
  app.post('/api/logout', (req, res) => { sessions.delete(req.cookies.ts_staff); res.clearCookie('ts_staff'); res.json({ ok: true }); });
  app.get('/api/me', (req, res) => {
    const m = memberOf(req.cookies.ts_staff);
    res.json(m ? { staff: true, name: m.name, role: m.role, areas: ['floor', 'kitchen', 'owner', 'settings'].filter(a => team.can(m, a)) } : { staff: false });
  });

  /* ---------- guest (QR) ---------- */
  app.get('/api/guest/:table', wrap(req => r.guestView(guestTable(req).id)));
  app.post('/api/guest/:table/open', wrap(req => { r.guestOpen(guestTable(req).id); return r.guestView(req.params.table); }));
  app.post('/api/guest/:table/order', wrap(req => r.placeOrder(guestTable(req).id, req.body.items)));
  app.post('/api/guest/:table/call', wrap(req => r.callWaiter(guestTable(req).id, req.body.reason)));
  app.post('/api/guest/:table/pay', wrap(req => r.pay(guestTable(req).id, req.body)));

  app.get('/api/guest/:table/upi/:pid.svg', async (req, res) => {
    try {
      const t = guestTable(req);
      const v = r.visit(t.visitId);
      const p = v && v.payments.find(x => x.id === req.params.pid && x.upiLink);
      if (!p) throw httpError(404, 'Payment not found');
      res.type('image/svg+xml').send(await QRCode.toString(p.upiLink, { type: 'svg', margin: 1 }));
    } catch (e) { res.status(e.status || 500).send(e.message); }
  });

  /* ---------- camera ---------- */
  app.post('/api/camera', wrap(req => {
    if (req.get('x-camera-key') !== cameraKey) throw httpError(401, 'Wrong camera key.');
    const reports = Array.isArray(req.body.tables) ? req.body.tables : [];
    r.cameraReport(reports);
    return { ok: true, received: reports.length };
  }));

  /* ---------- staff ---------- */
  app.get('/api/staff', need('kitchen'), wrap(() => r.staffView()));
  app.post('/api/alerts/:id/ack', need('floor'), wrap(req => r.ackAlert(req.params.id, by(req))));
  app.post('/api/tables/:table/clean', need('floor'), wrap(req => r.markClean(req.params.table, by(req))));
  app.post('/api/tables/:table/seat', need('floor'), wrap(req => { const v = r.seat(r.table(req.params.table), Number(req.body.guests) || 2, 'staff'); r.changed(); return v; }));
  app.post('/api/tables/:table/leave', need('floor'), wrap(req => { r.guestsLeft(r.table(req.params.table)); r.changed(); }));
  app.post('/api/tables/:table/waiter', need('floor'), wrap(req => { r.waiterVisited(r.table(req.params.table), by(req)); r.changed(); }));
  app.post('/api/tables/:table/order', need('floor'), wrap(req => r.placeOrder(req.params.table, req.body.items)));
  app.post('/api/tables/:table/payments/:pid/confirm', need('floor'), wrap(req => r.confirmPayment(req.params.table, req.params.pid, by(req))));
  app.post('/api/orders/:id/advance', need('kitchen'), wrap(req => r.advanceOrder(req.params.id, req.body.status, by(req))));
  app.get('/api/stats', need('owner'), wrap(() => r.stats()));
  app.put('/api/menu', need('settings'), wrap(req => r.setMenu(req.body.menu)));
  const PHOTO_TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
  app.post('/api/menu/photo', need('settings'), express.raw({ type: Object.keys(PHOTO_TYPES), limit: '3mb' }), wrap(req => {
    const ext = PHOTO_TYPES[req.get('content-type')];
    if (!ext || !Buffer.isBuffer(req.body) || !req.body.length) throw httpError(400, 'Choose a JPG, PNG or WebP photo under 3 MB.');
    const name = crypto.randomBytes(8).toString('hex') + '.' + ext;
    fs.mkdirSync(photoDir, { recursive: true });
    fs.writeFileSync(path.join(photoDir, name), req.body);
    return { url: '/photos/' + name };
  }));
  app.put('/api/settings', need('settings'), wrap(req => r.updateSettings(req.body)));
  app.get('/api/team', need('settings'), wrap(() => team.publicList()));
  app.put('/api/team', need('settings'), wrap(req => {
    const list = team.save(req.body.staff);
    for (const [sid, id] of sessions) if (!team.byId(id)) sessions.delete(sid); // removed or paused people are logged out
    return list;
  }));
  app.get('/api/qr/:table.svg', need('settings'), async (req, res) => {
    try {
      const t = r.table(req.params.table);
      const base = publicUrl || `${req.protocol}://${req.get('host')}`;
      res.type('image/svg+xml').send(await QRCode.toString(`${base}/t/${t.id}?k=${t.key}`, { type: 'svg', margin: 1 }));
    } catch (e) { res.status(e.status || 500).send(e.message); }
  });

  app.use('/api', (err, req, res, next) => res.status(err.status || 500).json({ error: err.type === 'entity.too.large' ? 'That file is too big. Use a photo under 3 MB.' : 'Something went wrong.' }));

  /* ---------- pages ---------- */
  const page = f => (req, res) => res.sendFile(path.join(__dirname, '..', 'public', f));
  app.get('/t/:table', page('guest.html'));
  app.get('/staff', page('staff.html'));
  app.get('/kitchen', page('kitchen.html'));
  app.get('/owner', page('owner.html'));
  app.get('/qr', page('qr.html'));
  app.get('/settings', page('settings.html'));
  app.get('/', (req, res) => res.redirect('/staff'));
  app.use('/photos', express.static(photoDir, { maxAge: '7d' }));
  app.use(express.static(path.join(__dirname, '..', 'public')));

  /* ---------- live updates ---------- */
  io.on('connection', socket => {
    const cookies = Object.fromEntries((socket.handshake.headers.cookie || '').split(';').map(c => c.trim().split('=').map(decodeURIComponent)));
    if (memberOf(cookies.ts_staff)) socket.join('staff');
    const { table, k } = socket.handshake.auth || {};
    const t = table && r.d.tables.find(x => x.id === table);
    if (t && t.key === k) socket.join('table:' + t.id);
  });
  r.on('change', () => {
    io.to('staff').emit('update');
    for (const t of r.d.tables) io.to('table:' + t.id).emit('update');
  });
  r.on('alert', a => io.to('staff').emit('alert', a));

  const sweeper = setInterval(() => r.sweep(), 5000);
  server.on('close', () => { clearInterval(sweeper); store.flush(); });

  return { app, server, io, restaurant: r, store, team };
}

if (require.main === module) {
  const port = Number(process.env.PORT) || 3000;
  const { server } = createApp();
  server.listen(port, () => {
    console.log(`TableSense running on http://localhost:${port}`);
    console.log(`Staff: /staff   Kitchen: /kitchen   Owner: /owner   QR codes: /qr`);
    if (!process.env.STAFF_PIN) console.log('First owner PIN is 1234 (set STAFF_PIN before first start to change it). Add staff on the Menu & settings page.');
  });
}

module.exports = { createApp };
