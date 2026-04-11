/**
 * TroyStack - Subscription Paywall Component
 * Single Gold tier paywall with RevenueCat integration
 * Silver subscribers are grandfathered to Gold — no Silver tier shown.
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ScrollView,
  ActivityIndicator,
  Alert,
  Platform,
  Linking,
} from 'react-native';
import Purchases from 'react-native-purchases';
import * as Haptics from 'expo-haptics';
import { restorePurchases } from '../utils/entitlements';
import TroyCoinIcon from './TroyCoinIcon';

const PRIVACY_URL = 'https://api.stacktrackergold.com/privacy';
const TERMS_URL = 'https://api.stacktrackergold.com/terms';

const GOLD_COLOR = '#fbbf24';

const GOLD_FEATURES = [
  { icon: 'troy', text: 'Unlimited Troy AI Chat' },
  { icon: 'troy', text: 'Troy Remembers (conversation history)' },
  { icon: '📰', text: 'Daily Market Brief' },
  { icon: '🧠', text: 'Portfolio Intelligence' },
  { icon: '📸', text: 'Unlimited Receipt Scanning' },
  { icon: '🔍', text: 'Dealer Price Comparison' },
  { icon: '📊', text: 'Advanced Analytics' },
  { icon: '🏦', text: 'COMEX Vault Watch' },
];

const GoldPaywall = ({ visible, onClose, onPurchaseSuccess, userTier = 'free' }) => {
  const [offering, setOffering] = useState(null);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState(null);
  const [restoring, setRestoring] = useState(false);
  const [billingCycle, setBillingCycle] = useState('yearly'); // 'monthly' or 'yearly'

  useEffect(() => {
    if (visible) {
      loadOfferings();
    }
  }, [visible]);

  const loadOfferings = async () => {
    try {
      setLoading(true);
      const offerings = await Purchases.getOfferings();

      if (offerings.current) {
        setOffering(offerings.current);
      } else {
        if (__DEV__) console.log('No offerings available');
        setOffering(null);
      }
    } catch (error) {
      if (__DEV__) console.log('Error loading offerings:', error);
      setOffering(null);
    } finally {
      setLoading(false);
    }
  };

  const handlePurchase = async (packageToPurchase) => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      setPurchasing(packageToPurchase.identifier);
      const { customerInfo } = await Purchases.purchasePackage(packageToPurchase);

      const activeEntitlements = customerInfo?.entitlements?.active || {};
      if (activeEntitlements['Gold'] || activeEntitlements['Lifetime'] || activeEntitlements['Silver']) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert(
          'Welcome to Gold!',
          'Your subscription is now active. Enjoy the full Stack Tracker experience!',
          [{ text: 'Start Stacking', onPress: () => {
            onPurchaseSuccess?.();
            onClose();
          }}]
        );
      }
    } catch (error) {
      if (!error.userCancelled) {
        if (__DEV__) console.error('Purchase error:', error);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        Alert.alert('Purchase Failed', error.message);
      }
    } finally {
      setPurchasing(null);
    }
  };

  const handleRestore = async () => {
    try {
      setRestoring(true);
      const restored = await restorePurchases();

      if (restored.hasGold || restored.hasSilver) {
        Alert.alert(
          'Purchases Restored!',
          'Your subscription has been restored.',
          [{ text: 'Continue', onPress: () => {
            onPurchaseSuccess?.();
            onClose();
          }}]
        );
      } else {
        Alert.alert('No Purchases Found', 'No active subscriptions were found to restore.');
      }
    } catch (error) {
      if (__DEV__) console.error('Restore error:', error);
      Alert.alert('Restore Failed', 'Could not restore purchases. Please try again.');
    } finally {
      setRestoring(false);
    }
  };

  const getPackage = (cycle) => {
    if (!offering) return null;
    if (cycle === 'lifetime') return offering.lifetime || null;
    return cycle === 'yearly' ? (offering.annual || null) : (offering.monthly || null);
  };

  const renderSubscriptionCard = () => {
    const pkg = getPackage(billingCycle);
    if (!pkg) return null;

    const isPurchasing = purchasing === pkg.identifier;

    return (
      <View style={[styles.tierCard, { borderColor: GOLD_COLOR, borderWidth: 2 }]}>
        <View style={[styles.tierBadge, { backgroundColor: GOLD_COLOR }]}>
          <Text style={styles.tierBadgeText}>MOST POPULAR</Text>
        </View>

        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <Text style={{ fontSize: 24 }}>👑</Text>
          <Text style={[styles.tierLabel, { color: GOLD_COLOR }]}>Gold</Text>
        </View>

        {/* Price */}
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4, marginBottom: 4 }}>
          <Text style={[styles.tierPrice, { color: '#fff' }]}>{pkg.product.priceString}</Text>
          <Text style={{ color: '#71717a', fontSize: 14 }}>/{billingCycle === 'yearly' ? 'yr' : 'mo'}</Text>
        </View>

        {billingCycle === 'yearly' && (
          <Text style={{ color: '#71717a', fontSize: 12, marginBottom: 8 }}>
            That's {(pkg.product.price / 12).toFixed(2)}/mo
          </Text>
        )}

        {/* Features */}
        <View style={{ marginTop: 8, marginBottom: 12 }}>
          {GOLD_FEATURES.map((f, i) => (
            <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 5 }}>
              {f.icon === 'troy' ? (
                <View style={{ width: 18 }}><TroyCoinIcon size={16} /></View>
              ) : (
                <Text style={{ fontSize: 14, width: 18 }}>{f.icon}</Text>
              )}
              <Text style={{ color: '#d4d4d8', fontSize: 13, flex: 1 }}>{f.text}</Text>
            </View>
          ))}
        </View>

        {/* CTA Button */}
        {isPurchasing ? (
          <ActivityIndicator color={GOLD_COLOR} style={{ marginTop: 8, marginBottom: 8 }} />
        ) : (
          <TouchableOpacity
            style={[styles.tierCTA, { backgroundColor: GOLD_COLOR }]}
            onPress={() => handlePurchase(pkg)}
            disabled={loading}
          >
            <Text style={styles.tierCTAText}>Try Gold Free for 7 Days</Text>
          </TouchableOpacity>
        )}
        <Text style={{ color: '#71717a', fontSize: 11, textAlign: 'center', marginTop: 6 }}>
          Then {pkg.product.priceString}/{billingCycle === 'yearly' ? 'yr' : 'mo'} · Cancel anytime
        </Text>
      </View>
    );
  };

  const renderLifetimeCard = () => {
    const pkg = getPackage('lifetime');
    if (!pkg) return null;

    const isPurchasing = purchasing === pkg.identifier;

    return (
      <View style={[styles.tierCard, { borderColor: '#22c55e', borderWidth: 2 }]}>
        <View style={[styles.tierBadge, { backgroundColor: '#22c55e' }]}>
          <Text style={styles.tierBadgeText}>BEST VALUE</Text>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <Text style={{ fontSize: 24 }}>💎</Text>
          <Text style={[styles.tierLabel, { color: '#22c55e' }]}>Lifetime</Text>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4, marginBottom: 4 }}>
          <Text style={[styles.tierPrice, { color: '#fff' }]}>{pkg.product.priceString}</Text>
          <Text style={{ color: '#71717a', fontSize: 14 }}> one-time</Text>
        </View>

        <Text style={{ color: '#a1a1aa', fontSize: 13, marginBottom: 12 }}>
          All Gold features forever. No subscription.
        </Text>

        {isPurchasing ? (
          <ActivityIndicator color="#22c55e" style={{ marginTop: 8, marginBottom: 8 }} />
        ) : (
          <TouchableOpacity
            style={[styles.tierCTA, { backgroundColor: '#22c55e' }]}
            onPress={() => handlePurchase(pkg)}
            disabled={loading}
          >
            <Text style={styles.tierCTAText}>Buy Once, Stack Forever</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>Upgrade to Gold</Text>
            <Text style={styles.subtitle}>
              AI-powered intelligence for serious stackers
            </Text>
            <TouchableOpacity
              onPress={onClose}
              style={styles.closeButton}
              hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}
            >
              <Text style={styles.closeButtonText}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Billing Toggle */}
          <View style={styles.billingToggle}>
            <TouchableOpacity
              style={[styles.toggleOption, billingCycle === 'monthly' && styles.toggleActive]}
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setBillingCycle('monthly'); }}
            >
              <Text style={[styles.toggleText, billingCycle === 'monthly' && styles.toggleTextActive]}>Monthly</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.toggleOption, billingCycle === 'yearly' && styles.toggleActive]}
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setBillingCycle('yearly'); }}
            >
              <Text style={[styles.toggleText, billingCycle === 'yearly' && styles.toggleTextActive]}>Yearly</Text>
              <View style={styles.saveBadge}>
                <Text style={styles.saveBadgeText}>SAVE 33%</Text>
              </View>
            </TouchableOpacity>
          </View>

          {/* Tier Cards */}
          <ScrollView
            style={styles.packagesScroll}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 16 }}
          >
            {loading ? (
              <ActivityIndicator size="large" color={GOLD_COLOR} style={{ marginTop: 40 }} />
            ) : offering ? (
              <>
                {renderSubscriptionCard()}
                {renderLifetimeCard()}
              </>
            ) : (
              <View style={styles.errorContainer}>
                <Text style={styles.errorIcon}>⚠️</Text>
                <Text style={styles.errorTitle}>Unable to Load Subscriptions</Text>
                <Text style={styles.errorMessage}>
                  Could not connect to the subscription service. Please check your internet connection and try again.
                </Text>
                <TouchableOpacity style={styles.retryButton} onPress={loadOfferings}>
                  <Text style={styles.retryButtonText}>Retry</Text>
                </TouchableOpacity>
              </View>
            )}
          </ScrollView>

          {/* Restore Purchases */}
          <TouchableOpacity
            onPress={handleRestore}
            style={styles.restoreButtonProminent}
            disabled={restoring}
          >
            {restoring ? (
              <ActivityIndicator size="small" color={GOLD_COLOR} />
            ) : (
              <Text style={styles.restoreButtonProminentText}>Restore Purchases</Text>
            )}
          </TouchableOpacity>

          {/* Legal Links */}
          <View style={styles.legalLinks}>
            <TouchableOpacity onPress={() => Linking.openURL(PRIVACY_URL)}>
              <Text style={styles.legalLinkText}>Privacy Policy</Text>
            </TouchableOpacity>
            <Text style={styles.legalSeparator}>|</Text>
            <TouchableOpacity onPress={() => Linking.openURL(TERMS_URL)}>
              <Text style={styles.legalLinkText}>Terms of Use</Text>
            </TouchableOpacity>
          </View>

          {/* Footer */}
          <Text style={styles.footer}>
            Subscription automatically renews. Cancel anytime in App Store or Google Play.
          </Text>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    justifyContent: 'flex-end',
  },
  container: {
    backgroundColor: '#1a1a2e',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 24,
    paddingBottom: Platform.OS === 'ios' ? 34 : 24,
    maxHeight: '92%',
  },
  header: {
    alignItems: 'center',
    paddingHorizontal: 24,
    marginBottom: 16,
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 15,
    color: '#a1a1aa',
    textAlign: 'center',
  },
  closeButton: {
    position: 'absolute',
    top: 0,
    right: 24,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButtonText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '600',
  },
  billingToggle: {
    flexDirection: 'row',
    marginHorizontal: 24,
    marginBottom: 16,
    backgroundColor: '#27293d',
    borderRadius: 10,
    padding: 3,
  },
  toggleOption: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
  },
  toggleActive: {
    backgroundColor: '#3a3c52',
  },
  toggleText: {
    color: '#71717a',
    fontSize: 15,
    fontWeight: '600',
  },
  toggleTextActive: {
    color: '#fff',
  },
  saveBadge: {
    backgroundColor: '#22c55e',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  saveBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
  },
  packagesScroll: {
    paddingHorizontal: 24,
    maxHeight: '55%',
  },
  tierCard: {
    backgroundColor: '#27293d',
    borderRadius: 16,
    padding: 18,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: 'transparent',
    position: 'relative',
  },
  tierBadge: {
    position: 'absolute',
    top: -10,
    right: 16,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 10,
  },
  tierBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#1a1a2e',
  },
  tierLabel: {
    fontSize: 22,
    fontWeight: '700',
  },
  tierPrice: {
    fontSize: 28,
    fontWeight: '700',
  },
  tierCTA: {
    paddingVertical: 13,
    borderRadius: 10,
    alignItems: 'center',
  },
  tierCTAText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1a1a2e',
  },
  legalLinks: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 12,
    gap: 8,
  },
  legalLinkText: {
    fontSize: 13,
    color: '#a1a1aa',
    textDecorationLine: 'underline',
  },
  legalSeparator: {
    fontSize: 13,
    color: '#52525b',
  },
  restoreButtonProminent: {
    marginHorizontal: 24,
    marginTop: 12,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: '#fbbf24',
    alignItems: 'center',
  },
  restoreButtonProminentText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fbbf24',
  },
  footer: {
    fontSize: 11,
    color: '#71717a',
    textAlign: 'center',
    paddingHorizontal: 24,
    marginTop: 6,
  },
  errorContainer: {
    alignItems: 'center',
    padding: 32,
    marginTop: 20,
  },
  errorIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 12,
    textAlign: 'center',
  },
  errorMessage: {
    fontSize: 15,
    color: '#a1a1aa',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
  },
  retryButton: {
    backgroundColor: '#fbbf24',
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 8,
  },
  retryButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1a1a2e',
  },
});

export default GoldPaywall;
