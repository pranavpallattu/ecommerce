const Product = require("../../models/productSchema");
const BuyNow = require("../../models/buynowSchema");
const revalidateCoupon = require("../../utils/revalidateCoupon");

exports.createBuynow = async (req, res) => {
  try {
    const userId = req.user._id;
    const { productId } = req.body;

    if (!productId) {
      return res
        .status(400)
        .json({ success: false, message: "Product ID required" });
    }

    const product = await Product.findById(productId);

    if (!product || !product.isActive || product.quantity < 1) {
      return res.status(400).json({
        success: false,
        message: "Product unavailable",
      });
    }

    await BuyNow.deleteMany({ userId, status: "ACTIVE" });

    const price = product.salePrice || product.regularPrice;

    const buyNow = await BuyNow.create({
      userId,
      product: {
        productId: product._id,
        name: product.productName,
        image: product.productImage?.[0],
        price,
      },
      quantity: 1,
      subTotal: price,
      finalTotal: price,
    });

    res.status(201).json({
      success: true,
      buyNowId: buyNow._id,
      message: "Buy Now session created",
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.getBuyNowCheckout = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;

    const buyNow = await BuyNow.findOne({
      _id: id,
      userId,
      status: "ACTIVE",
    });

    if (!buyNow) {
      return res.status(404).json({
        success: false,
        message: "Buy Now session expired or invalid",
      });
    }

    let validatedBuyNow = await revalidateCoupon(buyNow);

    return res.status(200).json({
      success: true,
      checkout: validatedBuyNow,
    });
  } catch (error) {
    console.error("Checkout Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};
