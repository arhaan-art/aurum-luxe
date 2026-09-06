/* Checkout: delivery → payment → review → processing → confirmation.
   NOTE: there is no payment gateway here on purpose. `settle()` is a local
   simulation with an artificial delay; wire a real PSP in at that one seam. */

const METHODS = [
  { id:'card', mark:'▭', name:'Credit / Debit Card',
    note:'Visa, Mastercard, Amex, RuPay · 3-D Secure', fee:0 },
  { id:'upi', mark:'◈', name:'UPI',
    note:'Pay from any UPI app · instant confirmation', fee:0 },
  { id:'netbanking', mark:'▤', name:'Net Banking',
    note:'All major Indian banks', fee:0 },
  { id:'emi', mark:'◫', name:'No-Cost EMI',
    note:'3, 6, 9 or 12 months on eligible cards', fee:0 },
  { id:'cod', mark:'◉', name:'Cash on Delivery',
    note:`Available on orders up to ${inr(COD_CEILING)} · ${inr(COD_FEE)} handling`, fee:COD_FEE }
];

const BANKS = ['HDFC Bank','ICICI Bank','State Bank of India','Axis Bank',
               'Kotak Mahindra Bank','IndusInd Bank','Yes Bank','IDFC First Bank'];

const CO = {
  step: 0,
  method: 'card',
  emiMonths: 6,
  form: {},
  order: null
};

const feeFor = m => (METHODS.find(x => x.id === m) || {}).fee || 0;
const codBlocked = () => Bag.subtotal() > COD_CEILING;

/* ── validation ─────────────────────────────────────────────────────── */
const digits = s => (s || '').replace(/\D/g, '');

function validateDelivery(f){
  const e = {};
  if (!f.name || f.name.trim().length < 2) e.name = 'Please enter your full name.';
  if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(f.email || '')) e.email = 'Enter a valid email address.';
  if (digits(f.phone).length !== 10) e.phone = 'Enter a 10-digit mobile number.';
  if (!f.address || f.address.trim().length < 8) e.address = 'Enter the full street address.';
  if (!f.city || f.city.trim().length < 2) e.city = 'Enter a city.';
  if (!f.state) e.state = 'Select a state.';
  if (digits(f.pin).length !== 6) e.pin = 'Enter a 6-digit PIN code.';
  return e;
}

function validatePayment(f, m){
  const e = {};
  if (m === 'card' || m === 'emi'){
    const num = digits(f.cardNum);
    if (num.length < 15 || num.length > 16) e.cardNum = 'Enter a 15 or 16-digit card number.';
    else if (!luhn(num)) e.cardNum = 'That card number fails its checksum.';
    if (!f.cardName || f.cardName.trim().length < 2) e.cardName = 'Enter the name on the card.';
    if (!/^(0[1-9]|1[0-2])\s*\/\s*\d{2}$/.test(f.cardExp || '')) e.cardExp = 'Use MM/YY.';
    else if (expired(f.cardExp)) e.cardExp = 'That card has expired.';
    if (digits(f.cardCvv).length < 3) e.cardCvv = 'Enter the CVV.';
  }
  if (m === 'upi'){
    if (!/^[\w.\-]{2,}@[a-z]{2,}$/i.test((f.upi || '').trim())) e.upi = 'Enter a valid UPI ID, e.g. name@bank.';
  }
  if (m === 'netbanking' && !f.bank) e.bank = 'Choose your bank.';
  if (m === 'cod'){
    if (codBlocked()) e.cod = `Cash on delivery is not available above ${inr(COD_CEILING)}.`;
  }
  return e;
}

/* Luhn checksum — the one real bit of card logic; a gateway does the rest. */
function luhn(num){
  let sum = 0, alt = false;
  for (let i = num.length - 1; i >= 0; i--){
    let d = +num[i];
    if (alt){ d *= 2; if (d > 9) d -= 9; }
    sum += d; alt = !alt;
  }
  return sum % 10 === 0;
}

function expired(mmyy){
  const [mm, yy] = mmyy.split('/').map(s => +s.trim());
  const end = new Date(2000 + yy, mm, 0, 23, 59, 59);
  return end < new Date();
}

/* ── the gateway seam ───────────────────────────────────────────────── */
/* Replace the body of this function with a real PSP call. It must resolve
   to { ok:true, ref } or { ok:false, why }. Everything upstream is unchanged. */
function settle({ method, amount }){
  return new Promise(resolve => {
    setTimeout(() => {
      resolve({ ok:true, ref: reference(method), amount });
    }, 2600);
  });
}

function reference(method){
  const p = { card:'CRD', upi:'UPI', netbanking:'NB', emi:'EMI', cod:'COD' }[method] || 'TXN';
  return p + '-' + Math.random().toString(36).slice(2, 8).toUpperCase()
           + '-' + Date.now().toString(36).slice(-4).toUpperCase();
}

function orderNumber(){
  return 'AL' + new Date().getFullYear() +
         Math.floor(100000 + Math.random() * 900000);
}

function deliveryWindow(){
  const from = new Date(Date.now() + 3 * 864e5);
  const to   = new Date(Date.now() + 6 * 864e5);
  const f = d => d.toLocaleDateString('en-IN', { day:'numeric', month:'short' });
  return `${f(from)} – ${f(to)}`;
}
