# CLAUDE.md

Notes for Claude (or any coding agent) working in this repository.

## What this is

A single-page luxury storefront. Static files only — no build step, no package
manager, no dependencies, no server. `index.html` opens and runs.

```bash
python3 -m http.server 8000   # localStorage is friendlier over HTTP than file://
```

There is nothing to install. If you find yourself adding a `package.json`,
a bundler, or a framework, stop and ask first — the no-build property is
deliberate and is most of what makes this repo pleasant to read.

## Layout and load order

Scripts are plain `<script>` tags in `index.html` and share one global scope.
Order matters:

```
js/products.js   catalogue + MAX_BUDGET     (defines PRODUCTS, CATEGORIES)
js/store.js      bag state, money, ceiling  (uses PRODUCTS; defines Bag, inr)
js/checkout.js   methods, validation, settle (uses Bag, inr; defines CO, METHODS)
js/app.js        rendering and event wiring  (uses everything above)
css/style.css    all visuals, including every animation
```

`app.js` is the only file that touches the DOM. Keep it that way: business
rules belong in `store.js` and `checkout.js` so they stay testable without a
browser.

## The four rules

**1. `MAX_BUDGET` is a hard ceiling, and it applies to the payable total.**
Not the subtotal — the total including shipping, levy and any cash-handling
fee. It is enforced in three places: `products.js` throws on load if a
catalogue item exceeds it, `Bag.add` / `Bag.setQty` refuse crossings, and the
review step re-checks before enabling the pay button. If you add a fourth
path into the bag, it enforces the ceiling too.

**2. `settle()` in `checkout.js` is the only payment seam.**
It resolves `{ ok:true, ref, amount }` or `{ ok:false, why }` after a fake
delay. Do not add a real gateway, an API key, or a network call anywhere in
this repo unless explicitly asked. If asked, replace the body of `settle()`
and nothing else — every caller upstream stays unchanged.

**3. Card data is validated locally and never leaves the page.**
Nothing card-shaped is written to `localStorage`. The only persisted key is
`aurum.bag.v1`, and it holds `{ id, qty }` pairs and nothing else. Do not
widen it. In a real deployment, card fields would go to the PSP's own SDK and
never touch application code at all — keep the code honest about that.

**4. Everything user-supplied is escaped before it reaches `innerHTML`.**
`app.js` builds markup with template strings, so `esc()` is the whole XSS
defence. Any new interpolation of a form value, a product name, or anything
read back from `localStorage` goes through `esc()`.

## Conventions

- Whole rupees, no paise. `inr()` formats; never hand-roll a `₹` string.
- Prices are integers. Percentages get `Math.round()` at the point of use.
- Validators return an object of `{ field: message }` and are pure — no DOM,
  no side effects. Empty object means valid.
- Product ids are `<category-letter><n>` (`t1`, `w2`, `h3`) and must be unique.
- `stock` is a positive integer; scarcity styling keys off `stock <= 2`.
- Two-space indent, single quotes, semicolons. Match the surrounding file.
- Comments explain *why* a rule exists, not what a line does. The existing
  ones are the model.

## Adding a product

Append to `PRODUCTS` in `js/products.js` with every field the neighbours have:
`id, cat, name, brand, price, blurb, detail, specs, tone, mark, stock`.
`cat` must be an existing `CATEGORIES` id. `price` must be under `MAX_BUDGET`
or the file throws on load — that throw is a feature, don't soften it.

Note `js/products.js` is marked `merge=union` in `.gitattributes`, so
concurrent appends merge rather than conflict. Re-read the file after a merge
to check nothing landed half-duplicated.

## Before you call it done

```bash
python3 tests/test_safety.py
```

Pure stdlib, no network, a couple of seconds. It reads the source and asserts
the four rules above still hold — ceiling arithmetic, no live gateway, no
secrets, no card persistence, no unescaped interpolation. If you changed
behaviour on purpose, update the test in the same commit and say so in the
message; don't delete the assertion.

Then click through it in a browser: add to bag, cross the ceiling, run a
card checkout and a COD checkout above ₹2,00,000. The animation sequence on
confirmation is easy to break from CSS and the test cannot see it.

## Things that are not bugs

- Prices, brands and pieces are invented. No trademark is implied.
- `GST_RATE` is an illustrative 3% levy, not real Indian tax treatment.
- The order number and payment reference are `Math.random()`. They are
  cosmetic; a real gateway supplies the reference.
- COD is refused above ₹2,00,000 by design, not by oversight.
