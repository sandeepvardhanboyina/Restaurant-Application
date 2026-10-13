import React, { useEffect, useState } from 'react';
import { ArrowRight, Check, ChefHat, DollarSign, Edit3, LockKeyhole, LogOut, Plus, Receipt, Trash2, X } from 'lucide-react';
import { api, dateTime, money, nextStates } from '../api';

const blankDish = { name: '', category_id: '', description: '', price: '', icon: '🍽️', vegetarian: false, available: true };

export default function Admin() {
  // Keep credentials out of browser storage. Refreshing/leaving this view signs out.
  const [token, setToken] = useState('');
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState('orders');
  const [orders, setOrders] = useState({ items: [], total: 0, page_size: 20 });
  const [summary, setSummary] = useState(null);
  const [menu, setMenu] = useState([]);
  const [categories, setCategories] = useState([]);
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState(null);
  const [newCategory, setNewCategory] = useState('');

  async function refresh() {
    const [list, stats, dishes, groups] = await Promise.all([
      api(`/admin/orders?page=${page}${status ? `&status=${status}` : ''}`, { token }),
      api('/admin/summary', { token }), api('/menu'), api('/categories'),
    ]);
    setOrders(list); setSummary(stats); setMenu(dishes); setCategories(groups);
  }
  useEffect(() => {
    if (!token) return;
    let stopped = false;
    async function update() {
      try { if (!stopped) await refresh(); }
      catch (e) { if (!stopped) { setError(e.message); if (e.status === 401) setToken(''); } }
    }
    update(); const timer = setInterval(update, 8000);
    return () => { stopped = true; clearInterval(timer); };
  }, [token, page, status]);

  async function login(event) {
    event.preventDefault(); setBusy(true); setError('');
    try { const result = await api('/admin/login', { method: 'POST', body: JSON.stringify({ username, password }) }); setToken(result.access_token); setPassword(''); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }
  async function mutate(path, method, body, done) {
    setBusy(true); setError('');
    try { await api(path, { token, method, ...(body ? { body: JSON.stringify(body) } : {}) }); done?.(); await refresh(); }
    catch (e) { setError(e.message); if (e.status === 401) setToken(''); }
    finally { setBusy(false); }
  }
  function saveDish(event) {
    event.preventDefault();
    const { id, ...fields } = editing;
    mutate(id ? `/admin/menu/${id}` : '/admin/menu', id ? 'PUT' : 'POST', { ...fields, category_id: Number(fields.category_id), price: String(fields.price) }, () => setEditing(null));
  }
  if (!token) return <section className="login-wrap"><div className="login-story"><div className="eyebrow">BEHIND EVERY GOOD MEAL</div><h1>A little care.<br />A great team.</h1><p>Your kitchen, your menu, your orders.<br />Everything you need for a smooth service.</p><ChefHat size={100} strokeWidth={1} /></div><form className="panel login-form" onSubmit={login}><span className="login-icon"><LockKeyhole size={24} /></span><h2>Welcome back.</h2><p className="muted">Sign in to manage your restaurant.</p>{error && <div className="error" role="alert">{error}</div>}<label>Username<input autoComplete="username" required value={username} onChange={e => setUsername(e.target.value)} /></label><label>Password<input type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} /></label><button className="primary" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}<ArrowRight size={17} /></button><small className="muted">For the Gather & Grain team.</small></form></section>;

  return <section className="page admin-page"><div className="section-heading"><div><div className="eyebrow">THE KITCHEN, AT A GLANCE</div><h1>Let’s make it a good service.</h1></div><button className="secondary" onClick={() => { setToken(''); setEditing(null); }}><LogOut size={16} /> Sign out</button></div>
    {error && <div className="error" role="alert">{error} <button onClick={() => { setError(''); refresh().catch(e => setError(e.message)); }}>Refresh</button></div>}
    <div className="stats">{[{ label: 'Total orders', value: summary?.orders, icon: Receipt }, { label: 'In the kitchen', value: summary?.active, icon: ChefHat }, { label: 'Orders served', value: summary?.served, icon: Check }, { label: 'Served revenue', value: summary ? money(summary.revenue) : null, icon: DollarSign }].map(({ label, value, icon: Icon }) => <div className="stat" key={label}><Icon size={21} /><strong>{value ?? '—'}</strong><span>{label}</span></div>)}</div>
    <div className="admin-toolbar"><div className="tabs"><button className={tab === 'orders' ? 'selected' : ''} onClick={() => setTab('orders')}>Orders</button><button className={tab === 'menu' ? 'selected' : ''} onClick={() => setTab('menu')}>Menu management</button></div>{tab === 'orders' ? <label className="inline-label">Status<select value={status} onChange={e => { setStatus(e.target.value); setPage(1); }}><option value="">All orders</option>{Object.keys(nextStates).map(s => <option key={s}>{s}</option>)}</select></label> : <button className="primary" onClick={() => setEditing({ ...blankDish, category_id: categories[0]?.id || '' })}><Plus size={17} /> Add dish</button>}</div>
    {tab === 'orders' ? <>
      <div className="admin-orders">{orders.items.map(order => <article className="panel admin-order" key={order.id}><div className="section-heading"><div><h3>Table {order.table_number} <span className="muted">· #{order.id.slice(0, 8)}</span></h3><small className="muted">{dateTime(order.created_at)}</small></div><span className={`badge ${order.status}`}>{order.status}</span></div><div className="order-lines">{order.items.map(item => <div key={item.menu_item_id}><span>{item.quantity} × {item.name}</span><strong>{money(item.unit_price * item.quantity)}</strong></div>)}</div>{order.notes && <p className="order-note">{order.notes}</p>}<div className="admin-order-bottom"><strong>{money(order.total)}</strong><div>{nextStates[order.status].map(next => <button disabled={busy} className={next === 'cancelled' ? 'danger-text' : 'primary'} key={next} onClick={() => { if (next !== 'cancelled' || window.confirm('Cancel this order?')) mutate(`/admin/orders/${order.id}`, 'PATCH', { status: next }); }}>{next === 'cancelled' ? 'Cancel order' : `Mark ${next}`}</button>)}</div></div></article>)}</div>
      {!orders.items.length && <div className="empty panel"><ChefHat size={34} /><h3>No orders here yet.</h3><p>New orders will appear automatically.</p></div>}
      <div className="pagination"><button className="secondary" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Previous</button><span>Page {page} · {orders.total} orders</span><button className="secondary" disabled={page * orders.page_size >= orders.total} onClick={() => setPage(p => p + 1)}>Next</button></div>
    </> : <>
      <form className="category-form panel" onSubmit={e => { e.preventDefault(); mutate('/admin/categories', 'POST', { name: newCategory }, () => setNewCategory('')); }}><label>New category<input placeholder="e.g. Weekend specials" required maxLength={60} value={newCategory} onChange={e => setNewCategory(e.target.value)} /></label><button className="secondary" disabled={busy}><Plus size={16} /> Add category</button></form>
      <div className="panel menu-table-wrap"><table className="menu-table"><thead><tr><th>Dish</th><th>Category</th><th>Price</th><th>Availability</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>{menu.map(item => <tr key={item.id}><td><span className="table-food" aria-hidden="true">{item.icon}</span><strong>{item.name}</strong></td><td>{categories.find(c => c.id === item.category_id)?.name}</td><td>{money(item.price)}</td><td><span className={`badge ${item.available ? 'served' : 'cancelled'}`}>{item.available ? 'Available' : 'Sold out'}</span></td><td><div className="table-actions"><button className="icon-button" aria-label={`Edit ${item.name}`} onClick={() => setEditing({ ...item })}><Edit3 size={17} /></button><button className="icon-button danger-text" disabled={busy} aria-label={`Delete ${item.name}`} onClick={() => { if (window.confirm(`Remove ${item.name} from the menu? Past orders will be preserved.`)) mutate(`/admin/menu/${item.id}`, 'DELETE'); }}><Trash2 size={17} /></button></div></td></tr>)}</tbody></table></div>
    </>}
    {editing && <div className="modal-backdrop"><section className="panel modal" role="dialog" aria-modal="true" aria-labelledby="dish-title"><div className="section-heading"><h2 id="dish-title">{editing.id ? 'Edit dish' : 'Something new.'}</h2><button className="icon-button" disabled={busy} aria-label="Close editor" onClick={() => setEditing(null)}><X size={20} /></button></div><form onSubmit={saveDish}><fieldset disabled={busy}><label>Dish name<input autoFocus required maxLength={100} value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })} /></label><div className="form-row"><label>Category<select required value={editing.category_id} onChange={e => setEditing({ ...editing, category_id: e.target.value })}><option value="" disabled>Choose category</option>{categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label><label>Price ($)<input type="number" required min="0.01" max="9999" step="0.01" value={editing.price} onChange={e => setEditing({ ...editing, price: e.target.value })} /></label></div><label>Description<textarea required rows={3} maxLength={1000} value={editing.description} onChange={e => setEditing({ ...editing, description: e.target.value })} /></label><label>Food emoji<input required maxLength={12} value={editing.icon} onChange={e => setEditing({ ...editing, icon: e.target.value })} /></label><div className="form-row"><label className="checkbox"><input type="checkbox" checked={editing.vegetarian} onChange={e => setEditing({ ...editing, vegetarian: e.target.checked })} /> Vegetarian</label><label className="checkbox"><input type="checkbox" checked={editing.available} onChange={e => setEditing({ ...editing, available: e.target.checked })} /> Available to order</label></div></fieldset>{error && <div className="error" role="alert">{error}</div>}<button className="primary" disabled={busy}>{busy ? 'Saving…' : 'Save dish'}<Check size={17} /></button></form></section></div>}
  </section>;
}
