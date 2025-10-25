const { default: mongoose } = require("mongoose");
const Cart = require("../../models/cartSchema");
const Product = require("../../models/productSchema");
const revalidateCoupon = require("../../utils/revalidateCoupon");
const calculateSubTotal = require("../../utils/calculateSubTotal");

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
    cart.subTotal = calculateSubTotal(cart.items)

    cart = await revalidateCoupon(cart);

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

exports.getCart = async (req, res) => {
  try {
    const user = req.user;

    let cart = await Cart.findOne({ userId: user._id })
      .populate("items.product")
      .populate("appliedCoupon");
    if (!cart) {
      return res.status(200).json({
        success:true,
        message: "Cart is empty",
        data: {
          items: [],
          totalItems: 0,
          subTotal: 0,
          discount: 0,
          finalTotal: 0,
        },
      });
    }

    // Revalidate coupon for response only (without saving) - to not validate rest principle by saving data in a get call we are not modifying db
    const tempCart = await revalidateCoupon(cart);


    return res.status(200).json({
      success: true,
      message: "Cart data is retieved successfully",
      data: tempCart,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.removeFromCart = async (req, res) => {
  try {
    const user = req.user;
    const { productId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(productId)) {
      return res
        .status(400)
        .json({ success: false, message: "ProductId is not valid" });
    }

    let cart = await Cart.findOne({ userId: user._id });

    if (!cart) {
      return res.status(404).json({
        success: false,
        message: "Cart is empty",
        data: {
          items: [],
          totalItems: 0,
          subTotal: 0,
          discount: 0,
          finalTotal: 0,
        },
      });
    }
    const product = cart.items.some(
      (item) => item.product.toString() === productId
    );
    if (!product) {
      return res
        .status(404)
        .json({ success: false, message: "Product does not found or exist" });
    }

    cart.items = cart.items.filter(
      (item) => item.product.toString() !== productId
    );

    // 🔹 Recalculate subtotal here
    cart.subTotal = calculateSubTotal(cart.items)
    cart = await revalidateCoupon(cart);
    cart.totalItems = cart.items.length;

    await cart.save();
    await cart.populate("items.product");

    return res.status(200).json({
      success: true,
      message: "Product is removed from cart successfully",
      data: cart,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
