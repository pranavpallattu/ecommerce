const Coupon = require("../models/couponSchema");
const { roundMoney } = require("./currency");

async function refreshCheckoutCoupon(checkout) {
  if (!checkout.appliedCoupon) return checkout;

  const coupon = await Coupon.findById(checkout.appliedCoupon);

  if (!coupon) {
    checkout.appliedCoupon = null;
    checkout.discount = 0;
    checkout.finalTotal = roundMoney(checkout.subTotal);
    return checkout;
  }

  const currentTime = new Date();

  const invalid =
    !coupon.isActive ||
    coupon.expiryDate < currentTime ||
    checkout.subTotal < coupon.minPurchase ||
    (coupon.usageLimit && coupon.usedCount >= coupon.usageLimit);

  if (invalid) {
    checkout.appliedCoupon = null;
    checkout.discount = 0;
    checkout.finalTotal = roundMoney(checkout.subTotal);
    return checkout;
  }

  let discountAmount = 0;

  if (coupon.discountType === "percentage") {
    discountAmount = roundMoney(
      (checkout.subTotal * coupon.discount) / 100
    );
  } else {
    discountAmount = coupon.discount;
  }

  discountAmount = Math.min(discountAmount, checkout.subTotal);

  checkout.discount = discountAmount;
  checkout.finalTotal = roundMoney(checkout.subTotal - discountAmount);

  return checkout;
}

module.exports=refreshCheckoutCoupon