const jwt = require("jsonwebtoken");
const { validateSignUpData } = require("../utils/validation");
const bcrypt = require("bcrypt");
const User = require("../models/userSchema");
const { generateOtp, verifyOtp } = require("../utils/otp");
const { sendOtpEmail } = require("../config/nodemailer");
const validator = require("validator");
const Otp = require("../models/otpSchema");
const sendSMS = require("../config/twiliosms");
exports.googleVerifyCallback = async (req, res) => {
  try {
    const user = req.user;
    if (user.isBlocked) {
      return res
        .status(403)
        .json({ success: false, message: "Your account has been blocked" });
    }

    const token = await jwt.sign(
      { _id: user._id, isAdmin: user.isAdmin },
      process.env.JWT_SECRET_KEY,
      {
        expiresIn: "1d",
      }
    );
    console.log(token);

    res.cookie("token", token, {
      httpOnly: true,

      expires: new Date(Date.now() + 8 * 3600000),
    });

    res.status(200).json({
      success: true,
      message: "Login Succesful",
      data: {
        _id: user._id,
        name: user.name,
        emailId: user.emailId,
        isAdmin: user.isAdmin,
      },
    });
  } catch (error) {
    console.error("Google auth error:", error);
    return res.status(500).json({
      success: false,
      message: "Authentication failed",
    });
  }
};

exports.requestSignupOtp = async (req, res) => {
  try {
    const { emailId } = req.body;

    if (!emailId) {
      return res.status(400).json({
        success: false,
        message: "Email is required",
      });
    }

    // Validate email format
    if (!validator.isEmail(emailId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid email format",
      });
    }

    const normalizedEmail = emailId.toLowerCase().trim();

    // check user exists
    const existingUser = await User.findOne({ emailId: normalizedEmail });
    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: "User with this email already exists. Please Login",
      });
    }

    const existingOtp = await Otp.findOne({ emailId: normalizedEmail });

    if (existingOtp) {
      const timeSinceCreated = (Date.now() - existingOtp.createdAt) / 1000;
      if (timeSinceCreated < 60) {
        const waitTime = Math.ceil(60 - timeSinceCreated);
        return res.status(429).json({
          success: false,
          message: `Please wait ${waitTime} second${
            waitTime !== 1 ? "s" : ""
          } before requesting a new OTP.`,
          retryAfter: waitTime,
        });
      }

      await Otp.deleteOne({ emailId: normalizedEmail });
    }

    const otp = generateOtp();

    const newOtp = new Otp({
      emailId: normalizedEmail,
      otp,
      attempts: 0,
    });

    await newOtp.save();

    await sendOtpEmail(normalizedEmail, otp);
    return res.status(200).json({
      success: true,
      message: `OTP sent to ${normalizedEmail}`,
      expiresIn: 300, //
    });
  } catch (error) {
    console.error("Signup OTP error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to send OTP. Please try again.",
    });
  }
};

exports.verifySignupOtp = async (req, res) => {
  try {
    const { emailId, otp } = req.body;

    if (!emailId || !otp) {
      return res.status(400).json({
        success: false,
        message: "Email and OTP are required",
      });
    }

    const normalizedEmail = emailId.toLowerCase().trim();

    // find otp
    const existingOtp = await Otp.findOne({ emailId: normalizedEmail });
    if (!existingOtp)
      return res.status(401).json({
        message: "OTP not found or expired. Please request a new one.",
      });

    const isExpired =
      (Date.now() - existingOtp.createdAt.getTime()) / 1000 > 300;

    if (isExpired) {
      await Otp.deleteMany({ emailId: normalizedEmail });
      return res.status(410).json({
        success: false,
        message: "OTP expired. Please request a new one.",
      });
    }

    // check attempts
    if (existingOtp.attempts >= 3) {
      await Otp.deleteMany({ emailId: normalizedEmail });
      return res.status(429).json({
        success: false,
        message: "Too many failed attempts. Please request a new OTP.",
      });
    }

    // verify otp

    const otpMatch = verifyOtp(otp, existingOtp.otp);
    if (!otpMatch) {
      existingOtp.attempts += 1;
      await existingOtp.save();
      return res
        .status(401)
        .json({ message: "Invalid OTP. Please try again." });
    }

    // create new user
    const newUser = new User({
      emailId: normalizedEmail,
      isAdmin: false,
    });
    await newUser.save();

    // delete otp one time use
    await Otp.deleteMany({ emailId: normalizedEmail });
    // generate token
    const token = jwt.sign(
      { _id: newUser._id, isAdmin: false },
      process.env.JWT_SECRET_KEY,
      {
        expiresIn: "1d",
      }
    );

    res.cookie("token", token, {
      httpOnly: true,
      expires: new Date(Date.now() + 8 * 3600000),
    });

    return res.status(201).json({
      success: true,
      message: "Signup successful",
      data: {
        _id: newUser._id,
        emailId: newUser.emailId,
        isAdmin: newUser.isAdmin,
      },
    });
  } catch (error) {
    console.error("Verify Signup OTP error:", error);
    return res.status(500).json({
      success: false,
      message: "OTP verification failed. Please try again.",
    });
  }
};

exports.requestLoginOtp = async (req, res) => {
  try {
    // validate Email
    const { emailId } = req.body;

    if (!emailId) {
      return res.status(400).json({
        success: false,
        message: "Email is required",
      });
    }

    if (!validator.isEmail(emailId)) {
      return res.status(401).json({ message: "Invalid emailId format" });
    }

    const normalizedEmail = emailId.toLowerCase().trim();
    // find user
    const user = await User.findOne({ emailId: normalizedEmail });
    if (!user) {
      return res.status(401).json({ message: "User not found" });
    }

    if (user.isBlocked) {
      return res.status(403).json({
        success: false,
        message: "Your account has been blocked. Contact support. ",
      });
    }

    const existingOtp = await Otp.findOne({ emailId: normalizedEmail });

    if (existingOtp) {
      const timeSinceCreated = (Date.now() - existingOtp.createdAt) / 1000;
      if (timeSinceCreated < 60) {
        const waitTime = Math.ceil(60 - timeSinceCreated);
        return res.status(429).json({
          success: false,
          message: `Please wait ${waitTime} second${
            waitTime !== 1 ? "s" : ""
          } before requesting a new OTP.`,
          retryAfter: waitTime,
        });
      }

      await Otp.deleteOne({ emailId: normalizedEmail });
    }
    const otp = generateOtp();

    const newOtp = new Otp({
      emailId: normalizedEmail,
      otp,
      attempts: 0,
    });

    await newOtp.save();

    await sendOtpEmail(normalizedEmail, otp);

    return res.status(200).json({
      success: true,
      message: `Login OTP sent to ${normalizedEmail}`,
      expiresIn: 300, //
      otp
    });
  } catch (error) {
    console.error("Login otp request error:", error);
    return res.status(500).json({
      success: false,
      message: "Login request otp failed. Please try again.",
    });
  }
};

exports.verifyLoginOtp = async (req, res) => {
  try {
    const { emailId, otp } = req.body;

    if (!emailId || !otp) {
      return res.status(400).json({
        success: false,
        message: "Email and OTP are required",
      });
    }

    const normalizedEmail = emailId.toLowerCase().trim();

    // find otp
    const existingOtp = await Otp.findOne({ emailId: normalizedEmail });
    if (!existingOtp)
      return res.status(401).json({
        message: "OTP not found or expired. Please request a new one.",
      });

    const user = await User.findOne({ emailId: normalizedEmail });
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
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

    // check attempts
    if (existingOtp.attempts >= 6) {
      await Otp.deleteMany({ emailId: normalizedEmail });
      return res.status(429).json({
        success: false,
        message: "Too many failed attempts. Please request a new OTP.",
      });
    }

    // verify otp

    const otpMatch = verifyOtp(otp, existingOtp.otp);
    if (!otpMatch) {
      existingOtp.attempts += 1;
      await existingOtp.save();
      return res
        .status(401)
        .json({ message: "Invalid OTP. Please try again." });
    }

    // delete otp one time use
    await Otp.deleteMany({ emailId: normalizedEmail });
    // generate token
    const token = jwt.sign(
      { _id: user._id, isAdmin: user.isAdmin },
      process.env.JWT_SECRET_KEY,
      {
        expiresIn: "1d",
      }
    );

    res.cookie("token", token, {
      httpOnly: true,
      expires: new Date(Date.now() + 8 * 3600000),
    });

    return res.status(201).json({
      success: true,
      message: "Login successful",
      data: {
        _id: user._id,
        emailId: user.emailId,
        isAdmin: user.isAdmin,
      },
    });
  } catch (error) {
    console.error("Login otp verification error:", error);
    return res.status(500).json({
      success: false,
      message: "Login otp verification failed. Please try again.",
    });
  }
};

exports.logoutController = async (req, res) => {
  try {
    res.clearCookie("token");

    res
      .status(201)
      .json({ success: true, message: "User logged out successfully" });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

