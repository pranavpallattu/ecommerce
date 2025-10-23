const Address = require("../../models/addressSchema");
const { ValidateAddressData } = require("../../utils/validation");

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

    if(shouldBeDefault){
        await Address.updateMany(
            {userId:user._id,isDefault:true},
            {$set : {isDefault:false}}
        )
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


exports.getAddressController=async(req,res)=>{
    try{
        const user=req.user
        const addresses=await Address.find({userId:user._id}).sort({isDefault:-1,createdAt:-1})

        return res.status(200).json({status:true,message:"Addresses retrieved successfully",data:addresses})
    }
    catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
}