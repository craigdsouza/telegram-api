const express = require('express');
const cors = require('cors');
require('dotenv').config();

const { validate, parse } = require('@telegram-apps/init-data-node');
const { testConnection, getUserByTelegramId, getExpenseEntryDatesForMonth, getUserMissionProgress, getCurrentMonthBudgetData, getCurrentMonthExpenses, getUserOnboardingProgress, updateUserOnboardingProgress, completeOnboardingStep, skipOnboardingStep, getUserSettings, updateUserSettings, updateFamilySettings, getExpensesByInternalUserIdAndDateRange, getCurrentMonthExpensesByInternalUserId, createExpense } = require('./db');

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
app.use((req, res, next) => {
  console.log('[DEBUG] Incoming request:', req.method, req.url, 'Headers:', req.headers);
  next();
});

// List of test user IDs for dev bypass
const DEV_USER_IDS = new Set(
  (process.env.DEV_USER_IDS || '').split(',').map(id => Number(id.trim())).filter(Boolean)
);
console.log('[DEV] BACKEND DEV_USER_IDS:', Array.from(DEV_USER_IDS));

// Telegram init data validation middleware
const validateTelegramInitData = (req, res, next) => {
  try {
    console.log('[AUTH DEBUG] Starting validation for', req.url, 'Headers:', req.headers);
    console.log('🔐 [AUTH] Starting init data validation');
    console.log('🔐 [AUTH] Request headers:', Object.keys(req.headers));
    console.log('🔐 [AUTH] Request method:', req.method);
    console.log('🔐 [AUTH] Request URL:', req.url);
    
    // Get Authorization header
    const authHeader = req.headers.authorization;
    console.log('🔐 [AUTH] Authorization header present:', !!authHeader);
    console.log('🔐 [AUTH] Authorization header length:', authHeader?.length);
    
    if (!authHeader) {
      console.log('❌ [AUTH] No authorization header found');
      return res.status(401).json({ error: 'No authorization header' });
    }

    // Parse authorization header: "tma <init-data>"
    const [authType, initDataRaw] = authHeader.split(' ');
    
    console.log('🔐 [AUTH] Auth type:', authType);
    console.log('🔐 [AUTH] Init data raw present:', !!initDataRaw);
    console.log('🔐 [AUTH] Init data raw length:', initDataRaw?.length);
    
    if (authType !== 'tma') {
      console.log('❌ [AUTH] Invalid authorization type:', authType);
      return res.status(401).json({ error: 'Invalid authorization type' });
    }

    if (!initDataRaw) {
      console.log('❌ [AUTH] No init data provided');
      return res.status(401).json({ error: 'No init data provided' });
    }
    
    // --- DEV BYPASS LOGIC ---
    const devBypass = req.headers['x-dev-bypass'] === 'true' && process.env.NODE_ENV !== 'production';
    if (devBypass) {
      try {
        const { parse } = require('@telegram-apps/init-data-node');
        const initData = parse(initDataRaw);
        console.log('[DEV BYPASS] Parsed user id from initData:', initData?.user);
        if (initData && initData.user && DEV_USER_IDS.has(Number(initData.user.id))) {
          console.log('🧪 [DEV BYPASS] Skipping signature validation for test user:', initData.user.id);
          req.validatedInitData = initData;
          return next();
        } else {
          console.log('🧪 [DEV BYPASS] User not in DEV_USER_IDS or invalid initData:', initData?.user?.id);
        }
      } catch (err) {
        console.log('🧪 [DEV BYPASS] Failed to parse initDataRaw:', err.message);
      }
    }
    // --- END DEV BYPASS LOGIC ---

    console.log('🔍 [AUTH] Validating init data...');
    console.log('🔍 [AUTH] Bot token present:', !!BOT_TOKEN);
    console.log('🔍 [AUTH] Bot token length:', BOT_TOKEN?.length);
    
    // Validate the init data using the bot token
    validate(initDataRaw, BOT_TOKEN, {
      expiresIn: 3600, // Valid for 1 hour
    });

    // Parse the validated init data
    const initData = parse(initDataRaw);
    console.log('✅ [AUTH] Init data validated successfully');
    console.log('✅ [AUTH] User from init data:', initData.user);
    console.log('✅ [AUTH] User ID type:', typeof initData.user?.id);
    console.log('✅ [AUTH] User ID value:', initData.user?.id);

    // Store the validated init data in the request for later use
    req.validatedInitData = initData;
    // Add userLogString for consistent logging
    if (initData && initData.user) {
      req.userLogString = `User ${initData.user.id} (${initData.user.first_name || ''} ${initData.user.last_name || ''})`;
    } else {
      req.userLogString = 'User unknown';
    }
    console.log('[AUTH DEBUG] Validation passed for', req.url, 'User:', req.validatedInitData?.user);
    next();
  } catch (error) {
    console.error('[AUTH DEBUG] Validation failed for', req.url, 'Error:', error);
    console.error('❌ [AUTH] Init data validation failed:', error.message);
    console.error('❌ [AUTH] Error stack:', error.stack);
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
    console.log('[DEBUG] DB user lookup result:', user);
    
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
    console.log('[DEBUG] DB user lookup result:', user);
    
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
    console.log('📅 [CALENDAR] DEBUG:', req.userLogString, 'Telegram ID:', req.params.telegramId);
    console.log('📅 [CALENDAR] Starting calendar data request');
    console.log('📅 [CALENDAR] Request params:', req.params);
    console.log('📅 [CALENDAR] Request query:', req.query);
    console.log('📅 [CALENDAR] Validated user from init data:', req.validatedInitData.user);
    
    const telegramId = parseInt(req.params.telegramId);
    const year = parseInt(req.query.year);
    const month = parseInt(req.query.month);
    
    console.log('📅 [CALENDAR] Parsed parameters:', { telegramId, year, month });
    
    if (isNaN(telegramId) || isNaN(year) || isNaN(month)) {
      console.log('❌ [CALENDAR] Invalid parameters detected');
      return res.status(400).json({ error: 'Invalid parameters' });
    }
    
    // Only allow access if the validated user matches the requested user
    if (req.validatedInitData.user.id !== telegramId) {
      console.log('❌ [CALENDAR] User mismatch detected');
      console.log('📅 [CALENDAR] Requested user ID:', telegramId);
      console.log('📅 [CALENDAR] Validated user ID:', req.validatedInitData.user.id);
      return res.status(403).json({ error: 'Forbidden: user mismatch' });
    }
    
    console.log('📅 [CALENDAR] User validation passed, fetching calendar data...');
    console.log('📅 [CALENDAR] Calling getExpenseEntryDatesForMonth with:', { telegramId, year, month });
    
    const days = await getExpenseEntryDatesForMonth(telegramId, year, month);
    
    console.log('📅 [CALENDAR] Database query completed');
    console.log('📅 [CALENDAR] Raw days from database:', days);
    console.log('📅 [CALENDAR] Number of days with entries:', days.length);
    
    const response = { days };
    console.log('📅 [CALENDAR] Sending response:', response);
    
    res.json(response);
  } catch (error) {
    console.error('❌ [CALENDAR] Error in /api/user/:telegramId/expenses/dates:', error);
    console.error('❌ [CALENDAR] Error stack:', error.stack);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// New endpoint: Get mission progress for a user
app.get('/api/user/:telegramId/missions', validateTelegramInitData, async (req, res) => {
  try {
    console.log('🎯 [MISSIONS] DEBUG:', req.userLogString, 'Telegram ID:', req.params.telegramId);
    console.log('🎯 [MISSIONS] DEBUG: Init data:', req.validatedInitData);
    const telegramId = parseInt(req.params.telegramId);
    
    console.log('🎯 [MISSIONS] Parsed telegram ID:', telegramId);
    
    if (isNaN(telegramId)) {
      console.log('❌ [MISSIONS] Invalid telegram ID detected');
      return res.status(400).json({ error: 'Invalid telegram ID' });
    }
    
    // Only allow access if the validated user matches the requested user
    if (req.validatedInitData.user.id !== telegramId) {
      console.log('❌ [MISSIONS] User mismatch detected');
      console.log('🎯 [MISSIONS] Requested user ID:', telegramId);
      console.log('🎯 [MISSIONS] Validated user ID:', req.validatedInitData.user.id);
      return res.status(403).json({ error: 'Forbidden: user mismatch' });
    }
    
    console.log('🎯 [MISSIONS] User validation passed, fetching mission progress...');
    console.log('🎯 [MISSIONS] Calling getUserMissionProgress with:', { telegramId });
    
    const missionProgress = await getUserMissionProgress(telegramId);
    
    console.log('🎯 [MISSIONS] Database query completed');
    console.log('🎯 [MISSIONS] Mission progress:', missionProgress);
    
    const response = {
      babySteps: missionProgress.babySteps,
      juniorAnalyst: missionProgress.juniorAnalyst,
      budgetSet: missionProgress.budgetSet
    };
    
    console.log('🎯 [MISSIONS] Sending response:', response);
    
    res.json(response);
  } catch (error) {
    console.error('❌ [MISSIONS] Error in /api/user/:telegramId/missions:', error);
    console.error('❌ [MISSIONS] Error stack:', error.stack);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// New endpoint: Get budget and expense data for current month
/**
 * GET /api/user/:telegramId/budget/current-month
 * Returns:
 *   {
 *     totalExpenses: number,
 *     budget: number | null,
 *     currentDate: number,
 *     daysInMonth: number,
 *     budgetPercentage: number,
 *     datePercentage: number,
 *     currency: string,
 *     isFamily: boolean,        // true if user is in a family group
 *     familyMembers: number     // number of family members (including self)
 *   }
 */
app.get('/api/user/:telegramId/budget/current-month', validateTelegramInitData, async (req, res) => {
  try {
    console.log('💰 [BUDGET] DEBUG:', req.userLogString, 'Telegram ID:', req.params.telegramId);
    console.log('💰 [BUDGET] DEBUG: Init data:', req.validatedInitData);
    const telegramId = parseInt(req.params.telegramId);
    const year = parseInt(req.query.year);
    const month = parseInt(req.query.month);
    
    console.log('💰 [BUDGET] Parsed parameters:', { telegramId, year, month });
    
    if (isNaN(telegramId)) {
      console.log('❌ [BUDGET] Invalid telegram ID detected');
      return res.status(400).json({ error: 'Invalid telegram ID' });
    }
    
    if (isNaN(year) || isNaN(month)) {
      console.log('❌ [BUDGET] Invalid year or month detected');
      return res.status(400).json({ error: 'Invalid year or month' });
    }
    
    // Only allow access if the validated user matches the requested user
    if (req.validatedInitData.user.id !== telegramId) {
      console.log('❌ [BUDGET] User mismatch detected');
      console.log('💰 [BUDGET] Requested user ID:', telegramId);
      console.log('💰 [BUDGET] Validated user ID:', req.validatedInitData.user.id);
      return res.status(403).json({ error: 'Forbidden: user mismatch' });
    }
    
    console.log('💰 [BUDGET] User validation passed, fetching budget data...');
    console.log('💰 [BUDGET] Calling getCurrentMonthBudgetData with:', { telegramId, year, month });
    
    const budgetData = await getCurrentMonthBudgetData(telegramId, year, month);
    
    console.log('💰 [BUDGET] Database query completed');
    console.log('💰 [BUDGET] Budget data:', budgetData);
    
    res.json(budgetData);
  } catch (error) {
    console.error('❌ [BUDGET] DEBUG: Error for Telegram ID', req.params.telegramId, error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

// New endpoint: Get all expenses for the current month for a user (by internal user ID)
app.get('/api/user/:internalUserId/expenses/current-month', validateTelegramInitData, async (req, res) => {
  try {
    const internalUserId = parseInt(req.params.internalUserId);
    const year = parseInt(req.query.year);
    const month = parseInt(req.query.month);
    if (isNaN(internalUserId) || isNaN(year) || isNaN(month)) {
      return res.status(400).json({ error: 'Invalid parameters' });
    }
    // Optionally, you could check that the user making the request is allowed to access this internal user ID
    // For now, just log the validated user from init data
    console.log('[EXPENSES CURRENT MONTH] Validated user from init data:', req.validatedInitData.user);
    const expenses = await getCurrentMonthExpensesByInternalUserId(internalUserId, year, month);
    res.json({ expenses });
  } catch (error) {
    console.error('❌ [EXPENSES] Error in /api/user/:internalUserId/expenses/current-month:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// New endpoint: Get user onboarding status
app.get('/api/user/:telegramId/onboarding', validateTelegramInitData, async (req, res) => {
  try {
    console.log('🎯 [ONBOARDING] DEBUG:', req.userLogString, 'Telegram ID:', req.params.telegramId);
    const telegramId = parseInt(req.params.telegramId);
    
    if (isNaN(telegramId)) {
      console.log('❌ [ONBOARDING] Invalid telegram ID detected');
      return res.status(400).json({ error: 'Invalid telegram ID' });
    }
    
    // Only allow access if the validated user matches the requested user
    if (req.validatedInitData.user.id !== telegramId) {
      console.log('❌ [ONBOARDING] User mismatch detected');
      console.log('🎯 [ONBOARDING] Requested user ID:', telegramId);
      console.log('🎯 [ONBOARDING] Validated user ID:', req.validatedInitData.user.id);
      return res.status(403).json({ error: 'Forbidden: user mismatch' });
    }
    
    console.log('🎯 [ONBOARDING] User validation passed, fetching onboarding status...');
    const onboardingProgress = await getUserOnboardingProgress(telegramId);
    
    if (onboardingProgress === null) {
      console.log('❌ [ONBOARDING] User not found in database');
      return res.status(404).json({ error: 'User not found' });
    }
    
    console.log('🎯 [ONBOARDING] Onboarding progress:', onboardingProgress);
    res.json({ onboarding: onboardingProgress });
  } catch (error) {
    console.error('❌ [ONBOARDING] Error in /api/user/:telegramId/onboarding:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// New endpoint: Update user onboarding status
app.post('/api/user/:telegramId/onboarding', validateTelegramInitData, async (req, res) => {
  try {
    console.log('🎯 [ONBOARDING] DEBUG:', req.userLogString, 'Telegram ID:', req.params.telegramId);
    console.log('🎯 [ONBOARDING] Request body:', req.body);
    
    const telegramId = parseInt(req.params.telegramId);
    const { action, step, progress } = req.body; // action: 'complete', 'skip', or 'reset'
    
    if (isNaN(telegramId)) {
      console.log('❌ [ONBOARDING] Invalid telegram ID detected');
      return res.status(400).json({ error: 'Invalid telegram ID' });
    }
    
    if (typeof action !== 'string' || (action !== 'complete' && action !== 'skip' && action !== 'reset' && action !== 'update')) {
      console.log('❌ [ONBOARDING] Invalid action:', action);
      return res.status(400).json({ error: 'Invalid action. Must be "complete", "skip", "reset", or "update".' });
    }
    
    // Only allow access if the validated user matches the requested user
    if (req.validatedInitData.user.id !== telegramId) {
      console.log('❌ [ONBOARDING] User mismatch detected');
      console.log('🎯 [ONBOARDING] Requested user ID:', telegramId);
      console.log('🎯 [ONBOARDING] Validated user ID:', req.validatedInitData.user.id);
      return res.status(403).json({ error: 'Forbidden: user mismatch' });
    }
    
    console.log('🎯 [ONBOARDING] User validation passed, updating onboarding status...');
    let result;
    
    if (action === 'complete') {
      if (typeof step !== 'number' || step < 0) {
        console.log('❌ [ONBOARDING] Invalid step for complete action:', step);
        return res.status(400).json({ error: 'Invalid step. Must be a non-negative number.' });
      }
      result = await completeOnboardingStep(telegramId, step);
    } else if (action === 'skip') {
      if (typeof step !== 'number' || step < 0) {
        console.log('❌ [ONBOARDING] Invalid step for skip action:', step);
        return res.status(400).json({ error: 'Invalid step. Must be a non-negative number.' });
      }
      result = await skipOnboardingStep(telegramId, step);
    } else if (action === 'reset') {
      if (!progress) {
        console.log('❌ [ONBOARDING] Missing progress data for reset action');
        return res.status(400).json({ error: 'Missing progress data for reset action.' });
      }
      result = await updateUserOnboardingProgress(telegramId, progress);
    } else if (action === 'update') {
      if (!progress) {
        console.log('❌ [ONBOARDING] Missing progress data for update action');
        return res.status(400).json({ error: 'Missing progress data for update action.' });
      }
      result = await updateUserOnboardingProgress(telegramId, progress);
    }
    
    if (!result) {
      console.log('❌ [ONBOARDING] User not found in database or step not found');
      return res.status(404).json({ error: 'User not found or step not found' });
    }
    
    console.log('🎯 [ONBOARDING] Onboarding status updated successfully:', result);
    res.json({ 
      success: true, 
      user: {
        id: result.id,
        telegram_user_id: result.telegram_user_id,
        onboarding_progress: result.onboarding_progress
      }
    });
  } catch (error) {
    console.error('❌ [ONBOARDING] Error in /api/user/:telegramId/onboarding (POST):', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get user settings by internal user ID
app.get('/api/user/:internalUserId/settings', validateTelegramInitData, async (req, res) => {
  try {
    const internalUserId = parseInt(req.params.internalUserId);
    if (isNaN(internalUserId)) {
      return res.status(400).json({ error: 'Invalid internal user ID' });
    }
    const settings = await getUserSettings(internalUserId);
    if (!settings) {
      return res.status(404).json({ error: 'Settings not found' });
    }
    res.json({ settings });
  } catch (error) {
    console.error('Error fetching user settings:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update user settings by internal user ID (with family synchronization)
app.post('/api/user/:internalUserId/settings', validateTelegramInitData, async (req, res) => {
  try {
    console.log('⚙️ [SETTINGS API] Starting settings update');
    console.log('⚙️ [SETTINGS API] Validated user:', req.validatedInitData.user);
    
    const internalUserId = parseInt(req.params.internalUserId);
    if (isNaN(internalUserId)) {
      console.log('❌ [SETTINGS API] Invalid internal user ID:', req.params.internalUserId);
      return res.status(400).json({ error: 'Invalid internal user ID' });
    }
    
    const { month_start, month_end } = req.body;
    console.log('⚙️ [SETTINGS API] Requested settings update:', { internalUserId, month_start, month_end });
    
    // Validate month_start
    if (month_start !== null && month_start !== undefined) {
      if (typeof month_start !== 'number' || month_start < 1 || month_start > 28) {
        console.log('❌ [SETTINGS API] Invalid month_start value:', month_start);
        return res.status(400).json({ error: 'month_start must be a number between 1 and 28, or null' });
      }
    }
    
    // Validate month_end
    if (month_end !== null && month_end !== undefined) {
      if (typeof month_end !== 'number' || month_end < 1 || month_end > 31) {
        console.log('❌ [SETTINGS API] Invalid month_end value:', month_end);
        return res.status(400).json({ error: 'month_end must be a number between 1 and 31, or null' });
      }
    }
    
    console.log('⚙️ [SETTINGS API] Calling updateUserSettings with:', { internalUserId, month_start, month_end });
    const updated = await updateUserSettings(internalUserId, { month_start, month_end });
    
    if (!updated) {
      console.log('❌ [SETTINGS API] Settings not found for user:', internalUserId);
      return res.status(404).json({ error: 'Settings not found' });
    }
    
    console.log('✅ [SETTINGS API] Settings updated successfully:', updated);
    res.json({ 
      settings: updated,
      message: 'Settings updated successfully. Family members synchronized if applicable.'
    });
  } catch (error) {
    console.error('❌ [SETTINGS API] Error updating user settings:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// New endpoint: Get all expenses for a user by internal user ID and date range
app.get('/api/user/:internalUserId/expenses/range', validateTelegramInitData, async (req, res) => {
  try {
    const internalUserId = parseInt(req.params.internalUserId);
    const { start, end } = req.query;
    if (isNaN(internalUserId) || !start || !end) {
      return res.status(400).json({ error: 'Invalid parameters' });
    }
    // Optionally, you could check that the user making the request is allowed to access this internal user ID
    // For now, just log the validated user from init data
    console.log('[EXPENSES RANGE] Validated user from init data:', req.validatedInitData.user);
    const expenses = await getExpensesByInternalUserIdAndDateRange(internalUserId, start, end);
    res.json({ expenses });
  } catch (error) {
    console.error('❌ [EXPENSES RANGE] Error in /api/user/:internalUserId/expenses/range:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create a new expense
app.post('/api/expenses', validateTelegramInitData, async (req, res) => {
  try {
    console.log('💰 [EXPENSES API] Starting expense creation');
    console.log('💰 [EXPENSES API] Validated user:', req.validatedInitData.user);
    console.log('💰 [EXPENSES API] Request body:', req.body);
    
    const { date, amount, category, description, mode } = req.body;
    
    // Validate required fields
    if (!date || !amount || !category) {
      console.log('❌ [EXPENSES API] Missing required fields');
      return res.status(400).json({ error: 'Missing required fields: date, amount, category' });
    }
    
    // Get the internal user ID from the validated init data
    const telegramUserId = req.validatedInitData.user.id;
    const user = await getUserByTelegramId(telegramUserId);
    
    if (!user) {
      console.log('❌ [EXPENSES API] User not found for telegram ID:', telegramUserId);
      return res.status(404).json({ error: 'User not found' });
    }
    
    const internalUserId = user.id;
    console.log('💰 [EXPENSES API] Creating expense for internal user ID:', internalUserId);
    
    // Create the expense
    const newExpense = await createExpense(internalUserId, {
      date,
      amount: parseFloat(amount),
      category,
      description: description || null,
      mode: mode || 'CASH'
    });
    
    console.log('✅ [EXPENSES API] Expense created successfully:', newExpense);
    res.status(201).json({ 
      expense: newExpense,
      message: 'Expense created successfully'
    });
    
  } catch (error) {
    console.error('❌ [EXPENSES API] Error creating expense:', error);
    
    // Handle specific validation errors
    if (error.message.includes('Invalid mode') || 
        error.message.includes('Amount must be') ||
        error.message.includes('Missing required fields')) {
      return res.status(400).json({ error: error.message });
    }
    
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
