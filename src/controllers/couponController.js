const { default: mongoose } = require("mongoose");
const Coupon = require("../models/couponSchema");
const {
  validateCouponData,
  validateEditCouponData,
} = require("../utils/validation");

exports.getCouponController = async (req, res) => {
  try {
    const search = req.query.search?.trim() || "";
    const page = parseInt(req.query.page) || 1;
    let limit = parseInt(req.query.limit) || 5;
    limit = limit > 5 ? 5 : limit;

    const skip = (page - 1) * limit;

    const searchQuery = {
      deletedAt: null,
      ...(search && {
        $or: [
          { code: { $regex: search, $options: "i" } },
          { description: { $regex: search, $options: "i" } },
        ],
      }),
    };

    const [totalCoupons, coupons] = await Promise.all([
      Coupon.countDocuments(searchQuery),
      Coupon.find(searchQuery).sort({ createdAt: -1 }).skip(skip).limit(limit),
    ]);

    const totalPages = Math.ceil(totalCoupons / limit);

    return res.status(200).json({
      success: true,
      message: "Coupons retrieved successfully",
      data: coupons,
      pagination: {
        totalCoupons,
        totalPages,
        currentPage: page,
        limit,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

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
        .json({ success: false, message: "Coupon already exist" });
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

exports.editCouponController = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid coupon ID",
      });
    }

    const existingCoupon = await Coupon.findById(id);
    if (!existingCoupon) {
      return res
        .status(404)
        .json({ success: false, message: "Coupon does not exist" });
    }

    if (Object.keys(updateData).length === 0) {
      return res
        .status(400)
        .json({ success: false, message: "No Fields provided for update" });
    }

    try {
      validateEditCouponData(updateData);
    } catch (validationError) {
      return res
        .status(400)
        .json({ success: false, message: validationError.message });
    }
    if (updateData.code && updateData.code !== existingCoupon.code) {
      const existingCouponCode = await Coupon.findOne({
        code: updateData.code.toUpperCase().trim(),
        _id: { $ne: id },
      });
      if (existingCouponCode) {
        return res.status(409).json({
          success: false,
          message: "Another coupon with this code already exist",
        });
      }

      updateData.code = updateData.code.toUpperCase().trim();
    }

    if (updateData.discount !== undefined)
      updateData.discount = Number(updateData.discount);

    if (updateData.minPurchase !== undefined)
      updateData.minPurchase = Number(updateData.minPurchase);

    if (updateData.usageLimit !== undefined && updateData.usageLimit !== null) {
      updateData.usageLimit = Number(updateData.usageLimit);
    }

    if (
      updateData.perUserLimit !== undefined &&
      updateData.perUserLimit !== null
    ) {
      updateData.perUserLimit = Number(updateData.perUserLimit);
    }

    const updatedCoupon = await Coupon.findByIdAndUpdate(
      id,
      {
        $set: updateData,
      },
      { new: true, runValidators: true }
    );

    return res.status(200).json({
      success: true,
      message: "Coupon updated successfully",
      data: updatedCoupon,
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
