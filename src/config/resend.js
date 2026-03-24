import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendOtpEmail(toEmail, otp) {
  try {
    await resend.emails.send({
      from: "onboarding@resend.dev",
      to: toEmail,
      subject: "Your OTP Code",
      html: `<strong>Your OTP is ${otp}</strong>`,
    });

    return true;
  } catch (err) {
    console.error("Email failed:", err);
    return false;
  }
}