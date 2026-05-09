const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const Song = require('./models/Song');

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

// Routes
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
    
    if (req.files['audio'] && req.files['audio'][0]) {
      youtubeUrl = `https://meloflowapi.anfassck.online/uploads/${req.files['audio'][0].filename}`;
    }
    
    if (req.files['image'] && req.files['image'][0]) {
      thumbnail = `https://meloflowapi.anfassck.online/uploads/${req.files['image'][0].filename}`;
    }

    if (!title || (!youtubeUrl && !req.files['audio']) || (!thumbnail && !req.files['image'])) {
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
  .then(() => {
    console.log("Connected to MongoDB database successfully!");
    app.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.log("Failed to connect to MongoDB", err);
  });
