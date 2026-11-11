# TableSense

One system for a restaurant that joins two ideas:

1. **QR table ordering.** Guests scan the code on their table, see the menu, order, track their food, call a waiter, split the bill, tip and pay.
2. **AI camera table monitoring.** The restaurant's existing CCTV counts people at each table. The camera knows who is seated, the app knows what they want.

Joining them gives alerts neither can give alone:

| What happens | Alert to staff |
| --- | --- |
| Camera sees guests sit, but nobody has ordered or visited after 5 min | "2 guests at T4 for 5 min with no order and no waiter. Go to the table." |
| Guest taps "Call waiter" | "Guests at T4 need help." Cleared automatically when the camera sees a waiter at the table |
| Kitchen marks food ready and it isn't served in 3 min | "Food for T4 has been ready for 3 min." |
| Guest pays in the app | "T4 is paying Rs 1,128 by wallet. Confirm the payment." |
| Camera sees the table empty | "Guests left T4. Clean and reset the table." Plus an "unpaid" alert if the bill wasn't settled |

Guests can add a note to any dish ("less spicy", "no onion"); it shows on the kitchen ticket.

The owner dashboard shows sales, tips, tables in use, guests per hour, average minutes from sitting down to ordering, average time per table, top dishes, and how often guests were left waiting.

## Daily report

The bottom of the owner dashboard has a report for any day: sales by payment method, tips, payments still waiting for confirmation, every dish sold, guests and orders per hour, people who left without paying, and the team table. **Download CSV** opens in Excel or Google Sheets.

## Run it with Docker (easiest)

On the restaurant's computer or a small server:

```bash
cp .env.example .env      # set STAFF_PIN, CAMERA_KEY and PUBLIC_URL
docker compose up -d app  # the app only
docker compose up -d      # app + camera connector (needs camera/tables.json, see below)
```

Orders, menu, settings and dish photos are kept in the `tablesense-data` Docker volume.

## Run it without Docker

Needs Node.js 18 or newer.

```bash
npm install
STAFF_PIN=4821 CAMERA_KEY=some-long-secret npm start
```

Then open:

- `http://localhost:3000/staff` floor map and alerts (for waiters, on a tablet)
- `http://localhost:3000/kitchen` kitchen screen
- `http://localhost:3000/owner` owner dashboard
- `http://localhost:3000/qr` printable QR codes, one per table
- `http://localhost:3000/settings` menu editor (add dishes, photos, Hindi names, prices, veg marks, hide a dish when it runs out) and restaurant settings (name, currency, Wi-Fi, alert times, ways to pay, tables)

Guests can switch the menu between English and Hindi. Dishes show their Hindi name when one is set.

Staff log in with their own PIN. On first start there is one owner account with PIN `1234` (or `STAFF_PIN` if set). The owner adds people under **Menu & settings → Staff** and gives each a role:

| Role | Can use |
| --- | --- |
| Owner | everything: floor, kitchen, owner dashboard, QR codes, menu and settings |
| Waiter | floor & alerts, kitchen |
| Kitchen | kitchen screen only |

The owner dashboard shows, per person, how many alerts they handled, how fast they responded, payments confirmed and orders served. Untick **Active** to stop someone logging in; they're logged out at once. After 5 wrong PINs a device has to wait a minute.

All staff screens and the guest app can switch between English and Hindi (button in the top bar). Messages coming back from the server, such as form errors, are still in English. Each QR code carries a secret key for its own table, so a guest can only order for the table they're sitting at.

Set `PUBLIC_URL` to the address guests' phones will reach (for example `http://192.168.1.10:3000` on the restaurant Wi-Fi, or your domain) before printing QR codes.

Data is saved to `data/db.json`.

## Payments

Guests choose from the ways to pay switched on in settings: online (Razorpay), cash, card, UPI and bank transfer.

### Razorpay (online, confirms itself)

Guests tap **Pay online** and Razorpay's own checkout opens on their phone: any UPI app, cards, netbanking or wallets. When the payment goes through, the bill is marked paid by itself and the floor screen shows "paid online, no action needed". Staff never confirm these.

1. In the [Razorpay dashboard](https://dashboard.razorpay.com) go to **Account & Settings → API Keys** and generate a key. Start with **Test mode** keys (`rzp_test_...`): no real money moves.
2. Put them in the `.env` file on the machine that runs the app (never in chat, email or the code):
   ```
   RAZORPAY_KEY_ID=rzp_test_xxxxxxxx
   RAZORPAY_KEY_SECRET=xxxxxxxxxxxxxxxx
   ```
3. Add a webhook so a payment still counts if the guest closes the page right after paying: **Account & Settings → Webhooks → Add**, URL `https://<your address>/api/razorpay/webhook`, events `payment.captured` and `order.paid`, and a secret of your choice. Put the same secret in `.env` as `RAZORPAY_WEBHOOK_SECRET`. (The webhook needs the app on a public https address.)
4. Make sure **automatic capture** is on in Razorpay (Account & Settings → Payment capture), otherwise payments stay "authorized".
5. Restart the app. **Menu & settings → Ways to pay** says whether Razorpay is connected and whether it's in test mode. Tick **Online (Razorpay)**.
6. Pay a test bill with Razorpay's test UPI ID `success@razorpay` or a [test card](https://razorpay.com/docs/payments/payments/test-card-details/). When it works, switch to Live keys.

The secret key stays on the server. The phone only ever sees the public key ID and the order ID, and every payment is checked against Razorpay's signature before it counts.

### Other ways to pay

- **UPI** works with no payment gateway: enter the restaurant's UPI ID in settings, and guests get a button that opens their UPI app (GPay, PhonePe, Paytm) and a QR code, both filled in with the exact amount and table. The money goes straight to that UPI ID.
- Every payment shows on the floor screen for staff to confirm once it arrives. Sales on the owner dashboard count confirmed payments only.

## Connect the cameras

The `camera/` folder has a Python connector that reads an RTSP feed, detects people with YOLOv8, and posts the head count per table to the server every few seconds. No video leaves the building.

```bash
cd camera
pip install -r requirements.txt
python calibrate.py --source "rtsp://user:pass@192.168.1.20:554/stream1" --tables T1 T2 T3 T4
# edit tables.json: set server and camera_key to match the server
python detector.py --config tables.json --show
```

- A table only counts as seated after people have been there 20 s, and as empty after 60 s, so passers-by and a quick trip to the washroom don't trigger anything. Both are adjustable in `tables.json`.
- To tell waiters from guests, set `staff_uniform_hsv` to your uniform colour. When a waiter is seen at a table, "no waiter yet" alerts clear by themselves.
- One connector per camera. Several connectors can post to the same server.

No cameras yet? Everything works without them: the QR scan opens the table, and staff can press "Seat guests", "Waiter visited" and "Guests left" on the floor map. You can also fake the camera:

```bash
node camera/simulate.js T4 2        # 2 people at T4
node camera/simulate.js T4 2 staff  # ...and a waiter
node camera/simulate.js T4 0        # T4 is empty
```

## Tests

```bash
npm test
```

## Not built yet

- Refunds from the app (do them in the Razorpay dashboard for now).
- The Docker files haven't been run yet (no Docker in the build environment). The app itself is tested.
- Multiple restaurants or branches, user accounts per waiter, and a real database (the JSON file is fine for one branch).
- The camera connector has not been run against a live CCTV feed yet. Expect to tune the zones and the confidence threshold on site.
