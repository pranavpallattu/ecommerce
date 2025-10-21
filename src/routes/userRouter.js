const express=require("express")

const userRouter=express.Router()

const productController=require("../controllers/user/productController")

userRouter.get("/home",productController.getHomeProductsController)

module.exports=userRouter