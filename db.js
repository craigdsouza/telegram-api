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
    console.log('🗄️ [DB] SQL:', `SELECT DISTINCT EXTRACT(DAY FROM date) AS day FROM expenses WHERE user_id = $1 AND date >= $2 AND date < $3 ORDER BY day`);
    console.log('🗄️ [DB] Params:', [userId, start, end]);
    const result = await pool.query(
      `SELECT DISTINCT EXTRACT(DAY FROM date) AS day
       FROM expenses
       WHERE user_id = $1 AND date >= $2 AND date < $3
       ORDER BY day`,
      [userId, start, end]
    );
    console.log('🗄️ [DB] Raw SQL result rows:', result.rows);
    
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

// Helper to get family member IDs for a user (returns array of user IDs, including self)
async function getFamilyMemberIds(userId) {
  const result = await pool.query('SELECT family FROM users WHERE id = $1', [userId]);
  if (!result.rows.length || !result.rows[0].family) {
    return [userId];
  }
  try {
    const familyIds = JSON.parse(result.rows[0].family);
    if (Array.isArray(familyIds) && familyIds.length > 0) {
      return familyIds;
    }
    return [userId];
  } catch (e) {
    console.error('❌ [BUDGET] Error parsing family JSON:', e);
    return [userId];
  }
}

// Get budget and expense data for current month
async function getCurrentMonthBudgetData(telegramUserId, year, month) {
  try {
    console.log('💰 [BUDGET] Starting getCurrentMonthBudgetData');
    console.log('💰 [BUDGET] Parameters:', { telegramUserId, year, month });
    
    // Get the internal user id from telegram_user_id
    console.log('💰 [BUDGET] Querying users table for telegram_user_id:', telegramUserId);
    const userResult = await pool.query(
      'SELECT id, budget FROM users WHERE telegram_user_id = $1',
      [telegramUserId]
    );
    
    console.log('💰 [BUDGET] User query result rows:', userResult.rows.length);
    
    if (userResult.rows.length === 0) {
      console.log('❌ [BUDGET] No user found for telegram_user_id:', telegramUserId);
      return {
        totalExpenses: 0,
        budget: null,
        currentDate: new Date().getDate(),
        daysInMonth: new Date(year, month, 0).getDate(),
        budgetPercentage: 0,
        datePercentage: 0,
        currency: 'INR',
        isFamily: false,
        familyMembers: 1
      };
    }
    
    const userId = userResult.rows[0].id;
    
    // Get user settings to check for custom month start/end
    const userSettings = await getUserSettings(userId);
    console.log('💰 [BUDGET] User settings:', userSettings);
    
    // Get family member IDs
    const familyMemberIds = await getFamilyMemberIds(userId);
    const isFamily = familyMemberIds.length > 1;
    const familyMembers = familyMemberIds.length;
    
    // Calculate custom month period based on user settings
    let startOfPeriod, endOfPeriod, currentDayInPeriod, totalDaysInPeriod;
    
    if (userSettings && userSettings.month_start !== null) {
      // Custom month period (e.g., 15th to 14th)
      const monthStart = userSettings.month_start;
      
      // Calculate start of current period
      if (monthStart <= new Date().getDate()) {
        // Current period started this month
        startOfPeriod = new Date(year, month - 1, monthStart, 0, 0, 0, 0);
      } else {
        // Current period started last month
        startOfPeriod = new Date(year, month - 2, monthStart, 0, 0, 0, 0);
      }
      
      // Calculate end of current period
      endOfPeriod = new Date(startOfPeriod);
      endOfPeriod.setMonth(endOfPeriod.getMonth() + 1);
      endOfPeriod.setDate(monthStart - 1);
      
      // Calculate current day within the period
      const today = new Date();
      if (today >= startOfPeriod && today < endOfPeriod) {
        const diffTime = today - startOfPeriod;
        currentDayInPeriod = Math.floor(diffTime / (1000 * 60 * 60 * 24)) + 1;
      } else {
        currentDayInPeriod = 1; // Default to first day if outside period
      }
      
      // Calculate total days in period
      const periodDiffTime = endOfPeriod - startOfPeriod;
      totalDaysInPeriod = Math.floor(periodDiffTime / (1000 * 60 * 60 * 24)) + 1;
      
      console.log('💰 [BUDGET] Custom period calculation:', {
        monthStart,
        startOfPeriod: startOfPeriod.toISOString(),
        endOfPeriod: endOfPeriod.toISOString(),
        currentDayInPeriod,
        totalDaysInPeriod
      });
    } else {
      // Standard calendar month (1st to last day)
      startOfPeriod = new Date(year, month - 1, 1, 0, 0, 0, 0);
      endOfPeriod = new Date(year, month, 1, 0, 0, 0, 0);
      currentDayInPeriod = new Date().getDate();
      totalDaysInPeriod = new Date(year, month, 0).getDate();
      
      console.log('💰 [BUDGET] Standard calendar month:', {
        startOfPeriod: startOfPeriod.toISOString(),
        endOfPeriod: endOfPeriod.toISOString(),
        currentDayInPeriod,
        totalDaysInPeriod
      });
    }
    
    let budget = null;
    let totalExpenses = 0;
    
    if (isFamily) {
      // Get first non-null budget from any family member
      const budgetResult = await pool.query(
        'SELECT budget FROM users WHERE id = ANY($1) AND budget IS NOT NULL AND budget > 0 ORDER BY id LIMIT 1',
        [familyMemberIds]
      );
      budget = budgetResult.rows.length ? budgetResult.rows[0].budget : null;
      // Get combined expenses for all family members (excluding Transfers)
      const expensesResult = await pool.query(
        `SELECT COALESCE(SUM(amount), 0) as total_amount
         FROM expenses
         WHERE user_id = ANY($1) AND date >= $2 AND date < $3 AND category != 'Transfers'`,
        [familyMemberIds, startOfPeriod, endOfPeriod]
      );
      totalExpenses = expensesResult.rows[0].total_amount;
    } else {
      budget = userResult.rows[0].budget;
      // Individual expenses (excluding Transfers)
      const expenses = await pool.query(
        `SELECT COALESCE(SUM(amount), 0) as total_amount
         FROM expenses
         WHERE user_id = $1 AND date >= $2 AND date < $3 AND category != 'Transfers'`,
        [userId, startOfPeriod, endOfPeriod]
      );
      totalExpenses = expenses.rows[0].total_amount;
    }
    
    // Calculate percentages using custom period
    const datePercentage = (currentDayInPeriod / totalDaysInPeriod) * 100;
    const budgetPercentage = budget && budget > 0 ? (totalExpenses / budget) * 100 : 0;
    
    console.log('💰 [BUDGET] Calculated percentages:', {
      currentDayInPeriod,
      totalDaysInPeriod,
      datePercentage,
      budgetPercentage
    });
    
    const result = {
      totalExpenses,
      budget,
      currentDate: currentDayInPeriod,
      daysInMonth: totalDaysInPeriod,
      budgetPercentage: Math.min(budgetPercentage, 100), // Cap at 100%
      datePercentage,
      currency: 'INR',
      isFamily,
      familyMembers,
      customPeriod: userSettings && userSettings.month_start !== null,
      periodStart: startOfPeriod.toISOString(),
      periodEnd: endOfPeriod.toISOString()
    };
    
    console.log('💰 [BUDGET] Final result:', result);
    return result;
    
  } catch (error) {
    console.error('❌ [BUDGET] Error fetching budget data:', error);
    console.error('❌ [BUDGET] Error message:', error.message);
    console.error('❌ [BUDGET] Error stack:', error.stack);
    throw error;
  }
}

// Get all expenses for the current month for a user (date, amount, category, description)
async function getCurrentMonthExpenses(telegramUserId, year, month) {
  try {
    // Get the internal user id from telegram_user_id
    const userResult = await pool.query(
      'SELECT id FROM users WHERE telegram_user_id = $1',
      [telegramUserId]
    );
    if (userResult.rows.length === 0) {
      return [];
    }
    const userId = userResult.rows[0].id;
    const startOfMonth = new Date(year, month - 1, 1, 0, 0, 0, 0);
    const endOfMonth = new Date(year, month, 1, 0, 0, 0, 0);
    // Query for all expenses for this user in the given month
    const result = await pool.query(
      `SELECT id, TO_CHAR(date, 'YYYY-MM-DD') as date, amount, category, description, mode
       FROM expenses
       WHERE user_id = $1 AND date >= $2 AND date < $3
       ORDER BY date DESC`,
      [userId, startOfMonth, endOfMonth]
    );
    return result.rows;
  } catch (error) {
    console.error('❌ [DB] Error fetching current month expenses:', error);
    throw error;
  }
}

// Get all expenses for the current month for a user by internal user ID
async function getCurrentMonthExpensesByInternalUserId(userId, year, month) {
  try {
    const startOfMonth = new Date(year, month - 1, 1, 0, 0, 0, 0);
    const endOfMonth = new Date(year, month, 1, 0, 0, 0, 0);
    const result = await pool.query(
      `SELECT id, TO_CHAR(date, 'YYYY-MM-DD') as date, amount, category, description, mode
       FROM expenses
       WHERE user_id = $1 AND date >= $2 AND date < $3
       ORDER BY date DESC`,
      [userId, startOfMonth, endOfMonth]
    );
    return result.rows;
  } catch (error) {
    console.error('❌ [DB] Error fetching current month expenses by internal user ID:', error);
    throw error;
  }
}

// Get user onboarding status
async function getUserOnboardingStatus(telegramUserId) {
  try {
    const query = `
      SELECT onboarding 
      FROM users 
      WHERE telegram_user_id = $1
    `;
    
    const result = await pool.query(query, [telegramUserId]);
    
    if (result.rows.length === 0) {
      return null; // User not found
    }
    
    return result.rows[0].onboarding;
  } catch (error) {
    console.error('❌ Error fetching user onboarding status:', error);
    throw error;
  }
}

// Update user onboarding status
async function updateUserOnboardingStatus(telegramUserId, onboardingStatus) {
  try {
    const query = `
      UPDATE users 
      SET onboarding = $2, last_active = NOW()
      WHERE telegram_user_id = $1
      RETURNING id, telegram_user_id, onboarding
    `;
    
    const result = await pool.query(query, [telegramUserId, onboardingStatus]);
    
    if (result.rows.length === 0) {
      return null; // User not found
    }
    
    return result.rows[0];
  } catch (error) {
    console.error('❌ Error updating user onboarding status:', error);
    throw error;
  }
}

// Get user onboarding progress
async function getUserOnboardingProgress(telegramUserId) {
  try {
    const query = `
      SELECT onboarding_progress 
      FROM users 
      WHERE telegram_user_id = $1
    `;
    
    const result = await pool.query(query, [telegramUserId]);
    
    if (result.rows.length === 0) {
      return null; // User not found
    }
    
    return result.rows[0].onboarding_progress;
  } catch (error) {
    console.error('❌ Error fetching user onboarding progress:', error);
    throw error;
  }
}

// Update user onboarding progress
async function updateUserOnboardingProgress(telegramUserId, progress) {
  try {
    const query = `
      UPDATE users 
      SET onboarding_progress = $2, last_active = NOW()
      WHERE telegram_user_id = $1
      RETURNING id, telegram_user_id, onboarding_progress
    `;
    
    const result = await pool.query(query, [telegramUserId, JSON.stringify(progress)]);
    
    if (result.rows.length === 0) {
      return null; // User not found
    }
    
    return result.rows[0];
  } catch (error) {
    console.error('❌ Error updating user onboarding progress:', error);
    throw error;
  }
}

// Complete a specific onboarding step
async function completeOnboardingStep(telegramUserId, stepId, stepData = {}) {
  try {
    // First get current progress
    const currentProgress = await getUserOnboardingProgress(telegramUserId);
    if (!currentProgress) {
      throw new Error('User not found');
    }
    
    // Update progress
    const updatedProgress = {
      ...currentProgress,
      current_step: Math.max(currentProgress.current_step, stepId + 1),
      completed_steps: [...new Set([...currentProgress.completed_steps, stepId])],
      step_data: {
        ...currentProgress.step_data,
        [`step_${stepId}`]: {
          ...stepData,
          completed_at: new Date().toISOString()
        }
      }
    };
    
    // Update in database
    return await updateUserOnboardingProgress(telegramUserId, updatedProgress);
  } catch (error) {
    console.error('❌ Error completing onboarding step:', error);
    throw error;
  }
}

// Skip a specific onboarding step
async function skipOnboardingStep(telegramUserId, stepId) {
  try {
    // First get current progress
    const currentProgress = await getUserOnboardingProgress(telegramUserId);
    if (!currentProgress) {
      throw new Error('User not found');
    }
    
    // Update progress (mark as completed but with skip flag)
    const updatedProgress = {
      ...currentProgress,
      current_step: Math.max(currentProgress.current_step, stepId + 1),
      completed_steps: [...new Set([...currentProgress.completed_steps, stepId])],
      step_data: {
        ...currentProgress.step_data,
        [`step_${stepId}`]: {
          skipped: true,
          skipped_at: new Date().toISOString()
        }
      }
    };
    
    // Update in database
    return await updateUserOnboardingProgress(telegramUserId, updatedProgress);
  } catch (error) {
    console.error('❌ Error skipping onboarding step:', error);
    throw error;
  }
}

// Get user settings by user_id
async function getUserSettings(userId) {
  try {
    const query = `
      SELECT user_id, first_name, last_name, month_start, month_end
      FROM user_settings
      WHERE user_id = $1
    `;
    const result = await pool.query(query, [userId]);
    if (result.rows.length === 0) {
      return null;
    }
    return result.rows[0];
  } catch (error) {
    console.error('❌ Error fetching user settings:', error);
    throw error;
  }
}

// Update user settings by user_id (with family member synchronization)
async function updateUserSettings(userId, settings) {
  try {
    const { month_start, month_end } = settings;
    
    console.log('⚙️ [SETTINGS] Updating settings for user:', userId);
    console.log('⚙️ [SETTINGS] Requested settings:', { month_start, month_end });
    console.log('⚙️ [SETTINGS] month_start type:', typeof month_start, 'value:', month_start);
    console.log('⚙️ [SETTINGS] month_end type:', typeof month_end, 'value:', month_end);
    
    // First, check if this user is part of a family
    const familyMemberIds = await getFamilyMemberIds(userId);
    const isFamily = familyMemberIds.length > 1;
    
    console.log('⚙️ [SETTINGS] Is family member:', isFamily);
    console.log('⚙️ [SETTINGS] Family member IDs:', familyMemberIds);
    
    if (isFamily) {
      // Update settings for all family members
      console.log('⚙️ [SETTINGS] Updating settings for all family members');
      return await updateFamilySettings(familyMemberIds, settings);
    } else {
      // Update settings for individual user only
      console.log('⚙️ [SETTINGS] Updating settings for individual user');
      const query = `
        UPDATE user_settings
        SET month_start = $2, month_end = $3
        WHERE user_id = $1
        RETURNING user_id, first_name, last_name, month_start, month_end
      `;
      const result = await pool.query(query, [userId, month_start, month_end]);
      if (result.rows.length === 0) {
        return null;
      }
      return result.rows[0];
    }
  } catch (error) {
    console.error('❌ Error updating user settings:', error);
    throw error;
  }
}

// Update settings for all family members
async function updateFamilySettings(familyMemberIds, settings) {
  try {
    const { month_start, month_end } = settings;
    
    console.log('👨‍👩‍👧‍👦 [FAMILY SETTINGS] Updating settings for family members:', familyMemberIds);
    console.log('👨‍👩‍👧‍👦 [FAMILY SETTINGS] New settings:', { month_start, month_end });
    
    // Update all family members' settings
    const query = `
      UPDATE user_settings
      SET month_start = $2, month_end = $3
      WHERE user_id = ANY($1)
      RETURNING user_id, first_name, last_name, month_start, month_end
    `;
    
    const result = await pool.query(query, [familyMemberIds, month_start, month_end]);
    
    if (result.rows.length === 0) {
      console.log('❌ [FAMILY SETTINGS] No family members found to update');
      return null;
    }
    
    // Sort the results by user_id for consistent logging
    const sortedRows = result.rows.sort((a, b) => a.user_id - b.user_id);
    
    console.log('✅ [FAMILY SETTINGS] Successfully updated', sortedRows.length, 'family members');
    console.log('✅ [FAMILY SETTINGS] Updated members:', sortedRows.map(row => ({ 
      user_id: row.user_id, 
      name: `${row.first_name} ${row.last_name}`.trim(),
      month_start: row.month_start,
      month_end: row.month_end
    })));
    
    // Return the first family member's settings (representing the family)
    return sortedRows[0];
  } catch (error) {
    console.error('❌ Error updating family settings:', error);
    throw error;
  }
}

// Get all expenses for a user by internal user ID and date range
async function getExpensesByInternalUserIdAndDateRange(userId, startDate, endDate) {
  try {
    console.log('🔍 [DB RANGE] Query parameters:', { userId, startDate, endDate });
    console.log('🔍 [DB RANGE] Query types:', { 
      userId: typeof userId, 
      startDate: typeof startDate, 
      endDate: typeof endDate 
    });
    
    const result = await pool.query(
      `SELECT id, TO_CHAR(date, 'YYYY-MM-DD') as date, amount, category, description, mode
       FROM expenses
       WHERE user_id = $1 AND date >= $2 AND date <= $3
       ORDER BY date DESC`,
      [userId, startDate, endDate]
    );
    
    console.log('🔍 [DB RANGE] Query result rows:', result.rows.length);
    console.log('🔍 [DB RANGE] First few rows:', result.rows.slice(0, 3));
    
    return result.rows;
  } catch (error) {
    console.error('❌ [DB] Error fetching expenses by internal user ID and date range:', error);
    throw error;
  }
}

// Create a new expense
async function createExpense(userId, expenseData) {
  try {
    const { date, amount, category, description, mode = 'CASH' } = expenseData;
    
    // Validate required fields
    if (!date || !amount || !category) {
      throw new Error('Missing required fields: date, amount, category');
    }
    
    // Validate mode
    const validModes = ['UPI', 'CASH', 'DEBIT CARD', 'CREDIT CARD'];
    if (!validModes.includes(mode)) {
      throw new Error(`Invalid mode. Must be one of: ${validModes.join(', ')}`);
    }
    
    // Validate amount
    if (isNaN(amount) || amount <= 0) {
      throw new Error('Amount must be a positive number');
    }
    
    const result = await pool.query(
      `INSERT INTO expenses (user_id, date, amount, category, description, mode)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, TO_CHAR(date, 'YYYY-MM-DD') as date, amount, category, description, mode`,
      [userId, date, amount, category, description, mode]
    );
    
    return result.rows[0];
  } catch (error) {
    console.error('❌ [DB] Error creating expense:', error);
    throw error;
  }
}

module.exports = {
  testConnection,
  getUserByTelegramId,
  getExpenseEntryDatesForMonth,
  getUserMissionProgress,
  getCurrentMonthBudgetData,
  getCurrentMonthExpenses,
  getCurrentMonthExpensesByInternalUserId,
  getUserOnboardingProgress,
  updateUserOnboardingProgress,
  completeOnboardingStep,
  skipOnboardingStep,
  getUserSettings,
  updateUserSettings,
  updateFamilySettings,
  getExpensesByInternalUserIdAndDateRange,
  createExpense
}; 