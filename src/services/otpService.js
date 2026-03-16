const crypto=require("crypto")

const generateOtp=()=>{
    // generate a 6 digit number between 100000 - 999999
    const otp=crypto.randomInt(100000,999999).toString();
    return otp;
}

// converts both to buffer (raw byte)
// avoids a timing attack
const verifyOtp=(inputOtp, storedOtp)=>{

    const input=String(inputOtp);
    const stored=String(storedOtp);

    if(input.length !== stored.length) return false;

    return crypto.timingSafeEqual(
        Buffer.from(input),
        Buffer.from(stored)
    )
}

module.exports={generateOtp, verifyOtp}