/* Rendering and wiring. */

const $  = s => document.querySelector(s);
const el = id => document.getElementById(id);

const STATES = ['Andhra Pradesh','Assam','Bihar','Chhattisgarh','Delhi','Goa','Gujarat',
  'Haryana','Himachal Pradesh','Jharkhand','Karnataka','Kerala','Madhya Pradesh',
  'Maharashtra','Odisha','Punjab','Rajasthan','Tamil Nadu','Telangana','Uttar Pradesh',
  'Uttarakhand','West Bengal'];

const esc = s => String(s).replace(/[&<>"']/g, c =>
  ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));

let filter = 'all';

/* Scarcity copy. One source of truth so the card, the product view and the bag
   never disagree about how urgent a piece is. Keys off the same stock <= 2
   threshold the styling uses. */
const LOW_STOCK = 2;
const isScarce = p => p.stock <= LOW_STOCK;
const scarceTag = p => p.stock === 1 ? 'Last piece' : `Only ${p.stock} left`;
const scarceLine = p => p.stock === 1
  ? 'Hurry — only 1 left in stock!'
  : `Hurry — only ${p.stock} left in stock!`;


/* ── shells ──────────────────────────────────────────────────────────── */
const shot = (p, cls = '') => `
  <div class="shot ${cls}" style="background:linear-gradient(150deg,${p.tone[1]},${p.tone[0]})">
    <span class="mark">${p.mark}</span>
  </div>`;

function toast(msg){
  const t = el('toast');
  t.textContent = msg;
  t.classList.add('on');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove('on'), 2600);
}

/* ── catalogue ───────────────────────────────────────────────────────── */
function renderNav(){
  el('nav').innerHTML = CATEGORIES.map(c =>
    `<button data-cat="${c.id}" class="${c.id === filter ? 'on' : ''}">${c.label}</button>`).join('');
  el('filters').innerHTML = CATEGORIES.map(c =>
    `<button class="chip ${c.id === filter ? 'on' : ''}" data-cat="${c.id}">${c.label}</button>`).join('');
}

function renderGrid(){
  const list = PRODUCTS.filter(p => filter === 'all' || p.cat === filter);
  const g = el('grid');
  if (!list.length){ g.innerHTML = `<p class="empty">Nothing in this room just yet.</p>`; return; }
  g.innerHTML = list.map((p, i) => {
    const inBag = Bag.items.find(l => l.id === p.id);
    const gone  = inBag && inBag.qty >= p.stock;
    return `
    <article class="card" data-open="${p.id}" style="animation-delay:${Math.min(i,10)*45}ms">
      ${shot(p)}
      ${isScarce(p) ? `<span class="tag rare">${scarceTag(p)}</span>` : ''}
      <div class="body">
        <span class="brand">${esc(p.brand)}</span>
        <h3>${esc(p.name)}</h3>
        <p class="blurb">${esc(p.blurb)}</p>
        ${isScarce(p) ? `<p class="hurry">${scarceLine(p)}</p>` : ''}
        <div class="row">
          <span class="price">${inr(p.price)}</span>
          <button class="add" data-add="${p.id}" ${gone ? 'disabled' : ''}>
            ${gone ? 'In bag' : 'Add'}
          </button>
        </div>
      </div>
    </article>`;
  }).join('');
}

/* ── product view ────────────────────────────────────────────────────── */
function openProduct(id){
  const p = byId(id);
  const inBag = Bag.items.find(l => l.id === p.id);
  const gone  = inBag && inBag.qty >= p.stock;
  el('pSheet').innerHTML = `
    <div class="pv">
      ${shot(p)}
      <div class="pv-info">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px">
          <span class="brand">${esc(p.brand)}</span>
          <button class="x" data-close-p aria-label="Close">&times;</button>
        </div>
        <h2>${esc(p.name)}</h2>
        <p class="detail">${esc(p.detail)}</p>
        <dl style="margin:0">
          ${Object.entries(p.specs).map(([k, v]) =>
            `<div class="spec"><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}
          <div class="spec"><dt>Availability</dt><dd>${p.stock} in stock</dd></div>
        </dl>
        ${isScarce(p) ? `<p class="hurry hurry-lg">${scarceLine(p)}</p>` : ''}
        <div class="pv-buy">
          <span class="price">${inr(p.price)}</span>
          <button class="btn" style="width:auto;padding:14px 34px;margin:0"
                  data-add="${p.id}" ${gone ? 'disabled' : ''}>
            ${gone ? 'In your bag' : 'Add to bag'}
          </button>
        </div>
      </div>
    </div>`;
  show(el('pModal'));
}

/* ── bag ─────────────────────────────────────────────────────────────── */
function renderBag(){
  const body = el('cartBody'), foot = el('cartFoot');
  const n = Bag.count();

  const pip = el('pip');
  pip.textContent = n;
  pip.classList.toggle('show', n > 0);

  if (!n){
    body.innerHTML = `<div class="blank"><span class="mk">◇</span>
      Your bag is empty.<br>Every piece here is made in small numbers.</div>`;
    foot.innerHTML = `<button class="btn ghost" data-close-cart>Continue browsing</button>`;
    return;
  }

  body.innerHTML = Bag.items.map((l, i) => {
    const p = byId(l.id);
    return `
    <div class="line" data-line="${p.id}" style="animation-delay:${i*50}ms">
      <div class="thumb" style="background:linear-gradient(150deg,${p.tone[1]},${p.tone[0]})">${p.mark}</div>
      <div class="line-mid">
        <span class="brand">${esc(p.brand)}</span>
        <h4>${esc(p.name)}</h4>
        <div class="qty">
          <button data-dec="${p.id}" aria-label="Fewer">−</button>
          <span>${l.qty}</span>
          <button data-inc="${p.id}" aria-label="More" ${l.qty >= p.stock ? 'disabled' : ''}>+</button>
        </div>
      </div>
      <div class="line-end">
        <span class="p">${inr(p.price * l.qty)}</span>
        <button class="rm" data-rm="${p.id}">Remove</button>
      </div>
    </div>`;
  }).join('');

  const total = Bag.total();
  const pct = Math.min(100, total / MAX_BUDGET * 100);
  foot.innerHTML = `
    <div class="tot"><span>Subtotal</span><span>${inr(Bag.subtotal())}</span></div>
    <div class="tot"><span>Insured delivery</span><span>${Bag.shipping() ? inr(Bag.shipping()) : 'Complimentary'}</span></div>
    <div class="tot"><span>Levy &amp; handling</span><span>${inr(Bag.levy())}</span></div>
    <div class="tot grand"><span>Total</span><span>${inr(total)}</span></div>
    <div class="meter">
      <div class="lab"><span>Order ceiling</span><span>${inr(Bag.headroom())} left</span></div>
      <div class="bar"><i style="width:${pct}%" class="${pct > 85 ? 'hot' : ''}"></i></div>
    </div>
    <button class="btn" id="toCheckout">Proceed to checkout</button>`;
}

/* ── checkout ────────────────────────────────────────────────────────── */
function openCheckout(){
  if (!Bag.count()) return;
  CO.step = 0; CO.order = null;
  if (CO.method === 'cod' && codBlocked()) CO.method = 'card';
  closeDrawer();
  renderCheckout();
  show(el('coModal'));
}

function renderCheckout(){
  const f = CO.form, fee = feeFor(CO.method);
  const stepName = ['Delivery','Payment','Review'];
  el('coSheet').innerHTML = `
    <div class="co">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px">
        <div>
          <p class="eyebrow">Secure checkout</p>
          <h2 style="font-size:32px;margin-top:6px">Complete your order</h2>
        </div>
        <button class="x" data-close-co aria-label="Close">&times;</button>
      </div>

      <div class="steps">
        ${stepName.map((s, i) =>
          `<div class="step ${i === CO.step ? 'on' : ''} ${i < CO.step ? 'done' : ''}">${i+1}. ${s}</div>`).join('')}
      </div>

      <!-- 1. delivery -->
      <div class="pane ${CO.step === 0 ? 'on' : ''}">
        <div class="fields">
          ${field('name','Full name','text',f.name,'wide')}
          ${field('email','Email','email',f.email)}
          ${field('phone','Mobile','tel',f.phone)}
          ${field('address','Address','text',f.address,'wide')}
          ${field('city','City','text',f.city)}
          <div class="f">
            <label for="co-state">State</label>
            <select id="co-state" data-k="state">
              <option value="">Select…</option>
              ${STATES.map(s => `<option ${f.state === s ? 'selected' : ''}>${s}</option>`).join('')}
            </select>
            <span class="err" data-err="state"></span>
          </div>
          ${field('pin','PIN code','text',f.pin)}
          <div class="f wide">
            <label for="co-notes">Delivery notes <span style="text-transform:none;letter-spacing:0">(optional)</span></label>
            <input id="co-notes" data-k="notes" type="text" value="${esc(f.notes || '')}"
                   placeholder="Concierge desk, preferred hours…">
          </div>
        </div>
        <div class="acts">
          <button class="btn ghost" data-close-co>Back to bag</button>
          <button class="btn" data-next="0">Continue to payment</button>
        </div>
      </div>

      <!-- 2. payment -->
      <div class="pane ${CO.step === 1 ? 'on' : ''}">
        <div class="pays">${METHODS.map(m => payCard(m, f)).join('')}</div>
        <span class="err" data-err="cod"></span>
        <div class="note">
          This storefront runs no payment gateway. Nothing is charged and no card
          details leave this page — they are validated in the browser and discarded.
        </div>
        <div class="acts">
          <button class="btn ghost" data-back="1">Back</button>
          <button class="btn" data-next="1">Review order</button>
        </div>
      </div>

      <!-- 3. review -->
      <div class="pane ${CO.step === 2 ? 'on' : ''}">
        ${CO.step === 2 ? reviewPane(fee) : ''}
      </div>

      <!-- processing -->
      <div class="pane ${CO.step === 3 ? 'on' : ''}">
        <div class="proc">
          <div class="ring"></div>
          <h3>Confirming your order</h3>
          <p id="procMsg">Contacting your bank…</p>
          <div class="dots" id="procDots"><i></i><i></i><i></i><i></i></div>
        </div>
      </div>

      <!-- done -->
      <div class="pane ${CO.step === 4 ? 'on' : ''}" id="donePane">
        ${CO.step === 4 ? donePane() : ''}
      </div>
    </div>`;
}

function field(k, label, type, val, extra = ''){
  return `<div class="f ${extra}">
    <label for="co-${k}">${label}</label>
    <input id="co-${k}" data-k="${k}" type="${type}" value="${esc(val || '')}">
    <span class="err" data-err="${k}"></span>
  </div>`;
}

function payCard(m, f){
  const on = CO.method === m.id;
  const disabled = m.id === 'cod' && codBlocked();
  let extra = '';
  if (m.id === 'card' || m.id === 'emi'){
    extra = `<div class="pay-x">
      ${m.id === 'emi' ? `<div class="f" style="margin-bottom:14px">
        <label>Tenure</label>
        <select data-k="emiMonths">
          ${[3,6,9,12].map(n => `<option value="${n}" ${CO.emiMonths === n ? 'selected' : ''}>
             ${n} months · ${inr(Bag.total() / n)} per month</option>`).join('')}
        </select></div>` : ''}
      <div class="fields">
        ${field('cardNum','Card number','text',f.cardNum,'wide')}
        ${field('cardName','Name on card','text',f.cardName,'wide')}
        ${field('cardExp','Expiry (MM/YY)','text',f.cardExp)}
        ${field('cardCvv','CVV','password',f.cardCvv)}
      </div></div>`;
  }
  if (m.id === 'upi'){
    extra = `<div class="pay-x"><div class="fields">
      ${field('upi','UPI ID','text',f.upi,'wide')}</div></div>`;
  }
  if (m.id === 'netbanking'){
    extra = `<div class="pay-x"><div class="f">
      <label for="co-bank">Bank</label>
      <select id="co-bank" data-k="bank">
        <option value="">Select your bank…</option>
        ${BANKS.map(b => `<option ${f.bank === b ? 'selected' : ''}>${b}</option>`).join('')}
      </select>
      <span class="err" data-err="bank"></span></div></div>`;
  }
  if (m.id === 'cod'){
    extra = `<div class="pay-x"><p style="font-size:12.5px;color:var(--fg-dim);margin:0">
      Pay the courier on handover. A ${inr(COD_FEE)} handling charge applies and
      the piece is opened in your presence before payment.</p></div>`;
  }
  return `
  <label class="pay ${on ? 'on' : ''}" style="${disabled ? 'opacity:.4;cursor:not-allowed' : ''}">
    <input type="radio" name="pm" value="${m.id}" ${on ? 'checked' : ''} ${disabled ? 'disabled' : ''}>
    <span class="mk">${m.mark}</span>
    <span class="pay-t">
      <b>${m.name}${m.fee ? ` · +${inr(m.fee)}` : ''}</b>
      <small>${disabled ? `Unavailable above ${inr(COD_CEILING)}` : m.note}</small>
      ${extra}
    </span>
  </label>`;
}

function reviewPane(fee){
  const f = CO.form;
  const m = METHODS.find(x => x.id === CO.method);
  let how = m.name;
  if (CO.method === 'card' || CO.method === 'emi')
    how += ` ···· ${digits(f.cardNum).slice(-4)}`;
  if (CO.method === 'upi') how += ` · ${esc(f.upi)}`;
  if (CO.method === 'netbanking') how += ` · ${esc(f.bank)}`;
  if (CO.method === 'emi') how += ` · ${CO.emiMonths} months`;
  const total = Bag.total(fee);
  const over = Bag.overBudget(fee);

  return `
    <div class="summary">
      ${Bag.items.map(l => {
        const p = byId(l.id);
        return `<div class="sl"><span>${esc(p.name)} × ${l.qty}</span><span>${inr(p.price * l.qty)}</span></div>`;
      }).join('')}
      <div class="sl"><span>Insured delivery</span><span>${Bag.shipping() ? inr(Bag.shipping()) : 'Complimentary'}</span></div>
      <div class="sl"><span>Levy &amp; handling</span><span>${inr(Bag.levy())}</span></div>
      ${fee ? `<div class="sl"><span>Cash handling</span><span>${inr(fee)}</span></div>` : ''}
      <div class="sl big"><span>Payable</span><span>${inr(total)}</span></div>
    </div>
    <div class="fields">
      <div class="f wide">
        <label>Delivering to</label>
        <div style="font-size:14px;color:var(--fg-dim);line-height:1.7">
          <b style="color:var(--fg)">${esc(f.name)}</b><br>
          ${esc(f.address)}, ${esc(f.city)}, ${esc(f.state)} ${esc(f.pin)}<br>
          ${esc(f.phone)} · ${esc(f.email)}
          ${f.notes ? `<br><i>${esc(f.notes)}</i>` : ''}
        </div>
      </div>
      <div class="f wide">
        <label>Paying by</label>
        <div style="font-size:14px">${how}</div>
      </div>
    </div>
    ${over ? `<p class="over on">This order comes to ${inr(total)}, past the
      ${inr(MAX_BUDGET)} ceiling. Remove a piece or change the payment method.</p>` : ''}
    <div class="acts">
      <button class="btn ghost" data-back="2">Back</button>
      <button class="btn" id="payNow" ${over ? 'disabled' : ''}>
        ${CO.method === 'cod' ? `Place order · ${inr(total)} on delivery` : `Pay ${inr(total)}`}
      </button>
    </div>`;
}

function donePane(){
  const o = CO.order;
  return `
    <div class="done" id="doneBox">
      <div class="seal">
        <svg viewBox="0 0 100 100" aria-hidden="true">
          <circle class="c" cx="50" cy="50" r="47"></circle>
          <path class="t" d="M30 51 L44 65 L71 36"></path>
        </svg>
      </div>
      <h2>Order confirmed</h2>
      <p class="sub">${o.method === 'cod'
        ? 'Reserved for you. Payment is collected at handover.'
        : 'Payment received. Your pieces are being prepared for dispatch.'}
        A confirmation is on its way to ${esc(o.email)}.</p>
      <div class="receipt">
        <div class="rl"><span>Order</span><span>${o.number}</span></div>
        <div class="rl"><span>Reference</span><span>${o.ref}</span></div>
        <div class="rl"><span>Method</span><span>${esc(o.methodLabel)}</span></div>
        <div class="rl"><span>Status</span><span style="color:var(--ok)">
          ${o.method === 'cod' ? 'Confirmed · pay on delivery' : 'Paid'}</span></div>
        <div class="rl"><span>Pieces</span><span>${o.lines.map(esc).join('<br>')}</span></div>
        <div class="rl"><span>Delivery</span><span>${o.window}</span></div>
        <div class="rl tot"><span>${o.method === 'cod' ? 'Due on delivery' : 'Paid'}</span><span>${inr(o.total)}</span></div>
      </div>
      <button class="btn" data-close-co>Continue browsing</button>
    </div>`;
}

/* ── the payment run ─────────────────────────────────────────────────── */
async function runPayment(){
  const fee = feeFor(CO.method);
  if (Bag.overBudget(fee)) return;

  const stages = CO.method === 'cod'
    ? ['Reserving your pieces…','Verifying the delivery address…','Assigning a courier…','Confirming the order…']
    : ['Contacting your bank…','Authenticating…','Authorising the payment…','Confirming the order…'];

  const snapshot = {
    total: Bag.total(fee),
    lines: Bag.items.map(l => `${byId(l.id).name} × ${l.qty}`),
    email: CO.form.email,
    method: CO.method,
    methodLabel: METHODS.find(m => m.id === CO.method).name +
      (CO.method === 'emi' ? ` · ${CO.emiMonths} months` : '')
  };

  CO.step = 3;
  renderCheckout();

  const msg = el('procMsg'), dots = [...el('procDots').children];
  let i = 0;
  const tick = setInterval(() => {
    if (i < stages.length){
      msg.textContent = stages[i];
      dots.forEach((d, k) => d.classList.toggle('on', k <= i));
      i++;
    }
  }, 620);

  const res = await settle({ method: CO.method, amount: snapshot.total });
  clearInterval(tick);

  if (!res.ok){
    CO.step = 2; renderCheckout();
    toast(res.why || 'That payment did not go through. Please try again.');
    return;
  }

  CO.order = { ...snapshot, number: orderNumber(), ref: res.ref, window: deliveryWindow() };
  Bag.clear();
  renderBag(); renderGrid();
  CO.step = 4;
  renderCheckout();
  celebrate();
}

/* Gold sparks radiating from the seal. */
function celebrate(){
  const box = el('doneBox');
  if (!box || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  setTimeout(() => {
    for (let i = 0; i < 46; i++){
      const s = document.createElement('span');
      s.className = 'spark';
      const a = Math.random() * Math.PI * 2;
      const d = 120 + Math.random() * 300;
      s.style.setProperty('--dx', `${Math.cos(a) * d}px`);
      s.style.setProperty('--dy', `${Math.sin(a) * d - 60}px`);
      s.style.setProperty('--r', `${Math.random() * 720 - 360}deg`);
      s.style.left = '50%';
      s.style.top = '86px';
      if (i % 3 === 0) s.style.background = 'var(--fg)';
      if (i % 5 === 0){ s.style.width = '3px'; s.style.height = '9px'; }
      s.style.animationDelay = `${Math.random() * 320}ms`;
      box.appendChild(s);
      requestAnimationFrame(() => s.classList.add('go'));
      setTimeout(() => s.remove(), 2200);
    }
  }, 780);
}

/* ── overlay plumbing ────────────────────────────────────────────────── */
function show(node){
  node.classList.add('on');
  el('scrim').classList.add('on');
  document.body.classList.add('locked');
}
function hideAll(){
  ['pModal','coModal','drawer','scrim'].forEach(id => el(id).classList.remove('on'));
  document.body.classList.remove('locked');
}
function openDrawer(){ renderBag(); show(el('drawer')); }
function closeDrawer(){ el('drawer').classList.remove('on'); }

/* ── events ──────────────────────────────────────────────────────────── */
document.addEventListener('click', e => {
  const t = e.target;

  const cat = t.closest('[data-cat]');
  if (cat){ filter = cat.dataset.cat; renderNav(); renderGrid(); return; }

  const add = t.closest('[data-add]');
  if (add){
    e.stopPropagation();
    const r = Bag.add(add.dataset.add);
    if (!r.ok){ toast(r.why); return; }
    renderBag(); renderGrid();
    const pip = el('pip');
    pip.classList.remove('bump'); void pip.offsetWidth; pip.classList.add('bump');
    toast(`${byId(add.dataset.add).name} added to your bag.`);
    if (el('pModal').classList.contains('on')) openProduct(add.dataset.add);
    return;
  }

  const card = t.closest('[data-open]');
  if (card){ openProduct(card.dataset.open); return; }

  const inc = t.closest('[data-inc]'), dec = t.closest('[data-dec]'), rm = t.closest('[data-rm]');
  if (inc || dec){
    const id = (inc || dec).dataset[inc ? 'inc' : 'dec'];
    const line = Bag.items.find(l => l.id === id);
    const r = Bag.setQty(id, line.qty + (inc ? 1 : -1));
    if (!r.ok && r.why) toast(r.why);
    renderBag(); renderGrid(); return;
  }
  if (rm){
    const node = rm.closest('.line');
    node.classList.add('leaving');
    setTimeout(() => { Bag.remove(rm.dataset.rm); renderBag(); renderGrid(); }, 260);
    return;
  }

  if (t.closest('#cartBtn')) return openDrawer();
  if (t.closest('#closeCart') || t.closest('[data-close-cart]')) return hideAll();
  if (t.closest('[data-close-p]')) return hideAll();
  if (t.closest('[data-close-co]')) return hideAll();
  if (t.closest('#toCheckout')) return openCheckout();
  if (t.closest('#payNow')) return runPayment();

  const next = t.closest('[data-next]');
  if (next){
    const s = +next.dataset.next;
    const errs = s === 0 ? validateDelivery(CO.form) : validatePayment(CO.form, CO.method);
    paintErrors(errs);
    if (Object.keys(errs).length){ toast('Please correct the highlighted fields.'); return; }
    CO.step = s + 1; renderCheckout(); return;
  }
  const back = t.closest('[data-back]');
  if (back){ CO.step = +back.dataset.back - 1; renderCheckout(); return; }

  // backdrop dismiss — never while a payment is in flight
  if ((t.id === 'scrim' || t.classList.contains('modal')) && CO.step !== 3) hideAll();
});

function paintErrors(errs){
  document.querySelectorAll('[data-err]').forEach(n => n.textContent = '');
  document.querySelectorAll('[data-k]').forEach(n => n.classList.remove('bad'));
  Object.entries(errs).forEach(([k, msg]) => {
    const slot = document.querySelector(`[data-err="${k}"]`);
    if (slot) slot.textContent = msg;
    const inp = document.querySelector(`[data-k="${k}"]`);
    if (inp) inp.classList.add('bad');
  });
}

/* keep the form in sync without re-rendering on every keystroke */
document.addEventListener('input', e => {
  const k = e.target.dataset.k;
  if (!k) return;
  if (k === 'cardNum')
    e.target.value = digits(e.target.value).slice(0,16).replace(/(.{4})/g,'$1 ').trim();
  if (k === 'cardExp'){
    const d = digits(e.target.value).slice(0,4);
    e.target.value = d.length > 2 ? `${d.slice(0,2)}/${d.slice(2)}` : d;
  }
  if (k === 'cardCvv') e.target.value = digits(e.target.value).slice(0,4);
  if (k === 'phone')   e.target.value = digits(e.target.value).slice(0,10);
  if (k === 'pin')     e.target.value = digits(e.target.value).slice(0,6);
  if (k === 'emiMonths'){ CO.emiMonths = +e.target.value; return; }
  CO.form[k] = e.target.value;
});

document.addEventListener('change', e => {
  if (e.target.name === 'pm'){
    CO.method = e.target.value;
    renderCheckout();
  }
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && CO.step !== 3) hideAll();
});

/* ── boot ────────────────────────────────────────────────────────────── */
el('capLabel').textContent = inr(MAX_BUDGET);
renderNav();
renderGrid();
renderBag();
