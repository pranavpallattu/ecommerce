const { default: mongoose } = require("mongoose");

const userSchema=new mongoose.Schema({
    
    name:{
        type:String,
        required:true
    },
    emailId:{
        type:String,
        required:true,
        unique:true,
        lowercase:true
    },
    password:{
        type:String,
        required:false
    },
    phone:{
        type:Number,
        required:false,
        unique:false
    },
    googleId:{
        type:String,
        unique:true,
        sparse:true,
        default:null
    },
    isBlocked:{
        type:Boolean,
        default:false
    },
    isAdmin:{
        type:Boolean,
        default:false
    },
    usedCoupons:[
      {
         couponId:{
            type:mongoose.Schema.Types.ObjectId,
            ref:"Coupon"
        },
        useCount:{
            type:Number,
            default:0
        }
       }
    ]

})


const User =  mongoose.model("User",userSchema)
module.exports= User