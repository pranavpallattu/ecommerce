const Order = require("../../models/orderSchema");

exports.getUserOrders = async (req, res) => {
  try {
    const user = req.user;
    const orders = await Order.find({ userId: user._id })
      .populate("addressId")
      .populate("cartItems.productId")
      .sort({ createdAt: -1 });
    if (orders.length === 0) {
      return res
        .status(200)
        .json({ success: true, message: "No orders found", data: [] });
    }
    return res
      .status(200)
      .json({
        success: true,
        message: "Orders retrieved successfully",
        data: orders,
      });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.getSingleOrder=async(req,res)=>{
     try{
        const {orderId} = req.params

        const order=await Order.findById(orderId).populate("items.productId");
        if(!order){
                return res.status(404).json({ success: false, message:"Order not found" });
        }

    }
     catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
}

exports.orderCancel = async (req, res) => {
    try{


    }
     catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};
