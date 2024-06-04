const mongoose = require('mongoose');

// Define playlist schema
const playlistSchema = new mongoose.Schema({
    link: String,
    thumbnail: String,
    title: String,
    channelTitle: String
});

// Define playlist model
const Playlist = mongoose.model('Playlist', playlistSchema);
module.exports=Playlist