/**
 * TroyStack - Entitlements Utility
 * RevenueCat entitlement checking functions
 */

import Purchases from 'react-native-purchases';

/**
 * Check if user has Gold entitlement (premium subscription)
 * @returns {Promise<boolean>} True if user has active Gold entitlement
 */
export const hasGoldEntitlement = async () => {
  try {
    const customerInfo = await Purchases.getCustomerInfo();
    // Safety check for entitlements
    const activeEntitlements = customerInfo?.entitlements?.active || {};
    return activeEntitlements['Gold'] !== undefined;
  } catch (error) {
    if (__DEV__) console.log('Error checking Gold entitlement:', error);
    return false;
  }
};

/**
 * Check if user has Silver entitlement
 * Silver subscribers are grandfathered to Gold — this is kept for backward compatibility.
 * @returns {Promise<boolean>} True if user has active Silver entitlement
 */
export const hasSilverEntitlement = async () => {
  try {
    const customerInfo = await Purchases.getCustomerInfo();
    const activeEntitlements = customerInfo?.entitlements?.active || {};
    return activeEntitlements['Silver'] !== undefined;
  } catch (error) {
    if (__DEV__) console.log('Error checking Silver entitlement:', error);
    return false;
  }
};

/**
 * Get all user entitlements
 * @returns {Promise<object>} Customer info with all entitlements
 */
export const getUserEntitlements = async () => {
  try {
    const customerInfo = await Purchases.getCustomerInfo();
    // Safety check for entitlements
    const activeEntitlements = customerInfo?.entitlements?.active || {};
    return {
      hasGold: activeEntitlements['Gold'] !== undefined,
      hasSilver: activeEntitlements['Silver'] !== undefined,
      hasLifetime: activeEntitlements['Lifetime'] !== undefined,
      entitlements: activeEntitlements,
      originalAppUserId: customerInfo?.originalAppUserId || null,
    };
  } catch (error) {
    if (__DEV__) console.log('Error getting user entitlements:', error);
    return {
      hasGold: false,
      hasSilver: false,
      hasLifetime: false,
      entitlements: {},
      originalAppUserId: null,
    };
  }
};

/**
 * Initialize RevenueCat Purchases SDK
 * @param {string} apiKey - RevenueCat API key
 * @param {string} [appUserId] - Optional user ID to tie purchases to a specific account (e.g., Supabase user ID)
 * @returns {Promise<boolean>} True if initialization succeeded
 */
export const initializePurchases = async (apiKey, appUserId = null) => {
  try {
    // Validate apiKey before calling configure
    if (!apiKey || typeof apiKey !== 'string' || apiKey.length < 10) {
      console.error('Invalid RevenueCat API key provided');
      return false;
    }

    // Check if Purchases is available
    if (!Purchases || typeof Purchases.configure !== 'function') {
      console.error('RevenueCat Purchases SDK not available');
      return false;
    }

    const config = { apiKey };
    
    // If appUserId provided, tie purchases to this user account
    if (appUserId && typeof appUserId === 'string') {
      config.appUserID = appUserId;
      if (__DEV__) console.log('🔧 RevenueCat: Tying purchases to user ID:', appUserId.substring(0, 8) + '...');
    } else {
      if (__DEV__) console.log('🔧 RevenueCat: Using anonymous device ID (no user ID provided)');
    }

    await Purchases.configure(config);
    if (__DEV__) console.log('✅ RevenueCat initialized successfully');
    return true;
  } catch (error) {
    // Log error details but don't crash
    console.error('Failed to initialize RevenueCat:', error?.message || error);
    return false;
  }
};

/**
 * Log in to RevenueCat with a user ID (for transitioning existing anonymous users)
 * @param {string} appUserId - User ID to identify this user (e.g., Supabase user ID)
 * @returns {Promise<object>} Customer info after login
 */
export const loginRevenueCat = async (appUserId) => {
  try {
    if (!appUserId || typeof appUserId !== 'string') {
      throw new Error('Invalid user ID provided');
    }

    if (__DEV__) console.log('🔐 RevenueCat: Logging in with user ID:', appUserId.substring(0, 8) + '...');
    const customerInfo = await Purchases.logIn(appUserId);
    if (__DEV__) console.log('✅ RevenueCat: User logged in successfully');
    return customerInfo;
  } catch (error) {
    console.error('Failed to login to RevenueCat:', error?.message || error);
    throw error;
  }
};

/**
 * Log out from RevenueCat (for when user signs out)
 * @returns {Promise<object>} Customer info after logout
 */
export const logoutRevenueCat = async () => {
  try {
    if (__DEV__) console.log('🚪 RevenueCat: Logging out...');
    const customerInfo = await Purchases.logOut();
    if (__DEV__) console.log('✅ RevenueCat: User logged out successfully');
    return customerInfo;
  } catch (error) {
    console.error('Failed to logout from RevenueCat:', error?.message || error);
    throw error;
  }
};

/**
 * Restore previous purchases
 * @returns {Promise<{hasGold: boolean, hasSilver: boolean, hasLifetime: boolean}>} Restored entitlements
 */
export const restorePurchases = async () => {
  try {
    const customerInfo = await Purchases.restorePurchases();
    // Safety check for entitlements
    const activeEntitlements = customerInfo?.entitlements?.active || {};
    return {
      hasGold: activeEntitlements['Gold'] !== undefined,
      hasSilver: activeEntitlements['Silver'] !== undefined,
      hasLifetime: activeEntitlements['Lifetime'] !== undefined,
    };
  } catch (error) {
    console.error('Error restoring purchases:', error);
    throw error;
  }
};
