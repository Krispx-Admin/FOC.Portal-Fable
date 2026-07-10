// ── Module 3: Settings (admin) — manage request brands & categories ──
import { store } from './store.js';
import { esc, icons } from './ui.js';

export function settingsView(me) {
  let root;

  function categoriesHTML() {
    const cats = store.settings.categories;
    if (!cats.length) return `<div class="empty">${icons.tag}<p>No categories yet — add one below.</p></div>`;
    return cats.map((c, i) => `
      <div class="set-cat" draggable="true" data-idx="${i}">
        <span class="drag-grip" title="Drag to reorder">${icons.grip}</span>
        <div class="set-cat-name">${icons.tag}<b>${esc(c.name)}</b></div>
        <div class="set-cat-flags">
          <label class="check sm"><input type="checkbox" data-flag="needsBrand" data-cat="${esc(c.name)}" ${c.needsBrand ? 'checked' : ''}><i></i>Brand</label>
          <label class="check sm"><input type="checkbox" data-flag="needsAudience" data-cat="${esc(c.name)}" ${c.needsAudience ? 'checked' : ''}><i></i>Audience</label>
          <label class="check sm"><input type="checkbox" data-flag="needsQty" data-cat="${esc(c.name)}" ${c.needsQty !== false ? 'checked' : ''}><i></i>Quantity</label>
        </div>
        <button class="icon-btn" data-del-cat="${esc(c.name)}" title="Remove category">${icons.trash}</button>
      </div>`).join('');
  }

  function brandsHTML() {
    const brands = store.settings.brands;
    if (!brands.length) return `<p class="muted">No brands yet.</p>`;
    return `<div class="set-brands">${brands.map((b, i) => `
      <span class="set-brand" draggable="true" data-idx="${i}" title="Drag to reorder">${esc(b)}<button class="brand-x" data-del-brand="${esc(b)}" title="Remove">${icons.x}</button></span>`).join('')}</div>`;
  }

  function render() {
    root.innerHTML = `
      <header class="mod-head">
        <div>
          <h1>Settings</h1>
          <p class="mod-sub">Control what branches can request — categories, their fields, and the brand list</p>
        </div>
      </header>

      <section class="set-card">
        <div class="set-card-head">
          <h2>${icons.tag} Categories</h2>
          <p class="muted">Toggle which fields each category needs. Turn off <b>Brand</b> for items like Mesh Bags or Cleaning Spray.</p>
        </div>
        <div id="set-cats">${categoriesHTML()}</div>
        <form class="set-add" id="add-cat">
          <input name="name" placeholder="New category — e.g. Cleaning Spray" required>
          <label class="check sm inline"><input type="checkbox" name="needsBrand" checked><i></i>Brand</label>
          <label class="check sm inline"><input type="checkbox" name="needsAudience" checked><i></i>Audience</label>
          <label class="check sm inline"><input type="checkbox" name="needsQty" checked><i></i>Quantity</label>
          <button class="btn btn-primary btn-sm" type="submit">${icons.plus} Add category</button>
        </form>
      </section>

      <section class="set-card">
        <div class="set-card-head">
          <h2>${icons.box} Brands</h2>
          <p class="muted">The brand list branches choose from on brand-based categories.</p>
        </div>
        <div id="set-brands">${brandsHTML()}</div>
        <form class="set-add" id="add-brand">
          <input name="name" placeholder="New brand — e.g. Maui Jim" required>
          <button class="btn btn-primary btn-sm" type="submit">${icons.plus} Add brand</button>
        </form>
      </section>`;
    wire();
  }

  function refresh() {
    const c = root.querySelector('#set-cats');
    const b = root.querySelector('#set-brands');
    if (c) c.innerHTML = categoriesHTML();
    if (b) b.innerHTML = brandsHTML();
  }

  function wire() {
    root.querySelector('#add-cat').addEventListener('submit', e => {
      e.preventDefault();
      const f = new FormData(e.target);
      store.addCategory({
        name: f.get('name').trim(),
        needsBrand: !!f.get('needsBrand'),
        needsAudience: !!f.get('needsAudience'),
        needsQty: !!f.get('needsQty'),
      });
      e.target.reset();
    });
    root.querySelector('#add-brand').addEventListener('submit', e => {
      e.preventDefault();
      store.addBrand(new FormData(e.target).get('name').trim());
      e.target.reset();
    });
    root.addEventListener('change', e => {
      const flag = e.target.dataset.flag;
      if (flag) store.updateCategory(e.target.dataset.cat, { [flag]: e.target.checked });
    });
    root.addEventListener('click', e => {
      const dc = e.target.closest('[data-del-cat]');
      if (dc) return store.removeCategory(dc.dataset.delCat);
      const db = e.target.closest('[data-del-brand]');
      if (db) return store.removeBrand(db.dataset.delBrand);
    });

    // ── drag & drop reordering (categories and brands) ──
    let drag = null; // { type: 'cat'|'brand', from }
    const target = e => drag && e.target.closest(drag.type === 'cat' ? '.set-cat' : '.set-brand');
    root.addEventListener('dragstart', e => {
      const cat = e.target.closest('.set-cat');
      const br = e.target.closest('.set-brand');
      if (cat) { drag = { type: 'cat', from: +cat.dataset.idx }; cat.classList.add('dragging'); }
      else if (br) { drag = { type: 'brand', from: +br.dataset.idx }; br.classList.add('dragging'); }
      if (drag) e.dataTransfer.effectAllowed = 'move';
    });
    root.addEventListener('dragover', e => {
      const t = target(e);
      if (!t) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      root.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
      if (+t.dataset.idx !== drag.from) t.classList.add('drag-over');
    });
    root.addEventListener('drop', e => {
      const t = target(e);
      if (t) {
        e.preventDefault();
        const to = +t.dataset.idx;
        if (to !== drag.from) (drag.type === 'cat' ? store.reorderCategories : store.reorderBrands).call(store, drag.from, to);
      }
      drag = null;
    });
    root.addEventListener('dragend', () => {
      drag = null;
      root.querySelectorAll('.dragging, .drag-over').forEach(el => el.classList.remove('dragging', 'drag-over'));
    });
  }

  return {
    mount(container) { root = container; render(); },
    onChange() { refresh(); },
    unmount() {},
  };
}
