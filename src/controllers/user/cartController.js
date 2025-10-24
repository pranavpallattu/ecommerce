const { default: mongoose } = require("mongoose");
const Cart = require("../../models/cartSchema");
const Product = require("../../models/productSchema");
const revalidateCoupon = require("../../utils/revalidateCoupon");

exports.addToCart = async (req, res) => {
  try {
    const user = req.user;
    const { productId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(productId)) {
      return res
        .status(400)
        .json({ success: false, message: "ProductId is not valid" });
    }

    const product = await Product.findOne({
      _id: productId,
      deletedAt: null,
      isActive: true,
    });
    if (!product) {
      return res
        .status(404)
        .json({ success: false, message: "Product not found or unavailable" });
    }

    if (product.quantity < 1) {
      return res.status(400).json({
        success: false,
        message: "Product is out of stocks",
      });
    }

    let cart = await Cart.findOne({ userId: user._id });
    console.log(product);
    console.log(product?.salePrice);

    if (!cart) {
      cart = new Cart({
        userId: user._id,
        items: [{ product: productId, quantity: 1, price: product.salePrice }],
        totalItems: 1,
        subTotal: product.salePrice,
        finalTotal: product.salePrice,
      });

      await cart.save();

      return res.status(200).json({
        success: true,
        message: "Product added to cart successfully",
        data: cart,
      });
    }

    const productAlreadyExists = cart.items.some(
      (item) => item.product.toString() === productId
    );

    if (productAlreadyExists) {
      return res
        .status(400)
        .json({ success: false, message: "Product is already in cart" });
    }

    cart.items.push({
      product: productId,
      quantity: 1,
      price: product.salePrice,
    });

    cart.totalItems = cart.items.length;
    cart.subTotal = cart.items.reduce(
      (sum, item) => sum + item.price * item.quantity,
      0
    );

    cart = await revalidateCoupon(cart);

    cart.finalTotal = Math.max(cart.subTotal - (cart.discount || 0), 0);

    await cart.save();
    await cart.populate("items.product");

    return res.status(201).json({
      success: true,
      message: "Product added to cart successfully",
      data: cart,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
