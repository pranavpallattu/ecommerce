// controllers/adminProductController.js
const supabase = require("../../config/supabase");
const sharp = require("sharp");
const crypto = require("crypto");
const Product = require("../../models/productSchema");
const Category = require("../../models/categorySchema");
const mongoose = require("mongoose");
const { generateFileName } = require("../../utils/generateFileName");
const {
  validateProductData,
  validateEditProductData,
} = require("../../utils/validation");

const bucketName = "product-images";

// Helper: Upload images to Supabase Storage.
// - Validates file type and size.
// - Optimizes images using Sharp.
// - Generates a SHA-256 hash for duplicate detection.
// - Uploads the processed images to Supabase.
// - Returns uploaded image metadata along with uploaded file names.
async function uploadFilesToSupabase(files = [], baseName = "img") {
  // Stores uploaded image objects: { imageUrl, hash }
  const uploadedImages = [];

  // Stores uploaded file names for cleanup if an upload fails.
  const uploadedFileNames = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];

    // Validate supported image formats.
    const allowedMime = ["image/jpeg", "image/png", "image/webp"];
    if (!allowedMime.includes(file.mimetype)) {
      throw new Error("Unsupported file type. Allowed: jpeg, png, webp");
    }

    // Limit upload size to 5 MB.
    const maxSizeBytes = 5 * 1024 * 1024;
    if (file.size > maxSizeBytes) {
      throw new Error("File size exceeds 5MB limit");
    }

    // Resize and convert the image to WebP format.
    const processed = await sharp(file.buffer)
      .resize(1200, 1200, { fit: "inside" })
      .webp({ quality: 80 })
      .toBuffer();

    // Generate a hash from the processed image.
    // This is used later to detect duplicate uploads.
    const hash = crypto.createHash("sha256").update(processed).digest("hex");

    // Generate a unique filename to prevent overwriting existing files.
    const fileName = generateFileName(`${baseName}-${Date.now()}`, i);

    const { error: uploadError } = await supabase.storage
      .from(bucketName)
      .upload(fileName, processed, {
        contentType: "image/webp",
        upsert: false,
      });

    if (uploadError) {
      console.log(uploadError);

      // Roll back any images that were uploaded successfully
      // before this failure occurred.
      if (uploadedFileNames.length > 0) {
        try {
          await supabase.storage.from(bucketName).remove(uploadedFileNames);
        } catch (e) {
          /* ignore cleanup errors */
        }
      }

      throw new Error("Failed to upload image to storage");
    }

    // Retrieve the public URL of the uploaded image.
    const { data } = supabase.storage.from(bucketName).getPublicUrl(fileName);

    if (!data || !data.publicUrl) {
      // Clean up uploaded files if the public URL cannot be generated.
      if (uploadedFileNames.length > 0) {
        try {
          await supabase.storage.from(bucketName).remove(uploadedFileNames);
        } catch (e) {
          /* ignore cleanup errors */
        }
      }

      throw new Error("Failed to obtain public URL for uploaded image");
    }

    // Store image metadata for saving in the database.
    uploadedImages.push({
      imageUrl: data.publicUrl,
      hash,
    });

    uploadedFileNames.push(fileName);
  }

  // Return uploaded image metadata and file names.
  return {
    images: uploadedImages,
    fileNames: uploadedFileNames,
  };
}

// Helper: Remove images from Supabase Storage.
// Accepts an array of storage file names and deletes them.
// Returns the Supabase error object (if any).
async function removeFilesFromSupabase(fileNames = []) {
  // Nothing to delete.
  if (!fileNames || fileNames.length === 0) {
    return { error: null };
  }

  const { error } = await supabase.storage.from(bucketName).remove(fileNames);

  return { error };
}

//  Helper: calculate sale price
function calculateSalePrice(
  regularPriceRaw,
  categoryOfferRaw = 0,
  productOfferRaw = 0,
) {
  const regularPrice = Number(regularPriceRaw) || 0;
  const categoryOffer = Number(categoryOfferRaw) || 0;
  const productOffer = Number(productOfferRaw) || 0;
  const applicable = Math.max(categoryOffer, productOffer);
  const salePrice = regularPrice - (regularPrice * applicable) / 100;
  return Math.round(salePrice);
}

//  addProduct
exports.addProduct = async (req, res) => {
  try {
    try {
      validateProductData(req, "add");
    } catch (err) {
      console.log(err.message);

      return res.status(400).json({ success: false, message: err.message });
    }

    const {
      productName: rawName,
      category: categoryId,
      description,
      quantity: quantityRaw,
      regularPrice: regularPriceRaw,
      offer: offerRaw,
    } = req.body;

    const productName = String(rawName).trim();
    const quantity = Number(quantityRaw) || 0;
    const regularPrice = Number(regularPriceRaw);
    const offer = offerRaw !== undefined ? Number(offerRaw) : 0;

    if (!productName)
      return res.status(400).json({ message: "productName is required" });
    if (!mongoose.Types.ObjectId.isValid(categoryId))
      return res.status(400).json({ message: "Invalid category id" });
    if (Number.isNaN(regularPrice) || regularPrice <= 0)
      return res
        .status(400)
        .json({ message: "regularPrice must be a positive number" });

    // Check duplicate (case-insensitive)
    const existingProduct = await Product.findOne({
      productName: { $regex: `^${productName}$`, $options: "i" },
    });
    if (existingProduct)
      return res
        .status(409)
        .json({ message: "Product with this name already exists" });

    // Validate category
    const categoryDetails = await Category.findById(categoryId);
    if (!categoryDetails)
      return res.status(404).json({ message: "Category not found" });

    // Upload images
    const files = req.files?.productImage || [];
    if (files.length < 1)
      return res
        .status(400)
        .json({ message: "At least one product image is required" });
    if (files.length > 4)
      return res.status(400).json({ message: "Maximum 4 images allowed" });

    // Upload processed images first
    const { images } = await uploadFilesToSupabase(files, productName);
    // Compute sale price
    const salePrice = calculateSalePrice(
      regularPrice,
      categoryDetails.offer || 0,
      offer,
    );

    // Save product
    const newProduct = await Product.create({
      productName,
      category: categoryId,
      description,
      quantity,
      regularPrice,
      salePrice,
      productImage: images,
      offer,
    });

    return res.status(201).json({
      success: true,
      message: "Product added successfully",
      data: newProduct,
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

//  editProduct
exports.editProduct = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id))
      return res.status(400).json({ message: "Invalid product id" });

    validateProductData(req, "edit");

    const product = await Product.findById(id);
    if (!product) return res.status(404).json({ message: "Product not found" });

    // Destructure and normalize
    const {
      productName: rawName,
      category: categoryId,
      description,
      quantity: quantityRaw,
      regularPrice: regularPriceRaw,
      offer: offerRaw,
      existingImages: existingImagesRaw = [],
      removedImages: removedImagesRaw = [],
    } = req.body;

    const productName = rawName ? String(rawName).trim() : product.productName;
    const quantity = Number(quantityRaw ?? product.quantity) || 0;
    const regularPrice = Number(regularPriceRaw ?? product.regularPrice);
    const offer =
      offerRaw !== undefined ? Number(offerRaw) : product.offer || 0;

    // Normalize arrays
    const existingImages = Array.isArray(existingImagesRaw)
      ? existingImagesRaw.map((img) => JSON.parse(img))
      : existingImagesRaw
        ? [JSON.parse(existingImagesRaw)]
        : [];

    const removedImages = Array.isArray(removedImagesRaw)
      ? removedImagesRaw.map((img) => JSON.parse(img))
      : removedImagesRaw
        ? [JSON.parse(removedImagesRaw)]
        : [];

    // Validate category if provided
    if (categoryId && !mongoose.Types.ObjectId.isValid(categoryId)) {
      return res.status(400).json({ message: "Invalid category id" });
    }

    const categoryDetails = categoryId
      ? await Category.findById(categoryId)
      : await Category.findById(product.category);
    if (!categoryDetails)
      return res.status(404).json({ message: "Category not found" });

    // Validate removedImages: ensure they belong to existing product images
    const invalidRemovals = removedImages.filter(
      (img) =>
        !product.productImage.some(
          (existing) => existing.imageUrl === img.imageUrl,
        ),
    );
    if (invalidRemovals.length > 0) {
      return res.status(400).json({
        message: "Attempted to remove images not belonging to product",
        invalidRemovals,
      });
    }

    // Upload new images first (so we don't delete until DB update succeeds)
    const files = req.files?.productImage || [];
    if (
      files.length > 0 &&
      files.length + product.productImage.length - removedImages.length > 4
    ) {
      return res.status(400).json({
        message: "Total images after update would exceed the maximum of 4",
      });
    }

    const uploadResult = await (files.length > 0
      ? uploadFilesToSupabase(files, productName)
      : Promise.resolve({ images: [], fileNames: [] }));
    const newImages = uploadResult.images || [];

    const duplicateImages = newImages.filter((newImg) =>
      product.productImage.some(
        (existingImg) => existingImg.hash === newImg.hash,
      ),
    );

    if (duplicateImages.length > 0) {
      await removeFilesFromSupabase(uploadResult.fileNames);

      return res.status(409).json({
        success: false,
        message: "One or more selected images already exist for this product.",
      });
    }
    // Compute final images array using existingImages provided by client (trusted subset) OR fallback to original
    const keptExisting =
      existingImages.length > 0
        ? existingImages.filter((img) =>
            product.productImage.some(
              (existing) => existing.imageUrl === img.imageUrl,
            ),
          )
        : product.productImage.filter(
            (img) =>
              !removedImages.some(
                (removed) => removed.imageUrl === img.imageUrl,
              ),
          );
    const finalImages = [...keptExisting, ...newImages];
    if (finalImages.length < 1) {
      // If we uploaded new images and DB not updated, attempt cleanup of uploaded files
      if (uploadResult.fileNames && uploadResult.fileNames.length > 0) {
        try {
          await removeFilesFromSupabase(uploadResult.fileNames);
        } catch (e) {
          /* ignore */
        }
      }
      return res
        .status(400)
        .json({ message: "Product must have at least one image" });
    }

    // Calculate sale price using chosen category offers
    const salePrice = calculateSalePrice(
      regularPrice,
      categoryDetails.offer || 0,
      offer,
    );

    // Prepare update payload
    const updatePayload = {
      productName,
      category: categoryId || product.category,
      description: description ?? product.description,
      quantity,
      regularPrice,
      salePrice,
      offer,
      productImage: finalImages,
    };

    // Update DB
    const updated = await Product.findByIdAndUpdate(id, updatePayload, {
      new: true,
    });
    if (!updated) {
      // cleanup uploaded images if DB update failed
      if (uploadResult.fileNames && uploadResult.fileNames.length > 0) {
        try {
          await removeFilesFromSupabase(uploadResult.fileNames);
        } catch (e) {
          /* ignore */
        }
      }
      return res.status(500).json({ message: "Failed to update product" });
    }

    // After successful update, delete removed images from storage (best-effort)
    if (removedImages.length > 0) {
      const namesToRemove = removedImages.map((img) =>
        img.imageUrl.split("/").pop(),
      );
      try {
        await removeFilesFromSupabase(namesToRemove);
      } catch (e) {
        console.warn("Failed to remove old image files:", e.message || e);
      }
    }

    return res.json({
      success: true,
      message: "Product updated successfully",
      data: updated,
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

exports.unListProduct = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id))
      return res.status(400).json({ message: "Invalid product id" });

    const updated = await Product.findByIdAndUpdate(
      id,
      { isActive: false },
      { new: true },
    );
    if (!updated) return res.status(404).json({ message: "Product not found" });
    return res.json({
      success: true,
      message: "Product unlisted successfully",
      data: updated,
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

exports.listProduct = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id))
      return res.status(400).json({ message: "Invalid product id" });

    const updated = await Product.findByIdAndUpdate(
      id,
      { isActive: true },
      { new: true },
    );
    if (!updated) return res.status(404).json({ message: "Product not found" });
    return res.json({
      success: true,
      message: "Product listed successfully",
      data: updated,
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

exports.softDeleteProduct = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id))
      return res.status(400).json({ message: "Invalid product id" });

    const updated = await Product.findByIdAndUpdate(
      id,
      { deletedAt: new Date() },
      { new: true },
    );
    if (!updated) return res.status(404).json({ message: "Product not found" });
    return res.json({
      success: true,
      message: "Product soft-deleted successfully",
      data: updated,
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// getProducts ()
exports.getProducts = async (req, res) => {
  try {
    const search = String(req.query.search || "").trim();
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(Math.max(1, parseInt(req.query.limit) || 10), 50); // default 10, max 50
    const skip = (page - 1) * limit;

    const query = {
      deletedAt: { $eq: null },
      ...(search && {
        $or: [
          { productName: { $regex: search, $options: "i" } },
          { description: { $regex: search, $options: "i" } },
        ],
      }),
    };

    const [totalProducts, products] = await Promise.all([
      Product.countDocuments(query),
      Product.find(query)
        .populate("category", "name offer")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
    ]);

    return res.json({
      success: true,
      message: "Products retrieved successfully",
      data: products,
      pagination: {
        totalProducts,
        totalPages: Math.ceil(totalProducts / limit),
        currentPage: page,
        limit,
        hasNextPage: page * limit < totalProducts,
        hasPrevPage: page > 1,
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// get single product
exports.getProduct = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id))
      return res.status(400).json({ message: "Invalid product id" });

    const product = await Product.findById(id)
      .populate("category", "name offer")
      .lean();
    if (!product) return res.status(404).json({ message: "Product not found" });

    return res.json({
      success: true,
      message: "Product fetched successfully",
      data: product,
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};
