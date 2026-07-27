const { default: mongoose } = require("mongoose");
const Cart = require("../../models/cartSchema");
const Coupon = require("../../models/couponSchema");
const BuyNow = require("../../models/buynowSchema");

exports.applyCoupon = async (req, res) => {
  try {
    const user = req.user;
    const { code } = req.body;

    if (!code || typeof code !== "string" || code.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: "Coupon code is required",
      });
    }

    const cart = await Cart.findOne({ userId: user._id });
    if (!cart) {
      return res.status(404).json({
        success: false,
        message: "Cart not found",
      });
    }

    if (cart.items.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Cannot apply coupon to an empty cart",
      });
    }

    // Prevent reapplying coupon if one already exists
    if (cart.appliedCoupon) {
      return res.status(400).json({
        success: false,
        message:
          "A coupon is already applied. Please remove it before applying a new one.",
      });
    }

    const upperCasedCode = code.toUpperCase().trim();

    const coupon = await Coupon.findOne({
      code: upperCasedCode,
      isActive: true,
      deletedAt: null,
    });

    if (!coupon) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid coupon code" });
    }

    if (Date.now() > new Date(coupon.expiryDate).getTime()) {
      return res
        .status(400)
        .json({ success: false, message: "Coupon expired" });
    }

    if (cart.subTotal < coupon.minPurchase) {
      return res.status(400).json({
        success: false,
        message: `Minimum purchase of ₹${coupon.minPurchase} required to use this coupon`,
      });
    }

    if (coupon.usageLimit !== null && coupon.usedCount >= coupon.usageLimit) {
      return res
        .status(400)
        .json({ success: false, message: "Coupon usage limit reached" });
    }

    if (coupon.perUserLimit !== null) {
      const userCouponUsageCount =
        user.usedCoupons?.filter(
          (couponItem) => couponItem.toString() === coupon._id.toString(),
        ).length || 0;

      if (userCouponUsageCount >= coupon.perUserLimit) {
        return res.status(400).json({
          success: false,
          message: `You have already used this coupon ${userCouponUsageCount} times limit reached`,
        });
      }
    }

    let discountAmount = 0;

    if (coupon.discountType === "percentage") {
      discountAmount = Math.round((cart.subTotal * coupon.discount) / 100);
    } else {
      discountAmount = coupon.discount;
    }

    discountAmount = Math.min(discountAmount, cart.subTotal);

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      // update cart
      cart.appliedCoupon = coupon._id;
      cart.discount = discountAmount;
      // cart.finalTotal = cart.subTotal - discountAmount;
      await cart.save({ session });

      await session.commitTransaction();
    } catch (error) {
      // Rollback transcation on error
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }

    await cart.populate("appliedCoupon");

    return res.status(200).json({
      success: true,
      message: "Coupon applied successfully",
      data: cart,
      discountAmount,
      finalTotal: cart.finalTotal,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.removeCoupon = async (req, res) => {
  try {
    const user = req.user;
    const cart = await Cart.findOne({ userId: user._id });
    if (!cart) {
      return res
        .status(404)
        .json({ success: false, message: "Cart not found" });
    }

    if (!cart.appliedCoupon) {
      return res.status(400).json({
        success: false,
        message: "No coupon applied to remove",
      });
    }

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      // update cart
      // const appliedCouponId = cart.appliedCoupon;
      cart.appliedCoupon = null;
      cart.discount = 0;
      cart.finalTotal = cart.subTotal;

      await cart.save({ session });

      // commit transaction

      await session.commitTransaction();
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }

    return res.status(200).json({
      success: true,
      message: "Coupon removed successfully",
      data: cart,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.getCoupons = async (req, res) => {
  try {
    const today = new Date();

    const coupons = await Coupon.find({
      isActive: true,
      deletedAt: null,
      expiryDate: { $gt: today },
      $or: [
        { usageLimit: null }, // Unlimited coupons
        { $expr: { $lt: ["$usedCount", "$usageLimit"] } }, // Limited coupons with uses left
      ],
    })
      .select("code description discountType discount minPurchase expiryDate")
      .sort({ expiryDate: 1 });
    if (coupons.length === 0) {
      return res
        .status(200)
        .json({ success: true, message: "No coupons available", data: [] });
    }
    return res.status(200).json({
      success: true,
      message: "Coupons retrieved successfully",
      data: coupons,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.buyNowApplyCoupon = async (req, res) => {
  try {
    const userId = req.user._id;
    const user = req.user;
    const { code } = req.body;
    const { buyNowId } = req.params;

    if (!code || typeof code !== "string" || code.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: "Coupon code is required",
      });
    }

    const buyNow = await BuyNow.findOne({
      _id: buyNowId,
      userId,
      status: "ACTIVE",
    });

    if (!buyNow) {
      return res.status(404).json({
        success: false,
        message: "Buy Now session not found or expired",
      });
    }

    // Prevent reapplying coupon if one already exists
    if (buyNow.appliedCoupon) {
      return res.status(400).json({
        success: false,
        message:
          "A coupon is already applied. Please remove it before applying a new one.",
      });
    }

    const upperCasedCode = code.toUpperCase().trim();

    const coupon = await Coupon.findOne({
      code: upperCasedCode,
      isActive: true,
      deletedAt: null,
    });

    if (!coupon) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid coupon code" });
    }

    if (Date.now() > new Date(coupon.expiryDate).getTime()) {
      return res
        .status(400)
        .json({ success: false, message: "Coupon expired" });
    }

    if (buyNow.subTotal < coupon.minPurchase) {
      return res.status(400).json({
        success: false,
        message: `Minimum purchase of ₹${coupon.minPurchase} required to use this coupon`,
      });
    }

    if (coupon.usageLimit !== null && coupon.usedCount >= coupon.usageLimit) {
      return res
        .status(400)
        .json({ success: false, message: "Coupon usage limit reached" });
    }

    if (coupon.perUserLimit !== null) {
      const userCouponUsageCount =
        user.usedCoupons?.filter(
          (couponItem) => couponItem.toString() === coupon._id.toString(),
        ).length || 0;

      if (userCouponUsageCount >= coupon.perUserLimit) {
        return res.status(400).json({
          success: false,
          message: `You have already used this coupon ${userCouponUsageCount} times limit reached`,
        });
      }
    }

    let discountAmount = 0;

    if (coupon.discountType === "percentage") {
      discountAmount = Math.round(buyNow.subTotal * coupon.discount) / 100;
    } else {
      discountAmount = coupon.discount;
    }

    discountAmount = Math.min(discountAmount, buyNow.subTotal);

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      // update buyNow
      buyNow.appliedCoupon = coupon._id;
      buyNow.discount = discountAmount;
      buyNow.finalTotal = Math.max(0, buyNow.subTotal - discountAmount);
      await buyNow.save({ session });

      await session.commitTransaction();
    } catch (error) {
      // Rollback transcation on error
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }

    await buyNow.populate("appliedCoupon");

    return res.status(200).json({
      success: true,
      message: "Coupon applied successfully",
      data: buyNow,
      discountAmount,
      finalTotal: buyNow.finalTotal,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.removeBuyNowCoupon = async (req, res) => {
  try {
    const { buyNowId } = req.params;
    const userId = req.user._id;

    const buyNow = await BuyNow.findOne({
      _id: buyNowId,
      userId,
      status: "ACTIVE",
    });

    if (!buyNow) {
      return res.status(404).json({
        success: false,
        message: "Buy Now session not found or expired",
      });
    }

    if (!buyNow.appliedCoupon) {
      return res.status(400).json({
        success: false,
        message: "No coupon applied",
      });
    }

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      buyNow.appliedCoupon = null;
      buyNow.discount = 0;
      buyNow.finalTotal = buyNow.subTotal;

      await buyNow.save({ session });

      await session.commitTransaction();
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }

    return res.status(200).json({
      success: true,
      message: "Coupon removed successfully",
      data: buyNow,
    });
  } catch (error) {
    console.error("Remove Buy Now Coupon Error:", error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};
