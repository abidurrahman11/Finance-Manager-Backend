const express = require("express");
const prisma = require("../config/db");
const auth = require("../middleware/auth");

const router = express.Router();

/**
 * Get expense summary for the user
 * GET /api/analytics/summary
 * Optional query params: startDate (YYYY-MM-DD), endDate (YYYY-MM-DD), expense_group_id
 */
router.get("/summary", auth, async (req, res) => {
    try {
        const userId = req.user.id;
        const { startDate, endDate, expense_group_id } = req.query;

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

        if (expense_group_id) {
            where.expense_group_id = parseInt(expense_group_id);
        } else {
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

        if (startDate) {
            where.expense_date = { ...where.expense_date, gte: new Date(startDate) };
        }
        if (endDate) {
            where.expense_date = { ...where.expense_date, lte: new Date(endDate) };
        }

        // Get aggregation
        const [expense_count, total_spent, avg_amount] = await Promise.all([
            prisma.expense.count({ where }),
            prisma.expense.aggregate({
                where,
                _sum: { amount: true }
            }),
            prisma.expense.aggregate({
                where,
                _avg: { amount: true }
            })
        ]);

        res.json({
            expense_count,
            total_spent: total_spent._sum.amount || 0,
            average_amount: avg_amount._avg.amount ? parseFloat(avg_amount._avg.amount.toFixed(2)) : 0
        });
    } catch (err) {
        console.error(err.message);
        res.status(500).send("Server error");
    }
});

/**
 * Get total spent by category
 * GET /api/analytics/by-category
 * Optional query params: startDate (YYYY-MM-DD), endDate (YYYY-MM-DD), expense_group_id
 */
router.get("/by-category", auth, async (req, res) => {
    try {
        const userId = req.user.id;
        const { startDate, endDate, expense_group_id } = req.query;

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

        if (expense_group_id) {
            where.expense_group_id = parseInt(expense_group_id);
        } else {
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

        if (startDate) {
            where.expense_date = { ...where.expense_date, gte: new Date(startDate) };
        }
        if (endDate) {
            where.expense_date = { ...where.expense_date, lte: new Date(endDate) };
        }

        // Get all expenses matching the filter
        const expenses = await prisma.expense.findMany({
            where,
            select: {
                category: true,
                amount: true
            }
        });

        // Group by category and calculate totals
        const categoryTotals = {};
        expenses.forEach(expense => {
            if (!categoryTotals[expense.category]) {
                categoryTotals[expense.category] = {
                    category: expense.category,
                    expense_count: 0,
                    total_spent: 0
                };
            }
            categoryTotals[expense.category].expense_count++;
            categoryTotals[expense.category].total_spent += parseFloat(expense.amount);
        });

        // Convert to array and sort by total_spent DESC
        const result = Object.values(categoryTotals).sort((a, b) => b.total_spent - a.total_spent);

        res.json(result);
    } catch (err) {
        console.error(err.message);
        res.status(500).send("Server error");
    }
});

/**
 * Get monthly trends (last 12 months or specified range)
 * GET /api/analytics/monthly-trends
 * Optional query params: startDate (YYYY-MM-DD), endDate (YYYY-MM-DD), expense_group_id
 */
router.get("/monthly-trends", auth, async (req, res) => {
    try {
        const userId = req.user.id;
        const { startDate, endDate, expense_group_id } = req.query;

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

        if (expense_group_id) {
            where.expense_group_id = parseInt(expense_group_id);
        } else {
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

        if (startDate) {
            where.expense_date = { ...where.expense_date, gte: new Date(startDate) };
        } else {
            // Default to last 12 months if no startDate
            const twelveMonthsAgo = new Date();
            twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);
            where.expense_date = { ...where.expense_date, gte: twelveMonthsAgo };
        }
        if (endDate) {
            where.expense_date = { ...where.expense_date, lte: new Date(endDate) };
        }

        // Get all expenses matching the filter
        const expenses = await prisma.expense.findMany({
            where,
            select: {
                expense_date: true,
                amount: true
            }
        });

        // Group by month
        const monthlyTotals = {};
        expenses.forEach(expense => {
            const date = new Date(expense.expense_date);
            const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`;
            
            if (!monthlyTotals[monthKey]) {
                monthlyTotals[monthKey] = {
                    month: new Date(monthKey),
                    expense_count: 0,
                    total_spent: 0
                };
            }
            monthlyTotals[monthKey].expense_count++;
            monthlyTotals[monthKey].total_spent += parseFloat(expense.amount);
        });

        // Convert to array and sort by month DESC
        const result = Object.values(monthlyTotals).sort((a, b) => b.month - a.month);

        res.json(result);
    } catch (err) {
        console.error(err.message);
        res.status(500).send("Server error");
    }
});

/**
 * Get cash flow (income - expenses - paid bills) for a date range
 * GET /api/analytics/cash-flow
 * Optional query params: startDate (YYYY-MM-DD), endDate (YYYY-MM-DD)
 */
router.get("/cash-flow", auth, async (req, res) => {
    try {
        const userId = req.user.id;
        const { startDate, endDate } = req.query;

        // Build where clauses
        const incomeWhere = {
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

        const expenseWhere = {
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

        if (startDate) {
            incomeWhere.income_date = { ...incomeWhere.income_date, gte: new Date(startDate) };
            expenseWhere.expense_date = { ...expenseWhere.expense_date, gte: new Date(startDate) };
        }
        if (endDate) {
            incomeWhere.income_date = { ...incomeWhere.income_date, lte: new Date(endDate) };
            expenseWhere.expense_date = { ...expenseWhere.expense_date, lte: new Date(endDate) };
        }

        // Query for total income
        const incomeResult = await prisma.income.aggregate({
            where: incomeWhere,
            _sum: { amount: true }
        });
        const totalIncome = parseFloat(incomeResult._sum.amount) || 0;

        // Query for total expenses
        const expenseResult = await prisma.expense.aggregate({
            where: expenseWhere,
            _sum: { amount: true }
        });
        const totalExpenses = parseFloat(expenseResult._sum.amount) || 0;

        // Query for total paid bills
        const billsWhere = {
            bill: {
                user_id: userId
            },
            status: 'paid'
        };

        if (startDate) {
            billsWhere.payment_date = { ...billsWhere.payment_date, gte: new Date(startDate) };
        }
        if (endDate) {
            billsWhere.payment_date = { ...billsWhere.payment_date, lte: new Date(endDate) };
        }

        const billsResult = await prisma.billPayment.aggregate({
            where: billsWhere,
            _sum: { paid_amount: true }
        });
        const totalPaidBills = parseFloat(billsResult._sum.paid_amount) || 0;

        // Calculate cash flow
        const cashFlow = totalIncome - totalExpenses - totalPaidBills;

        res.json({
            total_income: totalIncome,
            total_expenses: totalExpenses,
            total_paid_bills: totalPaidBills,
            cash_flow: cashFlow
        });
    } catch (err) {
        console.error(err.message);
        res.status(500).send("Server error");
    }
});

module.exports = router;
