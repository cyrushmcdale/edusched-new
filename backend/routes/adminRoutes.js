const express = require("express");
const router = express.Router();
const { authMiddleware } = require("../middleware/authMiddleware");
const adminController = require("../controllers/adminController");

// Dashboard (totals and subjects instructor handles)
router.get("/dashboard", authMiddleware, adminController.dashboard);

// Get subjects handled by instructor (admin_id from req.user or param)
router.get("/subjects", authMiddleware, adminController.subjectsHandled);

// Get schedules for a subject/section
router.get("/subject/:sectionId/schedules", authMiddleware, adminController.getSchedulesForSection);

// Enrolled students for a schedule
router.get("/schedule/:scheduleId/enrolled", authMiddleware, adminController.enrolledStudents);

// Enrollment requests (pending) for a schedule
router.get("/schedule/:scheduleId/requests", authMiddleware, adminController.enrollmentRequests);

// Approve / Decline request
router.post("/request/:enrollmentId/approve", authMiddleware, adminController.approveRequest);
router.post("/request/:enrollmentId/decline", authMiddleware, adminController.declineRequest);

// Announcements by instructor
router.get("/announcements", authMiddleware, adminController.getMyAnnouncements);

module.exports = router;
