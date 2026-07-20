import { Request, Response, NextFunction } from 'express';
import { validationResult } from 'express-validator';

export function validationMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    res.status(400).json({
      success: false,
      error: 'Validation failed',
      data: errors.array(),
    });
    return;
  }

  next();
}
