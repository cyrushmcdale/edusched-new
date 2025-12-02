const mysql = require("mysql2");
require("dotenv").config();

const db = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT,
  connectionLimit: 10
});

db.getConnection((err, con) => {
  if (err) {
    console.log("❌ DB not connected!", err);
  } else {
    console.log("🟢 Database connected");
    con.release();
  }
});

module.exports = db;
