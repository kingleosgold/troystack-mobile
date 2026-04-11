import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../contexts/AuthContext';
import { ProfileIcon, GoogleLogo, AppleLogo } from '../components/icons';
import { logoutRevenueCat } from '../utils/entitlements';

interface AccountScreenProps {
  onClose: () => void;
  onSignOut: () => void;
  hasGold: boolean;
  hasLifetime: boolean;
  colors: {
    gold: string;
    text: string;
    muted: string;
    background: string;
    cardBg: string;
    border: string;
    success: string;
    error: string;
  };
}

export default function AccountScreen({
  onClose,
  onSignOut,
  hasGold,
  hasLifetime,
  colors,
}: AccountScreenProps) {
  const { user, linkedProviders, linkWithGoogle, linkWithApple, signOut } = useAuth();

  const email = user?.email || 'Unknown';

  const getTierName = () => {
    if (hasLifetime) return 'Lifetime';
    if (hasGold) return 'Gold';
    return 'Free';
  };

  const getTierColor = () => {
    if (hasLifetime) return '#a855f7'; // Purple for lifetime
    if (hasGold) return colors.gold;
    return colors.muted;
  };

  const handleSignOut = () => {
    // Authenticated users sign out immediately — no confirmation needed
    onSignOut();
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete Account',
      'This will permanently delete your account and all synced data. This action cannot be undone.\n\nTo delete your account, please contact support@troystack.com',
      [{ text: 'OK' }]
    );
  };

  const handleLinkGoogle = async () => {
    const { error } = await linkWithGoogle();
    if (error && error.message !== 'Linking cancelled') {
      Alert.alert('Link Failed', error.message);
    }
  };

  const handleLinkApple = async () => {
    const { error } = await linkWithApple();
    if (error && error.message !== 'Linking cancelled') {
      Alert.alert('Link Failed', error.message);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onClose} style={styles.closeButton}>
          <Text style={[styles.closeButtonText, { color: colors.gold }]}>Done</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Account</Text>
        <View style={styles.closeButton} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Profile Section */}
        <View style={[styles.profileSection, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
          <View style={[styles.profileIconContainer, { borderColor: colors.gold }]}>
            <ProfileIcon size={48} color={colors.gold} />
          </View>
          <Text style={[styles.email, { color: colors.text }]}>{email}</Text>
          <View style={[styles.tierBadge, { backgroundColor: getTierColor() + '20', borderColor: getTierColor() }]}>
            <Text style={[styles.tierText, { color: getTierColor() }]}>{getTierName()} Member</Text>
          </View>
        </View>

        {/* Subscription Section */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.muted }]}>SUBSCRIPTION</Text>
          <View style={[styles.card, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
            <View style={styles.row}>
              <Text style={[styles.rowLabel, { color: colors.text }]}>Current Plan</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={[styles.rowValue, { color: getTierColor(), fontWeight: '600' }]}>
                  {getTierName()}
                </Text>
                {(hasGold || hasLifetime) && (
                  <Text style={{ fontSize: 16 }}>✨</Text>
                )}
              </View>
            </View>
            {!hasGold && !hasLifetime && (
              <View style={[styles.upgradeHint, { borderTopColor: colors.border }]}>
                <Text style={[styles.upgradeText, { color: colors.muted }]}>
                  Upgrade to Gold for unlimited scans and iCloud sync
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* Linked Accounts Section */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.muted }]}>LINKED ACCOUNTS</Text>
          <View style={[styles.card, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
            {/* Google */}
            <View style={[styles.row, styles.providerRow]}>
              <View style={styles.providerInfo}>
                <View style={[styles.providerIcon, { backgroundColor: '#fff', borderColor: colors.border }]}>
                  <GoogleLogo size={18} />
                </View>
                <Text style={[styles.rowLabel, { color: colors.text }]}>Google</Text>
              </View>
              {linkedProviders.google ? (
                <View style={styles.linkedBadge}>
                  <Text style={[styles.linkedText, { color: colors.success }]}>Linked</Text>
                  <Text style={{ color: colors.success, fontSize: 14 }}>✓</Text>
                </View>
              ) : (
                <TouchableOpacity style={[styles.linkButton, { borderColor: colors.border }]} onPress={handleLinkGoogle}>
                  <Text style={[styles.linkButtonText, { color: colors.gold }]}>Link</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Apple (iOS only) */}
            {Platform.OS === 'ios' && (
              <View style={[styles.row, styles.providerRow, { borderTopWidth: 1, borderTopColor: colors.border }]}>
                <View style={styles.providerInfo}>
                  <View style={[styles.providerIcon, { backgroundColor: '#000', borderColor: colors.border }]}>
                    <AppleLogo size={18} color="#fff" />
                  </View>
                  <Text style={[styles.rowLabel, { color: colors.text }]}>Apple</Text>
                </View>
                {linkedProviders.apple ? (
                  <View style={styles.linkedBadge}>
                    <Text style={[styles.linkedText, { color: colors.success }]}>Linked</Text>
                    <Text style={{ color: colors.success, fontSize: 14 }}>✓</Text>
                  </View>
                ) : (
                  <TouchableOpacity style={[styles.linkButton, { borderColor: colors.border }]} onPress={handleLinkApple}>
                    <Text style={[styles.linkButtonText, { color: colors.gold }]}>Link</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}

            {/* Email */}
            <View style={[styles.row, styles.providerRow, { borderTopWidth: 1, borderTopColor: colors.border }]}>
              <View style={styles.providerInfo}>
                <View style={[styles.providerIcon, { backgroundColor: colors.gold + '20', borderColor: colors.gold + '40' }]}>
                  <Text style={{ fontSize: 14 }}>✉️</Text>
                </View>
                <Text style={[styles.rowLabel, { color: colors.text }]}>Email</Text>
              </View>
              {linkedProviders.email ? (
                <View style={styles.linkedBadge}>
                  <Text style={[styles.linkedText, { color: colors.success }]}>Linked</Text>
                  <Text style={{ color: colors.success, fontSize: 14 }}>✓</Text>
                </View>
              ) : (
                <Text style={[styles.notLinkedText, { color: colors.muted }]}>Not linked</Text>
              )}
            </View>
          </View>
        </View>

        {/* Sign Out Button */}
        <TouchableOpacity
          style={[styles.signOutButton, { backgroundColor: colors.cardBg, borderColor: colors.border }]}
          onPress={handleSignOut}
        >
          <Text style={[styles.signOutText, { color: colors.error }]}>Sign Out</Text>
        </TouchableOpacity>

        {/* Delete Account */}
        <TouchableOpacity style={styles.deleteButton} onPress={handleDeleteAccount}>
          <Text style={[styles.deleteText, { color: colors.muted }]}>Delete Account</Text>
        </TouchableOpacity>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={[styles.footerText, { color: colors.muted }]}>
            Your data is encrypted and synced securely.{'\n'}We never sell your data to third parties.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
  },
  closeButton: {
    width: 60,
  },
  closeButtonText: {
    fontSize: 17,
    fontWeight: '600',
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
  },
  profileSection: {
    alignItems: 'center',
    paddingVertical: 32,
    marginTop: 16,
    borderRadius: 16,
    borderWidth: 1,
  },
  profileIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  email: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 12,
  },
  tierBadge: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
  },
  tierText: {
    fontSize: 14,
    fontWeight: '600',
  },
  section: {
    marginTop: 24,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 8,
    marginLeft: 4,
    letterSpacing: 0.5,
  },
  card: {
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  rowLabel: {
    fontSize: 16,
  },
  rowValue: {
    fontSize: 16,
  },
  providerRow: {
    paddingVertical: 12,
  },
  providerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  providerIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  linkedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  linkedText: {
    fontSize: 14,
    fontWeight: '500',
  },
  notLinkedText: {
    fontSize: 14,
  },
  linkButton: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  linkButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  upgradeHint: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
  },
  upgradeText: {
    fontSize: 13,
    textAlign: 'center',
  },
  signOutButton: {
    marginTop: 32,
    paddingVertical: 16,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
  },
  signOutText: {
    fontSize: 16,
    fontWeight: '600',
  },
  deleteButton: {
    marginTop: 24,
    alignItems: 'center',
  },
  deleteText: {
    fontSize: 14,
  },
  footer: {
    marginTop: 24,
    marginBottom: 40,
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  footerText: {
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
  },
});
