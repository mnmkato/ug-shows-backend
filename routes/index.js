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
  const all_playlists = await Playlist.find(filterCondition).sort({ lastPublishedAt: -1 , averageViews: -1 }).exec(); 
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
