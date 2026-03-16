const express=require("express")

const adminRouter=express.Router()

const categoryController=require("../controllers/admin/categoryController")
const productController=require("../controllers/admin/productController")
const customerController=require("../controllers/admin/customerController")
const couponController=require("../controllers/admin/couponController")
const orderController=require("../controllers/admin/orderController")
const salesReportController=require("../controllers/admin/salesReportController")
const dashboardController=require("../controllers/admin/dashboardController")


const {authMiddleware, adminMiddleware}=require("../middlewares/authMiddleware")
const upload = require("../middlewares/multerMiddleware")

adminRouter.post("/category/add" ,authMiddleware, adminMiddleware,categoryController.addCategoryController)
adminRouter.patch("/category/edit/:id" ,authMiddleware, adminMiddleware,categoryController.editCategoryController)
adminRouter.post("/category/list/:id" ,authMiddleware, adminMiddleware,categoryController.listCategoryController)
adminRouter.post("/category/unlist/:id" ,authMiddleware, adminMiddleware,categoryController.unListCategoryController)
adminRouter.patch("/category/softDelete/:id" ,authMiddleware, adminMiddleware,categoryController.softDeleteCategoryController)
adminRouter.get("/category/getCategory" ,authMiddleware, adminMiddleware,categoryController.getCategoriesController)

adminRouter.post("/product/addProduct" ,authMiddleware, adminMiddleware,upload.fields([{ name: "productImage", maxCount: 4 }]),productController.addProduct)
adminRouter.put("/product/editProduct/:id" ,authMiddleware, adminMiddleware,upload.fields([{name:"productImage",maxCount:4}]),productController.editProduct)
adminRouter.get("/product/:id" ,authMiddleware, adminMiddleware,productController.getProduct)
adminRouter.patch("/product/list/:id" ,authMiddleware, adminMiddleware,productController.listProduct)
adminRouter.patch("/product/unlist/:id" ,authMiddleware, adminMiddleware,productController.unListProduct)
adminRouter.get("/products" ,authMiddleware, adminMiddleware,productController.getProducts)
adminRouter.delete("/product/delete/:id" ,authMiddleware, adminMiddleware,productController.softDeleteProduct)





adminRouter.get("/customers" ,authMiddleware, adminMiddleware, customerController.getAllCustomersController)
adminRouter.patch("/user/:id" ,authMiddleware, adminMiddleware,customerController.updateUserStatusController)


// CREATE
adminRouter.post("/coupons" ,authMiddleware, adminMiddleware, couponController.addCouponController);

// READ (ALL)
adminRouter.get("/coupons" ,authMiddleware, adminMiddleware, couponController.getCouponController);

// UPDATE STATUS (activate / deactivate)
adminRouter.patch("/coupons/:id/status" ,authMiddleware, adminMiddleware, couponController.updateCouponStatusController);

// EDIT COUPON DETAILS
adminRouter.patch( "/coupons/:id" ,authMiddleware, adminMiddleware, couponController.editCouponController);

// SOFT DELETE
adminRouter.delete( "/coupons/:id" ,authMiddleware, adminMiddleware, couponController.softDeleteCouponController);



adminRouter.get("/orders" ,authMiddleware, adminMiddleware,orderController.listOrders)

adminRouter.patch("/orders/return/reject/:orderId/:itemId" ,authMiddleware, adminMiddleware,orderController.itemReturnReject);


adminRouter.get("/orders/:orderId" ,authMiddleware, adminMiddleware,orderController.viewOrder);
adminRouter.patch("/orders/:orderId" ,authMiddleware, adminMiddleware,orderController.orderStatus);


// ORDER RETURNS
adminRouter.patch("/orders/:orderId/return/approve" ,authMiddleware, adminMiddleware, orderController.orderReturnApprove);

adminRouter.patch("/orders/:orderId/return/reject" ,authMiddleware, adminMiddleware, orderController.orderReturnReject);

// ITEM RETURNS
adminRouter.patch("/orders/:orderId/items/:itemId/return/approve" ,authMiddleware, adminMiddleware, orderController.itemReturnApprove);

adminRouter.patch("/orders/:orderId/items/:itemId/return/reject" ,authMiddleware, adminMiddleware, orderController.itemReturnReject);

// NOTIFICATIONS (RETURN REQUESTS)
adminRouter.get("/notifications/returns" ,authMiddleware, adminMiddleware, orderController.getReturnPendingRequests);










adminRouter.get("/getsalesreport" ,authMiddleware, adminMiddleware,salesReportController.getSalesReport)
adminRouter.post("/report/pdf" ,authMiddleware, adminMiddleware,salesReportController.downloadSalesPDF)
adminRouter.post("/report/excel" ,authMiddleware, adminMiddleware,salesReportController.downloadSalesExcel)





adminRouter.get("/ordersummary" ,authMiddleware, adminMiddleware,dashboardController.getOrderSummary)
adminRouter.get("/bestsellingproducts" ,authMiddleware, adminMiddleware,dashboardController.getBestSellingProducts)
adminRouter.get("/bestsellingcategories" ,authMiddleware, adminMiddleware,dashboardController.getBestSellingCategories)







module.exports=adminRouter