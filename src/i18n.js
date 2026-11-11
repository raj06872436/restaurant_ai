// Hindi versions of messages the server sends back. The English text is the key; patterns handle names and amounts.
const EXACT = {
  "Your account can't use this screen. Ask the owner.": 'आपका खाता यह स्क्रीन नहीं खोल सकता। मालिक से पूछें।',
  'Log in with your staff PIN.': 'अपने स्टाफ़ PIN से लॉग इन करें।',
  'Too many wrong PINs. Wait a minute and try again.': 'बहुत बार गलत PIN डाला गया। एक मिनट बाद फिर कोशिश करें।',
  'Wrong PIN. Try again.': 'गलत PIN। फिर कोशिश करें।',
  'Choose a JPG, PNG or WebP photo under 3 MB.': '3 MB से छोटी JPG, PNG या WebP फ़ोटो चुनें।',
  'That file is too big. Use a photo under 3 MB.': 'फ़ाइल बहुत बड़ी है। 3 MB से छोटी फ़ोटो लें।',
  'Choose how you are paying.': 'भुगतान का तरीका चुनें।',
  'Enter a valid UPI ID, like restaurant@okhdfcbank.': 'सही UPI ID डालें, जैसे restaurant@okhdfcbank।',
  'Enter an amount to pay.': 'भुगतान की रकम डालें।',
  'Enter the restaurant name.': 'रेस्टोरेंट का नाम डालें।',
  'Every dish needs a name.': 'हर डिश का नाम होना चाहिए।',
  'Every staff member needs a name.': 'हर स्टाफ़ सदस्य का नाम होना चाहिए।',
  'Keep at least one active owner, or nobody can change settings.': 'कम से कम एक चालू मालिक रखें, वरना कोई सेटिंग नहीं बदल पाएगा।',
  'Keep at least one table.': 'कम से कम एक टेबल रखें।',
  'The order is empty.': 'ऑर्डर खाली है।',
  'There is no open bill for this table.': 'इस टेबल का कोई खुला बिल नहीं है।',
  'Turn on at least one way to pay.': 'भुगतान का कम से कम एक तरीका चालू करें।',
  'This link is not valid. Scan the QR code on your table again.': 'यह लिंक सही नहीं है। अपनी टेबल का QR कोड फिर से स्कैन करें।',
  'Alert not found': 'अलर्ट नहीं मिला',
  'Order not found': 'ऑर्डर नहीं मिला',
  'Payment not found': 'भुगतान नहीं मिला',
  'Something went wrong.': 'कुछ गड़बड़ हो गई।',
  'Pick a valid date.': 'सही तारीख चुनें।',
  'Pick a different table.': 'कोई दूसरी टेबल चुनें।',
  'Both tables need guests to join their bills.': 'बिल जोड़ने के लिए दोनों टेबल पर मेहमान होने चाहिए।',
  'These tables already share a bill.': 'इन टेबल का बिल पहले से एक है।',
  'That dish is not in this order.': 'यह डिश इस ऑर्डर में नहीं है।',
  'Give a reason for cancelling.': 'रद्द करने का कारण लिखें।',
  'This bill is already paid. Refund the guest instead of cancelling.': 'बिल का भुगतान हो चुका है। रद्द करने के बजाय पैसे लौटाएं।',
  'This bill is already paid. Refund the guest instead.': 'बिल का भुगतान हो चुका है। पैसे लौटाएं।',
  'Enter a discount.': 'छूट डालें।',
  'A discount can be at most 100%.': 'छूट 100% से ज़्यादा नहीं हो सकती।',
  'Give a reason for the discount.': 'छूट का कारण लिखें।',
  'GST rate must be 0, 5, 12, 18 or 28%.': 'GST दर 0, 5, 12, 18 या 28% होनी चाहिए।',
  'GSTIN should be 15 letters and numbers.': 'GSTIN 15 अक्षर और अंकों का होना चाहिए।',
  'Waiter discount limit must be between 0 and 100%.': 'वेटर की छूट सीमा 0 से 100% के बीच होनी चाहिए।',
};
const PATTERNS = [
  [/^"(.+)" is not on the menu\.$/, m => `"${m[1]}" मेन्यू में नहीं है।`],
  [/^"(.+)" is not a valid table name\. Use letters and numbers, like T9\.$/, m => `"${m[1]}" सही टेबल नाम नहीं है। अक्षर और अंक लिखें, जैसे T9।`],
  [/^(.+) and (.+) have the same PIN\. Give each person their own\.$/, m => `${m[1]} और ${m[2]} का PIN एक जैसा है। हर व्यक्ति को अलग PIN दें।`],
  [/^The no-order alert must be between 1 and 60 minutes\.$/, () => 'बिना ऑर्डर वाला अलर्ट 1 से 60 मिनट के बीच होना चाहिए।'],
  [/^The food-ready alert must be between 1 and 60 minutes\.$/, () => 'तैयार खाने वाला अलर्ट 1 से 60 मिनट के बीच होना चाहिए।'],
  [/^(.+)'s PIN must be 4 to 8 digits\.$/, m => `${m[1]} का PIN 4 से 8 अंकों का होना चाहिए।`],
  [/^(.+) has guests right now, so it can't be removed\.$/, m => `${m[1]} पर अभी मेहमान हैं, इसलिए हटा नहीं सकते।`],
  [/^Choose a role for (.+)\.$/, m => `${m[1]} का काम चुनें।`],
  [/^Enter a price for (.+)\.$/, m => `${m[1]} का दाम डालें।`],
  [/^Give (.+) a PIN\.$/, m => `${m[1]} को PIN दें।`],
  [/^Only (.+) is left to pay\.$/, m => `सिर्फ़ ${m[1]} भुगतान बाकी है।`],
  [/^Table (.+) is listed twice\.$/, m => `टेबल ${m[1]} दो बार लिखी है।`],
  [/^There are two people called (.+)\. Use different names\.$/, m => `${m[1]} नाम के दो लोग हैं। अलग नाम लिखें।`],
  [/^(.+) has no guests to move\.$/, m => `${m[1]} पर कोई मेहमान नहीं है।`],
  [/^(.+) already has guests\. Join the bills instead\.$/, m => `${m[1]} पर पहले से मेहमान हैं। बिल जोड़ें।`],
  [/^Waiters can give up to (.+)% off\. Ask the owner for more\.$/, m => `वेटर ${m[1]}% तक छूट दे सकते हैं। ज़्यादा के लिए मालिक से पूछें।`],
  [/^No table called (.+)$/, m => `${m[1]} नाम की कोई टेबल नहीं है`],
];

function translate(message, lang) {
  if (lang !== 'hi' || !message) return message;
  if (EXACT[message]) return EXACT[message];
  for (const [re, fn] of PATTERNS) { const m = message.match(re); if (m) return fn(m); }
  return message;
}

module.exports = { translate };
