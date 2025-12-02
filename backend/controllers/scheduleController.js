const db = require("../config/db");

// return all schedules joined with subject and instructor (for timetable)
// scheduleController.getAllSchedules (REPLACE existing function)
exports.getAllSchedules = (req, res) => {
  // If admin wants all schedules, you can add role check later.
  // For now, this returns schedules for the logged-in student.
  if (req.user.role !== "student") {
    return res.status(403).json({ message: "Only students can call this endpoint in the current UI" });
  }

  const studentId = req.user.id;

  const q = `
    SELECT e.enrollment_id, e.status,
           st.schedule_id, st.day, st.start_time, st.end_time,
           cs.section_id, cs.subject_code, s.subject_name, cs.section_name,
           a.admin_id, a.name AS instructor
    FROM enrollment e
    JOIN schedule_times st ON st.schedule_id = e.schedule_id
    JOIN class_sections cs ON cs.section_id = st.section_id
    JOIN subjects s ON s.subject_code = cs.subject_code
    LEFT JOIN admins a ON a.admin_id = cs.instructor_id
    WHERE e.student_id = ?
    ORDER BY FIELD(st.day,'Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'), st.start_time
  `;
  db.query(q, [studentId], (err, rows) => {
    if (err) return res.status(500).json({ message: "DB error", err });
    res.json(rows);
  });
};


exports.getScheduleById = (req, res) => {
  const scheduleId = req.params.scheduleId;
  const q = `
    SELECT st.schedule_id, st.day, st.start_time, st.end_time,
           cs.section_id, cs.subject_code, s.subject_name,
           a.admin_id, a.name AS instructor
    FROM schedule_times st
    JOIN class_sections cs ON cs.section_id = st.section_id
    JOIN subjects s ON s.subject_code = cs.subject_code
    LEFT JOIN admins a ON a.admin_id = cs.instructor_id
    WHERE st.schedule_id = ?
  `;
  db.query(q, [scheduleId], (err, rows) => {
    if (err) return res.status(500).json({ message: "DB error", err });
    if (!rows.length) return res.status(404).json({ message: "Schedule not found" });
    res.json(rows[0]);
  });
};

// POST { student_id (optional), schedule_id } -> checks if time conflicts with student's enrolled schedules
exports.checkConflict = (req, res) => {
  const { schedule_id } = req.body;
  const studentId = req.user.id;

  if (!schedule_id) return res.status(400).json({ message: "schedule_id required" });

  // get the schedule times for this schedule_id
  const q1 = `SELECT day, start_time, end_time FROM schedule_times WHERE schedule_id = ?`;
  db.query(q1, [schedule_id], (err, rows) => {
    if (err) return res.status(500).json({ message: "DB error", err });
    if (!rows.length) return res.status(404).json({ message: "Schedule not found" });

    const target = rows[0]; // one schedule time row
    // get student's enrolled schedules times (status Enrolled)
    const q2 = `
      SELECT st.day, st.start_time, st.end_time
      FROM enrollment e
      JOIN schedule_times st ON st.schedule_id = e.schedule_id
      WHERE e.student_id = ? AND e.status = 'Enrolled'
    `;
    db.query(q2, [studentId], (err2, existing) => {
      if (err2) return res.status(500).json({ message: "DB error", err2 });

      const toSeconds = t => {
        // t is 'HH:MM:SS'
        const [hh, mm, ss] = (t || "00:00:00").split(":").map(Number);
        return hh * 3600 + mm * 60 + (ss || 0);
      };

      const conflict = existing.some(e => {
        if (e.day !== target.day) return false;
        const s1 = toSeconds(e.start_time);
        const e1 = toSeconds(e.end_time);
        const s2 = toSeconds(target.start_time);
        const e2 = toSeconds(target.end_time);
        // overlap if not (e1 <= s2 || e2 <= s1)
        return !(e1 <= s2 || e2 <= s1);
      });

      res.json({ conflict });
    });
  });
};
