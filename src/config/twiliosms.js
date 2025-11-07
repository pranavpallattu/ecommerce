const twilio=require("twilio")
const twilioClient= twilio(
    process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
)

async function sendSMS(to, message){
 try {
    const sms = await  twilioClient.messages.create({
      body: message,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: to, // Must be in E.164 format like +91XXXXXXXXXX
    });
    console.log("SMS sent successfully:", sms.sid);
    return sms;
  } catch (error) {
    console.error("Error sending SMS:", error.message);
    throw error;
  }
}

module.exports=sendSMS