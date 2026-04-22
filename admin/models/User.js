const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  name: String,
  email: String,
  phone: String,
  role: { type: String, default: "Khách hàng" }, 
  date: { type: Date, default: Date.now },
});

module.exports = mongoose.model("User", userSchema);