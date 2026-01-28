const express = require("express");
const prisma = require("../config/db");
const auth = require("../middleware/auth");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const router = express.Router();

// code of this file is the mirror of expense.js

// Setup multer storage (store images in "Uploads" folder)
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadPath = path.join(__dirname, "../../Uploads");
        if (!fs.existsSync(uploadPath)) {
            fs.mkdir(uploadPath, { recursive: true });
        }
        cb(null, uploadPath);
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + path.extname(file.originalname)); // unique
    },
});
const upload = multer({ storage });

/**
 * Create new income group
 * POST /api/incomes/groups
 */
router.post("/groups", auth, async (req, res) => {
    try {
        const { title, description, start_date, end_date } = req.body;

        // Validate input
        if (!title) {
            return res.status(400).json({ message: "Title is required" });
        }

        const newGroup = await prisma.incomeGroup.create({
            data: {
                user_id: req.user.id,
                title,
                description: description || null,
                start_date: start_date ? new Date(start_date) : null,
                end_date: end_date ? new Date(end_date) : null
            }
        });

        res.json(newGroup);
    } catch (err) {
        console.error(err.message);
        res.status(500).send("Server error");
    }
});

/**
 * Get all income groups for user (including collaborations)
 * GET /api/incomes/groups
 */
router.get("/groups", auth, async (req, res) => {
    try {
        // Get groups where user is owner
        const ownedGroups = await prisma.incomeGroup.findMany({
            where: { user_id: req.user.id },
            include: {
                collaborators: true
            }
        });

        // Get groups where user is collaborator
        const collaboratedGroups = await prisma.incomeGroupCollaborator.findMany({
            where: { user_id: req.user.id },
            include: {
                income_group: true
            }
        });

        // Combine and format results
        const result = [
            ...ownedGroups.map(g => ({ ...g, role: 'owner' })),
            ...collaboratedGroups.map(c => ({ ...c.income_group, role: c.role }))
        ];

        // Sort by created_at DESC
        result.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

        res.json(result);
    } catch (err) {
        console.error(err.message);
        res.status(500).send("Server error");
    }
});


/**
 * Update income group (only owner)
 * PUT /api/incomes/groups/:id
 */
router.put("/groups/:id", auth, async (req, res) => {
    try {
        const groupId = parseInt(req.params.id);
        const { title, description, start_date, end_date } = req.body;

        // Validate input
        if (!title) {
            return res.status(400).json({ message: "Title is required" });
        }

        // Check if the requesting user is the group owner
        const groupCheck = await prisma.incomeGroup.findUnique({
            where: { id: groupId },
            select: { user_id: true }
        });
        if (!groupCheck) {
            return res.status(404).json({ message: "income group not found" });
        }
        if (groupCheck.user_id !== req.user.id) {
            return res.status(403).json({ message: "Only the group owner can update this group" });
        }

        // Update the income group
        const updatedGroup = await prisma.incomeGroup.update({
            where: { id: groupId },
            data: {
                title,
                description: description !== undefined ? description : undefined,
                start_date: start_date !== undefined ? (start_date ? new Date(start_date) : null) : undefined,
                end_date: end_date !== undefined ? (end_date ? new Date(end_date) : null) : undefined
            }
        });

        res.json(updatedGroup);
    } catch (err) {
        console.error(err.message);
        res.status(500).send("Server error");
    }
});


/**
 * Delete income group (only owner)
 * DELETE /api/incomes/groups/:id
 */
router.delete("/groups/:id", auth, async (req, res) => {
    try {
        const groupId = parseInt(req.params.id);

        // Check if the requesting user is the group owner
        const groupCheck = await prisma.incomeGroup.findUnique({
            where: { id: groupId },
            select: { user_id: true }
        });
        if (!groupCheck) {
            return res.status(404).json({ message: "income group not found" });
        }
        if (groupCheck.user_id !== req.user.id) {
            return res.status(403).json({ message: "Only the group owner can delete this group" });
        }

        // Delete the income group (cascades to incomes and collaborators)
        await prisma.incomeGroup.delete({
            where: { id: groupId }
        });

        res.json({ message: "income group deleted successfully" });
    } catch (err) {
        console.error(err.message);
        res.status(500).send("Server error");
    }
});

/**
 * Add collaborator to income group
 * POST /api/incomes/groups/:id/collaborators
 */
router.post("/groups/:id/collaborators", auth, async (req, res) => {
    try {
        const groupId = parseInt(req.params.id);
        const { user_email, role } = req.body;

        // Validate input
        if (!user_email || !['viewer', 'editor'].includes(role)) {
            return res.status(400).json({ message: "Invalid email or role" });
        }

        // Check if the requesting user is the group owner
        const groupCheck = await prisma.incomeGroup.findUnique({
            where: { id: groupId },
            select: { user_id: true }
        });
        if (!groupCheck) {
            return res.status(404).json({ message: "income group not found" });
        }
        if (groupCheck.user_id !== req.user.id) {
            return res.status(403).json({ message: "Only the group owner can add collaborators" });
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
            return res.status(400).json({ message: "Cannot add group owner as collaborator" });
        }

        // Add collaborator (upsert)
        await prisma.incomeGroupCollaborator.upsert({
            where: {
                income_group_id_user_id: {
                    income_group_id: groupId,
                    user_id: collaboratorId
                }
            },
            update: {
                role
            },
            create: {
                income_group_id: groupId,
                user_id: collaboratorId,
                role
            }
        });

        res.status(201).json({ message: "Collaborator added successfully" });
    } catch (err) {
        console.error(err.message);
        res.status(500).send("Server error");
    }
});

/**
 * List all collaborators for an income group
 * GET /api/incomes/groups/:id/collaborators
 */
router.get("/groups/:id/collaborators", auth, async (req, res) => {
    try {
        const groupId = parseInt(req.params.id);

        // Check if the requesting user is the group owner
        const groupCheck = await prisma.incomeGroup.findUnique({
            where: { id: groupId },
            select: { user_id: true }
        });
        if (!groupCheck) {
            return res.status(404).json({ message: "income group not found" });
        }
        if (groupCheck.user_id !== req.user.id) {
            return res.status(403).json({ message: "Only the group owner can view collaborators" });
        }

        // Get all collaborators with user details
        const collaborators = await prisma.incomeGroupCollaborator.findMany({
            where: { income_group_id: groupId },
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
        console.error(err.message);
        res.status(500).send("Server error");
    }
});

/**
 * Remove a collaborator from an income group
 * DELETE /api/incomes/groups/:id/collaborators/:userId
 */
router.delete("/groups/:id/collaborators/:userId", auth, async (req, res) => {
    try {
        const groupId = parseInt(req.params.id);
        const userIdToRemove = parseInt(req.params.userId);

        // Check if the requesting user is the group owner
        const groupCheck = await prisma.incomeGroup.findUnique({
            where: { id: groupId },
            select: { user_id: true }
        });
        if (!groupCheck) {
            return res.status(404).json({ message: "income group not found" });
        }
        if (groupCheck.user_id !== req.user.id) {
            return res.status(403).json({ message: "Only the group owner can remove collaborators" });
        }

        // Prevent removing the owner
        if (userIdToRemove === req.user.id) {
            return res.status(400).json({ message: "Cannot remove the group owner" });
        }

        // Remove collaborator
        try {
            await prisma.incomeGroupCollaborator.delete({
                where: {
                    income_group_id_user_id: {
                        income_group_id: groupId,
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
        console.error(err.message);
        res.status(500).send("Server error");
    }
});

/**
 * Add income (standalone or to a group)
 * POST /api/incomes
 */
router.post("/", auth, upload.single("image"), async (req, res) => {
    try {
        const { title, amount, category, income_date, notes, income_group_id } = req.body;
        const imageUrl = req.file ? `/Uploads/${req.file.filename}` : null;

        // Validate input
        if (!title || !amount || !category) {
            return res.status(400).json({ message: "Title, amount, and category are required" });
        }

        // If income_group_id is provided, check access (owner or editor)
        if (income_group_id) {
            const groupId = parseInt(income_group_id);
            const incomeGroup = await prisma.incomeGroup.findUnique({
                where: { id: groupId },
                include: {
                    collaborators: {
                        where: {
                            user_id: req.user.id,
                            role: 'editor'
                        }
                    }
                }
            });
            
            if (!incomeGroup || (incomeGroup.user_id !== req.user.id && incomeGroup.collaborators.length === 0)) {
                return res.status(403).json({ message: "Not allowed to add incomes to this group" });
            }
        }

        const newincome = await prisma.income.create({
            data: {
                user_id: req.user.id,
                title,
                amount: parseFloat(amount),
                category,
                income_date: income_date ? new Date(income_date) : new Date(),
                notes: notes || null,
                image_url: imageUrl,
                income_group_id: income_group_id ? parseInt(income_group_id) : null
            }
        });

        res.json(newincome);
    } catch (err) {
        console.error(err.message);
        res.status(500).send("Server error");
    }
});


/**
 * Get all incomes (with optional filters, including income_group_id)
 * GET /api/incomes
 */
router.get("/", auth, async (req, res) => {
    try {
        const userId = req.user.id;
        const { category, startDate, endDate, income_group_id, page = 1, limit = 10, sortBy = "date", order = "desc" } = req.query;

        // Validate pagination
        const pageInt = parseInt(page, 10) || 1;
        const limitInt = parseInt(limit, 10) || 10;
        const skip = (pageInt - 1) * limitInt;

        // Build where clause
        const where = {
            OR: [
                { user_id: userId },
                {
                    income_group_id: { not: null },
                    income_group: {
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
                    }
                }
            ]
        };

        // Apply filters
        if (income_group_id) {
            where.income_group_id = parseInt(income_group_id);
        } else {
            // Allow standalone incomes (NULL income_group_id) or group incomes with access
            where.OR = [
                { user_id: userId, income_group_id: null },
                {
                    income_group_id: { not: null },
                    income_group: {
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
                    }
                }
            ];
        }

        if (category) {
            where.category = category;
        }
        if (startDate) {
            where.income_date = { ...where.income_date, gte: new Date(startDate) };
        }
        if (endDate) {
            where.income_date = { ...where.income_date, lte: new Date(endDate) };
        }

        // Determine sort order
        const sortOrder = order.toLowerCase() === "asc" ? "asc" : "desc";
        const orderBy = sortBy === "amount" ? { amount: sortOrder } : { income_date: sortOrder };

        // Fetch incomes and count
        const [incomes, total] = await Promise.all([
            prisma.income.findMany({
                where,
                skip,
                take: limitInt,
                orderBy
            }),
            prisma.income.count({ where })
        ]);

        res.json({
            page: pageInt,
            limit: limitInt,
            total,
            totalPages: Math.ceil(total / limitInt),
            data: incomes
        });
    } catch (err) {
        console.error(err.message);
        res.status(500).send("Server error");
    }
});


/**
 * Get particular income by id
 * GET /api/incomes/:id
 */
router.get("/:id", auth, async (req, res) => {
    try {
        const incomeId = parseInt(req.params.id);
        
        const income = await prisma.income.findFirst({
            where: {
                id: incomeId,
                OR: [
                    { user_id: req.user.id },
                    {
                        income_group_id: { not: null },
                        income_group: {
                            OR: [
                                { user_id: req.user.id },
                                {
                                    collaborators: {
                                        some: {
                                            user_id: req.user.id
                                        }
                                    }
                                }
                            ]
                        }
                    }
                ]
            }
        });

        if (!income) {
            return res.status(404).json({ message: "income not found or not accessible" });
        }
        res.json(income);
    } catch (err) {
        console.error(err.message);
        res.status(500).send("Server error");
    }
});

/**
 * Update income
 * PUT /api/incomes/:id
 */
router.put("/:id", auth, upload.single("image"), async (req, res) => {
    try {
        const incomeId = parseInt(req.params.id);
        const { title, amount, category, income_date, notes, income_group_id } = req.body;
        const imageUrl = req.file ? `/Uploads/${req.file.filename}` : null;

        // Validate input
        if (!title || !amount || !category) {
            return res.status(400).json({ message: "Title, amount, and category are required" });
        }

        // Check access (owner of income or editor of income group)
        const income = await prisma.income.findUnique({
            where: { id: incomeId },
            include: {
                income_group: {
                    include: {
                        collaborators: {
                            where: {
                                user_id: req.user.id,
                                role: 'editor'
                            }
                        }
                    }
                }
            }
        });

        if (!income) {
            return res.status(404).json({ message: "income not found" });
        }

        const hasAccess = income.user_id === req.user.id || 
                         (income.income_group && income.income_group.collaborators.length > 0);

        if (!hasAccess) {
            return res.status(403).json({ message: "Not allowed to update this income" });
        }

        // If income_group_id is provided, verify access
        if (income_group_id) {
            const groupId = parseInt(income_group_id);
            const incomeGroup = await prisma.incomeGroup.findUnique({
                where: { id: groupId },
                include: {
                    collaborators: {
                        where: {
                            user_id: req.user.id,
                            role: 'editor'
                        }
                    }
                }
            });
            
            if (!incomeGroup || (incomeGroup.user_id !== req.user.id && incomeGroup.collaborators.length === 0)) {
                return res.status(403).json({ message: "Not allowed to assign to this income group" });
            }
        }

        // Build update data
        const updateData = {
            title,
            amount: parseFloat(amount),
            category,
            income_date: income_date ? new Date(income_date) : undefined,
            notes: notes !== undefined ? notes : undefined,
            income_group_id: income_group_id !== undefined ? (income_group_id ? parseInt(income_group_id) : null) : undefined
        };

        if (imageUrl) {
            updateData.image_url = imageUrl;
        }

        const updatedincome = await prisma.income.update({
            where: { id: incomeId },
            data: updateData
        });

        res.json(updatedincome);
    } catch (err) {
        console.error(err.message);
        if (err.code === 'P2025') {
            return res.status(404).json({ message: "income not found or not yours" });
        }
        res.status(500).send("Server error");
    }
});

/**
 * Delete income
 * DELETE /api/incomes/:id
 */
router.delete("/:id", auth, async (req, res) => {
    try {
        const incomeId = parseInt(req.params.id);
        
        // Check access (owner of income or editor of income group)
        const income = await prisma.income.findUnique({
            where: { id: incomeId },
            include: {
                income_group: {
                    include: {
                        collaborators: {
                            where: {
                                user_id: req.user.id,
                                role: 'editor'
                            }
                        }
                    }
                }
            }
        });

        if (!income) {
            return res.status(404).json({ message: "income not found" });
        }

        const hasAccess = income.user_id === req.user.id || 
                         (income.income_group && income.income_group.collaborators.length > 0);

        if (!hasAccess) {
            return res.status(403).json({ message: "Not allowed to delete this income" });
        }

        await prisma.income.delete({
            where: { id: incomeId }
        });

        res.json({ message: "income deleted successfully" });
    } catch (err) {
        console.error(err.message);
        if (err.code === 'P2025') {
            return res.status(404).json({ message: "income not found or not yours" });
        }
        res.status(500).send("Server error");
    }
});

module.exports = router;
