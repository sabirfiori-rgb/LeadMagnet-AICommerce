import 'dotenv/config';
import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { errorHandler } from './middleware/errorHandler.js';
import { apiLimiter } from './middleware/rateLimiter.js';
import authRoutes from './routes/auth.routes.js';
import organizationRoutes from './routes/organization.routes.js';
import workspaceRoutes from './routes/workspace.routes.js';

const PORT = process.env.PORT || 5000;
const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const frontendDistPath = path.resolve(currentDirectory, '../../frontend/dist');

if (process.env.NODE_ENV === 'production') {
  const missing = ['DATABASE_URL', 'JWT_SECRET'].filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(`Missing required production environment variables: ${missing.join(', ')}`);
  }

  if ((process.env.JWT_SECRET?.length || 0) < 32) {
    throw new Error('JWT_SECRET must be at least 32 characters in production');
  }
}

const allowedOrigins = [
  process.env.CORS_ORIGIN,
  process.env.FRONTEND_URL,
  'http://localhost:5173',
]
  .filter((origin): origin is string => Boolean(origin))
  .flatMap((origins) => origins.split(','))
  .map((origin) => origin.trim())
  .filter(Boolean);

const app: Express = express();
app.set('trust proxy', 1);

// Middleware
app.use(helmet());
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
      return;
    }

    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(apiLimiter);

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/organizations', organizationRoutes);
app.use('/api/workspaces', workspaceRoutes);

// Health check
app.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date() });
});

// In production the Express server serves the built React SPA, keeping the UI
// and API on the same origin.
if (existsSync(frontendDistPath)) {
  app.use(express.static(frontendDistPath));
  app.get('*', (req: Request, res: Response) => {
    res.sendFile(path.join(frontendDistPath, 'index.html'));
  });
}

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: 'Route not found',
  });
});

// Error handler
app.use(errorHandler);

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});

export default app;
