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
                         return arr.length>=0 || arr.length<=4
            },
            message:"Product must have 1 to 4 images"
        }
    },
    isActive:{
        type:Boolean,
        default:true
    },
    isDeleted:{
        type:Boolean,
        default:false
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

productSchema.pre("save",function(next){
    if(!this.isActive || this.quantity<=0){
        this.status="Out of stock"
    }
    else{
        this.status="Available"
    }
    next()
})

productSchema.pre("findOneAndUpdate",function(next){
    const update=this.getUpdate()
    if(update.quantity<=0 || update.isActive==false ){
        update.status="Out of stock"
    }
    else if(update.quantity>0 && update.isActive==true){
        update.status="Available"
    }

    this.setUpdate(update)
    next()
})


const Product=mongoose.model("Product",productSchema)
module.exports=Product