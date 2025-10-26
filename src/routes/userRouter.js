const express=require("express")

const userRouter=express.Router()

const productController=require("../controllers/user/productController")
const wishlistController=require("../controllers/user/wishlistController")
const addressController=require("../controllers/user/addressController")
const cartController=require("../controllers/user/cartController")
const couponController=require("../controllers/user/couponController")
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

userRouter.post("/cart/applyCoupon",userAuthMiddleware,couponController.applyCoupon)
userRouter.delete("/cart/removeCoupon",userAuthMiddleware,couponController.removeCoupon)


userRouter.patch("/addresses/:id",userAuthMiddleware,addressController.editAddressController)
userRouter.post("/cart/:productId",userAuthMiddleware,cartController.addToCart)
userRouter.get("/cart",userAuthMiddleware,cartController.getCart)
userRouter.delete("/cart/:productId",userAuthMiddleware,cartController.removeFromCart)
userRouter.patch("/cart/updatequantity",userAuthMiddleware,cartController.updateQuantity)



module.exports=userRouter