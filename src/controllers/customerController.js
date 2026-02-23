const User = require("../models/userSchema");

exports.getAllCustomersController = async (req, res) => {
  try {
    const search = req.query.search || "";
    const page = parseInt(req.query.page || 1);
    let limit = parseInt(req.query.limit || 5);
    limit = limit > 5 ? 5 : limit;

    const skip = (page - 1) * limit;

    const customers = await User.find({
      isAdmin: false,
      deletedAt: { $exists: false },
      $or: [
        { name: { $regex: ".*" + search + ".*", $options: "i" } },
        { emailId: { $regex: ".*" + search + ".*", $options: "i" } },
        { phone: { $regex: ".*" + search + ".*", $options: "i" } },
      ],
    })
      .sort({ _id: -1 })
      .skip(skip)
      .limit(limit)
      .select("name emailId createdAt");

    const totalCustomers = await User.countDocuments({
      isAdmin: false,
      deletedAt: { $exists: false },
    });
    const totalPages = Math.ceil(totalCustomers / limit);

    return res.json({
      success: true,
      message: "All customers data",
      data: customers,
      pagination: {
        totalCustomers,
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

exports.updateUserStatusController = async (req, res) => {
  try {
    const { id } = req.params;

    const user = await User.findById(id);
    if (!user)
      return res
        .status(404)
        .json({ success: false, message: "User not found" });

    if (user.isAdmin) {
      return res
        .status(403)
        .json({ success: false, message: "Cannot block admin account" });
    }

    user.isBlocked = !user.isBlocked;
    await user.save();

    return res.status(200).json({
      success: true,
      message: `user is  ${
        user.isBlocked ? "blocked" : "unblocked"
      } successfully`,
      data: user,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};
