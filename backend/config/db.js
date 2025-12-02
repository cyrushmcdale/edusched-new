const mysql = require("mysql2");
require("dotenv").config();
const url = require("url");

// Parse Clever Cloud MySQL URI
const dbUrl = url.parse(process.env.MYSQL_ADDON_URI);

const [user, password] = dbUrl.auth.split(":");

const db = mysql.createPool({
  host: dbUrl.hostname,
  user,
  password,
  database: dbUrl.pathname.replace("/", ""),
  port: dbUrl.port,
  ssl: { rejectUnauthorized: false },
  waitForConnections: true,
  connectionLimit: 10,
});

db.getConnection((err, con) => {
  if (err) {
    console.log("❌ DB not connected:", err.code, err.sqlMessage || "");
  } else {
    console.log("🟢 Database connected");
    con.release();
  }
});

module.exports = db;
