const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  secure: false,
  host: "smtp.gmail.com",
  port: 587,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

async function sendOtpEmail(toEmail, otp) {
  try {
    const info = await transporter.sendMail({
      from: "Ecommerce2025 <no-reply@ecommerce.com>",
      to: toEmail,
      subject: "Your verification code",
      text: `Your OTP code is ${otp}. It is valid for ${process.env.OTP_EXPIRY_MINUTES || 5} minutes.`,
      html: `<p>Your OTP code is <strong>${otp}</strong>. It is valid for ${process.env.OTP_EXPIRY_MINUTES || 5} minutes.</p>`,
    });
  } catch (error) {
    console.error(" Email failed:", error);
  }
}
module.exports = { transporter, sendOtpEmail };
