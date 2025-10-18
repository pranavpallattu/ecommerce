const User = require("../models/userSchema");

exports.getAllCustomersController = async (req, res) => {
  try {
    const search = req.query.search || "";
    const page = parseInt(req.query.page || 1);
    let limit = parseInt(req.query.limit || 5);
    limit = limit > 5 ? 5 : limit;

    const skip = (page - 1) * limit;

    const customers = await User.find({
      isAdmin: { $ne: true },
      $or: [
        { name: { $regex: ".*" + search + ".*", $options: "i" } },
        { emailId: { $regex: ".*" + search + ".*", $options: "i" } },
      ],
    })
      .sort({ _id: -1 })
      .skip(skip)
      .limit(limit)
      .select("name emailId");
    return res.json({ message: "All customers data", data: customers });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

exports.updateUserStatusController = async (req, res) => {
  try {
    const { id } = req.params;

    const user = await User.findById(id);
    if (!user) return res.status(404).json({ message: "User not found" });

    user.isBlocked = !user.isBlocked;
    await user.save();

    return res
      .status(201)
      .json({
        message: `user is  ${user.isBlocked} ? unblocked :  blocked successfully`,
        data: user,
      });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};
