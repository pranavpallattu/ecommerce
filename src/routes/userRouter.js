const express=require("express")

const userRouter=express.Router()

const productController=require("../controllers/user/productController")

userRouter.get("/home",productController.getHomeProductsController)
userRouter.get("/shop",productController.getShopProductsController)
userRouter.get("/productDetails/:id",productController.getProductDetailsController)

module.exports=userRouter