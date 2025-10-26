const { default: mongoose } = require("mongoose");
const Cart = require("../../models/cartSchema");
const Coupon = require("../../models/couponSchema");

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
          (couponItem) => couponItem.toString() === coupon._id.toString()
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
      discountAmount = (cart.subTotal * coupon.discount) / 100;
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
      cart.finalTotal = cart.subTotal - discountAmount;
      await cart.save({ session });

      // update coupon
      await Coupon.findByIdAndUpdate(
        coupon._id,
        { $inc: { usedCount: 1 } },
        { session }
      );

      // update user

      if (!user.usedCoupons) {
        user.usedCoupons = [];
      }
      user.usedCoupons.push(coupon._id);
      await user.save({ session });

      // commit transaction

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
