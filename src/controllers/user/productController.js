const { default: mongoose } = require("mongoose");
const Category = require("../../models/categorySchema");
const Product = require("../../models/productSchema");

exports.getHomeProductsController = async (req, res) => {
  try {
    const categories = await Category.find({ isActive: true, deletedAt: null });

    const categoryProducts = await Promise.all(
      // async because if not await will not work
      categories.map(async (categoryItem) => {
        const products = await Product.find({
          category: categoryItem._id,
          isActive: true,
          deletedAt: null,
        })
          .sort({ createdAt: -1 })
          .select(
            "_id productName productImage salePrice regularPrice quantity"
          )
          .limit(3);

        return {
          categoryName: categoryItem.name,
          categoryId: categoryItem._id,
          categoryOffer: categoryItem.offer || 0,
          products,
        };
      })
    );

    res.status(200).json({
      success: true,
      message: "products for home page retrieved successfully",
      data: categoryProducts,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getShopProductsController = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    let limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const category= req.query.category || "all"
    const sortOption= req.query.sort || "default"

    const categoryFilter = category !== "all"
      ? { category: category }
      : {};


    const filters={
      isActive:true,
      deletedAt:null,
      ...categoryFilter,
    }

    let sortQuery = {};

    switch (sortOption) {
      case "priceLowToHigh":
        sortQuery = { salePrice: 1 };
        break;
      case "priceHighToLow":
        sortQuery = { salePrice: -1 };
        break;
      case "newArrivals":
        sortQuery = { createdAt: -1 };
        break;
      case "nameAtoZ":
        sortQuery = { productName: 1 };
        break;
      case "nameZtoA":
        sortQuery = { productName: -1 };
        break;

      default : 
      sortQuery = {createdAt : -1}
    }

    // fetch total product and total pages for pagination
    const totalProducts= await Product.countDocuments(filters)

    const totalPages= Math.ceil(totalProducts / limit)

    // fetch products with pagination

    const products=await Product.find(filters).populate("category", "name").sort(sortQuery).skip(skip).limit(limit)

    // categories for filter options
    const categories = await Category.find({isActive:true, deletedAt:null})

    res.status(200).json({success:true,message : "",data:{totalProducts,totalPages,currentPage:page,products,categories}})

  } catch (error) {
   return res.status(500).json({ success: false, message: error.message });
  }
};


exports.getProductDetailsController=async(req,res)=>{
  try{

    const {id} = req.params

    if(!mongoose.Types.ObjectId.isValid(id)){
      return res.status(400).json({success:false,message:"Invalid product id"})
    }

    const product=await Product.findById(id).populate("category", "name")
    if(!product){
      return res.status(404).json({success:false,message:"product does not exist"})
    }

    const relatedProducts=await Product.find({category:product.category, _id : {$ne : product._id},isActive:true,deletedAt:null}).populate("category", "name").limit(8)
    return res.status(200).json({success:true,message:"product details and related products retrieved successfully",data:{product,relatedProducts}})
  }
  catch (error) {
   return res.status(500).json({ success: false, message: error.message });
  }
}


exports.searchProductsController=async(req,res)=>{

  try{

     const { search } = req.query;

    if (!search || search.trim() === "") {
      return res.status(200).json({
        success: false,
        message: "No search query provided",
        products: [],
        count: 0,
      });
    }

    const searchQuery = search.trim();

    const activeCategories=await Category.find({
      isActive:true,
      deletedAt:null
    })

    const activeCategoryIds=activeCategories.map(category=> category._id)

    const products=await Product.find({
      $or : [
        {productName : {$regex : searchQuery, $options : "i"}},
        {description : {$regex : searchQuery, $options : "i"}},
      ],
        isActive:true,
        deletedAt:null,
        category : {$in : activeCategoryIds}
    }).populate("category", "name offer").sort({createdAt : -1}).limit(20)

    res.status(200).json({success:true,message: products.length > 0 
        ? `Found ${products.length} product${products.length > 1 ? 's' : ''}` 
        : 'No products found',data:{
          products,
          count:products.length,
          searchQuery
        }})
  }
   catch (error) {
   return res.status(500).json({ success: false, message: error.message });
  }
}