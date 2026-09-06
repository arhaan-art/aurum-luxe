/* Cart state, money formatting, persistence. */

const KEY = 'aurum.bag.v1';
const SHIPPING_FREE_OVER = 200000;
const SHIPPING_FLAT = 2500;
const GST_RATE = 0.03;          // luxury handling & levy, illustrative
const COD_FEE = 1500;
const COD_CEILING = 200000;     // cash on delivery is refused above this

const inr = n => '₹' + Math.round(n).toLocaleString('en-IN');
const byId = id => PRODUCTS.find(p => p.id === id);

const Bag = {
  items: load(),

  count(){ return this.items.reduce((n,l) => n + l.qty, 0); },

  subtotal(){ return this.items.reduce((n,l) => n + byId(l.id).price * l.qty, 0); },

  shipping(){
    if (!this.items.length) return 0;
    return this.subtotal() >= SHIPPING_FREE_OVER ? 0 : SHIPPING_FLAT;
  },

  levy(){ return Math.round(this.subtotal() * GST_RATE); },

  /* fee is method-dependent and supplied by checkout */
  total(fee = 0){
    if (!this.items.length) return 0;
    return this.subtotal() + this.shipping() + this.levy() + fee;
  },

  /* The store ceiling applies to the payable total, not just the line items. */
  overBudget(fee = 0){ return this.total(fee) > MAX_BUDGET; },
  headroom(fee = 0){ return MAX_BUDGET - this.total(fee); },

  /* Returns false when the addition would break the ceiling or the stock. */
  add(id, qty = 1){
    const p = byId(id);
    const line = this.items.find(l => l.id === id);
    const have = line ? line.qty : 0;
    if (have + qty > p.stock) return { ok:false, why:`Only ${p.stock} available.` };
    if (this.total() + p.price * qty > MAX_BUDGET)
      return { ok:false, why:`That would take the order past the ${inr(MAX_BUDGET)} ceiling.` };
    line ? line.qty += qty : this.items.push({ id, qty });
    save(this.items);
    return { ok:true };
  },

  setQty(id, qty){
    const line = this.items.find(l => l.id === id);
    if (!line) return { ok:false };
    if (qty <= 0) return this.remove(id);
    const p = byId(id);
    if (qty > p.stock) return { ok:false, why:`Only ${p.stock} available.` };
    const delta = (qty - line.qty) * p.price;
    if (delta > 0 && this.total() + delta > MAX_BUDGET)
      return { ok:false, why:`That would take the order past the ${inr(MAX_BUDGET)} ceiling.` };
    line.qty = qty;
    save(this.items);
    return { ok:true };
  },

  remove(id){
    this.items = this.items.filter(l => l.id !== id);
    save(this.items);
    return { ok:true };
  },

  clear(){ this.items = []; save(this.items); }
};

function load(){
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '[]');
    // drop anything that no longer exists in the catalogue
    return raw.filter(l => byId(l.id) && l.qty > 0)
              .map(l => ({ id:l.id, qty:Math.min(l.qty, byId(l.id).stock) }));
  } catch { return []; }
}

function save(items){
  try { localStorage.setItem(KEY, JSON.stringify(items)); } catch {}
}
