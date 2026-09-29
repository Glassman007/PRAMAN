const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const parcelTimelineRoutes = require('./parcelTimeline.routes');

const app = express();
const PORT = Number(process.env.PORT) || 3005;
const FRONTEND_PORT = Number(process.env.FRONTEND_PORT) || 5175;
const frontendDist = path.resolve(__dirname, '../frontend/dist');
const layer1Dir = path.resolve(__dirname, '../../layer1');
const useViteFrontend = process.env.npm_lifecycle_event === 'dev';

app.use(cors());
app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'layer5-parcel-timeline', port: PORT });
});

app.use('/api', parcelTimelineRoutes);

if (fs.existsSync(frontendDist) && !useViteFrontend) {
  app.use('/timeline', express.static(frontendDist));
  app.get('/timeline/*', (_req, res) => {
    res.sendFile(path.join(frontendDist, 'index.html'));
  });
} else {
  app.get('/timeline*', (req, res) => {
    const target = new URL(req.originalUrl, `${req.protocol}://${req.hostname}:${FRONTEND_PORT}`);
    res.redirect(307, target.toString());
  });
}

if (fs.existsSync(layer1Dir)) {
  app.use('/layer1', express.static(layer1Dir));
  app.get('/', (_req, res) => res.redirect('/layer1/'));
}

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({
    error: 'INTERNAL_SERVER_ERROR',
    message: 'Layer 5 encountered an unexpected error.'
  });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Integrated Layer 1 / Layer 5 server running on port ${PORT}`);
    console.log(`Layer 1 path: /layer1/`);
    console.log(`Layer 5 path: /timeline/`);
  });
}

module.exports = app;
