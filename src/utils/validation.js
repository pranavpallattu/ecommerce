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

function validateCategoryData(req){
      let pattern= /^[a-z\s]+$/i
      const{name,description, offer}=req.body
      if(!name || !description || !offer){
          throw new Error("please fill the form")
      }
      else if(!pattern.test(name) || name.length<3 ){
        throw new Error("name should contain only letters and spaces and should not be less than 3 letters")
      }
     else if(!description || description.length<10 ){
        throw new Error("Category description should contain only letters and spaces and should not be less than 10 letters")
      }
    else if(!offer || offer<0 || offer>100 ){
        throw new Error("offer must be a number between 0 and 100")
      }

}

function validateEditCategoryData(req){
 let pattern= /^[a-z\s]+$/i
 const{name,description, offer}=req.body

 if(name && (!pattern.test(name) || name.length<3)  ){
          throw new Error("name should contain only letters and spaces and should not be less than 3 letters")
 }
 if(description &&  description.length<10){
          throw new Error("Category description should contain only letters and spaces and should not be less than 10 letters")
 }
 if(offer !== undefined && (offer<0 || offer>100)){
          throw new Error("offer must be a number between 0 and 100")
 }
}
module.exports={validateSignUpData,validateCategoryData,validateEditCategoryData}