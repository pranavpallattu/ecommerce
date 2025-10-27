const mongoose=require("mongoose")


const transactionSchema=new mongoose.Schema({
    type:{
        type:String,
        enum:["credit","debit"],
        required:true,
        unique:true
    },
    amount:{
        type:Number,
        required:true
    },
    description:{
        type:String,
        default:null
    },
    date:{
        type:Date,
        default:Date.now
    }
})

const walletSchema=new mongoose.Schema({
    userId:{
        type:mongoose.Schema.Types.ObjectId,
        ref:"User",
        required:true
    },
    balance:{
        type:Number,
        required:true,
        default:0
    },
    transactionHistory:[transactionSchema]
})

const Wallet=mongoose.model("Wallet", walletSchema)
module.exports=Wallet