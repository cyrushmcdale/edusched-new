// controllers/studentController.js
const db = require("../config/db");

// get profile for logged in student
exports.getProfile = (req, res) => {
  if (req.user.role !== "student") return res.status(403).json({ message: "Not a student" });
  const studentId = req.user.id;
  const q = `SELECT student_id, name, email, course, year_level FROM students WHERE student_id = ?`;
  db.query(q, [studentId], (err, rows) => {
    if (err) return res.status(500).json({ message: "DB error", err });
    if (rows.length === 0) return res.status(404).json({ message: "Student not found" });
    res.json(rows[0]);
  });
};

// LIST AVAILABLE SUBJECTS (current-year 1st sem + retake-only-if-failed & same-semester)
exports.availableSubjects = (req, res) => {
  if (req.user.role !== "student") return res.status(403).json({ message: "Only students" });

  const studentId = req.user.id;

  const qStudent = `
    SELECT year_level 
    FROM students 
    WHERE student_id = ?
  `;

  db.query(qStudent, [studentId], (err, sRows) => {
    if (err) return res.status(500).json({ message: "DB error", err });
    if (!sRows.length) return res.status(404).json({ message: "Student not found" });

    const currentYear = sRows[0].year_level;

    // 🔵 Get FAILED subjects for the SAME semester (Rule A)
    const qFailed = `
      SELECT g.subject_code
      FROM grades g
      JOIN subjects s ON s.subject_code = g.subject_code
      WHERE g.student_id = ?
        AND g.status IN ('Failed','Dropped','Incomplete')
        AND s.semester = '1st'       -- match current semester
    `;

    db.query(qFailed, [studentId], (err2, fRows) => {
      if (err2) return res.status(500).json({ message: "DB error", err2 });

      const failedSubjects = fRows.map(r => r.subject_code);

      // 🔵 Current year's 1st semester subjects
      const qCurrent = `
        SELECT subject_code, subject_name, units, year_level, semester
        FROM subjects
        WHERE year_level = ?
          AND semester = '1st'
      `;

      db.query(qCurrent, [currentYear], (err3, currentSubjects) => {
        if (err3) return res.status(500).json({ message: "DB error", err3 });

        // 🔵 Subjects to retake (failed 1st sem subjects)
        const qRetake = `
          SELECT subject_code, subject_name, units, year_level, semester
          FROM subjects
          WHERE semester = '1st'
            AND subject_code IN (?)
        `;

        const failedParams = failedSubjects.length ? failedSubjects : ["__NONE__"];

        db.query(qRetake, [failedParams], (err4, retakeSubs) => {
          if (err4) return res.status(500).json({ message: "DB error", err4 });

          const candidates = [...currentSubjects, ...retakeSubs];

          if (!candidates.length) return res.json([]);

          const codes = candidates.map(s => s.subject_code);

          // get prerequisites
          const qPrereqs = `
            SELECT subject_code, prereq_code
            FROM subject_prerequisites
            WHERE subject_code IN (?)
          `;

          db.query(qPrereqs, [codes], (err5, preRows) => {
            if (err5) return res.status(500).json({ message: "DB error", err5 });

            const qPassed = `
              SELECT subject_code
              FROM grades
              WHERE student_id = ?
                AND status = 'Passed'
            `;

            db.query(qPassed, [studentId], (err6, pRows) => {
              if (err6) return res.status(500).json({ message: "DB error", err6 });

              const passed = pRows.map(r => r.subject_code);

              // remove subjects already enrolled
              const qEnrolled = `
                SELECT subject_code
                FROM enrollment
                WHERE student_id = ?
                  AND status IN ('Enrolled', 'Pending')
              `;

              db.query(qEnrolled, [studentId], (err7, eRows) => {
                if (err7) return res.status(500).json({ message: "DB error", err7 });

                const enrolled = eRows.map(r => r.subject_code);

                const final = candidates.filter(sub => {
                  if (enrolled.includes(sub.subject_code)) return false;

                  const prereqs = preRows
                    .filter(p => p.subject_code === sub.subject_code)
                    .map(p => p.prereq_code);

                  const ok = prereqs.every(p => passed.includes(p));
                  return ok;
                });

                res.json(final);
              });
            });
          });
        });
      });
    });
  });
};


// SCHEDULES FOR A SUBJECT — GROUP BY SECTION
exports.schedulesForSubject = (req, res) => {
  const subjectCode = req.params.subjectCode;
  const q = `
    SELECT
      cs.section_id,
      cs.section_name,
      cs.subject_code,
      s.subject_name,
      a.admin_id,
      a.name AS instructor,
      GROUP_CONCAT(CONCAT(st.day, '::', TIME_FORMAT(st.start_time, '%H:%i:%s'), '::', TIME_FORMAT(st.end_time, '%H:%i:%s')) ORDER BY FIELD(st.day,'Monday','Tuesday','Wednesday','Thursday','Friday','Saturday') SEPARATOR '||') AS slots,
      MIN(st.start_time) AS first_start,
      MAX(st.end_time) AS last_end
    FROM class_sections cs
    JOIN schedule_times st ON st.section_id = cs.section_id
    JOIN subjects s ON s.subject_code = cs.subject_code
    LEFT JOIN admins a ON a.admin_id = cs.instructor_id
    WHERE cs.subject_code = ?
    GROUP BY cs.section_id, cs.section_name, cs.subject_code, s.subject_name, a.admin_id, a.name
    ORDER BY cs.section_name
  `;
  db.query(q, [subjectCode], (err, rows) => {
    if (err) return res.status(500).json({ message: "DB error", err });
    // rows contain `slots` like "Monday::07:30:00::08:30:00||Wednesday::07:30:00::08:30:00"
    res.json(rows);
  });
};

// ENROLL with robust checks (accepts section_id or schedule_id)
exports.enroll = (req, res) => {
  if (req.user.role !== "student") return res.status(403).json({ message: "Only students can enroll" });

  const studentId = req.user.id;
  const { section_id, schedule_id } = req.body;

  if (!section_id && !schedule_id) return res.status(400).json({ message: "schedule_id or section_id is required" });

  // Helper: get all schedule_times for the chosen section (if schedule_id given, find its section)
  const getSectionSchedules = (cb) => {
    if (section_id) {
      const q = `SELECT schedule_id, day, start_time, end_time FROM schedule_times WHERE section_id = ?`;
      return db.query(q, [section_id], (err, rows) => {
        if (err) return cb(err);
        if (!rows.length) return cb(new Error("No schedules for section"));
        cb(null, { sectionId: section_id, schedules: rows });
      });
    } else {
      // find section for provided schedule_id
      const q = `SELECT st.schedule_id, st.day, st.start_time, st.end_time, cs.section_id FROM schedule_times st JOIN class_sections cs ON cs.section_id = st.section_id WHERE st.schedule_id = ?`;
      db.query(q, [schedule_id], (err, rows) => {
        if (err) return cb(err);
        if (!rows.length) return cb(new Error("Schedule not found"));
        const sectionId = rows[0].section_id;
        // fetch all schedules for that section
        const q2 = `SELECT schedule_id, day, start_time, end_time FROM schedule_times WHERE section_id = ?`;
        db.query(q2, [sectionId], (err2, rows2) => {
          if (err2) return cb(err2);
          if (!rows2.length) return cb(new Error("No schedules for section"));
          cb(null, { sectionId, schedules: rows2 });
        });
      });
    }
  };

  getSectionSchedules((err, sectionData) => {
    if (err) return res.status(400).json({ message: err.message || "No schedules found" });

    const chosenSchedules = sectionData.schedules; // array of { schedule_id, day, start_time, end_time }
    const chosenScheduleIdRepresentative = chosenSchedules[0].schedule_id;

    // 1) check already enrolled/pending (by *subject* or by schedule)
    // first fetch subject_code for this section
    const qSubject = `
      SELECT cs.subject_code, s.subject_name, s.semester, s.year_level
      FROM class_sections cs
      JOIN subjects s ON s.subject_code = cs.subject_code
      WHERE cs.section_id = ?
      LIMIT 1
    `;
    db.query(qSubject, [sectionData.sectionId], (err2, subjRows) => {
      if (err2) return res.status(500).json({ message: "DB error", err2 });
      if (!subjRows.length) return res.status(400).json({ message: "Section/subject not found" });

      const subjectCode = subjRows[0].subject_code;
      const subjectSemester = subjRows[0].semester;
      const subjectYearLevel = subjRows[0].year_level;

      // check if student already has enrollment for this subject
      const qCheckSubject = `SELECT * FROM enrollment WHERE student_id = ? AND subject_code = ? AND status IN ('Enrolled','Pending')`;
      db.query(qCheckSubject, [studentId, subjectCode], (err3, alreadyRows) => {
        if (err3) return res.status(500).json({ message: "DB error", err3 });
        if (alreadyRows.length) return res.status(400).json({ message: "Already enrolled or requested for this subject" });

        // 2) check prerequisites: fetch prereqs, ensure student passed them
        const qPrereqs = `SELECT prereq_code FROM subject_prerequisites WHERE subject_code = ?`;
        db.query(qPrereqs, [subjectCode], (err4, preRows) => {
          if (err4) return res.status(500).json({ message: "DB error", err4 });

          const prereqs = preRows.map(r => r.prereq_code);
          if (prereqs.length > 0) {
            const qPassed = `SELECT subject_code FROM grades WHERE student_id = ? AND status = 'Passed' AND subject_code IN (?)`;
            db.query(qPassed, [studentId, prereqs], (err5, passRows) => {
              if (err5) return res.status(500).json({ message: "DB error", err5 });
              const passed = passRows.map(r => r.subject_code);
              const missing = prereqs.filter(p => !passed.includes(p));
              if (missing.length) {
                return res.status(400).json({ message: `Prerequisite(s) not passed: ${missing.join(", ")}` });
              }
              // proceed to conflict check
              doConflictCheckAndInsert();
            });
          } else {
            doConflictCheckAndInsert();
          }

          // conflict check function
          function doConflictCheckAndInsert() {
            // get all student's currently ENROLLED schedule_times
            const qExisting = `
              SELECT st.day, st.start_time, st.end_time
              FROM enrollment e
              JOIN schedule_times st ON st.schedule_id = e.schedule_id
              WHERE e.student_id = ? AND e.status = 'Enrolled'
            `;
            db.query(qExisting, [studentId], (err6, existingRows) => {
              if (err6) return res.status(500).json({ message: "DB error", err6 });

              // helper to convert "HH:MM:SS" -> seconds
              const toSec = t => {
                const [hh, mm, ss] = (t || "00:00:00").split(":").map(Number);
                return hh * 3600 + mm * 60 + (ss || 0);
              };

              const conflict = chosenSchedules.some(target => {
                return existingRows.some(ex => {
                  if (ex.day !== target.day) return false;
                  const s1 = toSec(ex.start_time);
                  const e1 = toSec(ex.end_time);
                  const s2 = toSec(target.start_time);
                  const e2 = toSec(target.end_time);
                  // overlap if not (e1 <= s2 || e2 <= s1)
                  return !(e1 <= s2 || e2 <= s1);
                });
              });

              if (conflict) {
                return res.status(400).json({ message: "Schedule conflict with your existing enrolled schedules." });
              }

              // All checks passed - insert enrollment using a representative schedule_id
              const insertQ = `INSERT INTO enrollment (student_id, schedule_id, subject_code, status) VALUES (?, ?, ?, 'Pending')`;
              db.query(insertQ, [studentId, chosenScheduleIdRepresentative, subjectCode], (err7, result) => {
                if (err7) return res.status(500).json({ message: "DB error", err7 });
                res.json({ message: "Enrollment request submitted", enrollment_id: result.insertId });
              });
            });
          } // end doConflictCheckAndInsert
        }); // end qPrereqs
      }); // end qCheckSubject
    }); // end qSubject
  }); // end getSectionSchedules
};


// MY SCHEDULES (only enrolled)
exports.mySchedules = (req, res) => {
  if (req.user.role !== "student") return res.status(403).json({ message: "Not a student" });
  const studentId = req.user.id;
  const q = `
    SELECT e.enrollment_id, e.status, st.schedule_id, st.day, st.start_time, st.end_time,
           cs.section_id, cs.subject_code, s.subject_name, a.admin_id, a.name AS instructor, cs.section_name
    FROM enrollment e
    JOIN schedule_times st ON st.schedule_id = e.schedule_id
    JOIN class_sections cs ON cs.section_id = st.section_id
    JOIN subjects s ON s.subject_code = cs.subject_code
    LEFT JOIN admins a ON a.admin_id = cs.instructor_id
    WHERE e.student_id = ? AND e.status = 'Enrolled'
    ORDER BY FIELD(st.day,'Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'), st.start_time
  `;
  db.query(q, [studentId], (err, rows) => {
    if (err) return res.status(500).json({ message: "DB error", err });
    res.json(rows);
  });
};
