const express=require("express")

const adminRouter=express.Router()

const categoryController=require("../controllers/categoryController")
const productController=require("../controllers/productController")
const customerController=require("../controllers/customerController")
const couponController=require("../controllers/couponController")
const orderController=require("../controllers/orderController")


const {adminAuthMiddleware}=require("../middlewares/authMiddleware")
const upload = require("../middlewares/multerMiddleware")

adminRouter.post("/addCategory",adminAuthMiddleware,categoryController.addCategoryController)
adminRouter.patch("/category/edit/:id",adminAuthMiddleware,categoryController.editCategoryController)
adminRouter.post("/category/listCategory/:id",adminAuthMiddleware,categoryController.listCategoryController)
adminRouter.post("/category/unlistCategory/:id",adminAuthMiddleware,categoryController.unListCategoryController)
adminRouter.patch("/category/softDelete/:id",adminAuthMiddleware,categoryController.softDeleteCategoryController)
adminRouter.get("/category/getAllCategory",adminAuthMiddleware,categoryController.getAllCategoriesController)
adminRouter.post("/product/addProduct",adminAuthMiddleware,upload.fields([{ name: "productImage", maxCount: 4 }]),productController.addProductController)
adminRouter.put("/product/editProduct/:id",adminAuthMiddleware,upload.fields([{name:"productImage",maxCount:4}]),productController.editProductController)
adminRouter.post("/admin/allCustomers",adminAuthMiddleware, customerController.getAllCustomersController)
adminRouter.patch("/admin/user/:id",adminAuthMiddleware,customerController.updateUserStatusController)
adminRouter.post("/admin/add-coupon",adminAuthMiddleware,couponController.addCouponController)
adminRouter.patch("/admin/coupon/:id",adminAuthMiddleware,couponController.updateCouponStatusController)
adminRouter.patch("/admin/coupon/edit/:id",adminAuthMiddleware,couponController.editCouponController)
adminRouter.get("/admin/orders",adminAuthMiddleware,orderController.listOrders)


module.exports=adminRouter