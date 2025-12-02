const mysql = require("mysql2");
require("dotenv").config();

const db = mysql.createPool({
  uri: process.env.MYSQL_ADDON_URI,
  ssl: {
    rejectUnauthorized: false
  }
});

db.getConnection((err, con) => {
  if (err) {
    console.log("❌ DB not connected:", err);
  } else {
    console.log("🟢 Database connected");
    con.release();
  }
});

module.exports = db;
