# app.4lab.cz

Jednoduché dentální laboratorní CRM pro malé zubní laboratoře
na Cloudflare stacku (Pages + Workers + D1 + R2). Živé demo: https://demo.4lab.cz

- `frontend/` — React SPA (Vite + Mantine 8)
- `worker/` — API (Hono + Drizzle ORM → D1, přílohy R2)
- `docs/deployment.md` — nasazení vlastní instance (Cloudflare)

## Lokální vývoj

```bash
cd worker && npm install && cp .dev.vars.example .dev.vars
npm run db:migrate:local && npm run dev        # API na :8787

cd frontend && npm install
npm run dev                                    # SPA na :5173, proxy /api
```

## Licence

**AGPL-3.0** — viz `LICENSE`. Software je poskytován bez jakýchkoli záruk;
provoz (včetně plnění regulatorních povinností, např. MDR dokumentace)
je plně na odpovědnosti provozovatele. Nasazení vlastní instance:
`docs/deployment.md`.
