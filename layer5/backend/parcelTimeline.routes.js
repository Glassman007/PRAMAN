const express = require('express');
const { getParcelTimeline, listTimelineParcels } = require('./parcelTimeline.service');

const router = express.Router();

router.get('/timeline/parcels', (_req, res) => {
  return res.json(listTimelineParcels());
});

router.get('/parcels/:parcelId/timeline', (req, res) => {
  const timeline = getParcelTimeline(req.params.parcelId);

  if (!timeline) {
    return res.status(404).json({
      error: 'PARCEL_NOT_FOUND',
      message: 'Parcel not found in dataset.'
    });
  }

  return res.json(timeline);
});

module.exports = router;
