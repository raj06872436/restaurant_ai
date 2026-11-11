const test = require('node:test');
const assert = require('node:assert');
const { createRazorpay, hmac } = require('../src/razorpay');
const { createApp } = require('../src/server');

const KEY = 'rzp_test_abc', SECRET = 'shh-secret', HOOK = 'hook-secret';

function fakeFetch(calls) {
  return async (url, opts) => {
    calls.push({ url, opts, body: JSON.parse(opts.body) });
    return { ok: true, status: 200, json: async () => ({ id: 'order_TEST' + calls.length, amount: JSON.parse(opts.body).amount, currency: 'INR' }) };
  };
}

async function start(calls) {
  const razorpay = createRazorpay({ keyId: KEY, keySecret: SECRET, webhookSecret: HOOK, fetchImpl: fakeFetch(calls) });
  const ctx = createApp({ dataFile: null, staffPin: '1111', razorpay });
  await new Promise(res => ctx.server.listen(0, res));
  const base = `http://localhost:${ctx.server.address().port}`;
  const post = async (path, body, headers = {}) => {
    const res = await fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) });
    return { status: res.status, data: await res.json().catch(() => ({})) };
  };
  return { ...ctx, post, stop: () => { ctx.server.close(); ctx.restaurant.removeAllListeners(); } };
}

test('signature checks', () => {
  const rz = createRazorpay({ keyId: KEY, keySecret: SECRET, webhookSecret: HOOK });
  const sig = hmac(SECRET, 'order_1|pay_1');
  assert.ok(rz.verifyPayment({ orderId: 'order_1', paymentId: 'pay_1', signature: sig }));
  assert.ok(!rz.verifyPayment({ orderId: 'order_1', paymentId: 'pay_2', signature: sig }));
  assert.ok(!rz.verifyPayment({ orderId: 'order_1', paymentId: 'pay_1', signature: 'nope' }));
  assert.ok(rz.verifyWebhook(Buffer.from('{"a":1}'), hmac(HOOK, '{"a":1}')));
  assert.ok(!rz.verifyWebhook(Buffer.from('{"a":2}'), hmac(HOOK, '{"a":1}')));
  assert.ok(rz.testMode);
  assert.ok(!createRazorpay({}).ready);
});

test('online payment: order created in paise, counted only after a valid signature', async () => {
  const calls = [];
  const app = await start(calls);
  try {
    const r = app.restaurant, key = r.table('T4').key, H = { 'x-table-key': key };
    r.cameraReport([{ tableId: 'T4', people: 2 }]);
    r.placeOrder('T4', [{ id: 'karahi', qty: 1 }]);
    assert.ok(r.guestView('T4').payMethods.some(m => m.id === 'online'));

    const pay = await app.post('/api/guest/T4/pay', { amount: 1850, tip: 185, method: 'online' }, H);
    assert.equal(pay.status, 200, JSON.stringify(pay.data));
    assert.equal(calls[0].body.amount, 203500, 'rupees sent as paise');
    assert.match(calls[0].opts.headers.authorization, /^Basic /);
    assert.equal(pay.data.razorpay.key, KEY);
    assert.ok(!JSON.stringify(pay.data).includes(SECRET), 'secret never sent to the phone');
    assert.equal(r.guestView('T4').bill.due, 1850, 'nothing counted before Razorpay confirms');

    const orderId = pay.data.razorpay.orderId;
    const bad = await app.post('/api/guest/T4/razorpay/verify', { razorpay_order_id: orderId, razorpay_payment_id: 'pay_X', razorpay_signature: 'forged' }, H);
    assert.equal(bad.status, 400);
    assert.equal(r.guestView('T4').bill.due, 1850);

    const ok = await app.post('/api/guest/T4/razorpay/verify', { razorpay_order_id: orderId, razorpay_payment_id: 'pay_X', razorpay_signature: hmac(SECRET, `${orderId}|pay_X`) }, H);
    assert.equal(ok.status, 200);
    const bill = r.guestView('T4').bill;
    assert.equal(bill.due, 0);
    assert.equal(bill.unconfirmed, 0, 'online payments need no staff confirmation');
    assert.equal(r.stats(0).sales, 1850);
    assert.equal(r.d.alerts.filter(a => !a.doneAt && a.kind === 'payment').length, 0);

    // The webhook for the same payment arriving later changes nothing.
    const body = JSON.stringify({ event: 'payment.captured', payload: { payment: { entity: { id: 'pay_X', order_id: orderId } } } });
    assert.equal((await app.post('/api/razorpay/webhook', body, { 'x-razorpay-signature': hmac(HOOK, body) })).status, 200);
    assert.equal(r.stats(0).sales, 1850);
  } finally { app.stop(); }
});

test('webhook alone confirms a payment if the guest closed the page; forged webhooks are ignored', async () => {
  const calls = [];
  const app = await start(calls);
  try {
    const r = app.restaurant, H = { 'x-table-key': r.table('T2').key };
    r.guestOpen('T2');
    r.placeOrder('T2', [{ id: 'lassi', qty: 2 }]);
    const { data } = await app.post('/api/guest/T2/pay', { amount: 600, method: 'online' }, H);
    const orderId = data.razorpay.orderId;
    const body = JSON.stringify({ event: 'order.paid', payload: { payment: { entity: { id: 'pay_W', order_id: orderId } } } });
    assert.equal((await app.post('/api/razorpay/webhook', body, { 'x-razorpay-signature': 'forged' })).status, 400);
    assert.equal(r.guestView('T2').bill.due, 600);
    assert.equal((await app.post('/api/razorpay/webhook', body, { 'x-razorpay-signature': hmac(HOOK, body) })).status, 200);
    assert.equal(r.guestView('T2').bill.due, 0);
    assert.equal(r.report().byMethod[0].method, 'online');
  } finally { app.stop(); }
});

test('online is hidden when Razorpay keys are missing, and a failed order leaves the bill untouched', async () => {
  const off = createApp({ dataFile: null, razorpay: createRazorpay({}) });
  off.restaurant.guestOpen('T1');
  assert.ok(!off.restaurant.guestView('T1').payMethods.some(m => m.id === 'online'));
  off.restaurant.removeAllListeners();

  const broken = createRazorpay({ keyId: KEY, keySecret: SECRET, fetchImpl: async () => ({ ok: false, status: 401, json: async () => ({ error: { description: 'Authentication failed' } }) }) });
  const ctx = createApp({ dataFile: null, razorpay: broken });
  await new Promise(res => ctx.server.listen(0, res));
  try {
    const r = ctx.restaurant;
    r.guestOpen('T3'); r.placeOrder('T3', [{ id: 'naan', qty: 3 }]);
    const res = await fetch(`http://localhost:${ctx.server.address().port}/api/guest/T3/pay`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-table-key': r.table('T3').key }, body: '{"amount":300,"method":"online"}' });
    assert.equal(res.status, 502);
    assert.equal(r.currentVisit('T3').payments.length, 0);
  } finally { ctx.server.close(); ctx.restaurant.removeAllListeners(); }
});

test('Razorpay unreachable gives a clear message, not a crash', async () => {
  const rz = createRazorpay({ keyId: KEY, keySecret: SECRET, fetchImpl: async () => { throw new Error('ECONNRESET'); } });
  await assert.rejects(rz.createOrder({ amount: 10, receipt: 'x' }), e => e.status === 502 && /not available right now/.test(e.message));
});
