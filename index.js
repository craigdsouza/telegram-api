const express = require('express');
const cors = require('cors');
require('dotenv').config();

const { testConnection, getUserByTelegramId } = require('./db');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors()); // Allow cross-origin requests from your mini app
app.use(express.json()); // Parse JSON request bodies

// Test route to verify the server is working
app.get('/ping', (req, res) => {
  res.json({ message: 'API is running!', timestamp: new Date().toISOString() });
});

// Health check route for Railway
app.get('/health', (req, res) => {
  res.json({ status: 'OK', service: 'telegram-api' });
});

// Test database connection
app.get('/test-db', async (req, res) => {
  try {
    const isConnected = await testConnection();
    if (isConnected) {
      res.json({ message: 'Database connection successful!', timestamp: new Date().toISOString() });
    } else {
      res.status(500).json({ error: 'Database connection failed' });
    }
  } catch (error) {
    res.status(500).json({ error: 'Database test failed', details: error.message });
  }
});

// Get user by Telegram ID
app.get('/api/user/:telegramId', async (req, res) => {
  try {
    const telegramId = parseInt(req.params.telegramId);
    
    if (isNaN(telegramId)) {
      return res.status(400).json({ error: 'Invalid Telegram ID' });
    }
    
    const user = await getUserByTelegramId(telegramId);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json({
      id: user.id,
      telegram_user_id: user.telegram_user_id,
      first_name: user.first_name,
      last_name: user.last_name,
      created_at: user.created_at,
      last_active: user.last_active
    });
  } catch (error) {
    console.error('Error fetching user:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Start the server
app.listen(PORT, () => {
  console.log(`🚀 API server running on port ${PORT}`);
  console.log(`📍 Health check: http://localhost:${PORT}/health`);
  console.log(`📍 Test endpoint: http://localhost:${PORT}/ping`);
  console.log(`📍 Database test: http://localhost:${PORT}/test-db`);
  console.log(`📍 User endpoint: http://localhost:${PORT}/api/user/:telegramId`);
});

module.exports = app;
