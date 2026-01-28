const express = require("express");
const prisma = require("../config/db");
const auth = require("../middleware/auth");

const router = express.Router();

/**
 * Create a new recurring bill
 * POST /api/bills
 */
router.post("/", auth, async (req, res) => {
    try {
        const { title, amount, due_day, notes } = req.body;

        // Validate input
        if (!title || !amount || amount <= 0 || !due_day || due_day < 1 || due_day > 31) {
            return res.status(400).json({ message: "Invalid title, amount, or due_day" });
        }

        const newBill = await prisma.recurringBill.create({
            data: {
                user_id: req.user.id,
                title,
                amount: parseFloat(amount),
                due_day: parseInt(due_day),
                notes: notes || null
            }
        });

        res.json(newBill);
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ message: "Server error", error: err.message });
    }
});

/**
 * Get all recurring bills for the user
 * GET /api/bills
 */
router.get("/", auth, async (req, res) => {
    try {
        const bills = await prisma.recurringBill.findMany({
            where: { user_id: req.user.id },
            orderBy: { created_at: 'desc' }
        });

        res.json(bills);
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ message: "Server error", error: err.message });
    }
});

/**
 * Update a recurring bill (owner only)
 * PUT /api/bills/:id
 */
router.put("/:id", auth, async (req, res) => {
    try {
        const billId = parseInt(req.params.id);
        const { title, amount, due_day, notes } = req.body;

        // Validate input
        if (!title || !amount || amount <= 0 || !due_day || due_day < 1 || due_day > 31) {
            return res.status(400).json({ message: "Invalid title, amount, or due_day" });
        }

        // Check ownership
        const billCheck = await prisma.recurringBill.findUnique({
            where: { id: billId },
            select: { user_id: true }
        });
        if (!billCheck || billCheck.user_id !== req.user.id) {
            return res.status(404).json({ message: "Bill not found or not yours" });
        }

        const updatedBill = await prisma.recurringBill.update({
            where: { id: billId },
            data: {
                title,
                amount: parseFloat(amount),
                due_day: parseInt(due_day),
                notes: notes !== undefined ? notes : undefined
            }
        });

        res.json(updatedBill);
    } catch (err) {
        console.error(err.message);
        if (err.code === 'P2025') {
            return res.status(404).json({ message: "Bill not found or not yours" });
        }
        res.status(500).json({ message: "Server error", error: err.message });
    }
});

/**
 * Delete a recurring bill (owner only)
 * DELETE /api/bills/:id
 */
router.delete("/:id", auth, async (req, res) => {
    try {
        const billId = parseInt(req.params.id);

        // Check ownership
        const billCheck = await prisma.recurringBill.findUnique({
            where: { id: billId },
            select: { user_id: true }
        });
        if (!billCheck || billCheck.user_id !== req.user.id) {
            return res.status(404).json({ message: "Bill not found or not yours" });
        }

        await prisma.recurringBill.delete({
            where: { id: billId }
        });

        res.json({ message: "Bill deleted successfully" });
    } catch (err) {
        console.error(err.message);
        if (err.code === 'P2025') {
            return res.status(404).json({ message: "Bill not found or not yours" });
        }
        res.status(500).json({ message: "Server error", error: err.message });
    }
});

/**
 * Mark or update payment for a bill in a specific month
 * POST /api/bills/:id/payments
 * Body: { month: 'YYYY-MM', status: 'paid', paid_amount: 1200, notes: '' }
 */
router.post("/:id/payments", auth, async (req, res) => {
    try {
        const billId = parseInt(req.params.id);
        const { month, status = 'paid', paid_amount, notes } = req.body;

        // Validate input
        if (!month || !/^\d{4}-\d{2}$/.test(month)) {
            return res.status(400).json({ message: "Invalid month format (use YYYY-MM)" });
        }
        if (!['pending', 'paid'].includes(status)) {
            return res.status(400).json({ message: "Invalid status" });
        }

        // Check ownership
        const billCheck = await prisma.recurringBill.findUnique({
            where: { id: billId },
            select: { user_id: true, amount: true }
        });
        if (!billCheck || billCheck.user_id !== req.user.id) {
            return res.status(404).json({ message: "Bill not found or not yours" });
        }

        const paymentDate = new Date(`${month}-01`);

        // Upsert payment
        const updatedPayment = await prisma.billPayment.upsert({
            where: {
                bill_id_payment_date: {
                    bill_id: billId,
                    payment_date: paymentDate
                }
            },
            update: {
                status,
                paid_amount: paid_amount ? parseFloat(paid_amount) : billCheck.amount,
                notes: notes || null
            },
            create: {
                bill_id: billId,
                payment_date: paymentDate,
                status,
                paid_amount: paid_amount ? parseFloat(paid_amount) : billCheck.amount,
                notes: notes || null
            }
        });

        res.json(updatedPayment);
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ message: "Server error", error: err.message });
    }
});

/**
 * Get bill payments for a specific month
 * GET /api/bills/payments?month=YYYY-MM
 */
router.get("/payments", auth, async (req, res) => {
    try {
        const { month } = req.query;

        // Validate input
        if (!month || !/^\d{4}-\d{2}$/.test(month)) {
            return res.status(400).json({ message: "Invalid month format (use YYYY-MM)" });
        }

        const paymentDate = new Date(`${month}-01`);

        // Get all bills and their payments for the month
        const bills = await prisma.recurringBill.findMany({
            where: { user_id: req.user.id },
            include: {
                payments: {
                    where: {
                        payment_date: paymentDate
                    }
                }
            },
            orderBy: { title: 'asc' }
        });

        // Return pending status for bills without payment entries
        const processedPayments = bills.map(bill => {
            const payment = bill.payments[0];
            if (!payment) {
                return {
                    bill_id: bill.id,
                    title: bill.title,
                    expected_amount: bill.amount,
                    due_day: bill.due_day,
                    bill_notes: bill.notes,
                    status: 'pending',
                    paid_amount: null,
                    payment_notes: null,
                    updated_at: null
                };
            }
            return {
                bill_id: bill.id,
                title: bill.title,
                expected_amount: bill.amount,
                due_day: bill.due_day,
                bill_notes: bill.notes,
                payment_id: payment.id,
                status: payment.status,
                paid_amount: payment.paid_amount,
                payment_notes: payment.notes,
                updated_at: payment.updated_at
            };
        });

        res.json(processedPayments);
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ message: "Server error", error: err.message });
    }
});

/**
 * Reset all bill payments to 'pending' for the current month
 * POST /api/bills/reset
 */
router.post("/reset", auth, async (req, res) => {
    try {
        const userId = req.user.id;
        const currentDate = new Date();
        const currentYear = currentDate.getFullYear();
        const currentMonthIndex = currentDate.getMonth();  // 0-11
        const currentMonth = String(currentMonthIndex + 1).padStart(2, '0');

        // Get last day of current month
        const lastDayOfMonth = new Date(currentYear, currentMonthIndex + 1, 0).getDate();

        // Get all bills for the user
        const bills = await prisma.recurringBill.findMany({
            where: { user_id: userId },
            select: { id: true, due_day: true }
        });

        if (bills.length === 0) {
            return res.status(404).json({ message: "No recurring bills found" });
        }

        // Payment date remains month-01 for simplicity
        const paymentDate = new Date(`${currentYear}-${currentMonth}-01`);

        // Use transaction to update all bills
        await prisma.$transaction(
            bills.map(bill => {
                // Validate and adjust due_day if invalid for current month
                let adjustedDueDay = bill.due_day;
                if (adjustedDueDay > lastDayOfMonth) {
                    adjustedDueDay = lastDayOfMonth;  // e.g., Feb 30 -> Feb 28
                }

                return prisma.billPayment.upsert({
                    where: {
                        bill_id_payment_date: {
                            bill_id: bill.id,
                            payment_date: paymentDate
                        }
                    },
                    update: {
                        status: 'pending',
                        paid_amount: null,
                        notes: null
                    },
                    create: {
                        bill_id: bill.id,
                        payment_date: paymentDate,
                        status: 'pending',
                        paid_amount: null,
                        notes: null
                    }
                });
            })
        );

        res.json({ message: `Bill payments reset to 'pending' for ${currentYear}-${currentMonth}` });
    } catch (err) {
        console.error('Error in reset payments:', err.message);
        res.status(500).json({ message: "Server error", error: err.message });
    }
});

module.exports = router;
