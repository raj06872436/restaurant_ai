// Tiny JSON-file store. Good enough for one restaurant; swap for Postgres later.
const fs = require('fs');
const crypto = require('crypto');
const path = require('path');

const DEFAULT_MENU = [
  { id: 'karahi', cat: 'Mains', name: 'Chicken Karahi', desc: 'Tomato, ginger, green chilli', price: 1850 },
  { id: 'kebab', cat: 'Starters', name: 'Seekh Kebab', desc: '4 pieces, mint chutney', price: 950 },
  { id: 'tikka', cat: 'Starters', name: 'Chicken Tikka', desc: 'Charcoal grilled', price: 1100 },
  { id: 'biryani', cat: 'Mains', name: 'Chicken Biryani', desc: 'With raita', price: 1200 },
  { id: 'naan', cat: 'Breads', name: 'Garlic Naan', desc: 'Tandoor baked', price: 100 },
  { id: 'roti', cat: 'Breads', name: 'Tandoori Roti', desc: '', price: 50 },
  { id: 'raita', cat: 'Sides', name: 'Raita', desc: 'Cucumber and mint', price: 150 },
  { id: 'lemonade', cat: 'Drinks', name: 'Mint Lemonade', desc: 'Fresh, chilled', price: 350 },
  { id: 'lassi', cat: 'Drinks', name: 'Sweet Lassi', desc: '', price: 300 },
  { id: 'jamun', cat: 'Desserts', name: 'Gulab Jamun', desc: '2 pieces', price: 450 },
];

function defaults(tableCount = 8) {
  const tables = [];
  for (let i = 1; i <= tableCount; i++) {
    tables.push({ id: 'T' + i, seats: i % 3 ? 4 : 2, state: 'free', people: 0, visitId: null, since: Date.now(), waiterSeenAt: null, key: crypto.randomBytes(6).toString('hex') });
  }
  return {
    settings: { name: 'My Restaurant', currency: 'Rs', noOrderAlertMin: 5, readyNotServedAlertMin: 3, wifi: { network: 'Table-Guest', password: 'welcome123' } },
    tables, menu: DEFAULT_MENU, visits: [], orders: [], alerts: [], seq: 1,
  };
}

class Store {
  constructor(file) {
    this.file = file;
    this.data = null;
    this.timer = null;
    if (file && fs.existsSync(file)) this.data = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!this.data) this.data = defaults();
  }
  id(prefix) { return prefix + (this.data.seq++); }
  save() {
    if (!this.file) return;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), 200);
  }
  flush() {
    if (!this.file) return;
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = this.file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 1));
    fs.renameSync(tmp, this.file);
  }
}

module.exports = { Store, defaults };
