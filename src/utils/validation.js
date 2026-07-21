const { default: mongoose } = require("mongoose");
const validator = require("validator");
function validateSignUpData(req) {
  const { emailId, password, name } = req.body;

  if (!name || !emailId || !password) {
    throw new Error("name emailId password are required");
  } else if (!validator.isEmail(emailId)) {
    throw new Error("Invalid email format");
  } else if (!validator.isStrongPassword(password)) {
    throw new Error("password is not strong");
  }
}

function validateCategoryData(req) {
  const { name, description, offer } = req.body;

  const throwValidationError = (message) => {
    const error = new Error(message);
    error.statusCode = 400;
    throw error;
  };

  // ===========================
  // Required Fields
  // ===========================
  if (!name?.trim()) {
    throwValidationError("Category name is required");
  }

  if (!description?.trim()) {
    throwValidationError("Category description is required");
  }

  const trimmedName = name.trim();
  const trimmedDescription = description.trim();

  // ===========================
  // Category Name Validation
  // ===========================
  const namePattern = /^[A-Za-z]+(?:\s[A-Za-z]+)*$/;

  if (!namePattern.test(trimmedName)) {
    throwValidationError(
      "Category name can only contain letters and single spaces between words",
    );
  }

  if (trimmedName.length < 3) {
    throwValidationError("Category name must be at least 3 characters long");
  }

  if (trimmedName.length > 50) {
    throwValidationError("Category name cannot exceed 50 characters");
  }

  // ===========================
  // Description Validation
  // ===========================
  if (trimmedDescription.length < 10) {
    throwValidationError("Description must be at least 10 characters long");
  }

  if (trimmedDescription.length > 200) {
    throwValidationError("Description cannot exceed 200 characters");
  }

  // ===========================
  // Offer Validation
  // ===========================
  let cleanedOffer = 0;

  if (offer !== undefined && offer !== null && offer !== "") {
    const offerNumber = Number(offer);

    if (!Number.isFinite(offerNumber)) {
      throwValidationError("Offer must be a valid number");
    }

    if (offerNumber < 0 || offerNumber > 100) {
      throwValidationError("Offer must be between 0 and 100");
    }

    cleanedOffer = offerNumber;
  }

  return {
    name: trimmedName,
    description: trimmedDescription,
    offer: cleanedOffer,
  };
}

function validateProductData(req, mode = "add") {
  let pattern = /^[a-z0-9\s\-()]+$/i;

  const {
    productName,
    category,
    description,
    quantity,
    regularPrice,
    salePrice,
    offer,
  } = req.body;

  // console.log(req.body);

  const files = req?.files;

  console.log(files);

  // productName
  if (
    !productName ||
    productName.length < 3 ||
    productName.length > 50 ||
    !pattern.test(productName)
  ) {
    throw new Error("product name must have 3 to 50 characters");
  }

  // 🟢 FIX: For edit, images are optional
  if (mode === "add") {
    if (!files || files.length <= 0 || files.length > 4) {
      throw new Error("There should be at least one image and maximum of 4");
    }
  } else if (mode === "edit") {
    if (files && files.length > 4) {
      throw new Error("Maximum of 4 images allowed");
    }
  }

  if (!description || description.length < 10 || description.length > 500) {
    throw new Error("description should be between 10 to 500 characters");
  }

  if (!category) {
    throw new Error("Category cannot be empty");
  }

  if (quantity == null || quantity < 0) {
    throw new Error("Quantity cannot be negative");
  }

  if (regularPrice == null || regularPrice < 0) {
    throw new Error("Regular price can't be a negative number");
  }

  if (salePrice != null && salePrice < 0) {
    throw new Error("Sale price cannot be negative.");
  }

  if (offer != null && (offer < 0 || offer > 100)) {
    throw new Error("Offer should be between 0 to 100");
  }

  console.log("validation passed");
}

function validateEditProductData(req) {
  const pattern = /^[a-z0-9\s\-()]+$/i;

  const {
    productName,
    category,
    description,
    quantity,
    regularPrice,
    offer,
    existingImages,
    removedImages,
  } = req.body;

  const files = req.files?.productImage || [];

  // 1️⃣ Product name
  if (
    !productName ||
    productName.length < 3 ||
    productName.length > 50 ||
    !pattern.test(productName)
  ) {
    throw new Error(
      "Product name must be 3–50 characters long and contain only letters, numbers, spaces, -, or ().",
    );
  }

  // 2️⃣ Description
  if (!description || description.length < 10 || description.length > 500) {
    throw new Error("Description should be between 10 and 500 characters.");
  }

  // 3️⃣ Quantity
  if (quantity == null || !Number.isInteger(Number(quantity)) || quantity < 0) {
    throw new Error("Quantity must be a positive integer.");
  }

  // 4️⃣ Category
  if (!category) {
    throw new Error("Category cannot be empty.");
  }

  // 5️⃣ Price validation
  if (regularPrice == null || regularPrice < 0) {
    throw new Error("Regular price cannot be negative or empty.");
  }

  // 6️⃣ Offer validation
  if (offer != null && (offer < 0 || offer > 100)) {
    throw new Error("Offer should be between 0 and 100.");
  }
}

function validateCouponData(couponData) {
  const {
    code,
    description,
    expiryDate,
    discountType,
    discount,
    minPurchase,
    usageLimit,
    perUserLimit,
  } = couponData;

  // Validate code
  if (!code || typeof code !== "string" || code.trim().length === 0) {
    throw new Error("Coupon code is required and it should be a string");
  } else if (code.length < 3 || code.length > 40) {
    throw new Error("Coupon code should be between 3 to 40 characters");
  }

  if (
    !description ||
    typeof description !== "string" ||
    description.trim().length === 0
  ) {
    throw new Error("Description is required and it should be a string");
  } else if (description.length < 5 || description.length > 200) {
    throw new Error("Description should be between 5 to 200 characters");
  }

  if (!discountType || !["percentage", "flat"].includes(discountType)) {
    throw new Error("Discount type must be either 'percentage' or 'flat'");
  }

  if (!expiryDate) {
    throw new Error("Expiry date is required");
  } else {
    const expiry = new Date(expiryDate); // Changed variable name to avoid shadowing
    const currentDate = new Date();

    if (isNaN(expiry.getTime())) {
      throw new Error("Invalid date format");
    } else if (expiry <= currentDate) {
      throw new Error("Expiry date must be in the future");
    }
  }

  if (discount === undefined || discount === null) {
    throw new Error("Discount is required");
  } else if (typeof discount !== "number" || isNaN(discount)) {
    throw new Error("Discount must be a valid number");
  } else if (
    discountType === "percentage" &&
    (discount <= 0 || discount > 100)
  ) {
    throw new Error("Discount must be a number between 0 and 100");
  } else if (discountType === "flat" && discount <= 0) {
    throw new Error("Discount must be a valid positive number");
  }

  if (minPurchase === undefined || minPurchase === null) {
    throw new Error("Minimum purchase amount is required");
  } else if (typeof minPurchase !== "number" || isNaN(minPurchase)) {
    throw new Error("Minimum purchase amount must be a valid number");
  } else if (minPurchase < 0) {
    throw new Error("Minimum purchase amount must be a positive number");
  }

  if (usageLimit !== null && usageLimit !== undefined) {
    if (typeof usageLimit !== "number" || isNaN(usageLimit)) {
      throw new Error("Usage limit must be a valid number");
    } else if (usageLimit < 1) {
      throw new Error("Usage limit must be at least 1");
    } else if (!Number.isInteger(usageLimit)) {
      throw new Error("Usage limit must be a whole number");
    }
  }

  if (perUserLimit !== null && perUserLimit !== undefined) {
    if (typeof perUserLimit !== "number" || isNaN(perUserLimit)) {
      throw new Error("Per user limit must be a valid number");
    } else if (perUserLimit < 1) {
      throw new Error("Per user limit must be at least 1");
    } else if (!Number.isInteger(perUserLimit)) {
      throw new Error("Per user limit must be a whole number");
    }
  }
}

function validateEditCouponData(editCouponData, existingCoupon) {
  const {
    code,
    description,
    expiryDate,
    discount,
    minPurchase,
    usageLimit,
    perUserLimit,
  } = editCouponData;

  if (code !== undefined) {
    if (!code || typeof code !== "string" || code.trim().length === 0) {
      throw new Error("Coupon code cannot be empty");
    } else if (code.length < 3 || code.length > 40) {
      throw new Error("Coupon code should be between 3 to 40 characters");
    }
  }

  if (description !== undefined) {
    if (
      !description ||
      typeof description !== "string" ||
      description.trim().length === 0
    ) {
      throw new Error("Description cannot be empty");
    } else if (description.length < 5 || description.length > 200) {
      throw new Error("Description should be between 5 to 200 characters");
    }
  }

  if (expiryDate !== undefined) {
    if (!expiryDate) {
      throw new Error("Expiry date cannot be empty");
    } else {
      const expiry = new Date(expiryDate); // Changed variable name to avoid shadowing
      const currentDate = new Date();

      if (isNaN(expiry.getTime())) {
        throw new Error("Invalid date format");
      } else if (expiry <= currentDate) {
        throw new Error("Expiry date must be in the future");
      }
    }
  }

  if (discount !== undefined) {
    if (discount === null || typeof discount !== "number" || isNaN(discount)) {
      throw new Error("Discount must be a valid number");
    }

    if (!existingCoupon || !existingCoupon.discountType) {
      throw new Error("Cannot validate discount without existing coupon data");
    }
    const typeToValidate = existingCoupon.discountType;
    if (typeToValidate === "percentage" && (discount <= 0 || discount > 100)) {
      throw new Error("Discount percentage must be a number between 0 and 100");
    } else if (typeToValidate === "flat" && discount <= 0) {
      throw new Error("Discount amount must be a valid positive number");
    }
  }

  // Validate minPurchase (only if provided)
  if (minPurchase !== undefined) {
    if (
      minPurchase === null ||
      typeof minPurchase !== "number" ||
      isNaN(minPurchase)
    ) {
      throw new Error("Minimum purchase amount must be a valid number");
    } else if (minPurchase < 0) {
      throw new Error("Minimum purchase amount must be a positive number");
    }
  }

  // Validate usageLimit (optional field, only if provided and not null)
  if (usageLimit !== undefined && usageLimit !== null) {
    if (typeof usageLimit !== "number" || isNaN(usageLimit)) {
      throw new Error("Usage limit must be a valid number");
    } else if (usageLimit < 1) {
      throw new Error("Usage limit must be at least 1");
    } else if (!Number.isInteger(usageLimit)) {
      throw new Error("Usage limit must be a whole number");
    }
  }

  // Validate perUserLimit (optional field, only if provided and not null)
  if (perUserLimit !== undefined && perUserLimit !== null) {
    if (typeof perUserLimit !== "number" || isNaN(perUserLimit)) {
      throw new Error("Per user limit must be a valid number");
    } else if (perUserLimit < 1) {
      throw new Error("Per user limit must be at least 1");
    } else if (!Number.isInteger(perUserLimit)) {
      throw new Error("Per user limit must be a whole number");
    }
  }
}

function ValidateAddressData(addressData) {
  const {
    name,
    addressType,
    phone,
    streetAddress,
    city,
    state,
    pincode,
    country,
    landmark,
    isDefault,
  } = addressData;

  // Validate name
  if (!name) {
    throw new Error("Name is required");
  } else if (typeof name !== "string") {
    throw new Error("Name must be a string");
  } else if (name.trim().length < 2) {
    throw new Error("Name must be at least 2 characters long");
  } else if (name.trim().length > 50) {
    throw new Error("Name must not exceed 50 characters");
  } else if (!/^[a-zA-Z\s]+$/.test(name.trim())) {
    throw new Error("Name must contain only letters and spaces");
  }

  // Validate addressType
  if (addressType) {
    const validTypes = ["home", "work", "other"];
    if (!validTypes.includes(addressType.toLowerCase())) {
      throw new Error("Address type must be 'home', 'work', or 'other'");
    }
  }

  // Validate phone
  if (!phone) {
    throw new Error("Phone number is required");
  } else if (typeof phone !== "string") {
    throw new Error("Phone number must be a string");
  } else {
    // Remove spaces and special characters for validation
    const cleanPhone = phone.replace(/[\s\-\(\)]/g, "");

    // Indian phone number validation (10 digits, starting with 6-9)
    if (!/^[6-9]\d{9}$/.test(cleanPhone)) {
      throw new Error(
        "Phone number must be a valid 10-digit Indian mobile number",
      );
    }
  }

  // Validate streetAddress
  if (!streetAddress) {
    throw new Error("Street address is required");
  } else if (typeof streetAddress !== "string") {
    throw new Error("Street address must be a string");
  } else if (streetAddress.trim().length < 5) {
    throw new Error("Street address must be at least 5 characters long");
  } else if (streetAddress.trim().length > 200) {
    throw new Error("Street address must not exceed 200 characters");
  }

  // Validate city
  if (!city) {
    throw new Error("City is required");
  } else if (typeof city !== "string") {
    throw new Error("City must be a string");
  } else if (city.trim().length < 2) {
    throw new Error("City must be at least 2 characters long");
  } else if (city.trim().length > 50) {
    throw new Error("City must not exceed 50 characters");
  } else if (!/^[a-zA-Z\s]+$/.test(city.trim())) {
    throw new Error("City must contain only letters and spaces");
  }

  // Validate state
  if (!state) {
    throw new Error("State is required");
  } else if (typeof state !== "string") {
    throw new Error("State must be a string");
  } else if (state.trim().length < 2) {
    throw new Error("State must be at least 2 characters long");
  } else if (state.trim().length > 50) {
    throw new Error("State must not exceed 50 characters");
  } else if (!/^[a-zA-Z\s]+$/.test(state.trim())) {
    throw new Error("State must contain only letters and spaces");
  }

  // Validate pincode (Indian PIN code)
  if (!pincode) {
    throw new Error("pincode is required");
  } else if (typeof pincode !== "string") {
    throw new Error("pincode must be a string");
  } else if (!/^[1-9][0-9]{5}$/.test(pincode.trim())) {
    throw new Error("pincode must be a valid 6-digit Indian PIN code");
  }

  // Validate country
  if (!country) {
    throw new Error("Country is required");
  } else if (typeof country !== "string") {
    throw new Error("Country must be a string");
  } else if (country.trim().length < 2) {
    throw new Error("Country must be at least 2 characters long");
  } else if (country.trim().length > 50) {
    throw new Error("Country must not exceed 50 characters");
  }

  // Validate landmark (optional)
  if (landmark) {
    if (typeof landmark !== "string") {
      throw new Error("Landmark must be a string");
    } else if (landmark.trim().length > 100) {
      throw new Error("Landmark must not exceed 100 characters");
    }
  }

  if (isDefault !== undefined) {
    // Convert string to boolean if needed
    if (typeof isDefault === "string") {
      if (isDefault !== "true" && isDefault !== "false") {
        throw new Error("isDefault must be a boolean value");
      }
    } else if (typeof isDefault !== "boolean") {
      throw new Error("isDefault must be a boolean value");
    }
  }

  // // Validate isDefault (optional)
  // if (isDefault !== undefined) {
  //   if (typeof isDefault !== "boolean") {
  //      throw new Error("isDefault must be a boolean value");
  //   }
  // }
}

function validateEditAddressData(editAddressData) {
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
  } = editAddressData;

  // Validate name ✅ (Already correct)
  if (name !== undefined) {
    if (typeof name !== "string") {
      throw new Error("Name must be a string");
    }
    const trimmedName = name.trim();
    if (trimmedName.length === 0) {
      throw new Error("Name cannot be empty");
    }
    if (trimmedName.length < 2) {
      throw new Error("Name must be at least 2 characters long");
    }
    if (trimmedName.length > 50) {
      throw new Error("Name must not exceed 50 characters");
    }
    if (!/^[a-zA-Z\s]+$/.test(trimmedName)) {
      throw new Error("Name must contain only letters and spaces");
    }
  }

  // Validate addressType (FIXED)
  if (addressType !== undefined) {
    if (typeof addressType !== "string") {
      throw new Error("Address type must be a string");
    }
    const trimmedType = addressType.trim();
    if (trimmedType.length === 0) {
      throw new Error("Address type cannot be empty");
    }
    const validTypes = ["home", "work", "other"];
    if (!validTypes.includes(trimmedType.toLowerCase())) {
      throw new Error("Address type must be 'home', 'work', or 'other'");
    }
  }

  // Validate phone (FIXED)
  if (phone !== undefined) {
    if (typeof phone !== "string") {
      throw new Error("Phone number must be a string");
    }
    const trimmedPhone = phone.trim();
    if (trimmedPhone.length === 0) {
      throw new Error("Phone number cannot be empty");
    }
    // Remove spaces and special characters for validation
    const cleanPhone = trimmedPhone.replace(/[\s\-\(\)]/g, "");
    // Indian phone number validation (10 digits, starting with 6-9)
    if (!/^[6-9]\d{9}$/.test(cleanPhone)) {
      throw new Error(
        "Phone number must be a valid 10-digit Indian mobile number",
      );
    }
  }

  // Validate streetAddress (FIXED)
  if (streetAddress !== undefined) {
    if (typeof streetAddress !== "string") {
      throw new Error("Street address must be a string");
    }
    const trimmedAddress = streetAddress.trim();
    if (trimmedAddress.length === 0) {
      throw new Error("Street address cannot be empty");
    }
    if (trimmedAddress.length < 5) {
      throw new Error("Street address must be at least 5 characters long");
    }
    if (trimmedAddress.length > 200) {
      throw new Error("Street address must not exceed 200 characters");
    }
  }

  // Validate city (FIXED)
  if (city !== undefined) {
    if (typeof city !== "string") {
      throw new Error("City must be a string");
    }
    const trimmedCity = city.trim();
    if (trimmedCity.length === 0) {
      throw new Error("City cannot be empty");
    }
    if (trimmedCity.length < 2) {
      throw new Error("City must be at least 2 characters long");
    }
    if (trimmedCity.length > 50) {
      throw new Error("City must not exceed 50 characters");
    }
    if (!/^[a-zA-Z\s]+$/.test(trimmedCity)) {
      throw new Error("City must contain only letters and spaces");
    }
  }

  // Validate state (FIXED)
  if (state !== undefined) {
    if (typeof state !== "string") {
      throw new Error("State must be a string");
    }
    const trimmedState = state.trim();
    if (trimmedState.length === 0) {
      throw new Error("State cannot be empty");
    }
    if (trimmedState.length < 2) {
      throw new Error("State must be at least 2 characters long");
    }
    if (trimmedState.length > 50) {
      throw new Error("State must not exceed 50 characters");
    }
    if (!/^[a-zA-Z\s]+$/.test(trimmedState)) {
      throw new Error("State must contain only letters and spaces");
    }
  }

  // Validate postalCode (FIXED)
  if (postalCode !== undefined) {
    if (typeof postalCode !== "string") {
      throw new Error("Postal code must be a string");
    }
    const trimmedPostalCode = postalCode.trim();
    if (trimmedPostalCode.length === 0) {
      throw new Error("Postal code cannot be empty");
    }
    if (!/^[1-9][0-9]{5}$/.test(trimmedPostalCode)) {
      throw new Error("Postal code must be a valid 6-digit Indian PIN code");
    }
  }

  // Validate country (FIXED)
  if (country !== undefined) {
    if (typeof country !== "string") {
      throw new Error("Country must be a string");
    }
    const trimmedCountry = country.trim();
    if (trimmedCountry.length === 0) {
      throw new Error("Country cannot be empty");
    }
    if (trimmedCountry.length < 2) {
      throw new Error("Country must be at least 2 characters long");
    }
    if (trimmedCountry.length > 50) {
      throw new Error("Country must not exceed 50 characters");
    }
  }

  // Validate landmark (optional - can be empty) ✅ (Already correct)
  if (landmark !== undefined && landmark !== null) {
    if (typeof landmark !== "string") {
      throw new Error("Landmark must be a string");
    }
    const trimmedLandmark = landmark.trim();
    if (trimmedLandmark.length > 100) {
      throw new Error("Landmark must not exceed 100 characters");
    }
  }

  if (isDefault !== undefined) {
    // Convert string to boolean if needed
    if (typeof isDefault === "string") {
      if (isDefault !== "true" && isDefault !== "false") {
        throw new Error("isDefault must be a boolean value");
      }
    } else if (typeof isDefault !== "boolean") {
      throw new Error("isDefault must be a boolean value");
    }
  }
}

module.exports = {
  validateSignUpData,
  validateCategoryData,
  // validateEditCategoryData,
  validateProductData,
  validateEditProductData,
  validateCouponData,
  validateEditCouponData,
  ValidateAddressData,
  validateEditAddressData,
};
