const express = require("express");
const router = express.Router();
const { authMiddleware } = require("../middleware/authMiddleware");
const scheduleController = require("../controllers/scheduleController");

// All schedules (for timetable)
router.get("/", authMiddleware, scheduleController.getAllSchedules);

// Schedule detail
router.get("/:scheduleId", authMiddleware, scheduleController.getScheduleById);

// Check conflict for a student given schedule_id
router.post("/check-conflict", authMiddleware, scheduleController.checkConflict);

module.exports = router;
