const test = require('node:test');
const assert = require('node:assert');
const { Store } = require('../src/store');
const { Restaurant, MIN } = require('../src/restaurant');
const { createApp } = require('../src/server');

function setup() {
  let t = new Date('2026-11-11T19:00:00').getTime();
  const clock = { now: () => t, add: m => (t += m * MIN) };
  const r = new Restaurant(new Store(null), clock.now);
  return { r, clock };
}
const open = (r, kind) => r.d.alerts.filter(a => !a.doneAt && (!kind || a.kind === kind));

test('camera seats guests, no order in 5 min raises a waiter alert', () => {
  const { r, clock } = setup();
  r.cameraReport([{ tableId: 'T4', people: 2 }]);
  assert.equal(r.table('T4').state, 'seated');
  clock.add(4); r.sweep();
  assert.equal(open(r, 'waiting').length, 0);
  clock.add(1); r.sweep();
  assert.equal(open(r, 'waiting').length, 1);
  r.sweep();
  assert.equal(open(r, 'waiting').length, 1, 'no duplicate alert');
});

test('waiter seen by camera clears the waiting alert and prevents new ones', () => {
  const { r, clock } = setup();
  r.cameraReport([{ tableId: 'T2', people: 3 }]);
  clock.add(6); r.sweep();
  r.cameraReport([{ tableId: 'T2', people: 3, staffNearby: true }]);
  assert.equal(open(r, 'waiting').length, 0);
  clock.add(10); r.sweep();
  assert.equal(open(r, 'waiting').length, 0);
});

test('full visit: order, kitchen, pay, leave, clean', () => {
  const { r, clock } = setup();
  r.cameraReport([{ tableId: 'T1', people: 2 }]);
  clock.add(2);
  const o = r.placeOrder('T1', [{ id: 'karahi', qty: 1 }, { id: 'naan', qty: 4 }]);
  assert.equal(o.total, 1850 + 400);
  assert.equal(r.table('T1').state, 'ordered');
  r.advanceOrder(o.id); r.advanceOrder(o.id);
  clock.add(4); r.sweep();
  assert.equal(open(r, 'ready').length, 1, 'ready food waiting raises alert');
  r.advanceOrder(o.id);
  assert.equal(r.table('T1').state, 'eating');
  assert.equal(open(r, 'ready').length, 0);
  // split two ways
  const half = Math.ceil(2250 / 2);
  r.pay('T1', { amount: half, tip: 100, method: 'card' });
  assert.throws(() => r.pay('T1', { amount: 5000, method: 'card' }), /left to pay/);
  r.pay('T1', { amount: 2250 - half, method: 'bank' });
  const v = r.currentVisit('T1');
  assert.ok(v.paidAt);
  v.payments.forEach(p => r.confirmPayment('T1', p.id));
  assert.equal(open(r, 'payment').length, 0);
  clock.add(30);
  r.cameraReport([{ tableId: 'T1', people: 0 }]);
  assert.equal(r.table('T1').state, 'dirty');
  assert.equal(open(r, 'clean').length, 1);
  assert.equal(open(r, 'unpaid').length, 0);
  r.ackAlert(open(r, 'clean')[0].id);
  assert.equal(r.table('T1').state, 'free');
  const s = r.stats(0);
  assert.equal(s.sales, 2250);
  assert.equal(s.tips, 100);
  assert.equal(s.avgMinToOrder, 2);
  assert.equal(s.turnovers, 1);
});

test('guests leaving with an unpaid bill raise an unpaid alert', () => {
  const { r } = setup();
  r.cameraReport([{ tableId: 'T3', people: 2 }]);
  r.placeOrder('T3', [{ id: 'kebab', qty: 1 }]);
  r.cameraReport([{ tableId: 'T3', people: 0 }]);
  assert.equal(open(r, 'unpaid').length, 1);
});

test('QR scan works without a camera, and rejects unknown dishes', () => {
  const { r } = setup();
  r.guestOpen('T5');
  assert.equal(r.table('T5').state, 'seated');
  assert.throws(() => r.placeOrder('T5', [{ id: 'pizza', qty: 1 }]), /not on the menu/);
  assert.throws(() => r.placeOrder('T5', []), /empty/);
});

test('UPI is only offered once a UPI ID is set, and the link carries the exact amount', () => {
  const { r } = setup();
  r.guestOpen('T2');
  r.placeOrder('T2', [{ id: 'biryani', qty: 2 }]);
  assert.ok(!r.guestView('T2').payMethods.some(m => m.id === 'upi'));
  assert.throws(() => r.pay('T2', { amount: 2400, method: 'upi' }), /how you are paying/);
  assert.throws(() => r.updateSettings({ payments: { methods: ['upi'], upi: { vpa: 'not an id' } } }), /valid UPI ID/);
  r.updateSettings({ payments: { methods: ['cash', 'upi'], upi: { vpa: 'spice.house@okhdfcbank', payee: 'Spice House' } } });
  assert.deepEqual(r.guestView('T2').payMethods.map(m => m.id), ['cash', 'upi']);
  const { payment } = r.pay('T2', { amount: 2400, tip: 240, method: 'upi' });
  assert.match(payment.upiLink, /^upi:\/\/pay\?pa=spice.house%40okhdfcbank&pn=Spice%20House&am=2640.00&cu=INR/);
});

test('settings: tables can be added and removed, but not while guests are seated', () => {
  const { r } = setup();
  r.cameraReport([{ tableId: 'T8', people: 2 }]);
  assert.throws(() => r.updateSettings({ tables: r.d.tables.filter(t => t.id !== 'T8') }), /has guests/);
  const keyT1 = r.table('T1').key;
  r.updateSettings({ tables: [...r.d.tables.map(t => ({ id: t.id, seats: t.seats })), { id: 'patio1', seats: 6 }] });
  assert.equal(r.table('PATIO1').seats, 6);
  assert.equal(r.table('T1').key, keyT1, 'existing QR codes keep working');
  assert.throws(() => r.updateSettings({ noOrderAlertMin: 0 }), /between 1 and 60/);
  r.setMenu([{ name: 'Masala Dosa', cat: 'Mains', price: 180, veg: true }, { name: 'Masala Dosa', price: 200 }]);
  assert.deepEqual(r.d.menu.map(m => m.id), ['masala-dosa', 'masala-dosa-2']);
});

test('HTTP: table key, staff PIN and camera key are enforced', async () => {
  const { server, restaurant } = createApp({ dataFile: null, staffPin: '9999', cameraKey: 'cam' });
  await new Promise(res => server.listen(0, res));
  const base = `http://localhost:${server.address().port}`;
  const key = restaurant.table('T4').key;
  try {
    assert.equal((await fetch(`${base}/api/guest/T4`)).status, 403);
    assert.equal((await fetch(`${base}/api/guest/T4?k=${key}`)).status, 200);
    const order = await fetch(`${base}/api/guest/T4/order`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-table-key': key }, body: JSON.stringify({ items: [{ id: 'lassi', qty: 2 }] }) });
    assert.equal(order.status, 200);
    assert.equal((await fetch(`${base}/api/staff`)).status, 401);
    assert.equal((await fetch(`${base}/api/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"pin":"1111"}' })).status, 401);
    const login = await fetch(`${base}/api/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"pin":"9999"}' });
    const cookie = login.headers.get('set-cookie').split(';')[0];
    const staff = await (await fetch(`${base}/api/staff`, { headers: { cookie } })).json();
    assert.equal(staff.orders.length, 1);
    const bad = await fetch(`${base}/api/camera`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-camera-key': 'nope' }, body: '{"tables":[]}' });
    assert.equal(bad.status, 401);
    const ok = await fetch(`${base}/api/camera`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-camera-key': 'cam' }, body: '{"tables":[{"tableId":"T6","people":2}]}' });
    assert.equal(ok.status, 200);
    assert.equal(restaurant.table('T6').state, 'seated');
  } finally {
    server.close(); restaurant.removeAllListeners();
  }
});
