const db = require("../config/db");

/* ===========================================================
   GET ANNOUNCEMENTS FOR STUDENT
=========================================================== */
exports.listForStudent = (req, res) => {
  if (req.user.role !== "student")
    return res.status(403).json({ message: "Only students allowed" });

  const studentId = req.user.id;

  const q = `
    SELECT DISTINCT e.schedule_id, e.subject_code
    FROM enrollment e
    WHERE e.student_id = ? AND e.status = 'Enrolled'
  `;

  db.query(q, [studentId], (err, rows) => {
    if (err) return res.status(500).json({ message: "DB error", err });

    const scheduleIds = rows.map(r => r.schedule_id).filter(Boolean);
    const subjectCodes = rows.map(r => r.subject_code).filter(Boolean);

    // BASE QUERY
    let sql = `
      SELECT a.announcement_id, a.message, a.date_posted, a.expiry_date,
             a.schedule_id,
             st.day, st.start_time, st.end_time,
             a.subject_code,
             cs.section_name,
             ad.name AS posted_by
      FROM announcements a
      LEFT JOIN schedule_times st ON st.schedule_id = a.schedule_id
      LEFT JOIN class_sections cs ON cs.section_id = st.section_id
      LEFT JOIN admins ad ON ad.admin_id = a.admin_id
      WHERE a.schedule_id IS NULL
    `;

    const params = [];

    // schedule announcements
    if (scheduleIds.length) {
      sql += ` OR a.schedule_id IN (${scheduleIds.map(() => "?").join(",")})`;
      params.push(...scheduleIds);
    }

    // subject announcements
    if (subjectCodes.length) {
      sql += ` OR a.subject_code IN (${subjectCodes.map(() => "?").join(",")})`;
      params.push(...subjectCodes);
    }

    sql += ` ORDER BY a.date_posted DESC`;

    db.query(sql, params, (err2, rows2) => {
      if (err2) return res.status(500).json({ message: "DB error", err: err2 });
      res.json(rows2);
    });
  });
};

/* ===========================================================
   GET ANNOUNCEMENTS FOR INSTRUCTOR
=========================================================== */
exports.listByInstructor = (req, res) => {
  const adminId = req.user.id;

  const q = `
    SELECT a.announcement_id, a.message, a.date_posted, a.expiry_date,
           a.schedule_id,
           st.day, st.start_time, st.end_time,
           a.subject_code,
           cs.section_name
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

/* ===========================================================
   CREATE ANNOUNCEMENT
=========================================================== */
exports.create = (req, res) => {
  const adminId = req.user.id;
  const { schedule_id, section_id, message, expiry_date } = req.body;

  if (!message || !message.trim()) {
    return res.status(400).json({ message: "Message is required" });
  }

  const resolveMeta = (cb) => {
    if (schedule_id) {
      const q = `
        SELECT st.schedule_id, cs.section_id, cs.subject_code
        FROM schedule_times st
        JOIN class_sections cs ON cs.section_id = st.section_id
        WHERE st.schedule_id = ?
        LIMIT 1
      `;
      return db.query(q, [schedule_id], (err, rows) => {
        if (err) return cb(err);
        if (!rows.length) return cb(new Error("Schedule not found"));

        cb(null, {
          scheduleId: rows[0].schedule_id,
          sectionId: rows[0].section_id,
          subjectCode: rows[0].subject_code
        });
      });
    }

    if (section_id) {
      const q = `
        SELECT section_id, subject_code
        FROM class_sections
        WHERE section_id = ?
        LIMIT 1
      `;
      return db.query(q, [section_id], (err, rows) => {
        if (err) return cb(err);
        if (!rows.length) return cb(new Error("Section not found"));

        cb(null, {
          scheduleId: null,
          sectionId: rows[0].section_id,
          subjectCode: rows[0].subject_code
        });
      });
    }

    cb(null, { scheduleId: null, sectionId: null, subjectCode: null });
  };

  resolveMeta((err, meta) => {
    if (err) return res.status(400).json({ message: err.message });

    const insert = `
      INSERT INTO announcements (admin_id, subject_code, schedule_id, message, expiry_date)
      VALUES (?, ?, ?, ?, ?)
    `;

    db.query(
      insert,
      [adminId, meta.subjectCode || null, meta.scheduleId, message, expiry_date || null],
      (err2, result) => {
        if (err2) return res.status(500).json({ message: "DB error", err: err2 });
        res.json({ message: "Announcement posted", id: result.insertId });
      }
    );
  });
};
