const express = require("express");
const router = express.Router();
const { authMiddleware } = require("../middleware/authMiddleware");
const studentController = require("../controllers/studentController");

// Student profile
router.get("/me", authMiddleware, studentController.getProfile);

// Available subjects
router.get("/available-subjects", authMiddleware, studentController.availableSubjects);

// Available schedules for a subject code
router.get("/subject/:subjectCode/schedules", authMiddleware, studentController.schedulesForSubject);

// Enroll (create pending request)
router.post("/enroll", authMiddleware, studentController.enroll);

// My schedules (enrolled)
router.get("/my-schedules", authMiddleware, studentController.mySchedules);

module.exports = router;
