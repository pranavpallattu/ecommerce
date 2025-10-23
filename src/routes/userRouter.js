const express=require("express")

const userRouter=express.Router()

const productController=require("../controllers/user/productController")
const wishlistController=require("../controllers/user/wishlistController")
const {userAuthMiddleware}=require("../middlewares/authMiddleware")

userRouter.get("/home",productController.getHomeProductsController)
userRouter.get("/shop",productController.getShopProductsController)
userRouter.get("/productDetails/:id",productController.getProductDetailsController)
userRouter.get("/search",productController.searchProductsController)
userRouter.post("/wishlist/:productId",userAuthMiddleware,wishlistController.addToWishlistController)
userRouter.delete("/wishlist/:productId",userAuthMiddleware,wishlistController.removeFromWishlist)


module.exports=userRouter