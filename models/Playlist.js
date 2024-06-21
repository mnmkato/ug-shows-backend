const mongoose = require('mongoose');

// Define playlist schema
const playlistSchema = new mongoose.Schema({
    playlistId: { type: String, required: true },
    link: String,
    thumbnail_default: String,
    thumbnail_medium: String,
    thumbnail_high: String,
    thumbnail_standard: String,
    thumbnail_maxres: String,
    title: String,
    channelTitle: String,
    lastPublishedAt: Date,
    deleted: {
        type: Boolean,
        default: false
    }
});

// Define playlist model
const Playlist = mongoose.model('Playlist', playlistSchema);
module.exports=Playlist