const jwt = require("jsonwebtoken");
const User = require("../models/userSchema");

// Verifies JWT, authenticates the user, and attaches user data to the request
const authMiddleware = async (req, res, next) => {
  try {
    const token = req.cookies.auth_token;
    if (!token) return res.status(401).json({ message: "Login required" });

    const decoded = jwt.verify(token, process.env.JWT_SECRET_KEY);
    const user = await User.findById(decoded._id);

    if (!user) return res.status(401).json({ message: "User not found" });

    req.user = user;
    req.role = decoded.role;
    next();
  } catch {
    return res.status(401).json({ message: "Invalid token" });
  }
};


// Allows access only to users with the admin role
const adminMiddleware = (req, res, next) => {
  if (req.role !== "admin") {
    return res.status(403).json({ message: "Admins only" });
  }
  next();
};

// Blocks admins and allows access only to regular customers
const userMiddleware = (req, res, next) => {
  if (req.user.isAdmin) {
    return res.status(403).json({
      success: false,
      message: "Admins cannot access customer features.",
    });
  }

  next();
};

module.exports = { authMiddleware, adminMiddleware, userMiddleware };

