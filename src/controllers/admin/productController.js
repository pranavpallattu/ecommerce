// controllers/adminProductController.js
const supabase = require("../../config/supabase");
const sharp = require("sharp");
const Product = require("../../models/productSchema");
const Category = require("../../models/categorySchema");
const mongoose = require("mongoose");
const { generateFileName } = require("../../utils/generateFileName");
const {
  validateProductData,
  validateEditProductData,
} = require("../../utils/validation");

const bucketName = "product-images";

// ---------- Helper: upload files to Supabase ----------
async function uploadFilesToSupabase(files = [], baseName = "img") {
  // Returns { urls: [], fileNames: [] } or throws
  const uploadedUrls = [];
  const uploadedFileNames = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];

    // Basic file validation (type + size)
    const allowedMime = ["image/jpeg", "image/png", "image/webp"];
    if (!allowedMime.includes(file.mimetype)) {
      throw new Error("Unsupported file type. Allowed: jpeg, png, webp");
    }
    const maxSizeBytes = 5 * 1024 * 1024; // 5MB
    if (file.size > maxSizeBytes) {
      throw new Error("File size exceeds 5MB limit");
    }

    // Process image
    const processed = await sharp(file.buffer)
      .resize(1200, 1200, { fit: "inside" })
      .webp({ quality: 80 })
      .toBuffer();

    // Make filename unique to avoid overwrite
    const fileName = generateFileName(`${baseName}-${Date.now()}`, i);

    const { error: uploadError } = await supabase.storage
      .from(bucketName)
      .upload(fileName, processed, { contentType: "image/webp", upsert: false });

    if (uploadError) {
      console.log(uploadError);
      
      // If any upload fails, attempt to clean up previous successful uploads
      if (uploadedFileNames.length > 0) {
        try { await supabase.storage.from(bucketName).remove(uploadedFileNames); } catch (e) { /* ignore */ }
      }
      throw new Error("Failed to upload image to storage");
    }

    const { data } = supabase.storage.from(bucketName).getPublicUrl(fileName);
    if (!data || !data.publicUrl) {
      // cleanup
      if (uploadedFileNames.length > 0) {
        try { await supabase.storage.from(bucketName).remove(uploadedFileNames); } catch (e) { /* ignore */ }
      }
      throw new Error("Failed to obtain public URL for uploaded image");
    }

    uploadedUrls.push(data.publicUrl);
    uploadedFileNames.push(fileName);
  }

  return { urls: uploadedUrls, fileNames: uploadedFileNames };
}

// ---------- Helper: remove files (best-effort) ----------
async function removeFilesFromSupabase(fileNames = []) {
  if (!fileNames || fileNames.length === 0) return { error: null };
  const { error } = await supabase.storage.from(bucketName).remove(fileNames);
  return { error };
}

// ---------- Helper: calculate sale price ----------
function calculateSalePrice(regularPriceRaw, categoryOfferRaw = 0, productOfferRaw = 0) {
  const regularPrice = Number(regularPriceRaw) || 0;
  const categoryOffer = Number(categoryOfferRaw) || 0;
  const productOffer = Number(productOfferRaw) || 0;
  const applicable = Math.max(categoryOffer, productOffer);
  const salePrice = regularPrice - (regularPrice * applicable) / 100;
  return Math.round(salePrice * 100) / 100; // round to 2 decimals
}

// ========================= Controller: addProduct =========================
exports.addProduct = async (req, res) => {
  try {
    // Validate incoming fields (preferably validateProductData checks req.body)
try{
  validateProductData(req, "add");
}
catch(err){
  console.log(err.message);
  
  return res.status(400).json({success:false,message:err.message})
}

    // console.log(req)

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

    if (!productName) return res.status(400).json({ message: "productName is required" });
    if (!mongoose.Types.ObjectId.isValid(categoryId)) return res.status(400).json({ message: "Invalid category id" });
    if (Number.isNaN(regularPrice) || regularPrice <= 0) return res.status(400).json({ message: "regularPrice must be a positive number" });

    // Check duplicate (case-insensitive)
    const existingProduct = await Product.findOne({ productName: { $regex: `^${productName}$`, $options: "i" } });
    if (existingProduct) return res.status(409).json({ message: "Product with this name already exists" });

    // Validate category
    const categoryDetails = await Category.findById(categoryId);
    if (!categoryDetails) return res.status(404).json({ message: "Category not found" });

    // Upload images (if any)
    const files = req.files?.productImage || [];
    if (files.length < 1) return res.status(400).json({ message: "At least one product image is required" });
    if (files.length > 4) return res.status(400).json({ message: "Maximum 4 images allowed" });

    // Upload processed images first
    const { urls: imageUrls } = await uploadFilesToSupabase(files, productName);

    // Compute sale price
    const salePrice = calculateSalePrice(regularPrice, categoryDetails.offer || 0, offer);

    // Save product
    const newProduct = await Product.create({
      productName,
      category: categoryId,
      description,
      quantity,
      regularPrice,
      salePrice,
      productImage: imageUrls,
      offer,
      isActive: true,
      isDeleted: false,
    });

    return res.status(201).json({ success: true, message: "Product added successfully", data: newProduct });
  } catch (err) {
    // If error.message includes "Failed to upload", ensure no orphan files exist (upload helper already cleans)
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ========================= Controller: editProduct =========================
exports.editProduct = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: "Invalid product id" });

    validateProductData(req,"edit");

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
    const offer = offerRaw !== undefined ? Number(offerRaw) : (product.offer || 0);

    // Normalize arrays
    const existingImages = Array.isArray(existingImagesRaw)
      ? existingImagesRaw
      : existingImagesRaw ? [existingImagesRaw] : [];

    const removedImages = Array.isArray(removedImagesRaw)
      ? removedImagesRaw
      : removedImagesRaw ? [removedImagesRaw] : [];

    // Validate category if provided
    if (categoryId && !mongoose.Types.ObjectId.isValid(categoryId)) {
      return res.status(400).json({ message: "Invalid category id" });
    }

    const categoryDetails = categoryId ? await Category.findById(categoryId) : await Category.findById(product.category);
    if (!categoryDetails) return res.status(404).json({ message: "Category not found" });

    // Validate removedImages: ensure they belong to existing product images
    const invalidRemovals = removedImages.filter((img) => !product.productImage.includes(img));
    if (invalidRemovals.length > 0) {
      return res.status(400).json({ message: "Attempted to remove images not belonging to product", invalidRemovals });
    }

    // Upload new images first (so we don't delete until DB update succeeds)
    const files = req.files?.productImage || [];
    if (files.length > 0 && files.length + product.productImage.length - removedImages.length > 4) {
      return res.status(400).json({ message: "Total images after update would exceed the maximum of 4" });
    }

    const uploadResult = await (files.length > 0 ? uploadFilesToSupabase(files, productName) : Promise.resolve({ urls: [], fileNames: [] }));
    const newImageUrls = uploadResult.urls || [];

    // Compute final images array using existingImages provided by client (trusted subset) OR fallback to original
    const keptExisting = existingImages.length > 0 ? existingImages.filter(img => product.productImage.includes(img)) : product.productImage.filter(img => !removedImages.includes(img));
    const finalImages = [...keptExisting, ...newImageUrls];

    if (finalImages.length < 1) {
      // If we uploaded new images and DB not updated, attempt cleanup of uploaded files
      if (uploadResult.fileNames && uploadResult.fileNames.length > 0) {
        try { await removeFilesFromSupabase(uploadResult.fileNames); } catch (e) { /* ignore */ }
      }
      return res.status(400).json({ message: "Product must have at least one image" });
    }

    // Calculate sale price using chosen category offers
    const salePrice = calculateSalePrice(regularPrice, categoryDetails.offer || 0, offer);

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
    const updated = await Product.findByIdAndUpdate(id, updatePayload, { new: true });
    if (!updated) {
      // cleanup uploaded images if DB update failed
      if (uploadResult.fileNames && uploadResult.fileNames.length > 0) {
        try { await removeFilesFromSupabase(uploadResult.fileNames); } catch (e) { /* ignore */ }
      }
      return res.status(500).json({ message: "Failed to update product" });
    }

    // After successful update, delete removed images from storage (best-effort)
    if (removedImages.length > 0) {
      const namesToRemove = removedImages.map(url => url.split("/").pop());
      try {
        await removeFilesFromSupabase(namesToRemove);
      } catch (e) {
        // log but don't fail the request
        console.warn("Failed to remove old image files:", e.message || e);
      }
    }

    return res.json({ success: true, message: "Product updated successfully", data: updated });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ========================= list / unlist / soft delete =========================
exports.unListProduct = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: "Invalid product id" });

    const updated = await Product.findByIdAndUpdate(id, { isActive: false }, { new: true });
    if (!updated) return res.status(404).json({ message: "Product not found" });
    return res.json({ success: true, message: "Product unlisted successfully", data: updated });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

exports.listProduct = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: "Invalid product id" });

    const updated = await Product.findByIdAndUpdate(id, { isActive: true }, { new: true });
    if (!updated) return res.status(404).json({ message: "Product not found" });
    return res.json({ success: true, message: "Product listed successfully", data: updated });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

exports.softDeleteProduct = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: "Invalid product id" });

    const updated = await Product.findByIdAndUpdate(id, { isDeleted: true, deletedAt: new Date() }, { new: true });
    if (!updated) return res.status(404).json({ message: "Product not found" });
    return res.json({ success: true, message: "Product soft-deleted successfully", data: updated });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ========================= getProducts (admin list) =========================
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

// ========================= get single product =========================
exports.getProduct = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: "Invalid product id" });

    const product = await Product.findById(id).populate("category", "name offer").lean();
    if (!product) return res.status(404).json({ message: "Product not found" });

    return res.json({ success: true, message: "Product fetched successfully", data: product });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

