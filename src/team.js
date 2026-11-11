// Staff accounts: each person logs in with their own PIN, and their role decides which screens they see.
const crypto = require('crypto');
const { httpError } = require('./restaurant');

const ROLES = {
  owner: ['floor', 'kitchen', 'owner', 'settings'],
  waiter: ['floor', 'kitchen'],
  kitchen: ['kitchen'],
};

function hashPin(pin, salt = crypto.randomBytes(12).toString('hex')) {
  return { salt, hash: crypto.scryptSync(String(pin), salt, 32).toString('hex') };
}
function pinMatches(member, pin) {
  const { hash } = hashPin(pin, member.salt);
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(member.hash, 'hex'));
}

class Team {
  constructor(restaurant, defaultPin) {
    this.r = restaurant;
    if (!Array.isArray(this.r.d.staff) || !this.r.d.staff.length) {
      // First run: one owner account using STAFF_PIN, so nobody is locked out.
      this.r.d.staff = [{ id: this.r.store.id('S'), name: 'Owner', role: 'owner', active: true, ...hashPin(defaultPin) }];
      this.r.store.save();
    }
  }
  get list() { return this.r.d.staff; }
  byId(id) { return this.list.find(s => s.id === id && s.active); }
  login(pin) {
    pin = String(pin || '');
    if (!/^\d{4,8}$/.test(pin)) return null;
    return this.list.find(s => s.active && pinMatches(s, pin)) || null;
  }
  can(member, area) { return !!member && (ROLES[member.role] || []).includes(area); }
  publicList() { return this.list.map(({ id, name, role, active }) => ({ id, name, role, active })); }

  // members: [{ id?, name, role, active, pin? }]. A new member needs a PIN; existing ones keep theirs unless a new one is given.
  save(members) {
    if (!Array.isArray(members)) throw httpError(400, 'Send the full staff list.');
    const names = new Set();
    const next = members.map(m => {
      const name = String(m.name || '').trim().slice(0, 40);
      if (!name) throw httpError(400, 'Every staff member needs a name.');
      if (names.has(name.toLowerCase())) throw httpError(400, `There are two people called ${name}. Use different names.`);
      names.add(name.toLowerCase());
      if (!ROLES[m.role]) throw httpError(400, `Choose a role for ${name}.`);
      const old = m.id && this.list.find(s => s.id === m.id);
      const pin = m.pin ? String(m.pin).trim() : '';
      if (pin && !/^\d{4,8}$/.test(pin)) throw httpError(400, `${name}'s PIN must be 4 to 8 digits.`);
      if (!old && !pin) throw httpError(400, `Give ${name} a PIN.`);
      const creds = pin ? hashPin(pin) : { salt: old.salt, hash: old.hash };
      return { id: old ? old.id : this.r.store.id('S'), name, role: m.role, active: m.active !== false, ...creds, _pin: pin };
    });
    if (!next.some(s => s.active && s.role === 'owner')) throw httpError(400, 'Keep at least one active owner, or nobody can change settings.');
    // PINs identify the person, so two active people can't share one.
    const active = next.filter(s => s.active);
    for (let i = 0; i < active.length; i++) for (let j = i + 1; j < active.length; j++) {
      const a = active[i], b = active[j];
      const pin = a._pin || b._pin;
      if (!pin) continue;
      const other = a._pin ? b : a;
      if (pinMatches(other, pin)) throw httpError(400, `${a.name} and ${b.name} have the same PIN. Give each person their own.`);
    }
    this.r.d.staff = next.map(({ _pin, ...s }) => s);
    this.r.changed();
    return this.publicList();
  }
}

module.exports = { Team, ROLES };
