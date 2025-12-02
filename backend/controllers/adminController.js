const db = require("../config/db");

// ===========================
//  DASHBOARD STATS
// ===========================
exports.dashboard = (req, res) => {
  const instructorId = req.user.id;

  const totalsQuery = `
    SELECT
      (
        SELECT COUNT(DISTINCT e.student_id)
        FROM enrollment e
        JOIN schedule_times st ON st.schedule_id = e.schedule_id
        JOIN class_sections cs ON cs.section_id = st.section_id
        WHERE cs.instructor_id = ?
          AND e.status = 'Enrolled'
      ) AS total_students,

      (
        SELECT COUNT(DISTINCT cs.subject_code)
        FROM class_sections cs
        WHERE cs.instructor_id = ?
      ) AS total_subjects,

      (
        SELECT COUNT(*)
        FROM class_sections cs
        WHERE cs.instructor_id = ?
      ) AS total_classes
  `;

  const subjectsQuery = `
    SELECT cs.section_id, cs.subject_code, s.subject_name, cs.section_name
    FROM class_sections cs
    JOIN subjects s ON s.subject_code = cs.subject_code
    WHERE cs.instructor_id = ?
  `;

  db.query(totalsQuery, [instructorId, instructorId, instructorId], (err, totals) => {
    if (err) return res.status(500).json({ message: "DB error", err });

    db.query(subjectsQuery, [instructorId], (err2, subjects) => {
      if (err2) return res.status(500).json({ message: "DB error", err2 });

      res.json({
        totals: totals[0],
        subjects
      });
    });
  });
};

// ===========================
//  SUBJECTS HANDLED
// ===========================
exports.subjectsHandled = (req, res) => {
  const instructorId = req.user.id;

  const q = `
    SELECT cs.section_id, cs.subject_code, s.subject_name, cs.section_name
    FROM class_sections cs
    JOIN subjects s ON s.subject_code = cs.subject_code
    WHERE cs.instructor_id = ?
  `;

  db.query(q, [instructorId], (err, rows) => {
    if (err) return res.status(500).json({ message: "DB error", err });
    res.json(rows);
  });
};

// ===========================
//  SCHEDULES OF SECTION
// ===========================
exports.getSchedulesForSection = (req, res) => {
  const sectionId = req.params.sectionId;

  const q = `
    SELECT schedule_id, day, start_time, end_time
    FROM schedule_times
    WHERE section_id = ?
    ORDER BY FIELD(day,'Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'), start_time
  `;

  db.query(q, [sectionId], (err, rows) => {
    if (err) return res.status(500).json({ message: "DB error", err });
    res.json(rows);
  });
};

// ===========================
//  ENROLLED STUDENTS
// ===========================
exports.enrolledStudents = (req, res) => {
  const scheduleId = req.params.scheduleId;

  const resolveSection = `SELECT section_id FROM schedule_times WHERE schedule_id = ? LIMIT 1`;

  db.query(resolveSection, [scheduleId], (err, srows) => {
    if (err) return res.status(500).json({ message: "DB error", err });
    if (!srows.length) return res.status(404).json({ message: "Schedule not found" });

    const sectionId = srows[0].section_id;

    const q = `
      SELECT DISTINCT s.student_id, s.name, s.email
      FROM enrollment e
      JOIN students s ON s.student_id = e.student_id
      JOIN schedule_times st ON st.schedule_id = e.schedule_id
      WHERE st.section_id = ?
        AND e.status = 'Enrolled'
      ORDER BY s.name
    `;

    db.query(q, [sectionId], (err2, rows) => {
      if (err2) return res.status(500).json({ message: "DB error", err2 });
      res.json(rows);
    });
  });
};

// ===========================
//  ENROLLMENT REQUESTS
// ===========================
exports.enrollmentRequests = (req, res) => {
  const scheduleId = req.params.scheduleId;

  const resolveSection = `SELECT section_id FROM schedule_times WHERE schedule_id = ? LIMIT 1`;

  db.query(resolveSection, [scheduleId], (err, srows) => {
    if (err) return res.status(500).json({ message: "DB error", err });
    if (!srows.length) return res.status(404).json({ message: "Schedule not found" });

    const sectionId = srows[0].section_id;

    const q = `
      SELECT DISTINCT e.enrollment_id, s.student_id, s.name, s.email
      FROM enrollment e
      JOIN students s ON s.student_id = e.student_id
      JOIN schedule_times st ON st.schedule_id = e.schedule_id
      WHERE st.section_id = ?
        AND e.status = 'Pending'
      ORDER BY s.name
    `;

    db.query(q, [sectionId], (err2, rows) => {
      if (err2) return res.status(500).json({ message: "DB error", err2 });
      res.json(rows);
    });
  });
};

// ===========================
//  APPROVE REQUEST (ENROLL TO FULL SECTION)
// ===========================
exports.approveRequest = (req, res) => {
  const enrollmentId = req.params.enrollmentId;

  // Step 1 — find student_id and section_id based on enrollment
  const q1 = `
    SELECT e.student_id, st.section_id
    FROM enrollment e
    JOIN schedule_times st ON st.schedule_id = e.schedule_id
    WHERE e.enrollment_id = ?
    LIMIT 1
  `;

  db.query(q1, [enrollmentId], (err, result) => {
    if (err) return res.status(500).json({ message: "DB error", err });
    if (!result.length)
      return res.status(404).json({ message: "Enrollment not found" });

    const studentId = result[0].student_id;
    const sectionId = result[0].section_id;

    // Step 2 — approve THIS enrollment
    db.query(
      `UPDATE enrollment SET status = 'Enrolled' WHERE enrollment_id = ?`,
      [enrollmentId]
    );

    // Step 3 — enroll student in ALL other schedule rows in the same section
    const q2 = `
      INSERT INTO enrollment (student_id, schedule_id, status)
      SELECT ?, st.schedule_id, 'Enrolled'
      FROM schedule_times st
      WHERE st.section_id = ?
        AND st.schedule_id NOT IN (
          SELECT schedule_id 
          FROM enrollment 
          WHERE student_id = ?
        )
    `;

    db.query(q2, [studentId, sectionId, studentId], (err2) => {
      if (err2)
        return res.status(500).json({ message: "DB error", err: err2 });

      res.json({ message: "Approved and enrolled in complete section schedule." });
    });
  });
};


exports.declineRequest = (req, res) => {
  const id = req.params.enrollmentId;

  db.query(`UPDATE enrollment SET status = 'Dropped' WHERE enrollment_id = ?`,
    [id], (err) => {
      if (err) return res.status(500).json({ message: "DB error", err });
      res.json({ message: "Declined" });
    });
};

// ===========================
//  ANNOUNCEMENTS
// ===========================
exports.getMyAnnouncements = (req, res) => {
  const adminId = req.user.id;

  const q = `
    SELECT a.announcement_id, a.message, a.date_posted,
           st.schedule_id, st.start_time, st.end_time, st.day,
           cs.section_id, cs.subject_code
    FROM announcements a
    LEFT JOIN schedule_times st ON st.schedule_id = a.schedule_id
    LEFT JOIN class_sections cs ON cs.section_id = st.section_id
    WHERE a.admin_id = ?
    ORDER BY a.date_posted DESC
  `;

  db.query(q, [adminId], (err, rows) => {
    if (err) return res.status(500).json({ message: "DB error", err });
    res.json(rows);
  });
};
