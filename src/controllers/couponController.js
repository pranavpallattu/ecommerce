const Coupon = require("../models/couponSchema");
const {
  validateCouponData,
  validateEditCouponData,
} = require("../utils/validation");

exports.addCouponController = async (req, res) => {
  const {
    code,
    description,
    discount,
    minPurchase,
    expiryDate,
    usageLimit,
    perUserLimit,
  } = req.body;
  try {
    const parsedDiscount = Number(discount);
    const parsedMinPurchase = Number(minPurchase);
    const parsedUsageLimit = usageLimit ? Number(usageLimit) : null;
    const parsedPerUserLimit = perUserLimit ? Number(perUserLimit) : null;

    const upperCasedCouponCode = code ? code.toUpperCase().trim() : "";

    const existingCoupon = await Coupon.findOne({ code: upperCasedCouponCode });
    if (existingCoupon) {
      return res
        .status(409)
        .json({ success: false, message: "Coupon Already Exists" });
    }

    const couponData = {
      code: upperCasedCouponCode,
      description,
      expiryDate,
      discount: parsedDiscount,
      minPurchase: parsedMinPurchase,
      usageLimit: parsedUsageLimit,
      perUserLimit: parsedPerUserLimit,
    };

    try {
      validateCouponData(couponData);
    } catch (validationError) {
      return res
        .status(400)
        .json({ success: false, message: validationError.message });
    }

    const coupon = new Coupon(couponData);
    await coupon.save();

    return res.status(201).json({
      success: true,
      message: "Coupon added successfully",
      data: coupon,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};



exports.updateCouponStatusController = async (req, res) => {
  try {
    const { id } = req.params;

    const existingCoupon = await Coupon.findById(id);
    if (!existingCoupon) {
      return res
        .status(404)
        .json({ success: false, message: "coupon does not exists" });
    }

    existingCoupon.isActive = !existingCoupon.isActive;

    await existingCoupon.save();

    return res.status(200).json({
      success: true,
      message: `coupon ${
        existingCoupon.isActive ? "activated" : "deactivated"
      } successfully`,
      data: existingCoupon,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.softDeleteCouponController = async (req, res) => {
  try {
    const { id } = req.params;

    const existingCoupon = await Coupon.findById(id);
    if (!existingCoupon) {
      return res
        .status(404)
        .json({ success: false, message: "coupon does not exists" });
    }

    existingCoupon.isDeleted = true;
    existingCoupon.deletedAt = new Date();
    await existingCoupon.save();
    return res.status(200).json({
      success: true,
      message: existingCoupon.code + ` successfully deleted`,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};
