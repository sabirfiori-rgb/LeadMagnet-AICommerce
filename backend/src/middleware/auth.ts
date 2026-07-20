import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../utils/jwt.js';
import { AuthRequest } from '../types/index.js';

declare global {
  namespace Express {
    interface Request {
      auth?: AuthRequest;
    }
  }
}

export function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  try {
    const token =
      req.headers.authorization?.split('Bearer ')[1] ||
      req.cookies?.token;

    if (!token) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const decoded = verifyToken(token);

    if (!decoded) {
      res.status(401).json({ success: false, error: 'Invalid token' });
      return;
    }

    req.auth = {
      userId: decoded.userId,
      email: decoded.email,
    };

    next();
  } catch (error) {
    res.status(401).json({ success: false, error: 'Authentication failed' });
  }
}

export function optionalAuthMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  try {
    const token =
      req.headers.authorization?.split('Bearer ')[1] ||
      req.cookies?.token;

    if (token) {
      const decoded = verifyToken(token);
      if (decoded) {
        req.auth = {
          userId: decoded.userId,
          email: decoded.email,
        };
      }
    }

    next();
  } catch (error) {
    next();
  }
}
