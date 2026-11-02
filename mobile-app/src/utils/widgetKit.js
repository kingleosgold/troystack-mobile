/**
 * WidgetKit Integration Utility
 *
 * Provides functions to update the iOS home screen widget with portfolio data.
 * This is a Gold/Lifetime feature only.
 */

import { NativeModules, Platform } from 'react-native';
import { widgetTime } from './widgetRefresh';

const { WidgetKitModule } = NativeModules;

// Debug logging for native module availability
if (__DEV__) console.log('🔧 [WidgetKit] Module check:', {
  platform: Platform.OS,
  moduleExists: WidgetKitModule !== null && WidgetKitModule !== undefined,
  moduleType: typeof WidgetKitModule,
  moduleMethods: WidgetKitModule ? Object.keys(WidgetKitModule) : 'N/A',
});

/**
 * Check if WidgetKit is available (iOS only)
 */
export const isWidgetKitAvailable = () => {
  const available = Platform.OS === 'ios' && WidgetKitModule !== null && WidgetKitModule !== undefined;
  if (__DEV__) console.log('🔧 [WidgetKit] isWidgetKitAvailable:', available);
  return available;
};

/**
 * Update the widget with current portfolio data
 *
 * @param {Object} data Portfolio data
 * @param {number} data.portfolioValue Total portfolio value in dollars
 * @param {number} data.dailyChangeAmount Today's change in dollars
 * @param {number} data.dailyChangePercent Today's change in percent
 * @param {number} data.goldSpot Current gold spot price
 * @param {number} data.silverSpot Current silver spot price
 * @param {number} data.goldChangeAmount Gold price change from previous day
 * @param {number} data.goldChangePercent Gold price change percent
 * @param {number} data.silverChangeAmount Silver price change from previous day
 * @param {number} data.silverChangePercent Silver price change percent
 * @param {boolean} data.hasSubscription Whether user has Gold/Lifetime access
 */
export const updateWidgetData = async (data) => {
  if (__DEV__) console.log('🔧 [WidgetKit] updateWidgetData called with:', {
    hasSubscription: data.hasSubscription,
    portfolioValue: data.portfolioValue,
  });

  if (!isWidgetKitAvailable()) {
    if (__DEV__) console.log('❌ [WidgetKit] Module not available - widget data NOT synced');
    return false;
  }

  try {
    const widgetData = {
      portfolioValue: data.portfolioValue || 0,
      dailyChangeAmount: data.dailyChangeAmount || 0,
      dailyChangePercent: data.dailyChangePercent || 0,
      goldSpot: data.goldSpot || 0,
      silverSpot: data.silverSpot || 0,
      goldChangeAmount: data.goldChangeAmount || 0,
      goldChangePercent: data.goldChangePercent || 0,
      silverChangeAmount: data.silverChangeAmount || 0,
      silverChangePercent: data.silverChangePercent || 0,
      goldValue: data.goldValue || 0,
      silverValue: data.silverValue || 0,
      platinumValue: data.platinumValue || 0,
      palladiumValue: data.palladiumValue || 0,
      goldOzt: data.goldOzt || 0,
      silverOzt: data.silverOzt || 0,
      platinumOzt: data.platinumOzt || 0,
      palladiumOzt: data.palladiumOzt || 0,
      platinumSpot: data.platinumSpot || 0,
      palladiumSpot: data.palladiumSpot || 0,
      platinumChangeAmount: data.platinumChangeAmount || 0,
      platinumChangePercent: data.platinumChangePercent || 0,
      palladiumChangeAmount: data.palladiumChangeAmount || 0,
      palladiumChangePercent: data.palladiumChangePercent || 0,
      lastUpdated: widgetTime(),
      hasSubscription: data.hasSubscription || false,
      hideValues: data.hideValues || false,
      goldSparkline: data.goldSparkline || [],
      silverSparkline: data.silverSparkline || [],
      platinumSparkline: data.platinumSparkline || [],
      palladiumSparkline: data.palladiumSparkline || [],
      marketsClosed: data.marketsClosed || false,
    };

    // Serialize to JSON and send to native module
    const jsonData = JSON.stringify(widgetData);

    if (__DEV__) console.log('🔧 [WidgetKit] Sending to native module:', jsonData);
    WidgetKitModule.setWidgetData(jsonData);

    if (__DEV__) console.log('✅ [WidgetKit] Widget data sent to native module');
    return true;
  } catch (error) {
    if (__DEV__) console.error('❌ [WidgetKit] Failed to update widget data:', error);
    return false;
  }
};

/**
 * Trigger a refresh of all widget timelines
 * Call this after updating data to ensure widgets refresh immediately
 */
export const refreshWidgets = async () => {
  if (!isWidgetKitAvailable()) {
    return false;
  }

  try {
    WidgetKitModule.reloadAllTimelines();
    if (__DEV__) console.log('Widget timelines refreshed');
    return true;
  } catch (error) {
    if (__DEV__) console.error('Failed to refresh widgets:', error);
    return false;
  }
};

/**
 * Update widget and trigger refresh in one call
 *
 * @param {Object} data Portfolio data (see updateWidgetData for structure)
 */
export const syncWidgetData = async (data) => {
  const updated = await updateWidgetData(data);
  if (updated) {
    // Brief delay to allow cross-process UserDefaults sync before widget reads
    await new Promise(r => setTimeout(r, 100));
    await refreshWidgets();
  }
  return updated;
};

/**
 * Get current widget configurations
 * Returns array of widget info showing which widgets are on home screen
 */
export const getWidgetConfigurations = async () => {
  if (!isWidgetKitAvailable()) {
    return [];
  }

  try {
    const configs = await WidgetKitModule.getCurrentConfigurations();
    return configs;
  } catch (error) {
    if (__DEV__) console.error('Failed to get widget configurations:', error);
    return [];
  }
};

export default {
  isWidgetKitAvailable,
  updateWidgetData,
  refreshWidgets,
  syncWidgetData,
  getWidgetConfigurations,
};
