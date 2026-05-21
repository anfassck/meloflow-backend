const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const Song = require('./models/Song');
const User = require('./models/User');

// Create uploads directory if not exists
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir);
}

// Multer Setup
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname.replace(/\s/g, '_'));
  }
});
const upload = multer({ storage });

const app = express();

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Seed default Admin user and keep password updated with .env changes
const seedAdmin = async () => {
  try {
    const adminEmail = process.env.ADMIN_EMAIL;
    const adminPassword = process.env.ADMIN_PASSWORD;
    
    if (!adminEmail || !adminPassword) {
      console.warn("WARNING: ADMIN_EMAIL or ADMIN_PASSWORD is not set in environment variables. Skipping admin seeding.");
      return;
    }
    
    let adminUser = await User.findOne({ email: adminEmail.toLowerCase() });
    
    if (!adminUser) {
      const hashedPassword = await bcrypt.hash(adminPassword, 10);
      const newAdmin = new User({
        name: 'Admin Anfas',
        email: adminEmail.toLowerCase(),
        password: hashedPassword,
        role: 'admin'
      });
      await newAdmin.save();
      console.log("Default admin user seeded successfully!");
    } else {
      // If admin exists, verify if the password matches the .env file
      const isMatch = await bcrypt.compare(adminPassword, adminUser.password);
      if (!isMatch) {
        const hashedNewPassword = await bcrypt.hash(adminPassword, 10);
        adminUser.password = hashedNewPassword;
        await adminUser.save();
        console.log("Admin password updated from .env file successfully!");
      }
    }
  } catch (error) {
    console.error("Error seeding or updating default admin:", error);
  }
};


// Authentication Routes
// POST /api/auth/signup - User registration
app.post('/api/auth/signup', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ message: "All fields are required" });
    }
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(400).json({ message: "Email already registered!" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = new User({
      name,
      email: email.toLowerCase(),
      password: hashedPassword,
      role: 'user'
    });

    await newUser.save();
    res.status(201).json({ message: "Signup successful! Please login." });
  } catch (error) {
    console.error("Signup error:", error);
    res.status(500).json({ message: "Failed to signup", error });
  }
});

// POST /api/auth/login - User/Admin login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required" });
    }

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(400).json({ message: "Invalid email or password. Please Signup first." });
    }

    // Google-only accounts might not have a password
    if (!user.password) {
      return res.status(400).json({ message: "This email is registered with Google. Please use Google Login." });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: "Invalid email or password." });
    }

    res.status(200).json({
      message: "Login successful",
      user: {
        name: user.name,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ message: "Failed to login", error });
  }
});

// POST /api/auth/google-login - Sync Google Auth users with MongoDB
app.post('/api/auth/google-login', async (req, res) => {
  try {
    const { name, email, googleId } = req.body;
    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }

    let user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      user = new User({
        name: name || email.split('@')[0],
        email: email.toLowerCase(),
        googleId,
        role: 'user'
      });
      await user.save();
    } else if (googleId && !user.googleId) {
      user.googleId = googleId;
      await user.save();
    }

    res.status(200).json({
      message: "Google Login successful",
      user: {
        name: user.name,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    console.error("Google sync error:", error);
    res.status(500).json({ message: "Google Login failed", error });
  }
});

// Songs Routes
// GET /api/songs - Fetch all songs
app.get('/api/songs', async (req, res) => {
  try {
    const songs = await Song.find().sort({ addedAt: -1 });
    res.status(200).json(songs);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch songs", error });
  }
});

// POST /api/add-song - Add a new song
app.post('/api/add-song', upload.fields([{ name: 'audio', maxCount: 1 }, { name: 'image', maxCount: 1 }]), async (req, res) => {
  try {
    const { title, artist, category } = req.body;
    let { youtubeUrl, thumbnail } = req.body;
    
    const host = req.get('host');
    const protocol = req.protocol;

    if (req.files && req.files['audio'] && req.files['audio'][0]) {
      youtubeUrl = `${protocol}://${host}/uploads/${req.files['audio'][0].filename}`;
    }
    
    if (req.files && req.files['image'] && req.files['image'][0]) {
      thumbnail = `${protocol}://${host}/uploads/${req.files['image'][0].filename}`;
    }

    if (!title || (!youtubeUrl && !(req.files && req.files['audio'])) || (!thumbnail && !(req.files && req.files['image']))) {
      return res.status(400).json({ message: "Required fields are missing" });
    }

    const newSong = new Song({
      title,
      artist,
      youtubeUrl,
      thumbnail,
      category
    });

    await newSong.save();
    res.status(201).json({ message: "Song added successfully!", song: newSong });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to add song", error });
  }
});

// PUT /api/songs/:id - Update an existing song
app.put('/api/songs/:id', upload.fields([{ name: 'audio', maxCount: 1 }, { name: 'image', maxCount: 1 }]), async (req, res) => {
  try {
    const { title, artist, category } = req.body;
    let { youtubeUrl, thumbnail } = req.body;
    
    const song = await Song.findById(req.params.id);
    if (!song) {
      return res.status(404).json({ message: "Song not found" });
    }

    const host = req.get('host');
    const protocol = req.protocol;

    if (req.files && req.files['audio'] && req.files['audio'][0]) {
      song.youtubeUrl = `${protocol}://${host}/uploads/${req.files['audio'][0].filename}`;
    } else if (youtubeUrl !== undefined) {
      song.youtubeUrl = youtubeUrl;
    }
    
    if (req.files && req.files['image'] && req.files['image'][0]) {
      song.thumbnail = `${protocol}://${host}/uploads/${req.files['image'][0].filename}`;
    } else if (thumbnail !== undefined) {
      song.thumbnail = thumbnail;
    }

    if (title) song.title = title;
    if (artist) song.artist = artist;
    if (category) song.category = category;

    await song.save();
    res.status(200).json({ message: "Song updated successfully!", song });
  } catch (error) {
    console.error("Failed to update song:", error);
    res.status(500).json({ message: "Failed to update song", error });
  }
});

// DELETE /api/songs/:id - Delete a song
app.delete('/api/songs/:id', async (req, res) => {
  try {
    const deletedSong = await Song.findByIdAndDelete(req.params.id);
    if (!deletedSong) {
      return res.status(404).json({ message: "Song not found" });
    }
    res.status(200).json({ message: "Song deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: "Failed to delete song", error });
  }
});

app.get('/', (req, res) => {
  res.send('Meloflow API is running...');
});

const PORT = process.env.PORT || 5000;

// Set up MongoDB Connection
mongoose.connect(process.env.MONGO_URI)
  .then(async () => {
    console.log("Connected to MongoDB database successfully!");
    await seedAdmin();
    app.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.log("Failed to connect to MongoDB", err);
  });
