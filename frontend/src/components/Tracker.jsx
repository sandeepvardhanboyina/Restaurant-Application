import React, { useEffect, useState } from 'react';
import { Check, ClipboardList, Copy, Search } from 'lucide-react';
import { api, dateTime, money, states } from '../api';

export default function Tracker({ initialId }) {
  const [input, setInput] = useState(initialId);
  const [id, setId] = useState(initialId);
  const [order, setOrder] = useState(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!id) return;
    let stopped = false;
    setOrder(null); setLoading(true);
    async function refresh() {
      try {
        const result = await api(`/orders/${encodeURIComponent(id)}`);
        if (!stopped) { setOrder(result); setError(''); localStorage.setItem('gather-last-order', id); }
      } catch (e) { if (!stopped) setError(e.message); }
      finally { if (!stopped) setLoading(false); }
    }
    refresh();
    const timer = setInterval(refresh, 5000);
    return () => { stopped = true; clearInterval(timer); };
  }, [id]);
  async function copy() {
    try { await navigator.clipboard.writeText(order.id); setCopied(true); }
    catch { setError('Copy your tracking ID from the text below.'); }
  }
  return <section className="page narrow"><div className="eyebrow">FROM OUR KITCHEN TO YOUR TABLE</div><h1>Your next good bite.</h1><p className="page-intro">Keep an eye on your order. We’ll update it as we go.</p>
    <form className="tracking-search" onSubmit={e => { e.preventDefault(); setCopied(false); setId(input.trim()); }}><label className="sr-only" htmlFor="tracking-id">Order tracking ID</label><input id="tracking-id" placeholder="Paste your order tracking ID" required value={input} onChange={e => setInput(e.target.value)} /><button className="primary"><Search size={17} /> Track order</button></form>
    {error && <div role="alert" className="error">{error}</div>}
    {loading && <div className="empty">Checking with the kitchen…</div>}
    {!id && <div className="empty panel"><ClipboardList size={38} /><h3>Every good meal starts with an order.</h3><p>Your tracking ID appears here after checkout.</p></div>}
    {order && <article className="panel tracking-card"><div className="section-heading"><div><span className="eyebrow">TABLE {order.table_number}</span><h2>Order #{order.id.slice(0, 8)}</h2></div><span className={`badge ${order.status}`}>{order.status}</span></div><p className="muted">Placed {dateTime(order.created_at)}</p>
      {order.status === 'cancelled' ? <div className="error">This order was cancelled. Please speak with a member of our team.</div> : <ol className="timeline">{states.map((state, index) => <li key={state} className={index <= states.indexOf(order.status) ? 'done' : ''}><span>{index < states.indexOf(order.status) ? <Check size={16} /> : index + 1}</span><strong>{state === 'pending' ? 'Received' : state}</strong></li>)}</ol>}
      <div className="order-lines">{order.items.map(line => <div key={line.menu_item_id}><span><b>{line.quantity} ×</b> {line.name}</span><strong>{money(line.unit_price * line.quantity)}</strong></div>)}</div>
      {order.notes && <p className="order-note">Kitchen note: {order.notes}</p>}
      <div className="cart-total"><span>Order total</span><strong>{money(order.total)}</strong></div>
      <div className="tracking-reference"><span>Keep this private tracking ID to return to your order:</span><code>{order.id}</code><button className="secondary" onClick={copy}><Copy size={14} />{copied ? 'Copied' : 'Copy ID'}</button></div><p className="made-fresh">Updates automatically every 5 seconds.</p>
    </article>}
  </section>;
}
