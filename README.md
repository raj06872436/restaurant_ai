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

The owner dashboard shows sales, tips, tables in use, guests per hour, average minutes from sitting down to ordering, average time per table, top dishes, and how often guests were left waiting.

## Run it

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
- `http://localhost:3000/settings` menu editor (add dishes, change prices, mark veg, hide a dish when it runs out) and restaurant settings (name, currency, Wi-Fi, alert times, ways to pay, tables)

Staff pages ask for the PIN (default `1234`). Each QR code carries a secret key for its own table, so a guest can only order for the table they're sitting at.

Set `PUBLIC_URL` to the address guests' phones will reach (for example `http://192.168.1.10:3000` on the restaurant Wi-Fi, or your domain) before printing QR codes.

Data is saved to `data/db.json`.

## Payments

Guests choose from the ways to pay switched on in settings: cash, card, UPI and bank transfer.

- **UPI** works with no payment gateway: enter the restaurant's UPI ID in settings, and guests get a button that opens their UPI app (GPay, PhonePe, Paytm) and a QR code, both filled in with the exact amount and table. The money goes straight to that UPI ID.
- Every payment shows on the floor screen for staff to confirm once it arrives. Sales on the owner dashboard count confirmed payments only.
- A gateway such as Razorpay can later confirm UPI and card payments automatically (see Not built yet).

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

- Automatic payment confirmation through a gateway (for example Razorpay). Today staff confirm each payment by hand.
- Photos per dish, and a Hindi/English toggle.
- Multiple restaurants or branches, user accounts per waiter, and a real database (the JSON file is fine for one branch).
- The camera connector has not been run against a live CCTV feed yet. Expect to tune the zones and the confidence threshold on site.
