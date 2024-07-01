var express = require('express');
var router = express.Router();
const Playlist = require('../models/Playlist')
const Channel = require('../models/channel')
const moment = require('moment');

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
//  const all_playlists = await Playlist.find(filterCondition).sort({ lastPublishedAt: -1 , averageViews: -1 }).exec();

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
      }
  ]);
  
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

module.exports = router;
