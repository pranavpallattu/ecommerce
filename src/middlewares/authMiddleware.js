const jwt = require("jsonwebtoken");
const User = require("../models/userSchema");

const userAuthMiddleware = async (req, res, next) => {
  try {
    const { token } = req.cookies;

    if (!token) {
    return  res.status(401).json({ message: "Please Login" });
    }

    const decodedObj = jwt.verify(token, "ecommerce@2025");
    const { _id } = decodedObj;

    const user = await User.findById(_id);
    if (!user) {
      throw new Error("user not found");
    }
    req.user = user;
    next();
  } catch (error) {
   return res.status(400).send(error);
  }
};

const adminAuthMiddleware = async (req, res, next) => {
  try {
    const { token } = req.cookies;

    if (!token) {
     return res.status(401).json({ message: "Please Login as Admin" });
    }

    const decodedObj = jwt.verify(token, "ecommerce@2025");
    const { _id } = decodedObj;
    const admin = await User.findById(_id);
    if (!admin || !admin.isAdmin) {
      return res.status(401).json({ message: "Access denied. Admins Only" });
    }
    req.user = admin;
    next();
  } catch (error) {
   return res.status(400).send(error);
  }
};

module.exports = { userAuthMiddleware, adminAuthMiddleware };
