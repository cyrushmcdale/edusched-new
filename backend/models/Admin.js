// simple placeholder model - you can expand it later
const db = require("../config/db");
module.exports = {
  findById: (id, cb) => db.query("SELECT * FROM admins WHERE admin_id = ?", [id], cb)
};
