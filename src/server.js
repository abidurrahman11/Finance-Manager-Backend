const express = require("express");
const cors = require("cors");
const path = require("path");
require("dotenv").config();

const authRoutes = require("./routes/auth");
const expenseRoutes = require("./routes/expenses");
const analyticsRoutes = require("./routes/analytics");
const planRoutes = require("./routes/plans");
const incomeRoutes = require("./routes/incomes");
// Note: bills routes removed — the Reminders feature is fully offline on the client.

const app = express();
app.use(cors());
app.use(express.json());

// serve uploaded images
app.use("/uploads", express.static(path.join(__dirname, "../uploads")));

// routes
app.use("/api/auth", authRoutes);
app.use("/api/expenses", expenseRoutes);
app.use("/api/analytics", analyticsRoutes);
app.use("/api/plans", planRoutes);
app.use("/api/incomes", incomeRoutes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`server running on port ${PORT}`)
});
