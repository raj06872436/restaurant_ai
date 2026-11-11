// Pretend to be the camera, for testing without CCTV.
//   node camera/simulate.js T4 2      -> 2 people now at T4
//   node camera/simulate.js T4 0      -> T4 is empty
//   node camera/simulate.js T4 2 staff -> 2 guests and a waiter at T4
const [tableId, people = '2', staff] = process.argv.slice(2);
if (!tableId) { console.log('Usage: node camera/simulate.js <table> <people> [staff]'); process.exit(1); }
const server = process.env.SERVER || 'http://localhost:3000';
fetch(server + '/api/camera', {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'x-camera-key': process.env.CAMERA_KEY || 'change-me-camera-key' },
  body: JSON.stringify({ tables: [{ tableId, people: Number(people), staffNearby: staff === 'staff' }] }),
}).then(r => r.json()).then(r => console.log(r)).catch(e => console.error('Could not reach the server:', e.message));
