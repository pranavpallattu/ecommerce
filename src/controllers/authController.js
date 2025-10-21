const jwt = require("jsonwebtoken");
const { validateSignUpData } = require("../utils/validation");
const bcrypt = require("bcrypt");
const User = require("../models/userSchema");
const { generateOtp, verifyOtp } = require("../utils/otp");
const { sendOtpEmail } = require("../config/nodemailer");
const validator = require("validator");
const Otp = require("../models/otpSchema");
exports.googleVerifyCallback = async (req, res) => {
  try {
    const user = req.user;
    const token = await jwt.sign({ _id: user._id }, "ecommerce@2025", {
      expiresIn: "1d",
    });
    console.log(token);

    res.cookie("token", token, {
      httpOnly: true,

      expires: new Date(Date.now() + 8 * 3600000),
    });

    res.json({ message: "Login Succesfull" });
  } catch (error) {
    res.status(400).send(error);
  }
};

exports.signUpController = async (req, res) => {
  try {
    // validate the data
    validateSignUpData(req);

    const { emailId, password, name, otp } = req.body;

    // find otp
    const existingOtp = await Otp.findOne({ emailId });
    if (!existingOtp)
      return res.status(401).json({ message: "OTP not found or expired" });
    // verify otp
    if (existingOtp.otp !== otp)
      return res.status(401).json({ message: "Invalid OTP" });

    // hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // check user exists
    const existingUser = await User.findOne({ emailId });
    if (existingUser) {
      return res.status(401).json({ message: "User already exists" });
    }
    // create new user
    const newUser = new User({
      name,
      emailId,
      password: hashedPassword,
    });
    await newUser.save();

    // delete otp one time use
    await Otp.deleteMany({ emailId });

    // generate token
    const token = await jwt.sign({ _id: newUser._id,role:newUser.role }, "ecommerce@2025", {
      expiresIn: "1d",
    });
    console.log(token);

    res.cookie("token", token, {
      httpOnly: true,
      expires: new Date(Date.now() + 8 * 3600000),
    });

    return res.json({ message: "user registered successfully", data: newUser });
  } catch (error) {
    res.status(400).send(error);
    console.error(error);
  }
};

exports.loginController = async (req, res) => {
  try {
    // validate Email
    const { emailId, password } = req.body;

    if (!validator.isEmail(emailId)) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    // find user

    const user = await User.findOne({ emailId });
    if (!user) {
      return res.status(401).json({ message: "Invalid credentials" });
    }
    // password validation
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    
    // In loginController, after finding user:
if (user.isBlocked) {
  return res.status(403).json({ 
    success: false, 
    message: "Your account has been blocked" 
  });
}

    // set token

    // generate token
    const token = await jwt.sign({ _id: user._id, role: user.role }, "ecommerce@2025", {
      expiresIn: "1d",
    });
    console.log(token);

    res.cookie("token", token, {
      httpOnly: true,

      expires: new Date(Date.now() + 8 * 3600000),
    });

    return res.json({ message: "user login successfully", data: user });

    // set cookie
  } catch (error) {
    console.error(error);
    return res.status(400).send(error);
  }
};


exports.logoutController=async(req,res)=>{
  try{
    res.clearCookie("token")

    res.status(201).json({success:true,message:"User logged out successfully"})


  }
  catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
}