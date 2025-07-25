# Telegram Finance Bot API Documentation

This document describes all API endpoints available in the Telegram Finance Bot backend (`index.js`).

## Authentication

All protected endpoints require Telegram Mini App authentication using the `Authorization` header:

```
Authorization: tma <initDataRaw>
```

Where `initDataRaw` is the raw init data string from the Telegram Mini App SDK.

### Development Bypass

In development mode, you can bypass authentication by adding:
```
X-Dev-Bypass: true
```

This only works for users listed in the `DEV_USER_IDS` environment variable.

## Health & Testing Endpoints

### GET /ping
**Purpose**: Test if the API server is running

**Response**:
```json
{
  "message": "API is running!",
  "timestamp": "2024-01-01T12:00:00.000Z"
}
```

**Usage**: Called by health monitoring systems and for basic connectivity testing.

---

### GET /health
**Purpose**: Health check endpoint for Railway deployment

**Response**:
```json
{
  "status": "OK",
  "service": "telegram-api"
}
```

**Usage**: Railway uses this to monitor service health.

---

### GET /test-db
**Purpose**: Test database connectivity

**Response**:
```json
{
  "message": "Database connection successful!",
  "timestamp": "2024-01-01T12:00:00.000Z"
}
```

**Error Response**:
```json
{
  "error": "Database connection failed"
}
```

**Usage**: Debugging database connectivity issues.

## User Management

### GET /api/user/:telegramId
**Purpose**: Get user information by Telegram ID (legacy endpoint)

**Parameters**:
- `telegramId` (path): Telegram user ID (integer)

**Response**:
```json
{
  "id": 1,
  "telegram_user_id": 123456789,
  "first_name": "John",
  "last_name": "Doe",
  "created_at": "2024-01-01T12:00:00.000Z",
  "last_active": "2024-01-01T12:00:00.000Z"
}
```

**Error Responses**:
- `400`: Invalid Telegram ID
- `404`: User not found
- `500`: Internal server error

**Usage**: 
- **Frontend**: `ProfilePanel.tsx` and `DashboardPanel.tsx` use this to convert Telegram IDs to internal user IDs
- **Purpose**: Legacy endpoint for user lookup

---

### POST /api/user/validate
**Purpose**: Validate Telegram init data and return user information

**Headers**: Requires `Authorization: tma <initDataRaw>`

**Response**:
```json
{
  "id": 1,
  "telegram_user_id": 123456789,
  "first_name": "John",
  "last_name": "Doe",
  "created_at": "2024-01-01T12:00:00.000Z",
  "last_active": "2024-01-01T12:00:00.000Z"
}
```

**Error Responses**:
- `401`: Invalid init data or no authorization header
- `404`: User not found in database
- `500`: Internal server error

**Usage**: 
- **Frontend**: Used for user authentication and validation
- **Purpose**: Secure way to validate Telegram users and get their internal user ID

## Calendar & Expense Dates

### GET /api/user/:telegramId/expenses/dates
**Purpose**: Get dates with expense entries for a specific month

**Parameters**:
- `telegramId` (path): Telegram user ID
- `year` (query): Year (integer)
- `month` (query): Month (integer, 1-12)

**Headers**: Requires `Authorization: tma <initDataRaw>`

**Response**:
```json
{
  "days": [1, 5, 12, 15, 20]
}
```

**Error Responses**:
- `400`: Invalid parameters
- `403`: User mismatch (requested user doesn't match authenticated user)
- `500`: Internal server error

**Usage**: 
- **Frontend**: `CalendarView/Calendar.tsx` uses this to show which days have expenses
- **Purpose**: Calendar visualization of expense activity

## Mission Progress

### GET /api/user/:telegramId/missions
**Purpose**: Get user's mission progress

**Parameters**:
- `telegramId` (path): Telegram user ID

**Headers**: Requires `Authorization: tma <initDataRaw>`

**Response**:
```json
{
  "babySteps": 3,
  "juniorAnalyst": 1,
  "budgetSet": true
}
```

**Error Responses**:
- `400`: Invalid telegram ID
- `403`: User mismatch
- `500`: Internal server error

**Usage**: 
- **Frontend**: `MissionsPanel.tsx` uses this to display mission progress
- **Purpose**: Gamification and user engagement tracking

## Budget & Expenses

### GET /api/user/:telegramId/budget/current-month
**Purpose**: Get budget and expense data for current month

**Parameters**:
- `telegramId` (path): Telegram user ID
- `year` (query): Year (integer)
- `month` (query): Month (integer, 1-12)

**Headers**: Requires `Authorization: tma <initDataRaw>`

**Response**:
```json
{
  "totalExpenses": 15000,
  "budget": 20000,
  "currentDate": 15,
  "daysInMonth": 31,
  "budgetPercentage": 75.0,
  "datePercentage": 48.4,
  "currency": "₹",
  "isFamily": false,
  "familyMembers": 1
}
```

**Error Responses**:
- `400`: Invalid parameters
- `403`: User mismatch
- `500`: Internal server error

**Usage**: 
- **Frontend**: `BudgetView.tsx` uses this to display budget progress
- **Purpose**: Budget tracking and visualization

---

### GET /api/user/:internalUserId/expenses/current-month
**Purpose**: Get all expenses for current month (by internal user ID)

**Parameters**:
- `internalUserId` (path): Internal user ID (integer)
- `year` (query): Year (integer)
- `month` (query): Month (integer, 1-12)

**Headers**: Requires `Authorization: tma <initDataRaw>`

**Response**:
```json
{
  "expenses": [
    {
      "id": 1,
      "date": "2024-01-15",
      "amount": "500",
      "category": "Food",
      "description": "Lunch"
    }
  ]
}
```

**Error Responses**:
- `400`: Invalid parameters
- `500`: Internal server error

**Usage**: 
- **Frontend**: `ExpensesTable.tsx` uses this for regular users (no custom date range)
- **Purpose**: Display current month expenses in table format

---

### GET /api/user/:internalUserId/expenses/range
**Purpose**: Get expenses for a custom date range (by internal user ID)

**Parameters**:
- `internalUserId` (path): Internal user ID (integer)
- `start` (query): Start date (YYYY-MM-DD)
- `end` (query): End date (YYYY-MM-DD)

**Headers**: Requires `Authorization: tma <initDataRaw>`

**Response**:
```json
{
  "expenses": [
    {
      "id": 1,
      "date": "2024-01-15",
      "amount": "500",
      "category": "Food",
      "description": "Lunch"
    }
  ]
}
```

**Error Responses**:
- `400`: Invalid parameters
- `500`: Internal server error

**Usage**: 
- **Frontend**: `ExpensesTable.tsx` uses this when custom start/end dates are set
- **Purpose**: Display expenses for custom date ranges

## User Settings

### GET /api/user/:internalUserId/settings
**Purpose**: Get user settings (month start/end dates)

**Parameters**:
- `internalUserId` (path): Internal user ID (integer)

**Headers**: Requires `Authorization: tma <initDataRaw>`

**Response**:
```json
{
  "settings": {
    "month_start": 15,
    "month_end": 14
  }
}
```

**Error Responses**:
- `400`: Invalid internal user ID
- `404`: Settings not found
- `500`: Internal server error

**Usage**: 
- **Frontend**: `ProfileSettingsPanel.tsx` uses this to load current settings
- **Purpose**: Retrieve user's custom month start/end dates

---

### POST /api/user/:internalUserId/settings
**Purpose**: Update user settings (month start/end dates)

**Parameters**:
- `internalUserId` (path): Internal user ID (integer)

**Headers**: Requires `Authorization: tma <initDataRaw>`

**Request Body**:
```json
{
  "month_start": 15,
  "month_end": 14
}
```

**Validation**:
- `month_start`: 1-28 or null
- `month_end`: 1-31 or null

**Response**:
```json
{
  "settings": {
    "month_start": 15,
    "month_end": 14
  }
}
```

**Error Responses**:
- `400`: Invalid parameters or validation failed
- `404`: Settings not found
- `500`: Internal server error

**Usage**: 
- **Frontend**: `ProfileSettingsPanel.tsx` uses this to save user settings
- **Purpose**: Update user's custom month start/end dates

## Onboarding

### GET /api/user/:telegramId/onboarding
**Purpose**: Get user's onboarding progress

**Parameters**:
- `telegramId` (path): Telegram user ID

**Headers**: Requires `Authorization: tma <initDataRaw>`

**Response**:
```json
{
  "onboarding": {
    "step_1": true,
    "step_2": false,
    "step_3": null
  }
}
```

**Error Responses**:
- `400`: Invalid telegram ID
- `403`: User mismatch
- `404`: User not found
- `500`: Internal server error

**Usage**: 
- **Frontend**: Onboarding components use this to track progress
- **Purpose**: Track user onboarding completion status

---

### POST /api/user/:telegramId/onboarding
**Purpose**: Update user's onboarding progress

**Parameters**:
- `telegramId` (path): Telegram user ID

**Headers**: Requires `Authorization: tma <initDataRaw>`

**Request Body**:
```json
{
  "action": "complete",
  "step": 1
}
```

**Actions**:
- `complete`: Mark a step as completed
- `skip`: Mark a step as skipped
- `reset`: Reset onboarding progress
- `update`: Update progress with custom data

**Response**:
```json
{
  "success": true,
  "user": {
    "id": 1,
    "telegram_user_id": 123456789,
    "onboarding_progress": {
      "step_1": true,
      "step_2": false
    }
  }
}
```

**Error Responses**:
- `400`: Invalid parameters
- `403`: User mismatch
- `404`: User not found or step not found
- `500`: Internal server error

**Usage**: 
- **Frontend**: Onboarding components use this to update progress
- **Purpose**: Update user onboarding completion status

## Error Handling

All endpoints follow consistent error handling:

- **400 Bad Request**: Invalid parameters or validation failed
- **401 Unauthorized**: Missing or invalid authentication
- **403 Forbidden**: User mismatch (requested user doesn't match authenticated user)
- **404 Not Found**: Resource not found
- **500 Internal Server Error**: Server-side error

## Development Notes

### User ID Types
- **Telegram User ID**: Long integer from Telegram (e.g., 123456789)
- **Internal User ID**: Integer from our database (e.g., 1, 2, 3)

### Authentication Flow
1. Frontend gets `initDataRaw` from Telegram Mini App SDK
2. Frontend sends `Authorization: tma <initDataRaw>` header
3. Backend validates init data using bot token
4. Backend extracts user information from validated init data
5. Backend performs user-specific operations

### Database Functions
All database operations are abstracted in `db.js`:
- `getUserByTelegramId()`: Convert Telegram ID to internal user
- `getExpenseEntryDatesForMonth()`: Get calendar dates
- `getUserMissionProgress()`: Get mission progress
- `getCurrentMonthBudgetData()`: Get budget data
- `getCurrentMonthExpensesByInternalUserId()`: Get current month expenses
- `getExpensesByInternalUserIdAndDateRange()`: Get date range expenses
- `getUserSettings()` / `updateUserSettings()`: Manage user settings
- `getUserOnboardingProgress()` / `updateUserOnboardingProgress()`: Manage onboarding 