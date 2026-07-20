import { Router, Request, Response } from 'express';
import { body, param } from 'express-validator';
import { organizationService } from '../services/organization.service.js';
import { validationMiddleware } from '../middleware/validation.js';
import { asyncHandler, AppError } from '../middleware/errorHandler.js';
import { authMiddleware } from '../middleware/auth.js';
import { validateSlug } from '../utils/validation.js';

const router = Router();

// Middleware to verify auth
router.use(authMiddleware);

// Create organization
router.post(
  '/',
  [
    body('name').trim().notEmpty().isLength({ min: 1, max: 100 }),
    body('slug').trim().notEmpty().isLength({ min: 1, max: 50 }),
    body('description').optional().trim(),
  ],
  validationMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const { name, slug, description } = req.body;

    if (!validateSlug(slug)) {
      throw new AppError(400, 'Invalid slug format');
    }

    const { organization, member } = await organizationService.createOrganization(
      name,
      slug,
      req.auth!.userId,
      description
    );

    res.status(201).json({
      success: true,
      data: { organization, member },
      message: 'Organization created successfully',
    });
  })
);

// Get user's organizations
router.get(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const organizations = await organizationService.getUserOrganizations(
      req.auth!.userId
    );

    res.json({
      success: true,
      data: { organizations },
    });
  })
);

// Get organization by ID
router.get(
  '/:organizationId',
  [param('organizationId').notEmpty()],
  validationMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const { organizationId } = req.params;

    const organization = await organizationService.getOrganizationById(
      organizationId
    );

    if (!organization) {
      throw new AppError(404, 'Organization not found');
    }

    res.json({
      success: true,
      data: { organization },
    });
  })
);

// Get organization members
router.get(
  '/:organizationId/members',
  [param('organizationId').notEmpty()],
  validationMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const { organizationId } = req.params;

    const members = await organizationService.getOrganizationMembers(
      organizationId
    );

    res.json({
      success: true,
      data: { members },
    });
  })
);

// Invite member
router.post(
  '/:organizationId/members/invite',
  [param('organizationId').notEmpty(), body('email').isEmail(), body('role').notEmpty()],
  validationMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const { organizationId } = req.params;
    const { email, role } = req.body;

    const member = await organizationService.inviteMember(
      organizationId,
      email,
      role,
      req.auth!.userId
    );

    res.status(201).json({
      success: true,
      data: { member },
      message: 'Member invited successfully',
    });
  })
);

// Update member role
router.put(
  '/:organizationId/members/:userId/role',
  [
    param('organizationId').notEmpty(),
    param('userId').notEmpty(),
    body('role').notEmpty(),
  ],
  validationMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const { organizationId, userId } = req.params;
    const { role } = req.body;

    const member = await organizationService.updateMemberRole(
      organizationId,
      userId,
      role
    );

    res.json({
      success: true,
      data: { member },
      message: 'Member role updated successfully',
    });
  })
);

// Remove member
router.delete(
  '/:organizationId/members/:userId',
  [
    param('organizationId').notEmpty(),
    param('userId').notEmpty(),
  ],
  validationMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const { organizationId, userId } = req.params;

    await organizationService.removeMember(organizationId, userId);

    res.json({
      success: true,
      message: 'Member removed successfully',
    });
  })
);

// Update organization
router.put(
  '/:organizationId',
  [param('organizationId').notEmpty(), body('name').optional().trim(), body('description').optional().trim()],
  validationMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const { organizationId } = req.params;
    const { name, description, logo } = req.body;

    const organization = await organizationService.updateOrganization(
      organizationId,
      { name, description, logo }
    );

    res.json({
      success: true,
      data: { organization },
      message: 'Organization updated successfully',
    });
  })
);

export default router;
