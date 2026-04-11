/**
 * Background Tasks for TroyStack
 *
 * Handles background price fetching to keep the app and widget data fresh
 * even when the app is closed.
 */

import * as BackgroundFetch from 'expo-background-fetch';
import * as TaskManager from 'expo-task-manager';
import { Platform, NativeModules } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Task identifier - must match app.json BGTaskSchedulerPermittedIdentifiers
export const BACKGROUND_FETCH_TASK = 'background-fetch-prices';

// API base URL
const API_BASE_URL = 'https://api.stacktrackergold.com';

// Get the WidgetKit native module
const { WidgetKitModule } = NativeModules;

/**
 * Fetch spot prices from the backend cache
 */
const fetchSpotPricesBackground = async () => {
  try {
    if (__DEV__) console.log('[BackgroundFetch] Fetching spot prices...');

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout for background

    const response = await fetch(`${API_BASE_URL}/v1/prices`, {
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    const raw = await response.json();

    if (raw.prices) {
      const goldPrice = raw.prices.gold?.price;
      const silverPrice = raw.prices.silver?.price;

      if (__DEV__) console.log(`[BackgroundFetch] Prices received: Gold $${goldPrice}, Silver $${silverPrice}`);

      // Save to AsyncStorage for app to use on next open
      if (silverPrice && silverPrice > 10) {
        await AsyncStorage.setItem('stack_silver_spot', silverPrice.toString());
      }
      if (goldPrice && goldPrice > 1000) {
        await AsyncStorage.setItem('stack_gold_spot', goldPrice.toString());
      }
      if (raw.timestamp) {
        await AsyncStorage.setItem('stack_price_timestamp', raw.timestamp);
      }

      // Compute and save change data from change_pct
      const computeChange = (metalData) => {
        if (!metalData) return { amount: 0, percent: 0, prevClose: 0 };
        const pct = metalData.change_pct || 0;
        const price = metalData.price || 0;
        const prevClose = pct !== 0 ? price / (1 + pct / 100) : price;
        return { amount: price - prevClose, percent: pct, prevClose };
      };
      const change = {
        gold: computeChange(raw.prices.gold),
        silver: computeChange(raw.prices.silver),
        platinum: computeChange(raw.prices.platinum),
        palladium: computeChange(raw.prices.palladium),
      };
      await AsyncStorage.setItem('stack_spot_change', JSON.stringify(change));

      return {
        gold: goldPrice,
        silver: silverPrice,
        change,
        timestamp: raw.timestamp,
      };
    }

    if (__DEV__) console.log('[BackgroundFetch] API returned no prices data');
    return null;
  } catch (error) {
    if (__DEV__) console.error('[BackgroundFetch] Failed to fetch prices:', error.message);
    return null;
  }
};

/**
 * Update the widget with fresh data
 */
const updateWidgetBackground = async (priceData) => {
  if (Platform.OS !== 'ios' || !WidgetKitModule) {
    if (__DEV__) console.log('[BackgroundFetch] Widget update skipped (not iOS or module unavailable)');
    return;
  }

  try {
    // Load portfolio data from AsyncStorage
    const [silverItemsStr, goldItemsStr, hasGoldStr, hasLifetimeStr] = await Promise.all([
      AsyncStorage.getItem('stack_silver'),
      AsyncStorage.getItem('stack_gold'),
      AsyncStorage.getItem('stack_has_gold'),
      AsyncStorage.getItem('stack_has_lifetime'),
    ]);

    const silverItems = silverItemsStr ? JSON.parse(silverItemsStr) : [];
    const goldItems = goldItemsStr ? JSON.parse(goldItemsStr) : [];
    const hasGold = hasGoldStr === 'true';
    const hasLifetime = hasLifetimeStr === 'true';

    // Calculate totals
    const totalSilverOzt = silverItems.reduce((sum, item) => sum + (item.ozt * (item.quantity || 1)), 0);
    const totalGoldOzt = goldItems.reduce((sum, item) => sum + (item.ozt * (item.quantity || 1)), 0);

    const silverValue = totalSilverOzt * priceData.silver;
    const goldValue = totalGoldOzt * priceData.gold;
    const totalMeltValue = silverValue + goldValue;

    // Load midnight snapshot for daily change calculation
    const midnightSnapshotStr = await AsyncStorage.getItem('stack_midnight_snapshot');
    let dailyChangeAmount = 0;
    let dailyChangePercent = 0;

    if (midnightSnapshotStr) {
      try {
        const midnight = JSON.parse(midnightSnapshotStr);
        if (midnight.totalMeltValue && midnight.totalMeltValue > 0) {
          dailyChangeAmount = totalMeltValue - midnight.totalMeltValue;
          dailyChangePercent = (dailyChangeAmount / midnight.totalMeltValue) * 100;
        }
      } catch (e) {
        if (__DEV__) console.log('[BackgroundFetch] Error parsing midnight snapshot');
      }
    }

    // Prepare widget data
    const widgetData = {
      portfolioValue: totalMeltValue,
      dailyChangeAmount: dailyChangeAmount,
      dailyChangePercent: dailyChangePercent,
      goldSpot: priceData.gold,
      silverSpot: priceData.silver,
      goldChangeAmount: priceData.change?.gold?.amount || 0,
      goldChangePercent: priceData.change?.gold?.percent || 0,
      silverChangeAmount: priceData.change?.silver?.amount || 0,
      silverChangePercent: priceData.change?.silver?.percent || 0,
      lastUpdated: new Date().toISOString(),
      hasSubscription: hasGold || hasLifetime,
    };

    // Send to native module
    const jsonData = JSON.stringify(widgetData);
    if (__DEV__) console.log('[BackgroundFetch] Updating widget with data');
    WidgetKitModule.setWidgetData(jsonData);
    WidgetKitModule.reloadAllTimelines();

    if (__DEV__) console.log('[BackgroundFetch] Widget updated successfully');
  } catch (error) {
    if (__DEV__) console.error('[BackgroundFetch] Failed to update widget:', error.message);
  }
};

/**
 * Define the background fetch task
 * This runs when iOS wakes the app in the background
 */
try {
  TaskManager.defineTask(BACKGROUND_FETCH_TASK, async () => {
    if (__DEV__) console.log('[BackgroundFetch] Task started');

    try {
      const priceData = await fetchSpotPricesBackground();

      if (priceData) {
        await updateWidgetBackground(priceData);
        if (__DEV__) console.log('[BackgroundFetch] Task completed successfully');
        return BackgroundFetch.BackgroundFetchResult.NewData;
      }

      if (__DEV__) console.log('[BackgroundFetch] Task completed - no new data');
      return BackgroundFetch.BackgroundFetchResult.NoData;
    } catch (error) {
      if (__DEV__) console.error('[BackgroundFetch] Task failed:', error.message);
      return BackgroundFetch.BackgroundFetchResult.Failed;
    }
  });
} catch (e) {
  if (__DEV__) console.log('[BackgroundFetch] Task definition skipped:', e?.message);
}

/**
 * Register the background fetch task with iOS
 * Call this once when the app starts
 */
export const registerBackgroundFetch = async () => {
  if (Platform.OS !== 'ios') {
    if (__DEV__) console.log('[BackgroundFetch] Skipping registration (not iOS)');
    return false;
  }

  try {
    // Check if the task is already registered
    const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_FETCH_TASK);

    if (isRegistered) {
      if (__DEV__) console.log('[BackgroundFetch] Task already registered');
      return true;
    }

    // Register the background fetch task
    await BackgroundFetch.registerTaskAsync(BACKGROUND_FETCH_TASK, {
      minimumInterval: 15 * 60, // 15 minutes (minimum allowed by iOS)
      stopOnTerminate: false,   // Continue after app is terminated
      startOnBoot: true,        // Start after device reboot
    });

    if (__DEV__) console.log('[BackgroundFetch] Task registered successfully');
    return true;
  } catch (error) {
    if (__DEV__) console.error('[BackgroundFetch] Failed to register task:', error.message);
    return false;
  }
};

/**
 * Unregister the background fetch task
 */
export const unregisterBackgroundFetch = async () => {
  try {
    const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_FETCH_TASK);

    if (isRegistered) {
      await BackgroundFetch.unregisterTaskAsync(BACKGROUND_FETCH_TASK);
      if (__DEV__) console.log('[BackgroundFetch] Task unregistered');
    }

    return true;
  } catch (error) {
    if (__DEV__) console.error('[BackgroundFetch] Failed to unregister task:', error.message);
    return false;
  }
};

/**
 * Check the current status of background fetch
 */
export const getBackgroundFetchStatus = async () => {
  if (Platform.OS !== 'ios') {
    return { available: false, status: 'Not iOS' };
  }

  try {
    const status = await BackgroundFetch.getStatusAsync();
    const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_FETCH_TASK);

    let statusText;
    switch (status) {
      case BackgroundFetch.BackgroundFetchStatus.Restricted:
        statusText = 'Restricted';
        break;
      case BackgroundFetch.BackgroundFetchStatus.Denied:
        statusText = 'Denied';
        break;
      case BackgroundFetch.BackgroundFetchStatus.Available:
        statusText = 'Available';
        break;
      default:
        statusText = 'Unknown';
    }

    return {
      available: status === BackgroundFetch.BackgroundFetchStatus.Available,
      status: statusText,
      isRegistered,
    };
  } catch (error) {
    if (__DEV__) console.error('[BackgroundFetch] Failed to get status:', error.message);
    return { available: false, status: 'Error', error: error.message };
  }
};

export default {
  registerBackgroundFetch,
  unregisterBackgroundFetch,
  getBackgroundFetchStatus,
  BACKGROUND_FETCH_TASK,
};
