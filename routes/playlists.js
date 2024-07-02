var express = require('express');
var router = express.Router();
const axios = require('axios');
require('dotenv').config();
const Playlist = require('../models/Playlist')
const Channel = require('../models/channel')

const apiKey = process.env.YOUTUBE_API_KEY;

// Get all playlists
router.get('/', async (req, res) => {
    const all_playlists = await Playlist.find({deleted:false}).sort({ lastPublishedAt: -1 }).exec();
    res.json(all_playlists);
  })
// Get recent playlists
router.get('/recent', async (req, res) => {
    const all_playlists = await Playlist.find({deleted:false}).sort({ lastPublishedAt: -1 }).limit(10).exec();
    res.json(all_playlists);
  })
  // Get popular playlists
 router.get('/popular', async (req, res) => {
    const all_playlists = await Playlist.find({deleted:false}).sort({ averageViews: -1 }).limit(10).exec();
    res.json(all_playlists);
})
// Get trending playlists
 router.get('/trending', async (req, res) => {
    const all_playlists = await Playlist.aggregate([
      {
          $match: {
              deleted: false // Only consider playlists that are not deleted
          }
      },
      {
          $addFields: {
              // Calculate the age of the playlist in days (you can adjust the weighting here)
              ageScore: {
                  $divide: [
                      {
                          $subtract: [ new Date(), '$lastPublishedAt' ]
                      },
                      86400000 // milliseconds in a day
                  ]
              },
              popularityScore: '$averageViews' // You can adjust this based on your scoring metric
          }
      },
      {
          $addFields: {
              // Combine scores as per your requirement (e.g., linear combination or weighted sum)
              trendingScore: {
                  $divide: ['$popularityScore', '$ageScore'  ]// Adjust weights as needed
              }
          }
      },
      {
          $sort: { trendingScore: -1 } // Sort playlists by trending score descending
      },
      {
          $limit: 10 // Limit the result to the first 10 items
      }
  ]);
    res.json(all_playlists);
})

//delete or restore many playlists
router.post('/delete_or_restore_many', async (req, res) => {
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
  
// delete single playlist
router.post('/delete',async (req, res) => {
    await Playlist.findByIdAndUpdate(req.body.playlistId, { deleted: true });
    //await Playlist.deleteMany({deleted: false});
    //await Playlist.deleteMany({});   
    res.redirect('/')
})

// restore single playlist
router.post('/restore',async (req, res) => {
    await Playlist.findByIdAndUpdate(req.body.playlistId, { deleted: false });
    res.redirect('/')
})


async function getLastPublishedAt(playlistId, playlist_publish_date) {
  let allItems = [];
  let pageToken = '';
  let totalViews = 0;

  const BASE_URL = 'https://youtube.googleapis.com/youtube/v3/playlistItems';
  const VIDEO_URL = 'https://www.googleapis.com/youtube/v3/videos';
  const PART = 'snippet,contentDetails';

  async function fetchPlaylistItems(pageToken) {
    const params = {
      part: PART,
      playlistId: playlistId,
      maxResults: 50,
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

  async function fetchVideoDetails(videoIds) {
    const batchSize = 50; // Maximum number of video IDs per request
    let videoDetails = [];
  
    try {
      for (let i = 0; i < videoIds.length; i += batchSize) {
        const batchIds = videoIds.slice(i, i + batchSize);
        const params = {
          part: 'statistics',
          id: batchIds.join(','),
          key: apiKey
        };
        
        const response = await axios.get(VIDEO_URL, { params });
        videoDetails = videoDetails.concat(response.data.items);
      }
  
      //console.log("Video details fetched successfully");
      return {
        items: videoDetails
      };
    } catch (error) {
      console.error('Error fetching video details:', error.message);
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
      return {
        lastPublishedAt: playlist_publish_date,
        averageViews: 0
      };
    }

    const videoIds = allItems.map(item => item.contentDetails.videoId);
    
    const videoDetails = await fetchVideoDetails(videoIds);
    totalViews = videoDetails.items.reduce((acc, item) => acc + parseInt(item.statistics.viewCount, 10), 0);

    const lastItem = allItems[allItems.length - 1];
    const averageViews = Math.floor(totalViews / allItems.length) 

    return {
      lastPublishedAt: lastItem.snippet.publishedAt,
      averageViews: averageViews
    };
  } catch (error) {
    throw new Error('Error fetching last published date: ' + error.message);
  }
}

const fetchAndSavePlaylists = async () => {
  try {
    const channels = await Channel.find().sort({ created_at: -1 }).exec();
    const allPlaylists = await Promise.all(channels.map(async (channel) => {
      const response = await axios.get(`https://youtube.googleapis.com/youtube/v3/playlists`, {
        params: {
          part: 'snippet',
          channelId: channel.channelId,
          maxResults: 50,
          key: apiKey
        }
      });

      const data = await Promise.all(response.data.items.map(async (item) => {
        const { lastPublishedAt, averageViews } = await getLastPublishedAt(item.id, item.snippet.publishedAt);

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
          lastPublishedAt: lastPublishedAt,
          averageViews: averageViews, 
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

      // Insert only the playlists that are not already in the database
      if (playlistsToInsert.length > 0) {
        await Playlist.insertMany(playlistsToInsert);
      }
    }));

  } catch (error) {
    console.error('There was a problem:', error);
  }
};

// Initial call to fetch and save playlists
//fetchAndSavePlaylists();

// Interval to fetch and save playlists every 8 hrs
const interval = 8 * 60 * 60 * 1000; // 8 hrs in milliseconds
setInterval(fetchAndSavePlaylists, interval);

// Route handling the initial save
router.post('/save', async (req, res) => {
  try {
      await fetchAndSavePlaylists(); // You can optionally call fetchAndSavePlaylists here too
      
      res.redirect("/");
  } catch (error) {
      console.error('There was a problem:', error);
      res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
