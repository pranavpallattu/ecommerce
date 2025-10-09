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
        trim:true,
        minLength:0,
        maxLength:100
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
        required:true,
        validate:{
            validator:function(arr){
                         return arr.length>=1 && arr.length<=4
            },
            message:"Product must have 1 to 4 images"
        }
    },
    isActive:{
        type:Boolean,
        default:true
    },
    deletedAt:{
        type:Date,
        default:null
    },
    status:{
        type:String,
        enum:["Available", "Out of stock"],
        required:true,
        default:"Available"
    },
    offer:{
        type:Number,
        default:0
    }

},{
    timestamps:true
})

module.exports=mongoose.model("Product",productSchema)