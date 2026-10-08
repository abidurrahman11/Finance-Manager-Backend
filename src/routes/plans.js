const express = require("express");
const prisma = require("../config/db");
const auth = require("../middleware/auth");

const router = express.Router();

/**
 * Create new budget plan
 * POST /api/plans
 */
router.post("/", auth, async (req, res) => {
    try {
        const { title, description, target_amount, start_date, end_date } = req.body;

        const newPlan = await prisma.plan.create({
            data: {
                user_id: req.user.id,
                title,
                description: description || null,
                target_amount: target_amount ? parseFloat(target_amount) : null,
                start_date: start_date ? new Date(start_date) : null,
                end_date: end_date ? new Date(end_date) : null
            }
        });

        res.json(newPlan);
    } catch (err) {
        console.error(err);
        res.status(500).send("server error");
    }
});

/**
 * Get all plans for user (including collaborations)
 * GET /api/plans
 */
router.get("/", auth, async (req, res) => {
    try {
        // Get plans where user is owner
        const ownedPlans = await prisma.plan.findMany({
            where: { user_id: req.user.id },
            include: {
                collaborators: true
            }
        });

        // Get plans where user is collaborator
        const collaboratedPlans = await prisma.planCollaborator.findMany({
            where: { user_id: req.user.id },
            include: {
                plan: true
            }
        });

        // Combine and format results
        const result = [
            ...ownedPlans.map(p => ({ ...p, role: 'owner' })),
            ...collaboratedPlans.map(c => ({ ...c.plan, role: c.role }))
        ];

        // Sort by created_at DESC
        result.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

        res.json(result);
    } catch (err) {
        console.error(err);
        res.status(500).send("server error");
    }
});

/**
 * Get single plan + its items
 * GET /api/plans/:id
 */
router.get("/:id", auth, async (req, res) => {
    try {
        const planId = parseInt(req.params.id);
        const userId = req.user.id;

        // Query to get plan details and its items, checking ownership or collaborator access
        const plan = await prisma.plan.findFirst({
            where: {
                id: planId,
                OR: [
                    { user_id: userId },
                    {
                        collaborators: {
                            some: {
                                user_id: userId
                            }
                        }
                    }
                ]
            },
            include: {
                items: true
            }
        });

        // Check if plan exists and is accessible
        if (!plan) {
            return res.status(404).json({ message: "Plan not found or not accessible" });
        }

        const role = plan.user_id === userId
            ? "owner"
            : (await prisma.planCollaborator.findUnique({
                where: {
                    plan_id_user_id: {
                        plan_id: planId,
                        user_id: userId
                    }
                },
                select: { role: true }
            }))?.role;

        // Return the response
        res.json({ plan: { ...plan, role }, items: plan.items });
    } catch (err) {
        console.error(err);
        res.status(500).send("Server error");
    }
});

/**
 * Update plan (only owner)
 * PUT /api/plans/:id
 */
router.put("/:id", auth, async (req, res) => {
    try {
        const planId = parseInt(req.params.id);
        const { title, description, target_amount, start_date, end_date } = req.body;

        // ensure ownership
        const check = await prisma.plan.findUnique({
            where: { id: planId },
            select: { user_id: true }
        });
        if (!check || check.user_id !== req.user.id) {
            return res.status(403).json({ message: "not owner of plan" });
        }

        const updated = await prisma.plan.update({
            where: { id: planId },
            data: {
                title,
                description: description !== undefined ? description : undefined,
                target_amount: target_amount !== undefined ? (target_amount ? parseFloat(target_amount) : null) : undefined,
                start_date: start_date !== undefined ? (start_date ? new Date(start_date) : null) : undefined,
                end_date: end_date !== undefined ? (end_date ? new Date(end_date) : null) : undefined
            }
        });

        res.json(updated);
    } catch (err) {
        console.error(err);
        res.status(500).send("server error");
    }
});

/**
 * Delete plan (only owner)
 * DELETE /api/plans/:id
 */
router.delete("/:id", auth, async (req, res) => {
    try {
        const planId = parseInt(req.params.id);
        const check = await prisma.plan.findUnique({
            where: { id: planId },
            select: { user_id: true }
        });
        if (!check || check.user_id !== req.user.id) {
            return res.status(403).json({ message: "not owner of plan" });
        }

        await prisma.plan.delete({
            where: { id: planId }
        });

        res.json({ message: "plan deleted successfully" });
    } catch (err) {
        console.error(err);
        res.status(500).send("server error");
    }
});

/**
 * Add item to plan
 * POST /api/plans/:id/items
 */
router.post("/:id/items", auth, async (req, res) => {
    try {
        const planId = parseInt(req.params.id);
        const { category, expected_amount, notes } = req.body;

        // check owner or editor collaborator
        const plan = await prisma.plan.findUnique({
            where: { id: planId },
            include: {
                collaborators: {
                    where: {
                        user_id: req.user.id,
                        role: 'editor'
                    }
                }
            }
        });

        if (!plan || (plan.user_id !== req.user.id && plan.collaborators.length === 0)) {
            return res.status(403).json({ message: "not allowed" });
        }

        const newItem = await prisma.planItem.create({
            data: {
                plan_id: planId,
                category,
                expected_amount: parseFloat(expected_amount),
                notes: notes || null
            }
        });

        res.json(newItem);
    } catch (err) {
        console.error(err);
        res.status(500).send("server error");
    }
});

// update plan item
router.put("/:id/items/:itemId", auth, async (req, res) => {
    try {
        const { category, expected_amount, notes } = req.body;
        const planId = parseInt(req.params.id);
        const itemId = parseInt(req.params.itemId);

        // Check owner or editor collaborator
        const plan = await prisma.plan.findUnique({
            where: { id: planId },
            include: {
                collaborators: {
                    where: {
                        user_id: req.user.id,
                        role: 'editor'
                    }
                }
            }
        });

        if (!plan || (plan.user_id !== req.user.id && plan.collaborators.length === 0)) {
            return res.status(403).json({ message: "Not allowed" });
        }

        const itemCheck = await prisma.planItem.findUnique({
            where: { id: itemId },
            select: { plan_id: true }
        });

        if (!itemCheck || itemCheck.plan_id !== planId) {
            return res.status(404).json({ message: "Plan item not found or does not belong to this plan" });
        }

        // Update specific plan item
        const updatedItem = await prisma.planItem.update({
            where: { id: itemId },
            data: {
                category,
                expected_amount: parseFloat(expected_amount),
                notes: notes !== undefined ? notes : undefined
            }
        });

        res.json(updatedItem);
    } catch (err) {
        console.error(err);
        if (err.code === 'P2025') {
            return res.status(404).json({ message: "Plan item not found" });
        }
        res.status(500).send("Server error");
    }
});

// delete a plan item
router.delete("/:id/items/:itemId", auth, async (req, res) => {
    try {
        const planId = parseInt(req.params.id);
        const itemId = parseInt(req.params.itemId);

        // Check owner or editor collaborator
        const plan = await prisma.plan.findUnique({
            where: { id: planId },
            include: {
                collaborators: {
                    where: {
                        user_id: req.user.id,
                        role: 'editor'
                    }
                }
            }
        });

        if (!plan || (plan.user_id !== req.user.id && plan.collaborators.length === 0)) {
            return res.status(403).json({ message: "Do not have permission to delete" });
        }

        const itemCheck = await prisma.planItem.findUnique({
            where: { id: itemId },
            select: { plan_id: true }
        });

        if (!itemCheck || itemCheck.plan_id !== planId) {
            return res.status(404).json({ message: "Plan item not found or does not belong to this plan" });
        }

        // Delete specific plan item
        try {
            await prisma.planItem.delete({
                where: { id: itemId }
            });
        } catch (err) {
            if (err.code === 'P2025') {
                return res.status(404).json({ message: "Plan item not found" });
            }
            throw err;
        }

        res.json({ message: "Plan item deleted successfully" });
    } catch (err) {
        console.error(err);
        res.status(500).send("Server error");
    }
});


/**
 * Update spent amount on a plan item (add or subtract)
 * POST /api/plans/:id/items/:itemId/spent
 */
router.post("/:id/items/:itemId/spent", auth, async (req, res) => {
    try {
        const { id: planId, itemId } = req.params;
        const { amount, operation } = req.body; // amount: positive number, operation: 'add' or 'subtract'

        // Validate input
        if (!amount || isNaN(amount) || amount <= 0 || !['add', 'subtract'].includes(operation)) {
            return res.status(400).json({ message: "Invalid amount or operation" });
        }

        // Check if plan exists and user has access (owner or editor)
        const plan = await prisma.plan.findUnique({
            where: { id: parseInt(planId) },
            include: {
                collaborators: {
                    where: {
                        user_id: req.user.id,
                        role: 'editor'
                    }
                }
            }
        });

        if (!plan || (plan.user_id !== req.user.id && plan.collaborators.length === 0)) {
            return res.status(403).json({ message: "Not authorized to update this plan" });
        }

        // Verify item exists and belongs to plan
        const itemCheck = await prisma.planItem.findUnique({
            where: { id: parseInt(itemId) },
            select: { plan_id: true, spent_amount: true }
        });

        if (!itemCheck || itemCheck.plan_id !== parseInt(planId)) {
            return res.status(404).json({ message: "Plan item not found or does not belong to this plan" });
        }

        // Calculate new spent amount
        const currentSpent = parseFloat(itemCheck.spent_amount) || 0;
        const parsedAmount = parseFloat(amount);
        const newSpent = operation === 'add' ? currentSpent + parsedAmount : currentSpent - parsedAmount;

        if (newSpent < 0) {
            return res.status(400).json({ message: "Spent amount cannot be negative" });
        }

        // Update spent_amount
        const updatedItem = await prisma.planItem.update({
            where: { id: parseInt(itemId) },
            data: {
                spent_amount: newSpent
            }
        });

        console.log(`Updated plan item ${itemId}: spent_amount = ${newSpent}`);
        res.json(updatedItem);
    } catch (err) {
        console.error(`Error updating spent_amount for item ${req.params.itemId}:`, err.message);
        if (err.code === 'P2025') {
            return res.status(404).json({ message: "Plan item not found" });
        }
        res.status(500).json({ message: "Server error", error: err.message });
    }
});


/**
 * Invite collaborator
   POST /plans/:id/collaborators
 */
router.post("/:id/collaborators", auth, async (req, res) => {
    try {
        const planId = parseInt(req.params.id);
        const { user_email, role } = req.body; // Expect email and role ('viewer' or 'editor')

        // Validate input
        if (!user_email || !['viewer', 'editor'].includes(role)) {
            return res.status(400).json({ message: "Invalid email or role" });
        }

        // Check if the requesting user is the plan owner
        const planCheck = await prisma.plan.findUnique({
            where: { id: planId },
            select: { user_id: true }
        });
        if (!planCheck) {
            return res.status(404).json({ message: "Plan not found" });
        }
        if (planCheck.user_id !== req.user.id) {
            return res.status(403).json({ message: "Only the plan owner can add collaborators" });
        }

        // Find user by email
        const userCheck = await prisma.user.findUnique({
            where: { email: user_email },
            select: { id: true }
        });
        if (!userCheck) {
            return res.status(404).json({ message: "User not found" });
        }
        const collaboratorId = userCheck.id;

        // Prevent adding the owner as a collaborator
        if (collaboratorId === req.user.id) {
            return res.status(400).json({ message: "Cannot add plan owner as collaborator" });
        }

        // Add collaborator
        await prisma.planCollaborator.upsert({
            where: {
                plan_id_user_id: {
                    plan_id: planId,
                    user_id: collaboratorId
                }
            },
            update: {
                role
            },
            create: {
                plan_id: planId,
                user_id: collaboratorId,
                role
            }
        });

        res.status(201).json({ message: "Collaborator added successfully" });
    } catch (err) {
        console.error(err);
        res.status(500).send("Server error");
    }
});

/**
 * List all collaborators for a plan
 * GET /api/plans/:id/collaborators
 */
router.get("/:id/collaborators", auth, async (req, res) => {
    try {
        const planId = parseInt(req.params.id);

        // Check if the requesting user is the plan owner
        const planCheck = await prisma.plan.findUnique({
            where: { id: planId },
            select: { user_id: true }
        });
        if (!planCheck) {
            return res.status(404).json({ message: "Plan not found" });
        }
        if (planCheck.user_id !== req.user.id) {
            return res.status(403).json({ message: "Only the plan owner can view collaborators" });
        }

        // Get all collaborators with user details
        const collaborators = await prisma.planCollaborator.findMany({
            where: { plan_id: planId },
            include: {
                user: {
                    select: {
                        id: true,
                        name: true,
                        email: true
                    }
                }
            }
        });

        const formattedCollaborators = collaborators.map(c => ({
            user_id: c.user_id,
            name: c.user.name,
            email: c.user.email,
            role: c.role
        }));

        res.json({ collaborators: formattedCollaborators });
    } catch (err) {
        console.error(err);
        res.status(500).send("Server error");
    }
});

/**
 * Remove a collaborator from a plan
 * DELETE /api/plans/:id/collaborators/:userId
 */
router.delete("/:id/collaborators/:userId", auth, async (req, res) => {
    try {
        const planId = parseInt(req.params.id);
        const userIdToRemove = parseInt(req.params.userId);

        // Check if the requesting user is the plan owner
        const planCheck = await prisma.plan.findUnique({
            where: { id: planId },
            select: { user_id: true }
        });
        if (!planCheck) {
            return res.status(404).json({ message: "Plan not found" });
        }
        if (planCheck.user_id !== req.user.id) {
            return res.status(403).json({ message: "Only the plan owner can remove collaborators" });
        }

        // Prevent removing the owner
        if (userIdToRemove === req.user.id) {
            return res.status(400).json({ message: "Cannot remove the plan owner" });
        }

        // Remove collaborator
        try {
            await prisma.planCollaborator.delete({
                where: {
                    plan_id_user_id: {
                        plan_id: planId,
                        user_id: userIdToRemove
                    }
                }
            });
        } catch (err) {
            if (err.code === 'P2025') {
                return res.status(404).json({ message: "Collaborator not found" });
            }
            throw err;
        }

        res.json({ message: "Collaborator removed successfully" });
    } catch (err) {
        console.error(err);
        res.status(500).send("Server error");
    }
});

module.exports = router;
