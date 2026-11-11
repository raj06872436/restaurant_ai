const test = require('node:test');
const assert = require('node:assert');
const { createApp } = require('../src/server');

async function start() {
  const ctx = createApp({ dataFile: null, staffPin: '1111', cameraKey: 'cam' });
  await new Promise(res => ctx.server.listen(0, res));
  const base = `http://localhost:${ctx.server.address().port}`;
  const call = async (path, { cookie, method, body } = {}) => {
    const res = await fetch(base + path, { method: method || (body ? 'POST' : 'GET'), headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
    return { status: res.status, data: await res.json().catch(() => ({})), cookie: (res.headers.get('set-cookie') || '').split(';')[0] };
  };
  const login = async pin => (await call('/api/login', { body: { pin } })).cookie;
  return { ...ctx, call, login, stop: () => { ctx.server.close(); ctx.restaurant.removeAllListeners(); } };
}

test('owner adds staff; each role only reaches its own screens', async () => {
  const app = await start();
  try {
    const owner = await app.login('1111');
    const me = await app.call('/api/me', { cookie: owner });
    assert.deepEqual(me.data.areas, ['floor', 'kitchen', 'owner', 'settings']);
    const team = (await app.call('/api/team', { cookie: owner })).data;
    const saved = await app.call('/api/team', { cookie: owner, method: 'PUT', body: { staff: [...team, { name: 'Ravi', role: 'waiter', pin: '2222' }, { name: 'Sunita', role: 'kitchen', pin: '3333' }] } });
    assert.equal(saved.status, 200, JSON.stringify(saved.data));
    assert.ok(!JSON.stringify(saved.data).includes('hash'), 'PIN hashes never leave the server');

    const ravi = await app.login('2222'), sunita = await app.login('3333');
    assert.equal((await app.call('/api/stats', { cookie: ravi })).status, 403);
    assert.equal((await app.call('/api/settings', { cookie: ravi, method: 'PUT', body: {} })).status, 403);
    assert.equal((await app.call('/api/staff', { cookie: ravi })).status, 200);
    assert.equal((await app.call('/api/staff', { cookie: sunita })).status, 200);
    assert.equal((await app.call('/api/tables/T1/seat', { cookie: sunita, body: {} })).status, 403);

    // Ravi handles a call, Sunita cooks: both are credited on the owner dashboard.
    app.restaurant.cameraReport([{ tableId: 'T1', people: 2 }]);
    const o = app.restaurant.placeOrder('T1', [{ id: 'naan', qty: 2 }]);
    const alert = app.restaurant.callWaiter('T1', 'water');
    await app.call(`/api/alerts/${alert.id}/ack`, { cookie: ravi, body: {} });
    for (let i = 0; i < 3; i++) await app.call(`/api/orders/${o.id}/advance`, { cookie: sunita, body: {} });
    const stats = (await app.call('/api/stats', { cookie: owner })).data;
    const byName = Object.fromEntries(stats.team.map(t => [t.name, t]));
    assert.equal(byName.Ravi.alerts, 1);
    assert.equal(byName.Sunita.served, 1);

    // Pausing Ravi logs him out at once.
    const now = (await app.call('/api/team', { cookie: owner })).data.map(s => (s.name === 'Ravi' ? { ...s, active: false } : s));
    await app.call('/api/team', { cookie: owner, method: 'PUT', body: { staff: now } });
    assert.equal((await app.call('/api/staff', { cookie: ravi })).status, 401);
    assert.equal(await app.login('2222'), '');
  } finally { app.stop(); }
});

test('team rules: unique PINs, at least one owner, PIN format', async () => {
  const app = await start();
  try {
    const owner = await app.login('1111');
    const team = (await app.call('/api/team', { cookie: owner })).data;
    const put = staff => app.call('/api/team', { cookie: owner, method: 'PUT', body: { staff } });
    assert.match((await put([...team, { name: 'Amit', role: 'waiter', pin: '1111' }])).data.error, /same PIN/);
    assert.match((await put([{ ...team[0], role: 'waiter' }])).data.error, /at least one active owner/);
    assert.match((await put([...team, { name: 'Amit', role: 'waiter', pin: '12' }])).data.error, /4 to 8 digits/);
    assert.match((await put([...team, { name: 'Amit', role: 'waiter' }])).data.error, /Give Amit a PIN/);
  } finally { app.stop(); }
});

test('wrong PINs are slowed down after 5 tries', async () => {
  const app = await start();
  try {
    for (let i = 0; i < 5; i++) assert.equal((await app.call('/api/login', { body: { pin: '9999' } })).status, 401);
    assert.equal((await app.call('/api/login', { body: { pin: '1111' } })).status, 429);
  } finally { app.stop(); }
});

test('staff stay logged in after a restart; errors come back in Hindi when asked', async () => {
  const fs = require('fs'), os = require('os'), path = require('path');
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ts-')), 'db.json');
  const a = createApp({ dataFile: file, staffPin: '1111' });
  await new Promise(res => a.server.listen(0, res));
  let base = `http://localhost:${a.server.address().port}`;
  const login = await fetch(base + '/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"pin":"1111"}' });
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const hi = await fetch(base + '/api/login', { method: 'POST', headers: { 'content-type': 'application/json', 'x-lang': 'hi' }, body: '{"pin":"0000"}' });
  assert.equal((await hi.json()).error, 'गलत PIN। फिर कोशिश करें।');
  await new Promise(res => a.server.close(res)); a.restaurant.removeAllListeners();
  assert.ok(!fs.readFileSync(file, 'utf8').includes(cookie.split('=')[1]), 'raw session id is not stored');

  const b = createApp({ dataFile: file, staffPin: '1111' });
  await new Promise(res => b.server.listen(0, res));
  base = `http://localhost:${b.server.address().port}`;
  try {
    const me = await (await fetch(base + '/api/me', { headers: { cookie } })).json();
    assert.equal(me.name, 'Owner');
    const report = await fetch(base + '/api/report.csv', { headers: { cookie } });
    assert.equal(report.status, 200);
    assert.match(await report.text(), /Sales \(confirmed\),0/);
    assert.equal((await fetch(base + '/api/report?date=nope', { headers: { cookie } })).status, 400);
  } finally { b.server.close(); b.restaurant.removeAllListeners(); }
});
