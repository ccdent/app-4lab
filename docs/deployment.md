# Deployment — vlastní instance

> Obecný návod pro nasazení aplikace na vlastní Cloudflare účet a doménu.
> Všude níže nahraď `example.com` svou doménou a `app.example.com` subdoménou,
> na které má aplikace běžet. Interní poznámky k referenčnímu nasazení jsou
> v `docs/deployment-internal.md` (není součástí veřejné distribuce).

## Architektura

```
app.example.com  (Cloudflare Access chrání /app a /api)
   ├── Pages (frontend/ — React + Vite, SPA)
   └── Worker route app.example.com/api/*  (worker/ — Hono + Drizzle → D1, R2)
```

Vše běží na Cloudflare Free plánu: Pages (frontend), Workers (API), D1 (SQLite
databáze), R2 (přílohy), Access (přihlášení jednorázovým kódem na e-mail).

## 0. Předpoklady

- Cloudflare účet (Free plán stačí) — https://dash.cloudflare.com
- Doména s DNS u Cloudflare (Websites → Add a site; u registrátora přesměrovat
  nameservery na Cloudflare). Bez toho nefunguje custom doména ani Access.
- Node.js 22+ a `npm install` v adresářích `frontend/` i `worker/`.
- API token (My Profile → API Tokens) s právy: Workers Scripts:Edit,
  Cloudflare Pages:Edit, D1:Edit, Workers R2 Storage:Edit, DNS:Edit,
  Access: Apps and Policies:Edit. Používej přes proměnné prostředí:
  `CLOUDFLARE_API_TOKEN` a `CLOUDFLARE_ACCOUNT_ID`.

## 1. D1 databáze

```bash
cd worker
npx wrangler d1 create app-4lab-db
```

Vypsané `database_id` doplň do `worker/wrangler.toml` (`[[d1_databases]]`).
Pak aplikuj migrace:

```bash
npm run db:migrate:remote
```

## 2. R2 bucket (přílohy)

```bash
npx wrangler r2 bucket create app-4lab-attachments
```

Název musí odpovídat `bucket_name` v `wrangler.toml`.

## 3. Worker (API)

V `worker/wrangler.toml` uprav:

- `routes` → `{ pattern = "app.example.com/api/*", zone_name = "example.com" }`
- `[vars]` `ACCESS_TEAM_DOMAIN` a `ACCESS_AUD` — doplníš v kroku 5.

Deploy:

```bash
npx wrangler deploy
```

## 4. Pages (frontend)

```bash
cd frontend
npm run build
npx wrangler pages project create app-4lab --production-branch main
npx wrangler pages deploy dist --project-name app-4lab --branch main
```

Custom doména: Dashboard → Workers & Pages → app-4lab → Custom domains →
přidej `app.example.com` (DNS CNAME se vytvoří automaticky, případně ručně
CNAME `app` → `app-4lab.pages.dev`, proxied).

## 5. Cloudflare Access (přihlášení)

1. Zero Trust dashboard → nastav si team domain (`<tym>.cloudflareaccess.com`).
2. Access → Applications → Add application → Self-hosted:
   - Application domain: `app.example.com/app` a přidej i `app.example.com/api`
     (root domény nech veřejný — je tam úvodní stránka).
   - Identity provider: One-time PIN (kód na e-mail), případně Google.
3. Policy „Technici": Action Allow, Include → Emails → seznam povolených
   e-mailů (začni svým).
4. Z detailu aplikace zkopíruj **AUD tag** → `ACCESS_AUD` ve `wrangler.toml`;
   `ACCESS_TEAM_DOMAIN` = `<tym>.cloudflareaccess.com`. Znovu `npx wrangler deploy`.

### Automatická synchronizace techniků (volitelné)

Založení/deaktivace technika v aplikaci umí samo upravit Access policy:

1. Vytvoř scoped API token jen s právem **Access: Apps and Policies — Edit**.
2. `npx wrangler secret put ACCESS_SYNC_TOKEN` (vlož token).
3. Ve `wrangler.toml` `[vars]` doplň `CF_ACCOUNT_ID`, `ACCESS_APP_ID`
   (UUID Access aplikace) a `ACCESS_POLICY_ID` (UUID policy).

Bez těchto hodnot se synchronizace tiše přeskočí — e-maily pak spravuješ
v Zero Trust dashboardu ručně.

## 6. První přihlášení

1. Do tabulky `technician` vlož první účet (role `lead`):

```bash
npx wrangler d1 execute app-4lab-db --remote --command \
  "INSERT INTO technician (id, email, first_name, last_name, role, is_active, created_at, updated_at)
   VALUES ('t-1','tvuj@email.cz','Jméno','Příjmení','lead',1,strftime('%s','now')*1000,strftime('%s','now')*1000)"
```

2. Otevři `https://app.example.com` → Přihlásit se → kód přijde na e-mail.
3. Další techniky už zakládej v aplikaci (Admin → Technici).

## 7. Veřejné demo (volitelné)

`wrangler.toml` obsahuje `[env.demo]` — samostatný worker s vlastní D1, bez R2
a bez Access (sdílená identita, limity, noční reset). Postup:

```bash
npx wrangler d1 create app-4lab-demo-db          # id → [env.demo] v wrangler.toml
npx wrangler d1 migrations apply DB --remote --env demo
npx wrangler secret put DEMO_RESET_KEY --env demo # libovolný náhodný řetězec
npx wrangler deploy --env demo
# seed vzorových dat:
curl -X POST https://demo.example.com/api/demo/reset -H "X-Demo-Reset-Key: <klíč>"
```

Frontend: druhý Pages projekt (`app-4lab-demo`) se stejným `dist`, custom
doména `demo.example.com`. Demo chování se na frontendu aktivuje automaticky
podle hostname začínajícího `demo.`.

## Průběžný deploy

```bash
cd worker  && npx wrangler deploy                 # API
cd frontend && npm run build && npx wrangler pages deploy dist --project-name app-4lab --branch main
```

Migrace DB: `npm run db:generate` (po změně `schema.ts`) →
`npm run db:migrate:local` / `:remote`. Nikdy neupravuj už aplikovanou migraci.

## Kontrola po nasazení

- [ ] `https://app.example.com/` vrací úvodní stránku bez přihlášení.
- [ ] `https://app.example.com/app` přesměruje na Access login.
- [ ] Po zadání kódu z e-mailu se načte aplikace (`/api/me` najde technika).
- [ ] Vytvoření zkušební zakázky + tisk štítku funguje.
