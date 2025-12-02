    const express = require("express");
    const router = express.Router();
    const { authMiddleware } = require("../middleware/authMiddleware");
    const announcementController = require("../controllers/announcementController");

    // Instructor
    router.get("/for-instructor", authMiddleware, announcementController.listByInstructor);

    // Student
    router.get("/for-student", authMiddleware, announcementController.listForStudent);

    // Create announcement
    router.post("/", authMiddleware, announcementController.create);

    module.exports = router;
