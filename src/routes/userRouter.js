const express=require("express")

const userRouter=express.Router()

const productController=require("../controllers/user/productController")
const wishlistController=require("../controllers/user/wishlistController")
const addressController=require("../controllers/user/addressController")
const cartController=require("../controllers/user/cartController")
const couponController=require("../controllers/user/couponController")
const paymentController=require("../controllers/user/paymentController")
const orderController=require("../controllers/user/orderController")
const walletController=require("../controllers/user/walletController")
const buynowController=require("../controllers/user/buynowController")
const invoiceController=require("../controllers/user/invoiceController")
const { authMiddleware } = require("../middlewares/authMiddleware")


userRouter.get("/home",productController.getHomeProductsController)
userRouter.get("/products/shop",productController.getShopProductsController)
userRouter.get("/productDetails/:id",productController.getProductDetailsController)


userRouter.post("/wishlist/:productId",authMiddleware ,wishlistController.addToWishlistController)
userRouter.delete("/wishlist/:productId",authMiddleware ,wishlistController.removeFromWishlist)
userRouter.get("/wishlist",authMiddleware ,wishlistController.getWishlist)


userRouter.post("/addresses",authMiddleware ,addressController.addAddressController)
userRouter.get("/addresses",authMiddleware ,addressController.getAddressController)
userRouter.delete("/addresses/:id",authMiddleware ,addressController.softDeleteAddressController)
userRouter.patch("/addresses/:id",authMiddleware ,addressController.editAddressController)


userRouter.post("/cart/applyCoupon",authMiddleware ,couponController.applyCoupon)
userRouter.delete("/cart/removeCoupon",authMiddleware ,couponController.removeCoupon)
userRouter.get("/cart/coupons",authMiddleware ,couponController.getCoupons)


userRouter.patch("/addresses/:id",authMiddleware ,addressController.editAddressController)

userRouter.patch("/cart/updatequantity",authMiddleware ,cartController.updateQuantity)
userRouter.post("/cart/:productId",authMiddleware ,cartController.addToCart)
userRouter.get("/cart",authMiddleware ,cartController.getCart)
userRouter.delete("/cart/:productId",authMiddleware ,cartController.removeFromCart)



userRouter.post("/orders/place", authMiddleware , orderController.placeOrder)
userRouter.post("/orders/razorpay/create",authMiddleware ,paymentController.createOrder)
userRouter.post("/orders/razorpay/verify",authMiddleware ,paymentController.verifyPayment)



userRouter.post("/orders",authMiddleware ,orderController.placeOrder)


userRouter.post("/orders/:orderId/cancel-item",authMiddleware ,orderController.cancelSingleItem)



userRouter.get("/orders",authMiddleware ,orderController.getUserOrders)
userRouter.get("/orders/:orderId",authMiddleware ,orderController.getSingleOrder)
userRouter.post("/orders/return/request/:orderId/:itemId",authMiddleware ,orderController.itemReturn)
userRouter.post("/orders/return/request/:orderId",authMiddleware ,orderController.orderReturn)

userRouter.post("/orders/cancel/request/:orderId/:itemId",authMiddleware ,orderController.cancelSingleItem)
userRouter.post("/orders/cancel/request/:orderId",authMiddleware ,orderController.orderCancel)



userRouter.get("/wallet",authMiddleware ,walletController.getWalletDetails)



userRouter.post("/buy-now",authMiddleware ,buynowController.createBuynow)
userRouter.get("/buy-now/:id/checkout",authMiddleware ,buynowController.getBuyNowCheckout)
userRouter.post("/buy-now/place-order",authMiddleware ,orderController.placeBuyNowOrder)



userRouter.post(
  "/buy-now/razorpay/create-order",
  authMiddleware ,
  paymentController.createBuyNowOrder
);

userRouter.post(
  "/buynow/razorpay/verify-payment",
  authMiddleware ,
  paymentController.verifyBuyNowPayment
);

userRouter.get("/download/:orderId", authMiddleware , invoiceController.downloadInvoice );

userRouter.post(
  "/payment/webhook",
  express.raw({ type: "application/json" }),
  paymentController.razorpayWebhook
);

module.exports=userRouter