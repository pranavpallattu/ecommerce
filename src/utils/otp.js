generateOtp=()=>{
    let otp=""
    let length=6
    for(let i=0;i<length;i++){
        otp=otp + Math.floor(Math.random() * 10)
    }
    return otp
}


module.exports={generateOtp}