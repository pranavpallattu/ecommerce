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
  let pattern = /^[a-z\s]+$/i;
  const { name, description, offer } = req.body;
  if (!name || !description || !offer) {
    throw new Error("please fill the form");
  } else if (!pattern.test(name) || name.length < 3) {
    throw new Error(
      "name should contain only letters and spaces and should not be less than 3 letters"
    );
  } else if (!description || description.length < 10) {
    throw new Error(
      "Category description should contain only letters and spaces and should not be less than 10 letters"
    );
  } else if (!offer || offer < 0 || offer > 100) {
    throw new Error("offer must be a number between 0 and 100");
  }
}

function validateEditCategoryData(req) {
  let pattern = /^[a-z\s]+$/i;
  const { name, description, offer } = req.body;

  if (name && (!pattern.test(name) || name.length < 3)) {
    throw new Error(
      "name should contain only letters and spaces and should not be less than 3 letters"
    );
  }
  if (description && description.length < 10) {
    throw new Error(
      "Category description should contain only letters and spaces and should not be less than 10 letters"
    );
  }
  if (offer !== undefined && (offer < 0 || offer > 100)) {
    throw new Error("offer must be a number between 0 and 100");
  }
}

function validateProductData(req) {
    let pattern = /^[a-z0-9\s\-()]+$/i;
      const {productName,category,description,quantity,regularPrice,salePrice,offer}=req.body
      const files=req?.files?.productImage
  if(!productName || productName.length<3  ||  productName.length>50 || !pattern.test(productName)){
    throw new Error("product name must have 3 to 50 characters")
  }
  if(!files || files.length<=0 || files.length>4){
        throw new Error("there should be atleast one image and maximum of 4")
  }
  if(!description || description.length<5 ||description.length>200){
    throw new Error("description should be between 5 to 200 characters")
  }
  if(!category){
    throw new Error("Category cannot be empty")
  }
  if(quantity==null || quantity<0){
    throw new Error("Quantity cannot be negative")
  }
   if(regularPrice==null || regularPrice<0){
    throw new Error("regular price cant be a negative number")
  }
   if (salePrice != null && salePrice < 0) {
    throw new Error("Sale price cannot be negative.");
  }
    if(offer !=null && (offer<0 || offer>100)){
    throw new Error(" offer should be between 0 to 100")
  }
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
  if (!productName || productName.length < 3 || productName.length > 50 || !pattern.test(productName)) {
    throw new Error("Product name must be 3–50 characters long and contain only letters, numbers, spaces, -, or ().");
  }

  // 2️⃣ Description
  if (!description || description.length < 5 || description.length > 200) {
    throw new Error("Description should be between 5 and 200 characters.");
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

  // // 7️⃣ Image validation
  // const totalImages =
  //   (Array.isArray(existingImages) ? existingImages.length : 0) +
  //   (Array.isArray(files) ? files.length : 0);

  // if (totalImages < 1) {
  //   throw new Error("Product must have at least one image.");
  // }

  // if (totalImages > 4) {
  //   throw new Error("Product can have a maximum of 4 images.");
  // }

  // if (removedImages && Array.isArray(removedImages) && removedImages.length > 4) {
  //   throw new Error("Removed images list cannot exceed 4.");
  // }
}



module.exports = {
  validateSignUpData,
  validateCategoryData,
  validateEditCategoryData,
  validateProductData,
  validateEditProductData
};
