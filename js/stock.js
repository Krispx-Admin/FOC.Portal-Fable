// ── Module 2: Stock Requests — branch composer + warehouse review queue ──
import { REQ_STATUS, BRANDS, CATEGORIES, AUDIENCES, BRANCHES, locName } from './data.js';
import { store } from './store.js';
import { esc, relTime, fmtDT, icons, pill, locChip, openLayer, closeLayer } from './ui.js';

const CHIPS = [
  { key: 'open', label: 'Open' },
  { key: 'awaiting', label: 'Awaiting review' },
  { key: 'approved', label: 'Approved · packing' },
  { key: 'dispatched', label: 'Dispatched' },
  { key: 'received', label: 'Received' },
  { key: 'rejected', label: 'Rejected' },
  { key: 'all', label: 'All' },
];
const OPEN = ['awaiting', 'approved', 'dispatched'];

const units = r => r.lines.reduce((s, l) => s + (l.lineStatus === 'rejected' ? 0 : (l.lineStatus === 'approved' ? l.approvedQty : l.qty)), 0);

export function stockView(me) {
  const isAdmin = me.role === 'admin';
  const ui = {
    chip: isAdmin ? 'awaiting' : 'open', q: '', branch: 'all',
    seen: new Set(store.state.requests.map(r => r.id)),
    prevStatus: new Map(store.state.requests.map(r => [r.id, r.status])),
  };
  let root, drawer = null, drawerId = null;
  let review = null; // local warehouse review draft: { [lineId]: {qty, rejected} }
  let rejecting = false;

  function visible() {
    let list = store.requestsFor(me.code);
    if (ui.chip === 'open') list = list.filter(r => OPEN.includes(r.status));
    else if (ui.chip !== 'all') list = list.filter(r => r.status === ui.chip);
    if (isAdmin && ui.branch !== 'all') list = list.filter(r => r.branch === ui.branch);
    if (ui.q) {
      const q = ui.q.toLowerCase();
      list = list.filter(r => [r.ref, r.branch, locName(r.branch), ...r.lines.map(l => `${l.brand} ${l.category}`)]
        .some(v => String(v).toLowerCase().includes(q)));
    }
    const rank = { awaiting: 0, approved: 1, dispatched: 2, received: 3, rejected: 3 };
    return list.sort((a, b) => (rank[a.status] - rank[b.status]) || (b.updatedAt - a.updatedAt));
  }

  const counts = () => {
    const all = store.requestsFor(me.code);
    const c = { open: 0, all: all.length, awaiting: 0, approved: 0, dispatched: 0, received: 0, rejected: 0 };
    for (const r of all) { c[r.status]++; if (OPEN.includes(r.status)) c.open++; }
    return c;
  };

  function statsHTML() {
    const all = store.requestsFor(me.code);
    const c = counts();
    const t = (n, lbl, cls = '') => `<div class="stat ${cls}"><div class="stat-n">${n}</div><div class="stat-l">${lbl}</div></div>`;
    if (isAdmin) {
      const week = all.filter(r => r.status === 'received' && Date.now() - r.updatedAt < 7 * 864e5).length;
      return t(c.awaiting, 'Awaiting review', 'stat-amber') + t(c.approved, 'Packing') + t(c.dispatched, 'On the road', 'stat-brand') + t(week, 'Fulfilled · 7d');
    }
    const inbound = all.filter(r => r.status === 'dispatched');
    const inboundUnits = inbound.reduce((s, r) => s + units(r), 0);
    return t(c.open, 'Open requests') + t(c.awaiting, 'Awaiting review', 'stat-amber') + t(inbound.length, 'Inbound to you', 'stat-brand') + t(inboundUnits, 'Units on the way');
  }

  function lineSummary(r) {
    const names = r.lines.slice(0, 2).map(l => `${l.brand} · ${l.category}`);
    const more = r.lines.length - names.length;
    return esc(names.join(', ')) + (more > 0 ? ` <span class="muted">+${more} more</span>` : '');
  }

  function rowsHTML() {
    const list = visible();
    if (!list.length) return `<div class="empty">${icons.box}<p>No requests match this view.</p></div>`;
    return list.map(r => {
      const isNew = !ui.seen.has(r.id);
      const changed = ui.prevStatus.get(r.id) !== r.status;
      const quick =
        isAdmin && r.status === 'awaiting' ? `<button class="btn btn-ghost btn-sm" data-open-row="${r.id}">Review ${icons.arrowRight}</button>` :
        isAdmin && r.status === 'approved' ? `<button class="btn btn-ghost btn-sm" data-dispatch="${r.id}">${icons.truck} Dispatch</button>` :
        !isAdmin && r.status === 'dispatched' ? `<button class="btn btn-ghost btn-sm" data-receive="${r.id}">${icons.check} Mark received</button>` : '';
      return `
      <div class="row ${isNew ? 'row-enter' : ''}" data-open="${r.id}">
        <div class="row-main">
          <div class="row-title"><b>${esc(r.ref)}</b>
            ${isAdmin ? `<span class="row-cust">${locChip(r.branch)} ${esc(locName(r.branch))}</span>` : ''}
          </div>
          <div class="row-sub">${lineSummary(r)}</div>
        </div>
        <div class="row-units"><b>${r.lines.length}</b> line${r.lines.length === 1 ? '' : 's'} · <b>${units(r)}</b> units</div>
        <div class="row-status">${pill(REQ_STATUS, r.status, { flash: changed })}</div>
        <div class="row-time" title="${fmtDT(r.updatedAt)}">${relTime(r.updatedAt)}</div>
        <div class="row-act" data-stop>${quick}</div>
      </div>`;
    }).join('');
  }

  const chipsHTML = () => {
    const c = counts();
    return CHIPS.map(d => `<button class="chip ${ui.chip === d.key ? 'on' : ''}" data-chip="${d.key}">${esc(d.label)}<span class="chip-n">${c[d.key]}</span></button>`).join('');
  };

  // ── drawer: request detail (+ warehouse review mode) ──
  function beginReview(r) {
    review = {};
    for (const l of r.lines) review[l.id] = { qty: l.qty, rejected: false };
  }

  function linesTableHTML(r) {
    const reviewing = isAdmin && r.status === 'awaiting' && review;
    return `
      <table class="lines">
        <thead><tr><th>Item</th><th>Audience</th><th class="num">Requested</th><th class="num">${reviewing || r.status !== 'awaiting' ? 'Approved' : ''}</th>${reviewing ? '<th></th>' : ''}</tr></thead>
        <tbody>
          ${r.lines.map(l => {
            const d = reviewing ? review[l.id] : null;
            const rejected = reviewing ? d.rejected : l.lineStatus === 'rejected';
            const approvedCell = reviewing
              ? (rejected ? '<span class="muted">—</span>' : `
                  <span class="stepper" data-stop>
                    <button class="step-btn" data-step="-1" data-line="${l.id}">${icons.minus}</button>
                    <b>${d.qty}</b>
                    <button class="step-btn" data-step="1" data-line="${l.id}">${icons.plus}</button>
                  </span>`)
              : r.status === 'awaiting' ? ''
              : rejected ? '<span class="muted">—</span>'
              : `<b>${l.approvedQty}</b>${l.approvedQty !== l.qty ? ` <span class="adj">was ${l.qty}</span>` : ''}`;
            return `
            <tr class="${rejected ? 'line-rejected' : ''}">
              <td><b>${esc(l.brand)}</b> · ${esc(l.category)}${l.note ? `<div class="line-note">${esc(l.note)}</div>` : ''}</td>
              <td>${esc(l.audience)}</td>
              <td class="num">${l.qty}</td>
              <td class="num">${approvedCell}</td>
              ${reviewing ? `<td class="num"><button class="btn btn-ghost btn-sm ${rejected ? 'btn-danger-on' : ''}" data-reject-line="${l.id}">${rejected ? 'Restore' : 'Reject'}</button></td>` : ''}
            </tr>`;
          }).join('')}
        </tbody>
      </table>`;
  }

  function drawerHTML() {
    const r = store.request(drawerId);
    if (!r) return `<div class="pad">Request no longer exists.</div>`;
    const reviewing = isAdmin && r.status === 'awaiting';
    if (reviewing && !review) beginReview(r);
    const kept = reviewing ? Object.values(review).filter(d => !d.rejected).length : 0;
    const actions =
      reviewing ? `
        ${rejecting ? `
          <div class="reject-box">
            <input id="rej-reason" placeholder="Reason — the branch will see this" autofocus>
            <button class="btn btn-danger" data-reject-confirm>Reject request</button>
            <button class="btn btn-ghost" data-reject-cancel>Back</button>
          </div>` : `
          <button class="btn btn-primary" data-approve ${kept ? '' : 'disabled'}>${icons.check} Approve ${kept} of ${r.lines.length} lines</button>
          <button class="btn btn-ghost btn-danger-text" data-reject-start>Reject whole request</button>`}` :
      isAdmin && r.status === 'approved' ? `<button class="btn btn-primary" data-dispatch="${r.id}">${icons.truck} Mark dispatched</button>` :
      r.status === 'dispatched' && (isAdmin || r.branch === me.code) ? `<button class="btn btn-primary" data-receive="${r.id}">${icons.check} Mark received</button>` : '';
    return `
      <div class="dw-head">
        <div>
          <div class="dw-kicker">Stock request</div>
          <h2>${esc(r.ref)}</h2>
          <div class="dw-sub">${locChip(r.branch)} ${esc(locName(r.branch))} → Warehouse${r.note ? ` · “${esc(r.note)}”` : ''}</div>
        </div>
        <button class="icon-btn" data-close>${icons.x}</button>
      </div>
      <div class="dw-body">
        <div class="dw-status-row">${pill(REQ_STATUS, r.status)}<span class="dw-when">updated ${relTime(r.updatedAt)}</span></div>
        ${reviewing ? `<div class="review-hint">${icons.wrench} Review each line — adjust quantities or reject lines, then approve.</div>` : ''}
        ${linesTableHTML(r)}
        <div class="dw-actions">${actions}</div>
        <h3 class="tl-h">${icons.history} Timeline</h3>
        <div class="timeline">
          ${[...r.timeline].reverse().map((t, i) => `
            <div class="tl-item ${i === 0 ? 'tl-now' : ''}">
              <i class="tl-dot"></i>
              <div class="tl-txt">${esc(t.text)}</div>
              <div class="tl-meta">${locChip(t.by)} ${esc(locName(t.by))} · <span>${fmtDT(t.at)}</span></div>
            </div>`).join('')}
        </div>
      </div>`;
  }

  function openDrawer(id) {
    drawerId = id; review = null; rejecting = false;
    drawer = openLayer('drawer', drawerHTML, { onClose: () => { drawer = null; drawerId = null; review = null; } });
    drawer.el.addEventListener('click', e => {
      if (e.target.closest('[data-close]')) return drawer.close();
      const step = e.target.closest('[data-step]');
      if (step) {
        const d = review[step.dataset.line];
        d.qty = Math.max(0, d.qty + Number(step.dataset.step));
        return drawer.update();
      }
      const rej = e.target.closest('[data-reject-line]');
      if (rej) { review[rej.dataset.rejectLine].rejected = !review[rej.dataset.rejectLine].rejected; return drawer.update(); }
      if (e.target.closest('[data-approve]')) {
        const decisions = {};
        for (const [lid, d] of Object.entries(review)) decisions[lid] = d.rejected ? { rejected: true } : { qty: d.qty };
        review = null;
        return store.reviewRequest(drawerId, decisions, me.code);
      }
      if (e.target.closest('[data-reject-start]')) { rejecting = true; return drawer.update(); }
      if (e.target.closest('[data-reject-cancel]')) { rejecting = false; return drawer.update(); }
      if (e.target.closest('[data-reject-confirm]')) {
        const reason = drawer.el.querySelector('#rej-reason')?.value.trim();
        rejecting = false; review = null;
        return store.rejectRequest(drawerId, reason, me.code);
      }
      const disp = e.target.closest('[data-dispatch]');
      if (disp) return store.dispatchRequest(disp.dataset.dispatch, me.code);
      const recv = e.target.closest('[data-receive]');
      if (recv) return store.receiveRequest(recv.dataset.receive, me.code);
    });
  }

  // ── composer: new stock request ──
  function composerModal() {
    let lines = [blankLine()];
    function blankLine() { return { brand: BRANDS[0], category: CATEGORIES[0], audience: 'Unisex', qty: 6, note: '' }; }
    const sel = (name, opts, val, i) => `
      <select data-f="${name}" data-i="${i}">${opts.map(o => `<option ${o === val ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>`;
    const layer = openLayer('modal', () => `
      <div class="dw-head">
        <div><div class="dw-kicker">New stock request</div><h2>Request inventory from the warehouse</h2></div>
        <button class="icon-btn" data-close>${icons.x}</button>
      </div>
      <div class="form">
        <div class="composer-lines">
          <div class="cl-head"><span>Brand</span><span>Category</span><span>Audience</span><span>Qty</span><span>Note</span><span></span></div>
          ${lines.map((l, i) => `
            <div class="cl-row">
              ${sel('brand', BRANDS, l.brand, i)}
              ${sel('category', CATEGORIES, l.category, i)}
              ${sel('audience', AUDIENCES, l.audience, i)}
              <input type="number" min="1" max="999" value="${l.qty}" data-f="qty" data-i="${i}">
              <input placeholder="optional" value="${esc(l.note)}" data-f="note" data-i="${i}">
              <button class="icon-btn" data-del="${i}" ${lines.length === 1 ? 'disabled' : ''}>${icons.x}</button>
            </div>`).join('')}
        </div>
        <button class="btn btn-ghost btn-sm" data-add>${icons.plus} Add line</button>
        <label>Request note <span class="opt">optional</span><input id="req-note" placeholder="e.g. Weekend promo prep"></label>
        <div class="form-foot">
          <span class="muted" id="comp-total"></span>
          <button class="btn btn-ghost" data-close>Cancel</button>
          <button class="btn btn-primary" data-send>${icons.send} Send to warehouse</button>
        </div>
      </div>`);

    const totals = () => {
      const u = lines.reduce((s, l) => s + (l.qty || 0), 0);
      const t = layer.el.querySelector('#comp-total');
      if (t) t.textContent = `${lines.length} line${lines.length === 1 ? '' : 's'} · ${u} units`;
    };
    totals();

    layer.el.addEventListener('input', e => {
      const f = e.target.dataset.f;
      if (!f) return;
      const l = lines[Number(e.target.dataset.i)];
      l[f] = f === 'qty' ? Math.max(0, parseInt(e.target.value, 10) || 0) : e.target.value;
      totals();
    });
    layer.el.addEventListener('change', e => {
      const f = e.target.dataset.f;
      if (f && e.target.tagName === 'SELECT') lines[Number(e.target.dataset.i)][f] = e.target.value;
    });
    layer.el.addEventListener('click', e => {
      if (e.target.closest('[data-close]')) return layer.close();
      if (e.target.closest('[data-add]')) {
        const note = layer.el.querySelector('#req-note').value;
        lines.push(blankLine());
        layer.update(); layer.el.querySelector('#req-note').value = note; totals();
        return;
      }
      const del = e.target.closest('[data-del]');
      if (del) {
        const note = layer.el.querySelector('#req-note').value;
        lines.splice(Number(del.dataset.del), 1);
        layer.update(); layer.el.querySelector('#req-note').value = note; totals();
        return;
      }
      if (e.target.closest('[data-send]')) {
        const clean = lines.filter(l => l.qty > 0).map(l => ({ ...l, brand: l.brand.trim(), note: l.note.trim() }));
        if (!clean.length) return;
        const r = store.createRequest({ lines: clean, note: layer.el.querySelector('#req-note').value.trim() }, me.code);
        layer.close();
        openDrawer(r.id);
      }
    });
  }

  // ── render ──
  function render() {
    root.innerHTML = `
      <header class="mod-head">
        <div>
          <h1>${isAdmin ? 'Warehouse — Request Queue' : 'Stock Requests'}</h1>
          <p class="mod-sub">${isAdmin ? 'Every branch’s requests — review line by line, then dispatch' : 'Request inventory from the central warehouse and track it here'}</p>
        </div>
        ${!isAdmin ? `<button class="btn btn-primary" data-new>${icons.plus} New stock request</button>` : ''}
      </header>
      <section class="stats" id="s-stats">${statsHTML()}</section>
      <section class="toolbar">
        <div class="searchbox">${icons.search}<input id="s-q" placeholder="Search ref, branch, brand…" value="${esc(ui.q)}"></div>
        ${isAdmin ? `<select class="sel" id="s-branch"><option value="all">All branches</option>${BRANCHES.map(b => `<option value="${b.code}" ${ui.branch === b.code ? 'selected' : ''}>${esc(b.name)}</option>`).join('')}</select>` : ''}
      </section>
      <section class="chips" id="s-chips">${chipsHTML()}</section>
      <section class="list" id="s-list">${rowsHTML()}</section>`;
    wire();
    markSeen();
  }

  function refreshLists() {
    root.querySelector('#s-stats').innerHTML = statsHTML();
    root.querySelector('#s-chips').innerHTML = chipsHTML();
    root.querySelector('#s-list').innerHTML = rowsHTML();
    markSeen();
    const f = document.activeElement;
    if (!(drawer && f && drawer.el.contains(f) && f.matches('input,select,textarea'))) drawer?.update();
  }

  function markSeen() {
    for (const r of store.state.requests) { ui.seen.add(r.id); ui.prevStatus.set(r.id, r.status); }
  }

  function wire() {
    root.querySelector('#s-q').addEventListener('input', e => { ui.q = e.target.value; refreshLists(); });
    root.querySelector('[data-new]')?.addEventListener('click', composerModal);
    root.querySelector('#s-branch')?.addEventListener('change', e => { ui.branch = e.target.value; refreshLists(); });
    root.addEventListener('click', e => {
      const chip = e.target.closest('[data-chip]');
      if (chip) { ui.chip = chip.dataset.chip; refreshLists(); return; }
      const disp = e.target.closest('[data-dispatch]');
      if (disp) { e.stopPropagation(); store.dispatchRequest(disp.dataset.dispatch, me.code); return; }
      const recv = e.target.closest('[data-receive]');
      if (recv) { e.stopPropagation(); store.receiveRequest(recv.dataset.receive, me.code); return; }
      const rowBtn = e.target.closest('[data-open-row]');
      if (rowBtn) { e.stopPropagation(); openDrawer(rowBtn.dataset.openRow); return; }
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
