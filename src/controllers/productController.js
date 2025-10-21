const supabase = require("../config/supabase");
const sharp = require("sharp");
const Product = require("../models/productSchema");
const { generateFileName } = require("../utils/generateFileName");
const {
  validateProductData,
  validateEditProductData,
} = require("../utils/validation");
const Category = require("../models/categorySchema");

const bucketName = "product-images";

exports.addProductController = async (req, res) => {
  const { productName, category, description, quantity, regularPrice, offer } =
    req.body;

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

    const categoryDetails = await Category.findById(category);
    if (!categoryDetails) {
      res.status(409).json({ message: "category not found" });
    }
    const categoryOffer = categoryDetails.offer || 0;
    const productOffer = offer || 0;
    const applicableOffer = Math.max(
      Number(productOffer),
      Number(categoryOffer)
    );
    const salePrice = regularPrice - (regularPrice * applicableOffer) / 100;

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
    const { id } = req.params;
    const {
      productName,
      category,
      description,
      quantity,
      regularPrice,
      offer,
    } = req.body;

    validateEditProductData(req);

    let existingImages = req.body.existingImages || [];
    let removedImages = req.body.removedImages || [];

    if (existingImages && !Array.isArray(existingImages)) {
      existingImages = [existingImages];
    }
    if (removedImages && !Array.isArray(removedImages)) {
      removedImages = [removedImages];
    }

    console.log("existingImages  " + existingImages);
    console.log("removedImages  " + removedImages);

    const product = await Product.findById(id);
    if (!product) {
      return res.status(406).json({ message: "product not found" });
    }

    const validRemovals = removedImages.filter((img) =>
      product.productImage.includes(img)
    );

    const invalidRemovals = removedImages.filter(
      (img) => !product.productImage.includes(img)
    );

    if (invalidRemovals.length > 0) {
      console.warn(
        "Attempted to remove images not in product:",
        invalidRemovals
      );
      res
        .status(409)
        .json({ message: "Attempted to remove images not in product" });
    }

    if (validRemovals.length > 0) {
      const filePathstoRemove = validRemovals.map((url) => {
        const filename = url.split("/").pop();
        return filename;
      });

      console.log(filePathstoRemove);

      if (filePathstoRemove.length > 0) {
        try {
          const { error } = await supabase.storage
            .from(bucketName)
            .remove(filePathstoRemove);
          if (error) {
            console.error("Failed to delete images:", error);
          }
        } catch (error) {
          console.error("Supabase delete error:", error);
        }
      }
    }

    const files = req.files?.productImage || [];

    let imageUrls = [];

    try {
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

        const { data } = supabase.storage
          .from(bucketName)
          .getPublicUrl(fileName);
        imageUrls.push(data.publicUrl);
        console.log(data);
      }
    } catch (error) {
      if (imageUrls.length > 0) {
        await supabase.storage.from(bucketName).remove(filePathstoRemove);
      }
    }

    const updatedImages = [
      ...existingImages.filter((img) => !removedImages.includes(img)),
      ...imageUrls,
    ];

    if (updatedImages.length < 1) {
      return res
        .status(406)
        .json({ message: "product must have aleast one image" });
    }
    if (updatedImages.length > 4) {
      return res
        .status(406)
        .json({ message: "product can have maximum of 4 images" });
    }

    const categoryDetails = await Category.findById(category);
    if (!categoryDetails) {
      return res.status(409).json({ message: "category not found" });
    }
    const categoryOffer = categoryDetails.offer || 0;
    const productOffer = offer || 0;
    const applicableOffer = Math.max(
      Number(productOffer),
      Number(categoryOffer)
    );
    const salePrice = regularPrice - (regularPrice * applicableOffer) / 100;

    const updatedProduct = await Product.findOneAndUpdate(
      { _id: id },
      {
        productName,
        category,
        description,
        quantity,
        regularPrice,
        salePrice,
        productImage: updatedImages,
        offer,
      },
      { new: true }
    );

    return res.json({
      message: "product updated successfully",
      data: updatedProduct,
    });
  } catch (error) {
    console.error(error.message);
    return res.status(500).json({ message: error.message });
  }
};

exports.unListProductController = async (req, res) => {
  try {
    const { id } = req.params;
    const product = await Product.findByIdAndUpdate(
      id,
      { isActive: false },
      { new: true }
    );

    if (!product) {
      return res.status(404).json({ message: "product doesnt exists" });
    }

    return res.json({ message: "product unlisted successfully" });
  } catch (error) {
    console.error(error.message);
    return res.status(500).json({ errorMessage: error.message });
  }
};

exports.listProductController = async (req, res) => {
  try {
    const { id } = req.params;
    const product = await Product.findByIdAndUpdate(
      id,
      { isActive: true },
      { new: true }
    );

    if (!product) {
      return res.status(404).json({ message: "product doesnt exists" });
    }

    return res.json({ message: "product listed successfully" });
  } catch (error) {
    console.error(error.message);
    return res.status(500).json({ errorMessage: error.message });
  }
};

exports.softDeleteProductController = async (req, res) => {
  try {
    const { id } = req.params;
    const product = await Product.findByIdAndUpdate(
      id,
      { isDeleted: true, deletedAt: Date.now() },
      { new: true }
    );
    if (!product) {
      return res.status(404).json({ message: "product doesnt exists" });
    }
    res.json({ message: "product soft deleted successfully" });
  } catch (error) {
    console.error(error.message);
    return res.status(500).json({ errorMessage: error.message });
  }
};

exports.getProductController = async (req, res) => {
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
          { productName: { $regex: search, $options: "i" } },
          { description: { $regex: search, $options: "i" } },
        ],
      }),
    };
    const [totalProducts, products] = await Promise.all([
      Product.countDocuments(searchQuery),
      Product.find(searchQuery)
        .populate("category")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
    ]);

    const totalPages = Math.ceil(totalProducts / limit);

    return res.status(200).json({
      success: true,
      message: "Products retrieved successfully",
      data: products,
      pagination: {
        totalProducts,
        totalPages,
        currentPage: page,
        limit,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
    });
  } catch (error) {
    return res
      .status(500)
      .json({ success: false, message: error.message });
  }
};
