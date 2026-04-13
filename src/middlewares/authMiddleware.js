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

// const userAuthMiddleware = async (req, res, next) => {
//   try {
//     const token = req.cookies.user_token;
//     if (!token) return res.status(401).json({ message: "Login required" });

//     const decoded = jwt.verify(token, process.env.JWT_SECRET_KEY);

//     if (decoded.role !== "user") {
//       return res.status(403).json({ message: "Not a user token" });
//     }

//     const user = await User.findById(decoded._id);
//     if (!user) return res.status(401).json({ message: "User not found" });

//     req.user = user;
//     next();
//   } catch {
//     return res.status(401).json({ message: "Invalid token" });
//   }
// };

// const adminAuthMiddleware = async (req, res, next) => {
//   try {
//     const token = req.cookies.admin_token;

//     if (!token) {
//       return res.status(401).json({ message: "Please Login as Admin" });
//     }

//     const decodedObj = jwt.verify(token, process.env.JWT_SECRET_KEY);
//     const { _id } = decodedObj;
//     const admin = await User.findById(_id);

//     if (decodedObj.role !== "admin") {
//       return res.status(403).json({ message: "Admin token required" });
//     }

//     if (!admin || !admin.isAdmin) {
//       return res.status(401).json({ message: "Access denied. Admins Only" });
//     }
//     req.user = admin;
//     next();
//   } catch (error) {
//     return res.status(400).send(error);
//   }
// };

// module.exports = { userAuthMiddleware, adminAuthMiddleware };

// const jwt = require("jsonwebtoken");
// const User = require("../models/userSchema");

// const adminAuthMiddleware = async (req, res, next) => {
//   try {
//     const token = req.cookies.admin_token;

//     if (!token) {
//       return res.status(401).json({ message: "Please Login" });
//     }

//     const decoded = jwt.verify(token, process.env.JWT_SECRET_KEY);

//     const user = await User.findById(decoded._id);
//     if (!user) return res.status(401).json({ message: "User not found" });

//     req.user = user;
//     req.role = decoded.role; // 🔥 IMPORTANT
//     next();
//   } catch (err) {
//     return res.status(401).json({ message: "Invalid token" });
//   }
// };

// const adminMiddleware = (req, res, next) => {
//   if (req.role !== "admin") {
//     return res.status(403).json({ message: "Admins only" });
//   }
//   next();
// };

// module.exports = { userAuthMiddleware, adminAuthMiddleware };
