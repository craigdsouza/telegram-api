const { Pool } = require('pg');
require('dotenv').config();

// Use the same database URL as your bot
const DATABASE_URL = process.env.DATABASE_PUBLIC_URL;

if (!DATABASE_URL) {
  console.error('❌ DATABASE_PUBLIC_URL environment variable is not set');
  process.exit(1);
}

// Create a connection pool
const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: {
    rejectUnauthorized: false // Required for Railway's PostgreSQL
  }
});

// Test the connection
pool.on('connect', () => {
  console.log('✅ Connected to PostgreSQL database');
});

pool.on('error', (err) => {
  console.error('❌ Database connection error:', err);
});

// Function to get user by Telegram ID
async function getUserByTelegramId(telegramUserId) {
  try {
    const query = `
      SELECT id, telegram_user_id, first_name, last_name, created_at, last_active 
      FROM users 
      WHERE telegram_user_id = $1
    `;
    
    const result = await pool.query(query, [telegramUserId]);
    
    if (result.rows.length === 0) {
      return null; // User not found
    }
    
    return result.rows[0];
  } catch (error) {
    console.error('❌ Error fetching user:', error);
    throw error;
  }
}

// Function to test database connection
async function testConnection() {
  try {
    const result = await pool.query('SELECT NOW()');
    console.log('✅ Database test successful:', result.rows[0]);
    return true;
  } catch (error) {
    console.error('❌ Database test failed:', error);
    return false;
  }
}

// Get unique days in a month where the user has expenses
async function getExpenseEntryDatesForMonth(telegramUserId, year, month) {
  try {
    console.log('🗄️ [DB] Starting getExpenseEntryDatesForMonth');
    console.log('🗄️ [DB] Parameters:', { telegramUserId, year, month });
    console.log('🗄️ [DB] Parameter types:', { 
      telegramUserId: typeof telegramUserId, 
      year: typeof year, 
      month: typeof month 
    });
    
    // Get the internal user id from telegram_user_id
    console.log('🗄️ [DB] Querying users table for telegram_user_id:', telegramUserId);
    const userResult = await pool.query(
      'SELECT id FROM users WHERE telegram_user_id = $1',
      [telegramUserId]
    );
    
    console.log('🗄️ [DB] User query result rows:', userResult.rows.length);
    console.log('🗄️ [DB] User query result:', userResult.rows);
    
    if (userResult.rows.length === 0) {
      console.log('❌ [DB] No user found for telegram_user_id:', telegramUserId);
      return [];
    }
    
    const userId = userResult.rows[0].id;
    console.log('🗄️ [DB] Found internal user ID:', userId);
    
    // Query for all expenses for this user in the given month
    // Assume date is stored as DATE or TIMESTAMP in a column named date or created_at
    const start = new Date(year, month - 1, 1);
    const end = new Date(year, month, 1);
    
    console.log('🗄️ [DB] Date range for query:', { start, end });
    console.log('🗄️ [DB] Date range ISO strings:', { 
      start: start.toISOString(), 
      end: end.toISOString() 
    });
    
    console.log('🗄️ [DB] Executing expenses query...');
    const result = await pool.query(
      `SELECT DISTINCT EXTRACT(DAY FROM created_at) AS day
       FROM expenses
       WHERE user_id = $1 AND created_at >= $2 AND created_at < $3
       ORDER BY day`,
      [userId, start, end]
    );
    
    console.log('🗄️ [DB] Expenses query completed');
    console.log('🗄️ [DB] Number of expense rows found:', result.rows.length);
    console.log('🗄️ [DB] Raw expense rows:', result.rows);
    
    const days = result.rows.map(row => row.day);
    console.log('🗄️ [DB] Extracted days:', days);
    console.log('🗄️ [DB] Day types:', days.map(d => typeof d));
    
    return days;
  } catch (error) {
    console.error('❌ [DB] Error fetching expense entry dates:', error);
    console.error('❌ [DB] Error message:', error.message);
    console.error('❌ [DB] Error stack:', error.stack);
    throw error;
  }
}

// Get mission progress for a user
async function getUserMissionProgress(telegramUserId) {
  try {
    console.log('🎯 [MISSIONS] Starting getUserMissionProgress');
    console.log('🎯 [MISSIONS] Parameters:', { telegramUserId });
    
    // Get the internal user id from telegram_user_id
    console.log('🎯 [MISSIONS] Querying users table for telegram_user_id:', telegramUserId);
    const userResult = await pool.query(
      'SELECT id, budget FROM users WHERE telegram_user_id = $1',
      [telegramUserId]
    );
    
    console.log('🎯 [MISSIONS] User query result rows:', userResult.rows.length);
    
    if (userResult.rows.length === 0) {
      console.log('❌ [MISSIONS] No user found for telegram_user_id:', telegramUserId);
      return {
        babySteps: 0,
        juniorAnalyst: 0,
        budgetSet: false
      };
    }
    
    const userId = userResult.rows[0].id;
    const budgetValue = userResult.rows[0].budget;
    console.log('🎯 [MISSIONS] Found internal user ID:', userId);
    console.log('🎯 [MISSIONS] User budget value:', budgetValue);
    
    // Mission 1: Baby Steps - Count distinct days with expenses
    console.log('🎯 [MISSIONS] Calculating Baby Steps progress...');
    const babyStepsResult = await pool.query(
      `SELECT COUNT(DISTINCT DATE(created_at)) as distinct_days
       FROM expenses
       WHERE user_id = $1`,
      [userId]
    );
    
    const babySteps = parseInt(babyStepsResult.rows[0]?.distinct_days || 0);
    console.log('🎯 [MISSIONS] Baby Steps progress:', babySteps);
    
    // Mission 2: Junior Budget Analyst - Count distinct days with expenses (same as Baby Steps for now)
    console.log('🎯 [MISSIONS] Calculating Junior Budget Analyst progress...');
    const juniorAnalystResult = await pool.query(
      `SELECT COUNT(DISTINCT DATE(created_at)) as distinct_days
       FROM expenses
       WHERE user_id = $1`,
      [userId]
    );
    
    const juniorAnalyst = parseInt(juniorAnalystResult.rows[0]?.distinct_days || 0);
    console.log('🎯 [MISSIONS] Junior Budget Analyst progress:', juniorAnalyst);
    
    // Check if budget is set (non-null and greater than 0)
    const budgetSet = budgetValue !== null && parseFloat(budgetValue) > 0;
    console.log('🎯 [MISSIONS] Budget set status:', budgetSet);
    
    const progress = {
      babySteps,
      juniorAnalyst,
      budgetSet
    };
    
    console.log('🎯 [MISSIONS] Final mission progress:', progress);
    return progress;
    
  } catch (error) {
    console.error('❌ [MISSIONS] Error fetching mission progress:', error);
    console.error('❌ [MISSIONS] Error message:', error.message);
    console.error('❌ [MISSIONS] Error stack:', error.stack);
    throw error;
  }
}

module.exports = {
  pool,
  getUserByTelegramId,
  testConnection,
  getExpenseEntryDatesForMonth,
  getUserMissionProgress
}; 