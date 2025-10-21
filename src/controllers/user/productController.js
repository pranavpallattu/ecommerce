const Category = require("../../models/categorySchema")
const Product = require("../../models/productSchema")


exports.getHomeProductsController=async(req,res)=>{
    try{

        const categories=await Category.find({isActive:true,deletedAt:null})

        const categoryProducts= await Promise.all(
            // async because if not await will not work
            categories.map(async(categoryItem)=> {
                const products=await Product.find({
                    category:categoryItem._id,
                    isActive:true,
                    deletedAt:null
                })
                .sort({createdAt:-1})
                 .select('_id productName productImage salePrice regularPrice quantity')
                .limit(3)

                return {
                    categoryName : categoryItem.name,
                    categoryId : categoryItem._id,
                    categoryOffer : categoryItem.offer || 0 ,
                    products
                }
            })
        )

        res.status(200).json({success:true,message:"products for home page retrieved successfully",data:categoryProducts})

    }
    catch(error){
        res.status(500).json({success:false,message:error.message})
    }
}