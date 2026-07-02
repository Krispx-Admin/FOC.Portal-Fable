# FOC Portal — Optical Operations

An internal, real-time operations portal for a multi-branch optical retail
chain: nine retail branches, three lens-fitting centres and one central
warehouse, all looking at the same live board.

**Zero build step.** Plain HTML + CSS + ES modules — serve the folder with any
static server:

```bash
python3 -m http.server 8000     # or: npx serve
# open http://localhost:8000
```

## What's inside

| Module | What it does |
|---|---|
| **Fitting Log** | Tracks a frame's physical journey: branch → fitting centre → back to the branch. Pipeline: Pending → En route to fitter → At fitter → Ready → Returning → Delivered, with bulk advance, urgent flags, a per-order journey diagram and a full audit timeline. |
| **Stock Requests** | Two-sided procurement. Branches compose multi-line requests (brand + category + audience + qty); the warehouse reviews line by line — adjust quantities, reject individual lines or the whole request — then approves, dispatches, and the branch confirms receipt. |

## The model

- **Users are locations, not people.** Sign in as a location with a short PIN.
- **Roles:** retail branch (sees only its own records), fitting centre (also
  sees jobs routed to it, and advances them), warehouse/admin (sees and
  oversees everything).
- **Real-time:** state lives in `localStorage` and syncs instantly across tabs
  via `BroadcastChannel` — open two tabs, sign in as two locations, and watch
  actions land on both boards. A background simulator (one elected leader tab)
  keeps the rest of the network "working" so the board feels alive.
- Login persists across refresh; each tab can hold a different location.

## Demo credentials

| Locations | PIN |
|---|---|
| All branches & fitting centres | `1234` |
| Warehouse (admin) | `9999` |

“Reset demo” in the sidebar restores the seeded records (all tabs).

## Layout

```
index.html
css/styles.css      design system, layout, micro-animations
js/data.js          locations, catalogue, status machines, permissions, seed data
js/store.js         state, persistence, cross-tab sync, mutations, simulator
js/ui.js            DOM helpers, icons, toasts, modal/drawer layers
js/app.js           login, shell, navigation, live toasts
js/fitting.js       Module 1 — Fitting Log
js/stock.js         Module 2 — Stock Requests / Warehouse queue
```
