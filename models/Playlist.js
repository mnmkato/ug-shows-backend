const mongoose = require('mongoose');

// Define playlist schema
const playlistSchema = new mongoose.Schema({
    playlistId:{ type: String, required: true },
    link: String,
    thumbnail: String,
    title: String,
    channelTitle: String,
    deleted: {
        type: Boolean,
        default: false
    }
});

// Define playlist model
const Playlist = mongoose.model('Playlist', playlistSchema);
module.exports=Playlist