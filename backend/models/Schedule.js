const db = require("../config/db");
module.exports = {
  findAll: (cb) => db.query("SELECT * FROM schedule_times", cb)
};
