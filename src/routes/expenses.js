const express = require("express");
const prisma = require("../config/db");
const auth = require("../middleware/auth");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const router = express.Router();

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
 * Create new expense group
 * POST /api/expenses/groups
 */
router.post("/groups", auth, async (req, res) => {
    try {
        const { title, description, start_date, end_date } = req.body;

        // Validate input
        if (!title) {
            return res.status(400).json({ message: "Title is required" });
        }

        const newGroup = await prisma.expenseGroup.create({
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
 * Get all expense groups for user (including collaborations)
 * GET /api/expenses/groups
 */
router.get("/groups", auth, async (req, res) => {
    try {
        // Get groups where user is owner
        const ownedGroups = await prisma.expenseGroup.findMany({
            where: { user_id: req.user.id },
            include: {
                collaborators: true
            }
        });

        // Get groups where user is collaborator
        const collaboratedGroups = await prisma.expenseGroupCollaborator.findMany({
            where: { user_id: req.user.id },
            include: {
                expense_group: true
            }
        });

        // Combine and format results
        const result = [
            ...ownedGroups.map(g => ({ ...g, role: 'owner' })),
            ...collaboratedGroups.map(c => ({ ...c.expense_group, role: c.role }))
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
 * Update expense group (only owner)
 * PUT /api/expenses/groups/:id
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
        const groupCheck = await prisma.expenseGroup.findUnique({
            where: { id: groupId },
            select: { user_id: true }
        });
        if (!groupCheck) {
            return res.status(404).json({ message: "Expense group not found" });
        }
        if (groupCheck.user_id !== req.user.id) {
            return res.status(403).json({ message: "Only the group owner can update this group" });
        }

        // Update the expense group
        const updatedGroup = await prisma.expenseGroup.update({
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
 * Delete expense group (only owner)
 * DELETE /api/expenses/groups/:id
 */
router.delete("/groups/:id", auth, async (req, res) => {
    try {
        const groupId = parseInt(req.params.id);

        // Check if the requesting user is the group owner
        const groupCheck = await prisma.expenseGroup.findUnique({
            where: { id: groupId },
            select: { user_id: true }
        });
        if (!groupCheck) {
            return res.status(404).json({ message: "Expense group not found" });
        }
        if (groupCheck.user_id !== req.user.id) {
            return res.status(403).json({ message: "Only the group owner can delete this group" });
        }

        // Delete the expense group (cascades to expenses and collaborators)
        await prisma.expenseGroup.delete({
            where: { id: groupId }
        });

        res.json({ message: "Expense group deleted successfully" });
    } catch (err) {
        console.error(err.message);
        res.status(500).send("Server error");
    }
});

/**
 * Add collaborator to expense group
 * POST /api/expenses/groups/:id/collaborators
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
        const groupCheck = await prisma.expenseGroup.findUnique({
            where: { id: groupId },
            select: { user_id: true }
        });
        if (!groupCheck) {
            return res.status(404).json({ message: "Expense group not found" });
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
        await prisma.expenseGroupCollaborator.upsert({
            where: {
                expense_group_id_user_id: {
                    expense_group_id: groupId,
                    user_id: collaboratorId
                }
            },
            update: {
                role
            },
            create: {
                expense_group_id: groupId,
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
 * List all collaborators for an expense group
 * GET /api/expenses/groups/:id/collaborators
 */
router.get("/groups/:id/collaborators", auth, async (req, res) => {
    try {
        const groupId = parseInt(req.params.id);

        // Check if the requesting user is the group owner
        const groupCheck = await prisma.expenseGroup.findUnique({
            where: { id: groupId },
            select: { user_id: true }
        });
        if (!groupCheck) {
            return res.status(404).json({ message: "Expense group not found" });
        }
        if (groupCheck.user_id !== req.user.id) {
            return res.status(403).json({ message: "Only the group owner can view collaborators" });
        }

        // Get all collaborators with user details
        const collaborators = await prisma.expenseGroupCollaborator.findMany({
            where: { expense_group_id: groupId },
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
 * Remove a collaborator from an expense group
 * DELETE /api/expenses/groups/:id/collaborators/:userId
 */
router.delete("/groups/:id/collaborators/:userId", auth, async (req, res) => {
    try {
        const groupId = parseInt(req.params.id);
        const userIdToRemove = parseInt(req.params.userId);

        // Check if the requesting user is the group owner
        const groupCheck = await prisma.expenseGroup.findUnique({
            where: { id: groupId },
            select: { user_id: true }
        });
        if (!groupCheck) {
            return res.status(404).json({ message: "Expense group not found" });
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
            await prisma.expenseGroupCollaborator.delete({
                where: {
                    expense_group_id_user_id: {
                        expense_group_id: groupId,
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
 * Add expense (standalone or to a group)
 * POST /api/expenses
 */
router.post("/", auth, upload.single("image"), async (req, res) => {
    try {
        const { title, amount, category, expense_date, notes, expense_group_id } = req.body;
        const imageUrl = req.file ? `/Uploads/${req.file.filename}` : null;

        // Validate input
        if (!title || !amount || !category) {
            return res.status(400).json({ message: "Title, amount, and category are required" });
        }

        // If expense_group_id is provided, check access (owner or editor)
        if (expense_group_id) {
            const groupId = parseInt(expense_group_id);
            const expenseGroup = await prisma.expenseGroup.findUnique({
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
            
            if (!expenseGroup || (expenseGroup.user_id !== req.user.id && expenseGroup.collaborators.length === 0)) {
                return res.status(403).json({ message: "Not allowed to add expenses to this group" });
            }
        }

        const newExpense = await prisma.expense.create({
            data: {
                user_id: req.user.id,
                title,
                amount: parseFloat(amount),
                category,
                expense_date: expense_date ? new Date(expense_date) : new Date(),
                notes: notes || null,
                image_url: imageUrl,
                expense_group_id: expense_group_id ? parseInt(expense_group_id) : null
            }
        });

        res.json(newExpense);
    } catch (err) {
        console.error(err.message);
        res.status(500).send("Server error");
    }
});


/**
 * Get all expenses (with optional filters, including expense_group_id)
 * GET /api/expenses
 */
router.get("/", auth, async (req, res) => {
    try {
        const userId = req.user.id;
        const { category, startDate, endDate, expense_group_id, page = 1, limit = 10, sortBy = "date", order = "desc" } = req.query;

        // Validate pagination
        const pageInt = parseInt(page, 10) || 1;
        const limitInt = parseInt(limit, 10) || 10;
        const skip = (pageInt - 1) * limitInt;

        // Build where clause
        const where = {
            OR: [
                { user_id: userId },
                {
                    expense_group_id: { not: null },
                    expense_group: {
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
        if (expense_group_id) {
            where.expense_group_id = parseInt(expense_group_id);
        } else {
            // Allow standalone expenses (NULL expense_group_id) or group expenses with access
            where.OR = [
                { user_id: userId, expense_group_id: null },
                {
                    expense_group_id: { not: null },
                    expense_group: {
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
            where.expense_date = { ...where.expense_date, gte: new Date(startDate) };
        }
        if (endDate) {
            where.expense_date = { ...where.expense_date, lte: new Date(endDate) };
        }

        // Determine sort order
        const sortOrder = order.toLowerCase() === "asc" ? "asc" : "desc";
        const orderBy = sortBy === "amount" ? { amount: sortOrder } : { expense_date: sortOrder };

        // Fetch expenses and count
        const [expenses, total] = await Promise.all([
            prisma.expense.findMany({
                where,
                skip,
                take: limitInt,
                orderBy
            }),
            prisma.expense.count({ where })
        ]);

        res.json({
            page: pageInt,
            limit: limitInt,
            total,
            totalPages: Math.ceil(total / limitInt),
            data: expenses
        });
    } catch (err) {
        console.error(err.message);
        res.status(500).send("Server error");
    }
});


/**
 * Get particular expense by id
 * GET /api/expenses/:id
 */
router.get("/:id", auth, async (req, res) => {
    try {
        const expenseId = parseInt(req.params.id);
        
        const expense = await prisma.expense.findFirst({
            where: {
                id: expenseId,
                OR: [
                    { user_id: req.user.id },
                    {
                        expense_group_id: { not: null },
                        expense_group: {
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

        if (!expense) {
            return res.status(404).json({ message: "Expense not found or not accessible" });
        }
        res.json(expense);
    } catch (err) {
        console.error(err.message);
        res.status(500).send("Server error");
    }
});

/**
 * Update expense
 * PUT /api/expenses/:id
 */
router.put("/:id", auth, upload.single("image"), async (req, res) => {
    try {
        const expenseId = parseInt(req.params.id);
        const { title, amount, category, expense_date, notes, expense_group_id } = req.body;
        const imageUrl = req.file ? `/Uploads/${req.file.filename}` : null;

        // Validate input
        if (!title || !amount || !category) {
            return res.status(400).json({ message: "Title, amount, and category are required" });
        }

        // Check access (owner of expense or editor of expense group)
        const expense = await prisma.expense.findUnique({
            where: { id: expenseId },
            include: {
                expense_group: {
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

        if (!expense) {
            return res.status(404).json({ message: "Expense not found" });
        }

        const hasAccess = expense.user_id === req.user.id || 
                         (expense.expense_group && expense.expense_group.collaborators.length > 0);

        if (!hasAccess) {
            return res.status(403).json({ message: "Not allowed to update this expense" });
        }

        // If expense_group_id is provided, verify access
        if (expense_group_id) {
            const groupId = parseInt(expense_group_id);
            const expenseGroup = await prisma.expenseGroup.findUnique({
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
            
            if (!expenseGroup || (expenseGroup.user_id !== req.user.id && expenseGroup.collaborators.length === 0)) {
                return res.status(403).json({ message: "Not allowed to assign to this expense group" });
            }
        }

        // Build update data
        const updateData = {
            title,
            amount: parseFloat(amount),
            category,
            expense_date: expense_date ? new Date(expense_date) : undefined,
            notes: notes !== undefined ? notes : undefined,
            expense_group_id: expense_group_id !== undefined ? (expense_group_id ? parseInt(expense_group_id) : null) : undefined
        };

        if (imageUrl) {
            updateData.image_url = imageUrl;
        }

        const updatedExpense = await prisma.expense.update({
            where: { id: expenseId },
            data: updateData
        });

        res.json(updatedExpense);
    } catch (err) {
        console.error(err.message);
        if (err.code === 'P2025') {
            return res.status(404).json({ message: "Expense not found or not yours" });
        }
        res.status(500).send("Server error");
    }
});

/**
 * Delete expense
 * DELETE /api/expenses/:id
 */
router.delete("/:id", auth, async (req, res) => {
    try {
        const expenseId = parseInt(req.params.id);
        
        // Check access (owner of expense or editor of expense group)
        const expense = await prisma.expense.findUnique({
            where: { id: expenseId },
            include: {
                expense_group: {
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

        if (!expense) {
            return res.status(404).json({ message: "Expense not found" });
        }

        const hasAccess = expense.user_id === req.user.id || 
                         (expense.expense_group && expense.expense_group.collaborators.length > 0);

        if (!hasAccess) {
            return res.status(403).json({ message: "Not allowed to delete this expense" });
        }

        await prisma.expense.delete({
            where: { id: expenseId }
        });

        res.json({ message: "Expense deleted successfully" });
    } catch (err) {
        console.error(err.message);
        if (err.code === 'P2025') {
            return res.status(404).json({ message: "Expense not found or not yours" });
        }
        res.status(500).send("Server error");
    }
});

module.exports = router;
