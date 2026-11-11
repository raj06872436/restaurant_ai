// Razorpay: online payments (UPI, cards, netbanking, wallets) that confirm themselves.
// Keys come from the environment, never from the data file or the browser:
//   RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, RAZORPAY_WEBHOOK_SECRET
const crypto = require('crypto');

const safeEqualHex = (a, b) => {
  const x = Buffer.from(String(a || ''), 'utf8'), y = Buffer.from(String(b || ''), 'utf8');
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};
const hmac = (secret, data) => crypto.createHmac('sha256', secret).update(data).digest('hex');

function createRazorpay({ keyId, keySecret, webhookSecret, fetchImpl = global.fetch } = {}) {
  const ready = !!(keyId && keySecret);
  return {
    ready,
    keyId,
    testMode: ready && keyId.startsWith('rzp_test_'),
    webhookReady: !!webhookSecret,

    // amount is in rupees; Razorpay wants paise.
    async createOrder({ amount, receipt, notes }) {
      if (!ready) throw Object.assign(new Error('Online payment is not set up.'), { status: 400 });
      const unavailable = () => Object.assign(new Error('Online payment is not available right now. Pay another way or call a waiter.'), { status: 502 });
      let res;
      try {
        res = await fetchImpl('https://api.razorpay.com/v1/orders', {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: 'Basic ' + Buffer.from(`${keyId}:${keySecret}`).toString('base64') },
          body: JSON.stringify({ amount: Math.round(amount * 100), currency: 'INR', receipt: String(receipt).slice(0, 40), notes }),
        });
      } catch (e) {
        console.error('Could not reach Razorpay:', e.message);
        throw unavailable();
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.id) {
        console.error('Razorpay order failed:', res.status, data.error && data.error.description);
        throw unavailable();
      }
      return data; // { id: 'order_...', amount, currency, ... }
    },

    // Checkout hands back these three values; the signature proves Razorpay sent them.
    verifyPayment({ orderId, paymentId, signature }) {
      return ready && !!orderId && !!paymentId && safeEqualHex(hmac(keySecret, `${orderId}|${paymentId}`), signature);
    },

    verifyWebhook(rawBody, signature) {
      return !!webhookSecret && !!rawBody && safeEqualHex(hmac(webhookSecret, rawBody), signature);
    },
  };
}

module.exports = { createRazorpay, hmac };
