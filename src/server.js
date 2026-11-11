const path = require('path');
const crypto = require('crypto');
const http = require('http');
const express = require('express');
const cookieParser = require('cookie-parser');
const QRCode = require('qrcode');
const { Server } = require('socket.io');
const { Store } = require('./store');
const { Restaurant, httpError } = require('./restaurant');

function createApp({
  dataFile = path.join(__dirname, '..', 'data', 'db.json'),
  staffPin = process.env.STAFF_PIN || '1234',
  cameraKey = process.env.CAMERA_KEY || 'change-me-camera-key',
  publicUrl = process.env.PUBLIC_URL || '',
  now,
} = {}) {
  const store = new Store(dataFile);
  const r = new Restaurant(store, now);
  const app = express();
  const server = http.createServer(app);
  const io = new Server(server);
  const sessions = new Set();

  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());

  const isStaff = req => sessions.has(req.cookies.ts_staff);
  const staffOnly = (req, res, next) => (isStaff(req) ? next() : res.status(401).json({ error: 'Log in with the staff PIN.' }));
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
  app.post('/api/login', (req, res) => {
    const pin = String(req.body.pin || '');
    const ok = pin.length === staffPin.length && crypto.timingSafeEqual(Buffer.from(pin), Buffer.from(staffPin));
    if (!ok) return res.status(401).json({ error: 'Wrong PIN. Try again.' });
    const sid = crypto.randomBytes(18).toString('hex');
    sessions.add(sid);
    res.cookie('ts_staff', sid, { httpOnly: true, sameSite: 'lax', maxAge: 14 * 24 * 3600e3 });
    res.json({ ok: true });
  });
  app.get('/api/me', (req, res) => res.json({ staff: isStaff(req) }));

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
  app.get('/api/staff', staffOnly, wrap(() => r.staffView()));
  app.post('/api/alerts/:id/ack', staffOnly, wrap(req => r.ackAlert(req.params.id, req.body.by || 'staff')));
  app.post('/api/tables/:table/clean', staffOnly, wrap(req => r.markClean(req.params.table)));
  app.post('/api/tables/:table/seat', staffOnly, wrap(req => { const v = r.seat(r.table(req.params.table), Number(req.body.guests) || 2, 'staff'); r.changed(); return v; }));
  app.post('/api/tables/:table/leave', staffOnly, wrap(req => { r.guestsLeft(r.table(req.params.table)); r.changed(); }));
  app.post('/api/tables/:table/waiter', staffOnly, wrap(req => { r.waiterVisited(r.table(req.params.table)); r.changed(); }));
  app.post('/api/tables/:table/order', staffOnly, wrap(req => r.placeOrder(req.params.table, req.body.items)));
  app.post('/api/tables/:table/payments/:pid/confirm', staffOnly, wrap(req => r.confirmPayment(req.params.table, req.params.pid)));
  app.post('/api/orders/:id/advance', staffOnly, wrap(req => r.advanceOrder(req.params.id, req.body.status)));
  app.get('/api/stats', staffOnly, wrap(() => r.stats()));
  app.put('/api/menu', staffOnly, wrap(req => r.setMenu(req.body.menu)));
  app.put('/api/settings', staffOnly, wrap(req => r.updateSettings(req.body)));
  app.get('/api/qr/:table.svg', staffOnly, async (req, res) => {
    try {
      const t = r.table(req.params.table);
      const base = publicUrl || `${req.protocol}://${req.get('host')}`;
      res.type('image/svg+xml').send(await QRCode.toString(`${base}/t/${t.id}?k=${t.key}`, { type: 'svg', margin: 1 }));
    } catch (e) { res.status(e.status || 500).send(e.message); }
  });

  /* ---------- pages ---------- */
  const page = f => (req, res) => res.sendFile(path.join(__dirname, '..', 'public', f));
  app.get('/t/:table', page('guest.html'));
  app.get('/staff', page('staff.html'));
  app.get('/kitchen', page('kitchen.html'));
  app.get('/owner', page('owner.html'));
  app.get('/qr', page('qr.html'));
  app.get('/settings', page('settings.html'));
  app.get('/', (req, res) => res.redirect('/staff'));
  app.use(express.static(path.join(__dirname, '..', 'public')));

  /* ---------- live updates ---------- */
  io.on('connection', socket => {
    const cookies = Object.fromEntries((socket.handshake.headers.cookie || '').split(';').map(c => c.trim().split('=').map(decodeURIComponent)));
    if (sessions.has(cookies.ts_staff)) socket.join('staff');
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

  return { app, server, io, restaurant: r, store };
}

if (require.main === module) {
  const port = Number(process.env.PORT) || 3000;
  const { server } = createApp();
  server.listen(port, () => {
    console.log(`TableSense running on http://localhost:${port}`);
    console.log(`Staff: /staff   Kitchen: /kitchen   Owner: /owner   QR codes: /qr`);
    if (!process.env.STAFF_PIN) console.log('Staff PIN is 1234. Set STAFF_PIN to change it.');
  });
}

module.exports = { createApp };
