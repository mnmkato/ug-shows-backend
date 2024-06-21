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
  const filter = req.query.filter || 'active';
  let filterCondition;

  switch (filter) {
      case 'deleted':
          filterCondition = { deleted: true };
          break;
      case 'all':
          filterCondition = {};
          break;
      case 'active':
      default:
          filterCondition = { deleted: false };
          break;
  }

  const channels = await Channel.find().sort({ created_at: -1 }).exec();
  const all_playlists = await Playlist.find(filterCondition).sort({ lastPublishedAt: -1 }).exec();

  const totalPlaylists = await Playlist.countDocuments({});
  const deletedPlaylists = await Playlist.countDocuments({ deleted: true });
  const nonDeletedPlaylists = await Playlist.countDocuments({ deleted: false });

  res.render('index', {
      title: 'UG Shows server',
      all_playlists: all_playlists,
      channels: channels,
      totalPlaylists: totalPlaylists,
      deletedPlaylists: deletedPlaylists,
      nonDeletedPlaylists: nonDeletedPlaylists,
      currentFilter: filter
  });
});

  router.get('/api/playlists', async (req, res) => {
      const all_playlists = await Playlist.find({deleted:false}).sort({ lastPublishedAt: -1 }).exec();
      res.json(all_playlists);
  })

  router.post('/api/delete/',async (req, res) => {
      await Playlist.findByIdAndUpdate(req.body.playlistId, { deleted: true });
      //await Playlist.deleteMany({deleted: false});
      //await Playlist.deleteMany({});
       
      res.redirect('/')
  })

  router.post('/api/delete_or_restore_many', async (req, res) => {
    const playlistIds = Array.isArray(req.body.playlistIds) ? req.body.playlistIds : [req.body.playlistIds]; // Ensure playlistIds is an array
    const action = req.body.action;
  
    try {
      if (action === 'delete') {
        // Update playlists' deleted field to true
        const result = await Playlist.updateMany({ _id: { $in: playlistIds } }, { $set: { deleted: true } });
        console.log(`${result.nModified} playlists marked as deleted.`);
      } else if (action === 'restore') {
        // Update playlists' deleted field to false
        const result = await Playlist.updateMany({ _id: { $in: playlistIds } }, { $set: { deleted: false } });
        console.log(`${result.nModified} playlists restored.`);
      }
      res.redirect('/'); // Redirect to homepage or wherever after updating
    } catch (err) {
      console.error('Error updating playlists:', err);
      res.status(500).send('Error updating playlists');
    }
  });
  
    
router.post('/api/restore/',async (req, res) => {
  console.log(req.body.playlistId)
    await Playlist.findByIdAndUpdate(req.body.playlistId, { deleted: false });
    res.redirect('/')
})

async function getLastPublishedAt(playlistId, playlist_publish_date) {
  let allItems = [];
  let pageToken = '';

  const BASE_URL = 'https://youtube.googleapis.com/youtube/v3/playlistItems';
  const PART = 'snippet';

  async function fetchPlaylistItems(pageToken) {
    const params = {
      part: PART,
      playlistId: playlistId,
      maxResults: maxResults,
      key: apiKey,
      pageToken: pageToken
    };

    try {
      const response = await axios.get(BASE_URL, { params });
      return response.data;
    } catch (error) {
      console.error('Error fetching playlist items:', error);
      throw error;
    }
  }

  try {
    let responseData = await fetchPlaylistItems(pageToken);
    allItems = allItems.concat(responseData.items);
    pageToken = responseData.nextPageToken;

    while (pageToken) {
      responseData = await fetchPlaylistItems(pageToken);
      allItems = allItems.concat(responseData.items);
      pageToken = responseData.nextPageToken;
    }

    if (allItems.length === 0) {
      return playlist_publish_date
    }

    const lastItem = allItems[allItems.length - 1];
    return lastItem.snippet.publishedAt;
  } catch (error) {
    throw new Error('Error fetching last published date: ' + error.message);
  }
}
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

          const data = await Promise.all(response.data.items.map(async (item) => {
            const lastPublishedAt = await getLastPublishedAt(item.id, item.snippet.publishedAt);
            
            // Define a function to safely get thumbnail URLs
            const getThumbnailUrl = (thumbnails, size) => thumbnails[size] ? thumbnails[size].url : null;
        
            return {
                playlistId: item.id,
                link: `https://www.youtube.com/playlist?list=${item.id}`,
                thumbnail_default: getThumbnailUrl(item.snippet.thumbnails, 'default'),
                thumbnail_medium: getThumbnailUrl(item.snippet.thumbnails, 'medium'),
                thumbnail_high: getThumbnailUrl(item.snippet.thumbnails, 'high'),
                thumbnail_standard: getThumbnailUrl(item.snippet.thumbnails, 'standard'),
                thumbnail_maxres: getThumbnailUrl(item.snippet.thumbnails, 'maxres'),
                title: item.snippet.title,
                channelTitle: item.snippet.channelTitle,
                lastPublishedAt: lastPublishedAt, // Add the last published date
                deleted: false
            };
        }));
        
    
          // Fetch all playlists from the database that match the playlist IDs in the data
          const existingPlaylists = await Playlist.find({ 
              playlistId: { $in: data.map(item => item.playlistId) }
          });

          // Filter out playlists that are marked as deleted
          const filteredData = data.filter(item => 
              !existingPlaylists.some(playlist => playlist.playlistId === item.playlistId && playlist.deleted)
          );

          // Filter out playlists that are already in the database and not deleted
          const playlistsToInsert = filteredData.filter(item => 
              !existingPlaylists.some(playlist => playlist.playlistId === item.playlistId)
          );

          //console.log('Playlists to insert:', playlistsToInsert);

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
