const express = require("express");

const userRouter = express.Router();

const productController = require("../controllers/user/productController");
const wishlistController = require("../controllers/user/wishlistController");
const addressController = require("../controllers/user/addressController");
const cartController = require("../controllers/user/cartController");
const couponController = require("../controllers/user/couponController");
const paymentController = require("../controllers/user/paymentController");
const orderController = require("../controllers/user/orderController");
const walletController = require("../controllers/user/walletController");
const buynowController = require("../controllers/user/buynowController");
const invoiceController = require("../controllers/user/invoiceController");
const {
  authMiddleware,
  userMiddleware,
} = require("../middlewares/authMiddleware");

userRouter.get("/home", productController.getHomeProductsController);
userRouter.get("/products/shop", productController.getShopProductsController);
userRouter.get(
  "/productDetails/:id",
  productController.getProductDetailsController,
);

userRouter.post(
  "/wishlist/:productId",
  authMiddleware,
  userMiddleware,
  wishlistController.addToWishlistController,
);
userRouter.delete(
  "/wishlist/:productId",
  authMiddleware,
  userMiddleware,
  wishlistController.removeFromWishlist,
);
userRouter.get(
  "/wishlist",
  authMiddleware,
  userMiddleware,
  wishlistController.getWishlist,
);

userRouter.post(
  "/addresses",
  authMiddleware,
  userMiddleware,
  addressController.addAddressController,
);
userRouter.get(
  "/addresses",
  authMiddleware,
  userMiddleware,
  addressController.getAddressController,
);
userRouter.delete(
  "/addresses/:id",
  authMiddleware,
  userMiddleware,
  addressController.softDeleteAddressController,
);
userRouter.put(
  "/addresses/:id",
  authMiddleware,
  userMiddleware,
  addressController.editAddressController,
);

userRouter.post(
  "/cart/applyCoupon",
  authMiddleware,
  userMiddleware,
  couponController.applyCoupon,
);
userRouter.delete(
  "/cart/removeCoupon",
  authMiddleware,
  userMiddleware,
  couponController.removeCoupon,
);
userRouter.get(
  "/cart/coupons",
  authMiddleware,
  userMiddleware,
  couponController.getCoupons,
);

userRouter.put(
  "/cart/updatequantity",
  authMiddleware,
  userMiddleware,
  cartController.updateQuantity,
);
userRouter.post(
  "/cart/:productId",
  authMiddleware,
  userMiddleware,
  cartController.addToCart,
);
userRouter.get("/cart", authMiddleware, userMiddleware, cartController.getCart);
userRouter.delete(
  "/cart/:productId",
  authMiddleware,
  userMiddleware,
  cartController.removeFromCart,
);

userRouter.post(
  "/orders/place",
  authMiddleware,
  userMiddleware,
  orderController.placeOrder,
);
userRouter.post(
  "/orders/razorpay/create",
  authMiddleware,
  userMiddleware,
  paymentController.createOrder,
);
userRouter.post(
  "/orders/razorpay/verify",
  authMiddleware,
  userMiddleware,
  paymentController.verifyPayment,
);

userRouter.post(
  "/orders",
  authMiddleware,
  userMiddleware,
  orderController.placeOrder,
);

userRouter.post(
  "/orders/:orderId/cancel-item",
  authMiddleware,
  userMiddleware,
  orderController.cancelSingleItem,
);

userRouter.get(
  "/orders",
  authMiddleware,
  userMiddleware,
  orderController.getUserOrders,
);
userRouter.get(
  "/orders/:orderId",
  authMiddleware,
  userMiddleware,
  orderController.getSingleOrder,
);
userRouter.post(
  "/orders/return/request/:orderId/:itemId",
  authMiddleware,
  userMiddleware,
  orderController.itemReturn,
);
userRouter.post(
  "/orders/return/request/:orderId",
  authMiddleware,
  userMiddleware,
  orderController.orderReturn,
);

userRouter.post(
  "/orders/cancel/request/:orderId/:itemId",
  authMiddleware,
  userMiddleware,
  orderController.cancelSingleItem,
);
userRouter.post(
  "/orders/cancel/request/:orderId",
  authMiddleware,
  userMiddleware,
  orderController.orderCancel,
);

userRouter.get(
  "/wallet",
  authMiddleware,
  userMiddleware,
  walletController.getWalletDetails,
);

userRouter.post(
  "/buy-now",
  authMiddleware,
  userMiddleware,
  buynowController.createBuynow,
);
userRouter.get(
  "/buy-now/:id/checkout",
  authMiddleware,
  userMiddleware,
  buynowController.getBuyNowCheckout,
);
userRouter.post(
  "/buy-now/place-order",
  authMiddleware,
  userMiddleware,
  orderController.placeBuyNowOrder,
);
userRouter.post(
  "/buy-now/:buyNowId/applyCoupon",
  authMiddleware,
  userMiddleware,
  couponController.buyNowApplyCoupon,
);
userRouter.delete(
  "/buy-now/:buyNowId/removeCoupon",
  authMiddleware,
  userMiddleware,
  couponController.removeBuyNowCoupon,
);

userRouter.post(
  "/buy-now/razorpay/create-order",
  authMiddleware,
  userMiddleware,
  paymentController.createBuyNowOrder,
);

userRouter.post(
  "/buynow/razorpay/verify-payment",
  authMiddleware,
  userMiddleware,
  paymentController.verifyBuyNowPayment,
);

userRouter.get(
  "/download/:orderId",
  authMiddleware,
  userMiddleware,
  invoiceController.downloadInvoice,
);

module.exports = userRouter;
