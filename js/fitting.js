// ── Module 1: Fitting Log — the frame's journey branch → fitter → branch ──
import { FIT_FLOW, FIT_STATUS, FITTERS, BRANCHES, locName, fitActor, canAdvanceOrder } from './data.js';
import { store } from './store.js';
import { esc, relTime, fmtDT, icons, pill, urgentTag, locChip, openLayer, closeLayer } from './ui.js';

const CHIP_DEFS = [
  { key: 'active', label: 'All active' },
  ...FIT_FLOW.filter(s => s !== 'delivered').map(s => ({ key: s, label: FIT_STATUS[s].label })),
  { key: 'delivered', label: 'Delivered' },
];

export function fittingView(me) {
  const ui = {
    chip: 'active', urgentOnly: false, q: '',
    origin: 'all', fitter: 'all',           // admin-only filters
    selected: new Set(),
    seen: new Set(store.state.orders.map(o => o.id)),
    prevStatus: new Map(store.state.orders.map(o => [o.id, o.status])),
  };
  let root, drawer = null, drawerId = null;
  const isAdmin = me.role === 'admin';

  // ── data ──
  function visible() {
    let list = store.ordersFor(me.code);
    if (ui.chip === 'active') list = list.filter(o => o.status !== 'delivered');
    else list = list.filter(o => o.status === ui.chip);
    if (ui.urgentOnly) list = list.filter(o => o.urgent);
    if (isAdmin && ui.origin !== 'all') list = list.filter(o => o.origin === ui.origin);
    if (isAdmin && ui.fitter !== 'all') list = list.filter(o => o.fitter === ui.fitter);
    if (ui.q) {
      const q = ui.q.toLowerCase();
      list = list.filter(o => [o.ref, o.customer, o.brand, o.model, o.origin, o.fitter, locName(o.origin), locName(o.fitter)]
        .some(v => String(v).toLowerCase().includes(q)));
    }
    return list.sort((a, b) => (b.urgent - a.urgent) || (b.updatedAt - a.updatedAt));
  }
  const counts = () => {
    const all = store.ordersFor(me.code);
    const c = { active: 0, delivered: 0 };
    FIT_FLOW.forEach(s => { c[s] = 0; });
    for (const o of all) { c[o.status]++; if (o.status !== 'delivered') c.active++; }
    return c;
  };

  // ── journey mini-diagram ──
  function journey(o, big = false) {
    const stage = FIT_FLOW.indexOf(o.status); // 0..5
    const seg1 = stage >= 2 ? 'done' : stage === 1 ? 'moving' : '';
    const seg2 = stage >= 5 ? 'done' : stage === 4 ? 'moving' : '';
    const n = i => stage >= i ? 'done' : stage === i - 1 ? '' : '';
    const node = (code, cls, lbl) => `
      <div class="j-node ${cls}">
        <span class="j-pin">${esc(code)}</span>
        ${big ? `<span class="j-lbl">${esc(lbl)}</span>` : ''}
      </div>`;
    return `
      <div class="journey ${big ? 'journey-big' : ''}" title="${esc(locName(o.origin))} → ${esc(locName(o.fitter))} → back">
        ${node(o.origin, stage >= 0 ? 'done' : '', locName(o.origin))}
        <i class="j-seg ${seg1}"></i>
        ${node(o.fitter, stage >= 2 ? 'done' : '', locName(o.fitter))}
        <i class="j-seg ${seg2}"></i>
        ${node(o.origin, stage >= 5 ? 'done' : '', 'Back at branch')}
      </div>`;
  }

  // ── stats tiles ──
  function statsHTML() {
    const all = store.ordersFor(me.code);
    const active = all.filter(o => o.status !== 'delivered');
    const mine = active.filter(o => canAdvanceOrder(o, me.code));
    const week = all.filter(o => o.status === 'delivered' && Date.now() - o.updatedAt < 7 * 864e5);
    const t = (n, lbl, cls = '') => `
      <div class="stat ${cls}"><div class="stat-n">${n}</div><div class="stat-l">${lbl}</div></div>`;
    return t(active.length, 'Active orders')
      + t(active.filter(o => o.urgent).length, 'Urgent', 'stat-red')
      + t(mine.length, isAdmin ? 'Awaiting action' : 'Need your action', 'stat-brand')
      + t(week.length, 'Delivered · 7d');
  }

  // ── list ──
  function rowsHTML() {
    const list = visible();
    if (!list.length) return `<div class="empty">${icons.glasses}<p>No orders match this view.</p></div>`;
    return list.map(o => {
      const isNew = !ui.seen.has(o.id);
      const changed = ui.prevStatus.get(o.id) !== o.status;
      const can = canAdvanceOrder(o, me.code);
      const next = FIT_STATUS[o.status];
      return `
      <div class="row ${isNew ? 'row-enter' : ''} ${o.urgent ? 'row-urgent' : ''}" data-open="${o.id}">
        <label class="cbx" data-stop><input type="checkbox" data-sel="${o.id}" ${ui.selected.has(o.id) ? 'checked' : ''} ${o.status === 'delivered' ? 'disabled' : ''}><i></i></label>
        <div class="row-main">
          <div class="row-title">
            <b>${esc(o.ref)}</b>
            ${o.urgent ? urgentTag() : ''}
            <span class="row-cust">${esc(o.customer)}</span>
          </div>
          <div class="row-sub">${esc(o.brand)} ${esc(o.model)} · ${esc(o.lens)}</div>
        </div>
        <div class="row-journey">${journey(o)}</div>
        <div class="row-status">${pill(FIT_STATUS, o.status, { flash: changed })}</div>
        <div class="row-time" title="${fmtDT(o.updatedAt)}">${relTime(o.updatedAt)}</div>
        <div class="row-act" data-stop>
          ${can && next.action ? `<button class="btn btn-ghost btn-sm" data-advance="${o.id}">${esc(next.action)} ${icons.arrowRight}</button>` : `<span class="row-actor">${o.status === 'delivered' ? icons.check : `waiting on ${esc(fitActor(o) ?? '')}`}</span>`}
        </div>
      </div>`;
    }).join('');
  }

  function bulkHTML() {
    const eligible = [...ui.selected].map(id => store.order(id)).filter(o => o && canAdvanceOrder(o, me.code));
    if (!ui.selected.size) return '';
    return `
      <div class="bulkbar">
        <span><b>${ui.selected.size}</b> selected</span>
        <button class="btn btn-primary btn-sm" data-bulk-advance ${eligible.length ? '' : 'disabled'}>
          ${icons.checks} Advance ${eligible.length} order${eligible.length === 1 ? '' : 's'}
        </button>
        <button class="btn btn-ghost btn-sm" data-bulk-clear>Clear</button>
      </div>`;
  }

  function chipsHTML() {
    const c = counts();
    return CHIP_DEFS.map(d => `
      <button class="chip ${ui.chip === d.key ? 'on' : ''}" data-chip="${d.key}">
        ${esc(d.label)}<span class="chip-n">${c[d.key] ?? 0}</span>
      </button>`).join('');
  }

  // ── drawer (order detail) ──
  function drawerHTML() {
    const o = store.order(drawerId);
    if (!o) return `<div class="pad">Order no longer exists.</div>`;
    const can = canAdvanceOrder(o, me.code);
    const st = FIT_STATUS[o.status];
    return `
      <div class="dw-head">
        <div>
          <div class="dw-kicker">Fitting order</div>
          <h2>${esc(o.ref)} ${o.urgent ? urgentTag() : ''}</h2>
          <div class="dw-sub">${esc(o.customer)}${o.phone ? ` · ${esc(o.phone)}` : ''}</div>
        </div>
        <button class="icon-btn" data-close>${icons.x}</button>
      </div>
      <div class="dw-body">
        <div class="dw-status-row">${pill(FIT_STATUS, o.status)}<span class="dw-when">updated ${relTime(o.updatedAt)}</span></div>
        ${journey(o, true)}
        <div class="kv">
          <div><span>Frame</span><b>${esc(o.brand)} ${esc(o.model)}</b></div>
          <div><span>Lens job</span><b>${esc(o.lens)}</b></div>
          <div><span>Origin</span><b>${locChip(o.origin)} ${esc(locName(o.origin))}</b></div>
          <div><span>Fitting centre</span><b>${locChip(o.fitter)} ${esc(locName(o.fitter))}</b></div>
          ${o.note ? `<div class="kv-wide"><span>Note</span><b>${esc(o.note)}</b></div>` : ''}
        </div>
        <div class="dw-actions">
          ${can && st.action ? `<button class="btn btn-primary" data-advance="${o.id}">${esc(st.action)} ${icons.arrowRight}</button>` : ''}
          ${o.status !== 'delivered' ? `<button class="btn btn-ghost" data-urgent="${o.id}">${icons.zap} ${o.urgent ? 'Remove urgent flag' : 'Flag urgent'}</button>` : ''}
        </div>
        <h3 class="tl-h">${icons.history} Timeline</h3>
        <div class="timeline">
          ${[...o.timeline].reverse().map((t, i) => `
            <div class="tl-item ${i === 0 ? 'tl-now' : ''}">
              <i class="tl-dot"></i>
              <div class="tl-txt">${esc(t.text)}</div>
              <div class="tl-meta">${locChip(t.by)} ${esc(locName(t.by))} · <span title="${fmtDT(t.at)}">${fmtDT(t.at)}</span></div>
            </div>`).join('')}
        </div>
      </div>`;
  }

  function openDrawer(id) {
    drawerId = id;
    drawer = openLayer('drawer', drawerHTML, { onClose: () => { drawer = null; drawerId = null; } });
    drawer.el.addEventListener('click', e => {
      if (e.target.closest('[data-close]')) return drawer.close();
      const adv = e.target.closest('[data-advance]');
      if (adv) return store.advanceOrders([adv.dataset.advance], me.code);
      const urg = e.target.closest('[data-urgent]');
      if (urg) { const o = store.order(urg.dataset.urgent); store.setUrgent(o.id, !o.urgent, me.code); }
    });
  }

  // ── new order modal ──
  function newOrderModal() {
    const layer = openLayer('modal', () => `
      <div class="dw-head">
        <div><div class="dw-kicker">New fitting order</div><h2>Log a frame for lens fitting</h2></div>
        <button class="icon-btn" data-close>${icons.x}</button>
      </div>
      <form class="form" id="nf">
        <div class="grid2">
          <label>Bill / reference no <input name="ref" required value="${esc(store.nextBillRef())}"></label>
          <label>Customer name <input name="customer" required placeholder="e.g. Ahmed Al Balushi"></label>
          <label>Phone <span class="opt">optional</span><input name="phone" placeholder="9xxx xxxx"></label>
          <label>Fitting centre
            <select name="fitter">${FITTERS.map(f => `<option value="${f.code}">${esc(f.name)} (${f.code})</option>`).join('')}</select>
          </label>
          <label>Frame brand <input name="brand" required list="brands" placeholder="Ray-Ban"></label>
          <label>Frame model <input name="model" required placeholder="RB5154"></label>
        </div>
        <label>Lens job <input name="lens" required placeholder="e.g. Progressive 1.67 blue-cut"></label>
        <label>Note <span class="opt">optional</span><input name="note" placeholder="Anything the fitter should know"></label>
        <label class="check"><input type="checkbox" name="urgent"><i></i>${icons.zap} Urgent — floats to the top everywhere</label>
        <div class="form-foot">
          <button type="button" class="btn btn-ghost" data-close>Cancel</button>
          <button type="submit" class="btn btn-primary">${icons.send} Log order</button>
        </div>
      </form>
      <datalist id="brands">${['Ray-Ban','Oakley','Gucci','Prada','Tom Ford','Persol','Versace','Emporio Armani','Carrera','Police','Vogue Eyewear','Silhouette','Lindberg','Cazal'].map(b => `<option value="${b}">`).join('')}</datalist>
    `);
    layer.el.addEventListener('click', e => { if (e.target.closest('[data-close]')) layer.close(); });
    layer.el.querySelector('#nf').addEventListener('submit', e => {
      e.preventDefault();
      const f = new FormData(e.target);
      const o = store.createOrder({
        ref: f.get('ref').trim(), origin: me.code, fitter: f.get('fitter'),
        customer: f.get('customer').trim(), phone: f.get('phone').trim(),
        brand: f.get('brand').trim(), model: f.get('model').trim(),
        lens: f.get('lens').trim(), note: f.get('note').trim(),
        urgent: !!f.get('urgent'),
      }, me.code);
      layer.close();
      openDrawer(o.id);
    });
  }

  // ── render ──
  function render() {
    root.innerHTML = `
      <header class="mod-head">
        <div>
          <h1>Fitting Log</h1>
          <p class="mod-sub">${isAdmin ? 'Every frame travelling across the network' : 'Frames travelling between your branch and the fitting centres'}</p>
        </div>
        ${me.role !== 'admin' ? `<button class="btn btn-primary" data-new>${icons.plus} New fitting order</button>` : ''}
      </header>
      <section class="stats" id="f-stats">${statsHTML()}</section>
      <section class="toolbar">
        <div class="searchbox">${icons.search}<input id="f-q" placeholder="Search ref, customer, frame, location…" value="${esc(ui.q)}"></div>
        ${isAdmin ? `
          <select class="sel" id="f-origin"><option value="all">All origins</option>${BRANCHES.map(b => `<option value="${b.code}" ${ui.origin === b.code ? 'selected' : ''}>${esc(b.name)}</option>`).join('')}</select>
          <select class="sel" id="f-fitter"><option value="all">All fitters</option>${FITTERS.map(b => `<option value="${b.code}" ${ui.fitter === b.code ? 'selected' : ''}>${esc(b.name)}</option>`).join('')}</select>` : ''}
        <button class="chip chip-urgent ${ui.urgentOnly ? 'on' : ''}" id="f-urgent">${icons.zap} Urgent only</button>
      </section>
      <section class="chips" id="f-chips">${chipsHTML()}</section>
      <div id="f-bulk">${bulkHTML()}</div>
      <section class="list" id="f-list">${rowsHTML()}</section>`;
    wire();
    markSeen();
  }

  function refreshLists() {
    root.querySelector('#f-stats').innerHTML = statsHTML();
    root.querySelector('#f-chips').innerHTML = chipsHTML();
    root.querySelector('#f-bulk').innerHTML = bulkHTML();
    root.querySelector('#f-list').innerHTML = rowsHTML();
    markSeen();
    drawer?.update();
  }

  // (drawer content is read-only; safe to re-render on every change)

  function markSeen() {
    for (const o of store.state.orders) { ui.seen.add(o.id); ui.prevStatus.set(o.id, o.status); }
  }

  function wire() {
    root.querySelector('#f-q').addEventListener('input', e => { ui.q = e.target.value; refreshLists(); });
    root.querySelector('#f-urgent').addEventListener('click', () => { ui.urgentOnly = !ui.urgentOnly; root.querySelector('#f-urgent').classList.toggle('on', ui.urgentOnly); refreshLists(); });
    root.querySelector('[data-new]')?.addEventListener('click', newOrderModal);
    root.querySelector('#f-origin')?.addEventListener('change', e => { ui.origin = e.target.value; refreshLists(); });
    root.querySelector('#f-fitter')?.addEventListener('change', e => { ui.fitter = e.target.value; refreshLists(); });

    root.addEventListener('click', e => {
      const chip = e.target.closest('[data-chip]');
      if (chip) { ui.chip = chip.dataset.chip; ui.selected.clear(); refreshLists(); return; }
      if (e.target.closest('[data-bulk-clear]')) { ui.selected.clear(); refreshLists(); return; }
      if (e.target.closest('[data-bulk-advance]')) {
        const ids = [...ui.selected];
        ui.selected.clear();
        store.advanceOrders(ids, me.code); // store change triggers refresh
        return;
      }
      const adv = e.target.closest('[data-advance]');
      if (adv) { e.stopPropagation(); store.advanceOrders([adv.dataset.advance], me.code); return; }
      const sel = e.target.closest('[data-sel]');
      if (sel) { sel.checked ? ui.selected.add(sel.dataset.sel) : ui.selected.delete(sel.dataset.sel); root.querySelector('#f-bulk').innerHTML = bulkHTML(); return; }
      if (e.target.closest('[data-stop]')) return;
      const row = e.target.closest('[data-open]');
      if (row) openDrawer(row.dataset.open);
    });
  }

  return {
    mount(container) { root = container; render(); },
    onChange() { refreshLists(); },
    unmount() { closeLayer(); },
  };
}
