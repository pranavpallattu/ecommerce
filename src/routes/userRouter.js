const express=require("express")

const userRouter=express.Router()

const productController=require("../controllers/user/productController")
const wishlistController=require("../controllers/user/wishlistController")
const addressController=require("../controllers/user/addressController")
const cartController=require("../controllers/user/cartController")
const {userAuthMiddleware}=require("../middlewares/authMiddleware")

userRouter.get("/home",productController.getHomeProductsController)
userRouter.get("/shop",productController.getShopProductsController)
userRouter.get("/productDetails/:id",productController.getProductDetailsController)
userRouter.get("/search",productController.searchProductsController)
userRouter.post("/wishlist/:productId",userAuthMiddleware,wishlistController.addToWishlistController)
userRouter.delete("/wishlist/:productId",userAuthMiddleware,wishlistController.removeFromWishlist)
userRouter.post("/addresses",userAuthMiddleware,addressController.addAddressController)
userRouter.get("/addresses",userAuthMiddleware,addressController.getAddressController)
userRouter.delete("/addresses/:id",userAuthMiddleware,addressController.softDeleteAddressController)
userRouter.patch("/addresses/:id",userAuthMiddleware,addressController.editAddressController)
userRouter.post("/cart/:productId",userAuthMiddleware,cartController.addToCart)


module.exports=userRouter