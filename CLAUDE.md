# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Mini PDV — a study project (point-of-sale system) for practicing SQL/backend basics. Node/Express/MySQL backend, plain HTML/CSS/JS frontend (no framework, no build step). There is no test suite and no linter configured in this repo.

## Commands

```bash
cd backend
npm install       # express, mysql2, cors, bcryptjs, multer
npm start          # same as: node server.js
```

Runs on `http://localhost:3000` — the same Express process serves both the REST API (`/api/*`) and the static frontend (`frontend/`), so there is nothing separate to start for the UI.

Requires a local MySQL server with a database named `pdv` already created (this project does not create or migrate its own schema — see Database below). DB credentials come from `DB_HOST`/`DB_PORT`/`DB_USER`/`DB_PASSWORD`/`DB_NAME` env vars (see `backend/.env.example`), falling back to the original local dev values (`localhost`/`root`/`masterkey`/`pdv`) when unset — so nothing needs configuring for local dev, but production deploys must set real env vars rather than editing `db.js`. Frontend `API_URL` (in `app.js`) is `''` (same-origin) on purpose — don't hardcode a host there, it'd break as soon as this is deployed anywhere but localhost.

## Architecture

**Monolith, no build step.** `backend/server.js` mounts one router per resource under `backend/routes/` and also serves `frontend/` statically. Each route file talks to MySQL through the shared promise-based pool in `backend/db.js`. Shared backend logic lives in `backend/utils/`: `validadores.js` (CPF/telefone/email validation) and `permissoes.js` (permission-check middleware, see below).

The frontend is one HTML file per screen (`index`, `login`, `clientes`, `produtos`, `vendas`, `historico`, `perfil`, `admin`, `pedido`, `delivery`, `financeiro`), each with its own inline `<script>` at the bottom. Everything shared — API helpers, session/theme helpers, the navbar, toasts, CSV export, input masks/validators, the logo/avatar markup, the table row entrance animation — lives in `frontend/app.js`, loaded via `<script src="app.js">` before each page's inline script. Styling is entirely `frontend/style_roxo.css` (custom properties, no preprocessor); `frontend/style.css` is a legacy file no page references anymore.

Product images are uploaded via `multer` (`POST /api/produtos/:id/imagem`, disk storage) straight into `frontend/uploads/produtos/`, and served back out through the same static middleware that serves the rest of `frontend/` — so `produtos.imagem` in the DB only ever stores a relative path like `uploads/produtos/produto-3-169...jpg`, never binary data.

### Auth & permissions (no real sessions — read this before touching auth code)

There is no JWT/cookie session. Login (`POST /api/auth/login`) checks `funcionario_id` + bcrypt-hashed `senha` and returns the funcionário row (name, cargo, and permission flags), which the frontend stores as-is in `localStorage.usuarioLogado`.

Every subsequent API call made through `apiGet`/`apiPost`/`apiPut`/`apiDelete` (in `app.js`) re-sends that funcionário's id in an `x-funcionario-id` header. Backend middleware in `backend/utils/permissoes.js` (`exigirPermissao('pode_x')` / `exigirAdmin`) looks that id up fresh on every write and checks the boolean permission columns on `funcionarios`. **This header is client-declared and trivially spoofable** — it stops the UI/API from doing things the logged-in user shouldn't, but it is not real security against a malicious client. Don't describe it as such.

`funcionarios` permission columns: `is_admin`, `pode_produtos`, `pode_clientes`, `pode_vendas`, `pode_historico`, `pode_delivery`, `pode_financeiro`, `pode_relatorios`. `is_admin` bypasses every check. `exigirPermissao()` also accepts an array (e.g. `['pode_vendas', 'pode_financeiro']`) meaning "any of these" — used where two different roles legitimately need the same action (cancelling a sale, for instance). Gating happens in independent places that all need to stay in sync when a permission is added or changed:
1. `frontend/app.js`: `exigirLogin()` / `exigirPermissao(nome)` / `exigirAdmin()`, called at the top of each protected page's inline script, redirect away if the check fails.
2. `renderizarNavbar()` (also in `app.js`) hides nav links the current user can't use.
3. The actual backend route (`exigirPermissao`/`exigirAdmin` middleware) enforces it independently — this is the one that actually matters for security. It reads the permission columns via `buscarFuncionario()` in `backend/utils/permissoes.js`, which has its own explicit column list.
4. `backend/routes/auth.js` `POST /login` has yet another explicit SELECT + response-object column list — since (1) and (2) both read off `localStorage.usuarioLogado`, a permission column missing here means the UI silently behaves as if the user doesn't have it, even though the DB and `permissoes.js` agree they do. Easy to miss — it's the one file among these four that doesn't live next to the others.
5. `backend/routes/funcionarios.js` (GET/POST/PUT) and `frontend/admin.html` (table column, checkboxes) also each hardcode the full column list, for cadastro/edição.

Default login: `admin` / `12345` (seeded directly in the database during development, not via a script in this repo).

### Delivery module (the one public write endpoint in the whole system)

`frontend/pedido.html` is a public, unauthenticated storefront — no `exigirLogin()`, no navbar — meant to be linked directly to customers. It posts to `POST /api/pedidos`, which is the **only** route in the app that accepts writes without an `x-funcionario-id`. Because of that, `routes/pedidos.js` never trusts prices or product identity from the request body: it re-fetches real prices from `produtos` server-side before inserting anything, and it finds-or-creates the `clientes` row by phone number (so a repeat customer's orders land on the same `cliente_id` and show up in their ficha automatically). Keep this validate-everything posture if you touch that route.

An incoming order is a `pedidos` row (+ `pedido_itens`) with `status` (`novo` → `preparando` → `saiu_entrega` → `entregue`, or `cancelado`) and starts with no `venda_id`. Staff work the queue from `frontend/delivery.html` (gated by `pode_delivery`), which polls `GET /api/pedidos` every 15s. `PUT /api/pedidos/:id/confirmar` is the pivot: it turns the pedido into a real `vendas` row (`origem = 'delivery'`, stock decremented, same transaction pattern as `POST /api/vendas`) and stamps `pedidos.venda_id` + advances status to `preparando`. A pedido can only be cancelled directly (`PUT /api/pedidos/:id/status`) while `venda_id` is still null — once it's a real sale, cancelling goes through the normal `PUT /api/vendas/:id/cancelar` in Histórico instead, so there's exactly one stock-reversal code path.

`vendas.origem` (`balcao`/`delivery`) and `vendas.taxa_entrega` exist so delivery sales stay mixed into the normal totals (faturamento, dashboard, ficha do cliente) while still being distinguishable — `historico.html` has an origem filter/column, and `GET /api/dashboard/delivery` gives delivery-only stats for the panel. **Any query that computes a venda total must do `subtotal - desconto + taxa_entrega`** (see `routes/vendas.js` GET `/` for the canonical version) — a query that forgets `+ taxa_entrega` will silently undercount delivery sales.

### Consumidor Final, Fiado and Contas a Receber

`vendas.cliente_id` is nullable — a sale with no client is a "Consumidor Final" walk-in sale. Every query that reads `vendas` LEFT JOINs `clientes` and wraps the name in `COALESCE(c.nome, 'Consumidor Final')`; never switch that back to an INNER JOIN or anonymous sales disappear from the results.

`forma_pagamento = 'Fiado'` is store credit: `POST /api/vendas` refuses it without a `cliente_id` (you can't extend credit to someone you can't identify), and sets `status_pagamento = 'pendente'` + `data_vencimento` (defaults to 30 days out if the frontend doesn't send one) instead of the normal `status_pagamento = 'pago'`. "Vencida" is never stored — it's computed everywhere (`calcularSituacaoPagamento()` in `app.js`, reused by `historico.html` and `financeiro.html`) as `pendente && data_vencimento < hoje`.

`backend/routes/financeiro.js` (gated by `pode_financeiro`) is "Contas a Receber": `GET /` deliberately returns **every** sale, not just fiado ones — the frontend's Situação filter defaults to "Pendentes + Vencidas" but has a "Todas as vendas" option that turns it into a full sales ledger with payment status. That was a deliberate simplification over a global "show everything" settings flag: one dataset, one source of truth, filtered differently per screen instead of two screens disagreeing about what a "sale" is. `PUT /api/financeiro/:id/pagar` is the only way `status_pagamento` moves to `'pago'` (also stamps `data_pagamento`). Fiado revenue still counts in `dashboard.js` faturamento the moment the sale happens (accrual, not cash-received) — Contas a Receber is where you track whether it was actually collected.

### Frontend session/theme bootstrapping

Every page has a small inline `<script>` in `<head>`, before `app.js` loads, that reads `localStorage.tema` and sets `documentElement[data-tema]` — this avoids a flash of the wrong theme on load. Add the same snippet to any new page.

Light/dark theme is pure CSS custom properties in `style_roxo.css` (`:root` = escuro/dark, `:root[data-tema="claro"]` = light overrides) — there's no separate stylesheet per theme. The dashboard's canvas-drawn sales chart (`frontend/index.html`) reads its colors from those CSS variables at draw time and redraws on a `temaAlterado` custom event fired by `alternarTema()` — don't hardcode chart colors.

### Database

MySQL database `pdv`, expected to already exist with these tables: `categorias` (full CRUD via `routes/categorias.js`, gated by `pode_produtos`), `clientes`, `produtos` (FK `categoria_id`, plus `imagem` — relative upload path, nullable), `funcionarios` (bcrypt `senha` + the permission columns above), `vendas` (`cliente_id` nullable — see Consumidor Final below; `desconto` DECIMAL — final R$ amount, already clamped server-side to `[0, subtotal]`; `cancelada` TINYINT flag; `origem` ENUM `balcao`/`delivery`; `taxa_entrega` DECIMAL; `status_pagamento` ENUM `pago`/`pendente`; `data_vencimento`/`data_pagamento` DATE/DATETIME, both nullable), `venda_itens` (line items; FK `venda_id`/`produto_id`), `pedidos` (delivery orders — FK `cliente_id`, nullable FK `venda_id`, `status` ENUM, `motoboy`, `taxa_entrega`, `tipo_entrega` ENUM `retirada`/`entrega`), `pedido_itens` (FK `pedido_id`/`produto_id`).

Registering a sale (`POST /api/vendas`) inserts into `vendas`+`venda_itens` and decrements `produtos.estoque` inside a single transaction. **Sales are never hard-deleted.** Cancelling (`PUT /api/vendas/:id/cancelar`) restores each item's quantity back onto `produtos.estoque` and sets `cancelada = 1`, keeping the row for the audit trail. Every aggregate query (dashboard totals, the 14-day chart, `mais-vendidos`, a client's purchase history) must filter `WHERE cancelada = 0`, subtract `desconto`, and add `taxa_entrega` — check `routes/dashboard.js` for the established pattern (subtotal via `venda_itens` join, discount/taxa subtracted-and-added separately per-venda to avoid double-counting across joined item rows) before adding a new revenue query.

Schema changes so far (senha/permission columns on `funcionarios`; `desconto`/`cancelada`/`origem`/`taxa_entrega`/`status_pagamento`/`data_vencimento`/`data_pagamento` on `vendas`, plus `cliente_id` made nullable; `imagem` on `produtos`; the `pedidos`/`pedido_itens` tables) were applied with one-off Node scripts during development, not committed migration files — there is no migrations folder. `schema.sql`/`seed.sql` at the repo root are a snapshot for fresh deploys (see `DEPLOY.md`) — regenerate them after schema changes, they're not auto-synced.

## Common setup errors

- "Não é possível conectar" in the browser → backend isn't running.
- MySQL connection error in the backend terminal → MySQL isn't running, or the credentials in `backend/db.js` are wrong.
- "Unknown database 'pdv'" → the `pdv` database hasn't been created yet.
