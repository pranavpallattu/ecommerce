const supabase = require("../config/supabase");
const sharp = require("sharp");
const Product = require("../models/productSchema");
const { generateFileName } = require("../utils/generateFileName");
const { validateProductData } = require("../utils/validation");
const Category = require("../models/categorySchema");

const bucketName = "product-images";

exports.addProductController = async (req, res) => {
  const {
    productName,
    category,
    description,
    quantity,
    regularPrice,
    offer,
  } = req.body;

  try {
    validateProductData(req);
    console.log(req);

    const existingProduct = await Product.findOne({ productName });
    if (existingProduct) {
      return res
        .status(409)
        .json({ message: "product with this name already exists" });
    }

    const files = req.files?.productImage;

    // if (!req.files || req.files.length === 0) {
    //   return res
    //     .status(400)
    //     .json({ message: "At least one product image is required" });
    // }

    let imageUrls = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const processedImg = await sharp(file.buffer)
        .resize(800, 800)
        .webp({ quality: 80 })
        .toBuffer();

      const fileName = generateFileName(productName, i);
      console.log(fileName);

      const { error } = await supabase.storage
        .from(bucketName)
        .upload(fileName, processedImg, { contentType: "image/webp" });

      if (error) {
        console.error("supabase upload error" + error.message);

        return res.status(409).json({ message: "image upload failed" });
      }

      const { data } = supabase.storage.from(bucketName).getPublicUrl(fileName);
      imageUrls.push(data.publicUrl);
      console.log(data);
    }

    const categoryDetails=await Category.findById(category)
    if(!categoryDetails){
        res.status(409).json({message:"category not found"})
    }
    const categoryOffer=categoryDetails.offer || 0
    const productOffer=offer || 0
    const applicableOffer=Math.max(Number(productOffer),Number(categoryOffer))
    const salePrice=regularPrice-(regularPrice * applicableOffer)/100

    const newProduct = new Product({
      productName,
      category,
      description,
      quantity,
      regularPrice,
      salePrice,
      productImage: imageUrls,
      offer,
    });

    await newProduct.save();

    return res.json({
      message: "product added successfully",
      data: newProduct,
    });
  } catch (error) {
    res.status(500).json({ errorMessage: error.message });
  }
};

exports.editProductController = async (req, res) => {
  try {
    
  } catch (error) {
    console.error(error.message);
    return res.status(500).json({ errorMessage: error.message });
  }
};


exports.unListProductController=async(req,res)=>{
      try {
        const{id}=req.params
        const product=await Product.findByIdAndUpdate(
            id,
            {isActive:false},
            {new:true}
        )

        if(!product){
          return res.status(404).json({message:"product doesnt exists"})
        }

        return res.json({message:"product unlisted successfully"})
    
  } catch (error) {
    console.error(error.message);
    return res.status(500).json({ errorMessage: error.message });
  }
}

exports.listProductController=async(req,res)=>{
      try {
        const{id}=req.params
        const product=await Product.findByIdAndUpdate(
            id,
            {isActive:true},
            {new:true}
        )

        if(!product){
          return res.status(404).json({message:"product doesnt exists"})
        }

        return res.json({message:"product listed successfully"})
    
  } catch (error) {
    console.error(error.message);
    return res.status(500).json({ errorMessage: error.message });
  }
}

exports.softDeleteProductController=async(req,res)=>{
    try{
        const {id}=req.params
        const product=await Product.findByIdAndUpdate(id,{isDeleted:true,deletedAt:Date.now()},{new:true})
              if(!product){
          return res.status(404).json({message:"product doesnt exists"})
        }
        res.json({message:"product soft deleted successfully"})
    }
catch (error) {
    console.error(error.message);
    return res.status(500).json({ errorMessage: error.message });
  }
}