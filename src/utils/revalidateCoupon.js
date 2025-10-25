const Coupon = require("../models/couponSchema");

async function revalidateCoupon(cart) {
  if (!cart.appliedCoupon) return cart;

  const coupon = await Coupon.findById(cart.appliedCoupon);
  if (!coupon) {
    cart.appliedCoupon = null;
    cart.discount = 0;
    return cart;
  }

  const currentTime = new Date();
  const isExpired = coupon.expiryDate < currentTime;
  const isInactive = !coupon.isActive;
  const belowMinPurchase = cart.subTotal < coupon.minPurchase;

  if (isExpired || isInactive || belowMinPurchase) {
    cart.appliedCoupon = null;
    cart.discount = 0;
    return cart;
  }

  //   coupon still valid

  const discountAmount = Math.min(
    (cart.subTotal * coupon.discount) / 100,
    cart.subTotal
  );

  cart.discount = discountAmount;
  cart.finalTotal = Math.max(cart.subTotal - (cart.discount || 0), 0);
  return cart;
}

module.exports = revalidateCoupon;
