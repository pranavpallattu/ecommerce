const express=require("express")
const connectDB=require("./config/database")
require("dotenv").config();
const cors=require("cors")
const cookieParser=require("cookie-parser")
const passport=require("passport")
const authRouter = require("./routes/authRouter");
const adminRouter = require("./routes/adminRouter");
require("./config/passport")

const app=express()

app.use(cors({
  origin:"http://localhost:5173",
  credentials:true
}))

app.use(passport.initialize())

app.use(express.json())
app.use(cookieParser())
app.use(authRouter)
app.use(adminRouter)

connectDB()
.then(()=>{
    console.log("mongodb connected successfully");
    app.listen(7777,()=>{
        console.log("Server listening to 7777")
    })

})
.catch((err)=>{
    console.log("mongodb connection failed  "+err);
    

})

