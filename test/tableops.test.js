const test = require('node:test');
const assert = require('node:assert');
const { Store } = require('../src/store');
const { Restaurant, MIN } = require('../src/restaurant');

function setup() {
  let t = new Date('2026-11-11T20:00:00').getTime();
  const r = new Restaurant(new Store(null), () => t);
  return { r, add: m => (t += m * MIN) };
}
const open = (r, kind) => r.d.alerts.filter(a => !a.doneAt && a.kind === kind);

test('move guests to a free table: bill, open orders and alerts follow them', () => {
  const { r } = setup();
  r.cameraReport([{ tableId: 'T1', people: 2 }]);
  const o = r.placeOrder('T1', [{ id: 'karahi', qty: 1 }]);
  r.callWaiter('T1', 'water');
  r.moveTable('T1', 'T5', 'Ravi');
  assert.equal(r.table('T1').state, 'dirty');
  assert.equal(r.table('T5').state, 'ordered');
  assert.equal(r.guestView('T5').bill.total, 1850);
  assert.equal(r.d.orders.find(x => x.id === o.id).tableId, 'T5');
  assert.equal(open(r, 'call')[0].tableId, 'T5');
  assert.equal(open(r, 'clean')[0].tableId, 'T1');
  // camera now sees T1 empty: nothing breaks, no unpaid alert
  r.cameraReport([{ tableId: 'T1', people: 0 }]);
  assert.equal(open(r, 'unpaid').length, 0);
  assert.throws(() => r.moveTable('T5', 'T5'), /different table/);
  r.cameraReport([{ tableId: 'T2', people: 2 }]);
  assert.throws(() => r.moveTable('T5', 'T2'), /already has guests/);
});

test('joined tables share one bill until the last one leaves', () => {
  const { r } = setup();
  r.cameraReport([{ tableId: 'T1', people: 2 }, { tableId: 'T2', people: 3 }]);
  r.placeOrder('T1', [{ id: 'naan', qty: 2 }]);
  r.placeOrder('T2', [{ id: 'lassi', qty: 3 }]);
  r.joinTables('T1', 'T2');
  assert.equal(r.guestView('T1').bill.total, 200 + 900);
  assert.equal(r.guestView('T2').bill.total, 200 + 900);
  assert.equal(r.currentVisit('T2').guests, 5);
  r.cameraReport([{ tableId: 'T1', people: 0 }]);
  assert.equal(r.table('T1').state, 'dirty');
  assert.equal(open(r, 'unpaid').length, 0, 'other half still seated');
  r.cameraReport([{ tableId: 'T2', people: 0 }]);
  assert.equal(open(r, 'unpaid').length, 1, 'last table left with the joint bill unpaid');
  assert.equal(open(r, 'unpaid')[0].params.amount, 1100);
});

test('cancel part of an order with a reason; a paid bill cannot be cancelled down', () => {
  const { r } = setup();
  r.cameraReport([{ tableId: 'T3', people: 2 }]);
  const o = r.placeOrder('T3', [{ id: 'naan', qty: 4 }, { id: 'raita', qty: 1 }]);
  assert.throws(() => r.cancelItem(o.id, 'naan', 1, ''), /reason/);
  r.cancelItem(o.id, 'naan', 1, 'out of stock', 'Sunita');
  assert.equal(r.guestView('T3').bill.total, 300 + 150);
  r.cancelItem(o.id, 'raita', 1, 'guest changed mind');
  assert.equal(o.lines.length, 1);
  r.pay('T3', { amount: 300, method: 'cash' });
  assert.throws(() => r.cancelItem(o.id, 'naan', 1, 'oops'), /already paid/);
  const rep = r.report();
  assert.equal(rep.cancelled.length, 2);
  assert.equal(rep.cancelled[0].by, 'Sunita');
  r.cancelItem(r.placeOrder('T3', [{ id: 'jamun', qty: 1 }]).id, 'jamun', 1, 'wrong table');
  assert.equal(r.d.orders.slice(-1)[0].status, 'cancelled');
});

test('discounts: waiter limit, owner any amount, GST added or included', () => {
  const { r } = setup();
  r.cameraReport([{ tableId: 'T4', people: 2 }]);
  r.placeOrder('T4', [{ id: 'biryani', qty: 2 }]); // 2400
  assert.throws(() => r.setDiscount('T4', { type: 'pct', value: 20, reason: 'regular' }, { name: 'Ravi', role: 'waiter' }), /up to 10%/);
  r.setDiscount('T4', { type: 'pct', value: 10, reason: 'regular' }, { name: 'Ravi', role: 'waiter' });
  assert.equal(r.guestView('T4').bill.total, 2160);
  r.setDiscount('T4', { type: 'amt', value: 400, reason: 'birthday' }, { name: 'Owner', role: 'owner' });
  assert.equal(r.guestView('T4').bill.total, 2000);
  r.updateSettings({ gst: { rate: 5, inclusive: false, gstin: '27ABCDE1234F1Z5' } });
  let b = r.guestView('T4').bill;
  assert.equal(b.tax.added, 100);
  assert.equal(b.total, 2100);
  r.updateSettings({ gst: { rate: 5, inclusive: true } });
  b = r.guestView('T4').bill;
  assert.equal(b.total, 2000);
  assert.equal(b.tax.amount, 95);
  assert.throws(() => r.updateSettings({ gst: { rate: 7 } }), /GST rate/);
  r.setDiscount('T4', { type: 'none' });
  assert.equal(r.guestView('T4').bill.total, 2400);
});
