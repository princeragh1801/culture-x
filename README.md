# CultureX — Multi-Currency Credits Wallet

Buy platform credits with Stripe, spend them on campaigns. Three separate credit
currencies, each bound to one module and spendable only there.

Design decisions and the reasoning behind them are in **[DESIGN.md](DESIGN.md)**.

```
backend/    Node 22 + TypeScript, Express 5, Sequelize (migrations only), MySQL 8
frontend/   Vite + React + TypeScript, Tailwind v4, shadcn/ui, axios
docker/     MySQL init script
```

---

## 1. Prerequisites

| | |
|---|---|
| Node | 22+ (developed on 22.22) |
| Docker | for MySQL 8 |
| Stripe | a free account in **Test Mode** |
| Stripe CLI | optional — only for a real end-to-end payment |

---

## 2. Start MySQL

```bash
docker compose up -d
```

This creates two databases, `culturex_dev` and `culturex_test`, on host port **3307**
(3307 rather than 3306, so it cannot collide with a MySQL you already run).

Wait for it to report healthy:

```bash
docker compose ps
```

> **Docker Desktop users:** if this fails with `failed to connect to the docker API`, your
> active context points at Docker Desktop while the system daemon is the one running. Use
> `docker context use default`, or start Docker Desktop.

---

## 3. Configure the backend

```bash
cd backend
npm install
cp .env.example .env
```

Then edit `.env`. The database values already match `docker-compose.yml`. Two you must set:

```bash
# any random string, 16+ characters
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

| Variable | Where it comes from |
|---|---|
| `JWT_SECRET` | the command above |
| `STRIPE_SECRET_KEY` | Stripe Dashboard → Developers → API keys → **Secret key** (`sk_test_…`) |
| `STRIPE_WEBHOOK_SECRET` | printed by `stripe listen` — see step 7 (`whsec_…`) |

`.env` is gitignored. No key is ever committed.

> **On `STRIPE_PAYMENT_CURRENCY`:** it defaults to `inr`, matching the brief's rupee
> pricing. Stripe rejects Checkout Sessions below roughly 50 US cents, so a 1-credit
> Campaign Credits purchase (₹3) is fine but very small amounts are not. If your test
> account cannot charge INR, set it to `usd` — the credit prices stay in paise either way.

---

## 4. Create the schema and seed it

```bash
npm run migrate
npm run seed
```

`migrate` applies 11 TypeScript migrations. **The schema exists only in those migrations —
`sequelize.sync()` is never called.** `seed` inserts the three modules, their currencies
and six bundles:

| Currency | Module | Per credit | Bundles |
|---|---|---|---|
| Campaign Credits | campaigns | ₹3 | 100 → ₹300 · 1,000 → ₹2,700 |
| Report Credits | reports | ₹10 | 10 → ₹100 · 100 → ₹900 |
| Discovery Credits | discovery | ₹5 | 100 → ₹500 · 1,000 → ₹4,500 |

All prices are stored as integer paise (₹3 = `300`). Other useful commands:

```bash
npm run migrate:status     # what has been applied
npm run migrate:undo:all   # tear the schema down
npm run db:reset           # undo everything, migrate, seed
```

---

## 5. Run it

Two terminals:

```bash
cd backend  && npm run dev     # http://localhost:4000
cd frontend && npm install && npm run dev   # http://localhost:5173
```

The frontend defaults to `http://localhost:4000/api`; override with `VITE_API_BASE_URL`
in `frontend/.env` if you move the backend.

---

## 6. Run the tests

```bash
cd backend
npm test
```

68 tests against the **real** `culturex_test` database — it migrates and seeds itself, so
this works from an empty database with no extra setup. Highlights:

| File | What it proves |
|---|---|
| `webhook-idempotency.test.ts` | duplicate webhooks grant credits **once** — including one payment arriving under two different event ids |
| `campaign-funding.test.ts` | concurrent funding **cannot** over-spend |
| `database-constraints.test.ts` | the guarantees hold with the service layer bypassed entirely |

Only Stripe's session-creation call is stubbed. Signature verification is the real Stripe
implementation, so the forged-webhook tests exercise the code that guards production.

At any point, check the invariants against live data:

```bash
npm run check:invariants        # dev database
npm run check:invariants:test   # test database
```

It asserts that every wallet's balance equals the sum of that currency's ledger entries,
that no balance is negative, and that no campaign is double-funded or cross-funded.

---

## 7. Exercise the flows

### With the Stripe CLI (a real payment)

```bash
stripe login
stripe listen --forward-to localhost:4000/api/webhooks/stripe
```

The path matters. `--forward-to localhost:4000` alone, or any other path, gets a `404`
that is invisible unless you read the `<--` lines in the CLI output. A working delivery
looks like this:

```
--> checkout.session.completed [evt_1ABC...]
<-- [200] POST http://localhost:4000/api/webhooks/stripe [evt_1ABC...]
```

and the backend logs the outcome:

```
[stripe-webhook] checkout.session.completed evt_1ABC... -> processed: Granted 100 credits for purchase 15.
```

Copy the `whsec_…` it prints into `backend/.env` as `STRIPE_WEBHOOK_SECRET` and restart
the backend. Then, in the app:

1. **Sign up** at <http://localhost:5173> — this creates your wallet with all three currencies at zero.
2. **Buy credits** → pick a currency → a bundle or a quantity → *Continue to Stripe*.
3. Pay with test card **4242 4242 4242 4242**, any future expiry, any CVC.
4. You land back on `/checkout/return`, which says *"Waiting for Stripe to confirm"* and
   polls. **Watch the balance stay at zero until the webhook lands.** That is the point —
   the redirect grants nothing.
5. **Replay the payment:** `stripe events resend <evt_id>` (the id is in the `stripe listen`
   output). The webhook answers `200 duplicate` and the balance does not move.
6. **Campaigns** → create one → *Fund campaign*.
   - Pick **Report Credits** — the picker labels it *"not valid here"* — and submit.
     Rejected with `CURRENCY_NOT_ALLOWED_FOR_MODULE`.
   - Ask for more than you have → `INSUFFICIENT_CREDITS`.
   - Fund it properly → `FUNDED`, showing the ledger entry that paid for it.
   - Try to fund it again → `CAMPAIGN_ALREADY_FUNDED`.

### Without Stripe keys

Everything except paying works: signup, login, wallet, campaigns, and the wrong-currency
and insufficient-balance rejections. Creating a Checkout Session returns
`503 STRIPE_NOT_CONFIGURED` and writes nothing.

The test suite covers the payment path in full without any keys — it signs its own webhook
payloads.

---

## API

Everything except signup, login and the webhook requires `Authorization: Bearer <token>`.

| Method | Endpoint | |
|---|---|---|
| `POST` | `/api/auth/signup` | creates the user **and** their wallet in one transaction |
| `POST` | `/api/auth/login` | |
| `GET` | `/api/auth/me` | |
| `GET` | `/api/currencies` | currencies, prices, bundles, module binding |
| `GET` | `/api/wallet` | balance per currency |
| `GET` | `/api/wallet/ledger` | `?currencyId=&page=&pageSize=` |
| `POST` | `/api/credits/purchases` | `{currencyId, planId}` **or** `{currencyId, quantity}` → Checkout URL. Honours an `Idempotency-Key` header. |
| `GET` | `/api/credits/purchases/:id` | polled by the return page |
| `POST` | `/api/webhooks/stripe` | raw body, signature-verified, unauthenticated |
| `POST` | `/api/campaigns` | |
| `GET` | `/api/campaigns` | |
| `POST` | `/api/campaigns/:id/fund` | `{currencyId, credits}` |

Errors are `{ error: { code, message, details? } }`. The `code` is stable and is what the
frontend branches on — `INSUFFICIENT_CREDITS`, `CURRENCY_NOT_ALLOWED_FOR_MODULE`,
`CAMPAIGN_ALREADY_FUNDED`, `EMAIL_ALREADY_REGISTERED`, `INVALID_SIGNATURE`, and so on.

---

## Troubleshooting

| Symptom | Cause |
|---|---|
| `ECONNREFUSED 127.0.0.1:3307` | MySQL is not up yet — `docker compose ps` and wait for healthy |
| `Invalid application environment configuration` | `JWT_SECRET` missing or shorter than 16 characters |
| Webhook `400 INVALID_SIGNATURE` | The secret is wrong — `STRIPE_WEBHOOK_SECRET` is probably a Dashboard endpoint secret rather than the one `stripe listen` prints. They differ. |
| Webhook `503 STRIPE_NOT_CONFIGURED` | `STRIPE_WEBHOOK_SECRET` is unset. Deliberately a different code from the line above, because the two need opposite fixes. |
| Paid on Stripe but the balance stays zero | Read the `<--` lines in the `stripe listen` output, not the `-->` ones. `-->` only means *forwarded*; `<--` carries the status. A `404` there means the forward target is wrong — it must be the full path, `localhost:4000/api/webhooks/stripe`, not `localhost:4000` or `/webhooks/stripe`. Nothing appears in the server log for a 404, because the request never reaches the handler. |
| Not sure the secret is right | `stripe listen --print-secret` prints the exact value the CLI signs with. It must equal `STRIPE_WEBHOOK_SECRET` in `backend/.env` character for character. |
| Recovering a payment that was missed | `stripe events resend <evt_id>` once the listener is forwarding correctly. The credits are granted then, and replaying it again is a no-op — that is the same idempotency the tests cover. |
| `Checkout Session's total amount must convert to at least 50 cents` | The amount is below Stripe's minimum. Buy more credits, or set `STRIPE_PAYMENT_CURRENCY=usd`. |
