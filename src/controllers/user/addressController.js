const { default: mongoose } = require("mongoose");
const Address = require("../../models/addressSchema");
const {
  ValidateAddressData,
  validateEditAddressData,
} = require("../../utils/validation");

exports.addAddressController = async (req, res) => {
  try {
    const user = req.user;
    const {
      name,
      addressType,
      phone,
      streetAddress,
      city,
      state,
      postalCode,
      country,
      landmark,
      isDefault,
    } = req.body;

    const existingAddress = await Address.findOne({
      userId: user._id,
      streetAddress: streetAddress.trim(),
      city: city.trim(),
      state: state.trim(),
      postalCode: postalCode.trim(),
      country: country.trim(),
    });

    if (existingAddress) {
      return res.status(409).json({
        success: false,
        message: "This address already exists in your saved addresses.",
      });
    }

    try {
      ValidateAddressData(req.body);
    } catch (error) {
      return res.status(400).json({ success: false, message: error.message });
    }

    const addressCount = await Address.countDocuments({ userId: user._id });
    const shouldBeDefault = addressCount === 0 ? true : isDefault;

    if (shouldBeDefault) {
      await Address.updateMany(
        { userId: user._id, isDefault: true },
        { $set: { isDefault: false } }
      );
    }

    const newAddress = new Address({
      userId: user._id,
      name,
      addressType,
      phone,
      streetAddress,
      city,
      state,
      postalCode,
      country,
      landmark,
      isDefault: shouldBeDefault,
    });

    await newAddress.save();
    return res.status(201).json({
      success: true,
      message: "Address added successfully",
      data: newAddress,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getAddressController = async (req, res) => {
  try {
    const user = req.user;
    const addresses = await Address.find({
      userId: user._id,
      deletedAt: null,
    }).sort({
      isDefault: -1,
      createdAt: -1,
    });

    return res.status(200).json({
      status: true,
      message: "Addresses retrieved successfully",
      data: addresses,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.softDeleteAddressController = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid address ID" });
    }

    const address = await Address.findById(id);

    if (!address || address.deletedAt) {
      return res
        .status(404)
        .json({ success: false, message: "Address does not exist" });
    }

    address.deletedAt = Date.now();

    await address.save();

    return res.status(200).json({
      status: true,
      message: "Address deleted successfully",
      data: {
        id: address._id,
        deletedAt: address.deletedAt,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.editAddressController = async (req, res) => {
  try {
    const { id } = req.params;
    const user = req.user;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid address ID" });
    }

    const existingAddress = await Address.findOne({
      _id: id,
      userId: user._id,
      deletedAt: null,
    });
    if (!existingAddress) {
      return res
        .status(404)
        .json({ success: false, message: "Address not found" });
    }

    try {
      validateEditAddressData(req.body);
    } catch (error) {
      return res.status(400).json({ success: false, message: error.message });
    }

    if (req.body.isDefault === true) {
      await Address.updateMany(
        { userId: user._id, isDefault: true },
        { $set: { isDefault: false } }
      );
    }

    const cleanData = {};
    for (const [key, value] of Object.entries(req.body)) {
      if (value !== undefined) cleanData[key] = value;
    }

    Object.assign(existingAddress, cleanData);
    await existingAddress.save();

    return res.status(200).json({
      success: true,
      message: "Address updated successfully",
      data: existingAddress,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
