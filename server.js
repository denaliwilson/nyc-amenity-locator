'use strict';

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const path = require('path');
const amenitiesRouter = require('./src/routes/amenities');

const app = express();
const PORT = process.env.PORT || 3000;

const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(cors());
app.use(express.json());
app.use(limiter);
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api', amenitiesRouter);

// Serve the frontend for any non-API route (SPA fallback)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`NYC Amenity Locator running on http://localhost:${PORT}`);
  });
}

module.exports = app;
