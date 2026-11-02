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
import { WIDGET_PAYLOAD_KEY, backgroundWidgetPayload, heldFromStored } from './widgetRefresh';
import { readSpotReply, spotSavePairs, spotWidgetPrices } from './spotReply';

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

    // The same read the app does. A reply where no metal clears its floor is
    // a failed fetch: no spot, no time and no widget change is saved from it.
    const reply = readSpotReply(raw);
    if (reply) {
      if (__DEV__) console.log(`[BackgroundFetch] Prices received: Gold $${reply.spots.gold}, Silver $${reply.spots.silver}`);

      // Saved for the app to use on next open
      await AsyncStorage.multiSet(spotSavePairs(reply, raw.timestamp));

      return {
        prices: spotWidgetPrices(reply, raw),
        timestamp: raw.timestamp,
      };
    }

    if (__DEV__) console.log('[BackgroundFetch] API returned no usable prices');
    return null;
  } catch (error) {
    if (__DEV__) console.error('[BackgroundFetch] Failed to fetch prices:', error.message);
    return null;
  }
};

/**
 * Update the widget with fresh prices. Starts from the last picture the app
 * sent, so the subscription, Hide Values, every metal's ounces and the
 * sparklines stay as the app set them. With no saved picture (the app hasn't
 * synced the widget yet, or the user signed out) the widget is left alone.
 */
const updateWidgetBackground = async (priceData) => {
  if (Platform.OS !== 'ios' || !WidgetKitModule) {
    if (__DEV__) console.log('[BackgroundFetch] Widget update skipped (not iOS or module unavailable)');
    return;
  }

  try {
    const [savedStr, silverStr, goldStr, platinumStr, palladiumStr] = await Promise.all([
      AsyncStorage.getItem(WIDGET_PAYLOAD_KEY),
      AsyncStorage.getItem('stack_silver'),
      AsyncStorage.getItem('stack_gold'),
      AsyncStorage.getItem('stack_platinum'),
      AsyncStorage.getItem('stack_palladium'),
    ]);
    let saved = null;
    try { saved = savedStr ? JSON.parse(savedStr) : null; } catch { saved = null; }
    // The holdings as stored now, since they can change while prices aren't
    // live and the app hasn't synced the widget since
    const held = heldFromStored({ silver: silverStr, gold: goldStr, platinum: platinumStr, palladium: palladiumStr }) || undefined;
    const widgetData = backgroundWidgetPayload({ saved, prices: priceData.prices, held });
    if (!widgetData) {
      if (__DEV__) console.log('[BackgroundFetch] Widget update skipped (no saved widget picture or no usable price)');
      return;
    }

    // Send to native module
    const jsonData = JSON.stringify(widgetData);
    if (__DEV__) console.log('[BackgroundFetch] Updating widget with data');
    WidgetKitModule.setWidgetData(jsonData);
    WidgetKitModule.reloadAllTimelines();
    await AsyncStorage.setItem(WIDGET_PAYLOAD_KEY, jsonData);

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
