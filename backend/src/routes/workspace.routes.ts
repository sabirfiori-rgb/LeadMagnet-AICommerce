import { Router, Request, Response } from 'express';
import { body, param } from 'express-validator';
import { workspaceService } from '../services/workspace.service.js';
import { validationMiddleware } from '../middleware/validation.js';
import { asyncHandler, AppError } from '../middleware/errorHandler.js';
import { authMiddleware } from '../middleware/auth.js';
import { validateSlug } from '../utils/validation.js';

const router = Router();

// Middleware to verify auth
router.use(authMiddleware);

// Create workspace
router.post(
  '/',
  [
    body('organizationId').notEmpty(),
    body('name').trim().notEmpty().isLength({ min: 1, max: 100 }),
    body('slug').trim().notEmpty().isLength({ min: 1, max: 50 }),
    body('description').optional().trim(),
  ],
  validationMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const { organizationId, name, slug, description } = req.body;

    if (!validateSlug(slug)) {
      throw new AppError(400, 'Invalid slug format');
    }

    const { workspace, member } = await workspaceService.createWorkspace(
      organizationId,
      name,
      slug,
      req.auth!.userId,
      description
    );

    res.status(201).json({
      success: true,
      data: { workspace, member },
      message: 'Workspace created successfully',
    });
  })
);

// Get user's workspaces
router.get(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const workspaces = await workspaceService.getUserWorkspaces(
      req.auth!.userId
    );

    res.json({
      success: true,
      data: { workspaces },
    });
  })
);

// Get workspace by ID
router.get(
  '/:workspaceId',
  [param('workspaceId').notEmpty()],
  validationMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const { workspaceId } = req.params;

    const workspace = await workspaceService.getWorkspaceById(workspaceId);

    if (!workspace) {
      throw new AppError(404, 'Workspace not found');
    }

    res.json({
      success: true,
      data: { workspace },
    });
  })
);

// Get organization workspaces
router.get(
  '/org/:organizationId',
  [param('organizationId').notEmpty()],
  validationMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const { organizationId } = req.params;

    const workspaces = await workspaceService.getOrganizationWorkspaces(
      organizationId
    );

    res.json({
      success: true,
      data: { workspaces },
    });
  })
);

// Get workspace members
router.get(
  '/:workspaceId/members',
  [param('workspaceId').notEmpty()],
  validationMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const { workspaceId } = req.params;

    const members = await workspaceService.getWorkspaceMembers(workspaceId);

    res.json({
      success: true,
      data: { members },
    });
  })
);

// Invite member
router.post(
  '/:workspaceId/members/invite',
  [param('workspaceId').notEmpty(), body('email').isEmail(), body('role').notEmpty()],
  validationMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const { workspaceId } = req.params;
    const { email, role } = req.body;

    const member = await workspaceService.inviteMember(
      workspaceId,
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
  '/:workspaceId/members/:userId/role',
  [
    param('workspaceId').notEmpty(),
    param('userId').notEmpty(),
    body('role').notEmpty(),
  ],
  validationMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const { workspaceId, userId } = req.params;
    const { role } = req.body;

    const member = await workspaceService.updateMemberRole(workspaceId, userId, role);

    res.json({
      success: true,
      data: { member },
      message: 'Member role updated successfully',
    });
  })
);

// Remove member
router.delete(
  '/:workspaceId/members/:userId',
  [
    param('workspaceId').notEmpty(),
    param('userId').notEmpty(),
  ],
  validationMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const { workspaceId, userId } = req.params;

    await workspaceService.removeMember(workspaceId, userId);

    res.json({
      success: true,
      message: 'Member removed successfully',
    });
  })
);

// Update workspace
router.put(
  '/:workspaceId',
  [param('workspaceId').notEmpty(), body('name').optional().trim(), body('description').optional().trim()],
  validationMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const { workspaceId } = req.params;
    const { name, description, icon } = req.body;

    const workspace = await workspaceService.updateWorkspace(workspaceId, {
      name,
      description,
      icon,
    });

    res.json({
      success: true,
      data: { workspace },
      message: 'Workspace updated successfully',
    });
  })
);

export default router;
