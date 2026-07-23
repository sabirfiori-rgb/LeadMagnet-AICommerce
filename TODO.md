# Kinetiq Branding Cleanup & Docker Reset - TODO

## Step 1: Fix backend/.env
- [x] Update DATABASE_URL to point to `kinetiq_dev`
- [x] Align password with docker-compose.yml

## Step 2: Fix backend/.env.example
- [x] Update DB name from `leadmagnet_dev` → `kinetiq_dev`
- [x] Update `EMAIL_FROM` from `noreply@leadmagnet.com` → `noreply@kinetiq.app`

## Step 3: Fix backend/src/utils/email.ts
- [x] Update default `noreply@leadmagnet.com` fallback → `noreply@kinetiq.app`

## Step 4: Fix DEVELOPMENT.md
- [x] Update all `leadmagnet_dev` references → `kinetiq_dev`
- [x] Update `noreply@leadmagnet.com` → `noreply@kinetiq.app`

## Step 5: Fix render.yaml
- [x] Update service name → `kinetiq-growth-os`
- [x] Update database name → `kinetiq-growth-os-db`

## Step 6: Execute Docker Reset
- [ ] Install Docker Desktop from https://www.docker.com/products/docker-desktop/
- [ ] `docker compose down -v` to stop & remove volumes
- [ ] `docker compose up -d --build` to rebuild & start services

## Step 7: Re-initialize Database
- [ ] `cd backend`
- [ ] `npx prisma migrate dev`
- [ ] `npm run prisma:seed`
- [ ] `cd ..`

## Step 8: Start Application
- [ ] `npm run dev`

