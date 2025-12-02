const db = require("../config/db");
module.exports = {
  findById: (id, cb) => db.query("SELECT * FROM students WHERE student_id = ?", [id], cb)
};
