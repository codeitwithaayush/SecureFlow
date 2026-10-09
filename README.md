# SecureFlow
PTC securitization & loan-pool servicing prototype.

    secureflow/
    ├─ backend/   Express + PostgreSQL (db/schema.sql, db/seed.js, src/waterfall.js, src/server.js)
    └─ frontend/  Next.js App Router + Tailwind + Recharts (app/page.tsx)

## Run
    createdb secureflow
    cd backend && npm i && cp .env.example .env && npm run db:init && npm run db:seed && npm start   # :4000
    cd frontend && npm i && npm run dev                                                               # :3000

## Waterfall order (src/waterfall.js)
Expenses -> Senior interest -> Senior principal -> Sub interest -> Sub principal -> EIS to originator.
Unpaid senior/sub interest carries forward as shortfall.
