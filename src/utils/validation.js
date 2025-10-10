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


module.exports = {
  validateSignUpData,
  validateCategoryData,
  validateEditCategoryData,
  validateProductData
};
