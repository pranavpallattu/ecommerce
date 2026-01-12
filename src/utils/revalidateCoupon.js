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

  // Coupon still valid - Calculate discount based on type (FIXED VERSION)
  let discountAmount = 0;

  if (coupon.discountType === "percentage") {
    discountAmount = (cart.subTotal * coupon.discount) / 100;
  } else {
    // Fixed amount discount
    discountAmount = coupon.discount;
  }

  // Ensure discount doesn't exceed subtotal
  discountAmount = Math.min(discountAmount, cart.subTotal);

  cart.discount = discountAmount;
  cart.finalTotal = Math.max(cart.subTotal - (cart.discount || 0), 0);
  
  return cart;
}

module.exports = revalidateCoupon;