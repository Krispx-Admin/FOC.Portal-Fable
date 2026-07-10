// ── Static domain data: locations, catalogues, status machines, seed state ──

export const LOCATIONS = [
  // Retail branches
  { code: 'MOUJ', name: 'Al Mouj',            role: 'retail',  pin: '1234' },
  { code: 'SCC',  name: 'Seeb City Centre',   role: 'retail',  pin: '1234' },
  { code: 'AV',   name: 'Avenues Mall',       role: 'retail',  pin: '1234' },
  { code: 'QCC',  name: 'Qurum City Centre',  role: 'retail',  pin: '1234' },
  { code: 'SLS',  name: 'Salalah Shop',       role: 'retail',  pin: '1234' },
  { code: 'SUR',  name: 'Sur',                role: 'retail',  pin: '1234' },
  // Fitting centres (sell + fit lenses)
  { code: 'MOO',  name: 'Mall of Oman',       role: 'fitting', pin: '1234' },
  { code: 'MGM',  name: 'Muscat Grand Mall',  role: 'fitting', pin: '1234' },
  // Clinics (FOC Eye Clinics)
  { code: 'QURFEC', name: 'Qurum FEC',        role: 'clinic',  pin: '1234' },
  { code: 'SALFEC', name: 'Salalah FEC',      role: 'clinic',  pin: '1234' },
  { code: 'SOHFEC', name: 'Sohar FEC',        role: 'clinic',  pin: '1234' },
  { code: 'NIZFEC', name: 'Nizwa FEC',        role: 'clinic',  pin: '1234' },
  // Warehouse / admin
  { code: 'WH',   name: 'Warehouse (admin)',  role: 'admin',   pin: '9999' },
];

export const ROLES = {
  retail:  { label: 'Retail branch',  hue: 'blue'  },
  fitting: { label: 'Fitting centre', hue: 'teal'  },
  clinic:  { label: 'Clinic',         hue: 'purple' },
  admin:   { label: 'Warehouse · Admin', hue: 'navy' },
};

export const loc = code => LOCATIONS.find(l => l.code === code);
export const locName = code => loc(code)?.name ?? code;
export const FITTERS = LOCATIONS.filter(l => l.role === 'fitting');
export const BRANCHES = LOCATIONS.filter(l => l.role !== 'admin');

// ── Catalogue ──
export const BRANDS = [
  'Ray-Ban', 'Oakley', 'Gucci', 'Prada', 'Tom Ford', 'Persol', 'Versace',
  'Emporio Armani', 'Carrera', 'Police', 'Vogue Eyewear', 'Silhouette',
  'Lindberg', 'Cazal', 'Bausch + Lomb', 'Acuvue', 'FOC House Brand',
];
// Categories carry per-category rules for the request composer.
export const DEFAULT_CATEGORIES = [
  { name: 'Sunglasses',        needsBrand: true,  needsAudience: true,  needsQty: true },
  { name: 'Optical frames',    needsBrand: true,  needsAudience: true,  needsQty: true },
  { name: 'Contact lenses',    needsBrand: true,  needsAudience: false, needsQty: true },
  { name: 'Solutions & drops', needsBrand: true,  needsAudience: false, needsQty: true },
  { name: 'Cleaning kits',     needsBrand: false, needsAudience: false, needsQty: true },
  { name: 'Cases & bags',      needsBrand: false, needsAudience: false, needsQty: true },
  { name: 'Mesh Bags',         needsBrand: false, needsAudience: false, needsQty: true },
  { name: 'Accessories',       needsBrand: false, needsAudience: false, needsQty: true },
];
export const CATEGORIES = DEFAULT_CATEGORIES.map(c => c.name);
export const AUDIENCES = ['Men', 'Women', 'Unisex', 'Kids'];

// ── Fitting pipeline state machine ──
export const FIT_FLOW = ['pending', 'to_fitter', 'at_fitter', 'ready', 'returning', 'delivered'];
export const FIT_STATUS = {
  pending:   { label: 'Pending',                color: 'slate',  action: 'Send to fitter',  actor: 'origin', done: 'Handed to driver — in transit to fitter' },
  to_fitter: { label: 'In transit to fitter',   color: 'blue',   action: 'Confirm arrival', actor: 'fitter', done: 'Frame received at fitting centre' },
  at_fitter: { label: 'At fitter',              color: 'purple', action: 'Mark ready',      actor: 'fitter', done: 'Lenses fitted — job ready' },
  ready:     { label: 'Ready',                  color: 'green',  action: 'Send to branch',  actor: 'fitter', done: 'Handed to driver — returning to branch' },
  returning: { label: 'Returning to branch',    color: 'teal',   action: 'Confirm delivery',actor: 'origin', done: 'Delivered back at origin branch' },
  delivered: { label: 'Delivered',              color: 'done',   action: null,              actor: null,     done: null },
};
export const nextFitStatus = s => FIT_FLOW[FIT_FLOW.indexOf(s) + 1] ?? null;

// Which location acts on an order in its current status.
export function fitActor(order) {
  const a = FIT_STATUS[order.status].actor;
  return a === 'origin' ? order.origin : a === 'fitter' ? order.fitter : null;
}

// ── Stock request state machine ──
// Redesigned: a branch places a request, the warehouse fulfils it. No review.
export const REQ_FLOW = ['placed', 'completed'];
export const REQ_STATUS = {
  placed:    { label: 'Placed',    color: 'blue'  },
  completed: { label: 'Completed', color: 'green' },
};

// ── Permissions ──
export function canSeeOrder(o, code) {
  const me = loc(code);
  return me?.role === 'admin' || o.origin === code || o.fitter === code;
}
export function canAdvanceOrder(o, code) {
  if (o.status === 'delivered') return false;
  const me = loc(code);
  return me?.role === 'admin' || fitActor(o) === code;
}
export function canSeeRequest(r, code) {
  return loc(code)?.role === 'admin' || r.branch === code;
}

// ── Seed data ────────────────────────────────────────────────────────────────
const H = 3600e3, M = 60e3;
let _id = 100;
const nid = () => 'r' + (_id++);

function mkOrder(now, { ref, origin, fitter, customer, phone, brand, model, lens, urgent = false, status, ageH, note }) {
  const created = now - ageH * H;
  const idx = FIT_FLOW.indexOf(status);
  const timeline = [{ at: created, by: origin, text: `Order logged at ${locName(origin)}${note ? ` — ${note}` : ''}` }];
  // Space the traversed steps between creation and now.
  const gap = (now - created) / (idx + 1.4);
  for (let i = 0; i < idx; i++) {
    const from = FIT_FLOW[i];
    const by = FIT_STATUS[from].actor === 'origin' ? origin : fitter;
    timeline.push({ at: created + gap * (i + 1), by, text: FIT_STATUS[from].done });
  }
  const last = timeline[timeline.length - 1];
  return { id: nid(), ref, origin, fitter: fitter ?? null, customer: customer ?? '', phone: phone ?? '', brand: brand ?? '', model: model ?? '', lens: lens ?? '', urgent, note: note ?? '',
           status, createdAt: created, updatedAt: last.at, timeline };
}

function mkReq(now, { ref, branch, status, ageH, note, lines }) {
  const created = now - ageH * H;
  const units = lines.reduce((s, l) => s + (l.qty || 0), 0);
  const full = lines.map(l => ({ id: nid(), ...l }));
  const timeline = [{ at: created, by: branch, text: `Request placed — ${lines.length} line${lines.length > 1 ? 's' : ''}${units ? `, ${units} units` : ''}${note ? ` — ${note}` : ''}` }];
  if (status === 'completed') timeline.push({ at: created + (now - created) * 0.6, by: 'WH', text: 'Fulfilled and completed at the warehouse' });
  const last = timeline[timeline.length - 1];
  return { id: nid(), ref, branch, status, note: note ?? '', lines: full,
           createdAt: created, updatedAt: last.at, timeline };
}

export function seedState() {
  const now = Date.now();
  return {
    v: 3,
    rev: 1,
    seq: { bill: 58241, req: 1027 },
    settings: {
      brands: [...BRANDS],
      categories: DEFAULT_CATEGORIES.map(c => ({ ...c })),
    },
    orders: [
      mkOrder(now, { ref: 'B-58214', origin: 'SCC',    fitter: null,  customer: 'Ahmed Al Balushi',  phone: '9123 4410', brand: 'Ray-Ban',        model: 'RB5154 Clubmaster', lens: 'Single vision 1.60 AR',        status: 'pending',   ageH: 1.2 }),
      mkOrder(now, { ref: 'B-58209', origin: 'MOUJ',   fitter: 'MGM', customer: 'Fatma Al Lawati',   phone: '9245 7781', brand: 'Tom Ford',        model: 'FT5401',            lens: 'Progressive 1.67 blue-cut',     status: 'to_fitter', ageH: 4,   urgent: true, note: 'Customer travelling Thursday' }),
      mkOrder(now, { ref: 'B-58201', origin: 'QCC',    fitter: 'MOO', customer: 'Salim Al Harthy',   phone: '9954 2210', brand: 'Persol',          model: 'PO3007V',           lens: 'Single vision 1.50 photochromic', status: 'at_fitter', ageH: 9 }),
      mkOrder(now, { ref: 'B-58197', origin: 'AV',     fitter: 'MOO', customer: 'Mariam Al Zadjali', phone: '9812 6604', brand: 'Gucci',           model: 'GG0396O',           lens: 'Progressive 1.60 AR',           status: 'at_fitter', ageH: 12,  urgent: true, note: 'Handle with care — rimless demo pair' }),
      mkOrder(now, { ref: 'B-58190', origin: 'SUR',    fitter: 'MOO', customer: 'Khalid Al Habsi',   phone: '9377 0912', brand: 'Oakley',          model: 'OX8046 Airdrop',    lens: 'Single vision 1.60 blue-cut',   status: 'ready',     ageH: 20 }),
      mkOrder(now, { ref: 'B-58186', origin: 'SCC',    fitter: 'MGM', customer: 'Noor Al Riyami',    phone: '9660 3348', brand: 'Vogue Eyewear',   model: 'VO5406',            lens: 'Single vision 1.50',            status: 'ready',     ageH: 26 }),
      mkOrder(now, { ref: 'B-58180', origin: 'NIZFEC', fitter: 'MGM', customer: 'Said Al Maskari',   phone: '9518 8873', brand: 'Carrera',         model: 'CA8866',            lens: 'Bifocal 1.56',                  status: 'returning', ageH: 30 }),
      mkOrder(now, { ref: 'B-58171', origin: 'SLS',    fitter: 'MOO', customer: 'Aisha Al Farsi',    phone: '9089 1265', brand: 'Prada',           model: 'PR 16MV',           lens: 'Progressive 1.74 AR',           status: 'returning', ageH: 42,  urgent: true }),
      mkOrder(now, { ref: 'B-58164', origin: 'SOHFEC', fitter: 'MOO', customer: 'Hamed Al Abri',     phone: '9430 5522', brand: 'Police',          model: 'VPL697',            lens: 'Single vision 1.60 AR',         status: 'delivered', ageH: 55 }),
      mkOrder(now, { ref: 'B-58158', origin: 'QCC',    fitter: 'MGM', customer: 'Laila Al Kindi',    phone: '9764 4190', brand: 'Silhouette',      model: 'TMA 5515 rimless',  lens: 'Progressive 1.67 AR',           status: 'delivered', ageH: 70 }),
      mkOrder(now, { ref: 'B-58223', origin: 'MGM',    fitter: 'MGM', customer: 'Yousef Al Raisi',   phone: '9201 7738', brand: 'Emporio Armani',  model: 'EA3143',            lens: 'Single vision 1.56 blue-cut',   status: 'at_fitter', ageH: 0.6, note: 'In-house job' }),
      mkOrder(now, { ref: 'B-58175', origin: 'SALFEC', fitter: 'MGM', customer: 'Zainab Al Hinai',   phone: '9633 0847', brand: 'Versace',         model: 'VE3297',            lens: 'Single vision 1.60 photochromic', status: 'to_fitter', ageH: 18 }),
      mkOrder(now, { ref: 'B-58152', origin: 'MOUJ',   fitter: 'MOO', customer: 'Nasser Al Amri',    phone: '9887 2201', brand: 'Lindberg',        model: 'Spirit Titanium',   lens: 'Progressive 1.74 AR',           status: 'delivered', ageH: 96 }),
    ],
    requests: [
      mkReq(now, { ref: 'SR-1018', branch: 'SCC', status: 'placed', ageH: 2, note: 'Summer footfall picking up',
        lines: [
          { brand: 'Ray-Ban', category: 'Sunglasses',     audience: 'Unisex', qty: 12, note: 'Aviator + Wayfarer mix' },
          { brand: 'Oakley',  category: 'Sunglasses',     audience: 'Men',    qty: 6,  note: '' },
          { category: 'Cleaning kits', qty: 5, unit: 'box', note: 'Counter stock' },
        ] }),
      mkReq(now, { ref: 'SR-1021', branch: 'QCC', status: 'placed', ageH: 5, note: '',
        lines: [
          { brand: 'Acuvue', category: 'Contact lenses', qty: 24, note: 'Oasys 1-Day, mixed powers' },
          { brand: 'Bausch + Lomb', category: 'Solutions & drops', qty: 18, note: '' },
        ] }),
      mkReq(now, { ref: 'SR-1024', branch: 'MOUJ', status: 'placed', ageH: 1, note: 'Weekend promo prep',
        lines: [
          { brand: 'Gucci',  category: 'Sunglasses',     audience: 'Women', qty: 8, note: '' },
          { brand: 'Prada',  category: 'Optical frames', audience: 'Women', qty: 6, note: '' },
          { category: 'Mesh Bags', qty: 20, note: 'Gift packaging' },
        ] }),
      mkReq(now, { ref: 'SR-1026', branch: 'QURFEC', status: 'placed', ageH: 0.5, note: 'Clinic consumables',
        lines: [
          { category: 'Accessories', qty: 40, note: 'Nose pads + screws assortment' },
          { category: 'Cleaning kits', qty: 3, unit: 'box', note: '' },
        ] }),
      mkReq(now, { ref: 'SR-1014', branch: 'SUR', status: 'completed', ageH: 14, note: '',
        lines: [
          { brand: 'Police',  category: 'Sunglasses',     audience: 'Men', qty: 6 },
          { brand: 'Carrera', category: 'Optical frames', audience: 'Men', qty: 8 },
        ] }),
      mkReq(now, { ref: 'SR-1008', branch: 'SALFEC', status: 'completed', ageH: 30, note: 'Low on kids stock',
        lines: [
          { category: 'Cases & bags', qty: 25 },
          { brand: 'Ray-Ban', category: 'Sunglasses', audience: 'Kids', qty: 8 },
        ] }),
      mkReq(now, { ref: 'SR-1004', branch: 'AV', status: 'completed', ageH: 52, note: '',
        lines: [
          { brand: 'Tom Ford', category: 'Sunglasses',     audience: 'Men',   qty: 6 },
          { brand: 'Versace',  category: 'Sunglasses',     audience: 'Women', qty: 6 },
          { brand: 'Acuvue',   category: 'Contact lenses', qty: 12 },
        ] }),
    ],
  };
}
