const nodemailer=require("nodemailer")

const transporter=nodemailer.createTransport({
    secure:true,
    host:"smtp.gmail.com",
    port:465,
    auth:{
        user:"pranavpallattu2004@gmail.com",
        pass:"oxiwipuobylaiwvn"
    }
})

async function sendOtpEmail(toEmail, otp) {
  const info = await transporter.sendMail({
    from: "Ecommerce2025 <no-reply@ecommerce.com>",
    to: toEmail,
    subject: "Your verification code",
    text: `Your OTP code is ${otp}. It is valid for ${process.env.OTP_EXPIRY_MINUTES || 5} minutes.`,
    html: `<p>Your OTP code is <strong>${otp}</strong>. It is valid for ${process.env.OTP_EXPIRY_MINUTES || 5} minutes.</p>`
  });
}
module.exports={transporter,sendOtpEmail}