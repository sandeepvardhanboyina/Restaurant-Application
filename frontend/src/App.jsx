import React, { useState } from 'react';
import { ArrowUpRight, Leaf, UtensilsCrossed } from 'lucide-react';
import Menu from './components/Menu';
import Tracker from './components/Tracker';
import Admin from './components/Admin';

export default function App() {
  const [view, setView] = useState('menu');
  const [trackingId, setTrackingId] = useState(() => localStorage.getItem('gather-last-order') || '');
  function track(order) {
    localStorage.setItem('gather-last-order', order.id);
    setTrackingId(order.id);
    setView('tracking');
  }
  return <>
    <div className="announcement">Good food. Good company. <span>Made fresh, just for you.</span></div>
    <header className="site-header">
      <button className="brand" onClick={() => setView('menu')} aria-label="Gather and Grain home">
        <span className="brand-mark"><UtensilsCrossed size={24} /></span>
        <span>gather<span className="amp">&</span>grain<small>KITCHEN & TABLE</small></span>
      </button>
      <nav aria-label="Main navigation">
        <button className={view === 'menu' ? 'active' : ''} onClick={() => setView('menu')}>Our menu</button>
        <button className={view === 'tracking' ? 'active' : ''} onClick={() => setView('tracking')}>Track order</button>
        <button className={`admin-link ${view === 'admin' ? 'active' : ''}`} onClick={() => setView('admin')}>Admin <ArrowUpRight size={15} /></button>
      </nav>
    </header>
    <main>
      <div hidden={view !== 'menu'}><Menu onPlaced={track} active={view === 'menu'} /></div>
      {view === 'tracking' && <Tracker initialId={trackingId} />}
      {view === 'admin' && <Admin />}
    </main>
    <footer><span className="footer-brand"><Leaf size={17} /> Gather & Grain</span><span>A little care in every plate.</span><span>Freshly made · Happily shared</span></footer>
  </>;
}
