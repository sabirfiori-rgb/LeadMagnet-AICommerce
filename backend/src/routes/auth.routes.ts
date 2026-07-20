import { Router, Request, Response } from 'express';
import { body } from 'express-validator';
import { authService } from '../services/auth.service.js';
import { validationMiddleware } from '../middleware/validation.js';
import { asyncHandler, AppError } from '../middleware/errorHandler.js';
import { validateEmail, validatePassword } from '../utils/validation.js';
import { loginLimiter, authLimiter } from '../middleware/rateLimiter.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();

// Register endpoint
router.post(
  '/register',
  authLimiter,
  [
    body('email').isEmail().normalizeEmail(),
    body('password').isLength({ min: 8 }),
    body('firstName').trim().notEmpty(),
    body('lastName').trim().notEmpty(),
  ],
  validationMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const { email, password, firstName, lastName } = req.body;

    // Additional validation
    const passwordError = validatePassword(password);
    if (passwordError) {
      throw new AppError(400, passwordError);
    }

    const { user, token } = await authService.register(
      email,
      password,
      firstName,
      lastName
    );

    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.SESSION_COOKIE_SECURE === 'true',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    res.status(201).json({
      success: true,
      data: {
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          isEmailVerified: user.isEmailVerified,
        },
        token,
      },
      message: 'Registration successful. Please verify your email.',
    });
  })
);

// Login endpoint
router.post(
  '/login',
  loginLimiter,
  [
    body('email').isEmail().normalizeEmail(),
    body('password').notEmpty(),
  ],
  validationMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const { email, password } = req.body;

    const { user, token } = await authService.login(email, password);

    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.SESSION_COOKIE_SECURE === 'true',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    res.json({
      success: true,
      data: {
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          isEmailVerified: user.isEmailVerified,
        },
        token,
      },
      message: 'Login successful',
    });
  })
);

// Logout endpoint
router.post(
  '/logout',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const sessionId = req.body.sessionId;
    if (sessionId) {
      await authService.logout(sessionId);
    }

    res.clearCookie('token');
    res.json({
      success: true,
      message: 'Logout successful',
    });
  })
);

// Verify email endpoint
router.post(
  '/verify-email',
  [body('token').notEmpty()],
  validationMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const { token } = req.body;

    const user = await authService.verifyEmail(token);

    res.json({
      success: true,
      data: { user },
      message: 'Email verified successfully',
    });
  })
);

// Request password reset endpoint
router.post(
  '/forgot-password',
  authLimiter,
  [body('email').isEmail().normalizeEmail()],
  validationMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const { email } = req.body;

    await authService.requestPasswordReset(email);

    res.json({
      success: true,
      message: 'Password reset email sent if account exists',
    });
  })
);

// Reset password endpoint
router.post(
  '/reset-password',
  [
    body('token').notEmpty(),
    body('password').isLength({ min: 8 }),
  ],
  validationMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const { token, password } = req.body;

    const passwordError = validatePassword(password);
    if (passwordError) {
      throw new AppError(400, passwordError);
    }

    const user = await authService.resetPassword(token, password);

    res.json({
      success: true,
      data: { user },
      message: 'Password reset successful',
    });
  })
);

// Get current user endpoint
router.get(
  '/me',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const user = await authService.getUserById(req.auth!.userId);

    if (!user) {
      throw new AppError(404, 'User not found');
    }

    res.json({
      success: true,
      data: {
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          isEmailVerified: user.isEmailVerified,
          profileImage: user.profileImage,
          createdAt: user.createdAt,
        },
      },
    });
  })
);

// Update profile endpoint
router.put(
  '/profile',
  authMiddleware,
  [
    body('firstName').optional().trim().notEmpty(),
    body('lastName').optional().trim().notEmpty(),
    body('profileImage').optional().isURL(),
  ],
  validationMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const { firstName, lastName, profileImage } = req.body;

    const user = await authService.updateUserProfile(req.auth!.userId, {
      firstName,
      lastName,
      profileImage,
    });

    res.json({
      success: true,
      data: { user },
      message: 'Profile updated successfully',
    });
  })
);

export default router;
