const db = require("../config/db");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

exports.login = (req, res) => {
  const { userId, password, role } = req.body;

  if (!userId || !password || !role) {
    return res.status(400).json({ message: "All fields are required." });
  }

  // Determine table and ID field based on login attempt
  const table = role === "admin" ? "admins" : "students";
  const idField = role === "admin" ? "admin_id" : "student_id";

  const query = `SELECT * FROM ${table} WHERE ${idField} = ?`;

  db.query(query, [userId], (err, results) => {
    if (err) return res.status(500).json({ message: "Database error." });
    if (results.length === 0)
      return res.status(404).json({ message: "User not found." });

    const user = results[0];

    // Check password
    const passwordValid =
      password === user.password || bcrypt.compareSync(password, user.password);

    if (!passwordValid)
      return res.status(401).json({ message: "Invalid credentials." });

    // ENFORCE ROLE ONLY FOR ADMINS
    if (role === "admin") {
      if (!user.role || user.role !== "admin") {
        return res
          .status(403)
          .json({ message: "This account is not registered as admin." });
      }
    }

    // Students DO NOT have a role column → always allow if table = students

    const realRole = role === "admin" ? "admin" : "student";

    const token = jwt.sign(
      { id: user[idField], role: realRole },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );

    res.json({
      message: "Login successful!",
      token,
      role: realRole,
      id: user[idField],
      name: user.name,
      email: user.email,
    });
  });
};
