const db = require("../config/db");
module.exports = {
  create: (data, cb) => db.query("INSERT INTO announcements SET ?", data, cb)
};
