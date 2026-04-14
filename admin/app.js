const express = require("express");
const app = express();
const path = require("path");
const mongoose = require("mongoose");
const multer = require("multer");
const session = require("express-session");
const cors = require("cors");
const Post = require("./models/Post");
const User = require("./models/User");
const Category = require("./models/Category"); // <-- MỚI THÊM

mongoose
  .connect("mongodb://127.0.0.1:27017/HaiHand")
  .then(() => console.log("✅ Đã kết nối MongoDB (HaiHand)!"))
  .catch((err) => console.error(err));

app.use(cors());
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use(
  session({
    secret: "secret-key-vip-pro",
    resave: false,
    saveUninitialized: true,
  }),
);

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "./public/uploads/"),
  filename: (req, file, cb) =>
    cb(null, "img-" + Date.now() + path.extname(file.originalname)),
});
const upload = multer({ storage: storage });

const checkLogin = (req, res, next) => {
  if (req.session.user) {
    res.locals.user = req.session.user;
    next();
  } else res.redirect("/login");
};

// ==========================================
// API DÀNH CHO FRONTEND (REACT)
// ==========================================
app.get("/api/posts", async (req, res) => {
  try {
    const posts = await Post.find({ status: "APPROVED" })
      .populate("author", "name phone")
      .sort({ date: -1 });
    res.json(posts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/user-posts/:userId", async (req, res) => {
  try {
    const posts = await Post.find({ author: req.params.userId }).sort({
      date: -1,
    });
    res.json(posts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/posts", upload.single("image"), async (req, res) => {
  try {
    const { title, price, category, location, description, userId } = req.body;
    const newPost = new Post({
      title,
      price,
      category,
      location,
      description,
      image: req.file ? req.file.filename : "",
      author: userId,
      status: "Chờ duyệt",
    });
    await newPost.save();
    res.status(201).json(newPost);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/posts/:id", async (req, res) => {
  try {
    const post = await Post.findById(req.params.id).populate(
      "author",
      "name phone",
    );
    res.json(post);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/users/register", async (req, res) => {
  try {
    const { name, email, phone, username, password } = req.body;
    const newUser = new User({
      name,
      email,
      phone,
      username,
      password,
      role: "Khách hàng",
    });
    await newUser.save();
    res.status(201).json(newUser);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/users/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await User.findOne({ username, password });
    if (user) res.json(user);
    else res.status(401).json({ message: "Sai thông tin" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/categories", async (req, res) => {
  try {
    const categories = await Category.find().sort({ date: -1 });
    res.json(categories);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// ROUTE CHO TRANG ADMIN (EJS)
// ==========================================
app.get("/login", (req, res) => res.render("login", { error: null }));

app.post("/login", async (req, res) => {
  const { username, password } = req.body;
  const user = await User.findOne({ username, password });
  if (user && user.role === "Admin") {
    req.session.user = user;
    res.redirect("/");
  } else {
    res.render("login", { error: "Sai tài khoản hoặc không phải Admin!" });
  }
});

app.post("/register", async (req, res) => {
  try {
    const { name, email, username, password, role } = req.body;
    const newUser = new User({
      name: name || username,
      email: email,
      phone: "",
      username: username,
      password: password,
      role: role || "Khách hàng",
    });
    await newUser.save();
    res.redirect("/login");
  } catch (err) {
    res.render("login", { error: "Đăng ký thất bại: " + err.message });
  }
});

app.get("/logout", (req, res) => {
  req.session.destroy();
  res.redirect("/login");
});

app.get("/dashboard", checkLogin, (req, res) => {
  res.redirect("/");
});

// === TRANG CHỦ (Đã thêm lấy thông báo thực tế) ===
app.get("/", checkLogin, async (req, res) => {
  try {
    const totalPosts = await Post.countDocuments();
    const totalUsers = await User.countDocuments();
    const pendingPosts = await Post.countDocuments({ status: "Chờ duyệt" });

    // Lấy 5 bài chờ duyệt mới nhất
    const recentPending = await Post.find({ status: "Chờ duyệt" })
      .populate("author")
      .sort({ date: -1 })
      .limit(5);
    // Lấy 5 user mới đăng ký
    const recentUsers = await User.find().sort({ date: -1 }).limit(5);

    const stats = { totalPosts, totalUsers, pendingPosts };

    // Truyền hết sang cho giao diện
    res.render("dashboard", { stats, recentPending, recentUsers });
  } catch (err) {
    res.status(500).send("Có lỗi xảy ra khi tải bảng điều khiển!");
  }
});

app.get("/posts", checkLogin, async (req, res) => {
  const posts = await Post.find().populate("author").sort({ date: -1 });
  res.render("posts", { posts, currentUser: req.session.user });
});

app.get("/post/approve/:id", checkLogin, async (req, res) => {
  await Post.findByIdAndUpdate(req.params.id, { status: "APPROVED" });
  res.redirect("/posts");
});

app.get("/post/delete/:id", checkLogin, async (req, res) => {
  await Post.findByIdAndDelete(req.params.id);
  res.redirect("/posts");
});

app.get("/users", checkLogin, async (req, res) => {
  const users = await User.find().sort({ date: -1 });
  res.render("users", { users });
});

app.get("/users/delete/:id", checkLogin, async (req, res) => {
  await User.findByIdAndDelete(req.params.id);
  res.redirect("/users");
});

app.get("/users/edit/:id", checkLogin, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.redirect("/users");
    res.render("edit-user", { user });
  } catch (err) {
    res.redirect("/users");
  }
});

app.post("/users/edit/:id", checkLogin, async (req, res) => {
  try {
    const { name, email, phone, role } = req.body;
    await User.findByIdAndUpdate(req.params.id, { name, email, phone, role });
    res.redirect("/users");
  } catch (err) {
    res.redirect("/users");
  }
});

// === MỚI THÊM: QUẢN LÝ DANH MỤC ===
app.get("/categories", checkLogin, async (req, res) => {
  const categories = await Category.find().sort({ date: -1 });
  res.render("categories", { categories });
});

app.post("/categories/add", checkLogin, async (req, res) => {
  try {
    const newCategory = new Category({
      name: req.body.name,
      description: req.body.description,
    });
    await newCategory.save();
    res.redirect("/categories");
  } catch (err) {
    res.redirect("/categories");
  } // Lỗi (ví dụ trùng tên) thì quay lại
});

app.get("/categories/delete/:id", checkLogin, async (req, res) => {
  await Category.findByIdAndDelete(req.params.id);
  res.redirect("/categories");
});

app.listen(4000, () =>
  console.log("🚀 Server Admin chạy tại: https://haihand-marketplace.onrender.com"),
);
