import { PrismaClient, User, Session } from '@prisma/client';
import { hashPassword, verifyPassword } from '../utils/password.js';
import { generateToken, verifyToken } from '../utils/jwt.js';
import { sendEmail, generateVerificationEmailHtml, generatePasswordResetEmailHtml } from '../utils/email.js';
import { AppError } from '../middleware/errorHandler.js';
import { v4 as uuidv4 } from 'uuid';

const prisma = new PrismaClient();

export class AuthService {
  async register(
    email: string,
    password: string,
    firstName: string,
    lastName: string
  ): Promise<{ user: User; token: string }> {
    // Check if user already exists
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      throw new AppError(409, 'Email already registered');
    }

    // Hash password
    const passwordHash = await hashPassword(password);

    // Create user
    const user = await prisma.user.create({
      data: {
        email,
        firstName,
        lastName,
        passwordHash,
      },
    });

    // Generate verification token
    const verificationToken = await prisma.emailVerificationToken.create({
      data: {
        userId: user.id,
        token: uuidv4(),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
      },
    });

    // Send verification email
    const verificationLink = `${process.env.FRONTEND_URL}/verify-email?token=${verificationToken.token}`;
    await sendEmail(
      email,
      'Verify your email',
      generateVerificationEmailHtml(verificationLink)
    );

    // Generate JWT token
    const token = generateToken(user.id, user.email);

    return { user, token };
  }

  async login(email: string, password: string): Promise<{ user: User; token: string; session: Session }> {
    // Find user
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      throw new AppError(401, 'Invalid email or password');
    }

    // Verify password
    const isPasswordValid = await verifyPassword(password, user.passwordHash);
    if (!isPasswordValid) {
      throw new AppError(401, 'Invalid email or password');
    }

    // Generate token
    const token = generateToken(user.id, user.email);

    // Create session
    const session = await prisma.session.create({
      data: {
        userId: user.id,
        token,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      },
    });

    return { user, token, session };
  }

  async logout(sessionId: string): Promise<void> {
    await prisma.session.update({
      where: { id: sessionId },
      data: { revokedAt: new Date() },
    });
  }

  async verifyEmail(token: string): Promise<User> {
    // Find verification token
    const verificationToken = await prisma.emailVerificationToken.findUnique({
      where: { token },
    });

    if (!verificationToken) {
      throw new AppError(400, 'Invalid verification token');
    }

    if (verificationToken.expiresAt < new Date()) {
      throw new AppError(400, 'Verification token expired');
    }

    // Update user
    const user = await prisma.user.update({
      where: { id: verificationToken.userId },
      data: { isEmailVerified: true },
    });

    // Mark token as used
    await prisma.emailVerificationToken.update({
      where: { id: verificationToken.id },
      data: { verifiedAt: new Date() },
    });

    return user;
  }

  async requestPasswordReset(email: string): Promise<void> {
    // Find user
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      // Don't reveal if email exists
      return;
    }

    // Create reset token
    const resetToken = await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        token: uuidv4(),
        expiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1 hour
      },
    });

    // Send reset email
    const resetLink = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken.token}`;
    await sendEmail(
      email,
      'Reset your password',
      generatePasswordResetEmailHtml(resetLink)
    );
  }

  async resetPassword(token: string, newPassword: string): Promise<User> {
    // Find reset token
    const resetToken = await prisma.passwordResetToken.findUnique({
      where: { token },
    });

    if (!resetToken) {
      throw new AppError(400, 'Invalid reset token');
    }

    if (resetToken.expiresAt < new Date()) {
      throw new AppError(400, 'Reset token expired');
    }

    if (resetToken.usedAt) {
      throw new AppError(400, 'Reset token already used');
    }

    // Hash new password
    const passwordHash = await hashPassword(newPassword);

    // Update user password
    const user = await prisma.user.update({
      where: { id: resetToken.userId },
      data: { passwordHash },
    });

    // Mark token as used
    await prisma.passwordResetToken.update({
      where: { id: resetToken.id },
      data: { usedAt: new Date() },
    });

    // Revoke all sessions
    await prisma.session.updateMany({
      where: { userId: user.id },
      data: { revokedAt: new Date() },
    });

    return user;
  }

  async getSessionById(sessionId: string): Promise<Session | null> {
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
    });

    if (!session || session.revokedAt || session.expiresAt < new Date()) {
      return null;
    }

    return session;
  }

  async getUserById(userId: string): Promise<User | null> {
    return prisma.user.findUnique({
      where: { id: userId },
    });
  }

  async updateUserProfile(
    userId: string,
    data: { firstName?: string; lastName?: string; profileImage?: string }
  ): Promise<User> {
    return prisma.user.update({
      where: { id: userId },
      data,
    });
  }
}

export const authService = new AuthService();
