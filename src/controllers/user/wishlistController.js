const { default: mongoose } = require("mongoose");
const Product = require("../../models/productSchema");
const Wishlist = require("../../models/wishlistSchema");

exports.addToWishlistController = async (req, res) => {
  try {
    const user = req.user;
    const { productId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(productId)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid product ID" });
    }

    // product
    const product = await Product.findById(productId);
    if (!product) {
      return res
        .status(409)
        .json({ status: false, message: "Product not found" });
    }

    // find or create wishlist

    let wishlist = await Wishlist.findOne({ userId: user._id });

    if (!wishlist) {
      wishlist = new Wishlist({
        userId: user._id,
        products: [{ product: productId }],
      });

      await wishlist.save();

      return res.status(201).json({
        success: true,
        message: "Product added to wishlist successfully",
        data: wishlist,
      });
    }

    //   check is product already exists in wishlist

    const productExists = wishlist.products.some(
      (item) => item.product.toString() === productId
    );

    if (productExists) {
      return res
        .status(404)
        .json({ success: false, message: "Product already in wishlist" });
    }

    wishlist.products.push({ product: productId });
    await wishlist.save();
    return res.status(200).json({
      success: true,
      message: "Product added to wishlist",
      data: wishlist,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.removeFromWishlist = async (req, res) => {
  try {
    const user = req.user;
    const { productId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(productId)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid product ID" });
    }


    const wishlist = await Wishlist.findOne({userId:user._id})
    if(!wishlist){
        return res.status(404).json({success:false,message:"Wishlist doesn not exist"})
    }

    
    const productExistsInWishlist= wishlist.products.some((item)=> item.product.toString() === productId)
    if(!productExistsInWishlist){
      return res.status(404).json({success:false,message:"Product does not exist in wishlist"})
    }

    wishlist.products=wishlist.products.filter((item)=> item.product.toString() !== productId )

    await wishlist.save()

    return res.status(200).json({success:true,message:"product removed from wishlist",data:wishlist})


  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};
