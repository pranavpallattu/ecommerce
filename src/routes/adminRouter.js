const express=require("express")

const adminRouter=express.Router()

const categoryController=require("../controllers/categoryController")
const productController=require("../controllers/productController")
const customerController=require("../controllers/customerController")
const couponController=require("../controllers/couponController")
const orderController=require("../controllers/orderController")
const salesReportController=require("../controllers/salesReportController")
const dashboardController=require("../controllers/dashboardController")


const {adminAuthMiddleware}=require("../middlewares/authMiddleware")
const upload = require("../middlewares/multerMiddleware")

adminRouter.post("/category/add",adminAuthMiddleware,categoryController.addCategoryController)
adminRouter.patch("/category/edit/:id",adminAuthMiddleware,categoryController.editCategoryController)
adminRouter.post("/category/list/:id",adminAuthMiddleware,categoryController.listCategoryController)
adminRouter.post("/category/unlist/:id",adminAuthMiddleware,categoryController.unListCategoryController)
adminRouter.patch("/category/softDelete/:id",adminAuthMiddleware,categoryController.softDeleteCategoryController)
adminRouter.get("/category/getCategory",adminAuthMiddleware,categoryController.getCategoriesController)

adminRouter.post("/product/addProduct",adminAuthMiddleware,upload.fields([{ name: "productImage", maxCount: 4 }]),productController.addProduct)
adminRouter.put("/product/editProduct/:id",adminAuthMiddleware,upload.fields([{name:"productImage",maxCount:4}]),productController.editProduct)
adminRouter.get("/product/:id",adminAuthMiddleware,productController.getProduct)
adminRouter.patch("/product/list/:id",adminAuthMiddleware,productController.listProduct)
adminRouter.patch("/product/unlist/:id",adminAuthMiddleware,productController.unListProduct)
adminRouter.get("/products",adminAuthMiddleware,productController.getProducts)
adminRouter.delete("/product/delete/:id",adminAuthMiddleware,productController.softDeleteProduct)





adminRouter.get("/admin/customers",adminAuthMiddleware, customerController.getAllCustomersController)
adminRouter.patch("/admin/user/:id",adminAuthMiddleware,customerController.updateUserStatusController)


// CREATE
adminRouter.post("/admin/coupons", adminAuthMiddleware, couponController.addCouponController);

// READ (ALL)
adminRouter.get("/admin/coupons", adminAuthMiddleware, couponController.getCouponController);

// UPDATE STATUS (activate / deactivate)
adminRouter.patch("/admin/coupons/:id/status", adminAuthMiddleware, couponController.updateCouponStatusController);

// EDIT COUPON DETAILS
adminRouter.patch( "/admin/coupons/:id", adminAuthMiddleware, couponController.editCouponController);

// SOFT DELETE
adminRouter.delete( "/admin/coupons/:id", adminAuthMiddleware, couponController.softDeleteCouponController);






adminRouter.get("/admin/orders",adminAuthMiddleware,orderController.listOrders)

adminRouter.patch("/admin/orders/return/reject/:orderId/:itemId",adminAuthMiddleware,orderController.itemReturnReject);


adminRouter.get("/admin/orders/:orderId",adminAuthMiddleware,orderController.viewOrder);
adminRouter.patch("/admin/orders/:orderId",adminAuthMiddleware,orderController.orderStatus);


// ORDER RETURNS
adminRouter.patch("/admin/orders/:orderId/return/approve", adminAuthMiddleware, orderController.orderReturnApprove);

adminRouter.patch("/admin/orders/:orderId/return/reject", adminAuthMiddleware, orderController.orderReturnReject);

// ITEM RETURNS
adminRouter.patch("/admin/orders/:orderId/items/:itemId/return/approve", adminAuthMiddleware, orderController.itemReturnApprove);

adminRouter.patch("/admin/orders/:orderId/items/:itemId/return/reject", adminAuthMiddleware, orderController.itemReturnReject);

// NOTIFICATIONS (RETURN REQUESTS)
adminRouter.get("/admin/notifications/returns", adminAuthMiddleware, orderController.getReturnPendingRequests);










adminRouter.get("/admin/getsalesreport",adminAuthMiddleware,salesReportController.getSalesReport)
adminRouter.post("/admin/report/pdf",adminAuthMiddleware,salesReportController.downloadSalesPDF)
adminRouter.post("/admin/report/excel",adminAuthMiddleware,salesReportController.downloadSalesExcel)





adminRouter.get("/admin/ordersummary",adminAuthMiddleware,dashboardController.getOrderSummary)
adminRouter.get("/admin/bestsellingproducts",adminAuthMiddleware,dashboardController.getBestSellingProducts)
adminRouter.get("/admin/bestsellingcategories",adminAuthMiddleware,dashboardController.getBestSellingCategories)







module.exports=adminRouter