const express=require("express")

const adminRouter=express.Router()

const categoryController=require("../controllers/categoryController")

const {adminAuthMiddleware}=require("../middlewares/authMiddleware")

adminRouter.post("/addCategory",adminAuthMiddleware,categoryController.addCategoryController)
adminRouter.patch("/category/edit/:id",adminAuthMiddleware,categoryController.editCategoryController)
adminRouter.post("/category/listCategory/:id",adminAuthMiddleware,categoryController.listCategoryController)
adminRouter.post("/category/unlistCategory/:id",adminAuthMiddleware,categoryController.unListCategoryController)
adminRouter.patch("/category/softDelete/:id",adminAuthMiddleware,categoryController.softDeleteCategoryController)
adminRouter.get("/category/getAllCategory",adminAuthMiddleware,categoryController.getAllCategoriesController)

module.exports=adminRouter