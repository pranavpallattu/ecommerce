const jwt = require("jsonwebtoken");
const User = require("../models/userSchema");

const authMiddleware = async (req, res, next) => {
  try {
    const token = req.cookies.auth_token;
    if (!token) return res.status(401).json({ message: "Login required" });

    const decoded = jwt.verify(token, process.env.JWT_SECRET_KEY);
    const user = await User.findById(decoded._id);

    if (!user) return res.status(401).json({ message: "User not found" });

    req.user = user;
    req.role = decoded.role;
    console.log("TOKEN:", token);
    console.log("DECODED:", decoded);
    next();
  } catch {
    return res.status(401).json({ message: "Invalid token" });
  }
};

const adminMiddleware = (req, res, next) => {
  if (req.role !== "admin") {
    return res.status(403).json({ message: "Admins only" });
  }
  next();
};

module.exports = { authMiddleware, adminMiddleware };

