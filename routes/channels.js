//imports
const Channel = require('../models/channel')
var express = require('express');
var router = express.Router();
const axios = require('axios');
require('dotenv').config();

// delete a channel route
router.post('/delete', async (req, res) => {
    await Channel.findByIdAndDelete(req.body.channelId);
    res.redirect('/')
}) 

//save a channel route
router.post('/add', async function (req, res) {
    try {  
      const channelDetails = await axios.get(`https://youtube.googleapis.com/youtube/v3/channels`, {
        params: {
          part: 'snippet',
          forHandle: req.body.handle,
          key: process.env.YOUTUBE_API_KEY
        }
      });

      const id = channelDetails.data.items[0].id;
      const title = channelDetails.data.items[0].snippet.title;
  
      // Check if the channel already exists
      const existingChannel = await Channel.findOne({ channelId: id });
      if (existingChannel) {
        return res.status(400).json({ error: 'Channel already exists' });
      }

      // Create a new channel object
      const channel = new Channel({ channelId: id, channelTitle: title });
      console.log(channel);
      await channel.save();
      res.redirect('/');
    } catch (error) {
      console.error('There was a problem:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

module.exports = router;
