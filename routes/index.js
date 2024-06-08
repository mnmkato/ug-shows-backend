var express = require('express');
var router = express.Router();
const axios = require('axios');
require('dotenv').config();
const Playlist = require('../models/Playlist')
const Channel = require('../models/channel')

const apiKey = process.env.YOUTUBE_API_KEY;
const maxResults = 100;

/* GET home page. */
router.get('/', async function(req, res, next) {
    const channels = await Channel.find().sort({created_at: -1}).exec();
    const all_playlists = await Playlist.find({deleted:false}).sort({created_at: -1}).exec();
    res.render('index', { 
        title: 'UG Shows server',
        all_playlists: all_playlists,
        channels: channels });
});

  router.get('/api/playlists', async (req, res) => {
      const all_playlists = await Playlist.find({deleted:false}).sort({created_at: -1}).exec();
      res.json(all_playlists);
  })
  router.post('/api/delete/',async (req, res) => {
      await Playlist.findByIdAndUpdate(req.body.playlistId, { deleted: true });
      //await Playlist.deleteMany({});
      res.redirect('/')
  })

  router.post('/api/save', async (req, res) => {
    try {
        const channels = await Channel.find().sort({ created_at: -1 }).exec();
        const allPlaylists = await Promise.all(channels.map(async (channel) => {
            const response = await axios.get(`https://youtube.googleapis.com/youtube/v3/playlists`, {
                params: {
                    part: 'snippet',
                    channelId: channel.channelId,
                    maxResults: maxResults,
                    key: apiKey
                }
            });

            const data = response.data.items.map(item => ({
                playlistId: item.id,
                link: `https://www.youtube.com/playlist?list=${item.id}`,
                thumbnail: item.snippet.thumbnails.medium.url,
                title: item.snippet.title,
                channelTitle: item.snippet.channelTitle
            }));

            // Fetch playlists from the database to check for existing and deleted ones
            const existingPlaylists = await Playlist.find({ 
                playlistId: { $in: data.map(item => item.playlistId) },
                deleted: false // Only consider non-deleted playlists
            });

            // Filter out playlists that are already saved in the database
            const playlistsToInsert = data.filter(item => 
                !existingPlaylists.some(playlist => playlist.playlistId === item.playlistId)
            );

            console.log('Playlists to insert:', playlistsToInsert);

            // Insert only the playlists that are not already in the database
            if (playlistsToInsert.length > 0) {
                await Playlist.insertMany(playlistsToInsert);
            }
        }));
        
        res.redirect("/");
    } catch (error) {
        console.error('There was a problem:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

  router.post('/channel/delete', async (req, res) => {
    await Channel.findByIdAndDelete(req.body.channelId);
    
    res.redirect('/')
}) 

  router.post('/channel/add', async function (req, res) {
    try {  
      const channelDetails = await axios.get(`https://youtube.googleapis.com/youtube/v3/channels`, {
        params: {
          part: 'snippet',
          forHandle: req.body.handle,
          key: apiKey
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
