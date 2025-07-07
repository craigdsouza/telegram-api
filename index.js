const express = require('express');
const cors = require('cors');
require('dotenv').config();

const { validate, parse } = require('@telegram-apps/init-data-node');
const { testConnection, getUserByTelegramId, getExpenseEntryDatesForMonth } = require('./db');

const app = express();
const PORT = process.env.PORT || 3001;

// Get bot token from environment variables
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

if (!BOT_TOKEN) {
  console.error('❌ TELEGRAM_BOT_TOKEN environment variable is not set');
  process.exit(1);
}

// Middleware
app.use(cors()); // Allow cross-origin requests from your mini app
app.use(express.json()); // Parse JSON request bodies

// Telegram init data validation middleware
const validateTelegramInitData = (req, res, next) => {
  try {
    // Get Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: 'No authorization header' });
    }

    // Parse authorization header: "tma <init-data>"
    const [authType, initDataRaw] = authHeader.split(' ');
    
    if (authType !== 'tma') {
      return res.status(401).json({ error: 'Invalid authorization type' });
    }

    if (!initDataRaw) {
      return res.status(401).json({ error: 'No init data provided' });
    }

    console.log('🔍 Validating init data...');
    
    // Validate the init data using the bot token
    validate(initDataRaw, BOT_TOKEN, {
      expiresIn: 3600, // Valid for 1 hour
    });

    // Parse the validated init data
    const initData = parse(initDataRaw);
    console.log('✅ Init data validated successfully');
    console.log('✅ User from init data:', initData.user);

    // Store the validated init data in the request for later use
    req.validatedInitData = initData;
    next();
  } catch (error) {
    console.error('❌ Init data validation failed:', error.message);
    return res.status(401).json({ error: 'Invalid init data' });
  }
};

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

// Get user by Telegram ID (legacy endpoint)
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

// New endpoint: Validate init data and return user info
app.post('/api/user/validate', validateTelegramInitData, async (req, res) => {
  try {
    const initData = req.validatedInitData;
    const telegramUserId = initData.user.id;
    
    console.log('🔍 Fetching user from database for Telegram ID:', telegramUserId);
    
    // Get user from database
    const user = await getUserByTelegramId(telegramUserId);
    
    if (!user) {
      console.log('❌ User not found in database for Telegram ID:', telegramUserId);
      return res.status(404).json({ error: 'User not found in database' });
    }
    
    console.log('✅ User found in database:', user);
    
    res.json({
      id: user.id,
      telegram_user_id: user.telegram_user_id,
      first_name: user.first_name,
      last_name: user.last_name,
      created_at: user.created_at,
      last_active: user.last_active
    });
  } catch (error) {
    console.error('Error in /api/user/validate:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// New endpoint: Get entry dates for current month for a user
app.get('/api/user/:telegramId/expenses/dates', validateTelegramInitData, async (req, res) => {
  try {
    const telegramId = parseInt(req.params.telegramId);
    const year = parseInt(req.query.year);
    const month = parseInt(req.query.month);
    if (isNaN(telegramId) || isNaN(year) || isNaN(month)) {
      return res.status(400).json({ error: 'Invalid parameters' });
    }
    // Only allow access if the validated user matches the requested user
    if (req.validatedInitData.user.id !== telegramId) {
      return res.status(403).json({ error: 'Forbidden: user mismatch' });
    }
    const days = await getExpenseEntryDatesForMonth(telegramId, year, month);
    res.json({ days });
  } catch (error) {
    console.error('Error in /api/user/:telegramId/expenses/dates:', error);
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
  console.log(`📍 Validate endpoint: http://localhost:${PORT}/api/user/validate`);
});

module.exports = app;
