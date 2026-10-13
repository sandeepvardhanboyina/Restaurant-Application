import React, { useEffect, useRef, useState } from 'react';
import { ArrowRight, Check, Clock3, Leaf, Minus, Plus, Search, ShoppingBag, Sparkles, Trash2 } from 'lucide-react';
import { api, money, newRequestId } from '../api';

function readCart() {
  try {
    const saved = JSON.parse(localStorage.getItem('gather-cart') || '[]');
    return Array.isArray(saved) ? saved.filter(x => Number.isInteger(x.id) && Number.isInteger(x.quantity) && x.quantity > 0 && x.quantity <= 20).slice(0, 30) : [];
  } catch { return []; }
}

export default function Menu({ onPlaced, active }) {
  const [menu, setMenu] = useState([]);
  const [categories, setCategories] = useState([]);
  const [category, setCategory] = useState(0);
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState(readCart);
  const [table, setTable] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [checkoutError, setCheckoutError] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState('');
  const inFlight = useRef(false);
  const checkout = useRef(null);

  async function load() {
    setError('');
    try {
      const [items, groups] = await Promise.all([api('/menu'), api('/categories')]);
      setMenu(items); setCategories(groups);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }
  useEffect(() => { if (active) load(); }, [active]);
  useEffect(() => { localStorage.setItem('gather-cart', JSON.stringify(cart)); }, [cart]);
  useEffect(() => { if (toast) { const timer = setTimeout(() => setToast(''), 2200); return () => clearTimeout(timer); } }, [toast]);

  function change(item, delta) {
    if (inFlight.current) return;
    setCheckoutError('');
    setCart(current => {
      const existing = current.find(x => x.id === item.id);
      if (!existing && delta > 0) return [...current, { id: item.id, quantity: 1 }];
      return current.map(x => x.id === item.id ? { ...x, quantity: Math.min(20, x.quantity + delta) } : x).filter(x => x.quantity > 0);
    });
    if (delta > 0) setToast(`${item.name} added to your order`);
  }
  const lines = cart.map(line => ({ ...line, dish: menu.find(x => x.id === line.id) }));
  const invalid = lines.some(line => !line.dish || !line.dish.available);
  const total = lines.reduce((sum, line) => sum + Math.round(Number(line.dish?.price || 0) * 100) * line.quantity, 0) / 100;
  const count = cart.reduce((sum, line) => sum + line.quantity, 0);
  const visible = menu.filter(item => (!category || item.category_id === category) && `${item.name} ${item.description}`.toLowerCase().includes(search.toLowerCase()));

  async function place(event) {
    event.preventDefault();
    if (inFlight.current || !cart.length) return;
    inFlight.current = true; setSubmitting(true); setCheckoutError('');
    try {
      const data = { table_number: Number(table), notes, items: cart.map(x => ({ menu_item_id: x.id, quantity: x.quantity })) };
      const signature = JSON.stringify(data);
      // Preserve the key across network retries/reloads to avoid duplicate orders.
      let pending;
      try { pending = JSON.parse(localStorage.getItem('gather-checkout') || 'null'); } catch { pending = null; }
      if (!pending || pending.signature !== signature) pending = { signature, id: newRequestId() };
      localStorage.setItem('gather-checkout', JSON.stringify(pending));
      const order = await api('/orders', { method: 'POST', body: JSON.stringify({ ...data, request_id: pending.id }) });
      setCart([]); setNotes(''); localStorage.removeItem('gather-checkout'); onPlaced(order);
    } catch (e) { setCheckoutError(e.message); await load(); }
    finally { inFlight.current = false; setSubmitting(false); }
  }

  return <>
    <section className="hero">
      <div className="hero-copy"><div className="eyebrow"><span /> FROM OUR KITCHEN, WITH LOVE</div>
        <h1>Pull up a chair.<br />Find your <em>favorite.</em></h1>
        <p>Seasonal ingredients. Comforting classics. A menu made<br className="desktop-break" /> for the moments worth slowing down for.</p>
        <div className="hero-notes"><span><Leaf size={16} /> Fresh ingredients</span><span><Clock3 size={16} /> Made to order</span></div>
      </div>
      <div className="hero-art" aria-hidden="true"><div className="orbit orbit-one" /><div className="orbit orbit-two" />
        <div className="herb herb-one">✳</div><div className="herb herb-two">✳</div>
        <div className="plate"><div className="plate-inner"><span>🥗</span></div></div>
        <div className="fresh-stamp"><Leaf size={22} /><span>Fresh feels<br /><strong>good.</strong></span></div>
        <div className="art-caption"><Sparkles size={16} /> Simple ingredients. Something special.</div>
      </div>
    </section>
    <section className="menu-layout">
      <div className="menu-main">
        <div className="section-heading"><div><div className="eyebrow">A LITTLE OF WHAT YOU LOVE</div><h2>On the menu</h2></div><span className="item-count">{menu.length} dishes to discover</span></div>
        <div className="menu-toolbar"><div className="categories" aria-label="Food categories">
          {[{ id: 0, name: 'All dishes' }, ...categories].map(c => <button key={c.id} className={category === c.id ? 'selected' : ''} onClick={() => setCategory(c.id)}>{c.name}</button>)}
        </div><label className="search"><Search size={17} /><input aria-label="Search menu" placeholder="Find something delicious…" value={search} onChange={e => setSearch(e.target.value)} /></label></div>
        {error && <div className="error" role="alert">{error} <button onClick={load}>Retry</button></div>}
        {loading ? <div className="empty">Bringing the menu to your table…</div> : <div className="dish-grid">
          {visible.map((item, index) => <article className="dish-card" key={item.id}>
            <div className={`dish-art tone-${index % 4}`}><span aria-hidden="true">{item.icon}</span>{item.vegetarian && <span className="veg-tag"><Leaf size={12} /> Vegetarian</span>}{!item.available && <span className="sold-out">Sold out today</span>}</div>
            <div className="dish-details"><span className="dish-category">{categories.find(c => c.id === item.category_id)?.name}</span><h3>{item.name}</h3><p>{item.description}</p>
              <div className="dish-bottom"><strong>{money(item.price)}</strong><button className="add-button" disabled={!item.available || submitting || (cart.find(x => x.id === item.id)?.quantity || 0) >= 20} onClick={() => change(item, 1)} aria-label={`Add ${item.name}`}><Plus size={16} /> Add</button></div>
            </div>
          </article>)}
        </div>}
        {!loading && !visible.length && !error && <div className="empty">No dishes found. Try another category or search.</div>}
      </div>
      <aside className="cart" ref={checkout}>
        <div className="cart-heading"><h2><ShoppingBag size={21} /> Your order</h2><span className="count-pill">{count}</span></div>
        <p className="cart-subtitle">Good things are on their way.</p>
        {!cart.length ? <div className="empty-cart"><span><ShoppingBag size={32} strokeWidth={1.3} /></span><h3>A little hungry?</h3><p>Add something delicious.<br />We’ll take care of the rest.</p></div> : <div className="cart-lines">{lines.map(line => <div className="cart-line" key={line.id}>
          <span className="cart-icon" aria-hidden="true">{line.dish?.icon || '🍽️'}</span><div className="cart-line-main"><strong>{line.dish?.name || 'Removed menu item'}</strong><small>{line.dish?.available ? money(line.dish.price) : 'Unavailable — please remove'}</small>
            <div className="quantity"><button disabled={submitting} onClick={() => change(line.dish || line, -1)} aria-label={`Decrease ${line.dish?.name || 'item'}`}><Minus size={12} /></button><span>{line.quantity}</span><button disabled={submitting || !line.dish?.available || line.quantity >= 20} onClick={() => change(line.dish, 1)} aria-label={`Increase ${line.dish?.name}`}><Plus size={12} /></button></div>
          </div><button className="icon-button" disabled={submitting} onClick={() => setCart(current => current.filter(x => x.id !== line.id))} aria-label={`Remove ${line.dish?.name || 'item'}`}><Trash2 size={15} /></button>
        </div>)}</div>}
        <form onSubmit={place}>
          <fieldset disabled={submitting}>
            <label>Your table number<input type="number" placeholder="e.g. 12" min="1" max="100" required value={table} onChange={e => setTable(e.target.value)} /></label>
            <label>Anything we should know? <span className="optional">Optional</span><textarea placeholder="Special requests for the kitchen…" maxLength={500} rows={2} value={notes} onChange={e => setNotes(e.target.value)} /></label>
          </fieldset>
          <div className="cart-total"><span>Total</span><strong>{money(total)}</strong></div><p className="cart-fineprint">Pay at the restaurant. No online payment required.</p>
          {checkoutError && <div className="error" role="alert">{checkoutError}</div>}
          <button className="primary place-order" disabled={!cart.length || invalid || loading || submitting || Boolean(error)}>{submitting ? 'Sending to the kitchen…' : 'Place order'}<ArrowRight size={18} /></button>
          <div className="made-fresh"><Leaf size={13} /> Prepared fresh, always.</div>
        </form>
      </aside>
    </section>
    {count > 0 && <button className="mobile-cart primary" onClick={() => checkout.current?.scrollIntoView({ behavior: 'smooth' })}><ShoppingBag size={18} /> View order ({count}) <strong>{money(total)}</strong></button>}
    {toast && <div className="toast" role="status"><Check size={17} />{toast}</div>}
  </>;
}
