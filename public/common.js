// Shared helpers for every page.
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
  const ago = ts => { const m = Math.floor((Date.now() - ts) / 60000); return m < 1 ? 'just now' : m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`; };
  const time = ts => new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

  // Staff pages: show a PIN form until logged in, then call start().
  async function staffGate(start) {
    const me = await api('/api/me');
    if (me.staff) return start();
    document.body.innerHTML = `<form class="login" id="login"><h1>Staff login</h1><label for="pin" class="muted">Enter the staff PIN</label>
      <input id="pin" inputmode="numeric" autocomplete="current-password" type="password" required><button class="primary">Log in</button><div class="err" id="err"></div></form>`;
    document.getElementById('login').onsubmit = async e => {
      e.preventDefault();
      try { await api('/api/login', { body: { pin: document.getElementById('pin').value } }); location.reload(); }
      catch (err) { document.getElementById('err').textContent = err.message; }
    };
  }
  function nav(current) {
    const links = [['/staff', 'Floor & alerts'], ['/kitchen', 'Kitchen'], ['/owner', 'Owner'], ['/qr', 'QR codes'], ['/settings', 'Menu & settings']];
    return `<nav class="top"><h1>TableSense</h1><div class="chips">${links.map(([h, l]) => `<a href="${h}" class="${h === current ? 'on' : ''}">${l}</a>`).join('')}</div></nav>`;
  }
  function live(onUpdate, auth) {
    const socket = io({ auth });
    let t; socket.on('update', () => { clearTimeout(t); t = setTimeout(onUpdate, 80); });
    socket.on('connect', onUpdate);
    setInterval(onUpdate, 30000); // timers on screen + safety net
    return socket;
  }
  return { esc, money, api, toast, ago, time, staffGate, nav, live, setCurrency: c => (currency = c || currency) };
})();
