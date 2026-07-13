const jwt = require("jsonwebtoken");
const User = require("../../models/userSchema");
const { generateOtp, verifyOtp } = require("../../services/otpService");
const { sendOtpEmail } = require("../../config/resend");
const validator = require("validator");
const Otp = require("../../models/otpSchema");
const sendSMS = require("../../config/twiliosms");

// GOOGLE AUTH CALLBACK

const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
  path: "/",
};

exports.googleVerifyCallback = async (req, res) => {
  try {
    const user = req.user;
    console.log(user);

    if (user.isBlocked) {
      return res.status(403).json({ message: "Account blocked" });
    }

    const role = user.isAdmin ? "admin" : "user";

    const token = jwt.sign(
      { _id: user._id, role },
      process.env.JWT_SECRET_KEY,
      { expiresIn: "1d" },
    );

    res.cookie("auth_token", token, cookieOptions);

    return res.redirect(`${process.env.CLIENT_URL}/google-success`);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Google auth failed" });
  }
};

exports.getMe = async (req, res) => {
  try {
    return res.json({
      success: true,
      data: {
        _id: req.user._id,
        name: req.user.name,
        emailId: req.user.emailId,
        isAdmin: req.user.isAdmin,
        role: req.user.isAdmin ? "admin" : "user",
      },
    });
  } catch {
    return res.status(500).json({ message: "Failed to fetch user" });
  }
};

// REQUEST OTP (Unified for Login + Signup)

exports.requestAuthOtp = async (req, res) => {
  try {
    const { emailId } = req.body;

    if (!emailId) {
      return res.status(400).json({
        success: false,
        message: "Email is required",
      });
    }

    if (!validator.isEmail(emailId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid email format",
      });
    }

    const normalizedEmail = emailId.toLowerCase().trim();

    const existingUser = await User.findOne({ emailId: normalizedEmail });

    if (existingUser?.isBlocked) {
      return res.status(403).json({
        success: false,
        message: "Your account has been blocked. Contact support.",
      });
    }

    // Rate limit
    const existingOtp = await Otp.findOne({ emailId: normalizedEmail });

    if (existingOtp) {
      const seconds = (Date.now() - existingOtp.createdAt) / 1000;

      if (seconds < 60) {
        const wait = Math.ceil(60 - seconds);
        return res.status(429).json({
          success: false,
          message: `Please wait ${wait} second${
            wait !== 1 ? "s" : ""
          } before requesting a new OTP.`,
          retryAfter: wait,
        });
      }

      await Otp.deleteOne({ emailId: normalizedEmail });
    }

    // Generate new OTP
    const otp = generateOtp();

    const newOtpDocument = await Otp.create({
      emailId: normalizedEmail,
      otp,
      attempts: 0,
    });

    await sendOtpEmail(normalizedEmail, otp);

    const expiryTime = new Date(
      newOtpDocument.createdAt.getTime() + 5 * 60 * 1000,
    );
    const expiresIn = Math.floor((expiryTime - Date.now()) / 1000);

    return res.status(200).json({
      success: true,
      message: `OTP sent to ${normalizedEmail}`,
      otp,
      expiresIn,
      expiresAt: expiryTime.toISOString(),
    });
  } catch (error) {
    console.error("Auth request OTP error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to send OTP. Please try again.",
    });
  }
};

// VERIFY OTP → LOGIN OR SIGNUP

exports.verifyAuthOtp = async (req, res) => {
  try {
    const { emailId, otp } = req.body;

    if (!emailId || !otp) {
      return res.status(400).json({
        success: false,
        message: "Email and OTP are required",
      });
    }

    const normalizedEmail = emailId.toLowerCase().trim();

    const existingOtp = await Otp.findOne({ emailId: normalizedEmail });
    console.log(existingOtp);

    if (!existingOtp) {
      return res.status(401).json({
        success: false,
        message: "OTP not found or expired. Please request a new one.",
      });
    }

    const isExpired =
      (Date.now() - existingOtp.createdAt.getTime()) / 1000 > 300;

    if (isExpired) {
      await Otp.deleteMany({ emailId: normalizedEmail });
      return res.status(410).json({
        success: false,
        message: "OTP expired. Please request a new one.",
      });
    }

    if (existingOtp.attempts >= 3) {
      await Otp.deleteMany({ emailId: normalizedEmail });
      return res.status(429).json({
        success: false,
        message: "Too many failed attempts. Please request a new OTP.",
      });
    }

    const otpMatch = verifyOtp(otp, existingOtp.otp);
    if (!otpMatch) {
      existingOtp.attempts += 1;
      await existingOtp.save();
      return res.status(401).json({
        success: false,
        message: "Invalid OTP. Please try again.",
      });
    }

    // USER EXISTS → LOGIN

    let user = await User.findOne({ emailId: normalizedEmail });

    if (user) {
      const role = user.isAdmin ? "admin" : "user";

      const token = jwt.sign(
        { _id: user._id, role },
        process.env.JWT_SECRET_KEY,
        { expiresIn: "1d" },
      );



      res.cookie("auth_token", token, cookieOptions);

      await Otp.deleteMany({ emailId: normalizedEmail });

      return res.status(200).json({
        success: true,
        message: "Login successful",
        data: {
          _id: user._id,
          name: user.name,
          emailId: user.emailId,
          isAdmin: user.isAdmin,
        },
      });
    }

    // USER DOES NOT EXIST → SIGNUP

    user = await User.create({
      emailId: normalizedEmail,
      isAdmin: false,
    });

    const role = user.isAdmin ? "admin" : "user";

    const token = jwt.sign(
      { _id: user._id, role },
      process.env.JWT_SECRET_KEY,
      { expiresIn: "1d" },
    );



    res.cookie("auth_token", token, cookieOptions);

    await Otp.deleteMany({ emailId: normalizedEmail });

    return res.status(201).json({
      success: true,
      message: "Signup successful",
      data: {
        _id: user._id,
        name: user.name,
        emailId: user.emailId,
        isAdmin: false,
      },
    });
  } catch (error) {
    console.error("Verify authentication OTP error:", error);
    return res.status(500).json({
      success: false,
      message: "OTP verification failed. Please try again.",
    });
  }
};

// controllers/userAuthController.js

exports.logout = (req, res) => {
  res.clearCookie("auth_token", {
    httpOnly: true,
    secure: true,
    sameSite: "none",
    path: "/",
  });

  return res.json({
    success: true,
    message: "Logged out successfully",
  });
};
