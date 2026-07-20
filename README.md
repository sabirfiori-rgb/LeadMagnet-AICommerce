# LeadMagnet + AI Commerce

A modern, scalable SaaS platform combining lead generation and AI-powered e-commerce.

## Features

### Phase 1: Authentication & Multi-Tenant Foundation
- ✅ User registration, login, logout
- ✅ Secure password hashing & reset flows
- ✅ Email verification
- ✅ Session management
- ✅ Organizations with roles & permissions
- ✅ Multi-workspace support
- ✅ Tenant isolation
- ✅ Professional SaaS dashboard

### Upcoming Phases
- Phase 2: Lead Management System
- Phase 3: AI Commerce Engine
- Phase 4: Analytics & Reporting

## Tech Stack

### Backend
- **Runtime:** Node.js (TypeScript)
- **Framework:** Express.js
- **Database:** PostgreSQL with Prisma ORM
- **Authentication:** JWT + Secure Cookies
- **Email:** Nodemailer + SendGrid

### Frontend
- **Framework:** React with TypeScript
- **UI Library:** Tailwind CSS + shadcn/ui
- **Routing:** React Router v6
- **State Management:** TanStack Query + Context API
- **Build Tool:** Vite

## Getting Started

### Prerequisites
- Node.js 18+
- PostgreSQL 14+
- Git

### Installation

1. Clone the repository:
```bash
git clone https://github.com/sabirfiori-rgb/LeadMagnet-AICommerce.git
cd LeadMagnet-AICommerce
```

2. Install dependencies:
```bash
# Backend
cd backend
npm install

# Frontend
cd ../frontend
npm install
```

3. Setup environment variables:
```bash
# Backend
cp .env.example .env

# Frontend
cp .env.example .env.local
```

4. Setup database:
```bash
cd backend
npx prisma migrate dev
```

5. Start development servers:
```bash
# Terminal 1: Backend
cd backend
npm run dev

# Terminal 2: Frontend
cd frontend
npm run dev
```

## Project Structure

```
LeadMagnet-AICommerce/
├── backend/                 # Express.js API server
│   ├── src/
│   │   ├── middleware/      # Auth, validation, error handling
│   │   ├── routes/          # API endpoints
│   │   ├── services/        # Business logic
│   │   ├── models/          # Database models (Prisma)
│   │   ├── utils/           # Helpers & utilities
│   │   ├── types/           # TypeScript types
│   │   └── index.ts         # Entry point
│   ├── prisma/              # Database schema & migrations
│   ├── .env.example         # Environment variables template
│   └── package.json
│
├── frontend/                # React SPA
│   ├── src/
│   │   ├── components/      # React components
│   │   ├── pages/           # Page components
│   │   ├── hooks/           # Custom React hooks
│   │   ├── services/        # API client services
│   │   ├── types/           # TypeScript types
│   │   ├── utils/           # Utility functions
│   │   ├── context/         # React Context
│   │   ├── App.tsx          # Root component
│   │   └── main.tsx         # Entry point
│   ├── .env.example         # Environment variables template
│   └── package.json
│
├── .gitignore
└── docker-compose.yml       # Local development with Docker
```

## Contributing

1. Create a feature branch
2. Make your changes
3. Submit a pull request

## License

MIT