# Aurum Luxe

A luxury storefront — technology, horology, tailoring, leather, audio, jewellery and
objets — with a full checkout flow, five payment methods, and an animated order
confirmation. Every piece, and every order total, is held under a **₹10,00,000** ceiling.

No build step, no dependencies. Open `index.html` and it runs.

## Running it

```bash
python3 -m http.server 8000
# then visit http://localhost:8000
```

(Opening the file directly works too, though `localStorage` is friendlier over HTTP.)

## What's here

**Catalogue** — 23 pieces across 8 categories, filterable, each with a detail view
carrying specifications and stock. Scarcity is marked on the last one or two of a line.

**Bag** — quantity control bounded by stock, persisted to `localStorage`, with a live
meter showing how much of the ₹10,00,000 ceiling remains.

**Checkout** — three steps (delivery → payment → review), each validated before it
will advance:

| Method | Collected | Validation |
|---|---|---|
| Credit / Debit Card | number, name, expiry, CVV | Luhn checksum, expiry date |
| UPI | UPI ID | `name@bank` shape |
| Net Banking | bank | selection required |
| No-Cost EMI | card + tenure (3/6/9/12) | as card, plus per-month split |
| Cash on Delivery | — | refused above ₹2,00,000; ₹1,500 handling |

**Confirmation** — a processing sequence with staged status messages, then the order
seal draws itself, a burst of gold sparks fires, and the receipt rises into place with
order number, payment reference, pieces, delivery window and total.

## The budget ceiling

`MAX_BUDGET` in `js/products.js` is enforced in three places: no catalogue item may
exceed it (the file throws on load if one does), no addition to the bag may cross it,
and the review step re-checks the *payable* total — including delivery, levy and any
cash-handling fee — before the pay button will enable.

## Adding a real payment gateway

There is deliberately no gateway here. One function is the seam —
`settle()` in `js/checkout.js`:

```js
function settle({ method, amount }) {
  // → resolve({ ok: true, ref })  or  resolve({ ok: false, why })
}
```

Today it waits 2.6 seconds and resolves successfully. Replace its body with a call to
Razorpay, Stripe, Cashfree or whichever PSP you're wiring in; return the same shape and
nothing upstream changes. Card details are validated in the browser and never stored or
transmitted — with a real gateway they should go straight to the PSP's own SDK and never
touch your handler at all.

## Layout

```
index.html          markup and overlay shells
css/style.css       everything visual, including all animation
js/products.js      catalogue and MAX_BUDGET
js/store.js         bag state, money formatting, ceiling arithmetic
js/checkout.js      payment methods, validation, the settle() seam
js/app.js           rendering and event wiring
```

## Notes

A demonstration storefront. Brands, pieces and prices are invented; no payment is
processed and no order is dispatched.
