const mongoose=require("mongoose")


const productSchema=new mongoose.Schema({

    productName:{
        type:String,
        required:true,
        trim:true,
    },
    category:{
        type:mongoose.Schema.Types.ObjectId,
        ref:"Category",
        required:true
    },
    description:{
        type:String,
        required:true,
        minLength:0,
        maxLength:50
    },
    quantity:{
        type:Number,
        required:true
    },
    regularPrice:{
        type:Number,
        required:true,
        min:0
    },
    salePrice:{
        type:Number,
        required:true,
        min:0
    },
    productImage:{
        type:[String],
        required:true
    }

})