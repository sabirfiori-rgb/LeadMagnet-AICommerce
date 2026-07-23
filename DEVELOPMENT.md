# Kinetiq Growth OS - Development Setup

## Quick Start

### 1. Prerequisites
- Docker & Docker Compose
- Node.js 18+
- PostgreSQL (or use Docker)

### 2. Setup with Docker

```bash
# Start database and services
docker-compose up -d

# This starts:
# - PostgreSQL (port 5432)
# - PgAdmin (port 5050) - admin@example.com / admin
# - Redis (port 6379)
```

### 3. Backend Setup

```bash
cd backend

# Install dependencies
npm install

# Setup environment
cp .env.example .env

# Update DATABASE_URL in .env if using Docker:
# DATABASE_URL="postgresql://postgres:postgres@localhost:5432/kinetiq_dev"

# Run migrations
npx prisma migrate dev

# Seed database (optional)
npm run prisma:seed

# Start development server
npm run dev
```

Backend will be available at: `http://localhost:5000`

### 4. Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Setup environment
cp .env.example .env.local

# Start development server
npm run dev
```

Frontend will be available at: `http://localhost:5173`

## Test Credentials

After seeding the database:
- **Email**: `test@example.com`
- **Password**: `Test123!@#`

## Docker Services

### PostgreSQL
- **Host**: `localhost`
- **Port**: `5432`
- **User**: `postgres`
- **Password**: `postgres`
- **Database**: `kinetiq_dev`

### PgAdmin
- **URL**: `http://localhost:5050`
- **Email**: `admin@example.com`
- **Password**: `admin`

### Redis
- **Host**: `localhost`
- **Port**: `6379`

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login user
- `POST /api/auth/logout` - Logout user
- `GET /api/auth/me` - Get current user
- `POST /api/auth/verify-email` - Verify email
- `POST /api/auth/forgot-password` - Request password reset
- `POST /api/auth/reset-password` - Reset password
- `PUT /api/auth/profile` - Update profile

### Organizations
- `GET /api/organizations` - List user's organizations
- `POST /api/organizations` - Create organization
- `GET /api/organizations/:organizationId` - Get organization details
- `GET /api/organizations/:organizationId/members` - List members
- `POST /api/organizations/:organizationId/members/invite` - Invite member
- `PUT /api/organizations/:organizationId/members/:userId/role` - Update member role
- `DELETE /api/organizations/:organizationId/members/:userId` - Remove member
- `PUT /api/organizations/:organizationId` - Update organization

### Workspaces
- `GET /api/workspaces` - List user's workspaces
- `POST /api/workspaces` - Create workspace
- `GET /api/workspaces/:workspaceId` - Get workspace details
- `GET /api/workspaces/org/:organizationId` - List organization's workspaces
- `GET /api/workspaces/:workspaceId/members` - List members
- `POST /api/workspaces/:workspaceId/members/invite` - Invite member
- `PUT /api/workspaces/:workspaceId/members/:userId/role` - Update member role
- `DELETE /api/workspaces/:workspaceId/members/:userId` - Remove member
- `PUT /api/workspaces/:workspaceId` - Update workspace

## Project Structure

```
.
├── backend/                    # Express.js API
│   ├── src/
│   │   ├── middleware/         # Auth, validation, error handling
│   │   ├── routes/             # API endpoints
│   │   ├── services/           # Business logic
│   │   ├── utils/              # Helper functions
│   │   ├── types/              # TypeScript types
│   │   └── index.ts            # Server entry point
│   ├── prisma/
│   │   ├── schema.prisma       # Database schema
│   │   ├── migrations/         # Database migrations
│   │   └── seed.ts             # Seed script
│   └── package.json
│
├── frontend/                   # React SPA
│   ├── src/
│   │   ├── components/         # React components
│   │   ├── pages/              # Page components
│   │   ├── context/            # React Context
│   │   ├── store/              # State management (Zustand)
│   │   ├── services/           # API client
│   │   ├── types/              # TypeScript types
│   │   ├── App.tsx             # Root component
│   │   └── main.tsx            # Entry point
│   └── package.json
│
├── docker-compose.yml          # Docker services
└── README.md
```

## Development Workflow

### Making Database Changes

1. Update `backend/prisma/schema.prisma`
2. Run migration:
   ```bash
   cd backend
   npx prisma migrate dev --name <migration_name>
   ```
3. Generate Prisma types:
   ```bash
   npx prisma generate
   ```

### Adding New API Routes

1. Create service in `backend/src/services/`
2. Create routes in `backend/src/routes/`
3. Import and use in `backend/src/index.ts`
4. Add API client method in `frontend/src/services/api.ts`
5. Create page/component in frontend

## Useful Commands

### Backend
```bash
cd backend

# Development
npm run dev

# Build
npm run build

# Lint
npm run lint

# Format
npm run format

# Database
npx prisma studio  # Open Prisma Studio at http://localhost:5555
npx prisma migrate reset  # Reset database
```

### Frontend
```bash
cd frontend

# Development
npm run dev

# Build
npm run build

# Preview production build
npm run preview

# Type check
npm run type-check
```

## Environment Variables

### Backend `.env`
```
NODE_ENV=development
PORT=5000
API_URL=http://localhost:5000
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/kinetiq_dev
JWT_SECRET=your-secret-key
JWT_EXPIRES_IN=7d
CORS_ORIGIN=http://localhost:5173
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-app-password
EMAIL_FROM=noreply@kinetiq.app
```

### Frontend `.env.local`
```
VITE_API_URL=http://localhost:5000/api
```

## Troubleshooting

### Port Already in Use
```bash
# Kill process on port
# macOS/Linux
lsof -ti:5000 | xargs kill -9

# Windows
netstat -ano | findstr :5000
taskkill /PID <PID> /F
```

### Database Connection Error
```bash
# Ensure Docker is running
docker-compose ps

# View logs
docker-compose logs postgres
```

### Clear Everything
```bash
# Stop all containers
docker-compose down

# Remove volumes (WARNING: deletes database)
docker-compose down -v

# Start fresh
docker-compose up -d
```

## Next Steps

- [ ] Phase 2: Lead Management System
- [ ] Phase 3: AI Commerce Engine
- [ ] Phase 4: Analytics & Reporting
- [ ] Implement email notifications
- [ ] Add file uploads/storage
- [ ] Setup CI/CD pipeline
- [ ] Add test coverage
- [ ] Deploy to production

## Support

For issues or questions, please open a GitHub issue.
