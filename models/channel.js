const mongoose = require('mongoose');

const channelSchema = new mongoose.Schema({
    channelId: { type: String, required: true },
    channelTitle: { type: String, required: true }
});

const Channel = mongoose.model('Channel', channelSchema);

module.exports = Channel;