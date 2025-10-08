const { sendOtpEmail } = require("../config/nodemailer");
const Otp = require("../models/otpSchema");
const { generateOtp } = require("../utils/otp");

exports.sendOtp = async (req, res) => {
  try {
    const { emailId } = req.body;

    if (!emailId)
      return res.status(400).json({ message: "emailId is required" });

    const existingOtp = await Otp.findOne({ emailId });
    if (existingOtp) {
        const timeSinceCreated=(Date.now() - existingOtp.createdAt) / 1000 ;
        if(timeSinceCreated<60){
            return res
        .status(429)
        .json({ message: "OTP already sent. Try again in 1 minute." });
        }
    await Otp.deleteMany({ emailId });
    }

    const otp = generateOtp();
    const saveOtp = new Otp({
      emailId,
      otp,
    });
    await saveOtp.save();
    await sendOtpEmail(emailId, otp);

    res.json({ message: "otp sent successfully",otp});
  } catch (error) {
    res.status(500).send(error);
  }
};
