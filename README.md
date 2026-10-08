# nara-api

Backend NARA en **NestJS** con **microservicios** (TCP) y **MongoDB** (intercambiable vía `DocumentStore`).

## Arquitectura

```
nara-web (solo UI) ──► gateway :4000 (HTTP /api/*)
                           │
           ┌───────────────┼───────────────┬──────────────┐
           ▼               ▼               ▼              ▼
        auth:4001      people:4002      ops:4003       ai:4004
        login/sesión   personas/       territorios/    TEO
                       pacientes       cuentas/flags
```

| Servicio | Puerto | Dominio |
|----------|--------|---------|
| `gateway` | 4000 | API pública HTTP, cookies, CORS |
| `auth` | 4001 | Login, logout, sesión |
| `people` | 4002 | Personas (~500k) + pacientes |
| `ops` | 4003 | Territorios, expertos, cuentas, assets, flags… |
| `ai` | 4004 | TEO ask/chat |

## Organización por dominios

Cada app está particionada en carpetas independientes (un dominio = una carpeta):

```
apps/
  gateway/src/   proxy/  health/  auth/  people/  ops/  ai/
  auth/src/      login/  session/
  people/src/    shared/  people/  patients/
  ops/src/       shared/  health/  accounts/  territories/  experts/
                 worklists/  flags/  assets/  app-state/
  ai/src/        shared/  teo/{ask,chat,prompts,context}/

libs/
  common/        patterns, roles, DocumentStore
  database/      Mongo + índices ~500k
  auth-core/     tokens de sesión + bcrypt
  ai/            Gemini (cliente reutilizable @nara/ai)
```

Pensado para **~500 000 personas**: listados paginados (`limit`/`skip`), índices en `people`, abstracción de persistencia para migrar de Mongo sin reescribir dominios.

## Arranque local

```bash
cp .env.example .env
# completar MONGODB_URI y AUTH_SECRET (mismo que nara-web)

npm install
npm run start:dev:all
```

Health: `GET http://localhost:4000/api/health`

## Scripts

| Script | Qué hace |
|--------|----------|
| `npm run start:dev:all` | Gateway + 4 microservicios en watch |
| `npm run start:gateway` | Solo HTTP |
| `npm run build` | Compila todo el monorepo |

## Front (nara-web)

En `nara-web` definir `NARA_API_URL=http://127.0.0.1:4000` y el rewrite de Next envía `/api/*` al gateway. La UI no debe contener lógica de negocio.
