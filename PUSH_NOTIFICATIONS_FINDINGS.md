# Push Notifications Investigation - Findings

**Issue:** Push notifications aren't triggering  
**Root Cause:** Feature is only partially implemented

---

## TL;DR

Push notifications for price alerts are **partially built but not connected**:

✅ **What exists:**
- User can create price alerts in the app
- Alerts stored locally in AsyncStorage
- Expo push notification registration works (gets push token)
- UI shows active alerts

❌ **What's missing:**
- No backend logic to check if price hits alert target
- No code to send push notifications when triggered
- Alerts are stored but never evaluated

**Status:** Feature is 50% complete (UI + storage, but no triggering logic)

---

## How Price Alerts Currently Work

### Frontend (Mobile App)

**User Flow:**
1. User creates price alert (e.g., "Notify me when Gold hits $5200")
2. Alert saved to AsyncStorage: `stack_price_alerts`
3. Push notification permission requested (gets Expo push token)
4. **Nothing happens after this** ❌

**Code Location:** `mobile-app/App.js`

**Alert Creation:**
```javascript
const createPriceAlert = (alert) => {
  const updated = [alert, ...priceAlerts];
  setPriceAlerts(updated);
  savePriceAlerts(updated); // Saves to AsyncStorage
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
};
```

**Alert Storage:**
```javascript
// AsyncStorage key: 'stack_price_alerts'
// Format:
[
  {
    id: "1234567890",
    metal: "gold",
    targetPrice: 5200,
    direction: "above", // or "below"
    created: "2026-02-03T05:00:00.000Z",
    enabled: true
  }
]
```

**Push Token Registration:**
```javascript
const registerForPushNotifications = async () => {
  // Gets Expo push token
  const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
  const token = tokenData.data;
  console.log('📱 [Notifications] Push Token:', token);
  return token; // But token is never saved anywhere! ❌
};
```

### Backend (Server)

**Current Implementation:** NONE ❌

**TODO Comment in App.js (line 2208):**
```javascript
// TODO: Backend implementation needed:
//   - Sync alert preferences to Supabase (user_preferences or price_alerts table)
//   - Backend cron job compares cached spot prices against user targets
//   - Send push notifications via Expo when conditions are met
//   - ATH alerts: track all-time highs and notify when exceeded
//   - Custom alerts: check if price crosses targetPrice in specified direction
```

---

## What Needs to Be Built

### 1. Store Push Tokens on Backend

**Mobile App Changes:**
- Save Expo push token to Supabase when registered
- Link token to user account (or anonymous device ID)

**Database Schema:**
```sql
-- New table: push_tokens
CREATE TABLE push_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  device_id TEXT, -- For anonymous users
  expo_push_token TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  last_active TIMESTAMP DEFAULT NOW()
);
```

### 2. Sync Price Alerts to Backend

**Mobile App Changes:**
- When user creates/deletes alert, sync to Supabase
- Send alert preferences to backend

**Database Schema:**
```sql
-- New table: price_alerts
CREATE TABLE price_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  device_id TEXT, -- For anonymous users
  metal TEXT NOT NULL, -- 'gold' or 'silver'
  target_price DECIMAL(10,2) NOT NULL,
  direction TEXT NOT NULL, -- 'above' or 'below'
  enabled BOOLEAN DEFAULT TRUE,
  triggered BOOLEAN DEFAULT FALSE,
  triggered_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);
```

### 3. Backend Cron Job to Check Alerts

**New Server Component:**
```javascript
// backend/services/priceAlertChecker.js

async function checkPriceAlerts() {
  // 1. Get current spot prices from cache
  const prices = { gold: 5125, silver: 108 };
  
  // 2. Query all enabled, untriggered alerts
  const alerts = await supabase
    .from('price_alerts')
    .select('*')
    .eq('enabled', true)
    .eq('triggered', false);
  
  // 3. Check if any alerts should trigger
  for (const alert of alerts) {
    const currentPrice = prices[alert.metal];
    const shouldTrigger = 
      (alert.direction === 'above' && currentPrice >= alert.target_price) ||
      (alert.direction === 'below' && currentPrice <= alert.target_price);
    
    if (shouldTrigger) {
      // 4. Get user's push token
      const { expo_push_token } = await supabase
        .from('push_tokens')
        .select('expo_push_token')
        .eq('user_id', alert.user_id)
        .single();
      
      // 5. Send push notification via Expo
      await sendPushNotification(expo_push_token, {
        title: `${alert.metal.toUpperCase()} Price Alert`,
        body: `${alert.metal} has ${alert.direction === 'above' ? 'risen to' : 'fallen to'} $${currentPrice}`,
      });
      
      // 6. Mark alert as triggered
      await supabase
        .from('price_alerts')
        .update({ triggered: true, triggered_at: new Date() })
        .eq('id', alert.id);
    }
  }
}

// Run every 5 minutes
setInterval(checkPriceAlerts, 5 * 60 * 1000);
```

### 4. Expo Push Notification Sender

**New Server Component:**
```javascript
// backend/services/pushNotifications.js

const axios = require('axios');

async function sendPushNotification(expoPushToken, { title, body, data = {} }) {
  const message = {
    to: expoPushToken,
    sound: 'default',
    title: title,
    body: body,
    data: data,
    priority: 'high',
  };

  try {
    const response = await axios.post('https://exp.host/--/api/v2/push/send', message, {
      headers: {
        'Accept': 'application/json',
        'Accept-encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
    });
    
    console.log('✅ Push notification sent:', response.data);
    return response.data;
  } catch (error) {
    console.error('❌ Push notification failed:', error.message);
    throw error;
  }
}

module.exports = { sendPushNotification };
```

---

## Quick Fix: Local Notifications (No Backend)

If backend implementation is too complex, here's a simpler client-side solution:

**Use Background Fetch** to check prices locally and trigger local notifications.

**Implementation:**
```javascript
// mobile-app/src/utils/backgroundTasks.js

import * as BackgroundFetch from 'expo-background-fetch';
import * as TaskManager from 'expo-task-manager';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';

const PRICE_ALERT_CHECK_TASK = 'price-alert-check-task';

// Define background task
TaskManager.defineTask(PRICE_ALERT_CHECK_TASK, async () => {
  try {
    // 1. Fetch current spot prices
    const response = await fetch('<API_URL>/api/spot-prices');
    const data = await response.json();
    const prices = { gold: data.gold, silver: data.silver };
    
    // 2. Load price alerts from AsyncStorage
    const alertsJson = await AsyncStorage.getItem('stack_price_alerts');
    const alerts = JSON.parse(alertsJson) || [];
    
    // 3. Check if any alerts should trigger
    for (const alert of alerts) {
      if (!alert.enabled) continue;
      
      const currentPrice = prices[alert.metal];
      const shouldTrigger = 
        (alert.direction === 'above' && currentPrice >= alert.targetPrice) ||
        (alert.direction === 'below' && currentPrice <= alert.targetPrice);
      
      if (shouldTrigger) {
        // 4. Send local notification
        await Notifications.scheduleNotificationAsync({
          content: {
            title: `${alert.metal.toUpperCase()} Price Alert`,
            body: `${alert.metal} has ${alert.direction === 'above' ? 'risen to' : 'fallen to'} $${currentPrice}`,
            sound: true,
          },
          trigger: null, // Trigger immediately
        });
        
        // 5. Mark alert as triggered (or disable it)
        alert.triggered = true;
      }
    }
    
    // Save updated alerts
    await AsyncStorage.setItem('stack_price_alerts', JSON.stringify(alerts));
    
    return BackgroundFetch.BackgroundFetchResult.NewData;
  } catch (error) {
    console.error('Background price check failed:', error);
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
});

// Register background task
export async function registerPriceAlertCheck() {
  await BackgroundFetch.registerTaskAsync(PRICE_ALERT_CHECK_TASK, {
    minimumInterval: 15 * 60, // 15 minutes (iOS minimum)
    stopOnTerminate: false,
    startOnBoot: true,
  });
}
```

**Pros:**
- No backend changes needed
- Works offline (once prices are fetched)
- Simpler to implement

**Cons:**
- Less reliable (OS can kill background tasks)
- iOS limits background fetch frequency (15+ minutes)
- Drains battery if checking too often
- Not guaranteed to run (OS discretion)

---

## Current Code Bug

**File:** `mobile-app/App.js`, line ~1786

```javascript
// Configure for iOS
if (Platform.OS === 'ios') {
  await Notifications.setNotificationChannelAsync('default', {
    name: 'default',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#fbbf24',
  });
}
```

**Bug:** `setNotificationChannelAsync` is **Android-only**, but code checks `Platform.OS === 'ios'`.

**Should be:**
```javascript
// Configure for Android
if (Platform.OS === 'android') {
  await Notifications.setNotificationChannelAsync('default', {
    name: 'default',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#fbbf24',
  });
}
```

---

## Recommendations

### Option 1: Full Backend Implementation (Ideal)
**Effort:** 4-6 hours  
**Reliability:** High  
**Steps:**
1. Create Supabase tables (push_tokens, price_alerts)
2. Add sync logic to mobile app
3. Build backend cron job to check alerts
4. Implement Expo push notification sender

### Option 2: Background Fetch (Quick Fix)
**Effort:** 1-2 hours  
**Reliability:** Medium (OS-dependent)  
**Steps:**
1. Implement background fetch task
2. Check alerts locally
3. Send local notifications

### Option 3: Fix Platform Bug Only
**Effort:** 5 minutes  
**Impact:** Fixes Android notification channel setup  
**Steps:**
1. Change `Platform.OS === 'ios'` to `Platform.OS === 'android'`

---

## Testing Checklist

**After implementation:**
- [ ] Create price alert in app
- [ ] Verify alert saved to backend (if Option 1)
- [ ] Wait for price to hit target OR manually trigger
- [ ] Verify push notification appears on device
- [ ] Test on iOS
- [ ] Test on Android
- [ ] Test with app closed
- [ ] Test with app backgrounded

---

## Conclusion

Push notifications **aren't broken** - they were **never fully implemented**. The feature is UI-complete but missing the critical backend logic to evaluate alerts and send notifications.

**Recommended Path:**
1. Fix the iOS/Android platform bug (5 min)
2. Implement Background Fetch solution for MVP (1-2 hours)
3. Plan full backend implementation for v2

---

**Time to Fix (Option 2):** 1-2 hours  
**Risk:** Low (self-contained feature)  
**Priority:** Medium (feature exists but doesn't work)
