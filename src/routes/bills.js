/**
 * bills.js — REMOVED
 *
 * The recurring-bills feature was replaced by a fully offline Reminders feature
 * in the Flutter client (v2). All bill data is now stored locally in SQLite on
 * the device and requires no server support.
 *
 * The RecurringBill and BillPayment Prisma models and the corresponding
 * PostgreSQL tables (recurring_bills, bill_payments) can be safely deleted from
 * the database once any existing user data has been migrated or discarded.
 *
 * No routes are exported from this file; the module is kept solely as a
 * migration audit trail.
 */

const express = require("express");
const router = express.Router();

// No routes — feature is offline-only on the client.

module.exports = router;
