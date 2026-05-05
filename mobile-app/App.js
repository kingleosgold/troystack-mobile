/**
 * TroyStack - React Native App
 * Privacy-First Precious Metals Portfolio Tracker
 * "Make Stacking Great Again" Edition 🪙
 */

import 'react-native-reanimated';
import React, { useState, useEffect, useRef, Component, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput,
  Alert, Modal, Platform, SafeAreaView, StatusBar, ActivityIndicator,
  Keyboard, TouchableWithoutFeedback, KeyboardAvoidingView, Dimensions, AppState, FlatList, Clipboard, Linking, Share,
  useColorScheme, RefreshControl, Switch, Image, Animated, LayoutAnimation, PanResponder,
} from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import ErrorBoundary from './ErrorBoundary';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as ImagePicker from 'expo-image-picker';
import * as LocalAuthentication from 'expo-local-authentication';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import * as Haptics from 'expo-haptics';
import { Audio, InterruptionModeIOS } from 'expo-av';
import { setAudioModeAsync as setAudioModeAsyncV2 } from 'expo-audio';
import Purchases from 'react-native-purchases';
import * as XLSX from 'xlsx';
import * as Notifications from 'expo-notifications';
import * as StoreReview from 'expo-store-review';
import { CloudStorage, CloudStorageScope } from 'react-native-cloud-storage';
import { initializePurchases, loginRevenueCat, hasGoldEntitlement, getUserEntitlements, restorePurchases, logoutRevenueCat } from './src/utils/entitlements';
import { syncWidgetData, isWidgetKitAvailable } from './src/utils/widgetKit';
import { registerBackgroundFetch, getBackgroundFetchStatus } from './src/utils/backgroundTasks';
import PieChart from './src/components/PieChart';
import ProgressBar from './src/components/ProgressBar';
import FloatingInput from './src/components/FloatingInput';
// LineChart removed — all charts now use ScrubChart
import Svg, { Path, Circle, Line, Defs, LinearGradient as SvgLinearGradient, Stop } from 'react-native-svg';
import { Swipeable, GestureHandlerRootView, Gesture, GestureDetector } from 'react-native-gesture-handler';
import { NavigationContainer, useNavigation, DrawerActions } from '@react-navigation/native';
import { createDrawerNavigator } from '@react-navigation/drawer';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
} from 'react-native-reanimated';
const Drawer = createDrawerNavigator();

// ============================================
// PREVIEW CONTEXT + BOTTOM SHEET
// ============================================

const PreviewContext = React.createContext();

function PreviewProvider({ children }) {
  const [previewContent, setPreviewContent] = useState(null);
  const [previewVisible, setPreviewVisible] = useState(false);
  const onOpenFullRef = useRef(null);

  const openPreview = useCallback((content) => {
    setPreviewContent(content);
    setPreviewVisible(true);
  }, []);

  const closePreview = useCallback(() => {
    setPreviewVisible(false);
    setTimeout(() => setPreviewContent(null), 300);
  }, []);

  const setOnOpenFull = useCallback((fn) => { onOpenFullRef.current = fn; }, []);
  const handleOpenFull = useCallback(() => {
    if (onOpenFullRef.current && previewContent) {
      onOpenFullRef.current(previewContent);
      closePreview();
    }
  }, [previewContent, closePreview]);

  return (
    <PreviewContext.Provider value={{ openPreview, closePreview, handleOpenFull, setOnOpenFull, previewContent, previewVisible }}>
      {children}
    </PreviewContext.Provider>
  );
}

function usePreview() {
  return React.useContext(PreviewContext);
}

// Preview content components
const PREVIEW_METAL_COLORS = { gold: '#D4A843', silver: '#C0C0C0', platinum: '#7BB3D4', palladium: '#6BBF8A' };

function PreviewChart({ data, chartType }) {
  if (!data) return <Text style={{ color: '#52525b', padding: 24 }}>No chart data available</Text>;

  if (chartType === 'ratio') {
    const ratio = data.ratio || 'N/A';
    return (
      <View style={{ padding: 24 }}>
        <Text style={{ color: '#fff', fontSize: 48, fontWeight: '700', textAlign: 'center', marginBottom: 4 }}>{ratio}</Text>
        <Text style={{ color: '#71717a', fontSize: 14, textAlign: 'center', marginBottom: 24 }}>Gold / Silver Ratio</Text>
        <View style={{ backgroundColor: '#1a1a1a', borderRadius: 12, padding: 16 }}>
          <Text style={{ color: '#a1a1aa', fontSize: 14, lineHeight: 20 }}>
            The gold-to-silver ratio measures how many ounces of silver it takes to buy one ounce of gold.
            Historically, ratios above 80 have preceded significant silver rallies.
          </Text>
        </View>
      </View>
    );
  }

  // Spot price display
  const metals = [
    { key: 'gold', label: 'Gold', price: data.goldPrice, color: PREVIEW_METAL_COLORS.gold },
    { key: 'silver', label: 'Silver', price: data.silverPrice, color: PREVIEW_METAL_COLORS.silver },
    { key: 'platinum', label: 'Platinum', price: data.platinumPrice, color: PREVIEW_METAL_COLORS.platinum },
    { key: 'palladium', label: 'Palladium', price: data.palladiumPrice, color: PREVIEW_METAL_COLORS.palladium },
  ].filter(m => m.price);

  return (
    <View style={{ padding: 16 }}>
      {metals.map(m => {
        const chg = data.change?.[m.key];
        const pct = chg?.percent;
        const isUp = pct >= 0;
        return (
          <View key={m.key} style={{ backgroundColor: '#1a1a1a', borderRadius: 12, padding: 16, marginBottom: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View>
              <Text style={{ color: m.color, fontSize: 13, fontWeight: '600', marginBottom: 2 }}>{m.label}</Text>
              <Text style={{ color: '#fff', fontSize: 24, fontWeight: '700' }}>${m.price?.toFixed(2)}</Text>
            </View>
            {pct != null && (
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={{ color: isUp ? '#22c55e' : '#ef4444', fontSize: 16, fontWeight: '700' }}>{isUp ? '+' : ''}{pct.toFixed(2)}%</Text>
                {chg?.amount != null && <Text style={{ color: '#71717a', fontSize: 12 }}>{isUp ? '+' : ''}${chg.amount.toFixed(2)}</Text>}
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}

function PreviewArticle({ article }) {
  return (
    <View style={{ padding: 24 }}>
      <Text style={{ color: '#C9A84C', fontSize: 20, fontWeight: '700', marginBottom: 12 }}>{article?.title || 'Stack Signal'}</Text>
      {article?.troy_commentary ? (
        <Text style={{ color: '#d4d4d8', fontSize: 15, lineHeight: 22 }}>{article.troy_commentary}</Text>
      ) : (
        <Text style={{ color: '#71717a', fontSize: 14 }}>Open the Stack Signal tab for the latest articles.</Text>
      )}
    </View>
  );
}

function PreviewPortfolio({ data }) {
  if (!data) return <Text style={{ color: '#52525b', padding: 24 }}>No portfolio data available</Text>;

  const { totalValue, totalCost, totalGain, totalGainPercent, metalTotals, holdings } = data;
  const isPositive = totalGain >= 0;
  const metalEntries = metalTotals ? Object.entries(metalTotals).filter(([_, v]) => v.oz > 0) : [];

  return (
    <View style={{ padding: 16 }}>
      {/* Total value */}
      <View style={{ alignItems: 'center', marginBottom: 20, paddingVertical: 16 }}>
        <Text style={{ color: '#71717a', fontSize: 13, marginBottom: 4 }}>Total Stack Value</Text>
        <Text style={{ color: '#fff', fontSize: 36, fontWeight: '700' }}>${totalValue?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0.00'}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
          <Text style={{ color: isPositive ? '#22c55e' : '#ef4444', fontSize: 16, fontWeight: '700' }}>
            {isPositive ? '+' : ''}${totalGain?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0.00'}
          </Text>
          <Text style={{ color: isPositive ? '#22c55e' : '#ef4444', fontSize: 14 }}>
            ({isPositive ? '+' : ''}{parseFloat(totalGainPercent || 0)}%)
          </Text>
        </View>
      </View>

      {/* Metal breakdown */}
      {metalEntries.map(([metal, vals]) => {
        const value = vals.oz * (data[`${metal}Price`] || (metal === 'gold' ? data.goldPrice : data.silverPrice) || 0);
        const gain = value - vals.cost;
        const gainPct = vals.cost > 0 ? ((gain / vals.cost) * 100) : 0;
        const color = PREVIEW_METAL_COLORS[metal] || '#C0C0C0';
        return (
          <View key={metal} style={{ backgroundColor: '#1a1a1a', borderRadius: 12, padding: 14, marginBottom: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View>
              <Text style={{ color, fontSize: 14, fontWeight: '600', marginBottom: 2 }}>{metal.charAt(0).toUpperCase() + metal.slice(1)}</Text>
              <Text style={{ color: '#a1a1aa', fontSize: 12 }}>{vals.oz.toFixed(2)} oz</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700' }}>${value.toFixed(2)}</Text>
              <Text style={{ color: gain >= 0 ? '#22c55e' : '#ef4444', fontSize: 12 }}>{gain >= 0 ? '+' : ''}{gainPct.toFixed(1)}%</Text>
            </View>
          </View>
        );
      })}

      {/* Cost basis line */}
      <View style={{ marginTop: 8, paddingTop: 12, borderTopWidth: 0.5, borderTopColor: 'rgba(255,255,255,0.1)', flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text style={{ color: '#71717a', fontSize: 13 }}>Cost Basis</Text>
        <Text style={{ color: '#a1a1aa', fontSize: 13, fontWeight: '600' }}>${totalCost?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0.00'}</Text>
      </View>
    </View>
  );
}

function PreviewDailyBrief({ data }) {
  return (
    <View style={{ padding: 24 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <Text style={{ fontSize: 20 }}>☀️</Text>
        <Text style={{ color: '#C9A84C', fontSize: 18, fontWeight: '700' }}>Daily Brief</Text>
      </View>
      {data?.brief_text ? (
        <Text style={{ color: '#d4d4d8', fontSize: 15, lineHeight: 22 }}>{data.brief_text}</Text>
      ) : (
        <Text style={{ color: '#71717a', fontSize: 14 }}>Open the Dashboard to read today's brief from Troy.</Text>
      )}
    </View>
  );
}

function PreviewDealerComparison({ data }) {
  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 }}>
      <Text style={{ color: '#C9A84C', fontSize: 18, fontWeight: '700', marginBottom: 8 }}>Dealer Comparison</Text>
      <Text style={{ color: '#71717a', fontSize: 14, textAlign: 'center' }}>Open Compare Dealers from the sidebar for live pricing.</Text>
    </View>
  );
}

function PreviewCostBasis({ data }) {
  if (!data?.holdings?.length) return <Text style={{ color: '#52525b', padding: 24 }}>No holdings data available</Text>;

  const { holdings, totalCost, totalValue } = data;

  // Group by metal
  const byMetal = {};
  for (const h of holdings) {
    if (!byMetal[h.metal]) byMetal[h.metal] = { items: [], totalOz: 0, totalCost: 0, totalValue: 0 };
    byMetal[h.metal].items.push(h);
    byMetal[h.metal].totalOz += parseFloat(h.totalOz);
    byMetal[h.metal].totalCost += parseFloat(h.totalCost);
    byMetal[h.metal].totalValue += parseFloat(h.currentValue);
  }

  return (
    <View style={{ padding: 16 }}>
      {Object.entries(byMetal).map(([metal, d]) => {
        const avgCost = d.totalOz > 0 ? d.totalCost / d.totalOz : 0;
        const color = PREVIEW_METAL_COLORS[metal] || '#C0C0C0';
        const gain = d.totalValue - d.totalCost;
        return (
          <View key={metal} style={{ backgroundColor: '#1a1a1a', borderRadius: 12, padding: 14, marginBottom: 10 }}>
            <Text style={{ color, fontSize: 15, fontWeight: '700', marginBottom: 8 }}>{metal.charAt(0).toUpperCase() + metal.slice(1)}</Text>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
              <Text style={{ color: '#71717a', fontSize: 13 }}>Avg Cost/oz</Text>
              <Text style={{ color: '#d4d4d8', fontSize: 13, fontWeight: '600' }}>${avgCost.toFixed(2)}</Text>
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
              <Text style={{ color: '#71717a', fontSize: 13 }}>Total Invested</Text>
              <Text style={{ color: '#d4d4d8', fontSize: 13 }}>${d.totalCost.toFixed(2)}</Text>
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
              <Text style={{ color: '#71717a', fontSize: 13 }}>Current Value</Text>
              <Text style={{ color: '#d4d4d8', fontSize: 13 }}>${d.totalValue.toFixed(2)}</Text>
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ color: '#71717a', fontSize: 13 }}>Gain/Loss</Text>
              <Text style={{ color: gain >= 0 ? '#22c55e' : '#ef4444', fontSize: 13, fontWeight: '600' }}>{gain >= 0 ? '+' : ''}${gain.toFixed(2)}</Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

function PreviewSpeculation({ data }) {
  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 }}>
      <Text style={{ color: '#C9A84C', fontSize: 18, fontWeight: '700', marginBottom: 8 }}>What If...</Text>
      <Text style={{ color: '#71717a', fontSize: 14, textAlign: 'center' }}>Open the Speculation Tool from Analytics for scenario modeling.</Text>
    </View>
  );
}

function PreviewPurchasingPower({ data }) {
  if (!data) return <Text style={{ color: '#52525b', padding: 24 }}>No purchasing power data available</Text>;

  const PPRow = ({ icon, label, value, sub }) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 0.5, borderBottomColor: 'rgba(255,255,255,0.06)' }}>
      <Text style={{ fontSize: 18, width: 30, textAlign: 'center' }}>{icon}</Text>
      <View style={{ flex: 1, marginLeft: 10 }}>
        <Text style={{ color: '#d4d4d8', fontSize: 14 }}>{label}</Text>
        {sub && <Text style={{ color: '#52525b', fontSize: 11, marginTop: 1 }}>{sub}</Text>}
      </View>
      <Text style={{ color: '#C9A84C', fontSize: 16, fontWeight: '700' }}>{value}</Text>
    </View>
  );

  return (
    <View style={{ padding: 16 }}>
      {/* Section 1: Your Stack Buys */}
      <Text style={{ color: '#fff', fontSize: 18, fontWeight: '700', marginBottom: 4 }}>Your Stack Buys</Text>
      <Text style={{ color: '#71717a', fontSize: 13, marginBottom: 12 }}>What your stack can actually purchase today</Text>
      <View style={{ backgroundColor: '#1a1a1a', borderRadius: 12, paddingHorizontal: 14, marginBottom: 20 }}>
        <PPRow icon="🛢" label="Barrels of crude oil" value={data.stackBarrelsOfOil?.toFixed(1)} sub="@ ~$85/barrel" />
        <PPRow icon="🏠" label="Months of median rent" value={data.stackMonthsOfRent?.toFixed(1)} sub="@ ~$1,850/month US median" />
        <PPRow icon="⏱" label="Hours of median labor" value={data.stackHoursOfLabor?.toLocaleString()} sub="@ ~$29/hour US median" />
      </View>

      {/* Section 2: Per Ounce of Gold */}
      <Text style={{ color: '#D4A843', fontSize: 15, fontWeight: '700', marginBottom: 8 }}>Per Ounce of Gold</Text>
      <View style={{ backgroundColor: '#1a1a1a', borderRadius: 12, paddingHorizontal: 14, marginBottom: 20 }}>
        <PPRow icon="🛢" label="Barrels of crude oil" value={data.goldPerBarrelOfOil?.toFixed(1)} />
        <PPRow icon="🏠" label="Months of median rent" value={data.goldPerMedianRent?.toFixed(1)} />
        <PPRow icon="👔" label="Quality men's suits" value="~1" sub="Same as 1900 — gold holds value" />
      </View>

      {/* Section 3: Per Ounce of Silver */}
      <Text style={{ color: '#C0C0C0', fontSize: 15, fontWeight: '700', marginBottom: 8 }}>Per Ounce of Silver</Text>
      <View style={{ backgroundColor: '#1a1a1a', borderRadius: 12, paddingHorizontal: 14, marginBottom: 20 }}>
        <PPRow icon="⛽" label="Gallons of gasoline" value={data.silverPerGallonOfGas?.toFixed(1)} />
        <PPRow icon="⏱" label="Hours of median labor" value={data.silverPerHoursOfLabor?.toFixed(1)} />
      </View>

      {/* Section 4: vs 1971 */}
      <Text style={{ color: '#fff', fontSize: 15, fontWeight: '700', marginBottom: 8 }}>vs. 1971 (Nixon Shock)</Text>
      <View style={{ backgroundColor: '#1a1a1a', borderRadius: 12, padding: 14 }}>
        <View style={{ marginBottom: 12 }}>
          <Text style={{ color: '#D4A843', fontSize: 13, fontWeight: '600', marginBottom: 4 }}>Gold vs. Oil</Text>
          <Text style={{ color: '#a1a1aa', fontSize: 13, lineHeight: 18 }}>
            1971: 1 oz gold bought ~{data.goldOilRatio1971} barrels of oil.{'\n'}
            Today: 1 oz gold buys <Text style={{ color: '#C9A84C', fontWeight: '700' }}>{data.goldPerBarrelOfOil?.toFixed(1)}</Text> barrels.
          </Text>
        </View>
        <View style={{ marginBottom: 12 }}>
          <Text style={{ color: '#C0C0C0', fontSize: 13, fontWeight: '600', marginBottom: 4 }}>Silver vs. Gasoline</Text>
          <Text style={{ color: '#a1a1aa', fontSize: 13, lineHeight: 18 }}>
            1971: 1 oz silver bought ~{data.silverGasRatio1971} gallons of gas.{'\n'}
            Today: 1 oz silver buys <Text style={{ color: '#C9A84C', fontWeight: '700' }}>{data.silverPerGallonOfGas?.toFixed(1)}</Text> gallons.
          </Text>
        </View>
        <Text style={{ color: '#52525b', fontSize: 12, fontStyle: 'italic' }}>Gold and silver didn't just keep up — they outperformed real goods over 50+ years.</Text>
      </View>
    </View>
  );
}

// ============================================
// INLINE RICH CONTENT CARDS (inside Troy's message bubble)
// ============================================

const INLINE_CARD_STYLE = {
  backgroundColor: 'rgba(255,255,255,0.05)',
  borderRadius: 8,
  borderWidth: 0.5,
  borderColor: 'rgba(255,255,255,0.1)',
  padding: 12,
  marginTop: 8,
};

function InlinePortfolioCard({ data }) {
  if (!data) return null;
  const { totalValue, totalGain, totalGainPercent, metalTotals } = data;
  const isPositive = totalGain >= 0;
  const metalEntries = metalTotals ? Object.entries(metalTotals).filter(([_, v]) => v.oz > 0) : [];

  return (
    <View style={INLINE_CARD_STYLE}>
      <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, marginBottom: 2 }}>Total Stack Value</Text>
      <Text style={{ color: '#DAA520', fontSize: 22, fontWeight: '700' }}>
        ${totalValue?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0.00'}
      </Text>
      <Text style={{ color: isPositive ? '#4ADE80' : '#EF4444', fontSize: 13, fontWeight: '600', marginBottom: 8 }}>
        {isPositive ? '+' : ''}${totalGain?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0.00'} ({isPositive ? '+' : ''}{parseFloat(totalGainPercent || 0)}%) {isPositive ? '▲' : '▼'}
      </Text>
      {metalEntries.map(([metal, vals]) => {
        const price = data[`${metal}Price`] || 0;
        const value = vals.oz * price;
        const gain = value - vals.cost;
        const gainPct = vals.cost > 0 ? ((gain / vals.cost) * 100) : 0;
        const color = PREVIEW_METAL_COLORS[metal] || '#C0C0C0';
        return (
          <View key={metal} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 3 }}>
            <Text style={{ color, fontSize: 12, fontWeight: '600', width: 50 }}>{metal.charAt(0).toUpperCase() + metal.slice(1)}</Text>
            <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, flex: 1 }}>{vals.oz.toFixed(vals.oz >= 100 ? 0 : 2)} oz</Text>
            <Text style={{ color: '#d4d4d8', fontSize: 12, fontWeight: '600', marginRight: 8 }}>${value >= 1000 ? (value / 1000).toFixed(0) + 'k' : value.toFixed(0)}</Text>
            <Text style={{ color: gain >= 0 ? '#4ADE80' : '#EF4444', fontSize: 11 }}>{gain >= 0 ? '+' : ''}{gainPct.toFixed(1)}%</Text>
          </View>
        );
      })}
    </View>
  );
}

function InlinePriceCard({ data }) {
  if (!data) return null;
  const metals = [
    { key: 'gold', label: 'Gold', price: data.goldPrice, color: PREVIEW_METAL_COLORS.gold },
    { key: 'silver', label: 'Silver', price: data.silverPrice, color: PREVIEW_METAL_COLORS.silver },
  ].filter(m => m.price);

  return (
    <View style={INLINE_CARD_STYLE}>
      {metals.map((m, i) => {
        const chg = data.change?.[m.key];
        const pct = chg?.percent;
        const isUp = pct >= 0;
        return (
          <View key={m.key} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: i > 0 ? 4 : 0, marginTop: i > 0 ? 4 : 0, borderTopWidth: i > 0 ? 0.5 : 0, borderTopColor: 'rgba(255,255,255,0.06)' }}>
            <Text style={{ color: m.color, fontSize: 13, fontWeight: '600' }}>{m.label}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={{ color: '#DAA520', fontSize: 14, fontWeight: '700' }}>${m.price?.toFixed(2)}</Text>
              {pct != null && (
                <Text style={{ color: isUp ? '#4ADE80' : '#EF4444', fontSize: 12, fontWeight: '600' }}>
                  {isUp ? '▲' : '▼'} {Math.abs(pct).toFixed(1)}%
                </Text>
              )}
            </View>
          </View>
        );
      })}
    </View>
  );
}

function InlineRatioCard({ data }) {
  if (!data) return null;
  const ratio = data.ratio;
  const ratioDisplay = typeof ratio === 'number' ? ratio.toFixed(1) : (ratio || 'N/A');
  return (
    <View style={INLINE_CARD_STYLE}>
      <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, marginBottom: 2 }}>Gold/Silver Ratio</Text>
      <Text style={{ color: '#DAA520', fontSize: 28, fontWeight: '700', marginBottom: 4 }}>{ratioDisplay}</Text>
      <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, lineHeight: 15 }}>
        {data.interpretation || 'Historically, ratios above 80 have preceded significant silver rallies.'}
      </Text>
    </View>
  );
}

function InlineCostBasisCard({ data }) {
  if (!data?.holdings?.length) return null;
  const { holdings, totalCost, totalValue } = data;

  const byMetal = {};
  for (const h of holdings) {
    if (!byMetal[h.metal]) byMetal[h.metal] = { totalOz: 0, totalCost: 0, totalValue: 0 };
    byMetal[h.metal].totalOz += parseFloat(h.totalOz);
    byMetal[h.metal].totalCost += parseFloat(h.totalCost);
    byMetal[h.metal].totalValue += parseFloat(h.currentValue);
  }

  return (
    <View style={INLINE_CARD_STYLE}>
      <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, marginBottom: 6 }}>Cost Basis</Text>
      {Object.entries(byMetal).map(([metal, d]) => {
        const avgCost = d.totalOz > 0 ? d.totalCost / d.totalOz : 0;
        const spotPrice = d.totalOz > 0 ? d.totalValue / d.totalOz : 0;
        const color = PREVIEW_METAL_COLORS[metal] || '#C0C0C0';
        return (
          <View key={metal} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 2 }}>
            <Text style={{ color, fontSize: 12, fontWeight: '600', width: 55 }}>{metal.charAt(0).toUpperCase() + metal.slice(1)}</Text>
            <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, flex: 1 }}>Avg ${avgCost.toFixed(0)}/oz</Text>
            <Text style={{ color: '#DAA520', fontSize: 12 }}>→ Now ${spotPrice.toFixed(0)}</Text>
          </View>
        );
      })}
      <View style={{ borderTopWidth: 0.5, borderTopColor: 'rgba(255,255,255,0.06)', marginTop: 6, paddingTop: 6, flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11 }}>Invested: ${totalCost?.toLocaleString(undefined, { maximumFractionDigits: 0 })}</Text>
        <Text style={{ color: '#DAA520', fontSize: 11, fontWeight: '600' }}>Value: ${totalValue?.toLocaleString(undefined, { maximumFractionDigits: 0 })}</Text>
      </View>
    </View>
  );
}

function InlinePurchasingPowerCard({ data, onExpand }) {
  if (!data) return null;
  return (
    <View style={INLINE_CARD_STYLE}>
      <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, marginBottom: 6 }}>Your Stack Buys</Text>
      {data.stackBarrelsOfOil != null && (
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 2 }}>
          <Text style={{ color: '#DAA520', fontSize: 13, fontWeight: '700', marginRight: 4 }}>{Math.round(data.stackBarrelsOfOil).toLocaleString()}</Text>
          <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>barrels of oil</Text>
        </View>
      )}
      {data.stackMonthsOfRent != null && (
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 2 }}>
          <Text style={{ color: '#DAA520', fontSize: 13, fontWeight: '700', marginRight: 4 }}>{Math.round(data.stackMonthsOfRent).toLocaleString()}</Text>
          <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>months of rent</Text>
        </View>
      )}
      {data.silverPerGallonOfGas != null && (
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 2 }}>
          <Text style={{ color: '#DAA520', fontSize: 13, fontWeight: '700', marginRight: 4 }}>{Math.round(data.stackHoursOfLabor || 0).toLocaleString()}</Text>
          <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>hours of labor</Text>
        </View>
      )}
      {data.goldOilRatio1971 != null && (
        <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10, marginTop: 6, lineHeight: 14 }}>
          vs 1971: 1 oz gold bought {data.goldOilRatio1971} barrels. Today: {data.goldPerBarrelOfOil?.toFixed(1)} barrels.
        </Text>
      )}
      {onExpand && (
        <TouchableOpacity onPress={onExpand} style={{ marginTop: 6 }}>
          <Text style={{ color: '#DAA520', fontSize: 12, fontWeight: '600' }}>See full breakdown →</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

function InlineDealerCard({ data }) {
  if (!data) return null;
  // Support new shape (data.dealers array) and legacy shape (single data.dealer/url)
  const dealers = data.dealers || (data.dealer && data.url ? [{ dealer: data.dealer, url: data.url }] : []);
  if (dealers.length === 0) return null;

  return (
    <View style={INLINE_CARD_STYLE}>
      <Text style={{ color: '#DAA520', fontSize: 14, fontWeight: '600', marginBottom: 8 }}>{data.product}</Text>
      {dealers.map((d, i) => (
        <TouchableOpacity
          key={i}
          onPress={() => Linking.openURL(d.url)}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingVertical: 8,
            borderTopWidth: i > 0 ? 0.5 : 0,
            borderTopColor: 'rgba(255,255,255,0.06)',
          }}
        >
          <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13 }}>Shop on {d.dealer}</Text>
          <Text style={{ color: '#DAA520', fontSize: 16 }}>→</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

function renderInlineCard(preview, openPreview) {
  if (!preview) return null;
  switch (preview.type) {
    case 'portfolio':
      return <InlinePortfolioCard data={preview.data} />;
    case 'purchasing_power':
      return <InlinePurchasingPowerCard data={preview.data} onExpand={() => openPreview(preview)} />;
    case 'cost_basis':
      return <InlineCostBasisCard data={preview.data} />;
    case 'dealer_link':
      return <InlineDealerCard data={preview.data} />;
    case 'chart':
      if (preview.chartType === 'spot_price') return <InlinePriceCard data={preview.data} />;
      if (preview.chartType === 'ratio') return <InlineRatioCard data={preview.data} />;
      return null;
    default:
      return null;
  }
}

function shouldShowPreviewButton(preview) {
  if (!preview) return false;
  const bottomSheetTypes = ['signal_article', 'daily_brief', 'dealer_comparison', 'speculation'];
  if (preview.type === 'chart' && preview.data?.chartData) return true;
  return bottomSheetTypes.includes(preview.type);
}

function getPreviewLabel(preview) {
  if (!preview) return 'View Details';
  switch (preview.type) {
    case 'portfolio': return 'View Portfolio';
    case 'chart':
      if (preview.chartType === 'ratio') return 'View Ratio';
      return 'View Chart';
    case 'cost_basis': return 'View Cost Basis';
    case 'daily_brief': return 'View Daily Brief';
    case 'signal_article': return 'View Article';
    case 'dealer_comparison': return 'View Dealers';
    case 'dealer_link': return `Shop ${preview.data?.product || 'Dealer'}`;
    case 'speculation': return 'View Analysis';
    case 'purchasing_power': return 'View Purchasing Power';
    default: return 'View Details';
  }
}

function renderPreviewContent(content) {
  if (!content) return null;
  switch (content.type) {
    case 'chart': return <PreviewChart data={content.data} chartType={content.chartType} />;
    case 'signal_article': return <PreviewArticle article={content.data} />;
    case 'portfolio': return <PreviewPortfolio data={content.data} />;
    case 'daily_brief': return <PreviewDailyBrief data={content.data} />;
    case 'dealer_comparison': return <PreviewDealerComparison data={content.data} />;
    case 'cost_basis': return <PreviewCostBasis data={content.data} />;
    case 'speculation': return <PreviewSpeculation data={content.data} />;
    case 'purchasing_power': return <PreviewPurchasingPower data={content.data} />;
    default: return <Text style={{ color: '#fff', padding: 24 }}>Unknown content type: {content.type}</Text>;
  }
}

// Preview title based on content type
function getPreviewTitle(content) {
  if (!content) return 'Preview';
  switch (content.type) {
    case 'chart': return content.chartType === 'portfolio_performance' ? 'Portfolio Performance' : content.chartType === 'spot_price' ? 'Spot Price' : 'Chart';
    case 'signal_article': return content.data?.title || 'Stack Signal';
    case 'portfolio': return 'Portfolio Summary';
    case 'daily_brief': return "Troy's Daily Brief";
    case 'dealer_comparison': return 'Dealer Comparison';
    case 'cost_basis': return 'Cost Basis';
    case 'speculation': return 'What If...';
    case 'purchasing_power': return 'Purchasing Power';
    default: return 'Preview';
  }
}

// Full-screen bottom sheet for previewing content
const SCREEN_HEIGHT = Dimensions.get('window').height;

function PreviewBottomSheet() {
  const { previewContent, previewVisible, closePreview, handleOpenFull } = usePreview();
  const insets = useSafeAreaInsets();
  const translateY = useSharedValue(SCREEN_HEIGHT);
  const overlayOpacity = useSharedValue(0);

  useEffect(() => {
    if (previewVisible) {
      translateY.value = withSpring(0, { damping: 30, stiffness: 300, overshootClamping: true });
      overlayOpacity.value = withTiming(1, { duration: 200 });
    } else {
      translateY.value = withTiming(SCREEN_HEIGHT, { duration: 250 });
      overlayOpacity.value = withTiming(0, { duration: 200 });
    }
  }, [previewVisible]);

  const startY = useSharedValue(0);
  const panGesture = Gesture.Pan()
    .onStart(() => { startY.value = translateY.value; })
    .onUpdate((event) => {
      translateY.value = Math.max(0, startY.value + event.translationY);
    })
    .onEnd((event) => {
      if (event.translationY > 100 || event.velocityY > 500) {
        translateY.value = withTiming(SCREEN_HEIGHT, { duration: 250 });
        overlayOpacity.value = withTiming(0, { duration: 200 });
        runOnJS(closePreview)();
      } else {
        translateY.value = withSpring(0, { damping: 30, stiffness: 300, overshootClamping: true });
      }
    });

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const overlayStyle = useAnimatedStyle(() => ({
    opacity: overlayOpacity.value,
    pointerEvents: overlayOpacity.value > 0.01 ? 'auto' : 'none',
  }));

  if (!previewContent && !previewVisible) return null;

  const title = getPreviewTitle(previewContent);

  return (
    <>
      {/* Dark overlay */}
      <Reanimated.View style={[{
        position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 9990,
      }, overlayStyle]}>
        <TouchableWithoutFeedback onPress={closePreview}>
          <View style={{ flex: 1 }} />
        </TouchableWithoutFeedback>
      </Reanimated.View>

      {/* Bottom sheet */}
      <GestureDetector gesture={panGesture}>
        <Reanimated.View style={[{
          position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: '#0F0F13', zIndex: 9991,
          borderTopLeftRadius: 16, borderTopRightRadius: 16,
          paddingTop: insets.top,
        }, sheetStyle]}>
          {/* Drag handle */}
          <View style={{ alignItems: 'center', paddingTop: 8, paddingBottom: 4 }}>
            <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.3)' }} />
          </View>

          {/* Header */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 0.5, borderBottomColor: 'rgba(255,255,255,0.1)' }}>
            <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700', flex: 1 }} numberOfLines={1}>{title}</Text>
            <TouchableOpacity onPress={handleOpenFull} style={{ marginRight: 16 }}>
              <Text style={{ color: '#C9A84C', fontSize: 14, fontWeight: '600' }}>Open full</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={closePreview} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Text style={{ color: '#71717a', fontSize: 22, fontWeight: '300' }}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Content */}
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 20) }}>
            {renderPreviewContent(previewContent)}
          </ScrollView>
        </Reanimated.View>
      </GestureDetector>
    </>
  );
}

// Small component to capture drawer navigation ref inside the screen
function DrawerNavCapture({ onCapture }) {
  const nav = useNavigation();
  const captured = useRef(false);
  useEffect(() => {
    if (nav && !captured.current) {
      captured.current = true;
      onCapture(nav);
    }
  }, [nav]);
  return null;
}
import GoldPaywall from './src/components/GoldPaywall';
import Tutorial from './src/components/Tutorial';
import TroyCoinIcon from './src/components/TroyCoinIcon';
import GlobeIcon from './src/components/GlobeIcon';
import StackSignalIcon from './src/components/StackSignalIcon';
import ViewShot from 'react-native-view-shot';
import Markdown from 'react-native-markdown-display';
import { AuthProvider, useAuth } from './src/contexts/AuthContext';
import AuthScreen from './src/screens/AuthScreen';
import AccountScreen from './src/screens/AccountScreen';
import ResetPasswordScreen from './src/screens/ResetPasswordScreen';
import { AppleLogo, GoogleLogo, ProfileIcon, DashboardIcon, HoldingsIcon, AnalyticsIcon, SettingsIcon, SortIcon, TodayIcon, BellIcon, TrendingUpIcon, CalculatorIcon, TrophyIcon } from './src/components/icons';
import {
  fetchHoldings,
  addHolding,
  updateHolding,
  deleteHolding as deleteHoldingFromSupabase,
  fullSync,
  findHoldingByLocalId,
} from './src/services/supabaseHoldings';
import { supabase } from './src/lib/supabase';

// Configure notifications behavior
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: false,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

// UUID v4 generator for price alert IDs (must be valid UUID for Supabase)
const generateUUID = () => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

// iCloud sync key
const ICLOUD_HOLDINGS_KEY = 'stack_tracker_holdings.json';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const API_BASE_URL = Constants.expoConfig?.extra?.apiUrl || 'https://api.stacktrackergold.com';
const appVersion = Constants.expoConfig?.version || Constants.manifest?.version || '0.0.0';
const TROY_AVATAR = require('./assets/troy-avatar.png');

const useSwipeBack = (onClose) => {
  const startX = useRef(0);
  return PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onMoveShouldSetPanResponder: (evt, gestureState) => {
      return startX.current < 40 && gestureState.dx > 15 && Math.abs(gestureState.dy) < 30;
    },
    onMoveShouldSetPanResponderCapture: (evt, gestureState) => {
      return startX.current < 40 && gestureState.dx > 15 && Math.abs(gestureState.dy) < 30;
    },
    onPanResponderGrant: () => {},
    onPanResponderMove: () => {},
    onPanResponderRelease: (evt, gestureState) => {
      if (gestureState.dx > 80) onClose();
    },
    onPanResponderTerminate: () => {},
    onStartShouldSetPanResponderCapture: (evt) => {
      startX.current = evt.nativeEvent.pageX;
      return false;
    },
  });
};

const isVersionBelow = (current, minimum) => {
  const cur = current.split('.').map(Number);
  const min = minimum.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((cur[i] || 0) < (min[i] || 0)) return true;
    if ((cur[i] || 0) > (min[i] || 0)) return false;
  }
  return false;
};

/**
 * Determine user subscription tier from RevenueCat customerInfo
 * @param {object} customerInfo - RevenueCat customer info object
 * @returns {'free'|'gold'} User's current tier
 */
const getUserTier = (customerInfo) => {
  const active = customerInfo?.entitlements?.active || {};
  // Silver subscribers are grandfathered to Gold
  if (active['Lifetime'] || active['Gold'] || active['Silver']) return 'gold';
  return 'free';
};

// ============================================
// DEALER CSV TEMPLATES
// ============================================
const DEALER_TEMPLATES = {
  'stacktracker': {
    name: 'Stack Tracker Export',
    instructions: 'Re-import a CSV previously exported from this app',
    columnMap: {
      product: ['product'],
      metal: ['metal'],
      quantity: ['qty'],
      unitPrice: ['unit price'],
      date: ['date'],
      time: ['time'],
      dealer: ['source'],
      ozt: ['ozt'],
      taxes: ['taxes'],
      shipping: ['shipping'],
      spotPrice: ['spot'],
      premium: ['premium'],
    },
    detectPattern: null, // Detected by header fingerprint
    headerFingerprint: ['metal', 'product', 'source', 'ozt', 'unit price'],
    autoDealer: null,
  },
  'generic': {
    name: 'Generic / Custom',
    instructions: 'CSV should have columns: Product Name, Metal Type, OZT, Quantity, Price, Date',
    columnMap: {
      product: ['product', 'name', 'item', 'description'],
      metal: ['metal', 'type', 'metal type'],
      quantity: ['quantity', 'qty', 'count'],
      unitPrice: ['price', 'unit price', 'cost', 'unit cost'],
      date: ['date', 'purchased', 'purchase date', 'order date'],
      dealer: ['dealer', 'source', 'vendor', 'seller'],
      ozt: ['oz', 'ozt', 'ounces', 'troy oz', 'weight'],
    },
    detectPattern: null, // Default fallback
    autoDealer: null,
  },
  'apmex': {
    name: 'APMEX',
    instructions: 'Go to My Account → Order History → Export to CSV',
    columnMap: {
      product: ['description', 'item description', 'product'],
      quantity: ['qty', 'quantity'],
      unitPrice: ['unit price', 'price'],
      date: ['order date', 'date'],
      dealer: null, // Will auto-fill with dealer name
    },
    detectPattern: /apmex|order.*id.*apmex/i,
    autoDealer: 'APMEX',
  },
  'jmbullion': {
    name: 'JM Bullion',
    instructions: 'Go to Order History → Download Order History',
    columnMap: {
      product: ['product name', 'product', 'item', 'description'],
      quantity: ['qty', 'quantity'],
      unitPrice: ['price', 'unit price'],
      date: ['date', 'order date', 'purchase date'],
      dealer: null,
    },
    detectPattern: /jm.*bullion|jmbullion/i,
    autoDealer: 'JM Bullion',
  },
  'sdbullion': {
    name: 'SD Bullion',
    instructions: 'Go to My Orders → Export to CSV',
    columnMap: {
      product: ['product', 'item name', 'description'],
      quantity: ['quantity', 'qty'],
      unitPrice: ['price', 'unit price', 'item price'],
      date: ['order date', 'date'],
      dealer: null,
    },
    detectPattern: /sd.*bullion|sdbullion/i,
    autoDealer: 'SD Bullion',
  },
  'providentmetals': {
    name: 'Provident Metals',
    instructions: 'Go to Order History → Export',
    columnMap: {
      product: ['product', 'description', 'item'],
      quantity: ['qty', 'quantity'],
      unitPrice: ['price', 'unit price'],
      date: ['date', 'order date'],
      dealer: null,
    },
    detectPattern: /provident/i,
    autoDealer: 'Provident Metals',
  },
  'herobullion': {
    name: 'Hero Bullion',
    instructions: 'Go to My Account → Order History → Export',
    columnMap: {
      product: ['product', 'description', 'item name'],
      quantity: ['quantity', 'qty'],
      unitPrice: ['price', 'unit price'],
      date: ['date', 'order date'],
      dealer: null,
    },
    detectPattern: /hero.*bullion/i,
    autoDealer: 'Hero Bullion',
  },
  'boldpreciousmetals': {
    name: 'BOLD Precious Metals',
    instructions: 'Go to Account → Orders → Download CSV',
    columnMap: {
      product: ['item', 'product', 'description'],
      quantity: ['qty', 'quantity'],
      unitPrice: ['price', 'unit price'],
      date: ['date', 'order date'],
      dealer: null,
    },
    detectPattern: /bold.*precious|boldprecious/i,
    autoDealer: 'BOLD Precious Metals',
  },
  'moneymetals': {
    name: 'Money Metals Exchange',
    instructions: 'Go to Order History → Export Orders',
    columnMap: {
      product: ['product', 'description', 'item'],
      quantity: ['qty', 'quantity'],
      unitPrice: ['price', 'unit price'],
      date: ['date', 'order date'],
      dealer: null,
    },
    detectPattern: /money.*metals/i,
    autoDealer: 'Money Metals Exchange',
  },
};

// ============================================
// METAL & WEIGHT DETECTION HELPERS
// ============================================

/**
 * Auto-detect metal type from product name
 * Returns 'gold', 'silver', 'platinum', 'palladium', or null
 */
const detectMetalFromName = (productName) => {
  if (!productName) return null;
  const name = productName.toLowerCase();

  // Gold detection patterns
  const goldPatterns = [
    /\bgold\b/,
    /\bau\b/,
    /\b(1|one|half|quarter|tenth)\s*(oz|ounce).*gold/,
    /gold.*(eagle|buffalo|maple|krugerrand|panda|philharmonic|kangaroo|britannia)/,
    /(eagle|buffalo|maple|krugerrand|panda|philharmonic|kangaroo|britannia).*gold/,
    /\b(american|canadian|south african|chinese|austrian|australian|british).*gold/,
    /\b24k\b|\b22k\b|\b14k\b|\b18k\b/,
    /gold\s*(bar|coin|round)/,
    /\bkilo.*gold\b|\bgold.*kilo\b/,
  ];

  // Silver detection patterns
  const silverPatterns = [
    /\bsilver\b/,
    /\bag\b/,
    /silver.*(eagle|maple|britannia|philharmonic|kookaburra|panda|libertad)/,
    /(eagle|maple|britannia|philharmonic|kookaburra|panda|libertad).*silver/,
    /\b(american|canadian|austrian|australian|mexican|chinese).*silver/,
    /\bjunk\s*silver\b/,
    /\b90%\s*(silver|coin)/,
    /\b40%\s*silver/,
    /silver\s*(bar|coin|round)/,
    /\b(morgan|peace|walking liberty|mercury|roosevelt|washington|kennedy)\b/,
    /\bgeneric.*silver\b|\bsilver.*generic\b/,
    /\b999\s*silver\b|\bsilver.*999\b/,
    /\.999\s*fine\s*silver/,
  ];

  // Platinum detection patterns
  const platinumPatterns = [
    /\bplatinum\b/,
    /\bpt\b/,
    /platinum.*(eagle|maple|britannia|philharmonic)/,
  ];

  // Palladium detection patterns
  const palladiumPatterns = [
    /\bpalladium\b/,
    /\bpd\b/,
    /palladium.*(eagle|maple)/,
  ];

  // Check patterns in order of likelihood
  for (const pattern of silverPatterns) {
    if (pattern.test(name)) return 'silver';
  }
  for (const pattern of goldPatterns) {
    if (pattern.test(name)) return 'gold';
  }
  for (const pattern of platinumPatterns) {
    if (pattern.test(name)) return 'platinum';
  }
  for (const pattern of palladiumPatterns) {
    if (pattern.test(name)) return 'palladium';
  }

  return null;
};

/**
 * Auto-detect troy ounces from product name
 * Returns the OZT value as a number, or null if not detected
 */
const detectOztFromName = (productName) => {
  if (!productName) return null;
  const name = productName.toLowerCase();

  // Common fractional gold sizes
  const fractionalPatterns = [
    { pattern: /\b1\/10\s*(oz|ounce|ozt)\b|\btenth\s*(oz|ounce)\b/i, ozt: 0.1 },
    { pattern: /\b1\/4\s*(oz|ounce|ozt)\b|\bquarter\s*(oz|ounce)\b/i, ozt: 0.25 },
    { pattern: /\b1\/2\s*(oz|ounce|ozt)\b|\bhalf\s*(oz|ounce)\b/i, ozt: 0.5 },
    { pattern: /\b1\/20\s*(oz|ounce|ozt)\b/i, ozt: 0.05 },
    { pattern: /\b2\s*(oz|ounce|ozt)\b/i, ozt: 2 },
    { pattern: /\b5\s*(oz|ounce|ozt)\b/i, ozt: 5 },
    { pattern: /\b10\s*(oz|ounce|ozt)\b/i, ozt: 10 },
    { pattern: /\b100\s*(oz|ounce|ozt)\b/i, ozt: 100 },
    { pattern: /\b1000\s*(oz|ounce|ozt)\b|\b1,000\s*(oz|ounce|ozt)\b/i, ozt: 1000 },
    { pattern: /\b1\s*(oz|ounce|ozt)\b/i, ozt: 1 },
  ];

  // Kilo bars
  if (/\bkilo\b|\b1\s*kg\b|\bkilogram\b/i.test(name)) {
    return 32.15; // 1 kilo = 32.15 troy oz
  }

  // Check fractional patterns (order matters - check specific fractions first)
  for (const { pattern, ozt } of fractionalPatterns) {
    if (pattern.test(name)) return ozt;
  }

  // Try to extract numeric oz value: "10oz", "10 oz", "10-oz"
  const ozMatch = name.match(/(\d+(?:\.\d+)?)\s*[-]?\s*(oz|ozt|ounce|troy\s*oz)/i);
  if (ozMatch) {
    const value = parseFloat(ozMatch[1]);
    if (value > 0 && value <= 1000) return value;
  }

  // Gram bars: "1g", "5g", "10g", "50g", "100g"
  const gramMatch = name.match(/(\d+(?:\.\d+)?)\s*[-]?\s*(g|gram|grams)\b/i);
  if (gramMatch) {
    const grams = parseFloat(gramMatch[1]);
    if (grams > 0 && grams <= 1000) {
      return parseFloat((grams / 31.1035).toFixed(4)); // Convert grams to ozt
    }
  }

  // Common coin defaults (if metal detected but no weight)
  // American Silver Eagle, Canadian Maple, etc. are 1oz
  if (/\b(eagle|maple|britannia|philharmonic|buffalo|krugerrand|panda|libertad|kookaburra)\b/i.test(name)) {
    // If no specific weight mentioned, these are typically 1oz
    return 1;
  }

  // Junk silver - 90% silver coins have specific silver content
  if (/\bjunk\b.*silver|90%/i.test(name)) {
    // $1 face value of 90% silver = 0.715 ozt
    // Can't determine without face value, return null
    return null;
  }

  return null;
};

/**
 * Auto-detect dealer from headers/file content
 * Returns the dealer template key or 'generic'
 */
const detectDealerFromHeaders = (headers, fileContent = '') => {
  const headerStr = headers.join(' ').toLowerCase();
  const contentStr = (fileContent || '').toLowerCase();
  const lowerHeaders = headers.map(h => h.toLowerCase().trim());

  // 1. Check header fingerprints first (exact header-based detection)
  for (const [key, template] of Object.entries(DEALER_TEMPLATES)) {
    if (template.headerFingerprint) {
      const matched = template.headerFingerprint.every(fp =>
        lowerHeaders.some(h => h === fp || h.includes(fp))
      );
      if (matched) return key;
    }
  }

  // 2. Check regex detectPattern against headers and filename
  for (const [key, template] of Object.entries(DEALER_TEMPLATES)) {
    if (template.detectPattern && (template.detectPattern.test(headerStr) || template.detectPattern.test(contentStr))) {
      return key;
    }
  }

  // 3. Check if headers match generic column names well enough to skip dealer selection
  //    Need at least: a product-like column AND (a price-like column OR an ozt-like column)
  const genericMap = DEALER_TEMPLATES['generic'].columnMap;
  const hasProduct = genericMap.product.some(name => lowerHeaders.some(h => h.includes(name)));
  const hasPrice = genericMap.unitPrice.some(name => lowerHeaders.some(h => h.includes(name)));
  const hasOzt = genericMap.ozt.some(name => lowerHeaders.some(h => h.includes(name)));
  if (hasProduct && (hasPrice || hasOzt)) return 'generic';

  // 4. Unrecognized format
  return null;
};

// ============================================
// REUSABLE COMPONENTS
// ============================================

// ============================================
// WHEEL PICKER (scroll-based picker column)
// ============================================
const WHEEL_ITEM_HEIGHT = 44;
const WHEEL_VISIBLE_ITEMS = 5;

const WheelPicker = ({ items, selectedIndex, onSelect, width = 80 }) => {
  const flatListRef = useRef(null);
  const isScrolling = useRef(false);

  const padding = Math.floor(WHEEL_VISIBLE_ITEMS / 2);
  const paddedItems = [
    ...Array(padding).fill({ label: '', value: null }),
    ...items,
    ...Array(padding).fill({ label: '', value: null }),
  ];

  useEffect(() => {
    if (flatListRef.current && !isScrolling.current) {
      setTimeout(() => {
        flatListRef.current?.scrollToOffset({
          offset: selectedIndex * WHEEL_ITEM_HEIGHT,
          animated: false,
        });
      }, 50);
    }
  }, [selectedIndex]);

  return (
    <View style={{ height: WHEEL_ITEM_HEIGHT * WHEEL_VISIBLE_ITEMS, width, overflow: 'hidden' }}>
      <FlatList
        ref={flatListRef}
        data={paddedItems}
        keyExtractor={(_, i) => `wp-${i}`}
        showsVerticalScrollIndicator={false}
        snapToInterval={WHEEL_ITEM_HEIGHT}
        decelerationRate="fast"
        bounces={false}
        nestedScrollEnabled={true}
        getItemLayout={(_, index) => ({ length: WHEEL_ITEM_HEIGHT, offset: WHEEL_ITEM_HEIGHT * index, index })}
        onScrollBeginDrag={() => { isScrolling.current = true; }}
        onMomentumScrollEnd={(e) => {
          isScrolling.current = false;
          const idx = Math.round(e.nativeEvent.contentOffset.y / WHEEL_ITEM_HEIGHT);
          if (idx >= 0 && idx < items.length && idx !== selectedIndex) {
            onSelect(idx);
          }
        }}
        renderItem={({ item, index }) => {
          const realIndex = index - padding;
          const isSelected = realIndex === selectedIndex;
          return (
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => {
                if (item.value !== null) {
                  onSelect(realIndex);
                }
              }}
              style={{ height: WHEEL_ITEM_HEIGHT, justifyContent: 'center', alignItems: 'center' }}
            >
              <Text style={{
                fontSize: isSelected ? 20 : 16,
                fontWeight: isSelected ? '700' : '400',
                color: item.value === null ? 'transparent' : (isSelected ? '#fff' : 'rgba(255,255,255,0.35)'),
              }}>
                {item.label}
              </Text>
            </TouchableOpacity>
          );
        }}
      />
      <View pointerEvents="none" style={{
        position: 'absolute',
        top: WHEEL_ITEM_HEIGHT * padding,
        left: 0, right: 0,
        height: WHEEL_ITEM_HEIGHT,
        borderTopWidth: 1, borderBottomWidth: 1,
        borderColor: 'rgba(251, 191, 36, 0.4)',
        backgroundColor: 'rgba(251, 191, 36, 0.08)',
      }} />
    </View>
  );
};

// ============================================
// DATE/TIME PICKERS (rendered as overlays, not nested Modals)
// ============================================
const DatePickerModal = ({ visible, onClose, onConfirm, initialDate }) => {
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 50 }, (_, i) => currentYear - 49 + i);

  const parsed = initialDate ? new Date(initialDate + 'T00:00:00') : new Date();
  const [monthIdx, setMonthIdx] = useState(parsed.getMonth());
  const [dayIdx, setDayIdx] = useState(parsed.getDate() - 1);
  const [yearIdx, setYearIdx] = useState(years.indexOf(parsed.getFullYear()) >= 0 ? years.indexOf(parsed.getFullYear()) : years.length - 1);

  useEffect(() => {
    if (visible) {
      const p = initialDate ? new Date(initialDate + 'T00:00:00') : new Date();
      setMonthIdx(p.getMonth());
      setDayIdx(p.getDate() - 1);
      setYearIdx(years.indexOf(p.getFullYear()) >= 0 ? years.indexOf(p.getFullYear()) : years.length - 1);
    }
  }, [visible]);

  if (!visible) return null;

  const daysInMonth = new Date(years[yearIdx], monthIdx + 1, 0).getDate();
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const clampedDayIdx = Math.min(dayIdx, daysInMonth - 1);

  const monthItems = months.map((m, i) => ({ label: m, value: i }));
  const dayItems = days.map(d => ({ label: String(d), value: d }));
  const yearItems = years.map(y => ({ label: String(y), value: y }));

  return (
    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 999 }}>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' }} />
      </TouchableWithoutFeedback>
      <View style={{ backgroundColor: '#1a1a2e', borderRadius: 20, marginHorizontal: 16, marginBottom: 20, paddingBottom: 20 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.1)' }}>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 16 }}>Cancel</Text>
          </TouchableOpacity>
          <Text style={{ color: '#fff', fontSize: 17, fontWeight: '600' }}>Select Date</Text>
          <TouchableOpacity hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} onPress={() => {
            const y = years[yearIdx];
            const m = String(monthIdx + 1).padStart(2, '0');
            const d = String(clampedDayIdx + 1).padStart(2, '0');
            onConfirm(`${y}-${m}-${d}`);
          }}>
            <Text style={{ color: '#fbbf24', fontSize: 16, fontWeight: '600' }}>Done</Text>
          </TouchableOpacity>
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'center', paddingVertical: 8 }}>
          <WheelPicker items={monthItems} selectedIndex={monthIdx} onSelect={setMonthIdx} width={80} />
          <WheelPicker items={dayItems} selectedIndex={clampedDayIdx} onSelect={setDayIdx} width={60} />
          <WheelPicker items={yearItems} selectedIndex={yearIdx} onSelect={setYearIdx} width={80} />
        </View>
      </View>
    </View>
  );
};

const TimePickerModal = ({ visible, onClose, onConfirm, initialTime }) => {
  // Parse 24h time into 12h components
  const parse24h = (t) => {
    const p = (t || '').split(':');
    const h24 = p.length === 2 ? parseInt(p[0]) || 0 : 12;
    const min = p.length === 2 ? parseInt(p[1]) || 0 : 0;
    const h12 = h24 === 0 ? 12 : h24 > 12 ? h24 - 12 : h24;
    const ampm = h24 >= 12 ? 1 : 0;
    return { hourIdx: h12 - 1, minuteIdx: min, amPmIdx: ampm };
  };

  const init = parse24h(initialTime);
  const [hourIdx, setHourIdx] = useState(init.hourIdx);
  const [minuteIdx, setMinuteIdx] = useState(init.minuteIdx);
  const [amPmIdx, setAmPmIdx] = useState(init.amPmIdx);

  useEffect(() => {
    if (visible) {
      const v = parse24h(initialTime);
      setHourIdx(v.hourIdx);
      setMinuteIdx(v.minuteIdx);
      setAmPmIdx(v.amPmIdx);
    }
  }, [visible]);

  if (!visible) return null;

  const hourItems = Array.from({ length: 12 }, (_, i) => ({ label: String(i + 1), value: i + 1 }));
  const minuteItems = Array.from({ length: 60 }, (_, i) => ({ label: String(i).padStart(2, '0'), value: i }));
  const amPmItems = [{ label: 'AM', value: 0 }, { label: 'PM', value: 1 }];

  return (
    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 999 }}>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' }} />
      </TouchableWithoutFeedback>
      <View style={{ backgroundColor: '#1a1a2e', borderRadius: 20, marginHorizontal: 16, marginBottom: 20, paddingBottom: 20 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.1)' }}>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 16 }}>Cancel</Text>
          </TouchableOpacity>
          <Text style={{ color: '#fff', fontSize: 17, fontWeight: '600' }}>Select Time</Text>
          <TouchableOpacity hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} onPress={() => {
            // Convert 12h back to 24h for storage
            const h12 = hourIdx + 1;
            const h24 = amPmIdx === 0 ? (h12 === 12 ? 0 : h12) : (h12 === 12 ? 12 : h12 + 12);
            const h = String(h24).padStart(2, '0');
            const m = String(minuteIdx).padStart(2, '0');
            onConfirm(`${h}:${m}`);
          }}>
            <Text style={{ color: '#fbbf24', fontSize: 16, fontWeight: '600' }}>Done</Text>
          </TouchableOpacity>
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', paddingVertical: 8 }}>
          <WheelPicker items={hourItems} selectedIndex={hourIdx} onSelect={setHourIdx} width={60} />
          <Text style={{ color: '#fff', fontSize: 24, fontWeight: '700', marginHorizontal: 2 }}>:</Text>
          <WheelPicker items={minuteItems} selectedIndex={minuteIdx} onSelect={setMinuteIdx} width={60} />
          <WheelPicker items={amPmItems} selectedIndex={amPmIdx} onSelect={setAmPmIdx} width={56} />
        </View>
      </View>
    </View>
  );
};

// Modal wrapper with proper keyboard handling and smooth scrolling
const ModalWrapper = ({ visible, onClose, title, children, colors, isDarkMode }) => {
  // Default colors for backwards compatibility (dark theme)
  const modalBg = colors ? (isDarkMode ? '#1a1a2e' : '#ffffff') : '#1a1a2e';
  const textColor = colors ? colors.text : '#fff';
  const borderColor = colors ? colors.border : 'rgba(255,255,255,0.1)';
  const buttonBg = colors ? (isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)') : 'rgba(255,255,255,0.1)';

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.modalOverlay}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={[styles.modalKeyboardView, { backgroundColor: modalBg }]}
        >
          <View style={[styles.modalContent, { backgroundColor: modalBg }]}>
            {/* Header - always visible */}
            <View style={[styles.modalHeader, { borderBottomColor: borderColor }]}>
              <Text style={[styles.modalTitle, { color: textColor }]}>{title}</Text>
              <TouchableOpacity
                onPress={onClose}
                style={[styles.closeButton, { backgroundColor: buttonBg }]}
                hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}
              >
                <Text style={[styles.closeButtonText, { color: textColor }]}>✕</Text>
              </TouchableOpacity>
            </View>

            {/* Content - scrollable with keyboard dismiss on scroll */}
            <ScrollView
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: 40 }}
            >
              {children}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
};

// ============================================
// MAIN APP
// ============================================

/**
 * Client-side market hours check (fallback for backend)
 * Markets open: Sunday 6pm ET → Friday 5pm ET
 * Markets closed: Friday 5pm ET → Sunday 6pm ET
 */
function isMarketClosedClientSide() {
  try {
    const now = new Date();
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      hour12: false,
      weekday: 'short',
      hour: 'numeric',
      minute: 'numeric',
    });
    const parts = {};
    for (const p of fmt.formatToParts(now)) {
      parts[p.type] = p.value;
    }
    const dayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    const day = dayMap[parts.weekday];
    const hour = parseInt(parts.hour, 10);

    const closed = (day === 6) || (day === 0 && hour < 18) || (day === 5 && hour >= 17);
    if (__DEV__) console.log(`🕐 Client market check: ET ${parts.weekday} ${hour}:${String(parseInt(parts.minute, 10)).padStart(2, '0')} → ${closed ? 'CLOSED' : 'OPEN'}`);
    return closed;
  } catch (e) {
    return false;
  }
}

// Swipeable alert row using react-native-gesture-handler's Swipeable
const SwipeableAlertRow = ({ alert, colors, onDelete, onToggle, spotPrices }) => {
  const metalAccent = { gold: '#D4A843', silver: '#C0C0C0', platinum: '#7BB3D4', palladium: '#6BBF8A' };
  const metalLabel = alert.metal.charAt(0).toUpperCase() + alert.metal.slice(1);
  const accentColor = metalAccent[alert.metal] || metalAccent.silver;
  const currentSpot = spotPrices?.[alert.metal] || 0;
  const isActive = alert.enabled !== false;
  const arrow = alert.direction === 'above' ? '↑' : '↓';
  const swipeableRef = useRef(null);

  const renderRightActions = () => (
    <TouchableOpacity
      onPress={() => {
        swipeableRef.current?.close();
        onDelete(alert.id);
      }}
      style={{
        backgroundColor: '#D32F2F', justifyContent: 'center', alignItems: 'center',
        width: 80, borderTopRightRadius: 12, borderBottomRightRadius: 12,
      }}
    >
      <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>Delete</Text>
    </TouchableOpacity>
  );

  return (
    <View style={{ marginBottom: 10, borderRadius: 12, overflow: 'hidden' }}>
      <Swipeable ref={swipeableRef} renderRightActions={renderRightActions} overshootRight={false} friction={2}>
        <View style={{
          flexDirection: 'row', alignItems: 'center',
          backgroundColor: '#1e1e1e',
          borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
          overflow: 'hidden',
        }}>
          {/* Left accent bar */}
          <View style={{ width: 4, alignSelf: 'stretch', backgroundColor: accentColor }} />
          {/* Text content */}
          <View style={{ flex: 1, paddingVertical: 14, paddingLeft: 12, paddingRight: 4 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 3 }}>
              <Text style={{ color: accentColor, fontWeight: '700', fontSize: 15 }}>{metalLabel}</Text>
              <Text style={{ color: alert.direction === 'above' ? '#4CAF50' : '#F44336', fontWeight: '700', fontSize: 15 }}>
                {arrow} {alert.direction === 'above' ? 'Above' : 'Below'}
              </Text>
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>${parseFloat(alert.targetPrice).toFixed(2)}</Text>
            </View>
            <Text style={{ color: 'rgba(255,255,255,0.45)', fontSize: 12 }}>
              Current: ${currentSpot > 0 ? currentSpot.toFixed(2) : '—'}/oz
            </Text>
          </View>
          {/* Toggle switch */}
          <View style={{ paddingRight: 12 }}>
            <Switch
              value={isActive}
              onValueChange={(val) => onToggle(alert.id, val)}
              trackColor={{ false: '#555', true: '#4CAF50' }}
              thumbColor="#fff"
              ios_backgroundColor="#555"
              style={{ transform: [{ scale: 0.85 }] }}
            />
          </View>
        </View>
      </Swipeable>
    </View>
  );
};

/**
 * Monotone cubic interpolation (Fritsch–Carlson) — produces smooth curves that
 * never overshoot data points, matching Recharts' type="monotone" on web.
 * Takes an array of {x, y} points and returns an SVG path string.
 */
/** Downsample an array to maxPoints using evenly-spaced sampling.
 *  Always preserves first and last elements for accurate start/end values. */
const downsamplePoints = (data, maxPoints) => {
  if (data.length <= maxPoints) return data;
  const step = (data.length - 1) / (maxPoints - 1);
  return Array.from({ length: maxPoints }, (_, i) => data[Math.round(i * step)]);
};

const buildMonotonePath = (points) => {
  const n = points.length;
  if (n === 0) return '';
  if (n === 1) return `M${points[0].x.toFixed(1)},${points[0].y.toFixed(1)}`;
  if (n === 2) return `M${points[0].x.toFixed(1)},${points[0].y.toFixed(1)} L${points[1].x.toFixed(1)},${points[1].y.toFixed(1)}`;

  // 1. Compute slopes between consecutive points
  const dx = [], dy = [], m = [];
  for (let i = 0; i < n - 1; i++) {
    dx.push(points[i + 1].x - points[i].x);
    dy.push(points[i + 1].y - points[i].y);
    m.push(dx[i] === 0 ? 0 : dy[i] / dx[i]);
  }

  // 2. Compute tangent at each point (Fritsch–Carlson)
  const tangents = new Array(n);
  tangents[0] = m[0];
  tangents[n - 1] = m[n - 2];
  for (let i = 1; i < n - 1; i++) {
    if (m[i - 1] * m[i] <= 0) {
      tangents[i] = 0;
    } else {
      tangents[i] = (m[i - 1] + m[i]) / 2;
    }
  }

  // 3. Adjust tangents to ensure monotonicity
  for (let i = 0; i < n - 1; i++) {
    if (m[i] === 0) {
      tangents[i] = 0;
      tangents[i + 1] = 0;
    } else {
      const a = tangents[i] / m[i];
      const b = tangents[i + 1] / m[i];
      const s = a * a + b * b;
      if (s > 9) {
        const t = 3 / Math.sqrt(s);
        tangents[i] = t * a * m[i];
        tangents[i + 1] = t * b * m[i];
      }
    }
  }

  // 4. Build cubic bezier path
  let d = `M${points[0].x.toFixed(1)},${points[0].y.toFixed(1)}`;
  for (let i = 0; i < n - 1; i++) {
    const seg = dx[i] / 3;
    const cp1x = points[i].x + seg;
    const cp1y = points[i].y + tangents[i] * seg;
    const cp2x = points[i + 1].x - seg;
    const cp2y = points[i + 1].y - tangents[i + 1] * seg;
    d += ` C${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${points[i + 1].x.toFixed(1)},${points[i + 1].y.toFixed(1)}`;
  }
  return d;
};

/**
 * ScrubSparkline — sparkline with long-press-to-scrub crosshair and tooltip.
 * Uses onTouchStart/Move/End so it doesn't block ScrollView scroll.
 * Long press (~200ms) activates scrubbing; moving before that lets scroll happen.
 */
const ScrubSparkline = ({ dataPoints, timestamps, svgW, svgH, strokeColor, gradientId, formatValue, label, style, baselineValue }) => {
  const [scrubIndex, setScrubIndex] = useState(null);
  const scrubIndexRef = useRef(null);
  const containerRef = useRef(null);
  const containerX = useRef(0);
  const containerW = useRef(0);
  const longPressTimer = useRef(null);
  const isActive = useRef(false);
  const startPageX = useRef(0);
  const startPageY = useRef(0);

  const dataMin = Math.min(...dataPoints);
  const dataMax = Math.max(...dataPoints);
  const rawRange = dataMax - dataMin;
  // Minimum 0.5% visual range so flat days still show movement
  const minRange = Math.abs(dataMin) * 0.005 || 1;
  const range = Math.max(rawRange, minRange);
  // Center data if artificial range was applied
  const min = rawRange < minRange ? dataMin - (minRange - rawRange) / 2 : dataMin;

  // Tight padding — 2px top/bottom for compact, dramatic sparklines
  const pad = 2;

  // Build points array — downsample large datasets, then always use monotone cubic interpolation
  const sampledData = downsamplePoints(dataPoints, svgH > 40 ? 60 : 24);
  const pts = sampledData.map((v, i) => ({
    x: (i / (sampledData.length - 1)) * svgW,
    y: pad + (svgH - pad * 2) * (1 - (v - min) / range),
  }));
  const pathD = buildMonotonePath(pts);
  const fillD = `${pathD} L${svgW},${svgH} L0,${svgH} Z`;

  // Previous-close baseline Y position
  const baselineY = baselineValue !== undefined ? pad + (svgH - pad * 2) * (1 - (baselineValue - min) / range) : null;

  const getScrubDataIndex = (pageX) => {
    const relX = pageX - containerX.current;
    const pct = Math.max(0, Math.min(1, relX / containerW.current));
    return Math.round(pct * (dataPoints.length - 1));
  };

  const updateScrub = (pageX) => {
    const idx = getScrubDataIndex(pageX);
    if (idx !== scrubIndexRef.current) {
      scrubIndexRef.current = idx;
      setScrubIndex(idx);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  };

  const handleTouchStart = (e) => {
    const { pageX, pageY } = e.nativeEvent;
    startPageX.current = pageX;
    startPageY.current = pageY;
    // Measure container position fresh on each touch
    containerRef.current?.measureInWindow?.((x, _y, w) => {
      containerX.current = x;
      containerW.current = w;
    });
    longPressTimer.current = setTimeout(() => {
      isActive.current = true;
      updateScrub(pageX);
    }, 200);
  };

  const handleTouchMove = (e) => {
    const { pageX, pageY } = e.nativeEvent;
    if (isActive.current) {
      updateScrub(pageX);
    } else if (longPressTimer.current) {
      // If finger moved >10px before long press fired, cancel — let scroll happen
      const dx = Math.abs(pageX - startPageX.current);
      const dy = Math.abs(pageY - startPageY.current);
      if (dx > 10 || dy > 10) {
        clearTimeout(longPressTimer.current);
        longPressTimer.current = null;
      }
    }
  };

  const handleTouchEnd = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    isActive.current = false;
    scrubIndexRef.current = null;
    setScrubIndex(null);
  };

  // Crosshair position in SVG coords
  const scrubXSvg = scrubIndex !== null ? (scrubIndex / (dataPoints.length - 1)) * svgW : 0;
  const scrubYSvg = scrubIndex !== null ? pad + (svgH - pad * 2) * (1 - (dataPoints[scrubIndex] - min) / range) : 0;

  const formatTime = (isoStr) => {
    if (!isoStr) return '';
    const d = new Date(isoStr);
    const h = d.getHours();
    const m = d.getMinutes();
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 || 12;
    return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
  };

  return (
    <View
      ref={containerRef}
      onLayout={(e) => { containerW.current = e.nativeEvent.layout.width; }}
      style={style}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
      // When scrub is active, tell parent ScrollView not to steal the touch
      onStartShouldSetResponder={() => false}
      onMoveShouldSetResponder={() => isActive.current}
      onResponderTerminationRequest={() => !isActive.current}
    >
      {/* Floating tooltip */}
      {scrubIndex !== null && (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: -38,
            left: Math.max(0, Math.min((scrubIndex / (dataPoints.length - 1)) * containerW.current - 60, containerW.current - 120)),
            backgroundColor: 'rgba(0,0,0,0.85)',
            borderRadius: 8,
            paddingHorizontal: 10,
            paddingVertical: 5,
            zIndex: 10,
            borderWidth: 1,
            borderColor: 'rgba(255,255,255,0.15)',
          }}
        >
          <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>
            {label ? `${label}: ` : ''}{formatValue ? formatValue(dataPoints[scrubIndex]) : `$${dataPoints[scrubIndex].toFixed(2)}`}
          </Text>
          <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 10 }}>
            {timestamps && timestamps[scrubIndex] ? formatTime(timestamps[scrubIndex]) : ''}
          </Text>
        </View>
      )}
      <Svg width="100%" height={svgH} viewBox={`0 0 ${svgW} ${svgH}`} preserveAspectRatio="none">
        <Defs>
          <SvgLinearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={strokeColor} stopOpacity="0.3" />
            <Stop offset="1" stopColor={strokeColor} stopOpacity="0" />
          </SvgLinearGradient>
        </Defs>
        {/* Previous-close baseline — behind sparkline */}
        {baselineY !== null && (
          <Line x1={0} y1={baselineY} x2={svgW} y2={baselineY} stroke="rgba(255,255,255,0.25)" strokeWidth={0.75} strokeDasharray="4 3" />
        )}
        <Path d={fillD} fill={`url(#${gradientId})`} />
        <Path d={pathD} stroke={strokeColor} strokeWidth={svgH > 40 ? 2 : 1.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        {/* Crosshair line + dot */}
        {scrubIndex !== null && (
          <>
            <Line x1={scrubXSvg} y1={0} x2={scrubXSvg} y2={svgH} stroke="rgba(255,255,255,0.4)" strokeWidth={1} strokeDasharray="3,2" />
            <Circle cx={scrubXSvg} cy={scrubYSvg} r={4} fill={strokeColor} stroke="#fff" strokeWidth={1.5} />
          </>
        )}
      </Svg>
    </View>
  );
};

/**
 * ScrubChart — larger chart with y-axis labels, x-axis date labels, and long-press scrubber.
 * Replaces react-native-chart-kit LineChart for Analytics spot price charts.
 */
const ScrubChart = ({ data, color, fillColor, width, height, range, decimalPlaces = 0, chartId = 'default', yFormat, tooltipFormat, secondaryData, secondaryColor }) => {
  const [scrubIndex, setScrubIndex] = useState(null);
  const scrubIndexRef = useRef(null);
  const containerRef = useRef(null);
  const containerX = useRef(0);
  const containerW = useRef(0);
  const longPressTimer = useRef(null);
  const isActive = useRef(false);
  const startPageX = useRef(0);
  const startPageY = useRef(0);
  const gradientId = `scrubChartFill-${chartId}`;

  // Chart layout
  const yLabelW = 52;
  const xLabelH = 18;
  const topPad = 6;
  const rightPad = 8;
  const chartW = width - yLabelW - rightPad;
  const chartH = height - xLabelH - topPad;

  // Filter out invalid data points and ensure ascending date order
  data = data.filter(d => d.value != null && !isNaN(d.value) && d.value > 0);
  data.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  // Filter out spike artifacts: drop points where value deviates >35% from neighbors' average
  // (real prices don't jump 35% between 15-min data points; sustained jumps are preserved)
  if (data.length > 2) {
    data = data.filter((pt, i) => {
      if (i === 0 || i === data.length - 1) return true;
      const prev = data[i - 1].value;
      const next = data[i + 1].value;
      const avgNeighbor = (prev + next) / 2;
      if (avgNeighbor === 0) return true;
      return Math.abs(pt.value - avgNeighbor) / avgNeighbor < 0.35;
    });
  }

  // Filter out stale data plateaus: when 3+ consecutive points have identical values,
  // keep only the first and last (these represent missing data where last price was carried forward)
  if (data.length > 3) {
    const filtered = [];
    let i = 0;
    while (i < data.length) {
      let j = i;
      while (j < data.length && data[j].value === data[i].value) j++;
      const runLen = j - i;
      if (runLen >= 3) {
        // Long plateau: keep first and last only
        filtered.push(data[i]);
        if (j - 1 > i) filtered.push(data[j - 1]);
      } else {
        // Short run: keep all points
        for (let k = i; k < j; k++) filtered.push(data[k]);
      }
      i = j;
    }
    data = filtered;
  }

  if (data.length < 2) return <View style={{ height }} />;

  // Data bounds (include secondary data in range if present)
  const values = data.map(d => d.value);
  const secValues = secondaryData ? secondaryData.filter(d => d.value != null && d.value > 0).map(d => d.value) : [];
  const allValues = [...values, ...secValues];
  const minVal = Math.min(...allValues);
  const maxVal = Math.max(...allValues);
  const valRange = maxVal - minVal || 1;
  const niceMin = minVal - valRange * 0.02;
  const niceMax = maxVal + valRange * 0.02;
  const niceRange = niceMax - niceMin;

  // SVG viewBox dimensions
  const svgW = chartW;
  const svgH = chartH;

  // Build path — downsample large datasets, always use monotone cubic interpolation
  const sampledChartData = downsamplePoints(data, 120);
  const pts = sampledChartData.map((pt, i) => ({
    x: (i / (sampledChartData.length - 1)) * svgW,
    y: topPad + svgH * (1 - (pt.value - niceMin) / niceRange),
  }));
  const pathD = buildMonotonePath(pts);
  const fillD = `${pathD} L${svgW},${topPad + svgH} L0,${topPad + svgH} Z`;

  // Build secondary path (optional, e.g. eligible line on vault chart)
  let secondaryPathD = null;
  if (secondaryData && secondaryData.length >= 2) {
    const secFiltered = secondaryData.filter(d => d.value != null && d.value > 0);
    if (secFiltered.length >= 2) {
      const sampledSec = downsamplePoints(secFiltered, 120);
      const secPts = sampledSec.map((pt, i) => ({
        x: (i / (sampledSec.length - 1)) * svgW,
        y: topPad + svgH * (1 - (pt.value - niceMin) / niceRange),
      }));
      secondaryPathD = buildMonotonePath(secPts);
    }
  }

  // Y-axis labels (5 levels)
  const yLabelCount = 5;
  const yLabels = [];
  for (let i = 0; i < yLabelCount; i++) {
    yLabels.push(maxVal - (i / (yLabelCount - 1)) * (maxVal - minVal));
  }
  const formatY = yFormat || ((v) => {
    if (v >= 100000) {
      const kVal = v / 1000;
      const kRange = valRange / 1000;
      if (kRange < 5) return `$${kVal.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}k`;
      return `$${kVal.toLocaleString('en-US', { maximumFractionDigits: 0 })}k`;
    }
    return `$${Math.round(v).toLocaleString('en-US')}`;
  });

  // X-axis labels (5 evenly spaced, deduplicated)
  const xLabelCount = 5;
  const xLabels = [];
  const seenLabels = new Set();
  for (let n = 0; n < xLabelCount; n++) {
    const i = n === xLabelCount - 1 ? data.length - 1 : Math.round(n * (data.length - 1) / (xLabelCount - 1));
    const dateStr = data[i].date;
    const d = dateStr.includes('T') ? new Date(dateStr) : new Date(dateStr + 'T12:00:00');
    let label;
    const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    if (isNaN(d.getTime())) label = '';
    else if (range === 'ALL' || range === '5Y') label = `${d.getFullYear()}`;
    else if (range === '1Y' || range === '6M') label = `${monthNames[d.getMonth()]} '${String(d.getFullYear()).slice(-2)}`;
    else label = `${d.getMonth() + 1}/${d.getDate()}`;
    if (!seenLabels.has(label)) {
      seenLabels.add(label);
      xLabels.push({ i, label, x: (i / (data.length - 1)) * svgW });
    }
  }

  // Grid lines
  const gridYs = yLabels.map(v => topPad + svgH * (1 - (v - niceMin) / niceRange));

  // Scrub touch handlers
  const getScrubIndex = (pageX) => {
    const relX = pageX - containerX.current - yLabelW;
    const pct = Math.max(0, Math.min(1, relX / chartW));
    return Math.round(pct * (data.length - 1));
  };

  const updateScrub = (pageX) => {
    const idx = getScrubIndex(pageX);
    if (idx !== scrubIndexRef.current) {
      scrubIndexRef.current = idx;
      setScrubIndex(idx);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  };

  const handleTouchStart = (e) => {
    const { pageX, pageY } = e.nativeEvent;
    startPageX.current = pageX;
    startPageY.current = pageY;
    containerRef.current?.measureInWindow?.((x, _y, w) => {
      containerX.current = x;
      containerW.current = w;
    });
    longPressTimer.current = setTimeout(() => {
      isActive.current = true;
      updateScrub(pageX);
    }, 200);
  };

  const handleTouchMove = (e) => {
    const { pageX, pageY } = e.nativeEvent;
    if (isActive.current) {
      updateScrub(pageX);
    } else if (longPressTimer.current) {
      const dx = Math.abs(pageX - startPageX.current);
      const dy = Math.abs(pageY - startPageY.current);
      if (dx > 10 || dy > 10) {
        clearTimeout(longPressTimer.current);
        longPressTimer.current = null;
      }
    }
  };

  const handleTouchEnd = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    isActive.current = false;
    scrubIndexRef.current = null;
    setScrubIndex(null);
  };

  // Scrub position
  const scrubXSvg = scrubIndex !== null ? (scrubIndex / (data.length - 1)) * svgW : 0;
  const scrubYSvg = scrubIndex !== null ? topPad + svgH * (1 - (data[scrubIndex].value - niceMin) / niceRange) : 0;

  const formatDate = (dateStr) => {
    const d = dateStr.includes('T') ? new Date(dateStr) : new Date(dateStr + 'T12:00:00');
    if (isNaN(d.getTime())) return dateStr;
    return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
  };

  const formatPrice = tooltipFormat || ((v) => {
    if (decimalPlaces > 0) return `$${v.toFixed(decimalPlaces)}`;
    return `$${v.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
  });

  return (
    <View
      ref={containerRef}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
      onStartShouldSetResponder={() => false}
      onMoveShouldSetResponder={() => isActive.current}
      onResponderTerminationRequest={() => !isActive.current}
    >
      {/* Floating tooltip */}
      {scrubIndex !== null && (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: -40,
            left: Math.max(0, Math.min(yLabelW + (scrubIndex / (data.length - 1)) * chartW - 70, width - 140)),
            backgroundColor: 'rgba(0,0,0,0.9)',
            borderRadius: 8,
            paddingHorizontal: 10,
            paddingVertical: 5,
            zIndex: 10,
            borderWidth: 1,
            borderColor: 'rgba(255,255,255,0.15)',
          }}
        >
          <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>
            {formatPrice(data[scrubIndex].value)}
          </Text>
          <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 10 }}>
            {formatDate(data[scrubIndex].date)}
          </Text>
        </View>
      )}
      <View style={{ flexDirection: 'row' }}>
        {/* Y-axis labels */}
        <View style={{ width: yLabelW, height: chartH + topPad, justifyContent: 'space-between', paddingVertical: 2 }}>
          {yLabels.map((v, i) => (
            <Text key={i} style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10, textAlign: 'right', paddingRight: 4 }}>
              {formatY(v)}
            </Text>
          ))}
        </View>
        {/* SVG chart */}
        <Svg width={chartW} height={chartH + topPad}>
          {/* Grid lines */}
          {gridYs.map((y, i) => (
            <Line key={i} x1={0} y1={y} x2={svgW} y2={y} stroke="rgba(255,255,255,0.06)" strokeWidth={1} />
          ))}
          {/* Fill */}
          <Defs>
            <SvgLinearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={color} stopOpacity="0.2" />
              <Stop offset="1" stopColor={color} stopOpacity="0" />
            </SvgLinearGradient>
          </Defs>
          <Path d={fillD} fill={`url(#${gradientId})`} />
          <Path d={pathD} stroke={color} strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
          {/* Secondary line (e.g. eligible inventory) */}
          {secondaryPathD && (
            <Path d={secondaryPathD} stroke={secondaryColor || 'rgba(255,255,255,0.4)'} strokeWidth={1.5} fill="none" strokeDasharray="4,3" strokeLinecap="round" strokeLinejoin="round" />
          )}
          {/* Crosshair */}
          {scrubIndex !== null && (
            <>
              <Line x1={scrubXSvg} y1={0} x2={scrubXSvg} y2={topPad + svgH} stroke="rgba(255,255,255,0.4)" strokeWidth={1} strokeDasharray="3,2" />
              <Circle cx={scrubXSvg} cy={scrubYSvg} r={4} fill={color} stroke="#fff" strokeWidth={1.5} />
            </>
          )}
        </Svg>
      </View>
      {/* X-axis labels */}
      <View style={{ flexDirection: 'row', marginLeft: yLabelW, width: chartW, marginTop: 2 }}>
        {xLabels.map((lbl, i) => (
          <Text
            key={i}
            style={{
              color: 'rgba(255,255,255,0.4)',
              fontSize: 10,
              position: 'absolute',
              left: lbl.x - 18,
              width: 36,
              textAlign: 'center',
            }}
          >
            {lbl.label}
          </Text>
        ))}
      </View>
    </View>
  );
};

// Main app content (wrapped by ErrorBoundary below)
function AppContent() {
  // Safe area insets for proper spacing around system UI (navigation bar, notch, etc.)
  const insets = useSafeAreaInsets();

  // Preview system
  const { openPreview, setOnOpenFull } = usePreview();

  // Register "Open full" handler — navigates from preview to the relevant screen
  useEffect(() => {
    setOnOpenFull((content) => {
      if (!content) return;
      switch (content.type) {
        case 'portfolio': setCurrentScreen('MyStack'); break;
        case 'chart': setCurrentScreen('Analytics'); break;
        case 'cost_basis': setCurrentScreen('Analytics'); break;
        case 'daily_brief': setCurrentScreen('Dashboard'); break;
        case 'signal_article': setCurrentScreen('StackSignal'); break;
        case 'dealer_comparison': setCurrentScreen('CompareDealers'); break;
        case 'speculation': setCurrentScreen('Analytics'); break;
        case 'purchasing_power': setCurrentScreen('Analytics'); break;
        default: break;
      }
    });
  }, [setOnOpenFull]);

  // Supabase Auth
  const { user: supabaseUser, session, loading: authLoading, signOut: supabaseSignOut, linkedProviders, linkWithGoogle, linkWithApple } = useAuth();
  const [guestMode, setGuestMode] = useState(null); // null = loading, true = guest, false = require auth
  const [showAuthScreen, setShowAuthScreen] = useState(false);
  const [showAccountScreen, setShowAccountScreen] = useState(false);
  const [showResetPasswordScreen, setShowResetPasswordScreen] = useState(false);

  // Supabase Holdings Sync
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncError, setSyncError] = useState(null);
  const [hasSyncedOnce, setHasSyncedOnce] = useState(false);

  // Theme
  const systemColorScheme = useColorScheme();
  const [themePreference, setThemePreference] = useState('dark'); // 'dark', 'light', 'system'
  const [largeText, setLargeText] = useState(false); // Accessibility: increase font sizes
  const [hideWidgetValues, setHideWidgetValues] = useState(false); // Widget: hide dollar amounts

  // Derive actual theme from preference
  const isDarkMode = themePreference === 'system'
    ? systemColorScheme !== 'light'
    : themePreference === 'dark';

  // Font size multiplier for accessibility
  const fontScale = largeText ? 1.25 : 1;

  // Scaled font sizes for accessibility - apply to key text elements
  const scaledFonts = {
    huge: Math.round(32 * fontScale),      // Main portfolio value
    xlarge: Math.round(24 * fontScale),    // Spot prices, section values
    large: Math.round(18 * fontScale),     // Card titles, headers
    medium: Math.round(16 * fontScale),    // Button text, important labels
    normal: Math.round(14 * fontScale),    // Body text
    small: Math.round(12 * fontScale),     // Secondary text, descriptions
    tiny: Math.round(10 * fontScale),      // Timestamps, hints
  };

  // Core State
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [currentScreen, setCurrentScreen] = useState('TroyChat');
  const [previousScreen, setPreviousScreen] = useState('TroyChat');
  const [metalTab, setMetalTab] = useState('both'); // Changed from 'silver' to 'both'

  // Spot Prices - Updated defaults for Dec 2025
  const [silverSpot, setSilverSpot] = useState(77);
  const [goldSpot, setGoldSpot] = useState(4530);
  const [platinumSpot, setPlatinumSpot] = useState(2100);
  const [palladiumSpot, setPalladiumSpot] = useState(1740);
  const [priceSource, setPriceSource] = useState('cached');
  const [priceTimestamp, setPriceTimestamp] = useState(null);
  const [spotPricesLive, setSpotPricesLive] = useState(false); // True after successful API fetch

  // Spot Price Daily Change
  const [spotChange, setSpotChange] = useState({
    gold: { amount: null, percent: null, prevClose: null },
    silver: { amount: null, percent: null, prevClose: null },
    platinum: { amount: null, percent: null, prevClose: null },
    palladium: { amount: null, percent: null, prevClose: null },
  });
  const [spotChangeDisplayMode, setSpotChangeDisplayMode] = useState('percent'); // 'percent' or 'amount'
  const [marketsClosed, setMarketsClosed] = useState(false); // True when markets are closed (Fri 5pm - Sun 6pm ET)


  // Portfolio Data
  const [silverItems, setSilverItems] = useState([]);
  const [goldItems, setGoldItems] = useState([]);
  const [platinumItems, setPlatinumItems] = useState([]);
  const [palladiumItems, setPalladiumItems] = useState([]);
  const [dataLoaded, setDataLoaded] = useState(false); // Prevents saving until initial load completes

  // Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [showLedgerPinModal, setShowLedgerPinModal] = useState(false);
  const [ledgerPinDigits, setLedgerPinDigits] = useState(['', '', '', '']);
  const ledgerPinRefs = useRef([null, null, null, null]);
  const [ledgerGenerating, setLedgerGenerating] = useState(false);
  const [showPrivacyModal, setShowPrivacyModal] = useState(false);
  const [showSpeculationModal, setShowSpeculationModal] = useState(false);
  const [showJunkCalcModal, setShowJunkCalcModal] = useState(false);
  const [showPremiumAnalysisModal, setShowPremiumAnalysisModal] = useState(false);
  const [showPaywallModal, setShowPaywallModal] = useState(false);
  const [showDealerPrices, setShowDealerPrices] = useState(false);
  const [dealerMetal, setDealerMetal] = useState('silver');
  const [dealerData, setDealerData] = useState(null);
  const [dealerLoading, setDealerLoading] = useState(false);
  const [dealerError, setDealerError] = useState(null);

  useEffect(() => {
    if (!showDealerPrices) return;
    let cancelled = false;
    setDealerLoading(true);
    setDealerError(null);
    fetch(`${API_BASE_URL}/v1/dealer-prices?metal=${dealerMetal}`)
      .then(r => {
        if (!r.ok) throw new Error(`${r.status}`);
        return r.json();
      })
      .then(data => {
        if (!cancelled) { setDealerData(data); setDealerLoading(false); }
      })
      .catch(err => {
        if (!cancelled) { setDealerError(err.message); setDealerLoading(false); }
      });
    return () => { cancelled = true; };
  }, [dealerMetal, showDealerPrices]);

  const [showTutorial, setShowTutorial] = useState(false);
  const [forceUpdate, setForceUpdate] = useState(null);

  // Screenshot Mode (dev only — for App Store screenshots)
  const [screenshotMode, setScreenshotMode] = useState(false);
  const [versionTapCount, setVersionTapCount] = useState(0);
  const versionTapTimer = useRef(null);

  // Troy state
  const [troyConversations, setTroyConversations] = useState([]);
  const [activeConversationId, setActiveConversationId] = useState(null);
  const [troyMessages, setTroyMessages] = useState([]);
  const [troyLoading, setTroyLoading] = useState(false);
  const [troyInputText, setTroyInputText] = useState('');
  const [advisorQuestionsToday, setAdvisorQuestionsToday] = useState(0);
  const [playingMessageId, setPlayingMessageId] = useState(null);
  const [isPaused, setIsPaused] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const currentRecordingRef = useRef(null);
  const recordingStartInFlightRef = useRef(false);
  const currentSoundRef = useRef(null);
  const autoPlayNextResponseRef = useRef(false);
  const maxRecordTimerRef = useRef(null);
  const recordingStartTimeRef = useRef(null);
  const silenceTimerRef = useRef(null);
  const silenceStartRef = useRef(null);
  const troyAbortRef = useRef(null);
  const messageAnimsRef = useRef(new Map());
  const troyFlatListRef = useRef(null);
  // Swipe-back gesture responders for full-screen pages
  const accountSwipe = useRef(useSwipeBack(() => setShowAccountScreen(false))).current;
  const benefitsSwipe = useRef(useSwipeBack(() => setShowBenefitsScreen(false))).current;
  const addModalSwipe = useRef(useSwipeBack(() => { resetForm(); setShowAddModal(false); })).current;
  const speculationSwipe = useRef(useSwipeBack(() => setShowSpeculationModal(false))).current;
  const junkCalcSwipe = useRef(useSwipeBack(() => setShowJunkCalcModal(false))).current;
  const premiumSwipe = useRef(useSwipeBack(() => setShowPremiumAnalysisModal(false))).current;
  const privacySwipe = useRef(useSwipeBack(() => setShowPrivacyModal(false))).current;
  const helpSwipe = useRef(useSwipeBack(() => setShowHelpModal(false))).current;
  const alertSwipe = useRef(useSwipeBack(() => { setShowAddAlertModal(false); setNewAlert({ metal: 'silver', targetPrice: '', direction: 'above' }); })).current;
  const milestoneSwipe = useRef(useSwipeBack(() => { setShowMilestoneModal(false); setTempSilverMilestone(''); setTempGoldMilestone(''); })).current;
  const detailSwipe = useRef(useSwipeBack(() => { setShowDetailView(false); setDetailItem(null); setDetailMetal(null); })).current;
  const notificationsSwipe = useRef(useSwipeBack(() => setSettingsSubPage(null))).current;
  const appearanceSwipe = useRef(useSwipeBack(() => setSettingsSubPage(null))).current;
  const displaySwipe = useRef(useSwipeBack(() => setSettingsSubPage(null))).current;
  const exportSwipe = useRef(useSwipeBack(() => setSettingsSubPage(null))).current;
  const advancedSwipe = useRef(useSwipeBack(() => setSettingsSubPage(null))).current;
  const stackSignalSwipe = useRef(useSwipeBack(() => setShowStackSignal(false))).current;
  const dealerPricesSwipe = useRef(useSwipeBack(() => setCurrentScreen('TroyChat'))).current;

  const [showImportPreview, setShowImportPreview] = useState(false);
  const [importData, setImportData] = useState([]);
  const [showDealerSelector, setShowDealerSelector] = useState(false);
  const [selectedDealer, setSelectedDealer] = useState(null);
  const [pendingImportFile, setPendingImportFile] = useState(null);
  const [showScannedItemsPreview, setShowScannedItemsPreview] = useState(false);
  const [scannedItems, setScannedItems] = useState([]);
  const [scannedMetadata, setScannedMetadata] = useState({ purchaseDate: '', purchaseTime: '', dealer: '' });
  const [showDetailView, setShowDetailView] = useState(false);
  const [detailItem, setDetailItem] = useState(null);
  const [detailMetal, setDetailMetal] = useState(null);
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [showBenefitsScreen, setShowBenefitsScreen] = useState(false);
  const [settingsSubPage, setSettingsSubPage] = useState(null); // null, 'notifications', 'appearance', 'display', 'exportBackup', 'advanced'

  // Sort State
  const [sortBy, setSortBy] = useState('date-newest'); // date-newest, date-oldest, value-high, value-low, metal, name

  // Stack page search & grouping
  const [stackSearchQuery, setStackSearchQuery] = useState('');
  const [stackSearchVisible, setStackSearchVisible] = useState(false);
  const [stackGroupBy, setStackGroupBy] = useState('all'); // 'all', 'metal', 'type', 'dealer'
  const [collapsedSections, setCollapsedSections] = useState(new Set());

  // Daily Snapshot State - stores oz counts and spot prices at midnight
  // This allows recalculating baseline when items are added/removed
  const [midnightSnapshot, setMidnightSnapshot] = useState(null);
  // Format: { silverOzt, goldOzt, silverSpot, goldSpot, date, timestamp }

  // Entitlements (__DEV__ is automatically false in production builds, so this never affects real users)
  const [hasGold, setHasGold] = useState(__DEV__ ? true : false);
  const [userTier, setUserTier] = useState(__DEV__ ? 'gold' : 'free'); // 'free' or 'gold'
  const [subscriptionLoading, setSubscriptionLoading] = useState(true); // Don't show upgrade prompts until loaded

  // Server-side scan tracking
  const [scanUsage, setScanUsage] = useState({
    scansUsed: 0,
    scansLimit: 5,
    resetsAt: null,
    loading: true
  });

  // Lifetime Access (granted via RevenueCat)
  const [hasLifetimeAccess, setHasLifetimeAccess] = useState(false);
  const [revenueCatUserId, setRevenueCatUserId] = useState(null);

  // iCloud Sync State
  const [iCloudSyncEnabled, setICloudSyncEnabled] = useState(false);
  const [iCloudAvailable, setICloudAvailable] = useState(false);
  const [iCloudSyncing, setICloudSyncing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState(null);

  // Scan State
  const [scanStatus, setScanStatus] = useState(null);
  const [scanMessage, setScanMessage] = useState('');
  const [editingItem, setEditingItem] = useState(null);

  // Push Notifications State
  const [expoPushToken, setExpoPushToken] = useState(null);

  // Price Alerts State (free feature)
  const [priceAlerts, setPriceAlerts] = useState([]);
  const [showAddAlertModal, setShowAddAlertModal] = useState(false);
  const [alertsLoading, setAlertsLoading] = useState(false);
  const [newAlert, setNewAlert] = useState({
    metal: 'silver',
    targetPrice: '',
    direction: 'above', // 'above' or 'below'
  });
  // TODO v2.1: Implement ATH alerts with backend tracking

  // Analytics State (Gold/Lifetime feature)
  const [analyticsSnapshots, setAnalyticsSnapshots] = useState([]);
  const [analyticsRange, setAnalyticsRange] = useState('1M');
  const [analyticsLoading, setAnalyticsLoading] = useState(false);

  // Spot Price History State — per-metal charts
  const [spotHistoryMetal, setSpotHistoryMetal] = useState({
    gold: { range: '1Y', data: null, loading: false, error: null },
    silver: { range: '1Y', data: null, loading: false, error: null },
    platinum: { range: '1Y', data: null, loading: false, error: null },
    palladium: { range: '1Y', data: null, loading: false, error: null },
  });

  // Sparkline data for Metal Movers + Portfolio Pulse (24-hour trend)
  const [sparklineData, setSparklineData] = useState(null); // { gold: [N numbers], silver: [...], timestamps: [...] }
  const sparklineFetchedRef = useRef(false);

  // Post-sign-in loading gate — show loading screen until Supabase sync completes after sign-in
  const [needsPostSignInSync, setNeedsPostSignInSync] = useState(false);

  // Share My Stack
  const shareViewRef = useRef(null);
  const [isGeneratingShare, setIsGeneratingShare] = useState(false);

  // Today Tab - AI Daily Brief
  const [dailyBrief, setDailyBrief] = useState(null); // { brief_text, date }
  const [dailyBriefLoading, setDailyBriefLoading] = useState(false);
  const [briefExpanded, setBriefExpanded] = useState(false);

  // Analytics Tab - Stack Intelligence
  const [portfolioIntel, setPortfolioIntel] = useState(null); // { text, costBasis, purchaseStats, date, is_current }
  const [portfolioIntelLoading, setPortfolioIntelLoading] = useState(false);
  const [portfolioIntelExpanded, setPortfolioIntelExpanded] = useState(false);
  const [costBasisIntelExpanded, setCostBasisIntelExpanded] = useState(false);
  const [purchaseStatsIntelExpanded, setPurchaseStatsIntelExpanded] = useState(false);

  // Notification Preferences
  const [notifPrefs, setNotifPrefs] = useState({ daily_brief: true, price_alerts: true, comex_alerts: true });

  // Navigation (React Navigation drawer)
  const [drawerNavigation, setDrawerNavigation] = useState(null);
  const sectionOffsets = useRef({});

  // Today Tab - Intelligence Feed
  const [intelligenceBriefs, setIntelligenceBriefs] = useState([]);
  const [intelligenceLoading, setIntelligenceLoading] = useState(false);
  const [intelligenceLastFetched, setIntelligenceLastFetched] = useState(null);
  const [intelligenceExpanded, setIntelligenceExpanded] = useState(false);

  // Today Tab - Vault Watch (COMEX Warehouse Inventory)
  const [vaultData, setVaultData] = useState({ gold: [], silver: [], platinum: [], palladium: [] });
  const [vaultLoading, setVaultLoading] = useState(false);
  const [vaultLastFetched, setVaultLastFetched] = useState(null);
  const [vaultMetal, setVaultMetal] = useState('silver'); // Default to silver

  // Stack Signal
  const [showStackSignal, setShowStackSignal] = useState(false);
  const [stackSignalArticles, setStackSignalArticles] = useState([]);
  const [stackSignalDaily, setStackSignalDaily] = useState(null);
  const [stackSignalLoading, setStackSignalLoading] = useState(false);
  const [stackSignalRefreshing, setStackSignalRefreshing] = useState(false);
  const [expandedArticleId, setExpandedArticleId] = useState(null);
  const [expandedCommentary, setExpandedCommentary] = useState({});
  const [likedArticles, setLikedArticles] = useState({}); // { [articleId]: { liked: bool, count: number } }
  const viewedArticlesRef = useRef(new Set()); // session dedup for view tracking

  // Custom Milestone State
  const [showMilestoneModal, setShowMilestoneModal] = useState(false);
  const [customSilverMilestone, setCustomSilverMilestone] = useState(null); // null means use default
  const [customGoldMilestone, setCustomGoldMilestone] = useState(null);
  const [tempSilverMilestone, setTempSilverMilestone] = useState('');
  const [tempGoldMilestone, setTempGoldMilestone] = useState('');
  const [lastReachedSilverMilestone, setLastReachedSilverMilestone] = useState(null);
  const [lastReachedGoldMilestone, setLastReachedGoldMilestone] = useState(null);

  // Analytics fetch abort controller - allows canceling in-progress fetches
  const analyticsAbortRef = useRef(null);

  // Historical price cache - avoids re-fetching same dates when switching time ranges
  // Format: { "2025-01-15": { gold: 2650, silver: 31.50 }, ... }
  const historicalPriceCache = useRef({});

  // Snapshots cache - stores ALL snapshots to avoid re-fetching on range change
  // We fetch once and filter client-side by range
  // primaryData = the chosen data source with best historical coverage
  const snapshotsCacheRef = useRef({ primaryData: null, fetched: false });

  // Spot price history cache - keyed by "metal-range" to avoid re-fetching
  const spotHistoryCacheRef = useRef({});

  // Scroll ref for scroll-to-top on tab re-tap
  const scrollRef = useRef(null);

  // Form State
  const [form, setForm] = useState({
    productName: '', source: '', datePurchased: '', timePurchased: '', ozt: '',
    quantity: '', unitPrice: '', taxes: '', shipping: '',
    spotPrice: '', premium: '0', costBasis: '',
  });
  const [formErrors, setFormErrors] = useState({});
  const [spotPriceSource, setSpotPriceSource] = useState(null); // Tracks data source for spot price warnings
  const [historicalSpotSuggestion, setHistoricalSpotSuggestion] = useState(null); // Suggested historical spot price for comparison

  // Speculation State
  const [specSilverPrice, setSpecSilverPrice] = useState('100');
  const [specGoldPrice, setSpecGoldPrice] = useState('5000');
  const [specPlatinumPrice, setSpecPlatinumPrice] = useState('2500');
  const [specPalladiumPrice, setSpecPalladiumPrice] = useState('2000');

  // Junk Silver Calculator State
  const [junkType, setJunkType] = useState('90');
  const [junkFaceValue, setJunkFaceValue] = useState('');

  // Screenshot mode triple-tap handler
  const handleVersionTap = () => {
    if (!__DEV__) return;
    const newCount = versionTapCount + 1;
    setVersionTapCount(newCount);
    clearTimeout(versionTapTimer.current);
    if (newCount >= 3) {
      setScreenshotMode(prev => !prev);
      setVersionTapCount(0);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      if (__DEV__) console.log('[Screenshot Mode]', !screenshotMode ? 'ACTIVATED' : 'DEACTIVATED');
    } else {
      versionTapTimer.current = setTimeout(() => setVersionTapCount(0), 600);
    }
  };

  // Generate natural-looking sparkline data for screenshot mode
  const generateDemoSparkline = (basePrice, count, uptrendPct) => {
    const points = [];
    for (let i = 0; i < count; i++) {
      const value = basePrice * (1 + (i / count) * uptrendPct + 0.003 * Math.sin(i * 0.5) + 0.002 * Math.sin(i * 1.3));
      points.push(value);
    }
    return points;
  };

  // Demo data for screenshot mode
  const demoData = screenshotMode ? {
    goldSpot: 5012,
    silverSpot: 78.40,
    platinumSpot: 2065,
    palladiumSpot: 1742,
    spotChange: {
      gold: { amount: 62, percent: 1.25 },
      silver: { amount: 1.85, percent: 2.42 },
      platinum: { amount: 28, percent: 1.37 },
      palladium: { amount: 18, percent: 1.04 },
    },
    totalMeltValue: 502847,
    dailyChange: 8241,
    dailyChangePct: 1.67,
    sparklineData: {
      gold: generateDemoSparkline(4950, 24, 0.012),
      silver: generateDemoSparkline(76.5, 24, 0.024),
      platinum: generateDemoSparkline(2037, 24, 0.014),
      palladium: generateDemoSparkline(1724, 24, 0.010),
      timestamps: Array.from({ length: 24 }, (_, i) => {
        const d = new Date();
        d.setHours(6 + Math.floor(i * 0.5), (i % 2) * 30, 0);
        return d.toISOString();
      }),
    },
    portfolioIntel: {
      text: 'Your stack is well-diversified across 4 metals with a strong gold core (68% allocation). Gold\'s sustained breakout above $5,000 positions your stack favorably. Consider your silver allocation — at 22%, it provides solid upside exposure to industrial demand catalysts. Your cost basis of $387,204 reflects disciplined accumulation, with an unrealized gain of $115,643 (+29.9%). The gold-to-silver ratio at 63.9 suggests silver remains relatively undervalued historically.',
      costBasis: 'Total cost basis: $387,204. Gold: $263,298 (68.0%), Silver: $85,185 (22.0%), Platinum: $28,933 (7.5%), Palladium: $9,788 (2.5%). Overall gain: +$115,643 (+29.9%).',
      purchaseStats: 'You\'ve made 47 purchases over 18 months. Average purchase: $8,238. Most active month: October 2025 (8 purchases). Preferred dealers: APMEX, JM Bullion, SD Bullion.',
      date: new Date().toDateString(),
      is_current: true,
    },
    analyticsSnapshots: (() => {
      const snaps = [];
      const baseValue = 380000;
      const days = 365;
      for (let i = 0; i < days; i++) {
        const d = new Date();
        d.setDate(d.getDate() - (days - i));
        const trend = baseValue * (1 + (i / days) * 0.32 + 0.015 * Math.sin(i * 0.05) + 0.008 * Math.sin(i * 0.13));
        snaps.push({
          date: d.toISOString().split('T')[0],
          total_value: Math.round(trend),
        });
      }
      return snaps;
    })(),
  } : null;

  // Colors - dynamic based on theme
  const colors = isDarkMode ? {
    // Dark mode colors
    silver: '#94a3b8',
    gold: '#fbbf24',
    platinum: '#7BB3D4',
    palladium: '#6BBF8A',
    success: '#22c55e',
    error: '#ef4444',
    text: '#e4e4e7',
    muted: '#71717a',
    background: '#09090b',
    cardBg: '#18181b',
    border: 'rgba(255,255,255,0.1)',
  } : {
    // Light mode colors
    silver: '#64748b',
    gold: '#fbbf24',
    platinum: '#7BB3D4',
    palladium: '#6BBF8A',
    success: '#16a34a',
    error: '#dc2626',
    text: '#18181b',
    muted: '#71717a',
    background: '#f4f4f5',
    cardBg: '#ffffff',
    border: 'rgba(0,0,0,0.1)',
  };

  // Change theme and save to AsyncStorage
  const changeTheme = async (newTheme) => {
    setThemePreference(newTheme);
    try {
      await AsyncStorage.setItem('stack_theme_preference', newTheme);
    } catch (error) {
      if (__DEV__) console.error('Failed to save theme preference:', error);
    }
  };

  // Toggle large text accessibility setting
  const toggleLargeText = async (enabled) => {
    setLargeText(enabled);
    try {
      await AsyncStorage.setItem('stack_large_text', enabled ? 'true' : 'false');
    } catch (error) {
      if (__DEV__) console.error('Failed to save large text preference:', error);
    }
  };

  // Reset all in-memory state to defaults (used by both clearAllData and performSignOut)
  // fullReset=true (default): resets everything including app preferences (for clearAllData)
  // fullReset=false: preserves theme, large text, tutorial flags, and keeps dataLoaded true (for sign-out)
  const resetAllState = (fullReset = true) => {
    // Always reset user-specific data
    setSilverItems([]);
    setGoldItems([]);
    setPlatinumItems([]);
    setPalladiumItems([]);
    setSilverSpot(77);
    setGoldSpot(4530);
    setPlatinumSpot(2100);
    setPalladiumSpot(1740);
    setPriceSource('cached');
    setPriceTimestamp(null);
    setSpotPricesLive(false);
    setSpotChange({ gold: { amount: null, percent: null, prevClose: null }, silver: { amount: null, percent: null, prevClose: null }, platinum: { amount: null, percent: null, prevClose: null }, palladium: { amount: null, percent: null, prevClose: null } });
    setMidnightSnapshot(null);
    setTroyMessages([]);
    setTroyInputText('');
    setTroyConversations([]);
    setActiveConversationId(null);
    setAdvisorQuestionsToday(0);
    setDailyBrief(null);
    setBriefExpanded(false);
    setPortfolioIntel(null);
    setPortfolioIntelExpanded(false);
    setCostBasisIntelExpanded(false);
    setPurchaseStatsIntelExpanded(false);
    setIntelligenceBriefs([]);
    setPriceAlerts([]);
    setAnalyticsSnapshots([]);
    setAnalyticsRange('1M');
    setSpotHistoryMetal({
      gold: { range: '1Y', data: null, loading: false, error: null },
      silver: { range: '1Y', data: null, loading: false, error: null },
      platinum: { range: '1Y', data: null, loading: false, error: null },
      palladium: { range: '1Y', data: null, loading: false, error: null },
    });
    setSparklineData(null);
    sparklineFetchedRef.current = false;
    setNotifPrefs({ daily_brief: true, price_alerts: true, breaking_news: true, comex_alerts: true, comex_gold: true, comex_silver: true, comex_platinum: true, comex_palladium: true });
    setCurrentScreen('Dashboard');
    setSettingsSubPage(null);
    setShowAccountScreen(false);
    setShowBenefitsScreen(false);
    setHasSyncedOnce(false);

    // Only reset app-level preferences on full reset (clearAllData from settings)
    if (fullReset) {
      setThemePreference('dark');
      setLargeText(false);
      setHideWidgetValues(false);
      setSpotChangeDisplayMode('percent');
      setDataLoaded(false);
    }
  };

  // Clear all app data and reset to fresh state (user-initiated from Settings)
  const clearAllData = async () => {
    try {
      await AsyncStorage.clear();
      resetAllState();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('Data Cleared', 'All your data has been erased. The app has been reset to its initial state.');
    } catch (error) {
      if (__DEV__) console.error('Failed to clear data:', error);
      Alert.alert('Error', 'Failed to clear data. Please try again.');
    }
  };

  // Sign out: clear user data, logout services, navigate to auth screen
  // Preserves app preferences (theme, large text, tutorial flags, etc.)
  const performSignOut = async () => {
    try {
      const userId = supabaseUser?.id;
      // 1. Logout from RevenueCat
      try { await logoutRevenueCat(); } catch (e) { if (__DEV__) console.error('RevenueCat logout failed:', e); }
      // 2. Sign out from Supabase
      await supabaseSignOut();
      // 3. Selective clear — remove user data, preserve app preferences
      const userKeys = [
        'stack_silver', 'stack_gold', 'stack_platinum', 'stack_palladium',
        'stack_midnight_snapshot',
        'stack_advisor_count',
        'stack_price_alerts',
        'stack_icloud_sync_enabled', 'stack_last_sync_time', 'stack_last_modified',
        'stack_silver_milestone', 'stack_gold_milestone',
        'stack_last_silver_milestone_reached', 'stack_last_gold_milestone_reached',
        'stack_review_prompts', 'stack_first_open_date',
        'lastSnapshotDate',
        'stack_guest_mode',
      ];
      if (userId) userKeys.push(`stack_synced_${userId}`);
      await AsyncStorage.multiRemove(userKeys);
      // 4. Reset user state only (preserve theme, tutorial flags, large text, etc.)
      resetAllState(false);
      // 5. Navigate to auth screen (not guest mode)
      setGuestMode(false);
    } catch (error) {
      if (__DEV__) console.error('Sign out failed:', error);
      Alert.alert('Error', 'Failed to sign out. Please try again.');
    }
  };

  // Helper function to format currency with commas (fixed decimals)
  const formatCurrency = (value, decimals = 2) => {
    return value.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  };

  // Smart currency formatting: shows decimals only if meaningful
  // "$100" not "$100.00", but "$100.50" if cents exist (always 2 decimals when not whole number)
  const formatSmartCurrency = (value, maxDecimals = 2) => {
    const rounded = Math.round(value * Math.pow(10, maxDecimals)) / Math.pow(10, maxDecimals);
    if (rounded === Math.floor(rounded)) {
      return rounded.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 });
    }
    // If there are cents, always show 2 decimal places (e.g., "$52,868.90" not "$52,868.9")
    return rounded.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: maxDecimals });
  };

  // Format quantity with smart decimals and commas
  const formatQuantity = (value) => {
    if (value === Math.floor(value)) {
      return value.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 });
    }
    return value.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  };

  // Helper function to format ounces with smart decimals
  // Shows commas for thousands, removes trailing zeros
  // "12" not "12.000", "2,297" not "2297.00", but "12.5" or "2,297.25" if meaningful
  const formatOunces = (value, maxDecimals = 2) => {
    // Round to max decimals first
    const rounded = Math.round(value * Math.pow(10, maxDecimals)) / Math.pow(10, maxDecimals);
    // Check if it's a whole number
    if (rounded === Math.floor(rounded)) {
      return rounded.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 });
    }
    // Otherwise, show decimals but strip trailing zeros
    return rounded.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: maxDecimals });
  };

  // Helper function to calculate premium percentage
  const calculatePremiumPercent = (premium, unitPrice) => {
    if (unitPrice <= 0) return 0;
    return (premium / unitPrice) * 100;
  };

  // Helper function to get cost basis for an item (uses custom if set, otherwise calculates)
  const getItemCostBasis = (item) => {
    if (item.costBasis && item.costBasis > 0) {
      return item.costBasis;
    }
    return (item.unitPrice * item.quantity) + item.taxes + item.shipping;
  };

  // Helper function to format date for display (YYYY-MM-DD -> MM-DD-YYYY)
  const formatDateDisplay = (dateStr) => {
    if (!dateStr || dateStr.length !== 10) return dateStr || '';
    const parts = dateStr.split('-');
    if (parts.length !== 3) return dateStr;
    return `${parts[1]}-${parts[2]}-${parts[0]}`;
  };

  // Helper function to parse various date formats into YYYY-MM-DD
  // Handles: 2023-03-21, Mar 21 2023, 03/21/2023, 21/03/2023, March 21, 2023, Excel serial numbers, etc.
  const parseDate = (dateStr) => {
    if (dateStr === null || dateStr === undefined || dateStr === '') return '';

    // Handle numeric input directly (Excel serial numbers from XLSX)
    if (typeof dateStr === 'number') {
      const serial = Math.floor(dateStr); // Ignore time portion (decimal)
      if (serial >= 25000 && serial <= 55000) {
        // Convert Excel serial to JS date
        // Excel epoch is Jan 1, 1900, but has a bug counting Feb 29, 1900 (which didn't exist)
        const excelEpoch = new Date(1899, 11, 30); // Dec 30, 1899 (Excel's actual day 0)
        const jsDate = new Date(excelEpoch.getTime() + serial * 24 * 60 * 60 * 1000);
        const y = jsDate.getFullYear();
        const m = String(jsDate.getMonth() + 1).padStart(2, '0');
        const d = String(jsDate.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
      }
      return ''; // Invalid serial number
    }

    const str = String(dateStr).trim();
    if (!str) return '';

    // Excel serial number as string (integer or float like "46035" or "46035.791666")
    // Range ~25000-55000 covers years 1968-2050
    const serialMatch = str.match(/^(\d{4,5})(\.\d+)?$/);
    if (serialMatch) {
      const serial = parseInt(serialMatch[1]);
      if (serial >= 25000 && serial <= 55000) {
        // Convert Excel serial to JS date
        const excelEpoch = new Date(1899, 11, 30); // Dec 30, 1899 (Excel's actual day 0)
        const jsDate = new Date(excelEpoch.getTime() + serial * 24 * 60 * 60 * 1000);
        const y = jsDate.getFullYear();
        const m = String(jsDate.getMonth() + 1).padStart(2, '0');
        const d = String(jsDate.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
      }
    }

    // Month name mappings
    const months = {
      jan: '01', january: '01',
      feb: '02', february: '02',
      mar: '03', march: '03',
      apr: '04', april: '04',
      may: '05',
      jun: '06', june: '06',
      jul: '07', july: '07',
      aug: '08', august: '08',
      sep: '09', sept: '09', september: '09',
      oct: '10', october: '10',
      nov: '11', november: '11',
      dec: '12', december: '12',
    };

    // Already in YYYY-MM-DD format
    if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
      return str;
    }

    // ISO format with time: 2023-03-21T... -> 2023-03-21
    if (/^\d{4}-\d{2}-\d{2}T/.test(str)) {
      return str.substring(0, 10);
    }

    // MM/DD/YYYY or MM-DD-YYYY (US format)
    let match = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
    if (match) {
      const [, m, d, y] = match;
      return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
    }

    // DD/MM/YYYY or DD-MM-YYYY (European format) - check if day > 12
    match = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
    if (match) {
      const [, first, second, y] = match;
      // If first number > 12, it must be day (European format)
      if (parseInt(first) > 12) {
        return `${y}-${second.padStart(2, '0')}-${first.padStart(2, '0')}`;
      }
    }

    // YYYY/MM/DD or YYYY.MM.DD
    match = str.match(/^(\d{4})[\/\.](\d{1,2})[\/\.](\d{1,2})$/);
    if (match) {
      const [, y, m, d] = match;
      return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
    }

    // Month DD, YYYY or Month DD YYYY (e.g., "March 21, 2023" or "Mar 21 2023")
    match = str.match(/^([a-zA-Z]+)\s+(\d{1,2}),?\s+(\d{4})$/);
    if (match) {
      const [, monthStr, d, y] = match;
      const m = months[monthStr.toLowerCase()];
      if (m) {
        return `${y}-${m}-${d.padStart(2, '0')}`;
      }
    }

    // DD Month YYYY (e.g., "21 March 2023" or "21 Mar 2023")
    match = str.match(/^(\d{1,2})\s+([a-zA-Z]+),?\s+(\d{4})$/);
    if (match) {
      const [, d, monthStr, y] = match;
      const m = months[monthStr.toLowerCase()];
      if (m) {
        return `${y}-${m}-${d.padStart(2, '0')}`;
      }
    }

    // Month YYYY (assume day 1) - e.g., "March 2023"
    match = str.match(/^([a-zA-Z]+)\s+(\d{4})$/);
    if (match) {
      const [, monthStr, y] = match;
      const m = months[monthStr.toLowerCase()];
      if (m) {
        return `${y}-${m}-01`;
      }
    }

    // Try JavaScript's Date parser as last resort
    try {
      const parsed = new Date(str);
      if (!isNaN(parsed.getTime())) {
        const y = parsed.getFullYear();
        const m = String(parsed.getMonth() + 1).padStart(2, '0');
        const d = String(parsed.getDate()).padStart(2, '0');
        // Only accept if year is reasonable (1900-2100)
        if (y >= 1900 && y <= 2100) {
          return `${y}-${m}-${d}`;
        }
      }
    } catch (e) {
      // Ignore parse errors
    }

    // Return empty string if we couldn't parse it (prevents invalid data in Supabase)
    return '';
  };

  // ============================================
  // CALCULATIONS
  // ============================================

  const totalSilverOzt = silverItems.reduce((sum, i) => sum + (i.ozt * i.quantity), 0);
  const totalGoldOzt = goldItems.reduce((sum, i) => sum + (i.ozt * i.quantity), 0);
  const totalPlatinumOzt = platinumItems.reduce((sum, i) => sum + (i.ozt * i.quantity), 0);
  const totalPalladiumOzt = palladiumItems.reduce((sum, i) => sum + (i.ozt * i.quantity), 0);

  const silverMeltValue = totalSilverOzt * silverSpot;
  const goldMeltValue = totalGoldOzt * goldSpot;
  const platinumMeltValue = totalPlatinumOzt * platinumSpot;
  const palladiumMeltValue = totalPalladiumOzt * palladiumSpot;
  const totalMeltValue = silverMeltValue + goldMeltValue + platinumMeltValue + palladiumMeltValue;

  const silverCostBasis = silverItems.reduce((sum, i) => sum + (i.unitPrice * i.quantity) + i.taxes + i.shipping, 0);
  const goldCostBasis = goldItems.reduce((sum, i) => sum + (i.unitPrice * i.quantity) + i.taxes + i.shipping, 0);
  const platinumCostBasis = platinumItems.reduce((sum, i) => sum + (i.unitPrice * i.quantity) + i.taxes + i.shipping, 0);
  const palladiumCostBasis = palladiumItems.reduce((sum, i) => sum + (i.unitPrice * i.quantity) + i.taxes + i.shipping, 0);
  const totalCostBasis = silverCostBasis + goldCostBasis + platinumCostBasis + palladiumCostBasis;

  const silverPremiumsPaid = silverItems.reduce((sum, i) => sum + (i.premium * i.quantity), 0);
  const goldPremiumsPaid = goldItems.reduce((sum, i) => sum + (i.premium * i.quantity), 0);
  const platinumPremiumsPaid = platinumItems.reduce((sum, i) => sum + (i.premium * i.quantity), 0);
  const palladiumPremiumsPaid = palladiumItems.reduce((sum, i) => sum + (i.premium * i.quantity), 0);
  const totalPremiumsPaid = silverPremiumsPaid + goldPremiumsPaid + platinumPremiumsPaid + palladiumPremiumsPaid;
  const totalPremiumsPct = totalCostBasis > 0 ? ((totalPremiumsPaid / totalCostBasis) * 100) : 0;

  const totalGainLoss = totalMeltValue - totalCostBasis;
  const totalGainLossPct = totalCostBasis > 0 ? ((totalGainLoss / totalCostBasis) * 100) : 0;

  const silverGainLoss = silverMeltValue - silverCostBasis;
  const silverGainLossPct = silverCostBasis > 0 ? ((silverGainLoss / silverCostBasis) * 100) : 0;
  const goldGainLoss = goldMeltValue - goldCostBasis;
  const goldGainLossPct = goldCostBasis > 0 ? ((goldGainLoss / goldCostBasis) * 100) : 0;
  const platinumGainLoss = platinumMeltValue - platinumCostBasis;
  const platinumGainLossPct = platinumCostBasis > 0 ? ((platinumGainLoss / platinumCostBasis) * 100) : 0;
  const palladiumGainLoss = palladiumMeltValue - palladiumCostBasis;
  const palladiumGainLossPct = palladiumCostBasis > 0 ? ((palladiumGainLoss / palladiumCostBasis) * 100) : 0;

  const goldSilverRatio = silverSpot > 0 ? (goldSpot / silverSpot) : 0;

  const avgSilverCostPerOz = totalSilverOzt > 0 ? (silverCostBasis / totalSilverOzt) : 0;
  const avgGoldCostPerOz = totalGoldOzt > 0 ? (goldCostBasis / totalGoldOzt) : 0;
  const avgPlatinumCostPerOz = totalPlatinumOzt > 0 ? (platinumCostBasis / totalPlatinumOzt) : 0;
  const avgPalladiumCostPerOz = totalPalladiumOzt > 0 ? (palladiumCostBasis / totalPalladiumOzt) : 0;

  // Daily change calculation - uses holdings owned BEFORE today × spot price changes
  // Holdings purchased today should NOT affect Today's Change (user didn't own them at midnight)
  const todayStr = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format

  // Filter to holdings that existed before today (purchased before today or no date = assume pre-existing)
  const preTodaySilverOzt = silverItems
    .filter(i => !i.datePurchased || i.datePurchased < todayStr)
    .reduce((sum, i) => sum + (i.ozt * i.quantity), 0);
  const preTodayGoldOzt = goldItems
    .filter(i => !i.datePurchased || i.datePurchased < todayStr)
    .reduce((sum, i) => sum + (i.ozt * i.quantity), 0);
  const preTodayPlatinumOzt = platinumItems
    .filter(i => !i.datePurchased || i.datePurchased < todayStr)
    .reduce((sum, i) => sum + (i.ozt * i.quantity), 0);
  const preTodayPalladiumOzt = palladiumItems
    .filter(i => !i.datePurchased || i.datePurchased < todayStr)
    .reduce((sum, i) => sum + (i.ozt * i.quantity), 0);

  // Midnight baseline = pre-today holdings × midnight spot prices
  const midnightBaseline = midnightSnapshot
    ? (preTodaySilverOzt * midnightSnapshot.silverSpot) + (preTodayGoldOzt * midnightSnapshot.goldSpot) + (preTodayPlatinumOzt * (midnightSnapshot.platinumSpot || platinumSpot)) + (preTodayPalladiumOzt * (midnightSnapshot.palladiumSpot || palladiumSpot))
    : null;

  // Current value of pre-today holdings at live prices
  const preTodayCurrentValue = (preTodaySilverOzt * silverSpot) + (preTodayGoldOzt * goldSpot) + (preTodayPlatinumOzt * platinumSpot) + (preTodayPalladiumOzt * palladiumSpot);

  const dailyChange = midnightBaseline !== null ? (preTodayCurrentValue - midnightBaseline) : 0;
  const dailyChangePct = (midnightBaseline !== null && midnightBaseline > 0) ? ((dailyChange / midnightBaseline) * 100) : 0;
  const isDailyChangePositive = dailyChange >= 0;

  // Show daily change only if:
  // 1. We have a midnight snapshot
  // 2. The snapshot date is today
  // 3. We have live prices (not stale defaults)
  const isTodaySnapshot = midnightSnapshot?.date === new Date().toDateString();
  const showDailyChange = midnightSnapshot !== null
    && midnightBaseline > 0
    && isTodaySnapshot
    && spotPricesLive;

  // Speculation
  const specSilverNum = parseFloat(specSilverPrice) || silverSpot;
  const specGoldNum = parseFloat(specGoldPrice) || goldSpot;
  const specPlatinumNum = parseFloat(specPlatinumPrice) || platinumSpot;
  const specPalladiumNum = parseFloat(specPalladiumPrice) || palladiumSpot;
  const specTotalValue = (totalSilverOzt * specSilverNum) + (totalGoldOzt * specGoldNum) + (totalPlatinumOzt * specPlatinumNum) + (totalPalladiumOzt * specPalladiumNum);
  const specGainLoss = specTotalValue - totalCostBasis;
  const specGainLossPct = totalCostBasis > 0 ? ((specGainLoss / totalCostBasis) * 100) : 0;

  // Junk Silver
  const junkMultipliers = { '90': 0.715, '40': 0.295, '35': 0.0563 };
  const junkFaceNum = parseFloat(junkFaceValue) || 0;
  const junkOzt = junkType === '35' ? (junkFaceNum / 0.05) * junkMultipliers['35'] : junkFaceNum * junkMultipliers[junkType];
  const junkMeltValue = junkOzt * silverSpot;

  // Break-even
  const silverBreakeven = totalSilverOzt > 0 ? (silverCostBasis / totalSilverOzt) : 0;
  const goldBreakeven = totalGoldOzt > 0 ? (goldCostBasis / totalGoldOzt) : 0;
  const platinumBreakeven = totalPlatinumOzt > 0 ? (platinumCostBasis / totalPlatinumOzt) : 0;
  const palladiumBreakeven = totalPalladiumOzt > 0 ? (palladiumCostBasis / totalPalladiumOzt) : 0;

  // Milestones - use custom if set, otherwise use defaults
  const defaultSilverMilestones = [10, 50, 100, 250, 500, 1000];
  const defaultGoldMilestones = [1, 5, 10, 25, 50, 100];

  // If custom milestone is set, use it; otherwise find next default milestone
  const nextSilverMilestone = customSilverMilestone
    ? customSilverMilestone
    : (defaultSilverMilestones.find(m => totalSilverOzt < m) || 1000);

  const nextGoldMilestone = customGoldMilestone
    ? customGoldMilestone
    : (defaultGoldMilestones.find(m => totalGoldOzt < m) || 100);

  // ============================================
  // AUTO-CALCULATE PREMIUM
  // ============================================

  useEffect(() => {
    const unitPrice = parseFloat(form.unitPrice) || 0;
    const spotPrice = parseFloat(form.spotPrice) || 0;
    const ozt = parseFloat(form.ozt) || 0;

    if (unitPrice > 0 && spotPrice > 0 && ozt > 0) {
      const calculatedPremium = unitPrice - (spotPrice * ozt);
      // Only auto-fill positive premiums; negative means spot data is likely wrong
      setForm(prev => ({ ...prev, premium: Math.max(0, calculatedPremium).toFixed(2) }));
    }
  }, [form.unitPrice, form.spotPrice, form.ozt]);

  // ============================================
  // AUTHENTICATION & DATA
  // ============================================

  const authenticate = async () => {
    try {
      // Minimum version check — fail open
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);
        const versionRes = await fetch('https://api.stacktrackergold.com/v1/min-version', {
          signal: controller.signal
        });
        clearTimeout(timeout);
        if (versionRes.ok) {
          const versionData = await versionRes.json();
          const platform = Platform.OS;
          const platformData = versionData[platform];
          if (versionData.enforced && platformData && isVersionBelow(appVersion, platformData.minVersion)) {
            setForceUpdate({
              message: versionData.message,
              storeUrl: platformData.store_url
            });
            return; // Stop all further initialization — app is blocked
          }
        }
      } catch (e) {
        // Fail open — if endpoint is unreachable, let the user in
        console.log('Version check skipped:', e.message);
      }

      // Wrap all authentication in defensive try-catch
      let shouldAuthenticate = false;

      try {
        const hasHardware = await LocalAuthentication.hasHardwareAsync();
        const isEnrolled = await LocalAuthentication.isEnrolledAsync();

        if (hasHardware && isEnrolled) {
          const result = await LocalAuthentication.authenticateAsync({
            promptMessage: 'Unlock TroyStack',
            fallbackLabel: 'Use Passcode',
          });
          shouldAuthenticate = result?.success === true;
        } else {
          // No biometric hardware or not enrolled - allow access
          shouldAuthenticate = true;
        }
      } catch (authError) {
        if (__DEV__) console.error('Biometric auth error (non-fatal):', authError?.message || authError);
        // If biometric fails, allow access anyway
        shouldAuthenticate = true;
      }

      // Only update state and load data if authentication succeeded or was skipped
      if (shouldAuthenticate) {
        setIsAuthenticated(true);
        // Wrap loadData in setTimeout to ensure state update completes first
        setTimeout(() => {
          loadData().catch(err => {
            if (__DEV__) console.error('loadData failed (non-fatal):', err?.message || err);
            setIsLoading(false); // Still hide loading even if data fails
          });
        }, 50);
      }
    } catch (e) {
      if (__DEV__) console.error('authenticate outer catch:', e?.message || e);
      setIsAuthenticated(true);
      setIsLoading(false);
    }
  };

  const loadData = async () => {
    try {
      const [silver, gold, platinum, palladium, silverS, goldS, platinumS, palladiumS, timestamp, hasSeenTutorial, storedMidnightSnapshot, storedTheme, storedChangeDisplayMode, storedLargeText, storedSilverMilestone, storedGoldMilestone, storedLastSilverReached, storedLastGoldReached, storedGuestMode, storedHideWidgetValues, storedAdvisorCount] = await Promise.all([
        AsyncStorage.getItem('stack_silver'),
        AsyncStorage.getItem('stack_gold'),
        AsyncStorage.getItem('stack_platinum'),
        AsyncStorage.getItem('stack_palladium'),
        AsyncStorage.getItem('stack_silver_spot'),
        AsyncStorage.getItem('stack_gold_spot'),
        AsyncStorage.getItem('stack_platinum_spot'),
        AsyncStorage.getItem('stack_palladium_spot'),
        AsyncStorage.getItem('stack_price_timestamp'),
        AsyncStorage.getItem('stack_has_seen_tutorial'),
        AsyncStorage.getItem('stack_midnight_snapshot'),
        AsyncStorage.getItem('stack_theme_preference'),
        AsyncStorage.getItem('stack_spot_change_display_mode'),
        AsyncStorage.getItem('stack_large_text'),
        AsyncStorage.getItem('stack_silver_milestone'),
        AsyncStorage.getItem('stack_gold_milestone'),
        AsyncStorage.getItem('stack_last_silver_milestone_reached'),
        AsyncStorage.getItem('stack_last_gold_milestone_reached'),
        AsyncStorage.getItem('stack_guest_mode'),
        AsyncStorage.getItem('stack_hide_widget_values'),
        AsyncStorage.getItem('stack_advisor_count'),
      ]);

      // Safely parse JSON data with fallbacks
      if (silver) {
        try { setSilverItems(JSON.parse(silver)); } catch (e) { if (__DEV__) console.error('Failed to parse silver data'); }
      }
      if (gold) {
        try { setGoldItems(JSON.parse(gold)); } catch (e) { if (__DEV__) console.error('Failed to parse gold data'); }
      }
      if (platinum) {
        try { setPlatinumItems(JSON.parse(platinum)); } catch (e) { if (__DEV__) console.error('Failed to parse platinum data'); }
      }
      if (palladium) {
        try { setPalladiumItems(JSON.parse(palladium)); } catch (e) { if (__DEV__) console.error('Failed to parse palladium data'); }
      }
      if (silverS) setSilverSpot(parseFloat(silverS) || 30);
      if (goldS) setGoldSpot(parseFloat(goldS) || 2600);
      if (platinumS) setPlatinumSpot(parseFloat(platinumS) || 2100);
      if (palladiumS) setPalladiumSpot(parseFloat(palladiumS) || 1740);
      if (timestamp) setPriceTimestamp(timestamp);
      if (storedMidnightSnapshot) {
        try {
          setMidnightSnapshot(JSON.parse(storedMidnightSnapshot));
        } catch (e) {
          if (__DEV__) console.error('Failed to parse midnight snapshot');
        }
      }
      if (storedTheme && ['system', 'light', 'dark'].includes(storedTheme)) {
        setThemePreference(storedTheme);
      }
      if (storedChangeDisplayMode && ['percent', 'amount'].includes(storedChangeDisplayMode)) {
        setSpotChangeDisplayMode(storedChangeDisplayMode);
      }
      if (storedLargeText === 'true') {
        setLargeText(true);
      }

      // Load custom milestones
      if (storedSilverMilestone) {
        const parsed = parseFloat(storedSilverMilestone);
        if (!isNaN(parsed) && parsed > 0) setCustomSilverMilestone(parsed);
      }
      if (storedGoldMilestone) {
        const parsed = parseFloat(storedGoldMilestone);
        if (!isNaN(parsed) && parsed > 0) setCustomGoldMilestone(parsed);
      }
      if (storedLastSilverReached) {
        setLastReachedSilverMilestone(parseFloat(storedLastSilverReached));
      }
      if (storedLastGoldReached) {
        setLastReachedGoldMilestone(parseFloat(storedLastGoldReached));
      }

      // Guest mode is session-only now — always start at auth screen on cold launch
      // Clear any legacy persisted guest mode flag
      if (storedGuestMode) {
        AsyncStorage.removeItem('stack_guest_mode');
      }
      setGuestMode(false);

      // Load hide widget values preference
      if (storedHideWidgetValues === 'true') {
        setHideWidgetValues(true);
      }

      // Show tutorial if user hasn't seen it
      if (!hasSeenTutorial) {
        setShowTutorial(true);
      }

      // Load advisor daily question count (reset if from a different day)
      if (storedAdvisorCount) {
        try {
          const parsed = JSON.parse(storedAdvisorCount);
          const today = new Date().toDateString();
          if (parsed.date === today) {
            setAdvisorQuestionsToday(parsed.count || 0);
          }
        } catch (e) { /* ignore */ }
      }

      // Mark data as loaded BEFORE fetching prices - this prevents the save useEffect from overwriting
      setDataLoaded(true);

      // Delay fetchSpotPrices to not block the main thread
      setTimeout(() => {
        fetchSpotPrices().catch(err => {
          if (__DEV__ && err?.name !== 'AbortError') console.error('fetchSpotPrices failed:', err?.message);
        });
      }, 100);
    } catch (error) {
      if (__DEV__) console.error('Error loading data:', error?.message || error);
      // Still mark as loaded on error to prevent infinite loop, but data won't be overwritten
      setDataLoaded(true);
    } finally {
      setIsLoading(false);
    }
  };

  const saveData = async (key, data) => {
    try {
      await AsyncStorage.setItem(key, JSON.stringify(data));
    } catch (error) {
      if (__DEV__) console.error('Error saving data:', error);
    }
  };

  // Save custom milestone goals
  const saveMilestones = async () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      const silverVal = parseFloat(tempSilverMilestone);
      const goldVal = parseFloat(tempGoldMilestone);

      // Validate inputs
      if (tempSilverMilestone && (isNaN(silverVal) || silverVal <= 0)) {
        Alert.alert('Invalid Input', 'Please enter a valid silver milestone (positive number)');
        return;
      }
      if (tempGoldMilestone && (isNaN(goldVal) || goldVal <= 0)) {
        Alert.alert('Invalid Input', 'Please enter a valid gold milestone (positive number)');
        return;
      }

      // Save silver milestone
      if (tempSilverMilestone && silverVal > 0) {
        setCustomSilverMilestone(silverVal);
        await AsyncStorage.setItem('stack_silver_milestone', silverVal.toString());
        // Reset "reached" tracking if new goal is higher than current stack
        if (silverVal > totalSilverOzt) {
          setLastReachedSilverMilestone(null);
          await AsyncStorage.removeItem('stack_last_silver_milestone_reached');
        }
      } else {
        setCustomSilverMilestone(null);
        await AsyncStorage.removeItem('stack_silver_milestone');
      }

      // Save gold milestone
      if (tempGoldMilestone && goldVal > 0) {
        setCustomGoldMilestone(goldVal);
        await AsyncStorage.setItem('stack_gold_milestone', goldVal.toString());
        if (goldVal > totalGoldOzt) {
          setLastReachedGoldMilestone(null);
          await AsyncStorage.removeItem('stack_last_gold_milestone_reached');
        }
      } else {
        setCustomGoldMilestone(null);
        await AsyncStorage.removeItem('stack_gold_milestone');
      }

      setShowMilestoneModal(false);
    } catch (error) {
      if (__DEV__) console.error('Error saving milestones:', error);
      Alert.alert('Error', 'Failed to save milestones. Please try again.');
    }
  };

  // ============================================
  // ICLOUD SYNC FUNCTIONS
  // ============================================

  // Check if iCloud is available
  const checkiCloudAvailability = async () => {
    if (Platform.OS !== 'ios') {
      setICloudAvailable(false);
      return false;
    }
    try {
      const available = await CloudStorage.isCloudAvailable();
      setICloudAvailable(available);
      return available;
    } catch (error) {
      if (__DEV__) console.log('iCloud availability check failed:', error?.message);
      setICloudAvailable(false);
      return false;
    }
  };

  // Load iCloud sync preference
  const loadiCloudSyncPreference = async () => {
    try {
      const enabled = await AsyncStorage.getItem('stack_icloud_sync_enabled');
      const lastSync = await AsyncStorage.getItem('stack_last_sync_time');
      if (enabled === 'true') setICloudSyncEnabled(true);
      if (lastSync) setLastSyncTime(lastSync);
    } catch (error) {
      if (__DEV__) console.error('Failed to load iCloud preference:', error);
    }
  };

  // Check if user has Gold access (Gold, Silver grandfathered, or Lifetime)
  const hasGoldAccess = hasGold || hasLifetimeAccess;

  // hasPaidAccess is now identical to hasGoldAccess (Silver grandfathered to Gold)
  const hasPaidAccess = hasGoldAccess;

  // Troy daily question limits
  const TROY_FREE_LIMIT = 3;

  // Save holdings to iCloud
  const syncToCloud = async (silver = silverItems, gold = goldItems, platinum = platinumItems, palladium = palladiumItems) => {
    if (!hasGoldAccess || !iCloudSyncEnabled || !iCloudAvailable || Platform.OS !== 'ios') return;

    try {
      setICloudSyncing(true);
      const cloudData = {
        silverItems: silver,
        goldItems: gold,
        platinumItems: platinum,
        palladiumItems: palladium,
        lastModified: new Date().toISOString(),
        version: '1.1',
      };

      await CloudStorage.writeFile(
        ICLOUD_HOLDINGS_KEY,
        JSON.stringify(cloudData),
        CloudStorageScope.Documents
      );

      const syncTime = new Date().toISOString();
      setLastSyncTime(syncTime);
      await AsyncStorage.setItem('stack_last_sync_time', syncTime);
      if (__DEV__) console.log('Synced to iCloud successfully');
    } catch (error) {
      if (__DEV__) console.error('iCloud sync failed:', error?.message);
    } finally {
      setICloudSyncing(false);
    }
  };

  // Load holdings from iCloud
  const syncFromCloud = async () => {
    if (!iCloudAvailable || Platform.OS !== 'ios') return null;

    try {
      setICloudSyncing(true);
      const exists = await CloudStorage.exists(ICLOUD_HOLDINGS_KEY, CloudStorageScope.Documents);
      if (!exists) {
        if (__DEV__) console.log('No iCloud data found');
        return null;
      }

      const content = await CloudStorage.readFile(ICLOUD_HOLDINGS_KEY, CloudStorageScope.Documents);
      const cloudData = JSON.parse(content);

      return cloudData;
    } catch (error) {
      if (__DEV__) console.error('Failed to read from iCloud:', error?.message);
      return null;
    } finally {
      setICloudSyncing(false);
    }
  };

  // Toggle iCloud sync
  const toggleiCloudSync = async (enabled) => {
    if (enabled && !iCloudAvailable) {
      Alert.alert('iCloud Unavailable', 'Please sign in to iCloud in your device settings to enable sync.');
      return;
    }

    setICloudSyncEnabled(enabled);
    await AsyncStorage.setItem('stack_icloud_sync_enabled', enabled ? 'true' : 'false');

    if (enabled) {
      // Check for existing cloud data
      const cloudData = await syncFromCloud();
      if (cloudData && cloudData.lastModified) {
        const localTimestamp = await AsyncStorage.getItem('stack_last_modified');
        const cloudTime = new Date(cloudData.lastModified).getTime();
        const localTime = localTimestamp ? new Date(localTimestamp).getTime() : 0;

        if (cloudTime > localTime && (cloudData.silverItems?.length > 0 || cloudData.goldItems?.length > 0 || cloudData.platinumItems?.length > 0 || cloudData.palladiumItems?.length > 0)) {
          // Cloud data is newer - ask user or auto-apply
          Alert.alert(
            'iCloud Data Found',
            'Found newer data in iCloud. Would you like to use it?',
            [
              { text: 'Keep Local', style: 'cancel', onPress: () => syncToCloud() },
              {
                text: 'Use iCloud',
                onPress: () => {
                  if (cloudData.silverItems) setSilverItems(cloudData.silverItems);
                  if (cloudData.goldItems) setGoldItems(cloudData.goldItems);
                  if (cloudData.platinumItems) setPlatinumItems(cloudData.platinumItems);
                  if (cloudData.palladiumItems) setPalladiumItems(cloudData.palladiumItems);
                  setLastSyncTime(cloudData.lastModified);
                  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                }
              },
            ]
          );
        } else {
          // Local is newer or same - sync to cloud
          await syncToCloud();
        }
      } else {
        // No cloud data - sync local to cloud
        await syncToCloud();
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  };

  // Manual sync trigger
  const triggerManualSync = async () => {
    if (!iCloudAvailable) {
      Alert.alert('iCloud Unavailable', 'Please sign in to iCloud in your device settings.');
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await syncToCloud();
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Alert.alert('Synced', 'Your holdings have been synced to iCloud.');
  };

  // Update local timestamp when data changes
  const updateLocalTimestamp = async () => {
    await AsyncStorage.setItem('stack_last_modified', new Date().toISOString());
  };

  // Initialize iCloud on app start
  useEffect(() => {
    if (Platform.OS === 'ios') {
      checkiCloudAvailability();
      loadiCloudSyncPreference();
    }
  }, []);

  // Sync to cloud when holdings change (debounced) - Gold/Lifetime only
  useEffect(() => {
    if (!isAuthenticated || !dataLoaded || !iCloudSyncEnabled || !hasGoldAccess) return;

    updateLocalTimestamp();
    const timeout = setTimeout(() => {
      syncToCloud();
    }, 2000); // Debounce 2 seconds

    return () => clearTimeout(timeout);
  }, [silverItems, goldItems, platinumItems, palladiumItems, iCloudSyncEnabled, isAuthenticated, dataLoaded, hasGoldAccess]);

  useEffect(() => {
    // Only save after initial data has been loaded to prevent overwriting with empty arrays
    // Skip saving for guest mode — data is session-only
    if (isAuthenticated && dataLoaded && !guestMode) saveData('stack_silver', silverItems);
  }, [silverItems, isAuthenticated, dataLoaded, guestMode]);

  useEffect(() => {
    // Only save after initial data has been loaded to prevent overwriting with empty arrays
    if (isAuthenticated && dataLoaded && !guestMode) saveData('stack_gold', goldItems);
  }, [goldItems, isAuthenticated, dataLoaded, guestMode]);

  useEffect(() => {
    if (isAuthenticated && dataLoaded && !guestMode) saveData('stack_platinum', platinumItems);
  }, [platinumItems, isAuthenticated, dataLoaded, guestMode]);

  useEffect(() => {
    if (isAuthenticated && dataLoaded && !guestMode) saveData('stack_palladium', palladiumItems);
  }, [palladiumItems, isAuthenticated, dataLoaded, guestMode]);

  // Manual sync function - can be called on pull-to-refresh or button press
  const syncHoldingsWithSupabase = async (force = false) => {
    // Only sync if user is signed in and data is loaded
    if (!supabaseUser || !dataLoaded) {
      if (__DEV__) console.log('Sync skipped: user not signed in or data not loaded');
      return false;
    }

    // Skip if already syncing
    if (isSyncing) {
      if (__DEV__) console.log('Sync skipped: already syncing');
      return false;
    }

    // Skip if already synced (unless forced)
    if (hasSyncedOnce && !force) {
      if (__DEV__) console.log('Sync skipped: already synced this session (use force=true to override)');
      return false;
    }

    setIsSyncing(true);
    setSyncError(null);

    try {
      // Check if this user has ever synced before (for first-time migration)
      const syncKey = `stack_synced_${supabaseUser.id}`;
      const hasEverSynced = await AsyncStorage.getItem(syncKey);
      const isFirstSync = !hasEverSynced;

      if (__DEV__) console.log(`Starting Supabase holdings sync... (firstSync: ${isFirstSync})`);

      // fullSync will:
      // - If first sync AND Supabase empty: migrate local holdings to Supabase
      // - Otherwise: just fetch from Supabase (source of truth)
      const { silverItems: remoteSilver, goldItems: remoteGold, platinumItems: remotePlatinum, palladiumItems: remotePalladium, syncedToCloud, error } = await fullSync(
        supabaseUser.id,
        silverItems,
        goldItems,
        isFirstSync,
        platinumItems,
        palladiumItems
      );

      if (error) {
        if (__DEV__) console.error('Supabase sync error:', error);
        setSyncError(error.message);
        return false;
      } else {
        // Mark that this user has synced at least once
        await AsyncStorage.setItem(syncKey, 'true');

        // Replace local state with Supabase data (Supabase is source of truth)
        setSilverItems(remoteSilver);
        setGoldItems(remoteGold);
        setPlatinumItems(remotePlatinum);
        setPalladiumItems(remotePalladium);

        if (__DEV__) {
          if (__DEV__) console.log(`Supabase sync complete: ${syncedToCloud} items migrated, ${remoteSilver.length} silver, ${remoteGold.length} gold, ${remotePlatinum.length} platinum, ${remotePalladium.length} palladium from cloud`);
        }
      }

      setHasSyncedOnce(true);
      return true;
    } catch (err) {
      if (__DEV__) console.error('Supabase sync failed:', err);
      setSyncError(err.message || 'Sync failed');
      return false;
    } finally {
      setIsSyncing(false);
    }
  };

  // Supabase Holdings Sync - sync on app load when user is already signed in
  useEffect(() => {
    // Only run auto-sync if:
    // 1. User is signed in with Supabase
    // 2. Data has been loaded from local storage
    // 3. Haven't synced yet this session
    if (supabaseUser && dataLoaded && !hasSyncedOnce && !isSyncing) {
      if (__DEV__) console.log('Auto-sync triggered: user signed in, data loaded');
      syncHoldingsWithSupabase().finally(() => {
        setNeedsPostSignInSync(false);
      });
    }
  }, [supabaseUser, dataLoaded, hasSyncedOnce, isSyncing]);

  // Reset sync flag when user signs out
  useEffect(() => {
    if (!supabaseUser) {
      setHasSyncedOnce(false);
    }
  }, [supabaseUser]);

  // Milestone Reached Detection
  useEffect(() => {
    const checkMilestoneReached = async () => {
      // Check silver milestone
      if (customSilverMilestone && totalSilverOzt >= customSilverMilestone) {
        if (lastReachedSilverMilestone !== customSilverMilestone) {
          // Milestone reached! Show congratulations alert
          setLastReachedSilverMilestone(customSilverMilestone);
          await AsyncStorage.setItem('stack_last_silver_milestone_reached', customSilverMilestone.toString());

          // Suggest next milestone (1.5x rounded up)
          const suggestedNext = Math.ceil(customSilverMilestone * 1.5 / 10) * 10;

          Alert.alert(
            'Silver Goal Reached!',
            `Congratulations! You've reached your silver goal of ${customSilverMilestone} oz!`,
            [
              { text: 'Keep Current Goal', style: 'cancel' },
              {
                text: 'Set New Goal',
                onPress: () => {
                  setTempSilverMilestone(suggestedNext.toString());
                  setTempGoldMilestone(customGoldMilestone?.toString() || '');
                  setShowMilestoneModal(true);
                }
              },
            ]
          );
        }
      }

      // Check gold milestone
      if (customGoldMilestone && totalGoldOzt >= customGoldMilestone) {
        if (lastReachedGoldMilestone !== customGoldMilestone) {
          setLastReachedGoldMilestone(customGoldMilestone);
          await AsyncStorage.setItem('stack_last_gold_milestone_reached', customGoldMilestone.toString());

          const suggestedNext = Math.ceil(customGoldMilestone * 1.5);

          Alert.alert(
            'Gold Goal Reached!',
            `Congratulations! You've reached your gold goal of ${customGoldMilestone} oz!`,
            [
              { text: 'Keep Current Goal', style: 'cancel' },
              {
                text: 'Set New Goal',
                onPress: () => {
                  setTempGoldMilestone(suggestedNext.toString());
                  setTempSilverMilestone(customSilverMilestone?.toString() || '');
                  setShowMilestoneModal(true);
                }
              },
            ]
          );
        }
      }
    };

    if (dataLoaded) {
      checkMilestoneReached();
    }
  }, [totalSilverOzt, totalGoldOzt, customSilverMilestone, customGoldMilestone, dataLoaded]);

  useEffect(() => { authenticate(); }, []);

  useEffect(() => {
    // Set audio mode at mount via expo-audio (eager iOS category control).
    // expo-av's setAudioModeAsync was unable to set iosCategory at all;
    // expo-audio applies setCategory directly to AVAudioSession on this call.
    // Recording boundaries still toggle expo-av's allowsRecordingIOS for now —
    // those will migrate to expo-audio in a follow-up PR.
    // Keys map: allowsRecordingIOS→allowsRecording, playsInSilentModeIOS→playsInSilentMode,
    // staysActiveInBackground→shouldPlayInBackground, interruptionModeIOS→interruptionMode (string union),
    // playThroughEarpieceAndroid→shouldRouteThroughEarpiece. shouldDuckAndroid folds into interruptionMode.
    setAudioModeAsyncV2({
      allowsRecording: false,
      playsInSilentMode: true,
      shouldPlayInBackground: true,
      interruptionMode: 'doNotMix',
      shouldRouteThroughEarpiece: false,
    }).catch((e) => {
      console.log('[Audio] setAudioModeAsync (expo-audio) failed:', e?.message);
    });
  }, []);

  // Register for push notifications (for price alerts)
  const registerForPushNotifications = async () => {
    if (__DEV__) console.log('📱 [Push] registerForPushNotifications() called');
    if (__DEV__) console.log('📱 [Push] API_BASE_URL:', API_BASE_URL);
    try {
      // Check existing permissions
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      if (__DEV__) console.log('📱 [Push] Current permission status:', existingStatus);
      let finalStatus = existingStatus;

      // Request permission if not granted
      if (existingStatus !== 'granted') {
        if (__DEV__) console.log('📱 [Notifications] Requesting permission...');
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
        if (__DEV__) console.log('📱 [Notifications] Permission result:', finalStatus);
      }

      if (finalStatus !== 'granted') {
        if (__DEV__) console.log('📱 [Notifications] Permission not granted, finalStatus:', finalStatus);
        return null;
      }

      // Get Expo push token
      const projectId = Constants.expoConfig?.extra?.eas?.projectId;
      if (__DEV__) console.log('📱 [Notifications] Getting push token, projectId:', projectId);
      const tokenData = await Notifications.getExpoPushTokenAsync({
        projectId,
      });

      const token = tokenData.data;
      if (__DEV__) console.log('📱 [Notifications] Push Token:', token);

      // Configure notification channel for Android
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('default', {
          name: 'default',
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#fbbf24',
        });
      }

      // Sync token to backend for price alert notifications
      try {
        let deviceId = await AsyncStorage.getItem('device_id');
        if (!deviceId) {
          deviceId = Constants.deviceId || `anon-${Date.now()}`;
          await AsyncStorage.setItem('device_id', deviceId);
        }

        const response = await fetch(`${API_BASE_URL}/v1/push/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            expo_push_token: token,
            platform: Platform.OS,
            app_version: Constants.expoConfig?.version,
            user_id: supabaseUser?.id || null,
            device_id: deviceId,
          }),
        });

        const result = await response.json();
        if (!response.ok) {
          if (__DEV__) console.error('❌ [Notifications] Backend rejected push token:', result);
          if (__DEV__) console.warn('Push notifications may not work for price alerts');
        } else {
          if (__DEV__) console.log('✅ [Notifications] Push token registered with backend:', result);
        }
      } catch (backendError) {
        if (__DEV__) console.error('❌ [Notifications] Failed to register token with backend:', backendError);
        if (__DEV__) console.warn('Push notifications for price alerts may not work — token sync failed');
      }

      return token;
    } catch (error) {
      if (__DEV__) console.error('❌ [Notifications] Registration error:', error);
      return null;
    }
  };

  // Register for push notifications after authentication AND user ID is available
  useEffect(() => {
    if (!isAuthenticated || !supabaseUser?.id) return;
    if (__DEV__) console.log('🔔 [Push] Authenticated with user_id — registering for push notifications...');
    registerForPushNotifications().then(token => {
      if (token) {
        if (__DEV__) console.log('🔔 [Push] Token obtained:', token);
        setExpoPushToken(token);
      } else {
        if (__DEV__) console.log('🔔 [Push] No token obtained (permission denied or error)');
      }
    });
  }, [isAuthenticated, supabaseUser?.id]);

  // Fetch notification preferences from backend
  const fetchNotifPrefs = async () => {
    if (!supabaseUser?.id) return;
    try {
      const response = await fetch(`${API_BASE_URL}/v1/push/notification-preferences?userId=${supabaseUser.id}`);
      if (response.ok) {
        const data = await response.json();
        setNotifPrefs({
          daily_brief: data.daily_brief !== false,
          price_alerts: data.price_alerts !== false,
          comex_alerts: data.comex_alerts !== false,
        });
      }
    } catch (err) {
      if (__DEV__) console.log('🔔 [NotifPrefs] Fetch error:', err.message);
    }
  };

  // Save a single notification preference toggle
  const saveNotifPref = async (key, value) => {
    const updated = { ...notifPrefs, [key]: value };
    setNotifPrefs(updated);
    if (!supabaseUser?.id) return;
    try {
      await fetch(`${API_BASE_URL}/v1/push/notification-preferences`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: supabaseUser.id, ...updated }),
      });
    } catch (err) {
      if (__DEV__) console.log('🔔 [NotifPrefs] Save error:', err.message);
    }
  };

  // Fetch notification preferences after authentication
  useEffect(() => {
    if (isAuthenticated && supabaseUser?.id) {
      fetchNotifPrefs();
    }
  }, [isAuthenticated]);

  // Sync price alerts from backend on app load (works for anonymous + authenticated users)
  useEffect(() => {
    if (dataLoaded) {
      if (__DEV__) console.log('🔄 [Push] App loaded — syncing price alerts from backend');
      syncAlertsFromBackend();
    }
  }, [dataLoaded]);

  // Handle notification received in foreground (for logging)
  useEffect(() => {
    const receivedSub = Notifications.addNotificationReceivedListener(notification => {
      if (__DEV__) console.log('🔔 [Push] Notification RECEIVED in foreground:', JSON.stringify(notification.request.content));
    });

    return () => receivedSub.remove();
  }, []);

  // Handle notification taps (when user taps on a push notification)
  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener(response => {
      const data = response.notification.request.content.data;
      if (__DEV__) console.log('🔔 [Push] Notification TAPPED:', JSON.stringify(data));

      if (data.type === 'price_alert') {
        // Show alert details
        Alert.alert(
          `${data.metal ? data.metal.toUpperCase() : 'Price'} Alert`,
          `Current price: $${data.current_price || 'N/A'}\nTarget: $${data.target_price || 'N/A'}`,
          [{ text: 'OK' }]
        );
      }
    });

    return () => subscription.remove();
  }, []);

  // Check entitlements function (can be called after purchase)
  const checkEntitlements = async () => {
    try {
      const customerInfo = await Purchases.getCustomerInfo();

      // Safety checks for customerInfo structure
      if (!customerInfo) {
        if (__DEV__) console.log('❌ No customer info returned from RevenueCat');
        return false;
      }

      const activeEntitlements = customerInfo?.entitlements?.active || {};
      const isGold = activeEntitlements['Gold'] !== undefined;
      const isSilver = activeEntitlements['Silver'] !== undefined; // Silver grandfathered to Gold
      const isLifetime = activeEntitlements['Lifetime'] !== undefined;
      const userId = customerInfo?.originalAppUserId || null;
      const tier = getUserTier(customerInfo);

      if (__DEV__) console.log('📋 RevenueCat User ID:', userId);
      if (__DEV__) console.log('🏆 Has Gold:', isGold, 'Has Silver (→Gold):', isSilver, 'Has Lifetime:', isLifetime, 'Tier:', tier);

      setHasGold(__DEV__ ? true : (isGold || isSilver));
      setHasLifetimeAccess(__DEV__ ? true : isLifetime);
      setUserTier(__DEV__ ? 'gold' : tier);
      setRevenueCatUserId(userId);

      return __DEV__ || isGold || isSilver || isLifetime;
    } catch (error) {
      console.log('[Entitlements] Error checking:', error?.message);
      return __DEV__ || false;
    }
  };

  // Sync RevenueCat tier → Supabase profiles (fire-and-forget, never blocks UI)
  const syncSubscriptionToSupabase = async (userId, tierOverride) => {
    try {
      const tier = tierOverride || userTier || 'free';
      const tierMap = {
        'gold': { subscription_tier: 'gold', subscription_status: 'active' },
        'lifetime': { subscription_tier: 'lifetime', subscription_status: 'active' },
        'free': { subscription_tier: 'free', subscription_status: null },
      };
      const values = tierMap[tier] || tierMap['free'];
      const { error } = await supabase.from('profiles').update(values).eq('id', userId);
      if (__DEV__) {
        if (error) console.log('[Sync] Failed to sync tier to Supabase:', error.message);
        else console.log(`[Sync] Synced tier to Supabase: ${tier}`);
      }
    } catch (e) {
      if (__DEV__) console.log('[Sync] Error syncing subscription:', e.message);
    }
  };

  // Restore purchases handler (used by inline upgrade bars)
  const handleRestore = async () => {
    try {
      const restored = await restorePurchases();
      if (restored.hasGold || restored.hasSilver) {
        await checkEntitlements(); // Re-check all entitlements to set correct tier
        Alert.alert('Purchases Restored!', 'Your subscription has been restored.');
      } else {
        Alert.alert('No Purchases Found', 'No active subscriptions were found to restore.');
      }
    } catch (error) {
      Alert.alert('Restore Failed', 'Could not restore purchases. Please try again.');
    }
  };

  // Initialize RevenueCat (non-blocking, runs after authentication)
  // IMPORTANT: Uses setTimeout to ensure this doesn't block the main render
  useEffect(() => {
    if (!isAuthenticated) return; // Wait for auth to complete first

    // Delay RevenueCat setup slightly to ensure UI renders first
    const timeoutId = setTimeout(() => {
      const setupRevenueCat = async () => {
        try {
          // Use the same API key for all builds - RevenueCat auto-detects sandbox vs production
          // based on the App Store receipt. EAS dev builds use release mode so __DEV__ is false.
          const apiKey = 'appl_WDKPrWsOHfWzfJhxOGluQYsniLW';

          if (__DEV__) console.log('🔧 Initializing RevenueCat...');

          // Pass Supabase user ID to tie subscriptions to user account (not device)
          // If guest mode, pass null (uses anonymous device ID)
          const appUserId = supabaseUser?.id || null;
          
          if (appUserId) {
            if (__DEV__) console.log('👤 RevenueCat: Tying subscription to user account:', appUserId.substring(0, 8) + '...');
          } else if (guestMode) {
            if (__DEV__) console.log('🕶️ RevenueCat: Guest mode - using anonymous device ID');
          }

          const initialized = await initializePurchases(apiKey, appUserId);
          if (initialized) {
            // Log in to RevenueCat to transfer anonymous purchases to authenticated user
            if (appUserId) {
              try {
                await loginRevenueCat(appUserId);
              } catch (error) {
                if (__DEV__) console.error('RevenueCat login failed (non-fatal):', error?.message || error);
              }
            }
            // Additional delay before checking entitlements
            await new Promise(resolve => setTimeout(resolve, 100));
            await checkEntitlements();
            // Sync RevenueCat tier → Supabase (fire-and-forget)
            if (appUserId) {
              const syncInfo = await Purchases.getCustomerInfo();
              const syncActive = syncInfo?.entitlements?.active || {};
              const goldEnt = syncActive['Gold'];
              const isLifetimeProduct = goldEnt?.productIdentifier?.toLowerCase().includes('lifetime');
              const syncTier = syncActive['Lifetime'] ? 'lifetime' : isLifetimeProduct ? 'lifetime' : (syncActive['Gold'] || syncActive['Silver']) ? 'gold' : 'free';
              syncSubscriptionToSupabase(appUserId, syncTier);
            }
            if (__DEV__) console.log('✅ RevenueCat setup complete');
          } else {
            if (__DEV__) console.log('⚠️ RevenueCat initialization returned false, skipping entitlements');
          }
          setSubscriptionLoading(false); // Done checking subscription status
        } catch (error) {
          // Log but don't crash - RevenueCat is not critical for app function
          if (__DEV__) console.error('RevenueCat setup failed (non-fatal):', error?.message || error);
          setSubscriptionLoading(false); // Done even on error
        }
      };
      setupRevenueCat();
    }, 500); // 500ms delay to let UI settle

    return () => clearTimeout(timeoutId);
  }, [isAuthenticated, supabaseUser?.id, guestMode]); // Re-run when user changes

  // RevenueCat real-time listener — updates tier immediately on purchase/restore/expiry
  useEffect(() => {
    const removeListener = Purchases.addCustomerInfoUpdateListener(async (customerInfo) => {
      if (!customerInfo) return;
      const activeEntitlements = customerInfo?.entitlements?.active || {};
      const isGold = activeEntitlements['Gold'] !== undefined;
      const isSilver = activeEntitlements['Silver'] !== undefined; // Silver grandfathered to Gold
      const isLifetime = activeEntitlements['Lifetime'] !== undefined;
      const tier = getUserTier(customerInfo);

      setHasGold(isGold || isSilver);
      setHasLifetimeAccess(isLifetime);
      setUserTier(tier);

      if (__DEV__) console.log('[RevenueCat Listener] Tier updated:', tier);

      // Sync to Supabase — use specific tier (lifetime vs gold)
      if (supabaseUser?.id) {
        const goldEntListener = activeEntitlements['Gold'];
        const isLifetimeProductListener = goldEntListener?.productIdentifier?.toLowerCase().includes('lifetime');
        const syncTier = isLifetime ? 'lifetime' : isLifetimeProductListener ? 'lifetime' : (isGold || isSilver) ? 'gold' : 'free';
        syncSubscriptionToSupabase(supabaseUser.id, syncTier);
      }
    });

    return () => { if (removeListener) removeListener(); };
  }, [supabaseUser?.id]);

  // Register background fetch for iOS (keeps widget data fresh when app is closed)
  useEffect(() => {
    if (Platform.OS === 'ios') {
      const setupBackgroundFetch = async () => {
        try {
          const registered = await registerBackgroundFetch();
          if (registered) {
            const status = await getBackgroundFetchStatus();
            if (__DEV__) console.log('📡 Background fetch status:', status);
          }
        } catch (error) {
          // Non-critical - log but don't crash
          if (__DEV__) console.log('Background fetch setup skipped:', error?.message);
        }
      };
      setupBackgroundFetch();
    }
  }, []); // Run once on mount

  // Deep link handler for password reset
  useEffect(() => {
    const handleDeepLink = async (url) => {
      if (!url) return;

      // Handle troystack:// deep links (from widgets)
      if (url.includes('troystack://chat')) {
        setCurrentScreen('TroyChat');
        return;
      }
      if (url.includes('troystack://voice')) {
        setCurrentScreen('TroyChat');
        return;
      }
      if (url.includes('troystack://scan')) {
        setCurrentScreen('MyStack');
        // Small delay to let screen mount before triggering scan
        setTimeout(() => performScan('camera'), 500);
        return;
      }

      if (!url.includes('auth/reset-password')) return;

      try {
        // Supabase appends tokens as hash fragments: #access_token=...&refresh_token=...
        const hashIndex = url.indexOf('#');
        if (hashIndex !== -1) {
          const hash = url.substring(hashIndex + 1);
          const params = {};
          hash.split('&').forEach(pair => {
            const [key, value] = pair.split('=');
            if (key && value) params[decodeURIComponent(key)] = decodeURIComponent(value);
          });

          if (params.access_token && params.refresh_token) {
            await supabase.auth.setSession({
              access_token: params.access_token,
              refresh_token: params.refresh_token,
            });
          }
        }
      } catch (err) {
        if (__DEV__) console.log('Failed to parse reset password deep link:', err?.message);
      }

      setShowResetPasswordScreen(true);
    };

    const subscription = Linking.addEventListener('url', ({ url }) => handleDeepLink(url));
    Linking.getInitialURL().then(url => {
      if (url) handleDeepLink(url);
    });

    return () => subscription.remove();
  }, []);

  // Fetch scan status when RevenueCat user ID is available
  useEffect(() => {
    if (revenueCatUserId && !hasGold && !hasLifetimeAccess) {
      fetchScanStatus();
    }
  }, [revenueCatUserId, hasGold, hasLifetimeAccess]);

  // Load price alerts from local storage
  useEffect(() => {
    if (hasGold || hasLifetimeAccess) {
      fetchPriceAlerts();
    }
  }, [hasGold, hasLifetimeAccess]);

  // Daily Snapshot: Check if it's a new day and update midnight snapshot
  // Stores oz counts and spot prices so we can recalculate baseline when items change
  useEffect(() => {
    const checkAndUpdateMidnightSnapshot = async () => {
      // IMPORTANT: Wait until data is loaded AND we have live spot prices from API
      // This prevents saving wrong values before prices are fetched
      if (!isAuthenticated || !dataLoaded || !spotPricesLive) {
        if (__DEV__ && !spotPricesLive && dataLoaded) {
          if (__DEV__) console.log('📸 Snapshot deferred: waiting for live spot prices...');
        }
        return;
      }

      // Only update if we have actual portfolio data (items loaded)
      // If totalMeltValue is 0 with no items, that's valid - but if items exist, value should be > 0
      const hasItems = silverItems.length > 0 || goldItems.length > 0 || platinumItems.length > 0 || palladiumItems.length > 0;
      if (hasItems && totalMeltValue === 0) {
        // Items exist but value is 0 - something is wrong, skip
        if (__DEV__) console.log('📸 Snapshot skipped: items exist but value is 0');
        return;
      }

      const today = new Date().toDateString(); // e.g., "Mon Dec 29 2025"

      // If no snapshot or it's a new day, create new snapshot
      if (!midnightSnapshot || midnightSnapshot.date !== today) {
        // Use previous day's closing prices if available (from backend change data)
        // This ensures "Today's Change" reflects actual movement since yesterday's close
        // Fall back to current prices only if prevClose is not available
        const baselineSilverSpot = spotChange.silver.prevClose ?? silverSpot;
        const baselineGoldSpot = spotChange.gold.prevClose ?? goldSpot;
        const baselinePlatinumSpot = spotChange.platinum?.prevClose ?? platinumSpot;
        const baselinePalladiumSpot = spotChange.palladium?.prevClose ?? palladiumSpot;

        const snapshot = {
          silverOzt: totalSilverOzt,
          goldOzt: totalGoldOzt,
          platinumOzt: totalPlatinumOzt,
          palladiumOzt: totalPalladiumOzt,
          silverSpot: baselineSilverSpot,
          goldSpot: baselineGoldSpot,
          platinumSpot: baselinePlatinumSpot,
          palladiumSpot: baselinePalladiumSpot,
          date: today,
          timestamp: new Date().toISOString(),
        };

        await AsyncStorage.setItem('stack_midnight_snapshot', JSON.stringify(snapshot));
        setMidnightSnapshot(snapshot);

        const snapshotValue = (totalSilverOzt * baselineSilverSpot) + (totalGoldOzt * baselineGoldSpot) + (totalPlatinumOzt * baselinePlatinumSpot) + (totalPalladiumOzt * baselinePalladiumSpot);
        const usingPrevClose = spotChange.silver.prevClose != null;
        if (__DEV__) console.log(`📸 Daily snapshot: ${totalSilverOzt.toFixed(2)}oz Ag @ $${baselineSilverSpot}, ${totalGoldOzt.toFixed(3)}oz Au @ $${baselineGoldSpot} = $${snapshotValue.toFixed(2)} (${usingPrevClose ? 'prev close' : 'current'})`);
      }
    };

    // Check on app open and when prices are loaded
    checkAndUpdateMidnightSnapshot();
  }, [isAuthenticated, dataLoaded, spotPricesLive, midnightSnapshot, totalSilverOzt, totalGoldOzt, totalPlatinumOzt, totalPalladiumOzt, silverSpot, goldSpot, platinumSpot, palladiumSpot, totalMeltValue, silverItems.length, goldItems.length, platinumItems.length, palladiumItems.length, spotChange]);

  // Auto-refresh spot prices every 1 minute (when app is active)
  // Track previous app state to detect foreground transitions
  const appStateRef = useRef(AppState.currentState);

  useEffect(() => {
    let priceRefreshInterval = null;

    const startPriceRefresh = () => {
      // Clear any existing interval
      if (priceRefreshInterval) {
        clearInterval(priceRefreshInterval);
      }

      // Fetch prices every 60 seconds (1 minute) when app is active
      priceRefreshInterval = setInterval(() => {
        if (__DEV__) console.log('🔄 Auto-refreshing spot prices (1-min interval)...');
        fetchSpotPrices(true); // silent = true (no loading indicator)
      }, 60000); // 60,000ms = 1 minute
    };

    const stopPriceRefresh = () => {
      if (priceRefreshInterval) {
        clearInterval(priceRefreshInterval);
        priceRefreshInterval = null;
        if (__DEV__) console.log('⏸️  Paused auto-refresh (app in background)');
      }
    };

    // Listen to app state changes
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      const previousState = appStateRef.current;
      appStateRef.current = nextAppState;

      // App came to foreground from background/inactive
      if (nextAppState === 'active' && previousState !== 'active') {
        if (__DEV__) console.log('▶️  App came to foreground - fetching fresh prices immediately');
        // ALWAYS fetch fresh prices when app comes to foreground
        fetchSpotPrices(true).catch(err => {
          // Ignore AbortError, only log actual errors
          if (err?.name !== 'AbortError' && __DEV__) {
            if (__DEV__) console.error('Foreground price fetch failed:', err?.message);
          }
        });
        startPriceRefresh();
      } else if (nextAppState !== 'active') {
        // App went to background - stop auto-refresh
        stopPriceRefresh();
      }
    });

    // Start auto-refresh when component mounts (app is active)
    if (AppState.currentState === 'active') {
      startPriceRefresh();
    }

    // Cleanup on unmount
    return () => {
      stopPriceRefresh();
      subscription.remove();
    };
  }, []); // Empty dependency - set up once on mount

  // Free tier limit check
  const handleAddPurchase = () => {
    const FREE_TIER_LIMIT = 25;
    const totalItems = silverItems.length + goldItems.length + platinumItems.length + palladiumItems.length;

    if (!hasGoldAccess && totalItems >= FREE_TIER_LIMIT) {
      // User has reached free tier limit, show paywall
      // Haptic feedback on hitting limit
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);

      Alert.alert(
        'Upgrade for More Items',
        `You've reached the free tier limit of ${FREE_TIER_LIMIT} items. Upgrade for unlimited items!`,
        [
          { text: 'Maybe Later', style: 'cancel' },
          { text: 'Upgrade Now', onPress: () => setShowPaywallModal(true) }
        ]
      );
    } else {
      // User can add more items
      resetForm();
      // Ensure a valid metal is selected (not 'both') when adding new items
      if (metalTab === 'both' || metalTab === 'all') {
        setMetalTab('silver'); // Default to silver when adding from "All" view
      }
      setShowAddModal(true);
    }
  };

  // Tutorial completion handler
  const handleTutorialComplete = async () => {
    try {
      await AsyncStorage.setItem('stack_has_seen_tutorial', 'true');
      setShowTutorial(false);
    } catch (error) {
      if (__DEV__) console.error('Error saving tutorial status:', error);
      setShowTutorial(false);
    }
  };

  // Troy — persistent conversation API helpers
  const troyAPI = {
    async createConversation() {
      const res = await fetch(`${API_BASE_URL}/v1/troy/conversations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: supabaseUser?.id || null })
      });
      return res.json();
    },
    async listConversations() {
      const res = await fetch(`${API_BASE_URL}/v1/troy/conversations?userId=${supabaseUser?.id || null}`);
      return res.json();
    },
    async getConversation(conversationId) {
      const res = await fetch(`${API_BASE_URL}/v1/troy/conversations/${conversationId}?userId=${supabaseUser?.id || null}`);
      return res.json();
    },
    async deleteConversation(conversationId) {
      const res = await fetch(`${API_BASE_URL}/v1/troy/conversations/${conversationId}?userId=${supabaseUser?.id || null}`, {
        method: 'DELETE'
      });
      return res.json();
    },
    async sendMessage(conversationId, message, signal) {
      const res = await fetch(`${API_BASE_URL}/v1/troy/conversations/${conversationId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: supabaseUser?.id || null, message }),
        signal,
      });
      return res.json();
    }
  };

  // Stack Signal API
  const stackSignalAPI = {
    async fetchArticles(offset = 0, limit = 20) {
      const res = await fetch(`${API_BASE_URL}/v1/stack-signal?limit=${limit}&offset=${offset}`);
      return res.json();
    },
    async fetchDaily() {
      const res = await fetch(`${API_BASE_URL}/v1/stack-signal/latest`);
      return res.json();
    },
    async fetchArticle(slug) {
      const res = await fetch(`${API_BASE_URL}/v1/stack-signal/${slug}`);
      return res.json();
    },
  };

  const openStackSignal = async () => {
    setShowStackSignal(true);
    setStackSignalLoading(true);
    try {
      const [articlesRes, dailyRes] = await Promise.all([
        stackSignalAPI.fetchArticles(0, 20),
        stackSignalAPI.fetchDaily(),
      ]);
      if (__DEV__) console.log('📡 Stack Signal articles response:', JSON.stringify(articlesRes).slice(0, 300));
      if (__DEV__) console.log('📡 Stack Signal daily response:', JSON.stringify(dailyRes).slice(0, 300));
      const articles = articlesRes?.articles || (Array.isArray(articlesRes) ? articlesRes : []);
      const daily = dailyRes?.signal || (dailyRes?.id ? dailyRes : null);
      setStackSignalArticles(articles);
      setStackSignalDaily(daily);
    } catch (err) {
      if (__DEV__) console.log('Stack Signal load error:', err.message);
    } finally {
      setStackSignalLoading(false);
    }
  };

  const fetchStackSignalData = async () => {
    try {
      const [articlesRes, dailyRes] = await Promise.all([
        stackSignalAPI.fetchArticles(0, 20),
        stackSignalAPI.fetchDaily(),
      ]);
      const articles = articlesRes?.articles || (Array.isArray(articlesRes) ? articlesRes : []);
      const daily = dailyRes?.signal || (dailyRes?.id ? dailyRes : null);
      setStackSignalArticles(articles);
      setStackSignalDaily(daily);
    } catch (err) {
      if (__DEV__) console.log('Stack Signal data fetch error:', err.message);
    }
  };

  const refreshStackSignal = async () => {
    setStackSignalRefreshing(true);
    try {
      const [articlesRes, dailyRes] = await Promise.all([
        stackSignalAPI.fetchArticles(0, 20),
        stackSignalAPI.fetchDaily(),
      ]);
      const articles = articlesRes?.articles || (Array.isArray(articlesRes) ? articlesRes : []);
      const daily = dailyRes?.signal || (dailyRes?.id ? dailyRes : null);
      setStackSignalArticles(articles);
      setStackSignalDaily(daily);
    } catch (err) {
      if (__DEV__) console.log('Stack Signal refresh error:', err.message);
    } finally {
      setStackSignalRefreshing(false);
    }
  };

  const loadMoreStackSignal = async () => {
    if (stackSignalLoading || stackSignalRefreshing) return;
    try {
      const moreRes = await stackSignalAPI.fetchArticles(stackSignalArticles.length, 20);
      const moreArticles = moreRes?.articles || (Array.isArray(moreRes) ? moreRes : []);
      if (moreArticles.length > 0) {
        setStackSignalArticles(prev => [...prev, ...moreArticles]);
      }
    } catch (err) {
      if (__DEV__) console.log('Stack Signal load more error:', err.message);
    }
  };

  // --- Signal social engagement helpers ---
  const recordArticleView = async (articleId) => {
    try {
      const body = supabaseUser?.id
        ? { userId: supabaseUser.id }
        : { deviceId: await getDeviceId() };
      const res = await fetch(`${API_BASE_URL}/v1/articles/${articleId}/view`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.view_count !== undefined) {
        setStackSignalArticles(prev => prev.map(a =>
          a.id === articleId ? { ...a, view_count: data.view_count } : a
        ));
      }
    } catch (e) { /* silent */ }
  };

  const toggleArticleLike = async (articleId) => {
    if (!supabaseUser?.id) {
      setShowAuthScreen(true);
      return;
    }
    // Optimistic update
    setLikedArticles(prev => {
      const cur = prev[articleId] || { liked: false, count: 0 };
      return { ...prev, [articleId]: { liked: !cur.liked, count: cur.count + (cur.liked ? -1 : 1) } };
    });
    try {
      const res = await fetch(`${API_BASE_URL}/v1/articles/${articleId}/like`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: supabaseUser.id }),
      });
      const data = await res.json();
      if (data.like_count !== undefined) {
        setLikedArticles(prev => ({ ...prev, [articleId]: { liked: data.liked, count: data.like_count } }));
      }
    } catch (e) {
      // Revert optimistic update
      setLikedArticles(prev => {
        const cur = prev[articleId] || { liked: false, count: 0 };
        return { ...prev, [articleId]: { liked: !cur.liked, count: cur.count + (cur.liked ? -1 : 1) } };
      });
    }
  };

  const fetchArticleLikeStatus = async (articleId) => {
    try {
      const res = await fetch(`${API_BASE_URL}/v1/articles/${articleId}/likes?userId=${supabaseUser?.id || ''}`);
      const data = await res.json();
      if (data.like_count !== undefined) {
        setLikedArticles(prev => ({ ...prev, [articleId]: { liked: !!data.user_liked, count: data.like_count } }));
      }
    } catch (e) { /* silent */ }
  };

  const handleShareArticle = async (article) => {
    try {
      const commentary = article.troy_commentary || article.troy_one_liner || article.summary || '';
      const preview = commentary.length > 200 ? commentary.substring(0, 200).replace(/\s+\S*$/, '') + '...' : commentary;
      const shareMessage = `${article.title}\n\n${preview}\n\nPowered by Troy \u2014 TroyStack\nhttps://www.troystack.com`;
      await Share.share({
        message: shareMessage,
        ...(Platform.OS === 'ios' && { url: 'https://www.troystack.com' }),
      });
    } catch (error) {
      if (__DEV__) console.log('Share error:', error);
    }
  };

  const openTroyChat = async () => {
    setTroyLoading(true);
    try {
      const result = await troyAPI.listConversations();
      const conversations = result?.conversations || (Array.isArray(result) ? result : []);
      setTroyConversations(conversations);
      if (conversations.length > 0) {
        await loadConversation(conversations[0].id);
      } else {
        setActiveConversationId(null);
        setTroyMessages([]);
      }
    } catch (e) {
      console.error('Failed to load Troy conversations:', e);
      setTroyConversations([]);
      setActiveConversationId(null);
      setTroyMessages([]);
    }
    setTroyLoading(false);
  };

  const loadConversation = async (conversationId) => {
    setTroyLoading(true);
    try {
      const data = await troyAPI.getConversation(conversationId);
      setActiveConversationId(conversationId);
      setTroyMessages(data.messages || []);
    } catch (e) {
      console.error('Failed to load conversation:', e);
    }
    setTroyLoading(false);
  };

  const startNewConversation = () => {
    setActiveConversationId(null);
    setTroyMessages([]);
  };

  const deleteConversation = async (conversationId) => {
    try {
      await troyAPI.deleteConversation(conversationId);
      setTroyConversations(prev => prev.filter(c => c.id !== conversationId));
      if (activeConversationId === conversationId) {
        setActiveConversationId(null);
        setTroyMessages([]);
      }
    } catch (e) {
      console.error('Failed to delete conversation:', e);
    }
  };

  // resetAudioMode removed — playAndRecord category handles both, no toggling needed

  // Stop Troy's TTS playback
  const stopTroyAudio = async () => {
    if (currentSoundRef.current) {
      try {
        await currentSoundRef.current.stopAsync();
        await currentSoundRef.current.unloadAsync();
      } catch {}
      currentSoundRef.current = null;
    }
    setPlayingMessageId(null);
    setIsPaused(false);
  };

  // Voice recording state: 'idle' | 'recording' | 'transcribing'
  const [voiceState, setVoiceState] = useState('idle');
  const setVoiceStateLog = (newState) => {
    console.log('[Voice] voiceState →', newState);
    setVoiceState(newState);
  };

  const startVoiceRecording = async () => {
    // In-flight start lock: prevent concurrent starts from a fast double-tap.
    // Without this, a second tap can throw on Audio.Recording creation while
    // the first recording is still active, and the catch block would flip
    // allowsRecordingIOS back to false mid-recording — truncating the capture.
    if (recordingStartInFlightRef.current) {
      console.log('[Voice] START: ignored — start already in flight');
      return;
    }
    recordingStartInFlightRef.current = true;
    try {
    if (voiceState !== 'idle') return;
    try {
      console.log('[Voice] START: Requesting permission');
      const permission = await Audio.requestPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Permission needed', 'Allow microphone access to talk to Troy.');
        return;
      }

      // Stop any active playback before recording
      console.log('[Voice] START: Stopping playback');
      if (currentSoundRef.current) {
        try {
          await currentSoundRef.current.stopAsync();
          await currentSoundRef.current.unloadAsync();
        } catch {}
        currentSoundRef.current = null;
      }
      setPlayingMessageId(null);
      setIsPaused(false);

      // Flip session into recording mode. allowsRecordingIOS true is REQUIRED for Audio.Recording to capture input.
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        staysActiveInBackground: true,
        interruptionModeIOS: InterruptionModeIOS.DoNotMix,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false,
      }).catch((e) => { console.log('[Voice] setAudioModeAsync (record) failed:', e?.message); });

      console.log('[Voice] START: Creating recording');
      const recording = new Audio.Recording();
      await recording.prepareToRecordAsync({
        android: Audio.RecordingOptionsPresets.HIGH_QUALITY.android,
        ios: {
          ...Audio.RecordingOptionsPresets.HIGH_QUALITY.ios,
          extension: '.m4a',
          outputFormat: Audio.IOSOutputFormat.MPEG4AAC,
          audioQuality: Audio.IOSAudioQuality.HIGH,
          sampleRate: 44100,
          numberOfChannels: 1,
          bitRate: 128000,
        },
        web: {},
        isMeteringEnabled: true,
      });
      await recording.startAsync();

      currentRecordingRef.current = recording;
      recordingStartTimeRef.current = Date.now();
      silenceStartRef.current = null;
      setIsRecording(true);
      setVoiceStateLog('recording');
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      console.log('[Voice] START: Recording active');

      // Silence detection — auto-stop after 2s of silence (skip first 500ms)
      console.log('[Voice] Silence timer started');
      silenceTimerRef.current = setInterval(async () => {
        if (!currentRecordingRef.current) { clearInterval(silenceTimerRef.current); silenceTimerRef.current = null; return; }
        const elapsed = Date.now() - recordingStartTimeRef.current;
        if (elapsed < 500) return;
        try {
          const status = await currentRecordingRef.current.getStatusAsync();
          if (!status.isRecording) { clearInterval(silenceTimerRef.current); silenceTimerRef.current = null; return; }
          console.log('[Voice] Silence poll - metering:', status.metering, 'elapsed:', elapsed);
          if (status.metering !== undefined && status.metering < -40) {
            if (!silenceStartRef.current) {
              silenceStartRef.current = Date.now();
            } else if (Date.now() - silenceStartRef.current > 2000) {
              console.log('[Voice] AUTO-STOP: Silence detected');
              stopVoiceRecording();
            }
          } else {
            silenceStartRef.current = null;
          }
        } catch (e) { console.log('[Voice] Silence poll error:', e.message); }
      }, 300);

      // 15-second max safety net
      maxRecordTimerRef.current = setTimeout(() => {
        console.log('[Voice] AUTO-STOP: Max duration (15s)');
        stopVoiceRecording();
      }, 15000);

    } catch (error) {
      // Only restore playback mode if there's no active recording. With the
      // start lock above, this is defense-in-depth — covers any future code
      // path that could throw mid-recording without going through stopVoiceRecording.
      if (!currentRecordingRef.current) {
        // Flip session back to pure playback mode. Restores speaker routing.
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: false,
          playsInSilentModeIOS: true,
          staysActiveInBackground: true,
          interruptionModeIOS: InterruptionModeIOS.DoNotMix,
          shouldDuckAndroid: true,
          playThroughEarpieceAndroid: false,
        }).catch((e) => { console.log('[Voice] setAudioModeAsync (playback restore) failed:', e?.message); });
      } else {
        console.log('[Voice] START ERROR but recording is active — leaving session in record mode');
      }
      console.log('[Voice] START ERROR:', error.message, error.stack);
      Alert.alert('Recording Error', error.message || 'Could not start recording');
      setIsRecording(false);
      setVoiceStateLog('idle');
      currentRecordingRef.current = null;
      recordingStartTimeRef.current = null;
    }
    } finally {
      recordingStartInFlightRef.current = false;
    }
  };

  const stopVoiceRecording = async () => {
    console.log('[Voice] STOP: Entered');

    // Clean up all timers first
    if (silenceTimerRef.current) { clearInterval(silenceTimerRef.current); silenceTimerRef.current = null; }
    silenceStartRef.current = null;
    if (maxRecordTimerRef.current) { clearTimeout(maxRecordTimerRef.current); maxRecordTimerRef.current = null; }

    const recording = currentRecordingRef.current;
    currentRecordingRef.current = null;

    if (!recording) {
      console.log('[Voice] STOP: No recording');
      setIsRecording(false);
      setVoiceStateLog('idle');
      return;
    }

    // Check minimum hold duration — discard accidental taps
    const holdDuration = Date.now() - (recordingStartTimeRef.current || 0);
    recordingStartTimeRef.current = null;

    if (holdDuration < 500) {
      console.log('[Voice] STOP: Too short (' + holdDuration + 'ms), discarding');
      try { await recording.stopAndUnloadAsync(); } catch {}
      // Flip session back to pure playback mode. Restores speaker routing.
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        staysActiveInBackground: true,
        interruptionModeIOS: InterruptionModeIOS.DoNotMix,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false,
      }).catch((e) => { console.log('[Voice] setAudioModeAsync (playback restore) failed:', e?.message); });
      setIsRecording(false);
      setVoiceStateLog('idle');
      return;
    }

    // Transition to transcribing
    setIsRecording(false);
    setVoiceStateLog('transcribing');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    try {
      await recording.stopAndUnloadAsync();
      // Flip session back to pure playback mode. Restores speaker routing.
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        staysActiveInBackground: true,
        interruptionModeIOS: InterruptionModeIOS.DoNotMix,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false,
      }).catch((e) => { console.log('[Voice] setAudioModeAsync (playback restore) failed:', e?.message); });
      const uri = recording.getURI();
      console.log('[Voice] STOP: URI:', uri);

      const formData = new FormData();
      formData.append('audio', { uri, type: 'audio/m4a', name: 'recording.m4a' });
      formData.append('userId', supabaseUser?.id || 'anonymous');
      console.log('[Voice] STOP: Sending to transcribe');

      const response = await fetch(`${API_BASE_URL}/v1/troy/transcribe`, {
        method: 'POST',
        body: formData,
      });
      console.log('[Voice] STOP: Transcribe status:', response.status);

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        setVoiceStateLog('idle');
        if (response.status === 429) {
          Alert.alert('Voice Limit', error.message || 'Daily voice limit reached. Upgrade to Gold for more.');
          return;
        }
        throw new Error(error.error || 'Transcription failed');
      }

      const { text } = await response.json();
      console.log('[Voice] STOP: Transcribed:', text);

      setVoiceStateLog('idle');

      if (text && text.trim()) {
        setTroyInputText(text.trim());
        setTimeout(() => {
          setTroyInputText('');
          autoPlayNextResponseRef.current = true;
          sendTroyMessage(text.trim());
        }, 300);
      } else {
        Alert.alert('Could not hear you', 'Try speaking again, closer to the mic.');
      }
    } catch (error) {
      // Flip session back to pure playback mode. Restores speaker routing.
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        staysActiveInBackground: true,
        interruptionModeIOS: InterruptionModeIOS.DoNotMix,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false,
      }).catch((e) => { console.log('[Voice] setAudioModeAsync (playback restore) failed:', e?.message); });
      console.log('[Voice] STOP ERROR:', error.message, error.stack);
      setIsRecording(false);
      setVoiceStateLog('idle');
      currentRecordingRef.current = null;
      Alert.alert('Error', 'Voice transcription failed. Try again.');
    }
  };

  const playTroyVoice = async (text, messageId) => {
    // Stop if already playing this message
    if (playingMessageId === messageId) {
      await stopTroyAudio();
      return;
    }

    // Skip TTS for empty, error, or very short responses
    if (!text || text.length < 20 || text === 'No response') {
      return;
    }

    // Unload any existing sound before starting a new one
    if (currentSoundRef.current) {
      try {
        await currentSoundRef.current.stopAsync();
        await currentSoundRef.current.unloadAsync();
      } catch {}
      currentSoundRef.current = null;
    }

    try {
      const truncatedText = text.substring(0, 2000);
      const userId = supabaseUser?.id || 'anonymous';
      const speakUrl = `${API_BASE_URL}/v1/troy/speak?text=${encodeURIComponent(truncatedText)}&userId=${encodeURIComponent(userId)}`;

      console.log('[Audio] Fetching TTS bytes...');
      setPlayingMessageId(messageId);
      setIsPaused(false);

      // Fetch the audio bytes and write to a local file. AVPlayer (iOS's
      // streaming backend) loads remote URIs but does not reliably render
      // them to any output route — symptom: pill timer ticks, didJustFinish
      // fires, no audio heard. AVAudioPlayer (iOS's local-file backend)
      // does not have this failure mode. v3.0.0 used this pattern; the
      // Audio.Sound migration switched to streaming and broke voice.
      const response = await fetch(speakUrl);
      if (!response.ok) {
        throw new Error(`TTS fetch failed: ${response.status}`);
      }
      const arrayBuffer = await response.arrayBuffer();

      // Convert to base64 for FileSystem.writeAsStringAsync
      let binary = '';
      const bytes = new Uint8Array(arrayBuffer);
      const chunkSize = 0x8000; // process in 32KB chunks to avoid call-stack issues
      for (let i = 0; i < bytes.length; i += chunkSize) {
        binary += String.fromCharCode.apply(
          null,
          bytes.subarray(i, Math.min(i + chunkSize, bytes.length))
        );
      }
      // eslint-disable-next-line no-undef
      const base64 = global.btoa ? global.btoa(binary) : Buffer.from(binary, 'binary').toString('base64');

      const fileUri = `${FileSystem.cacheDirectory}troy-voice-${messageId}.mp3`;
      await FileSystem.writeAsStringAsync(fileUri, base64, {
        encoding: FileSystem.EncodingType.Base64,
      });

      console.log('[Audio] Loading local file:', fileUri);

      const { sound } = await Audio.Sound.createAsync(
        { uri: fileUri },
        { shouldPlay: true, progressUpdateIntervalMillis: 500 }
      );
      currentSoundRef.current = sound;

      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.didJustFinish) {
          sound.unloadAsync().catch(() => {});
          if (currentSoundRef.current === sound) currentSoundRef.current = null;
          setPlayingMessageId(null);
          setIsPaused(false);
          // Clean up the cached file after playback to avoid disk bloat
          FileSystem.deleteAsync(fileUri, { idempotent: true }).catch(() => {});
        }
      });
      console.log('[Audio] Playing local file via Audio.Sound');

    } catch (error) {
      const msg = error?.message || String(error);
      console.log('[Audio] TTS error for message', messageId, ':', msg);
      setPlayingMessageId(null);
      setIsPaused(false);
      currentSoundRef.current = null;
      const isNetwork = /network|fetch|connection|timeout|unreachable|load/i.test(msg);
      if (isNetwork) {
        Alert.alert('Voice Unavailable', 'Could not reach the voice service. Check your connection and try again.');
      }
    }
  };

  const stopTroyGeneration = () => {
    if (troyAbortRef.current) {
      troyAbortRef.current.abort();
      troyAbortRef.current = null;
    }
    setTroyLoading(false);
    console.log('[Troy] Generation stopped by user');
  };

  const sendTroyMessage = async (messageText) => {
    if (__DEV__) console.log('💬 [Troy] sendTroyMessage called, messageText:', messageText ? messageText.substring(0, 50) : '(from input)', 'troyLoading:', troyLoading, 'activeConversationId:', activeConversationId);
    const text = (messageText || troyInputText).trim();
    if (!text || troyLoading) {
      if (__DEV__) console.log('💬 [Troy] Early exit: text empty?', !text, 'troyLoading?', troyLoading);
      return;
    }

    // Daily limit check — Free gets 3/day, Gold/Lifetime unlimited
    // Check both RevenueCat state (hasGoldAccess) and Supabase tier (userTier) as backup
    const isPaidUser = hasGoldAccess || userTier === 'gold' || userTier === 'lifetime' || hasLifetimeAccess;
    console.log('[Troy] Tier check:', { hasGold, hasLifetimeAccess, hasGoldAccess, userTier, isPaidUser, questions: advisorQuestionsToday });
    if (!isPaidUser && advisorQuestionsToday >= TROY_FREE_LIMIT) {
      setShowPaywallModal(true);
      return;
    }

    if (!messageText) setTroyInputText('');

    let convId = activeConversationId;

    // If no active conversation, create one first
    if (!convId) {
      if (__DEV__) console.log('💬 [Troy] No active conversation, creating one...');
      try {
        const newConv = await troyAPI.createConversation();
        if (__DEV__) console.log('💬 [Troy] Created conversation:', newConv?.id, 'error:', newConv?.error);
        convId = newConv.id;
        setActiveConversationId(convId);
        setTroyConversations(prev => [newConv, ...prev]);
      } catch (e) {
        console.error('💬 [Troy] Failed to create conversation:', e);
        return;
      }
    }

    if (__DEV__) console.log('💬 [Troy] Sending to convId:', convId, 'API:', `${API_BASE_URL}/v1/troy/conversations/${convId}/messages`);

    // Optimistically add user message to the UI
    const tempUserMsg = { id: 'temp-' + Date.now(), role: 'user', content: text, created_at: new Date().toISOString() };
    // Animate the new message in
    const userAnim = new Animated.Value(0);
    messageAnimsRef.current.set(tempUserMsg.id, userAnim);
    setTroyMessages(prev => [...prev, tempUserMsg]);
    Animated.spring(userAnim, { toValue: 1, damping: 15, stiffness: 200, useNativeDriver: true }).start();

    // Show typing indicator
    setTroyLoading(true);

    // Update daily count (Gold/Lifetime: soft cap at 200 for logging only)
    const newCount = advisorQuestionsToday + 1;
    setAdvisorQuestionsToday(newCount);
    if (hasGoldAccess && newCount >= 200) {
      console.log(`⚠️ [Troy] Gold user hit soft cap: ${newCount} messages today`);
    }
    AsyncStorage.setItem('stack_advisor_count', JSON.stringify({ date: new Date().toDateString(), count: newCount }));

    try {
      troyAbortRef.current = new AbortController();
      const response = await troyAPI.sendMessage(convId, text, troyAbortRef.current.signal);
      troyAbortRef.current = null;
      if (__DEV__) console.log('🧠 [Troy] Response keys:', Object.keys(response), 'preview:', response.preview, 'message?.id:', response.message?.id, 'error:', response.error);

      // Handle API error responses (e.g. profanity filter, server error)
      if (response.error && !response.message?.content) {
        console.log('[Troy] API returned error:', response.error);
        setTroyMessages(prev => prev.filter(m => m.id !== tempUserMsg.id));
        Alert.alert('Troy', response.error || "Couldn't respond. Try again.");
        setTroyLoading(false);
        troyAbortRef.current = null;
        return;
      }

      // Replace temp message with real one and add Troy's response
      const responseContent = response.message?.content || response.response || '';
      if (!responseContent.trim()) {
        console.log('[Troy] Empty response');
        setTroyMessages(prev => prev.filter(m => m.id !== tempUserMsg.id));
        Alert.alert('Troy', "Couldn't respond. Try again.");
        setTroyLoading(false);
        troyAbortRef.current = null;
        return;
      }

      const assistantMsg = {
        ...(response.message || { id: 'fallback-' + Date.now(), role: 'assistant', content: responseContent, created_at: new Date().toISOString() }),
        preview: response.preview || null,
      };
      const realUserId = 'user-' + Date.now();
      // Animate assistant message in
      const assistAnim = new Animated.Value(0);
      messageAnimsRef.current.set(assistantMsg.id, assistAnim);
      // Transfer user message animation from temp to real id
      messageAnimsRef.current.set(realUserId, messageAnimsRef.current.get(tempUserMsg.id));
      messageAnimsRef.current.delete(tempUserMsg.id);

      setTroyMessages(prev => {
        const withoutTemp = prev.filter(m => m.id !== tempUserMsg.id);
        return [...withoutTemp,
          { id: realUserId, role: 'user', content: text, created_at: tempUserMsg.created_at },
          assistantMsg
        ];
      });
      Animated.spring(assistAnim, { toValue: 1, damping: 15, stiffness: 200, useNativeDriver: true }).start();

      // Update conversation title if it changed (first message auto-titles)
      if (response.title) {
        setTroyConversations(prev => prev.map(c =>
          c.id === convId ? { ...c, title: response.title, updated_at: new Date().toISOString() } : c
        ));
      }

      // Auto-play Troy's voice response after voice input — immediate, no delay
      if (autoPlayNextResponseRef.current && assistantMsg.content && assistantMsg.id) {
        autoPlayNextResponseRef.current = false;
        playTroyVoice(assistantMsg.content, assistantMsg.id);
      }
    } catch (e) {
      troyAbortRef.current = null;
      autoPlayNextResponseRef.current = false;
      if (e.name === 'AbortError') {
        console.log('[Troy] Generation stopped by user');
        return;
      }
      console.error('Failed to send message:', e);
      setTroyMessages(prev => prev.filter(m => m.id !== tempUserMsg.id));
      Alert.alert('Error', 'Failed to send message. Please try again.');
    }

    setTroyLoading(false);
  };

  // closeTroyChat removed — Troy is always available as home screen

  // Server-side scan tracking functions
  const fetchScanStatus = async () => {
    if (!revenueCatUserId) {
      if (__DEV__) console.log('⚠️ No RevenueCat user ID yet, skipping scan status fetch');
      return;
    }

    // Skip for premium users - they have unlimited scans
    if (hasGold || hasLifetimeAccess) {
      setScanUsage(prev => ({ ...prev, loading: false }));
      return;
    }

    try {
      if (__DEV__) console.log(`📊 Fetching scan status for user: ${revenueCatUserId.substring(0, 8)}...`);
      const response = await fetch(`${API_BASE_URL}/v1/scan-status?rcUserId=${encodeURIComponent(revenueCatUserId)}`);
      const data = await response.json();

      if (data.success) {
        setScanUsage({
          scansUsed: data.scansUsed,
          scansLimit: data.scansLimit,
          resetsAt: data.resetsAt,
          loading: false
        });
        if (__DEV__) console.log(`📊 Scan status: ${data.scansUsed}/${data.scansLimit}, resets at ${data.resetsAt}`);
      } else {
        if (__DEV__) console.log('⚠️ Failed to fetch scan status:', data.error);
        setScanUsage(prev => ({ ...prev, loading: false }));
      }
    } catch (error) {
      if (__DEV__) console.log('❌ Error fetching scan status:', error.message);
      // Fail open - allow scanning if server is unreachable
      setScanUsage(prev => ({ ...prev, loading: false }));
    }
  };

  const incrementScanCount = async () => {
    if (!revenueCatUserId) {
      if (__DEV__) console.log('⚠️ No RevenueCat user ID, cannot increment scan count');
      return;
    }

    try {
      if (__DEV__) console.log(`📊 Incrementing scan count for user: ${revenueCatUserId.substring(0, 8)}...`);
      const response = await fetch(`${API_BASE_URL}/v1/increment-scan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rcUserId: revenueCatUserId })
      });
      const data = await response.json();

      if (data.success) {
        setScanUsage({
          scansUsed: data.scansUsed,
          scansLimit: data.scansLimit,
          resetsAt: data.resetsAt,
          loading: false
        });
        if (__DEV__) console.log(`📊 New scan count: ${data.scansUsed}/${data.scansLimit}`);
      }
    } catch (error) {
      if (__DEV__) console.log('❌ Error incrementing scan count:', error.message);
      // Still update local state optimistically
      setScanUsage(prev => ({ ...prev, scansUsed: prev.scansUsed + 1 }));
    }
  };

  const canScan = () => {
    if (hasGoldAccess) return true; // Gold tier or lifetime access has unlimited scans
    return scanUsage.scansUsed < scanUsage.scansLimit;
  };

  const checkScanLimit = () => {
    if (hasGoldAccess) return true; // Gold tier or lifetime access bypass

    if (scanUsage.scansUsed >= scanUsage.scansLimit) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);

      // Format reset date
      let resetDateStr = '';
      if (scanUsage.resetsAt) {
        resetDateStr = new Date(scanUsage.resetsAt).toLocaleDateString();
      }

      Alert.alert(
        'Scan Limit Reached',
        `You've used all ${scanUsage.scansLimit} scans this month.${resetDateStr ? ` Resets on ${resetDateStr}.` : ''}\n\nUpgrade to Gold for unlimited scans!`,
        [
          { text: 'Maybe Later', style: 'cancel' },
          { text: 'Upgrade', onPress: () => setShowPaywallModal(true) }
        ]
      );
      return false;
    }
    return true;
  };

  // ============================================
  // PRICE ALERTS (Free Feature)
  // Alerts synced to Supabase price_alerts table via REST API. Backend checker sends push notifications.
  // Backend priceAlertChecker runs every 5 min, sends push via Expo when triggered.
  // TODO v2.1: Implement ATH alerts with backend tracking
  // ============================================

  // Load price alerts from AsyncStorage
  // Get device_id for alert identification (works for anonymous + authenticated users)
  const getDeviceId = async () => {
    let deviceId = await AsyncStorage.getItem('device_id');
    if (!deviceId) {
      deviceId = Constants.deviceId || `anon-${Date.now()}`;
      await AsyncStorage.setItem('device_id', deviceId);
    }
    return deviceId;
  };

  // Load price alerts from local storage
  const fetchPriceAlerts = async () => {
    try {
      const val = await AsyncStorage.getItem('stack_price_alerts');
      if (val) {
        const parsed = JSON.parse(val);
        setPriceAlerts(parsed);
        if (__DEV__) console.log(`🔔 Loaded ${parsed.length} price alerts from local storage`);
      }
    } catch (error) {
      if (__DEV__) console.error('❌ Error loading price alerts:', error);
    }
  };

  // Save price alerts to AsyncStorage
  const savePriceAlerts = async (alerts) => {
    try {
      await AsyncStorage.setItem('stack_price_alerts', JSON.stringify(alerts));
    } catch (error) {
      if (__DEV__) console.error('❌ Error saving price alerts:', error);
    }
  };

  // Fetch alerts from backend — backend is source of truth, discard orphaned local alerts
  const syncAlertsFromBackend = async () => {
    try {
      const deviceId = await getDeviceId();
      const userId = supabaseUser?.id || null;
      const params = userId ? `user_id=${userId}&device_id=${deviceId}` : `device_id=${deviceId}`;
      const response = await fetch(`${API_BASE_URL}/v1/push/price-alerts?${params}`);
      const result = await response.json();

      if (result.success && result.alerts) {
        const backendAlerts = result.alerts
          .filter(a => !a.triggered && a.enabled !== false)
          .map(a => ({
            id: a.id,
            metal: a.metal,
            direction: a.direction,
            targetPrice: parseFloat(a.target_price),
            enabled: a.enabled,
            createdAt: a.created_at,
          }));

        // Try to push any local-only alerts to backend, keep only those that succeed
        const localAlerts = await AsyncStorage.getItem('stack_price_alerts');
        const localParsed = localAlerts ? JSON.parse(localAlerts) : [];
        const backendIds = new Set(backendAlerts.map(a => a.id));
        const localOnly = localParsed.filter(a => !backendIds.has(a.id));
        const syncedLocal = [];

        for (const alert of localOnly) {
          try {
            const res = await fetch(`${API_BASE_URL}/v1/push/price-alerts`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                id: alert.id,
                userId: userId,
                device_id: deviceId,
                metal: alert.metal,
                targetPrice: alert.targetPrice,
                direction: alert.direction,
                enabled: alert.enabled !== false,
              }),
            });
            const r = await res.json();
            if (r.success) syncedLocal.push(alert);
          } catch (e) { /* discard orphan */ }
        }

        // Only keep backend alerts + successfully synced local alerts
        const final = [...backendAlerts, ...syncedLocal];
        setPriceAlerts(final);
        await savePriceAlerts(final);
        if (__DEV__) console.log(`🔔 [Push] Synced: ${backendAlerts.length} from backend, ${syncedLocal.length} local pushed, ${localOnly.length - syncedLocal.length} orphans discarded`);
      }
    } catch (error) {
      if (__DEV__) console.error('❌ [Push] Failed to sync alerts from backend:', error);
    }
  };

  // Create a new custom price alert (saves to backend + local)
  const createPriceAlert = async () => {
    const targetPrice = parseFloat(newAlert.targetPrice);
    if (isNaN(targetPrice) || targetPrice <= 0) {
      Alert.alert('Invalid Price', 'Please enter a valid target price.');
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const alertId = generateUUID();
    const deviceId = await getDeviceId();

    // Save to backend first
    try {
      const response = await fetch(`${API_BASE_URL}/v1/push/price-alerts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: alertId,
          userId: supabaseUser?.id || null,
          device_id: deviceId,
          metal: newAlert.metal,
          targetPrice: targetPrice,
          direction: newAlert.direction,
          enabled: true,
        }),
      });
      const result = await response.json();
      if (__DEV__) console.log('🔔 [Push] Backend create response:', JSON.stringify(result));
    } catch (error) {
      if (__DEV__) console.error('❌ [Push] Failed to create alert on backend:', error);
    }

    // Also save locally
    const alert = {
      id: alertId,
      metal: newAlert.metal,
      direction: newAlert.direction,
      targetPrice: targetPrice,
      enabled: true,
      createdAt: new Date().toISOString(),
    };

    const updated = [alert, ...priceAlerts];
    setPriceAlerts(updated);
    await savePriceAlerts(updated);

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setNewAlert({ metal: 'silver', targetPrice: '', direction: 'above' });

    Alert.alert(
      'Alert Created',
      `You'll be notified when ${newAlert.metal} goes ${newAlert.direction} $${targetPrice.toFixed(2)}/oz.`
    );
  };

  // Toggle a price alert enabled/disabled (local + backend PATCH)
  const togglePriceAlert = async (alertId, enabled) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const updated = priceAlerts.map(a => a.id === alertId ? { ...a, enabled } : a);
    setPriceAlerts(updated);
    await savePriceAlerts(updated);
    try {
      await fetch(`${API_BASE_URL}/v1/push/price-alerts/${alertId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled }),
      });
    } catch (e) { /* silent */ }
  };

  // Delete a price alert (local + backend)
  const deletePriceAlert = async (alertId) => {
    Alert.alert(
      'Delete Alert',
      'Are you sure you want to delete this price alert?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            if (__DEV__) console.log('🗑️ [Push] Deleting price alert:', alertId);
            const updated = priceAlerts.filter(a => a.id !== alertId);
            setPriceAlerts(updated);
            await savePriceAlerts(updated);

            // Delete from backend
            try {
              const response = await fetch(`${API_BASE_URL}/v1/push/price-alerts/${alertId}`, {
                method: 'DELETE',
              });
              const result = await response.json();
              if (__DEV__) console.log('🗑️ [Push] Backend delete response:', JSON.stringify(result));
            } catch (error) {
              if (__DEV__) console.error('❌ [Push] Failed to delete alert from backend:', error);
            }

            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          },
        },
      ]
    );
  };

  // Direct delete (no confirmation — used by swipe gesture)
  const deletePriceAlertDirect = async (alertId) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const updated = priceAlerts.filter(a => a.id !== alertId);
    setPriceAlerts(updated);
    await savePriceAlerts(updated);
    try {
      await fetch(`${API_BASE_URL}/v1/push/price-alerts/${alertId}`, { method: 'DELETE' });
    } catch (e) { /* silent */ }
  };

  // Clear all price alerts (local + backend batch delete)
  const clearAllAlerts = () => {
    if (priceAlerts.length === 0) return;
    Alert.alert('Delete All Alerts', `Delete all ${priceAlerts.length} price alert${priceAlerts.length > 1 ? 's' : ''}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete All', style: 'destructive', onPress: async () => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          setPriceAlerts([]);
          await savePriceAlerts([]);
          try {
            const deviceId = await getDeviceId();
            const params = new URLSearchParams();
            if (supabaseUser?.id) params.append('user_id', supabaseUser.id);
            if (deviceId) params.append('device_id', deviceId);
            await fetch(`${API_BASE_URL}/v1/push/price-alerts?${params.toString()}`, { method: 'DELETE' });
          } catch (e) { /* silent */ }
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        },
      },
    ]);
  };

  // ============================================
  // HOME SCREEN WIDGET (Gold/Lifetime Feature)
  // ============================================

  /**
   * Sync portfolio data to iOS home screen widget
   * Called when prices update or portfolio changes
   */
  const syncWidget = async () => {
    // Debug logging for subscription state
    if (__DEV__) console.log('📱 [syncWidget] Called with state:', {
      hasGold,
      hasLifetimeAccess,
      combinedSubscription: hasGold || hasLifetimeAccess,
      platform: Platform.OS,
      widgetKitAvailable: isWidgetKitAvailable(),
    });

    // Only sync for Gold/Lifetime subscribers
    if (!hasGold && !hasLifetimeAccess) {
      if (__DEV__) console.log('📱 [syncWidget] Skipping - no subscription');
      return;
    }

    // Only sync on iOS with WidgetKit available
    if (Platform.OS !== 'ios' || !isWidgetKitAvailable()) {
      if (__DEV__) console.log('📱 [syncWidget] Skipping - not iOS or WidgetKit unavailable');
      return;
    }

    try {
      // Calculate daily change (only for holdings owned before today)
      let dailyChangeAmt = 0;
      let dailyChangePct = 0;

      if (midnightSnapshot && spotPricesLive) {
        // Use pre-calculated values from main calculations (excludes today's purchases)
        const widgetMidnightBaseline = midnightBaseline;
        if (widgetMidnightBaseline && widgetMidnightBaseline > 0) {
          dailyChangeAmt = preTodayCurrentValue - widgetMidnightBaseline;
          dailyChangePct = (dailyChangeAmt / widgetMidnightBaseline) * 100;
        }
      }

      const widgetPayload = {
        portfolioValue: totalMeltValue,
        dailyChangeAmount: dailyChangeAmt,
        dailyChangePercent: dailyChangePct,
        goldSpot: goldSpot,
        silverSpot: silverSpot,
        goldChangeAmount: spotChange?.gold?.amount || 0,
        goldChangePercent: spotChange?.gold?.percent || 0,
        silverChangeAmount: spotChange?.silver?.amount || 0,
        silverChangePercent: spotChange?.silver?.percent || 0,
        goldValue: totalGoldOzt * goldSpot,
        silverValue: totalSilverOzt * silverSpot,
        platinumValue: totalPlatinumOzt * platinumSpot,
        palladiumValue: totalPalladiumOzt * palladiumSpot,
        goldOzt: totalGoldOzt,
        silverOzt: totalSilverOzt,
        platinumOzt: totalPlatinumOzt,
        palladiumOzt: totalPalladiumOzt,
        platinumSpot: platinumSpot,
        palladiumSpot: palladiumSpot,
        platinumChangeAmount: spotChange?.platinum?.amount || 0,
        platinumChangePercent: spotChange?.platinum?.percent || 0,
        palladiumChangeAmount: spotChange?.palladium?.amount || 0,
        palladiumChangePercent: spotChange?.palladium?.percent || 0,
        hasSubscription: hasGold || hasLifetimeAccess,
        hideValues: hideWidgetValues,
        goldSparkline: sparklineData?.gold || [],
        silverSparkline: sparklineData?.silver || [],
        platinumSparkline: sparklineData?.platinum || [],
        palladiumSparkline: sparklineData?.palladium || [],
        marketsClosed: marketsClosed,
      };

      if (__DEV__) console.log('📱 [syncWidget] Sending payload:', widgetPayload);

      await syncWidgetData(widgetPayload);

      if (__DEV__) console.log('✅ [syncWidget] Widget data synced successfully');
    } catch (error) {
      if (__DEV__) console.error('❌ [syncWidget] Failed:', error.message);
    }
  };

  // Sync widget when prices or portfolio changes
  useEffect(() => {
    if (dataLoaded && spotPricesLive && (hasGold || hasLifetimeAccess)) {
      syncWidget();
    }
  }, [totalMeltValue, totalGoldOzt, totalSilverOzt, totalPlatinumOzt, totalPalladiumOzt, silverSpot, goldSpot, platinumSpot, palladiumSpot, spotChange, dataLoaded, spotPricesLive, hasGold, hasLifetimeAccess, hideWidgetValues, sparklineData]);

  // Sync widget when app comes to foreground
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'active' && (hasGold || hasLifetimeAccess)) {
        syncWidget();
      }
    });

    return () => subscription.remove();
  }, [hasGold, hasLifetimeAccess]);

  // ============================================
  // ANALYTICS (Gold/Lifetime Feature)
  // ============================================

  /**
   * Save daily portfolio snapshot for analytics
   * Only saves once per day (checks lastSnapshotDate in AsyncStorage)
   */
  const saveDailySnapshot = async () => {
    // Only for Gold/Lifetime subscribers
    if (!hasGold && !hasLifetimeAccess) return;
    if (!supabaseUser?.id) return;
    if (!spotPricesLive) return; // Need live prices for accurate snapshot

    try {
      const today = new Date().toISOString().split('T')[0];
      const lastSnapshot = await AsyncStorage.getItem('lastSnapshotDate');

      // Only save one snapshot per day
      if (lastSnapshot === today) {
        if (__DEV__) console.log('📊 Snapshot already saved today');
        return;
      }

      // Calculate portfolio values
      const goldValue = totalGoldOzt * goldSpot;
      const silverValue = totalSilverOzt * silverSpot;
      const platinumValue = totalPlatinumOzt * platinumSpot;
      const palladiumValue = totalPalladiumOzt * palladiumSpot;
      const totalValue = goldValue + silverValue + platinumValue + palladiumValue;

      const response = await fetch(`${API_BASE_URL}/v1/snapshots`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: supabaseUser.id,
          totalValue,
          goldValue,
          silverValue,
          platinumValue,
          palladiumValue,
          goldOz: totalGoldOzt,
          silverOz: totalSilverOzt,
          platinumOz: totalPlatinumOzt,
          palladiumOz: totalPalladiumOzt,
          goldSpot,
          silverSpot,
          platinumSpot,
          palladiumSpot,
        }),
      });

      const data = await response.json();

      if (data.success) {
        await AsyncStorage.setItem('lastSnapshotDate', today);
        if (__DEV__) console.log('📊 Daily snapshot saved:', data.snapshot?.date);
      }
    } catch (error) {
      if (__DEV__) console.error('❌ Error saving daily snapshot:', error.message);
    }
  };

  /**
   * Calculate historical portfolio values from holdings + historical spot prices
   * This generates chart data client-side without needing to persist every historical snapshot
   */
  const calculateHistoricalPortfolioData = async (range = '1M') => {
    const allItems = [...silverItems, ...goldItems, ...platinumItems, ...palladiumItems];
    if (allItems.length === 0) return [];

    // Determine date range
    const now = new Date();
    let startDate = new Date();
    switch (range.toUpperCase()) {
      case '1W': startDate.setDate(now.getDate() - 7); break;
      case '1M': startDate.setMonth(now.getMonth() - 1); break;
      case '3M': startDate.setMonth(now.getMonth() - 3); break;
      case '6M': startDate.setMonth(now.getMonth() - 6); break;
      case '1Y': startDate.setFullYear(now.getFullYear() - 1); break;
      case 'ALL':
        // Find oldest purchase date
        const oldestPurchase = allItems.reduce((oldest, item) => {
          if (item.datePurchased && item.datePurchased < oldest) return item.datePurchased;
          return oldest;
        }, now.toISOString().split('T')[0]);
        startDate = new Date(oldestPurchase);
        break;
    }

    // Generate dates with tiered density to ensure enough points for each time range:
    // - Last 7 days: every day (for 1W filter)
    // - Days 8-30: every 3 days (for 1M filter)
    // - Days 31-90: every 7 days (for 3M filter)
    // - Days 91-365: every 14 days (for 6M/1Y filter)
    // - Older than 1 year: every 30 days (for ALL filter)
    const dates = new Set(); // Use Set to avoid duplicates
    const totalDays = Math.ceil((now - startDate) / (1000 * 60 * 60 * 24));

    // Helper to add date if within range
    const addDate = (daysAgo) => {
      if (daysAgo <= totalDays) {
        const d = new Date(now);
        d.setDate(d.getDate() - daysAgo);
        dates.add(d.toISOString().split('T')[0]);
      }
    };

    // Last 7 days: every day (7 points)
    for (let i = 0; i <= 7; i++) {
      addDate(i);
    }

    // Days 8-30: every 3 days (~8 points)
    for (let i = 9; i <= 30; i += 3) {
      addDate(i);
    }

    // Days 31-90: every 7 days (~9 points)
    for (let i = 35; i <= 90; i += 7) {
      addDate(i);
    }

    // Days 91-365: every 14 days (~20 points)
    for (let i = 98; i <= 365; i += 14) {
      addDate(i);
    }

    // Older than 1 year: every 30 days
    for (let i = 395; i <= totalDays; i += 30) {
      addDate(i);
    }

    // Also add the start date if we have one
    if (totalDays > 0) {
      dates.add(startDate.toISOString().split('T')[0]);
    }

    // Convert to sorted array (today is already included via addDate(0))
    const sortedDates = Array.from(dates).sort();
    const today = now.toISOString().split('T')[0];
    if (__DEV__) console.log(`📊 Generated ${sortedDates.length} date points for historical calculation`);
    if (__DEV__) console.log(`   First: ${sortedDates[0]}, Last: ${sortedDates[sortedDates.length - 1]}`);

    // Pre-cache today's prices from live spot data (avoids an API call)
    if (goldSpot > 0 && silverSpot > 0 && !historicalPriceCache.current[today]) {
      historicalPriceCache.current[today] = {
        gold: goldSpot,
        silver: silverSpot,
        platinum: platinumSpot,
        palladium: palladiumSpot,
      };
      if (__DEV__) console.log(`   📦 Pre-cached today's prices from live spot: Gold $${goldSpot}, Silver $${silverSpot}`);
    }

    // Check how many dates we need to fetch (not in cache)
    const uncachedDates = sortedDates.filter(d => !historicalPriceCache.current[d]);
    const cachedCount = sortedDates.length - uncachedDates.length;

    if (__DEV__) console.log(`📊 Calculating ${sortedDates.length} data points for range ${range}`);
    if (__DEV__) console.log(`   📦 ${cachedCount} cached, ${uncachedDates.length} need fetching`);

    // Fetch historical prices from v1/prices/history per metal (batch endpoint doesn't exist on v1)
    if (uncachedDates.length > 0) {
      try {
        if (__DEV__) console.log(`   🚀 Fetching price history for portfolio calculation...`);
        const metals = ['gold', 'silver', 'platinum', 'palladium'];
        const histResults = await Promise.all(
          metals.map(async (metal) => {
            try {
              const yearsBack = (now - startDate) / (365.25 * 24 * 60 * 60 * 1000);
              const apiRange = yearsBack <= 0.25 ? '3M' : yearsBack <= 0.5 ? '6M' : yearsBack <= 1 ? '1Y' : yearsBack <= 5 ? '5Y' : 'ALL';
              const res = await fetch(`${API_BASE_URL}/v1/prices/history?range=${apiRange}&metal=${metal}&maxPoints=1000`);
              if (!res.ok) return [];
              const data = await res.json();
              return (data.prices || []).map(p => ({
                date: p.date.split('T')[0],
                price: p.price,
              }));
            } catch { return []; }
          })
        );

        // Build date→prices map, keeping the last price for each date per metal
        const dateMap = {};
        metals.forEach((metal, idx) => {
          for (const pt of histResults[idx]) {
            if (!pt.price || pt.price <= 0) continue;
            if (!dateMap[pt.date]) dateMap[pt.date] = {};
            dateMap[pt.date][metal] = pt.price;
          }
        });

        // Populate cache with entries that have at least gold and silver
        let fetchedCount = 0;
        for (const [date, prices] of Object.entries(dateMap)) {
          if (prices.gold && prices.silver && !historicalPriceCache.current[date]) {
            historicalPriceCache.current[date] = prices;
            fetchedCount++;
          }
        }

        // For dates not in the history data, interpolate from nearest available
        if (fetchedCount > 0) {
          const availDates = Object.keys(dateMap).filter(d => dateMap[d].gold && dateMap[d].silver).sort();
          for (const targetDate of uncachedDates) {
            if (historicalPriceCache.current[targetDate]) continue;
            // Find nearest available date
            let nearest = null;
            let minDist = Infinity;
            for (const d of availDates) {
              const dist = Math.abs(new Date(targetDate) - new Date(d));
              if (dist < minDist) { minDist = dist; nearest = d; }
            }
            if (nearest && minDist < 35 * 24 * 60 * 60 * 1000) { // within 35 days
              historicalPriceCache.current[targetDate] = dateMap[nearest];
              fetchedCount++;
            }
          }
        }

        if (__DEV__) console.log(`   ✅ History fetch complete: ${fetchedCount} date/prices cached`);
      } catch (error) {
        if (__DEV__) console.log('⚠️ Historical price fetch error:', error.message);
      }
    }

    const finalCachedCount = Object.keys(historicalPriceCache.current).length;
    if (__DEV__) console.log(`📊 Fetch phase complete: ${finalCachedCount} total prices cached`);

    // Now calculate portfolio values using cached prices
    const historicalData = [];

    for (const date of sortedDates) {
      const cached = historicalPriceCache.current[date];
      if (!cached) continue; // Skip dates we couldn't fetch

      // Get items owned on this date (purchased on or before this date)
      // Items WITHOUT a purchase date are included at all dates (assumed always owned)
      const ownedItems = allItems.filter(item => !item.datePurchased || item.datePurchased <= date);
      if (ownedItems.length === 0) continue;

      // Calculate oz owned
      const silverOz = ownedItems
        .filter(i => silverItems.includes(i))
        .reduce((sum, i) => sum + (i.ozt * i.quantity), 0);
      const goldOz = ownedItems
        .filter(i => goldItems.includes(i))
        .reduce((sum, i) => sum + (i.ozt * i.quantity), 0);
      const platinumOz = ownedItems
        .filter(i => platinumItems.includes(i))
        .reduce((sum, i) => sum + (i.ozt * i.quantity), 0);
      const palladiumOz = ownedItems
        .filter(i => palladiumItems.includes(i))
        .reduce((sum, i) => sum + (i.ozt * i.quantity), 0);

      const silverSpotHist = cached.silver || silverSpot;
      const goldSpotHist = cached.gold || goldSpot;
      const platinumSpotHist = cached.platinum || platinumSpot;
      const palladiumSpotHist = cached.palladium || palladiumSpot;
      const totalValue = (silverOz * silverSpotHist) + (goldOz * goldSpotHist) + (platinumOz * platinumSpotHist) + (palladiumOz * palladiumSpotHist);

      historicalData.push({
        date,
        total_value: totalValue,
        gold_value: goldOz * goldSpotHist,
        silver_value: silverOz * silverSpotHist,
        platinum_value: platinumOz * platinumSpotHist,
        palladium_value: palladiumOz * palladiumSpotHist,
        gold_oz: goldOz,
        silver_oz: silverOz,
        platinum_oz: platinumOz,
        palladium_oz: palladiumOz,
        gold_spot: goldSpotHist,
        silver_spot: silverSpotHist,
        platinum_spot: platinumSpotHist,
        palladium_spot: palladiumSpotHist,
      });
    }

    if (__DEV__) console.log(`📊 Historical calculation complete: ${historicalData.length} data points`);

    return historicalData;
  };

  /**
   * Filter snapshots array by time range (client-side filtering)
   */
  // Get today's date string in Eastern Time (Hermes-safe, no toLocaleString)
  const getEasternDateString = () => {
    const now = new Date();
    const jan = new Date(now.getFullYear(), 0, 1);
    const jul = new Date(now.getFullYear(), 6, 1);
    const stdOffset = Math.max(jan.getTimezoneOffset(), jul.getTimezoneOffset());
    const isDST = now.getTimezoneOffset() < stdOffset;
    const etOffsetHours = isDST ? -4 : -5;
    const etMs = now.getTime() + (etOffsetHours * 60 + now.getTimezoneOffset()) * 60000;
    const etDate = new Date(etMs);
    return etDate.getFullYear() + '-' + String(etDate.getMonth() + 1).padStart(2, '0') + '-' + String(etDate.getDate()).padStart(2, '0');
  };

  const filterSnapshotsByRange = (snapshots, range) => {
    if (!snapshots || snapshots.length === 0) return [];
    if (range === 'ALL') return snapshots;

    const todayStr = getEasternDateString();
    const cutoff = new Date(todayStr + 'T00:00:00');

    switch (range) {
      case '1M': cutoff.setMonth(cutoff.getMonth() - 1); break;
      case '3M': cutoff.setMonth(cutoff.getMonth() - 3); break;
      case '6M': cutoff.setMonth(cutoff.getMonth() - 6); break;
      case '1Y': cutoff.setFullYear(cutoff.getFullYear() - 1); break;
      case '5Y': cutoff.setFullYear(cutoff.getFullYear() - 5); break;
      default: return snapshots;
    }

    const cutoffStr = cutoff.toISOString().split('T')[0];
    const filtered = snapshots.filter(s => s.date >= cutoffStr && s.date <= todayStr);

    // If no data in range, return all data (don't show empty chart)
    return filtered.length > 0 ? filtered : snapshots;
  };

  /**
   * Apply the selected range filter to cached snapshots and update state
   */
  const applyRangeFilter = (range) => {
    const cache = snapshotsCacheRef.current;
    if (cache.primaryData && cache.primaryData.length > 0) {
      const filtered = filterSnapshotsByRange(cache.primaryData, range);
      // If filter returned empty but we have data, use all cached data as fallback
      if (filtered.length === 0 && range !== '1D') {
        if (__DEV__) console.log(`📊 Range ${range}: 0 points after filter, using all ${cache.primaryData.length} points`);
        setAnalyticsSnapshots(cache.primaryData);
      } else {
        setAnalyticsSnapshots(filtered);
      }
      if (__DEV__) console.log(`📊 Range ${range}: ${filtered.length} points`);
    }
  };

  /**
   * Fetch spot price history for a single metal chart.
   * Uses cache to avoid re-fetching when switching between ranges.
   */
  const fetchSpotPriceHistoryForMetal = async (metal, range) => {
    const cacheKey = `${metal}-${range}`;
    const cached = spotHistoryCacheRef.current[cacheKey];
    const cacheMaxAge = ['1M', '3M'].includes(range) ? 15 * 60 * 1000 : 60 * 60 * 1000;

    if (cached && (Date.now() - cached.fetchedAt) < cacheMaxAge) {
      setSpotHistoryMetal(prev => ({ ...prev, [metal]: { ...prev[metal], data: cached.data, loading: false, error: null } }));
      return;
    }

    setSpotHistoryMetal(prev => ({ ...prev, [metal]: { ...prev[metal], loading: true, error: null } }));

    try {
      const response = await fetch(
        `${API_BASE_URL}/v1/prices/history?range=${range}&metal=${metal}&maxPoints=500`
      );
      const result = await response.json();

      if (result.prices && result.prices.length > 0) {
        const minDate = (range === 'ALL' && (metal === 'platinum' || metal === 'palladium')) ? '2010-01-01' : null;
        const metalData = result.prices.map(pt => ({ date: pt.date, value: pt.price || 0 })).filter(pt => pt.value > 0 && (!minDate || pt.date >= minDate));
        if (metalData.length > 1) {
          spotHistoryCacheRef.current[cacheKey] = { data: metalData, fetchedAt: Date.now() };
          setSpotHistoryMetal(prev => ({ ...prev, [metal]: { ...prev[metal], data: metalData, loading: false, error: null } }));
        } else {
          setSpotHistoryMetal(prev => ({ ...prev, [metal]: { ...prev[metal], data: null, loading: false, error: 'no_data' } }));
        }
      } else {
        setSpotHistoryMetal(prev => ({ ...prev, [metal]: { ...prev[metal], data: null, loading: false, error: 'Historical data not available' } }));
      }
    } catch (error) {
      if (__DEV__) console.log(`Spot price history fetch error (${metal}):`, error.message);
      setSpotHistoryMetal(prev => ({ ...prev, [metal]: { ...prev[metal], data: null, loading: false, error: 'Failed to load' } }));
    }
  };

  /** Change range for a single metal chart */
  const setMetalRange = (metal, range) => {
    setSpotHistoryMetal(prev => ({ ...prev, [metal]: { ...prev[metal], range } }));
  };

  /** Fetch sparkline data — backend returns last 24 trading hours (weekend gaps filtered out) */
  const fetchSparklineData = async () => {
    if (sparklineFetchedRef.current) return;
    try {
      const res = await fetch(`${API_BASE_URL}/v1/sparkline-24h`);
      if (!res.ok) return;
      const data = await res.json();
      if (data.success && data.sparklines && data.sparklines.gold?.length >= 2) {
        setSparklineData({
          gold: data.sparklines.gold,
          silver: data.sparklines.silver,
          platinum: data.sparklines.platinum,
          palladium: data.sparklines.palladium,
          timestamps: data.timestamps || [],
        });
        sparklineFetchedRef.current = true;
      }
    } catch (e) {
      if (__DEV__) console.log('Sparkline fetch error:', e.message);
    }
  };

  /**
   * Fetch portfolio snapshots for analytics charts
   * Fetches ALL data once and caches it - subsequent range changes filter client-side
   * If user has holdings but no snapshots, calculates historical data
   * Uses AsyncStorage cache for instant render on app load
   */
  const fetchAnalyticsSnapshots = async (forceRefresh = false) => {
    if (!hasGold && !hasLifetimeAccess) return;

    const cache = snapshotsCacheRef.current;

    // If we have in-memory cached data and not forcing refresh, just apply the filter
    if (!forceRefresh && cache.fetched && cache.primaryData) {
      if (__DEV__) console.log('📊 Using in-memory cached snapshots data');
      applyRangeFilter(analyticsRange);
      return;
    }

    // Try to load from AsyncStorage for instant render (before network)
    const diskCacheKey = 'portfolio_chart_cache';
    let showedCachedData = false;
    if (!forceRefresh && !cache.fetched) {
      try {
        const diskRaw = await AsyncStorage.getItem(diskCacheKey);
        if (diskRaw) {
          const diskCache = JSON.parse(diskRaw);
          const cacheAge = Date.now() - (diskCache.timestamp || 0);
          const fifteenMin = 15 * 60 * 1000;
          if (diskCache.data && diskCache.data.length > 0) {
            // Show cached data immediately
            cache.primaryData = diskCache.data;
            cache.fetched = true;
            const filtered = filterSnapshotsByRange(diskCache.data, analyticsRange);
            if (filtered.length === 0 && analyticsRange !== '1D' && diskCache.data.length > 0) {
              setAnalyticsSnapshots(diskCache.data);
            } else {
              setAnalyticsSnapshots(filtered);
            }
            showedCachedData = true;
            if (__DEV__) console.log(`📊 Loaded ${diskCache.data.length} points from disk cache (${Math.round(cacheAge / 1000)}s old)`);

            // If cache is fresh (<15 min) and it's outside market hours, skip network fetch
            if (cacheAge < fifteenMin) {
              const now = new Date();
              const hour = now.getUTCHours();
              const day = now.getUTCDay();
              const isWeekend = day === 0 || day === 6;
              const isAfterHours = hour < 13 || hour > 22; // rough market hours UTC
              if (isWeekend || isAfterHours) {
                if (__DEV__) console.log('📊 Disk cache is fresh and markets closed — skipping fetch');
                return;
              }
            }
          }
        }
      } catch (e) {
        // Disk cache read failed, proceed normally
      }
    }

    // Cancel any in-progress fetch
    if (analyticsAbortRef.current) {
      analyticsAbortRef.current.abort();
    }

    // Create new abort controller for this fetch
    const controller = new AbortController();
    analyticsAbortRef.current = controller;

    // Only show loading spinner if we don't have cached data to display
    if (!showedCachedData) setAnalyticsLoading(true);
    const hasHoldings = silverItems.length > 0 || goldItems.length > 0 || platinumItems.length > 0 || palladiumItems.length > 0;

    try {
      let apiSnapshots = [];

      // Only fetch from API if we have a userId
      if (supabaseUser?.id) {
        try {
          // Add timeout
          const timeoutId = setTimeout(() => controller.abort(), 10000);

          // Always fetch ALL data - we filter client-side
          const response = await fetch(
            `${API_BASE_URL}/v1/snapshots/${encodeURIComponent(supabaseUser.id)}?range=ALL`,
            { signal: controller.signal }
          );
          clearTimeout(timeoutId);

          if (controller.signal.aborted) return;

          const data = await response.json();
          if (controller.signal.aborted) return;

          if (data.success) {
            apiSnapshots = data.snapshots || [];
            // Save current snapshot if user has holdings (don't await)
            if (hasHoldings) {
              saveDailySnapshot().catch(err => { if (__DEV__) console.log('Snapshot save error:', err.message); });
            }
          }
        } catch (apiError) {
          if (apiError.name === 'AbortError' || controller.signal.aborted) return;
          if (__DEV__) console.log('⚠️ API snapshot fetch failed:', apiError.message);
        }
      } else {
        if (__DEV__) console.log('📊 No supabaseUser, skipping API fetch - using local calculation');
      }

      // Calculate historical data from holdings + historical spot prices
      let calculatedData = null;
      if (hasHoldings) {
        try {
          if (__DEV__) console.log('📊 Calculating historical data from holdings...');
          calculatedData = await calculateHistoricalPortfolioData('ALL');
          if (controller.signal.aborted) return;
          if (__DEV__) console.log(`📊 Calculated ${calculatedData?.length || 0} historical points`);
        } catch (histError) {
          if (controller.signal.aborted) return;
          if (__DEV__) console.log('⚠️ Historical calculation failed:', histError.message);
        }
      }

      // Determine best data source
      let finalData = [];
      const apiOldestDate = apiSnapshots.length > 0 ? apiSnapshots[0]?.date : null;
      const calcOldestDate = calculatedData?.length > 0 ? calculatedData[0]?.date : null;

      if (calculatedData && calculatedData.length > 0) {
        if (!apiOldestDate || (calcOldestDate && calcOldestDate < apiOldestDate)) {
          finalData = calculatedData;
          if (__DEV__) console.log(`📊 Using calculated data (oldest: ${calcOldestDate}) over API (oldest: ${apiOldestDate})`);
        } else {
          finalData = apiSnapshots;
          if (__DEV__) console.log(`📊 Using API snapshots (oldest: ${apiOldestDate})`);
        }
      } else if (apiSnapshots.length > 0) {
        finalData = apiSnapshots;
        if (__DEV__) console.log(`📊 Using API snapshots only (${apiSnapshots.length} points)`);
      } else if (hasHoldings) {
        // Fallback: show today's data only
        finalData = [{
          date: new Date().toISOString().split('T')[0],
          total_value: totalMeltValue,
          gold_value: totalGoldOzt * goldSpot,
          silver_value: totalSilverOzt * silverSpot,
          gold_oz: totalGoldOzt,
          silver_oz: totalSilverOzt,
          gold_spot: goldSpot,
          silver_spot: silverSpot,
        }];
        if (__DEV__) console.log('📊 Using today-only fallback');
      }

      // Only update UI if data actually changed from what we're showing
      const prevJson = showedCachedData ? JSON.stringify(cache.primaryData) : '';
      const newJson = JSON.stringify(finalData);
      const dataChanged = prevJson !== newJson;

      // Store and apply
      cache.primaryData = finalData;
      cache.fetched = true;

      if (dataChanged || !showedCachedData) {
        const filtered = filterSnapshotsByRange(finalData, analyticsRange);
        if (filtered.length === 0 && analyticsRange !== '1D' && finalData.length > 0) {
          setAnalyticsSnapshots(finalData);
        } else {
          setAnalyticsSnapshots(filtered);
        }
      }
      if (__DEV__) console.log(`📊 Final: ${finalData.length} total points, dataChanged=${dataChanged}`);

      // Persist to AsyncStorage for next app launch
      AsyncStorage.setItem(diskCacheKey, JSON.stringify({
        data: finalData,
        timestamp: Date.now(),
      })).catch(() => {});
    } catch (error) {
      if (error.name === 'AbortError' || controller.signal.aborted) return;
      if (__DEV__) console.error('❌ Error in analytics fetch:', error.message);
      cache.fetched = true;
      if (!showedCachedData) setAnalyticsSnapshots([]);
    } finally {
      if (!controller.signal.aborted) {
        setAnalyticsLoading(false);
      }
    }
  };

  // Save snapshot when data is loaded and prices are live
  useEffect(() => {
    if (dataLoaded && spotPricesLive && supabaseUser?.id && (hasGold || hasLifetimeAccess)) {
      saveDailySnapshot();
    }
  }, [dataLoaded, spotPricesLive, supabaseUser?.id, hasGold, hasLifetimeAccess]);

  // Fetch analytics when tab opens (data is cached, so only fetches once per session)
  // This effect triggers when: user navigates to Analytics tab, OR RevenueCat values become available while on Analytics
  useEffect(() => {
    // Early exit if not on analytics tab
    if (currentScreen !== 'Analytics') return;

    // Need subscription access (but NOT revenueCatUserId - we can calculate locally without it)
    if (!hasGold && !hasLifetimeAccess) {
      if (__DEV__) console.log('📊 Analytics: waiting for subscription info...', { supabaseUser: !!supabaseUser?.id, hasGold, hasLifetimeAccess });
      return;
    }

    // Fetch portfolio intelligence if not already loaded
    if (!portfolioIntel && supabaseUser) fetchPortfolioIntelligence();

    // Check if we already have cached data
    const cache = snapshotsCacheRef.current;
    if (cache.fetched && cache.primaryData && cache.primaryData.length > 0) {
      if (__DEV__) console.log('📊 Analytics: using cached data');
      applyRangeFilter(analyticsRange);
      return;
    }

    // Trigger fetch - use small delay to ensure state is settled after React batch updates
    if (__DEV__) console.log('📊 Analytics: triggering fetch...');
    const fetchTimeout = setTimeout(() => {
      fetchAnalyticsSnapshots();
    }, 100);

    // Cleanup: cancel timeout and any in-progress fetch
    return () => {
      clearTimeout(fetchTimeout);
      if (analyticsAbortRef.current) {
        analyticsAbortRef.current.abort();
      }
    };
  }, [currentScreen, supabaseUser?.id, hasGold, hasLifetimeAccess]);

  // Apply filter when range changes (instant, no API call)
  useEffect(() => {
    const cache = snapshotsCacheRef.current;
    if (currentScreen === 'Analytics' && cache.fetched && cache.primaryData) {
      applyRangeFilter(analyticsRange);
    }
  }, [analyticsRange]);

  // Fetch spot price history for all metals when analytics tab becomes active or ranges change
  useEffect(() => {
    if (currentScreen === 'Analytics' && hasGoldAccess) {
      ['gold', 'silver', 'platinum', 'palladium'].forEach(metal => {
        fetchSpotPriceHistoryForMetal(metal, spotHistoryMetal[metal].range);
      });
    }
  }, [currentScreen, hasGoldAccess, spotHistoryMetal.gold.range, spotHistoryMetal.silver.range, spotHistoryMetal.platinum.range, spotHistoryMetal.palladium.range]);

  // Fetch sparkline data when Today tab loads OR when app finishes loading (for widgets)
  useEffect(() => {
    if (currentScreen === 'Dashboard') fetchSparklineData();
  }, [currentScreen]);

  useEffect(() => {
    if (dataLoaded && spotPricesLive) fetchSparklineData();
  }, [dataLoaded, spotPricesLive]);


  // ============================================
  // CLOUD BACKUP
  // ============================================

  const createBackup = async () => {
    try {
      const backup = {
        version: '1.1',
        timestamp: new Date().toISOString(),
        data: { silverItems, goldItems, platinumItems, palladiumItems }
      };

      const json = JSON.stringify(backup, null, 2);
      const filename = `stack-tracker-backup-${new Date().toISOString().split('T')[0]}.json`;
      const filepath = `${FileSystem.documentDirectory}${filename}`;

      await FileSystem.writeAsStringAsync(filepath, json);
      await Sharing.shareAsync(filepath, {
        mimeType: 'application/json',
        dialogTitle: 'Save Backup to Cloud',
        UTI: 'public.json'
      });

      Alert.alert('Backup Created', 'Save to iCloud Drive, Google Drive, or your preferred storage.');
    } catch (error) {
      Alert.alert('Error', 'Failed to create backup: ' + error.message);
    }
  };

  const restoreBackup = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'application/json',
        copyToCacheDirectory: true,
      });

      if (result.canceled) return;

      // Safety check for assets array
      if (!result.assets || result.assets.length === 0) {
        Alert.alert('Error', 'No file selected');
        return;
      }

      const file = result.assets[0];
      const content = await FileSystem.readAsStringAsync(file.uri);
      const backup = JSON.parse(content);

      if (!backup.data || !backup.version) {
        Alert.alert('Invalid Backup', 'This file is not a valid Stack Tracker backup.');
        return;
      }

      Alert.alert(
        'Restore Backup',
        `Replace current data with backup from ${backup.timestamp}?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Restore',
            onPress: async () => {
              if (backup.data.silverItems) setSilverItems(backup.data.silverItems);
              if (backup.data.goldItems) setGoldItems(backup.data.goldItems);
              if (backup.data.platinumItems) setPlatinumItems(backup.data.platinumItems);
              if (backup.data.palladiumItems) setPalladiumItems(backup.data.palladiumItems);
              Alert.alert('Success', 'Backup restored!');
            }
          }
        ]
      );
    } catch (error) {
      Alert.alert('Error', 'Failed to restore: ' + error.message);
    }
  };

  // ============================================
  // IN-APP REVIEW PROMPT
  // ============================================

  /**
   * Check if we should show the review prompt
   * Conditions:
   * - Max 3 prompts per year
   * - At least 30 days between prompts
   * - Triggered after 10th holding OR 7 days of use
   */
  const checkAndRequestReview = async (trigger = 'holdings') => {
    try {
      // Check if store review is available
      const isAvailable = await StoreReview.isAvailableAsync();
      if (!isAvailable) {
        if (__DEV__) console.log('📱 Store review not available on this device');
        return;
      }

      // Get review prompt history
      const reviewHistoryStr = await AsyncStorage.getItem('stack_review_prompts');
      const reviewHistory = reviewHistoryStr ? JSON.parse(reviewHistoryStr) : [];
      const now = Date.now();
      const oneYear = 365 * 24 * 60 * 60 * 1000;
      const thirtyDays = 30 * 24 * 60 * 60 * 1000;

      // Filter to prompts within the last year
      const promptsThisYear = reviewHistory.filter(ts => now - ts < oneYear);

      // Check if we've hit max prompts (3 per year)
      if (promptsThisYear.length >= 3) {
        if (__DEV__) console.log('📱 Max review prompts reached this year');
        return;
      }

      // Check if at least 30 days since last prompt
      const lastPrompt = promptsThisYear.length > 0 ? Math.max(...promptsThisYear) : 0;
      if (lastPrompt && now - lastPrompt < thirtyDays) {
        if (__DEV__) console.log('📱 Too soon since last review prompt');
        return;
      }

      // Check trigger conditions
      if (trigger === 'holdings') {
        const totalHoldings = silverItems.length + goldItems.length + platinumItems.length + palladiumItems.length;
        if (totalHoldings < 10) {
          return; // Not enough holdings yet
        }
        if (__DEV__) console.log(`📱 Triggering review prompt: ${totalHoldings} holdings`);
      } else if (trigger === 'days') {
        const firstOpenStr = await AsyncStorage.getItem('stack_first_open_date');
        if (!firstOpenStr) {
          // First time opening, save the date
          await AsyncStorage.setItem('stack_first_open_date', new Date().toISOString());
          return;
        }
        const firstOpen = new Date(firstOpenStr).getTime();
        const sevenDays = 7 * 24 * 60 * 60 * 1000;
        if (now - firstOpen < sevenDays) {
          return; // Not 7 days yet
        }
        if (__DEV__) console.log('📱 Triggering review prompt: 7+ days of use');
      }

      // Request the review
      await StoreReview.requestReview();

      // Save the prompt timestamp
      promptsThisYear.push(now);
      await AsyncStorage.setItem('stack_review_prompts', JSON.stringify(promptsThisYear));
      if (__DEV__) console.log('📱 Review prompt shown successfully');

    } catch (error) {
      if (__DEV__) console.error('❌ Error with review prompt:', error.message);
    }
  };

  // Check for 7-day review trigger on app load
  useEffect(() => {
    if (dataLoaded && isAuthenticated) {
      // Small delay to not interfere with initial load
      const timer = setTimeout(() => {
        checkAndRequestReview('days');
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [dataLoaded, isAuthenticated]);

  // ============================================
  // SPOT PRICE CHANGE DISPLAY TOGGLE
  // ============================================

  const toggleSpotChangeDisplayMode = async () => {
    const newMode = spotChangeDisplayMode === 'percent' ? 'amount' : 'percent';
    setSpotChangeDisplayMode(newMode);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      await AsyncStorage.setItem('stack_spot_change_display_mode', newMode);
    } catch (error) {
      if (__DEV__) console.error('Failed to save spot change display mode:', error);
    }
  };

  // ============================================
  // API CALLS
  // ============================================

  const fetchSpotPrices = async (silent = false) => {
    if (!silent) setPriceSource('loading...');
    try {
      if (__DEV__) console.log('📡 Fetching spot prices from:', `${API_BASE_URL}/v1/prices`);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const response = await fetch(`${API_BASE_URL}/v1/prices`, {
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (__DEV__) console.log('✅ API Response Status:', response.status, response.statusText);

      const raw = await response.json();
      if (__DEV__) console.log('📊 API Response Data:', JSON.stringify(raw).substring(0, 300));

      if (raw.prices) {
        // Transform v1 nested response: { prices: { gold: { price, change_pct }, ... } }
        const goldPrice = raw.prices.gold?.price;
        const silverPrice = raw.prices.silver?.price;
        const platinumPrice = raw.prices.platinum?.price;
        const palladiumPrice = raw.prices.palladium?.price;

        if (silverPrice && silverPrice > 10) {
          setSilverSpot(silverPrice);
          await AsyncStorage.setItem('stack_silver_spot', silverPrice.toString());
        }
        if (goldPrice && goldPrice > 1000) {
          setGoldSpot(goldPrice);
          await AsyncStorage.setItem('stack_gold_spot', goldPrice.toString());
        }
        if (platinumPrice && platinumPrice > 100) {
          setPlatinumSpot(platinumPrice);
          await AsyncStorage.setItem('stack_platinum_spot', platinumPrice.toString());
        }
        if (palladiumPrice && palladiumPrice > 100) {
          setPalladiumSpot(palladiumPrice);
          await AsyncStorage.setItem('stack_palladium_spot', palladiumPrice.toString());
        }
        setPriceSource(raw.source || 'live');
        setPriceTimestamp(raw.timestamp || new Date().toISOString());
        setSpotPricesLive(true);
        await AsyncStorage.setItem('stack_price_timestamp', raw.timestamp || new Date().toISOString());

        // Compute daily change data from change_pct
        const computeChange = (metalData) => {
          if (!metalData) return { amount: null, percent: null, prevClose: null };
          const pct = metalData.change_pct || 0;
          const price = metalData.price || 0;
          const prevClose = pct !== 0 ? price / (1 + pct / 100) : price;
          return { amount: price - prevClose, percent: pct, prevClose };
        };

        setSpotChange({
          gold: computeChange(raw.prices.gold),
          silver: computeChange(raw.prices.silver),
          platinum: computeChange(raw.prices.platinum),
          palladium: computeChange(raw.prices.palladium),
        });
        if (__DEV__) console.log('📈 Change data computed from change_pct');

        // Capture markets closed status (client-side fallback since v1 doesn't send marketsClosed)
        const clientClosed = isMarketClosedClientSide();
        setMarketsClosed(clientClosed);
        if (clientClosed) {
          if (__DEV__) console.log(`🔒 Markets closed — client: ${clientClosed}`);
        }

        if (__DEV__) console.log(`💰 Prices updated: Gold $${goldPrice}, Silver $${silverPrice} (Source: ${raw.source})`);
      } else {
        if (__DEV__) console.log('⚠️  API returned no prices data');
        setPriceSource('cached');
      }
    } catch (error) {
      if (error.name === 'AbortError') {
        if (__DEV__) console.log('⏱️ Spot prices fetch aborted (timeout or unmount)');
        return;
      }
      if (__DEV__) console.error('❌ Error fetching spot prices:', error.message);
      if (__DEV__) console.error('   Error details:', error);
      setPriceSource('cached');
    }
  };

  // Pull-to-refresh handler for dashboard
  const onRefreshDashboard = async () => {
    setIsRefreshing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    // Fetch spot prices and sync holdings in parallel
    const promises = [fetchSpotPrices()];

    // Also sync holdings if user is signed in
    if (supabaseUser) {
      promises.push(syncHoldingsWithSupabase(true)); // force=true to re-sync
    }

    await Promise.all(promises);
    setIsRefreshing(false);
  };

  const onRefreshAnalytics = async () => {
    setIsRefreshing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    // Clear cache and force refresh
    snapshotsCacheRef.current = { primaryData: null, fetched: false };
    await Promise.all([
      fetchAnalyticsSnapshots(true),
      fetchPortfolioIntelligence(),
    ]);
    setIsRefreshing(false);
  };

  // ============================================
  // TODAY TAB - INTELLIGENCE FEED
  // ============================================

  const fetchDailyBrief = async () => {
    if (!supabaseUser) {
      if (__DEV__) console.log(`📰 [Brief] Skipped: supabaseUser=${!!supabaseUser}`);
      return;
    }
    try {
      setDailyBriefLoading(true);
      // Use EST date to match backend
      const todayEST = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
      const url = `${API_BASE_URL}/v1/daily-brief?userId=${supabaseUser.id}&date=${todayEST}`;
      if (__DEV__) console.log(`📰 [Brief] Fetching: ${url}`);
      const response = await fetch(url);
      if (__DEV__) console.log(`📰 [Brief] HTTP ${response.status}`);
      const data = await response.json();
      if (__DEV__) console.log(`📰 [Brief] Response:`, JSON.stringify(data).slice(0, 200));
      if (data.brief) {
        setDailyBrief(data.brief);
      } else {
        if (__DEV__) console.log(`📰 [Brief] No brief returned (brief=${!!data.brief}, error=${data.error})`);
        setDailyBrief(null);
      }
    } catch (error) {
      if (__DEV__) console.error('📰 [Brief] Fetch error:', error.message);
    } finally {
      setDailyBriefLoading(false);
    }
  };

  const fetchPortfolioIntelligence = async () => {
    if (!supabaseUser) return;
    try {
      setPortfolioIntelLoading(true);
      const response = await fetch(`${API_BASE_URL}/v1/portfolio-intelligence?userId=${supabaseUser.id}`);
      const data = await response.json();
      if (__DEV__) console.log('🧠 [Portfolio Intel] Response:', JSON.stringify(data).slice(0, 300));

      // Helper: extract the first string value from an object (any key)
      const extractString = (obj) => {
        if (!obj || typeof obj !== 'object') return null;
        for (const val of Object.values(obj)) {
          if (typeof val === 'string' && val.length > 20) return val;
        }
        return null;
      };

      // v1 returns intelligence.text as a JSON string like {"portfolio":"actual text..."}
      // The JSON may be truncated/malformed. Extract the text content robustly.
      let text = null;
      const intel = data.intelligence || data;

      // Helper: strip JSON wrapper from a string like {"key":"value..."} → value...
      const stripJsonWrapper = (str) => {
        if (!str || typeof str !== 'string') return str;
        // If it starts with { it's likely a JSON wrapper — extract the first string value
        if (str.trimStart().startsWith('{')) {
          const match = str.match(/:\s*"([\s\S]+)/);
          if (match) {
            // Remove trailing ", } and whitespace
            return match[1].replace(/"\s*\}?\s*$/, '').replace(/\\n/g, '\n').replace(/\\"/g, '"');
          }
        }
        return str;
      };

      if (typeof intel === 'string' && intel.length > 20) {
        text = stripJsonWrapper(intel);
      } else if (intel && typeof intel === 'object') {
        if (typeof intel.text === 'string' && intel.text.length > 20) {
          // Try JSON.parse first for well-formed JSON
          try {
            const parsed = JSON.parse(intel.text);
            text = extractString(parsed);
          } catch {
            // JSON is malformed/truncated — strip the wrapper with regex
          }
          if (!text) text = stripJsonWrapper(intel.text);
        } else if (typeof intel.text === 'object' && intel.text) {
          text = extractString(intel.text);
        }
        if (!text) text = extractString(intel);
      }

      if (text) {
        setPortfolioIntel({
          text,
          costBasis: intel?.costBasis || intel?.cost_basis || null,
          purchaseStats: intel?.purchaseStats || intel?.purchase_stats || null,
          date: intel?.date || new Date().toISOString().split('T')[0],
          is_current: intel?.is_current ?? true,
        });
      } else {
        setPortfolioIntel(null);
      }
    } catch (error) {
      if (__DEV__) console.error('🧠 [Portfolio Intel] Fetch error:', error.message);
    } finally {
      setPortfolioIntelLoading(false);
    }
  };

  const fetchIntelligenceBriefs = async () => {
    try {
      setIntelligenceLoading(true);
      const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
      const response = await fetch(`${API_BASE_URL}/v1/market-intel?date=${today}`);
      const raw = await response.json();
      // Transform v1 articles → briefs format
      const severityToScore = { high: 9, medium: 5, info: 2, low: 1 };
      if (raw.articles && raw.articles.length > 0) {
        const briefs = raw.articles.map(a => ({
          id: a.id,
          date: a.published_at?.split('T')[0] || today,
          category: a.category || 'general',
          title: a.title,
          summary: a.summary,
          source: a.source ? [...new Set(a.source.split(/,\s*/).map(s => s.trim()).filter(Boolean))].join(', ') : '',
          source_url: a.source_url || '',
          relevance_score: severityToScore[a.severity] || 5,
          created_at: a.published_at || '',
        }));
        // Filter out test/placeholder briefs
        const filtered = briefs.filter(b =>
          !b.title?.toLowerCase().includes('test alert') &&
          !b.summary?.toLowerCase().includes('this is a test')
        );
        setIntelligenceBriefs(filtered);
      }
      setIntelligenceLastFetched(new Date());
    } catch (error) {
      if (__DEV__) console.error('Intelligence fetch error:', error);
    } finally {
      setIntelligenceLoading(false);
    }
  };

  // Fetch vault data (COMEX warehouse inventory) — v1 returns per-metal snapshots
  const fetchVaultData = async () => {
    try {
      setVaultLoading(true);
      const metals = ['gold', 'silver', 'platinum', 'palladium'];
      // Fetch both latest snapshot and 30-day history for each metal
      const [latestResults, historyResults] = await Promise.all([
        Promise.all(metals.map(async (metal) => {
          try {
            const res = await fetch(`${API_BASE_URL}/v1/vault-watch?metal=${metal}`);
            if (!res.ok) return null;
            return res.json();
          } catch { return null; }
        })),
        Promise.all(metals.map(async (metal) => {
          try {
            const res = await fetch(`${API_BASE_URL}/v1/vault-watch?metal=${metal}&days=30`);
            if (!res.ok) return null;
            return res.json();
          } catch { return null; }
        })),
      ]);
      const data = {};
      for (let i = 0; i < metals.length; i++) {
        const latest = latestResults[i];
        const histRaw = historyResults[i];
        const historyArr = (histRaw?.data?.[metals[i]] || histRaw?.history || []).map(h => ({
          date: h.date,
          registered_oz: h.registered_oz || 0,
          eligible_oz: h.eligible_oz || 0,
          combined_oz: h.combined_oz || 0,
          registered_change_oz: h.registered_change_oz || 0,
          eligible_change_oz: h.eligible_change_oz || 0,
          oversubscribed_ratio: h.oversubscribed_ratio || 0,
        }));
        // Append latest if not already in history
        if (latest) {
          const latestDate = latest.date || new Date().toISOString().split('T')[0];
          const latestEntry = {
            date: latestDate,
            registered_oz: latest.registered_oz || 0,
            eligible_oz: latest.eligible_oz || 0,
            combined_oz: latest.combined_oz || 0,
            registered_change_oz: latest.registered_change_oz || 0,
            eligible_change_oz: latest.eligible_change_oz || 0,
            oversubscribed_ratio: latest.oversubscribed_ratio || 0,
          };
          if (!historyArr.some(h => h.date === latestDate)) {
            historyArr.push(latestEntry);
          }
        }
        // Sort by date ascending
        historyArr.sort((a, b) => a.date.localeCompare(b.date));
        data[metals[i]] = historyArr.length > 0 ? historyArr : (latest ? [{
          date: latest.date || new Date().toISOString().split('T')[0],
          registered_oz: latest.registered_oz || 0,
          eligible_oz: latest.eligible_oz || 0,
          combined_oz: latest.combined_oz || 0,
          registered_change_oz: latest.registered_change_oz || 0,
          eligible_change_oz: latest.eligible_change_oz || 0,
          oversubscribed_ratio: latest.oversubscribed_ratio || 0,
        }] : []);
      }
      setVaultData(data);
      setVaultLastFetched(new Date());
    } catch (error) {
      if (__DEV__) console.error('Vault data fetch error:', error);
    } finally {
      setVaultLoading(false);
    }
  };

  // Fetch intelligence + vault data when switching to Today tab
  useEffect(() => {
    if (currentScreen === 'Dashboard') {
      if (!intelligenceLastFetched) fetchIntelligenceBriefs();
      if (!vaultLastFetched) fetchVaultData();
    }
  }, [currentScreen]);

  // Fetch daily brief when tab or user changes
  useEffect(() => {
    if (currentScreen === 'Dashboard' && supabaseUser && (!dailyBrief || !dailyBrief.is_current)) {
      fetchDailyBrief();
    }
  }, [currentScreen, supabaseUser]);

  // Fetch Stack Signal daily synthesis for Today tab teaser
  useEffect(() => {
    if (currentScreen === 'Dashboard' && !stackSignalDaily) {
      stackSignalAPI.fetchDaily().then(res => {
        const daily = res?.signal || (res?.id ? res : null);
        if (daily) setStackSignalDaily(daily);
      }).catch(() => {});
    }
  }, [currentScreen]);

  // Fetch Stack Signal data when switching to Signal tab
  useEffect(() => {
    if (currentScreen === 'StackSignal') {
      if (!stackSignalDaily) {
        stackSignalAPI.fetchDaily().then(res => {
          const daily = res?.signal || (res?.id ? res : null);
          if (daily) setStackSignalDaily(daily);
        }).catch(() => {});
      }
      if (stackSignalArticles.length === 0) {
        fetchStackSignalData();
      }
    }
  }, [currentScreen]);

  // Load Troy Chat conversations on auth and when Troy tab opens
  useEffect(() => {
    if (supabaseUser) {
      console.log('[Troy] Fetching conversations...');
      troyAPI.listConversations().then(result => {
        const convos = result?.conversations || (Array.isArray(result) ? result : []);
        console.log('[Troy] Fetched conversations:', convos.length);
        setTroyConversations(convos);
      }).catch(() => {});
    }
  }, [supabaseUser?.id, currentScreen]);

  // Fetch and display daily brief when user taps the suggestion chip
  const fetchAndShowDailyBrief = async () => {
    if (!supabaseUser) return;
    setTroyLoading(true);
    try {
      const todayEST = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
      const res = await fetch(`${API_BASE_URL}/v1/daily-brief?userId=${supabaseUser.id}&date=${todayEST}`);
      const data = await res.json();

      if (data.brief && data.brief.brief_text) {
        const brief = data.brief;
        const goldDir = spotChange?.gold?.percent >= 0 ? 'up' : 'down';
        const goldPct = Math.abs(spotChange?.gold?.percent || 0).toFixed(1);
        const greeting = `Good morning. **Gold at $${goldSpot?.toLocaleString()}**, ${goldDir} ${goldPct}%. **Silver at $${silverSpot?.toFixed(2)}**.\n\n${brief.brief_text}`;

        const briefMessage = {
          id: `brief-${Date.now()}`,
          role: 'assistant',
          content: greeting,
          created_at: new Date().toISOString(),
          preview: { type: 'daily_brief', data: brief },
        };
        setTroyMessages(prev => [...prev, briefMessage]);
      } else {
        setTroyMessages(prev => [...prev, {
          id: `brief-empty-${Date.now()}`,
          role: 'assistant',
          content: "No daily brief available yet. Markets may be closed, or the brief hasn't been generated. Check back later.",
          created_at: new Date().toISOString(),
        }]);
      }
    } catch (e) {
      if (__DEV__) console.log('Daily brief fetch failed:', e.message);
      setTroyMessages(prev => [...prev, {
        id: `brief-err-${Date.now()}`,
        role: 'assistant',
        content: "Couldn't load today's brief right now. Try again in a moment.",
        created_at: new Date().toISOString(),
      }]);
    }
    setTroyLoading(false);
  };

  const onRefreshToday = async () => {
    setIsRefreshing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await Promise.all([
      fetchIntelligenceBriefs(),
      fetchVaultData(),
      fetchSpotPrices(true),
      fetchDailyBrief(),
    ]);
    setIsRefreshing(false);
  };

  const onRefreshSignal = async () => {
    setIsRefreshing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await fetchStackSignalData();
    setIsRefreshing(false);
  };

  /**
   * Fetch historical spot price for a given date
   *
   * The API returns a three-tier response:
   * - Pre-2006: Monthly averages (granularity: 'monthly')
   * - 2006+: ETF-derived daily prices (granularity: 'daily' or 'estimated_intraday')
   * - Recent: Minute-level from our database (granularity: 'minute')
   *
   * @param {string} date - Date in YYYY-MM-DD format
   * @param {string} metal - 'gold' or 'silver'
   * @param {string} time - Optional time in HH:MM format for intraday estimation
   * @returns {Object} { price, source, granularity, dailyRange, note }
   */
  const fetchHistoricalSpot = async (date, metal, time = null) => {
    if (!date || date.length < 10) return { price: null, source: null };
    try {
      let url = `${API_BASE_URL}/v1/historical-spot?date=${date}`;
      if (metal) url += `&metal=${metal}`;
      if (time) url += `&time=${time}`;

      if (__DEV__) console.log(`📅 Fetching historical spot: ${url}`);
      const response = await fetch(url);
      const data = await response.json();

      if (__DEV__) {
        if (__DEV__) console.log('📅 Historical spot API response:', JSON.stringify(data, null, 2));

        // Log granularity-based warnings
        if (data.granularity === 'monthly' || data.granularity === 'monthly_fallback') {
          if (__DEV__) console.log('⚠️ Using monthly average (pre-2006 or fallback)');
        } else if (data.granularity === 'estimated_intraday') {
          if (__DEV__) console.log('📊 Using time-weighted intraday estimate');
        } else if (data.granularity === 'minute') {
          if (__DEV__) console.log('✅ Using exact minute-level price from our records');
        }

        if (data.note) {
          if (__DEV__) console.log(`📝 Note: ${data.note}`);
        }
      }

      if (data.success) {
        // Get the price for the requested metal (or default to the response format)
        const metalKey = metal || metalTab;
        const price = data.price || data[metalKey];

        return {
          price: price,
          source: data.source,
          granularity: data.granularity,
          dailyRange: data.dailyRange ? data.dailyRange[metalKey] : null,
          note: data.note,
          // Also return full response for all metals if needed
          gold: data.gold,
          silver: data.silver,
          platinum: data.platinum,
          palladium: data.palladium,
        };
      }
    } catch (error) {
      if (__DEV__) console.log('❌ Could not fetch historical spot:', error.message);
    }
    // No historical data available - return null instead of current spot
    // to prevent contaminating saved spotPrice with today's price
    return {
      price: null,
      source: 'unavailable',
      granularity: null
    };
  };

  const handleDateChange = async (date) => {
    setForm(prev => ({ ...prev, datePurchased: date }));
    setSpotPriceSource(null);
    setHistoricalSpotSuggestion(null);

    if (date.length === 10) {
      const result = await fetchHistoricalSpot(date, metalTab, form.timePurchased || null);
      if (result.price) {
        setHistoricalSpotSuggestion({ price: result.price, source: result.source, date });
        setForm(prev => ({ ...prev, spotPrice: result.price.toString() }));
        setSpotPriceSource(result.source);
      }
    }
  };

  // Handle time change - refetch historical spot with time for minute-level precision
  const handleTimeChange = async (time) => {
    setForm(prev => ({ ...prev, timePurchased: time }));

    const timeValid = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(time);
    const hasDate = form.datePurchased && form.datePurchased.length === 10;

    if (timeValid && hasDate) {
      setSpotPriceSource(null);
      setHistoricalSpotSuggestion(null);

      const result = await fetchHistoricalSpot(form.datePurchased, metalTab, time);
      if (result.price) {
        setHistoricalSpotSuggestion({ price: result.price, source: result.source, date: form.datePurchased });
        setForm(prev => ({ ...prev, spotPrice: result.price.toString() }));
        setSpotPriceSource(result.source);
      }
    }
  };

  // Handle metal tab change — auto-update spot price for the new metal
  const handleMetalTabChange = async (newMetal) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setMetalTab(newMetal);

    // Map metal keys to current live spot prices
    const liveSpots = { gold: goldSpot, silver: silverSpot, platinum: platinumSpot, palladium: palladiumSpot };

    if (form.datePurchased && form.datePurchased.length === 10) {
      // Date is set — fetch historical spot for the new metal
      setSpotPriceSource(null);
      setHistoricalSpotSuggestion(null);
      const result = await fetchHistoricalSpot(form.datePurchased, newMetal, form.timePurchased || null);
      if (result.price) {
        setForm(prev => ({ ...prev, spotPrice: result.price.toString() }));
        setSpotPriceSource(result.source);
        setHistoricalSpotSuggestion({ price: result.price, source: result.source, date: form.datePurchased });
      } else {
        // Fallback to current live spot
        setForm(prev => ({ ...prev, spotPrice: String(liveSpots[newMetal] || 0) }));
        setSpotPriceSource('current-fallback');
      }
    } else {
      // No date — use current live spot price for the new metal
      setForm(prev => ({ ...prev, spotPrice: String(liveSpots[newMetal] || 0) }));
      setSpotPriceSource('current-spot');
    }
  };

  // ============================================
  // RECEIPT SCANNING
  // ============================================


  // Process a single image and return items
  const processImage = async (asset, imageIndex, totalImages) => {
    if (__DEV__) console.log(`📷 Processing image ${imageIndex + 1}/${totalImages}`);
    if (__DEV__) console.log(`   URI: ${asset.uri}`);
    if (__DEV__) console.log(`   Width: ${asset.width}px, Height: ${asset.height}px`);

    // Read file as base64
    const fileInfo = await FileSystem.getInfoAsync(asset.uri, { size: true });
    const fileSizeKB = fileInfo.size ? (fileInfo.size / 1024).toFixed(0) : '?';
    const fileSizeMB = fileInfo.size ? (fileInfo.size / (1024 * 1024)).toFixed(1) : '?';

    const fullBase64 = await FileSystem.readAsStringAsync(asset.uri, {
      encoding: FileSystem.EncodingType.Base64
    });

    if (__DEV__) console.log(`   File size: ${fileSizeKB} KB`);
    if (__DEV__) console.log(`   Base64 length: ${fullBase64.length} characters`);

    const mimeType = asset.mimeType || asset.type || 'image/jpeg';
    const payloadSizeMB = (JSON.stringify({ image: fullBase64, mimeType, originalSize: fileInfo.size }).length / (1024 * 1024)).toFixed(1);

    if (__DEV__) console.log(`   Payload size: ~${payloadSizeMB} MB`);

    // Fetch with 60-second timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000);

    try {
      const response = await fetch(`${API_BASE_URL}/v1/scan-receipt`, {
        method: 'POST',
        body: JSON.stringify({
          image: fullBase64,
          mimeType: mimeType,
          originalSize: fileInfo.size
        }),
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorBody = await response.text().catch(() => '(could not read body)');
        const errMsg = `Server returned ${response.status}: ${errorBody.substring(0, 200)}`;
        console.error(`❌ Scan API error: ${errMsg}`);
        throw new Error(errMsg);
      }

      const raw = await response.json();
      // Normalize: stg-api nests results under `data`, old Railway backend was flat
      if (raw.data && typeof raw.data === 'object') {
        return { success: raw.success, ...raw.data };
      }
      return raw;
    } catch (fetchError) {
      clearTimeout(timeoutId);
      if (fetchError.name === 'AbortError') {
        throw new Error(`Scan timed out after 60s (image ${fileSizeMB} MB, payload ~${payloadSizeMB} MB)`);
      }
      throw fetchError;
    }
  };

  // Perform the actual scan after tips
  const performScan = async (source) => {
    // Check scan limit first
    if (!checkScanLimit()) return;

    let result;

    if (source === 'camera') {
      const permissionResult = await ImagePicker.requestCameraPermissionsAsync();
      if (!permissionResult.granted) {
        Alert.alert('Permission Required', 'Please allow access to your camera to take photos of receipts.');
        return;
      }
      result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.7 });
    } else {
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permissionResult.granted) {
        Alert.alert('Permission Required', 'Please allow access to your photos.');
        return;
      }
      // Allow multiple selection for gallery (up to 5 images)
      result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.7,
        allowsMultipleSelection: true,
        selectionLimit: 5
      });
    }

    if (result.canceled) return;

    if (!result.assets || result.assets.length === 0) {
      Alert.alert('Error', 'No image selected');
      return;
    }

    const totalImages = result.assets.length;
    setScanStatus('scanning');
    setScanMessage(`Analyzing ${totalImages} image${totalImages > 1 ? 's' : ''}...`);

    try {
      // Process all images and combine results
      let allItems = [];
      let dealer = '';
      let purchaseDate = '';
      let purchaseTime = '';
      let successCount = 0;

      for (let i = 0; i < result.assets.length; i++) {
        const asset = result.assets[i];
        setScanMessage(`Analyzing image ${i + 1} of ${totalImages}...`);

        try {
          const data = await processImage(asset, i, totalImages);

          if (data.success && data.items && data.items.length > 0) {
            allItems = [...allItems, ...data.items];
            // Use first found dealer/date/time
            if (!dealer && data.dealer) dealer = data.dealer;
            if (!purchaseDate && data.purchaseDate) purchaseDate = parseDate(data.purchaseDate);
            if (!purchaseTime && data.purchaseTime) purchaseTime = data.purchaseTime;
            successCount++;
            console.log(`✅ Image ${i + 1}: Found ${data.items.length} items`);
          } else {
            console.log(`⚠️ Image ${i + 1}: No items found. Response:`, JSON.stringify(data).substring(0, 300));
          }
        } catch (imgError) {
          console.error(`❌ Image ${i + 1} failed:`, imgError.message);
          // Surface error visibly in TestFlight
          if (totalImages === 1) {
            // Single image — show error immediately (outer catch won't help since we swallowed it)
            setScanStatus('error');
            setScanMessage(`Scan failed: ${imgError.message.substring(0, 100)}`);
            setTimeout(() => { setScanStatus(null); setScanMessage(''); }, 8000);
            return;
          }
        }
      }

      // Only increment scan count once for the batch
      if (allItems.length > 0) {
        await incrementScanCount();
      }

      // Deduplicate items (same description, quantity, and unit price)
      const uniqueItems = [];
      const seen = new Set();
      for (const item of allItems) {
        const key = `${item.description}|${item.quantity}|${item.unitPrice}`;
        if (!seen.has(key)) {
          seen.add(key);
          uniqueItems.push(item);
        }
      }
      const duplicatesRemoved = allItems.length - uniqueItems.length;
      if (duplicatesRemoved > 0 && __DEV__) {
        if (__DEV__) console.log(`🔄 Removed ${duplicatesRemoved} duplicate item(s)`);
      }

      const data = { success: uniqueItems.length > 0, items: uniqueItems, dealer, purchaseDate, purchaseTime };
      if (__DEV__) console.log(`📄 Combined results: ${uniqueItems.length} unique items from ${successCount}/${totalImages} images`);

      // Handle multi-item receipt response
      if (data.success && data.items && data.items.length > 0) {
        const items = data.items;

        if (__DEV__) console.log(`✅ Found ${items.length} item(s) on receipt`);

        // Count items by metal type
        const silverCount = items.filter(item => item.metal === 'silver').length;
        const goldCount = items.filter(item => item.metal === 'gold').length;
        const otherCount = items.length - silverCount - goldCount;

        // Build summary message
        let summary = `Found ${items.length} item${items.length > 1 ? 's' : ''}`;
        if (silverCount > 0 || goldCount > 0) {
          const parts = [];
          if (silverCount > 0) parts.push(`${silverCount} Silver`);
          if (goldCount > 0) parts.push(`${goldCount} Gold`);
          if (otherCount > 0) parts.push(`${otherCount} Other`);
          summary += `: ${parts.join(', ')}`;
        }

        // Process ALL items and prepare them for preview
        const processedItems = [];
        for (const item of items) {
          const extractedMetal = item.metal === 'gold' ? 'gold' : 'silver';

          // Get historical spot price for this item (with time if available)
          let spotPrice = '';
          if (purchaseDate.length === 10) {
            const result = await fetchHistoricalSpot(purchaseDate, extractedMetal, purchaseTime || null);
            if (result.price) spotPrice = result.price.toString();
          }

          let unitPrice = parseFloat(item.unitPrice) || 0;
          const ozt = parseFloat(item.ozt) || 0;
          const spotNum = parseFloat(spotPrice) || 0;
          const qty = parseInt(item.quantity) || 1;
          const parsedExtPrice = parseFloat(item.extPrice);
          let extPrice = parsedExtPrice > 0 ? parsedExtPrice : unitPrice * qty;

          // Spot price sanity check - precious metals almost never sell below spot
          let priceWarning = null;
          if (spotNum > 0 && ozt > 0) {
            const minExpectedPrice = spotNum * ozt;

            if (unitPrice < minExpectedPrice) {
              // Price is suspiciously low - try recalculating from ext price
              if (__DEV__) console.log(`⚠️ Price sanity check: $${unitPrice} < spot value $${minExpectedPrice.toFixed(2)}`);

              if (extPrice > 0 && qty > 0) {
                const recalculatedPrice = Math.round((extPrice / qty) * 100) / 100;
                if (__DEV__) console.log(`   Trying extPrice/qty: $${extPrice} / ${qty} = $${recalculatedPrice}`);

                if (recalculatedPrice >= minExpectedPrice) {
                  // Recalculated price makes sense, use it
                  if (__DEV__) console.log(`   ✓ Using recalculated price: $${recalculatedPrice}`);
                  unitPrice = recalculatedPrice;
                } else {
                  // Still below spot - flag for manual review
                  priceWarning = `Price $${unitPrice.toFixed(2)} is below spot value ($${minExpectedPrice.toFixed(2)}) - please verify`;
                  if (__DEV__) console.log(`   ⚠️ Still below spot, adding warning`);
                }
              } else {
                // No ext price to verify with - flag for manual review
                priceWarning = `Price $${unitPrice.toFixed(2)} is below spot value ($${minExpectedPrice.toFixed(2)}) - please verify`;
                if (__DEV__) console.log(`   ⚠️ No ext price to verify, adding warning`);
              }
            }
          }

          // Recalculate extPrice from final unitPrice (may have been corrected by sanity check)
          extPrice = Math.round(unitPrice * qty * 100) / 100;

          let premium = '0';
          if (unitPrice > 0 && spotNum > 0 && ozt > 0) {
            premium = (unitPrice - (spotNum * ozt)).toFixed(2);
          }

          processedItems.push({
            metal: extractedMetal,
            productName: item.description || '',
            source: dealer,
            datePurchased: purchaseDate,
            timePurchased: purchaseTime || undefined,
            ozt: parseFloat(item.ozt) || 0,
            quantity: qty,
            unitPrice: unitPrice,
            extPrice: extPrice,
            taxes: 0,
            shipping: 0,
            spotPrice: parseFloat(spotPrice) || 0,
            premium: parseFloat(premium) || 0,
            priceWarning: priceWarning,
          });
        }

        // Store scanned items and metadata
        setScannedItems(processedItems);
        setScannedMetadata({ purchaseDate, purchaseTime, dealer });

        // Show success message with haptic feedback
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setScanStatus('success');
        setScanMessage(summary);

        // Close the add modal and show preview modal
        setShowAddModal(false);
        setShowScannedItemsPreview(true);

        if (__DEV__) console.log(`✅ Processed ${processedItems.length} items for preview`);
      } else {
        console.log('⚠️ Server returned success=false or no items found');
        setScanStatus('error');
        setScanMessage("Couldn't read receipt. This scan didn't count against your limit.");
      }
    } catch (error) {
      console.error('❌ Scan receipt error:', error.message);
      setScanStatus('error');
      setScanMessage(`Scan failed: ${error.message.substring(0, 120)}`);
    }

    setTimeout(() => { setScanStatus(null); setScanMessage(''); }, 5000);
  };

  // ============================================
  // SPREADSHEET IMPORT (with Dealer Templates)
  // ============================================

  const importSpreadsheet = async () => {
    // Check scan limit first
    if (!checkScanLimit()) return;

    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['text/csv', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
        copyToCacheDirectory: true,
      });

      if (result.canceled) return;

      // Safety check for assets array
      if (!result.assets || result.assets.length === 0) {
        Alert.alert('Error', 'No file selected');
        setScanStatus(null);
        return;
      }

      const file = result.assets[0];
      if (__DEV__) console.log('📊 Spreadsheet selected:', file.name);

      // Read file content
      const fileContent = await FileSystem.readAsStringAsync(file.uri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      // Convert base64 to binary
      const binaryString = atob(fileContent);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      // Parse with XLSX - use raw:true to prevent date conversion to serial numbers
      const workbook = XLSX.read(bytes, { type: 'array', cellDates: true, raw: false });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(firstSheet, { header: 1, raw: false, dateNF: 'yyyy-mm-dd' });

      if (rows.length < 2) {
        Alert.alert('Invalid Spreadsheet', "Spreadsheet must have at least a header row and one data row. This didn't count against your scan limit.");
        return;
      }

      // Get headers for detection
      const headers = rows[0].map(h => String(h || '').toLowerCase().trim());

      // Try to auto-detect format from headers and filename
      const detectedDealer = detectDealerFromHeaders(headers, file.name);

      if (detectedDealer) {
        // Auto-detected format - process immediately
        if (__DEV__) console.log(`🏪 Auto-detected format: ${DEALER_TEMPLATES[detectedDealer].name}`);
        await processSpreadsheetWithDealer(rows, headers, detectedDealer);
      } else {
        // Unrecognized format - show dealer selector
        setPendingImportFile({ rows, headers, fileName: file.name });
        setShowDealerSelector(true);
      }

    } catch (error) {
      if (__DEV__) console.error('❌ Import error:', error);
      Alert.alert('Import Failed', `Could not import spreadsheet. This didn't count against your scan limit.\n\n${error.message}`);
    }
  };

  // Process spreadsheet with selected dealer template
  const processSpreadsheetWithDealer = async (rows, headers, dealerKey) => {
    try {
      const template = DEALER_TEMPLATES[dealerKey];
      if (__DEV__) console.log(`📊 Processing with template: ${template.name}`);

      // Build column finder for this template
      const findColumn = (possibleNames) => {
        if (!possibleNames) return -1;
        for (const name of possibleNames) {
          const index = headers.findIndex(h => h.includes(name.toLowerCase()));
          if (index !== -1) return index;
        }
        return -1;
      };

      // Map columns based on template
      const colMap = {
        productName: findColumn(template.columnMap.product),
        metal: findColumn(template.columnMap.metal || []),
        quantity: findColumn(template.columnMap.quantity),
        unitPrice: findColumn(template.columnMap.unitPrice),
        date: findColumn(template.columnMap.date),
        time: findColumn(template.columnMap.time || []),
        dealer: findColumn(template.columnMap.dealer || []),
        ozt: findColumn(template.columnMap.ozt || []),
        taxes: findColumn(template.columnMap.taxes || []),
        shipping: findColumn(template.columnMap.shipping || []),
        spotPrice: findColumn(template.columnMap.spotPrice || []),
        premium: findColumn(template.columnMap.premium || []),
      };

      // For dealer-specific templates, also check generic column names as fallback
      if (dealerKey !== 'generic' && dealerKey !== 'stacktracker') {
        const genericTemplate = DEALER_TEMPLATES['generic'];
        if (colMap.productName === -1) colMap.productName = findColumn(genericTemplate.columnMap.product);
        if (colMap.metal === -1) colMap.metal = findColumn(genericTemplate.columnMap.metal);
        if (colMap.quantity === -1) colMap.quantity = findColumn(genericTemplate.columnMap.quantity);
        if (colMap.unitPrice === -1) colMap.unitPrice = findColumn(genericTemplate.columnMap.unitPrice);
        if (colMap.date === -1) colMap.date = findColumn(genericTemplate.columnMap.date);
        if (colMap.ozt === -1) colMap.ozt = findColumn(genericTemplate.columnMap.ozt);
      }

      // Check if we have at least a product name column
      if (colMap.productName === -1) {
        Alert.alert(
          'Missing Columns',
          `Couldn't find a product name column in this ${template.name} export. This didn't count against your scan limit.\n\nExpected columns: ${template.columnMap.product?.join(', ')}`
        );
        return;
      }

      // Parse data rows
      const parsedData = [];
      let skippedCount = 0;

      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (!row || row.length === 0) continue;

        const productName = String(row[colMap.productName] || '').trim();
        if (!productName) continue;

        // Get metal from column or auto-detect from product name
        let metal = null;
        if (colMap.metal !== -1) {
          const metalRaw = String(row[colMap.metal] || '').toLowerCase().trim();
          metal = metalRaw.includes('gold') ? 'gold'
            : metalRaw.includes('silver') ? 'silver'
            : metalRaw.includes('platinum') ? 'platinum'
            : metalRaw.includes('palladium') ? 'palladium'
            : null;
        }
        if (!metal) {
          metal = detectMetalFromName(productName);
        }

        // Skip if we still can't determine the metal
        if (!metal) {
          if (__DEV__) console.log(`⏭️ Skipping (no metal detected): ${productName}`);
          skippedCount++;
          continue;
        }

        // Get OZT from column or auto-detect from product name
        let ozt = colMap.ozt !== -1 ? parseFloat(row[colMap.ozt]) : null;
        if (!ozt || ozt <= 0) {
          ozt = detectOztFromName(productName);
        }
        if (!ozt || ozt <= 0) {
          ozt = 1; // Default to 1 oz if can't detect
        }

        // Get dealer from column or use template's auto-dealer
        let source = '';
        if (colMap.dealer !== -1 && row[colMap.dealer]) {
          source = String(row[colMap.dealer]);
        } else if (template.autoDealer) {
          source = template.autoDealer;
        }

        // Parse other fields
        const quantity = colMap.quantity !== -1 ? (parseInt(row[colMap.quantity]) || 1) : 1;
        const unitPrice = colMap.unitPrice !== -1 ? (parseFloat(row[colMap.unitPrice]) || 0) : 0;
        const dateRaw = colMap.date !== -1 ? row[colMap.date] : null;
        const datePurchased = dateRaw ? parseDate(String(dateRaw)) : '';
        const timeRaw = colMap.time !== -1 ? row[colMap.time] : null;
        const timePurchased = timeRaw ? String(timeRaw).trim() : '';

        // Parse optional extra fields (Stack Tracker export has these)
        const taxes = colMap.taxes !== -1 ? (parseFloat(row[colMap.taxes]) || 0) : 0;
        const shipping = colMap.shipping !== -1 ? (parseFloat(row[colMap.shipping]) || 0) : 0;
        const spotPrice = colMap.spotPrice !== -1 ? (parseFloat(row[colMap.spotPrice]) || 0) : 0;
        const premium = colMap.premium !== -1 ? (parseFloat(row[colMap.premium]) || 0) : 0;

        parsedData.push({
          productName,
          metal,
          quantity,
          unitPrice,
          datePurchased,
          timePurchased,
          source,
          ozt,
          taxes,
          shipping,
          spotPrice,
          premium,
          autoDetected: {
            metal: colMap.metal === -1 || !row[colMap.metal],
            ozt: colMap.ozt === -1 || !row[colMap.ozt] || parseFloat(row[colMap.ozt]) <= 0,
          },
        });
      }

      if (parsedData.length === 0) {
        Alert.alert(
          'No Data Found',
          `No valid items found in spreadsheet.${skippedCount > 0 ? ` ${skippedCount} items skipped (couldn't detect metal type).` : ''}\n\nThis didn't count against your scan limit.`
        );
        return;
      }

      // Deduplicate within the CSV (same product name, quantity, unit price, date)
      const uniqueParsedData = [];
      const seenItems = new Set();
      let duplicatesInFile = 0;
      for (const item of parsedData) {
        const key = `${item.productName}|${item.quantity}|${item.unitPrice}|${item.datePurchased}`;
        if (!seenItems.has(key)) {
          seenItems.add(key);
          uniqueParsedData.push(item);
        } else {
          duplicatesInFile++;
        }
      }
      if (duplicatesInFile > 0 && __DEV__) {
        if (__DEV__) console.log(`🔄 Removed ${duplicatesInFile} duplicate rows from CSV`);
      }

      // Only increment scan count on successful parsing
      await incrementScanCount();

      // Clear pending file and dealer selector
      setPendingImportFile(null);
      setShowDealerSelector(false);
      setSelectedDealer(null);

      // Show preview
      setImportData(uniqueParsedData);
      setShowImportPreview(true);

      const message = skippedCount > 0
        ? `📊 Parsed ${uniqueParsedData.length} items from ${template.name} (${skippedCount} skipped${duplicatesInFile > 0 ? `, ${duplicatesInFile} duplicates removed` : ''})`
        : `📊 Parsed ${uniqueParsedData.length} items from ${template.name}${duplicatesInFile > 0 ? ` (${duplicatesInFile} duplicates removed)` : ''}`;
      if (__DEV__) console.log(message);

    } catch (error) {
      if (__DEV__) console.error('❌ Process spreadsheet error:', error);
      Alert.alert('Import Failed', `Could not process spreadsheet. This didn't count against your scan limit.\n\n${error.message}`);
    }
  };

  // Handle dealer selection from modal
  const handleDealerSelected = async (dealerKey) => {
    if (!pendingImportFile) return;
    await processSpreadsheetWithDealer(pendingImportFile.rows, pendingImportFile.headers, dealerKey);
  };

  const confirmImport = () => {
    try {
      let silverCount = 0;
      let goldCount = 0;
      let skippedDuplicates = 0;
      const newItems = [];

      // Build a set of existing items for duplicate detection
      const existingKeys = new Set();
      silverItems.forEach(item => {
        existingKeys.add(`silver|${item.productName}|${item.quantity}|${item.unitPrice}|${item.datePurchased || ''}`);
      });
      goldItems.forEach(item => {
        existingKeys.add(`gold|${item.productName}|${item.quantity}|${item.unitPrice}|${item.datePurchased || ''}`);
      });

      importData.forEach((item, index) => {
        // Check for duplicate against existing holdings
        const itemKey = `${item.metal}|${item.productName}|${item.quantity}|${item.unitPrice}|${item.datePurchased || ''}`;
        if (existingKeys.has(itemKey)) {
          skippedDuplicates++;
          if (__DEV__) console.log(`⏭️ Skipping duplicate: ${item.productName}`);
          return; // Skip this item
        }
        existingKeys.add(itemKey); // Prevent duplicates within the same import batch

        const newItem = {
          id: Date.now() + index,
          productName: item.productName,
          source: item.source,
          datePurchased: item.datePurchased,
          timePurchased: item.timePurchased || undefined,
          ozt: item.ozt,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          taxes: item.taxes || 0,
          shipping: item.shipping || 0,
          spotPrice: item.spotPrice || 0,
          premium: item.premium || 0,
        };

        const importSetters = { silver: setSilverItems, gold: setGoldItems, platinum: setPlatinumItems, palladium: setPalladiumItems };
        const metalKey = (item.metal || 'silver').toLowerCase();
        const setter = importSetters[metalKey] || setSilverItems;
        setter(prev => [...prev, newItem]);
        if (metalKey === 'silver') silverCount++;
        else if (metalKey === 'gold') goldCount++;
        newItems.push({ ...newItem, metal: metalKey });
      });

      // Sync to Supabase if signed in
      if (supabaseUser && newItems.length > 0) {
        (async () => {
          try {
            for (const item of newItems) {
              await addHolding(supabaseUser.id, item, item.metal);
            }
            if (__DEV__) console.log(`Synced ${newItems.length} imported items to Supabase`);
          } catch (err) {
            if (__DEV__) console.error('Failed to sync imported items to Supabase:', err);
          }
        })();
      }

      // Haptic feedback
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      const totalImported = newItems.length;
      const duplicateMsg = skippedDuplicates > 0 ? `\n(${skippedDuplicates} duplicate${skippedDuplicates > 1 ? 's' : ''} skipped)` : '';

      Alert.alert(
        'Import Successful',
        `Imported ${totalImported} items${duplicateMsg}`,
        [{ text: 'Great!', onPress: () => {
          setShowImportPreview(false);
          setImportData([]);
          setMetalTab('both');
        }}]
      );
    } catch (error) {
      if (__DEV__) console.error('❌ Confirm import error:', error);
      Alert.alert('Import Failed', error.message);
    }
  };

  // Add all scanned items at once
  const confirmScannedItems = () => {
    try {
      let silverCount = 0;
      let goldCount = 0;
      const newItems = [];

      scannedItems.forEach((item, index) => {
        const newItem = {
          id: Date.now() + index,
          productName: item.productName,
          source: item.source,
          datePurchased: item.datePurchased,
          timePurchased: item.timePurchased || undefined,
          ozt: item.ozt,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          taxes: item.taxes,
          shipping: item.shipping,
          spotPrice: item.spotPrice,
          premium: item.premium,
        };

        const scanSetters = { silver: setSilverItems, gold: setGoldItems, platinum: setPlatinumItems, palladium: setPalladiumItems };
        const metalKey = (item.metal || 'silver').toLowerCase();
        const setter = scanSetters[metalKey] || setSilverItems;
        setter(prev => [...prev, newItem]);
        if (metalKey === 'silver') silverCount++;
        else if (metalKey === 'gold') goldCount++;
        newItems.push({ ...newItem, metal: metalKey });
      });

      // Sync to Supabase if signed in
      if (supabaseUser && newItems.length > 0) {
        (async () => {
          try {
            for (const item of newItems) {
              await addHolding(supabaseUser.id, item, item.metal);
            }
            if (__DEV__) console.log(`Synced ${newItems.length} scanned items to Supabase`);
          } catch (err) {
            if (__DEV__) console.error('Failed to sync scanned items to Supabase:', err);
          }
        })();
      }

      // Haptic feedback
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      Alert.alert(
        'Items Added Successfully',
        `Added ${scannedItems.length} item${scannedItems.length > 1 ? 's' : ''} from receipt`,
        [{ text: 'Great!', onPress: () => {
          setShowScannedItemsPreview(false);
          setScannedItems([]);
          setScannedMetadata({ purchaseDate: '', purchaseTime: '', dealer: '' });
          setMetalTab('both');
          setCurrentScreen('MyStack');
        }}]
      );
    } catch (error) {
      if (__DEV__) console.error('❌ Add scanned items error:', error);
      Alert.alert('Add Failed', error.message);
    }
  };

  // Add a single scanned item and go to next or close
  const addScannedItemIndividually = (index) => {
    const item = scannedItems[index];
    const newItem = {
      id: Date.now(),
      productName: item.productName,
      source: item.source,
      datePurchased: item.datePurchased,
      timePurchased: item.timePurchased || undefined,
      ozt: item.ozt,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      taxes: item.taxes,
      shipping: item.shipping,
      spotPrice: item.spotPrice,
      premium: item.premium,
    };

    if (item.metal === 'silver') {
      setSilverItems(prev => [...prev, newItem]);
    } else {
      setGoldItems(prev => [...prev, newItem]);
    }

    // Remove this item from scannedItems
    const remainingItems = scannedItems.filter((_, i) => i !== index);
    setScannedItems(remainingItems);

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    // If no more items, close the modal
    if (remainingItems.length === 0) {
      Alert.alert('All Items Added', 'All scanned items have been added to your holdings!', [
        { text: 'View Holdings', onPress: () => {
          setShowScannedItemsPreview(false);
          setCurrentScreen('MyStack');
        }}
      ]);
    }
  };

  // Update scanned item price inline (with auto-recalculation)
  const updateScannedItemPrice = (index, field, value) => {
    const updatedItems = [...scannedItems];
    const item = updatedItems[index];
    const numValue = parseFloat(value) || 0;
    const qty = item.quantity || 1;

    if (field === 'unitPrice') {
      // User edited unit price - recalculate ext price
      item.unitPrice = numValue;
      item.extPrice = Math.round(numValue * qty * 100) / 100;
    } else if (field === 'extPrice') {
      // User edited ext price - recalculate unit price
      item.extPrice = numValue;
      item.unitPrice = Math.round((numValue / qty) * 100) / 100;
    }

    // Recalculate premium
    if (item.unitPrice > 0 && item.spotPrice > 0 && item.ozt > 0) {
      item.premium = Math.round((item.unitPrice - (item.spotPrice * item.ozt)) * 100) / 100;

      // Clear warning if price is now valid (at or above spot value)
      const minExpectedPrice = item.spotPrice * item.ozt;
      if (item.unitPrice >= minExpectedPrice) {
        item.priceWarning = null;
      }
    }

    setScannedItems(updatedItems);
  };

  // Edit a scanned item before adding
  const editScannedItem = (index) => {
    const item = scannedItems[index];

    // Calculate default cost basis
    const defaultCostBasis = (item.unitPrice * item.quantity) + item.taxes + item.shipping;

    // Pre-fill form with scanned item data
    setForm({
      productName: item.productName,
      source: item.source,
      datePurchased: item.datePurchased,
      ozt: item.ozt.toString(),
      quantity: item.quantity.toString(),
      unitPrice: item.unitPrice.toString(),
      taxes: item.taxes.toString(),
      shipping: item.shipping.toString(),
      spotPrice: item.spotPrice.toString(),
      premium: item.premium.toString(),
      costBasis: item.costBasis ? item.costBasis.toString() : defaultCostBasis.toString(),
    });
    setSpotPriceSource(null); // Clear source warning when editing

    // Set metal tab
    setMetalTab(item.metal);

    // Store the index so we can update it after editing
    setEditingItem({ ...item, scannedIndex: index });
    setFormErrors({});

    // Close preview modal and open edit modal
    setShowScannedItemsPreview(false);
    setShowAddModal(true);
  };

  // Edit an imported item before confirming import
  const editImportedItem = (index) => {
    const item = importData[index];

    // Calculate default cost basis
    const unitPrice = item.unitPrice || 0;
    const quantity = item.quantity || 1;
    const defaultCostBasis = unitPrice * quantity;

    // Pre-fill form with imported item data
    setForm({
      productName: item.productName || '',
      source: item.source || '',
      datePurchased: item.datePurchased || '',
      ozt: item.ozt ? item.ozt.toString() : '',
      quantity: item.quantity ? item.quantity.toString() : '',
      unitPrice: item.unitPrice ? item.unitPrice.toString() : '',
      taxes: '',
      shipping: '',
      spotPrice: '0',
      premium: '0',
      costBasis: defaultCostBasis.toString(),
    });
    setSpotPriceSource(null); // Clear source warning when editing

    // Set metal tab
    setMetalTab(item.metal || 'silver');

    // Store the index so we can update it after editing
    setEditingItem({ ...item, importIndex: index });
    setFormErrors({});

    // Close preview modal and open edit modal
    setShowImportPreview(false);
    setShowAddModal(true);
  };

  // ============================================
  // CRUD OPERATIONS
  // ============================================

  const savePurchase = () => {
    Keyboard.dismiss();

    const errors = {};
    if (!form.productName) errors.productName = true;
    if (!form.ozt || parseFloat(form.ozt) <= 0) errors.ozt = true;
    if (!form.quantity || parseInt(form.quantity) <= 0) errors.quantity = true;
    if (!form.unitPrice || parseFloat(form.unitPrice) <= 0) errors.unitPrice = true;
    setFormErrors(errors);
    if (Object.keys(errors).length > 0) {
      const names = [];
      if (errors.productName) names.push('Product Name');
      if (errors.ozt) names.push('OZT per unit');
      if (errors.quantity) names.push('Quantity');
      if (errors.unitPrice) names.push('Unit Price');
      Alert.alert('Required Fields', `Please fill in: ${names.join(', ')}`);
      return;
    }

    const item = {
      id: editingItem?.id || Date.now(),
      productName: form.productName, source: form.source, datePurchased: form.datePurchased,
      timePurchased: form.timePurchased || undefined, // Optional time field
      ozt: parseFloat(form.ozt) || 0, quantity: parseInt(form.quantity) || 1,
      unitPrice: parseFloat(form.unitPrice) || 0, taxes: parseFloat(form.taxes) || 0,
      shipping: parseFloat(form.shipping) || 0, spotPrice: parseFloat(form.spotPrice) || 0,
      premium: parseFloat(form.premium) || 0,
      costBasis: form.costBasis ? parseFloat(form.costBasis) : undefined,
    };

    // Check if editing a scanned item
    if (editingItem && editingItem.scannedIndex !== undefined) {
      // Update the scanned item and return to preview
      const updatedItem = {
        ...item,
        metal: metalTab,
      };

      const updatedScannedItems = [...scannedItems];
      updatedScannedItems[editingItem.scannedIndex] = updatedItem;
      setScannedItems(updatedScannedItems);

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      resetForm();
      setShowAddModal(false);
      setShowScannedItemsPreview(true);
      return;
    }

    // Check if editing an imported item
    if (editingItem && editingItem.importIndex !== undefined) {
      // Update the imported item and return to preview
      const updatedItem = {
        productName: form.productName,
        source: form.source,
        datePurchased: form.datePurchased,
        ozt: parseFloat(form.ozt) || 0,
        quantity: parseInt(form.quantity) || 1,
        unitPrice: parseFloat(form.unitPrice) || 0,
        metal: metalTab,
      };

      const updatedImportData = [...importData];
      updatedImportData[editingItem.importIndex] = updatedItem;
      setImportData(updatedImportData);

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      resetForm();
      setShowAddModal(false);
      setShowImportPreview(true);
      return;
    }

    // Normal add/edit flow for holdings
    // IMPORTANT: metalTab can be 'silver', 'gold', 'platinum', 'palladium', or 'both' - we must check explicitly
    const targetMetal = metalTab === 'both' ? 'silver' : metalTab; // Default to silver if 'both' (shouldn't happen but safety)

    const settersMap = {
      silver: setSilverItems,
      gold: setGoldItems,
      platinum: setPlatinumItems,
      palladium: setPalladiumItems,
    };
    const setter = settersMap[targetMetal] || setSilverItems;

    if (editingItem) {
      setter(prev => prev.map(i => i.id === editingItem.id ? item : i));
    } else {
      setter(prev => [...prev, item]);
      checkAndRequestReview('holdings');
    }

    // Sync to Supabase if signed in
    if (supabaseUser) {
      (async () => {
        try {
          if (editingItem && editingItem.supabase_id) {
            // Update existing item in Supabase
            await updateHolding(editingItem.supabase_id, item, targetMetal);
            if (__DEV__) console.log('Updated holding in Supabase');
          } else if (editingItem) {
            // Editing a local item that might exist in Supabase - find it first
            const existingHolding = await findHoldingByLocalId(supabaseUser.id, item.id, targetMetal);
            if (existingHolding) {
              await updateHolding(existingHolding.id, item, targetMetal);
              if (__DEV__) console.log('Updated existing holding in Supabase');
            } else {
              // Not in Supabase yet, add it
              const { data } = await addHolding(supabaseUser.id, item, targetMetal);
              if (data && __DEV__) console.log('Added holding to Supabase (was local only)');
            }
          } else {
            // New item - add to Supabase
            const { data } = await addHolding(supabaseUser.id, item, targetMetal);
            if (data && __DEV__) console.log('Added new holding to Supabase');
          }
        } catch (err) {
          if (__DEV__) console.error('Failed to sync holding to Supabase:', err);
          // Don't block the user - local save already succeeded
        }
      })();
    }

    // Haptic feedback on successful add
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    resetForm();
    setShowAddModal(false);
  };

  const resetForm = () => {
    setForm({
      productName: '', source: '', datePurchased: '', timePurchased: '', ozt: '',
      quantity: '', unitPrice: '', taxes: '', shipping: '',
      spotPrice: '', premium: '0', costBasis: '',
    });
    setEditingItem(null);
    setSpotPriceSource(null);
    setHistoricalSpotSuggestion(null);
    setFormErrors({});
  };

  const deleteItem = (id, metal) => {
    // Haptic feedback
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    // Find the item to get its supabase_id if it exists
    const itemsMap = { silver: silverItems, gold: goldItems, platinum: platinumItems, palladium: palladiumItems };
    const items = itemsMap[metal] || silverItems;
    const itemToDelete = items.find(i => i.id === id);

    Alert.alert(
      'Delete Item',
      'Are you sure you want to delete this item? This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            // Haptic feedback on delete
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);

            const settersMap = { silver: setSilverItems, gold: setGoldItems, platinum: setPlatinumItems, palladium: setPalladiumItems };
            const setter = settersMap[metal] || setSilverItems;
            setter(prev => prev.filter(i => i.id !== id));

            // Delete from Supabase if signed in
            if (supabaseUser && itemToDelete) {
              try {
                if (itemToDelete.supabase_id) {
                  await deleteHoldingFromSupabase(itemToDelete.supabase_id);
                  if (__DEV__) console.log('Deleted holding from Supabase');
                } else {
                  // Find in Supabase by local_id
                  const existingHolding = await findHoldingByLocalId(supabaseUser.id, id, metal);
                  if (existingHolding) {
                    await deleteHoldingFromSupabase(existingHolding.id);
                    if (__DEV__) console.log('Deleted holding from Supabase (found by local_id)');
                  }
                }
              } catch (err) {
                if (__DEV__) console.error('Failed to delete holding from Supabase:', err);
                // Don't block - local delete already succeeded
              }
            }

            // Close detail view if open
            if (showDetailView) {
              setShowDetailView(false);
              setDetailItem(null);
              setDetailMetal(null);
            }
          },
        },
      ]
    );
  };

  const viewItemDetail = (item, metal) => {
    setDetailItem(item);
    setDetailMetal(metal);
    setShowDetailView(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const sortItems = (items, metal) => {
    const itemsWithMetal = items.map(item => ({ ...item, metal }));
    const spotMap = { silver: silverSpot, gold: goldSpot, platinum: platinumSpot, palladium: palladiumSpot };
    const spot = spotMap[metal] || silverSpot;

    switch (sortBy) {
      case 'date-newest':
        return [...itemsWithMetal].sort((a, b) => {
          if (!a.datePurchased) return 1;
          if (!b.datePurchased) return -1;
          return new Date(b.datePurchased) - new Date(a.datePurchased);
        });
      case 'date-oldest':
        return [...itemsWithMetal].sort((a, b) => {
          if (!a.datePurchased) return 1;
          if (!b.datePurchased) return -1;
          return new Date(a.datePurchased) - new Date(b.datePurchased);
        });
      case 'value-high':
        return [...itemsWithMetal].sort((a, b) => (b.ozt * b.quantity * spot) - (a.ozt * a.quantity * spot));
      case 'value-low':
        return [...itemsWithMetal].sort((a, b) => (a.ozt * a.quantity * spot) - (b.ozt * b.quantity * spot));
      case 'name':
        return [...itemsWithMetal].sort((a, b) => a.productName.localeCompare(b.productName));
      case 'metal':
        // Already filtered by metal in most cases
        return itemsWithMetal;
      default:
        return itemsWithMetal;
    }
  };

  const editItem = async (item, metal) => {
    setMetalTab(metal);
    // Calculate default cost basis if not set
    const defaultCostBasis = (item.unitPrice * item.quantity) + item.taxes + item.shipping;
    setForm({
      productName: item.productName, source: item.source, datePurchased: item.datePurchased,
      timePurchased: item.timePurchased || '',
      ozt: item.ozt.toString(), quantity: item.quantity.toString(), unitPrice: item.unitPrice.toString(),
      taxes: item.taxes.toString(), shipping: item.shipping.toString(), spotPrice: item.spotPrice.toString(),
      premium: item.premium.toString(),
      costBasis: item.costBasis ? item.costBasis.toString() : defaultCostBasis.toString(),
    });
    setEditingItem(item);
    setSpotPriceSource(null); // Clear source warning when editing existing item
    setHistoricalSpotSuggestion(null); // Clear any previous suggestion
    setFormErrors({});
    setShowAddModal(true);

    // Always fetch historical spot price if date is present (for comparison/auto-fill)
    const spotPrice = item.spotPrice || 0;
    const hasDate = item.datePurchased && item.datePurchased.length === 10;

    if (hasDate) {
      const result = await fetchHistoricalSpot(item.datePurchased, metal, item.timePurchased);
      if (result.price) {
        // Always store suggestion for comparison (enables warning display)
        setHistoricalSpotSuggestion({
          price: result.price,
          source: result.source,
          date: item.datePurchased,
        });

        // Auto-fill only if no spot price recorded
        if (spotPrice === 0) {
          setForm(prev => ({ ...prev, spotPrice: result.price.toString() }));
          setSpotPriceSource(result.source);
        }
        // If spotPrice exists, the warning will auto-show if difference > 10%
      }
    }
  };

  // PDF Stack Ledger Export — Gold/Lifetime only
  const requestLedgerExport = () => {
    if (!hasGoldAccess) {
      setShowPaywallModal(true);
      return;
    }
    const total = silverItems.length + goldItems.length + platinumItems.length + palladiumItems.length;
    if (total === 0) {
      Alert.alert('No Holdings', 'Add holdings first, then export your ledger.');
      return;
    }
    setLedgerPinDigits(['', '', '', '']);
    setShowLedgerPinModal(true);
    setTimeout(() => ledgerPinRefs.current[0]?.focus(), 200);
  };

  const generateStackLedger = async (pin) => {
    setLedgerGenerating(true);
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');

      const allHoldings = [
        ...goldItems.map(i => ({ ...i, metal: 'Gold', spot: goldSpot })),
        ...silverItems.map(i => ({ ...i, metal: 'Silver', spot: silverSpot })),
        ...platinumItems.map(i => ({ ...i, metal: 'Platinum', spot: platinumSpot })),
        ...palladiumItems.map(i => ({ ...i, metal: 'Palladium', spot: palladiumSpot })),
      ];

      // Compute totals
      let totalCost = 0;
      let totalValue = 0;
      allHoldings.forEach(h => {
        const totalOz = (parseFloat(h.ozt) || 0) * (parseInt(h.quantity) || 1);
        const cost = ((parseFloat(h.unitPrice) || 0) * (parseInt(h.quantity) || 1)) + (parseFloat(h.taxes) || 0) + (parseFloat(h.shipping) || 0);
        const value = totalOz * (h.spot || 0);
        totalCost += cost;
        totalValue += value;
      });
      const totalPL = totalValue - totalCost;
      const plPct = totalCost > 0 ? (totalPL / totalCost) * 100 : 0;

      const pdfDoc = await PDFDocument.create();
      pdfDoc.setTitle('TroyStack Stack Ledger');
      pdfDoc.setAuthor('TroyStack');
      pdfDoc.setSubject(`Stack ledger (Ref: ${pin})`);
      pdfDoc.setCreator(`TroyStack v${appVersion}`);
      pdfDoc.setKeywords(['troystack', 'ledger', `ref-${pin}`]);

      const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

      const gold = rgb(0.788, 0.659, 0.298); // #C9A84C
      const dark = rgb(0.1, 0.1, 0.1);
      const muted = rgb(0.45, 0.45, 0.45);
      const lightGray = rgb(0.96, 0.96, 0.96);
      const green = rgb(0.16, 0.65, 0.27);
      const red = rgb(0.85, 0.18, 0.18);

      const today = new Date();
      const dateStr = today.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
      const fileDate = today.toISOString().split('T')[0];

      const PAGE_W = 612, PAGE_H = 792, MARGIN = 50;
      let page = pdfDoc.addPage([PAGE_W, PAGE_H]);
      let y = PAGE_H - MARGIN;

      // Header
      page.drawText('TroyStack', { x: MARGIN, y, size: 24, font: helveticaBold, color: gold });
      page.drawText('Stack Ledger', { x: MARGIN + 110, y: y + 2, size: 18, font: helvetica, color: dark });
      y -= 20;
      page.drawText(`Generated ${dateStr}`, { x: MARGIN, y, size: 10, font: helvetica, color: muted });
      y -= 30;

      // Summary box
      page.drawRectangle({ x: MARGIN, y: y - 90, width: PAGE_W - MARGIN * 2, height: 90, color: lightGray, borderColor: gold, borderWidth: 1 });
      page.drawText('Portfolio Summary', { x: MARGIN + 12, y: y - 18, size: 12, font: helveticaBold, color: dark });

      const summaryItems = [
        { label: 'Total Value', value: `$${totalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` },
        { label: 'Cost Basis', value: `$${totalCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` },
        { label: 'Unrealized P/L', value: `${totalPL >= 0 ? '+' : ''}$${totalPL.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (${plPct >= 0 ? '+' : ''}${plPct.toFixed(2)}%)`, color: totalPL >= 0 ? green : red },
        { label: 'Holdings', value: `${allHoldings.length} item${allHoldings.length === 1 ? '' : 's'}` },
      ];
      let sy = y - 38;
      summaryItems.forEach(item => {
        page.drawText(item.label + ':', { x: MARGIN + 12, y: sy, size: 10, font: helvetica, color: muted });
        page.drawText(item.value, { x: MARGIN + 110, y: sy, size: 10, font: helveticaBold, color: item.color || dark });
        sy -= 14;
      });
      y -= 110;

      // Holdings table
      page.drawText('Holdings', { x: MARGIN, y, size: 14, font: helveticaBold, color: dark });
      y -= 18;

      // Table headers
      const colX = { metal: MARGIN, product: MARGIN + 60, oz: MARGIN + 260, qty: MARGIN + 310, cost: MARGIN + 350, value: MARGIN + 420, pl: MARGIN + 490 };
      page.drawRectangle({ x: MARGIN, y: y - 4, width: PAGE_W - MARGIN * 2, height: 16, color: gold });
      const hdrColor = rgb(1, 1, 1);
      page.drawText('Metal', { x: colX.metal + 4, y: y, size: 9, font: helveticaBold, color: hdrColor });
      page.drawText('Product', { x: colX.product + 4, y: y, size: 9, font: helveticaBold, color: hdrColor });
      page.drawText('Oz', { x: colX.oz + 4, y: y, size: 9, font: helveticaBold, color: hdrColor });
      page.drawText('Qty', { x: colX.qty + 4, y: y, size: 9, font: helveticaBold, color: hdrColor });
      page.drawText('Cost', { x: colX.cost + 4, y: y, size: 9, font: helveticaBold, color: hdrColor });
      page.drawText('Value', { x: colX.value + 4, y: y, size: 9, font: helveticaBold, color: hdrColor });
      page.drawText('P/L', { x: colX.pl + 4, y: y, size: 9, font: helveticaBold, color: hdrColor });
      y -= 18;

      // Table rows
      for (let i = 0; i < allHoldings.length; i++) {
        if (y < MARGIN + 60) {
          page = pdfDoc.addPage([PAGE_W, PAGE_H]);
          y = PAGE_H - MARGIN;
        }
        const h = allHoldings[i];
        const qty = parseInt(h.quantity) || 1;
        const ozEach = parseFloat(h.ozt) || 0;
        const totalOz = ozEach * qty;
        const cost = ((parseFloat(h.unitPrice) || 0) * qty) + (parseFloat(h.taxes) || 0) + (parseFloat(h.shipping) || 0);
        const value = totalOz * (h.spot || 0);
        const pl = value - cost;

        if (i % 2 === 0) {
          page.drawRectangle({ x: MARGIN, y: y - 3, width: PAGE_W - MARGIN * 2, height: 14, color: lightGray });
        }
        const productName = (h.productName || '').substring(0, 32);
        page.drawText(h.metal, { x: colX.metal + 4, y, size: 8, font: helvetica, color: dark });
        page.drawText(productName, { x: colX.product + 4, y, size: 8, font: helvetica, color: dark });
        page.drawText(totalOz.toFixed(2), { x: colX.oz + 4, y, size: 8, font: helvetica, color: dark });
        page.drawText(String(qty), { x: colX.qty + 4, y, size: 8, font: helvetica, color: dark });
        page.drawText(`$${cost.toFixed(0)}`, { x: colX.cost + 4, y, size: 8, font: helvetica, color: dark });
        page.drawText(`$${value.toFixed(0)}`, { x: colX.value + 4, y, size: 8, font: helvetica, color: dark });
        page.drawText(`${pl >= 0 ? '+' : ''}$${pl.toFixed(0)}`, { x: colX.pl + 4, y, size: 8, font: helvetica, color: pl >= 0 ? green : red });
        y -= 14;
      }

      // Footer on last page
      const footerY = MARGIN - 20;
      page.drawText('Generated by TroyStack — troystack.com', { x: MARGIN, y: footerY, size: 8, font: helvetica, color: muted });

      const pdfBytes = await pdfDoc.save();

      // Convert Uint8Array to base64
      let binary = '';
      const chunkSize = 8192;
      for (let i = 0; i < pdfBytes.length; i += chunkSize) {
        binary += String.fromCharCode.apply(null, pdfBytes.subarray(i, i + chunkSize));
      }
      const base64 = btoa(binary);

      const fileUri = `${FileSystem.documentDirectory}TroyStack_Ledger_${fileDate}.pdf`;
      await FileSystem.writeAsStringAsync(fileUri, base64, { encoding: FileSystem.EncodingType.Base64 });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowLedgerPinModal(false);
      setLedgerGenerating(false);

      await Sharing.shareAsync(fileUri, { mimeType: 'application/pdf', dialogTitle: 'Save TroyStack Ledger' });
    } catch (error) {
      console.error('Ledger export error:', error);
      setLedgerGenerating(false);
      Alert.alert('Export Failed', error.message || 'Could not generate ledger.');
    }
  };

  const exportCSV = async () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      const all = [
        ...silverItems.map(i => ({ ...i, metal: 'Silver' })),
        ...goldItems.map(i => ({ ...i, metal: 'Gold' })),
        ...platinumItems.map(i => ({ ...i, metal: 'Platinum' })),
        ...palladiumItems.map(i => ({ ...i, metal: 'Palladium' })),
      ];

      if (all.length === 0) {
        Alert.alert('No Data', 'You have no holdings to export.');
        return;
      }

      const headers = 'Metal,Product,Source,Date,Time,OZT,Qty,Unit Price,Taxes,Shipping,Spot,Premium,Total Premium\n';
      const rows = all.map(i =>
        `${i.metal},"${i.productName}","${i.source}",${i.datePurchased},${i.timePurchased || ''},${i.ozt},${i.quantity},${i.unitPrice},${i.taxes},${i.shipping},${i.spotPrice},${i.premium},${i.premium * i.quantity}`
      ).join('\n');

      const filepath = `${FileSystem.documentDirectory}stack-export-${Date.now()}.csv`;
      await FileSystem.writeAsStringAsync(filepath, headers + rows);
      await Sharing.shareAsync(filepath);

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      if (__DEV__) console.error('Export CSV error:', error);
      Alert.alert('Export Failed', error.message || 'Could not export CSV file.');
    }
  };

  // ============================================
  // SHARE MY STACK
  // ============================================
  const shareMyStack = async () => {
    try {
      if (!shareViewRef.current) {
        Alert.alert('Error', 'Unable to generate share image');
        return;
      }

      setIsGeneratingShare(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      // Brief delay to ensure view is rendered
      await new Promise(resolve => setTimeout(resolve, 100));

      // Capture the view as an image
      const uri = await shareViewRef.current.capture();

      // Share the image
      await Sharing.shareAsync(uri, {
        mimeType: 'image/png',
        dialogTitle: 'Share My Stack',
        UTI: 'public.png',
      });

      setIsGeneratingShare(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      if (__DEV__) console.error('Share My Stack error:', error);
      setIsGeneratingShare(false);
      Alert.alert('Share Failed', error.message || 'Could not generate share image.');
    }
  };

  // ============================================
  // LOADING & AUTH SCREENS
  // ============================================

  // Helper to enable guest mode (session-only — not persisted, so reopening app shows auth screen)
  const enableGuestMode = () => {
    setGuestMode(true);
  };

  // Helper to disable guest mode (when user signs in)
  const disableGuestMode = async () => {
    setGuestMode(false);
    try {
      await AsyncStorage.removeItem('stack_guest_mode');
    } catch (error) {
      if (__DEV__) console.error('Failed to remove guest mode:', error);
    }
  };

  // Handle successful auth from AuthScreen
  // If guest had in-memory holdings, they'll be persisted now that guestMode is false
  // (the save effects trigger when guestMode changes)
  const handleAuthSuccess = () => {
    setShowAuthScreen(false);
    disableGuestMode();
    setNeedsPostSignInSync(true); // Show loading until sync completes
  };

  // Show reset password screen when opened via deep link
  // ============================================
  // DRAWER SIDEBAR
  // ============================================

  // Sidebar nav items with custom icon components
  const sidebarNavItems = [
    { key: 'TroyChat', label: 'Troy', subtitle: 'Home', iconType: 'troy' },
    { key: 'Dashboard', label: 'Dashboard', iconType: 'today' },
    { key: 'MyStack', label: 'My Stack', iconType: 'holdings' },
    { key: 'Analytics', label: 'Analytics', iconType: 'analytics' },
    { key: 'StackSignal', label: 'Stack Signal', iconType: 'signal' },
    { key: 'VaultWatch', label: 'Vault Watch', iconType: 'trending' },
    { key: 'CompareDealers', label: 'Compare Dealers', iconType: 'calculator' },
  ];

  // Helper: navigate to a screen from the sidebar
  const sidebarNavigate = (screenKey) => {
    if (screenKey === 'VaultWatch') {
      // Vault Watch is a section within Dashboard — navigate there and scroll
      setCurrentScreen('Dashboard');
      drawerNavigation?.dispatch(DrawerActions.closeDrawer());
      setTimeout(() => {
        const y = sectionOffsets.current['vaultWatch'];
        if (y !== undefined) scrollRef.current?.scrollTo({ y: Math.max(0, y - 10), animated: true });
      }, 200);
      return;
    }
    if (screenKey === 'CompareDealers') {
      setShowDealerPrices(false); // Close overlay if it was open
      setCurrentScreen('CompareDealers');
      drawerNavigation?.dispatch(DrawerActions.closeDrawer());
      return;
    }
    setCurrentScreen(screenKey);
    drawerNavigation?.dispatch(DrawerActions.closeDrawer());
    setTimeout(() => scrollRef.current?.scrollTo({ y: 0, animated: false }), 50);
  };

  // Group conversations by date
  const groupConversationsByDate = (convos) => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
    const weekAgo = new Date(today); weekAgo.setDate(today.getDate() - 7);
    const groups = [];
    const todayItems = [], yesterdayItems = [], weekItems = [], earlierItems = [];
    for (const c of convos) {
      const d = new Date(c.updated_at || c.created_at);
      if (d >= today) todayItems.push(c);
      else if (d >= yesterday) yesterdayItems.push(c);
      else if (d >= weekAgo) weekItems.push(c);
      else earlierItems.push(c);
    }
    if (todayItems.length) groups.push({ label: 'Today', items: todayItems });
    if (yesterdayItems.length) groups.push({ label: 'Yesterday', items: yesterdayItems });
    if (weekItems.length) groups.push({ label: 'This Week', items: weekItems });
    if (earlierItems.length) groups.push({ label: 'Earlier', items: earlierItems });
    return groups;
  };

  // CustomSidebar — rendered by React Navigation drawer
  const renderCustomSidebar = useCallback((drawerProps) => {
    // Store drawer navigation for use in header ☰ button
    if (drawerProps.navigation && !drawerNavigation) {
      setDrawerNavigation(drawerProps.navigation);
    }

    console.log('[Troy] Sidebar rendering, conversations:', troyConversations.length);
    const conversationGroups = groupConversationsByDate(troyConversations);
    const isGoldUser = hasGoldAccess;

    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#0A0A0E' }}>
        {/* Section A — New Chat */}
        <View style={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12 }}>
          <TouchableOpacity
            onPress={() => {
              startNewConversation();
              setCurrentScreen('TroyChat');
              drawerProps.navigation.closeDrawer();
            }}
            style={{ backgroundColor: '#C9A84C', borderRadius: 10, paddingVertical: 12, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 }}
          >
            <Text style={{ color: '#000', fontSize: 18, fontWeight: '700' }}>+</Text>
            <Text style={{ color: '#000', fontWeight: '700', fontSize: 15 }}>New Chat</Text>
          </TouchableOpacity>
        </View>

        <View style={{ height: 0.5, backgroundColor: 'rgba(255,255,255,0.1)', marginHorizontal: 16 }} />

        {/* Section B — Navigation */}
        <View style={{ paddingVertical: 8 }}>
          {sidebarNavItems.map((item) => {
            const isActive = currentScreen === item.key;
            const iconColor = isActive ? '#C9A84C' : '#9ca3af';
            const renderIcon = () => {
              switch (item.iconType) {
                case 'troy': return <Image source={TROY_AVATAR} style={{ width: 22, height: 22, borderRadius: 11, opacity: isActive ? 1 : 0.7 }} />;
                case 'today': return <TodayIcon size={20} color={iconColor} />;
                case 'holdings': return <HoldingsIcon size={20} color={iconColor} />;
                case 'analytics': return <DashboardIcon size={20} color={iconColor} />;
                case 'signal': return <StackSignalIcon size={16} color={iconColor} />;
                case 'trending': return <TrendingUpIcon size={20} color={iconColor} />;
                case 'calculator': return <CalculatorIcon size={20} color={iconColor} />;
                default: return <View style={{ width: 20 }} />;
              }
            };
            return (
              <TouchableOpacity
                key={item.key}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  sidebarNavigate(item.key);
                }}
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: 12,
                  paddingHorizontal: 16, height: 44,
                  backgroundColor: isActive ? 'rgba(201,168,76,0.1)' : 'transparent',
                }}
              >
                <View style={{ width: 24, alignItems: 'center' }}>{renderIcon()}</View>
                <View>
                  <Text style={{ color: isActive ? '#C9A84C' : '#d4d4d8', fontSize: 15, fontWeight: isActive ? '600' : '400' }}>{item.label}</Text>
                  {item.subtitle && <Text style={{ color: isActive ? 'rgba(201,168,76,0.6)' : '#52525b', fontSize: 11 }}>{item.subtitle}</Text>}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={{ height: 0.5, backgroundColor: 'rgba(255,255,255,0.1)', marginHorizontal: 16 }} />

        {/* Section C — Recent Conversations */}
        <View style={{ flex: 1 }}>
          <Text style={{ color: '#71717a', fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 }}>Recents</Text>
          <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
            {troyConversations.length === 0 ? (
              <Text style={{ color: '#52525b', fontSize: 13, textAlign: 'center', marginTop: 20, paddingHorizontal: 16 }}>No conversations yet. Tap + to start.</Text>
            ) : isGoldUser ? (
              conversationGroups.map((group) => (
                <View key={group.label}>
                  <Text style={{ color: '#52525b', fontSize: 11, fontWeight: '600', paddingHorizontal: 16, paddingTop: 10, paddingBottom: 4 }}>{group.label}</Text>
                  {group.items.map((conv) => (
                    <TouchableOpacity
                      key={conv.id}
                      onPress={() => {
                        loadConversation(conv.id);
                        setCurrentScreen('TroyChat');
                        drawerProps.navigation.closeDrawer();
                      }}
                      onLongPress={() => {
                        Alert.alert('Delete Conversation', 'Are you sure?', [
                          { text: 'Cancel', style: 'cancel' },
                          { text: 'Delete', style: 'destructive', onPress: () => deleteConversation(conv.id) },
                        ]);
                      }}
                      style={{
                        flexDirection: 'row', alignItems: 'center', gap: 10,
                        paddingHorizontal: 16, paddingVertical: 10,
                        backgroundColor: conv.id === activeConversationId ? 'rgba(201,168,76,0.08)' : 'transparent',
                      }}
                    >
                      <Image source={TROY_AVATAR} style={{ width: 20, height: 20, borderRadius: 10 }} />
                      <Text style={{ color: conv.id === activeConversationId ? '#C9A84C' : '#a1a1aa', fontSize: 14, flex: 1 }} numberOfLines={1}>
                        {conv.title || 'New conversation'}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              ))
            ) : (
              // Free users: show last 3, then upgrade CTA
              <>
                {troyConversations.slice(0, 3).map((conv) => (
                  <TouchableOpacity
                    key={conv.id}
                    onPress={() => {
                      loadConversation(conv.id);
                      setCurrentScreen('TroyChat');
                      drawerProps.navigation.closeDrawer();
                    }}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 10, opacity: 0.6 }}
                  >
                    <Image source={TROY_AVATAR} style={{ width: 20, height: 20, borderRadius: 10 }} />
                    <Text style={{ color: '#a1a1aa', fontSize: 14, flex: 1 }} numberOfLines={1}>{conv.title || 'New conversation'}</Text>
                  </TouchableOpacity>
                ))}
                {troyConversations.length > 3 && (
                  <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
                    <Text style={{ color: '#71717a', fontSize: 13, lineHeight: 18 }}>
                      You had {troyConversations.length} conversations with Troy. Upgrade to Gold to save and resume them.
                    </Text>
                    <TouchableOpacity
                      onPress={() => { drawerProps.navigation.closeDrawer(); setShowPaywallModal(true); }}
                      style={{ marginTop: 8, backgroundColor: '#C9A84C', borderRadius: 8, paddingVertical: 10, alignItems: 'center' }}
                    >
                      <Text style={{ color: '#000', fontWeight: '700', fontSize: 14 }}>Upgrade — $4.99/mo</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </>
            )}
          </ScrollView>
        </View>

        {/* Section D — Bottom */}
        <View style={{ borderTopWidth: 0.5, borderTopColor: 'rgba(255,255,255,0.1)', paddingHorizontal: 16, paddingVertical: 12 }}>
          <TouchableOpacity
            onPress={() => sidebarNavigate('Settings')}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 }}
          >
            <SettingsIcon size={18} color="#71717a" />
            <Text style={{ color: '#a1a1aa', fontSize: 14 }}>Settings</Text>
          </TouchableOpacity>

          {/* Subscription badge */}
          <View style={{
            flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <View style={{
              borderWidth: 1,
              borderColor: hasGoldAccess ? '#C9A84C' : '#52525b',
              borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4,
            }}>
              <Text style={{ color: hasGoldAccess ? '#C9A84C' : '#71717a', fontSize: 12, fontWeight: '600' }}>
                {hasLifetimeAccess ? 'Lifetime' : hasGold ? 'Gold' : 'Free'}
              </Text>
            </View>
            {!hasGoldAccess && (
              <TouchableOpacity onPress={() => { drawerProps.navigation.closeDrawer(); setShowPaywallModal(true); }}>
                <Text style={{ color: '#C9A84C', fontSize: 13, fontWeight: '600' }}>Upgrade</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </SafeAreaView>
    );
  }, [currentScreen, troyConversations, activeConversationId, hasGoldAccess, hasGold, hasLifetimeAccess, drawerNavigation]);
  if (showResetPasswordScreen) {
    return (
      <View style={[styles.container, { backgroundColor: '#09090b' }]}>
        <StatusBar barStyle="light-content" />
        <ResetPasswordScreen onComplete={() => setShowResetPasswordScreen(false)} />
      </View>
    );
  }

  if (isLoading || authLoading || guestMode === null || needsPostSignInSync) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center', backgroundColor: '#0A0A0E' }]}>
        <Image source={TROY_AVATAR} style={{ width: 72, height: 72, borderRadius: 36, marginBottom: 16 }} />
        <Text style={{ color: '#fff', fontSize: 22, fontWeight: '700', marginBottom: 4 }}>TroyStack</Text>
        <ActivityIndicator size="small" color="#DAA520" style={{ marginTop: 12 }} />
      </View>
    );
  }

  // Show AuthScreen if user is not signed in with Supabase AND not in guest mode
  if (!supabaseUser && !guestMode) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
        <AuthScreen onAuthSuccess={handleAuthSuccess} />
        {/* Skip for now button */}
        <View style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          paddingHorizontal: 24,
          paddingBottom: Platform.OS === 'ios' ? 50 : 30,
          backgroundColor: colors.background,
        }}>
          <TouchableOpacity
            style={{
              paddingVertical: 16,
              alignItems: 'center',
            }}
            onPress={enableGuestMode}
          >
            <Text style={{ color: colors.muted, fontSize: scaledFonts.medium }}>
              Continue without signing in
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // Show biometric auth screen (Face ID / Touch ID)
  if (!isAuthenticated) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <Image source={require('./assets/icon.png')} style={{ width: 80, height: 80, borderRadius: 16, marginBottom: 16 }} />
        <Text style={{ color: colors.text, fontSize: scaledFonts.xlarge, fontWeight: '700', marginBottom: 8 }}>TroyStack</Text>
        <Text style={{ color: colors.muted, marginBottom: 32 }}>Authenticate to continue</Text>
        <TouchableOpacity style={[styles.button, { backgroundColor: colors.silver }]} onPress={authenticate}>
          <Text style={{ color: '#000', fontWeight: '600' }}>Unlock</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const metalColorMap = { silver: colors.silver, gold: colors.gold, platinum: colors.platinum, palladium: colors.palladium };
  const currentColor = metalColorMap[metalTab] || colors.gold;
  const metalItemsMap = { silver: silverItems, gold: goldItems, platinum: platinumItems, palladium: palladiumItems };
  const items = metalItemsMap[metalTab] || [];
  const metalSpotMap = { silver: silverSpot, gold: goldSpot, platinum: platinumSpot, palladium: palladiumSpot };
  const spot = metalSpotMap[metalTab] || goldSpot;


  // ============================================
  // MAIN RENDER
  // ============================================

  return (
    <Drawer.Navigator
      screenOptions={{
        headerShown: false,
        drawerType: 'front',
        drawerStyle: { width: '75%', backgroundColor: '#0A0A0E' },
        overlayColor: 'rgba(0,0,0,0.5)',
        swipeEnabled: true,
        swipeEdgeWidth: 50,
      }}
      drawerContent={renderCustomSidebar}
    >
      <Drawer.Screen name="MainScreen">
        {() => (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <DrawerNavCapture onCapture={(nav) => { if (nav && !drawerNavigation) setDrawerNavigation(nav); }} />
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />

      {/* Header */}
      <View style={[styles.header, { backgroundColor: currentScreen === 'TroyChat' ? '#000' : (isDarkMode ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.8)'), borderBottomColor: currentScreen === 'TroyChat' ? '#1a1a1a' : colors.border }]}>
        <View style={styles.headerContent}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          {currentScreen === 'TroyChat' ? (
            <>
              <TouchableOpacity onPress={() => drawerNavigation?.dispatch(DrawerActions.openDrawer())} activeOpacity={0.7} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} style={{ paddingRight: 6 }}>
                <Text style={{ color: '#D4A843', fontSize: 22, fontWeight: '300' }}>{'\u2630'}</Text>
              </TouchableOpacity>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Image source={TROY_AVATAR} style={{ width: 32, height: 32, borderRadius: 16 }} />
                <View style={{ marginLeft: 10 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Text style={{ color: '#fff', fontSize: 17, fontWeight: '700' }}>Troy</Text>
                    {playingMessageId && (
                      <Svg width={12} height={12} viewBox="0 0 24 24" fill="none" style={{ marginLeft: 4 }}>
                        <Path d="M11 5L6 9H2v6h4l5 4V5z" stroke="#DAA520" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        <Path d="M19.07 4.93a10 10 0 010 14.14M15.54 8.46a5 5 0 010 7.07" stroke="#DAA520" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </Svg>
                    )}
                    {voiceState === 'recording' && (
                      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#EF4444', marginLeft: 6 }} />
                    )}
                  </View>
                  <Text style={{ color: voiceState === 'transcribing' ? '#DAA520' : '#999', fontSize: 12 }}>{voiceState === 'recording' ? 'Listening...' : voiceState === 'transcribing' ? 'Transcribing...' : 'Your Stack Analyst'}</Text>
                </View>
              </View>
            </>
          ) : (
            <>
              <TouchableOpacity onPress={() => setCurrentScreen('TroyChat')} activeOpacity={0.7} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} style={{ paddingRight: 6 }}>
                <Text style={{ color: '#D4A843', fontSize: 22, fontWeight: '300' }}>{'\u2039'}</Text>
              </TouchableOpacity>
              <Text style={{ color: colors.text, fontSize: 17, fontWeight: '700' }}>
                {currentScreen === 'Dashboard' ? 'Dashboard' : currentScreen === 'MyStack' ? 'My Stack' : currentScreen === 'Analytics' ? 'Analytics' : currentScreen === 'StackSignal' ? 'Stack Signal' : currentScreen === 'Settings' ? 'Settings' : currentScreen === 'CompareDealers' ? 'Compare Dealers' : currentScreen}
              </Text>
            </>
          )}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            {supabaseUser ? (
              // Signed in - show profile icon that goes to account
              <TouchableOpacity
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 18,
                  backgroundColor: isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderWidth: 1,
                  borderColor: isDarkMode ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.1)',
                }}
                onPress={() => {
                  setPreviousScreen(currentScreen);
                  setCurrentScreen('Settings');
                }}
              >
                <ProfileIcon size={20} color={colors.gold} />
              </TouchableOpacity>
            ) : (
              // Not signed in - show Sign In button
              <TouchableOpacity
                style={{
                  paddingHorizontal: 14,
                  paddingVertical: 8,
                  backgroundColor: colors.gold,
                  borderRadius: 20,
                }}
                onPress={() => disableGuestMode()}
              >
                <Text style={{ color: '#18181b', fontSize: scaledFonts.small, fontWeight: '600' }}>Sign In</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>

      {/* Guest Mode Banner */}
      {guestMode && !supabaseUser && (
        <TouchableOpacity
          onPress={() => disableGuestMode()}
          style={{
            backgroundColor: isDarkMode ? 'rgba(251,191,36,0.12)' : 'rgba(251,191,36,0.15)',
            paddingVertical: 8,
            paddingHorizontal: 16,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            borderBottomWidth: 0.5,
            borderBottomColor: isDarkMode ? 'rgba(251,191,36,0.2)' : 'rgba(251,191,36,0.3)',
          }}
        >
          <Text style={{ color: colors.gold, fontSize: scaledFonts.small, fontWeight: '600' }}>
            Create an account to save your stack
          </Text>
          <Text style={{ color: colors.gold, fontSize: scaledFonts.tiny }}>→</Text>
        </TouchableOpacity>
      )}

      {/* Main Content — ScrollView excluded on Troy tab (Troy uses FlatList) */}
      {currentScreen !== 'TroyChat' && (
      <ScrollView
        ref={scrollRef}
        style={styles.content}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        refreshControl={
          (currentScreen === 'MyStack' || currentScreen === 'Analytics' || currentScreen === 'Dashboard' || currentScreen === 'StackSignal') ? (
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={
                currentScreen === 'MyStack' ? onRefreshDashboard :
                currentScreen === 'Dashboard' ? onRefreshToday :
                currentScreen === 'StackSignal' ? onRefreshSignal :
                onRefreshAnalytics
              }
              tintColor={colors.gold}
              colors={[colors.gold]}
            />
          ) : undefined
        }
      >

        {/* TODAY TAB */}
        {currentScreen === 'Dashboard' && (() => {
          const todayDate = new Date();
          const dateStr = todayDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

          // Screenshot mode overrides
          const effGoldSpot = demoData ? demoData.goldSpot : goldSpot;
          const effSilverSpot = demoData ? demoData.silverSpot : silverSpot;
          const effPlatinumSpot = demoData ? demoData.platinumSpot : platinumSpot;
          const effPalladiumSpot = demoData ? demoData.palladiumSpot : palladiumSpot;
          const effSpotChange = demoData ? demoData.spotChange : spotChange;
          const effTotalMeltValue = demoData ? demoData.totalMeltValue : totalMeltValue;
          const effMarketsClosed = demoData ? false : marketsClosed;

          const effSparklineData = demoData ? demoData.sparklineData : sparklineData;
          const effHasGoldAccess = demoData ? true : hasGoldAccess;
          const effHasPaidAccess = demoData ? true : hasPaidAccess;

          // Metal movers data (fixed grid: Ag top-left, Au top-right, Pt bottom-left, Pd bottom-right)
          const metalMovers = [
            { symbol: 'Ag', label: 'Silver', spot: effSilverSpot, change: effSpotChange?.silver?.amount || 0, pct: effSpotChange?.silver?.percent || 0, color: '#9ca3af' },
            { symbol: 'Au', label: 'Gold', spot: effGoldSpot, change: effSpotChange?.gold?.amount || 0, pct: effSpotChange?.gold?.percent || 0, color: '#D4A843' },
            { symbol: 'Pt', label: 'Platinum', spot: effPlatinumSpot, change: effSpotChange?.platinum?.amount || 0, pct: effSpotChange?.platinum?.percent || 0, color: '#7BB3D4' },
            { symbol: 'Pd', label: 'Palladium', spot: effPalladiumSpot, change: effSpotChange?.palladium?.amount || 0, pct: effSpotChange?.palladium?.percent || 0, color: '#6BBF8A' },
          ];
          const biggestMoverSymbol = metalMovers.reduce((best, m) => Math.abs(m.pct) > Math.abs(best.pct) ? m : best, metalMovers[0]).symbol;

          // Portfolio impact per metal (only metals held)
          const holdingsImpact = demoData ? [
            { label: 'Gold', ozt: 68.2, spot: effGoldSpot, pct: effSpotChange?.gold?.percent || 0, color: '#D4A843' },
            { label: 'Silver', ozt: 1420, spot: effSilverSpot, pct: effSpotChange?.silver?.percent || 0, color: '#9ca3af' },
            { label: 'Platinum', ozt: 7.5, spot: effPlatinumSpot, pct: effSpotChange?.platinum?.percent || 0, color: '#7BB3D4' },
            { label: 'Palladium', ozt: 3.0, spot: effPalladiumSpot, pct: effSpotChange?.palladium?.percent || 0, color: '#6BBF8A' },
          ].map(m => {
            const currentValue = m.ozt * m.spot;
            const prevValue = m.pct !== 0 ? currentValue / (1 + m.pct / 100) : currentValue;
            const dollarChange = currentValue - prevValue;
            return { ...m, currentValue, dollarChange };
          }).sort((a, b) => Math.abs(b.dollarChange) - Math.abs(a.dollarChange)) : [
            { label: 'Gold', ozt: totalGoldOzt, spot: goldSpot, pct: spotChange?.gold?.percent || 0, color: '#D4A843' },
            { label: 'Silver', ozt: totalSilverOzt, spot: silverSpot, pct: spotChange?.silver?.percent || 0, color: '#9ca3af' },
            { label: 'Platinum', ozt: totalPlatinumOzt, spot: platinumSpot, pct: spotChange?.platinum?.percent || 0, color: '#7BB3D4' },
            { label: 'Palladium', ozt: totalPalladiumOzt, spot: palladiumSpot, pct: spotChange?.palladium?.percent || 0, color: '#6BBF8A' },
          ].filter(m => m.ozt > 0).map(m => {
            const currentValue = m.ozt * m.spot;
            const prevValue = m.pct !== 0 ? currentValue / (1 + m.pct / 100) : currentValue;
            const dollarChange = currentValue - prevValue;
            return { ...m, currentValue, dollarChange };
          }).sort((a, b) => Math.abs(b.dollarChange) - Math.abs(a.dollarChange));

          // AI summary generation (client-side)
          const biggestMover = metalMovers.reduce((best, m) => Math.abs(m.pct) > Math.abs(best.pct) ? m : best, metalMovers[0]);
          const effDailyChange = demoData ? demoData.dailyChange : dailyChange;
          const gainedLost = effDailyChange >= 0 ? 'gained' : 'lost';
          const rallyDecline = biggestMover?.pct >= 0 ? 'rally' : 'decline';
          const aiSummary = effMarketsClosed
            ? 'Markets are closed. Prices reflect Friday\u2019s close.'
            : effTotalMeltValue > 0 && effDailyChange !== 0
            ? `Your stack ${gainedLost} $${formatCurrency(Math.abs(effDailyChange), 0)} today, driven by ${biggestMover?.label}'s ${Math.abs(biggestMover?.pct || 0).toFixed(1)}% ${rallyDecline}.`
            : effTotalMeltValue > 0
            ? 'Markets are steady today. Your stack value is unchanged.'
            : 'Add holdings to see your daily stack changes.';

          // Display values (zeroed when markets closed, or demo values in screenshot mode)
          const displayDailyChange = demoData ? demoData.dailyChange : (marketsClosed ? 0 : dailyChange);
          const displayDailyChangePct = demoData ? demoData.dailyChangePct : (marketsClosed ? 0 : dailyChangePct);

          const categoryColors = {
            market_brief: '#D4A843',
            breaking_news: '#F87171',
            policy: '#60A5FA',
            supply_demand: '#6BBF8A',
            analysis: '#C084FC',
            gold: '#D4A843',
            silver: '#A8B5C8',
            platinum: '#7BB3D4',
            palladium: '#6BBF8A',
            general: '#A1A1AA',
          };

          const categoryLabels = {
            market_brief: 'Market Brief',
            breaking_news: 'Breaking',
            policy: 'Policy',
            supply_demand: 'Supply & Demand',
            analysis: 'Analysis',
            gold: 'Gold',
            silver: 'Silver',
            platinum: 'Platinum',
            palladium: 'Palladium',
            general: 'Market',
          };

          const todayCardBg = isDarkMode ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)';
          const todayCardBorder = isDarkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)';

          return (
            <View style={{ backgroundColor: isDarkMode ? '#0d0d0d' : colors.bg, marginHorizontal: -20, paddingHorizontal: 16, paddingTop: 4, minHeight: Dimensions.get('window').height - 200 }}>

              {/* ===== SECTION 1: STACK PULSE ===== */}
              <View onLayout={(e) => { sectionOffsets.current['portfolioPulse'] = e.nativeEvent.layout.y; }} style={{
                backgroundColor: todayCardBg,
                borderRadius: 16,
                borderWidth: 1,
                borderColor: todayCardBorder,
                padding: 20,
                marginBottom: 16,
              }}>
                {/* Gold accent line */}
                <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, backgroundColor: '#D4A843', borderTopLeftRadius: 16, borderTopRightRadius: 16 }} />

                <Text style={{ color: colors.muted, fontSize: scaledFonts.small, fontWeight: '500', marginBottom: 4, marginTop: 4 }}>Today, {dateStr}</Text>

                <Text style={{ color: colors.text, fontSize: scaledFonts.huge, fontWeight: '700', marginBottom: 2 }}>${formatCurrency(effTotalMeltValue, 0)}</Text>

                {effSparklineData && effSparklineData.gold.length >= 2 && effTotalMeltValue > 0 && (() => {
                  const goldPts = effSparklineData.gold;
                  const silverPts = effSparklineData.silver;
                  const effGoldOzt = demoData ? 68.2 : totalGoldOzt;
                  const effSilverOzt = demoData ? 1420 : totalSilverOzt;
                  const effPlatinumOzt = demoData ? 7.5 : totalPlatinumOzt;
                  const effPalladiumOzt = demoData ? 3.0 : totalPalladiumOzt;
                  const portfolioPoints = goldPts.map((g, i) => (effGoldOzt * g) + (effSilverOzt * (silverPts[i] || 0)) + (effPlatinumOzt * (effSparklineData.platinum[i] || 0)) + (effPalladiumOzt * (effSparklineData.palladium[i] || 0)));

                  // When closed, derive color from frozen data trend; when open, use live daily change
                  const isUp = effMarketsClosed
                    ? portfolioPoints[portfolioPoints.length - 1] >= portfolioPoints[0]
                    : displayDailyChangePct >= 0;
                  const sparkColor = isUp ? '#4CAF50' : '#F44336';
                  return (
                    <ScrubSparkline
                      dataPoints={portfolioPoints}
                      timestamps={effSparklineData.timestamps}
                      svgW={300}
                      svgH={60}
                      strokeColor={sparkColor}
                      gradientId="portfolioGrad"
                      formatValue={(v) => `$${formatCurrency(v, 0)}`}
                      label="Stack"
                      baselineValue={portfolioPoints[0]}
                      style={{ marginBottom: 4 }}
                    />
                  );
                })()}

                {effMarketsClosed ? (
                  <View style={{ marginBottom: 12 }}>
                    <Text style={{ color: '#71717a', fontSize: scaledFonts.small, fontWeight: '500' }}>Markets Closed</Text>
                  </View>
                ) : (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 }}>
                    <Text style={{ color: displayDailyChange >= 0 ? '#4CAF50' : '#F44336', fontSize: scaledFonts.medium, fontWeight: '600' }}>
                      {displayDailyChange >= 0 ? '▲' : '▼'} ${formatCurrency(Math.abs(displayDailyChange), 0)}
                    </Text>
                    <Text style={{ color: displayDailyChange >= 0 ? '#4CAF50' : '#F44336', fontSize: scaledFonts.small }}>
                      ({displayDailyChangePct >= 0 ? '+' : ''}{displayDailyChangePct.toFixed(2)}%)
                    </Text>
                  </View>
                )}

                <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6 }}>
                  <Image source={TROY_AVATAR} style={{ width: 14, height: 14, borderRadius: 7 }} />
                  <Text style={{ color: colors.muted, fontSize: scaledFonts.small, lineHeight: scaledFonts.small * 1.5, fontStyle: 'italic', flex: 1 }}>{aiSummary}</Text>
                </View>
              </View>

              {/* ===== DAILY BRIEF (Troy's Take) ===== */}
              <View onLayout={(e) => { sectionOffsets.current['morningBrief'] = e.nativeEvent.layout.y; }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12, gap: 8 }}>
                  <Image source={TROY_AVATAR} style={{ width: 20, height: 20, borderRadius: 10 }} />
                  <Text style={{ color: colors.muted, fontSize: scaledFonts.tiny, fontWeight: '600', letterSpacing: 1.2, textTransform: 'uppercase' }}>Troy's Take</Text>
                  <View style={{ flex: 1, height: 1, backgroundColor: 'rgba(212,168,67,0.2)' }} />
                </View>

                {effHasPaidAccess ? (
                  <View style={{
                    backgroundColor: todayCardBg,
                    borderRadius: 16,
                    borderWidth: 1,
                    borderColor: todayCardBorder,
                    borderLeftWidth: 3,
                    borderLeftColor: '#D4A843',
                    padding: 16,
                    marginBottom: 16,
                  }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                      <Image source={TROY_AVATAR} style={{ width: 20, height: 20, borderRadius: 10 }} />
                      <Text style={{ color: colors.muted, fontSize: scaledFonts.small, fontWeight: '600' }}>
                        Your Daily Brief · {dailyBrief && dailyBrief.date && !dailyBrief.is_current
                          ? new Date(dailyBrief.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
                          : new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                      </Text>
                    </View>
                    {dailyBriefLoading ? (
                      <ActivityIndicator size="small" color="#D4A843" style={{ paddingVertical: 8 }} />
                    ) : dailyBrief && dailyBrief.brief_text ? (
                      <>
                        {!dailyBrief.is_current && (
                          <Text style={{ color: colors.gold, fontSize: scaledFonts.tiny, fontStyle: 'italic', marginBottom: 6 }}>
                            Today's brief will be available after 6:30 AM EST. Showing the most recent.
                          </Text>
                        )}
                        <Text style={{ color: colors.text, fontSize: scaledFonts.normal, lineHeight: scaledFonts.normal * 1.5 }} numberOfLines={briefExpanded ? undefined : 2}>{dailyBrief.brief_text}</Text>
                        <TouchableOpacity onPress={() => setBriefExpanded(!briefExpanded)} style={{ marginTop: 4, paddingVertical: 12 }}>
                          <Text style={{ color: '#D4A843', fontSize: scaledFonts.medium, fontWeight: '700' }}>{briefExpanded ? 'See less' : 'See more'}</Text>
                        </TouchableOpacity>
                        {briefExpanded && <Text style={{ color: '#666', fontSize: scaledFonts.tiny, fontStyle: 'italic' }}>AI-generated analysis. Not financial advice.</Text>}
                      </>
                    ) : (
                      <Text style={{ color: colors.muted, fontSize: scaledFonts.small, fontStyle: 'italic' }}>
                        Your first daily brief will be available after 6:30 AM EST.
                      </Text>
                    )}
                  </View>
                ) : dailyBrief && dailyBrief.brief_text ? (
                  <View style={{
                    backgroundColor: todayCardBg,
                    borderRadius: 16,
                    borderWidth: 1,
                    borderColor: todayCardBorder,
                    borderLeftWidth: 3,
                    borderLeftColor: '#D4A843',
                    padding: 16,
                    marginBottom: 16,
                  }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                      <Image source={TROY_AVATAR} style={{ width: 20, height: 20, borderRadius: 10 }} />
                      <Text style={{ color: colors.muted, fontSize: scaledFonts.small, fontWeight: '600' }}>Your Daily Brief</Text>
                    </View>
                    <View style={{ maxHeight: 60, overflow: 'hidden' }}>
                      <Text style={{ color: colors.text, fontSize: scaledFonts.normal, lineHeight: scaledFonts.normal * 1.5 }}>{dailyBrief.brief_text}</Text>
                    </View>
                    <View style={{ height: 40, marginTop: -40 }}>
                      <View style={{ flex: 1, backgroundColor: todayCardBg, opacity: 0 }} />
                      <View style={{ flex: 1, backgroundColor: todayCardBg, opacity: 0.4 }} />
                      <View style={{ flex: 1, backgroundColor: todayCardBg, opacity: 0.7 }} />
                      <View style={{ flex: 1, backgroundColor: todayCardBg, opacity: 0.95 }} />
                    </View>
                    <TouchableOpacity onPress={() => setShowPaywallModal(true)} style={{ marginTop: 4 }}>
                      <Text style={{ color: '#D4A843', fontSize: scaledFonts.small, fontWeight: '600' }}>Unlock Your Daily Brief — upgrade now →</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={{
                      backgroundColor: todayCardBg,
                      borderRadius: 16,
                      borderWidth: 1,
                      borderColor: todayCardBorder,
                      borderLeftWidth: 3,
                      borderLeftColor: '#D4A843',
                      padding: 16,
                      marginBottom: 16,
                    }}
                    onPress={() => setShowPaywallModal(true)}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                      <Image source={TROY_AVATAR} style={{ width: 20, height: 20, borderRadius: 10 }} />
                      <Text style={{ color: colors.muted, fontSize: scaledFonts.small, fontWeight: '600' }}>Your Daily Brief</Text>
                    </View>
                    <Text style={{ color: colors.muted, fontSize: scaledFonts.small }}>
                      Get your daily brief — upgrade to unlock
                    </Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 6, backgroundColor: 'rgba(251,191,36,0.15)', alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4 }}>
                      <Text style={{ color: colors.gold, fontSize: scaledFonts.tiny, fontWeight: '600' }}>UPGRADE</Text>
                    </View>
                  </TouchableOpacity>
                )}
              </View>

              {/* ===== SECTION 2: LIVE SPOT (2x2 Grid) ===== */}
              <View onLayout={(e) => { sectionOffsets.current['metalMovers'] = e.nativeEvent.layout.y; }} style={{ marginBottom: 16 }}>
                <Text style={{ color: colors.muted, fontSize: scaledFonts.tiny, fontWeight: '600', letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 10, marginLeft: 4 }}>Live Spot</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                  {metalMovers.map((m, idx) => {
                    const metalKey = m.label.toLowerCase();
                    const points = effSparklineData?.[metalKey] || [];
                    // When closed, derive color from frozen data trend; when open, use live change %
                    const isUp = effMarketsClosed
                      ? (points.length >= 2 ? points[points.length - 1] >= points[0] : true)
                      : m.pct >= 0;
                    const sparkColor = isUp ? '#4CAF50' : '#F44336';
                    const isBiggestMover = m.symbol === biggestMoverSymbol && !effMarketsClosed && Math.abs(m.pct) > 0.1;
                    const glowColor = isBiggestMover ? (m.pct >= 0 ? '#4CAF50' : '#F44336') : 'transparent';
                    return (
                      <View key={m.symbol} style={{
                        backgroundColor: todayCardBg,
                        borderRadius: 12,
                        borderWidth: 1,
                        borderColor: isBiggestMover ? glowColor + '40' : todayCardBorder,
                        padding: 14,
                        width: (SCREEN_WIDTH - 32 - 10) / 2,
                        zIndex: 1,
                        ...(isBiggestMover ? {
                          shadowColor: glowColor,
                          shadowOffset: { width: 0, height: 0 },
                          shadowOpacity: 0.5,
                          shadowRadius: 8,
                          elevation: 6,
                        } : {}),
                      }}>
                        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, backgroundColor: m.color, borderTopLeftRadius: 12, borderTopRightRadius: 12 }} />

                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: m.color }} />
                          <Text style={{ color: m.color, fontSize: scaledFonts.small, fontWeight: '700' }}>{m.label}</Text>
                        </View>

                        {points.length >= 2 && (
                          <ScrubSparkline
                            dataPoints={points}
                            timestamps={effSparklineData?.timestamps}
                            svgW={120}
                            svgH={32}
                            strokeColor={sparkColor}
                            gradientId={`metalGrad_${m.symbol}`}
                            formatValue={(v) => `$${m.symbol === 'Ag' ? v.toFixed(2) : formatCurrency(v, 0)}`}
                            label={m.label}
                            baselineValue={points[0]}
                            style={{ alignItems: 'center', marginBottom: 6 }}
                          />
                        )}

                        <Text style={{ color: colors.text, fontSize: scaledFonts.large, fontWeight: '700', marginBottom: 4 }}>
                          ${m.symbol === 'Ag' ? m.spot.toFixed(2) : formatCurrency(m.spot, 0)}
                        </Text>

                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                          {effMarketsClosed ? (
                            <Text style={{ color: '#71717a', fontSize: scaledFonts.small, fontWeight: '500' }}>Closed</Text>
                          ) : (
                            <>
                              <Text style={{ color: m.change >= 0 ? '#4CAF50' : '#F44336', fontSize: scaledFonts.small, fontWeight: '600' }}>
                                {m.change >= 0 ? '+' : ''}{m.symbol === 'Ag' ? m.change.toFixed(2) : m.change.toFixed(0)}
                              </Text>
                              <Text style={{ color: m.pct >= 0 ? '#4CAF50' : '#F44336', fontSize: scaledFonts.tiny }}>
                                ({m.pct >= 0 ? '+' : ''}{m.pct.toFixed(1)}%)
                              </Text>
                            </>
                          )}
                        </View>
                      </View>
                    );
                  })}
                </View>
                {/* Troy one-liner — Live Spot */}
                {metalMovers.length > 0 && !effMarketsClosed && (() => {
                  const sorted = [...metalMovers].sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct));
                  const best = sorted[0];
                  const worst = sorted[sorted.length - 1];
                  const gsRatio = effSilverSpot > 0 ? effGoldSpot / effSilverSpot : 0;
                  let liner;
                  if (Math.abs(best.pct) > 2) {
                    liner = <Text style={{ color: colors.muted, fontSize: scaledFonts.small, lineHeight: scaledFonts.small * 1.5, fontStyle: 'italic', flex: 1 }}>{best.label} {best.pct >= 0 ? 'up' : 'down'} <Text style={{ fontWeight: '700' }}>{Math.abs(best.pct).toFixed(1)}%</Text> today — biggest mover across the board.</Text>;
                  } else if (gsRatio > 0) {
                    const ctx = gsRatio > 80 ? 'historically stretched — silver tends to catch up' : gsRatio >= 65 ? 'elevated range' : 'tightening — silver gaining ground';
                    liner = <Text style={{ color: colors.muted, fontSize: scaledFonts.small, lineHeight: scaledFonts.small * 1.5, fontStyle: 'italic', flex: 1 }}>Gold-silver ratio at <Text style={{ fontWeight: '700' }}>{gsRatio.toFixed(1)}:1</Text> — {ctx}.</Text>;
                  } else {
                    liner = <Text style={{ color: colors.muted, fontSize: scaledFonts.small, lineHeight: scaledFonts.small * 1.5, fontStyle: 'italic', flex: 1 }}>{best.label} leading at <Text style={{ fontWeight: '700' }}>{best.pct >= 0 ? '+' : ''}{best.pct.toFixed(1)}%</Text>, {worst.label.toLowerCase()} lagging at <Text style={{ fontWeight: '700' }}>{worst.pct >= 0 ? '+' : ''}{worst.pct.toFixed(1)}%</Text>.</Text>;
                  }
                  return (
                    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginTop: 10 }}>
                      <Image source={TROY_AVATAR} style={{ width: 14, height: 14, borderRadius: 7 }} />
                      {liner}
                    </View>
                  );
                })()}
              </View>

              {/* ===== SECTION 3: METAL MOVERS ===== */}
              <View onLayout={(e) => { sectionOffsets.current['whatChanged'] = e.nativeEvent.layout.y; }} style={{ marginBottom: 16 }}>
                  {holdingsImpact.length > 0 && (
                    <View>
                      <Text style={{ color: colors.muted, fontSize: scaledFonts.tiny, fontWeight: '600', letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 10, marginLeft: 4 }}>Metal Movers</Text>
                      <View style={{
                        backgroundColor: todayCardBg,
                        borderRadius: 12,
                        borderWidth: 1,
                        borderColor: todayCardBorder,
                        overflow: 'hidden',
                      }}>
                        {holdingsImpact.map((m, i) => (
                          <View key={m.label} style={{
                            paddingVertical: 14,
                            paddingHorizontal: 16,
                            borderBottomWidth: i < holdingsImpact.length - 1 ? 1 : 0,
                            borderBottomColor: todayCardBorder,
                          }}>
                            {effHasPaidAccess || i === 0 ? (
                              <>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: m.color }} />
                                  <Text style={{ color: colors.text, fontSize: scaledFonts.normal, flex: 1 }}>
                                    Your {m.label.toLowerCase()} ({formatOunces(m.ozt, m.label === 'Silver' ? 0 : 2)} oz)
                                  </Text>
                                </View>
                                {marketsClosed ? (
                                  <Text style={{ color: colors.muted, fontSize: scaledFonts.normal, fontWeight: '600', marginLeft: 16, marginTop: 4 }}>
                                    No change (markets closed)
                                  </Text>
                                ) : (
                                  <Text style={{ color: m.dollarChange >= 0 ? '#4CAF50' : '#F44336', fontSize: scaledFonts.normal, fontWeight: '600', marginLeft: 16, marginTop: 4 }}>
                                    {m.dollarChange >= 0 ? 'gained' : 'lost'} ${formatCurrency(Math.abs(m.dollarChange), 0)} ({m.pct >= 0 ? '+' : ''}{m.pct.toFixed(1)}%)
                                  </Text>
                                )}
                              </>
                            ) : (
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: m.color }} />
                                <Text style={{ color: colors.text, fontSize: scaledFonts.normal, flex: 1 }}>{m.label}</Text>
                                <Text style={{ color: colors.muted, fontSize: scaledFonts.normal }}>{'\u2022\u2022\u2022\u2022\u2022\u2022'}</Text>
                              </View>
                            )}
                          </View>
                        ))}
                      </View>
                    </View>
                  )}
                  {holdingsImpact.length === 0 && (
                    <View style={{
                      backgroundColor: todayCardBg,
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor: todayCardBorder,
                      padding: 20,
                      alignItems: 'center',
                    }}>
                      <Text style={{ color: colors.muted, fontSize: scaledFonts.normal }}>Add holdings to see daily impact</Text>
                    </View>
                  )}
                {!effHasPaidAccess && holdingsImpact.length > 1 && (
                  <>
                    <TouchableOpacity
                      onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setShowPaywallModal(true); }}
                      style={{ marginTop: 10, borderWidth: 1, borderColor: 'rgba(212, 168, 67, 0.3)', borderRadius: 10, paddingVertical: 10, paddingHorizontal: 16, alignItems: 'center' }}
                    >
                      <Text style={{ color: colors.gold, fontSize: scaledFonts.small, fontWeight: '600' }}>Unlock full insights — start free</Text>
                      <Text style={{ color: colors.muted, fontSize: scaledFonts.tiny, marginTop: 2 }}>Plans from $4.99/mo · Cancel anytime</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={handleRestore} style={{ marginTop: 6, alignItems: 'center' }}>
                      <Text style={{ color: colors.muted, fontSize: scaledFonts.tiny, textDecorationLine: 'underline' }}>Restore Purchases</Text>
                    </TouchableOpacity>
                  </>
                )}
                {/* Troy one-liner — Metal Movers */}
                {holdingsImpact.length > 0 && !effMarketsClosed && (() => {
                  const totalChange = holdingsImpact.reduce((s, m) => s + m.dollarChange, 0);
                  const allGreen = holdingsImpact.every(m => m.dollarChange >= 0);
                  const allRed = holdingsImpact.every(m => m.dollarChange <= 0);
                  const best = holdingsImpact[0]; // already sorted by abs dollarChange
                  const worst = [...holdingsImpact].sort((a, b) => a.dollarChange - b.dollarChange)[0];
                  let liner;
                  if (Math.abs(best.dollarChange) > 0 && totalChange !== 0) {
                    const pctOfMove = Math.round(Math.abs(best.dollarChange) / Math.abs(totalChange) * 100);
                    const ozStr = best.label === 'Silver' ? formatOunces(best.ozt, 0) : formatOunces(best.ozt, 2);
                    liner = <Text style={{ color: colors.muted, fontSize: scaledFonts.small, lineHeight: scaledFonts.small * 1.5, fontStyle: 'italic', flex: 1 }}>Your {best.label.toLowerCase()} ({ozStr} oz) {best.dollarChange >= 0 ? 'gained' : 'lost'} <Text style={{ fontWeight: '700' }}>${formatCurrency(Math.abs(best.dollarChange), 0)}</Text> — driving {pctOfMove}% of today's move.</Text>;
                  } else if (allGreen) {
                    liner = <Text style={{ color: colors.muted, fontSize: scaledFonts.small, lineHeight: scaledFonts.small * 1.5, fontStyle: 'italic', flex: 1 }}>All four metals green today — your stack is working.</Text>;
                  } else if (!allRed) {
                    liner = <Text style={{ color: colors.muted, fontSize: scaledFonts.small, lineHeight: scaledFonts.small * 1.5, fontStyle: 'italic', flex: 1 }}>{best.label} carrying the load while {worst.label.toLowerCase()} drags.</Text>;
                  } else {
                    liner = <Text style={{ color: colors.muted, fontSize: scaledFonts.small, lineHeight: scaledFonts.small * 1.5, fontStyle: 'italic', flex: 1 }}>Rough day — {worst.label.toLowerCase()} taking the biggest hit.</Text>;
                  }
                  return (
                    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginTop: 10 }}>
                      <Image source={TROY_AVATAR} style={{ width: 14, height: 14, borderRadius: 7 }} />
                      {liner}
                    </View>
                  );
                })()}
              </View>

              {/* ===== VAULT WATCH (Full) ===== */}
              <View onLayout={(e) => { sectionOffsets.current['vaultWatch'] = e.nativeEvent.layout.y; }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4, gap: 8 }}>
                  <Text style={{ color: colors.muted, fontSize: scaledFonts.tiny, fontWeight: '600', letterSpacing: 1.2, textTransform: 'uppercase', marginLeft: 4 }}>
                    {'🏦'} Vault Watch
                  </Text>
                  <View style={{ flex: 1, height: 1, backgroundColor: 'rgba(212,168,67,0.2)' }} />
                </View>
                <Text style={{ color: colors.muted, fontSize: scaledFonts.tiny, marginBottom: 10, marginLeft: 4 }}>COMEX Inventory Tracking</Text>

              {(() => {
                const vaultMetalsAll = [
                  { key: 'silver', label: 'Ag', color: '#C0C0C0' },
                  { key: 'gold', label: 'Au', color: '#D4A843' },
                  { key: 'platinum', label: 'Pt', color: '#A8D8EA' },
                  { key: 'palladium', label: 'Pd', color: '#4CAF50' },
                ];
                const vaultMetals = vaultMetalsAll.filter(m => {
                  const data = vaultData[m.key] || [];
                  return data.length > 0 && data.some(d => (d.registered_oz || 0) > 0);
                });

                const activeMetal = vaultMetals.some(m => m.key === vaultMetal) ? vaultMetal : (vaultMetals[0]?.key || 'silver');
                if (activeMetal !== vaultMetal) {
                  setTimeout(() => setVaultMetal(activeMetal), 0);
                }

                const currentVaultData = vaultData[activeMetal] || [];
                const latestVault = currentVaultData.length > 0 ? currentVaultData[currentVaultData.length - 1] : null;
                const currentVaultColor = (vaultMetalsAll.find(m => m.key === activeMetal) || {}).color || '#D4A843';

                const formatOzCompact = (val) => {
                  if (!val && val !== 0) return '—';
                  const abs = Math.abs(val);
                  if (abs >= 1e9) return `${(val / 1e9).toFixed(1)}B`;
                  if (abs >= 1e6) return `${(val / 1e6).toFixed(1)}M`;
                  if (abs >= 1e3) return `${(val / 1e3).toFixed(0)}K`;
                  return val.toLocaleString();
                };

                const formatChangeOz = (val) => {
                  if (!val && val !== 0) return '—';
                  const sign = val > 0 ? '+' : '';
                  return `${sign}${Math.round(val).toLocaleString()} oz`;
                };

                const chartDataPoints = currentVaultData.map(d => d.registered_oz).filter(v => v > 0);

                const ratio = latestVault?.oversubscribed_ratio || 0;
                const ratioWarning = ratio > 3.0 ? { icon: '🔥', label: 'Supply squeeze territory', color: '#F87171' }
                  : ratio > 2.0 ? { icon: '⚠️', label: 'Elevated', color: '#FBBF24' }
                  : null;

                const bullishColor = '#D4A843';
                const bearishColor = colors.muted;
                const getChangeColor = (val) => val < 0 ? bullishColor : val > 0 ? bearishColor : colors.muted;
                const getChangeArrow = (val) => val < 0 ? '▼' : val > 0 ? '▲' : '';

                return (
                  <View style={{ marginBottom: 16 }}>
                      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
                        {vaultMetals.map(m => (
                          <TouchableOpacity
                            key={m.key}
                            style={{
                              paddingVertical: 6,
                              paddingHorizontal: 14,
                              borderRadius: 16,
                              backgroundColor: activeMetal === m.key ? `${m.color}20` : 'transparent',
                              borderWidth: 1,
                              borderColor: activeMetal === m.key ? m.color : isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
                            }}
                            onPress={() => {
                              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                              setVaultMetal(m.key);
                            }}
                          >
                            <Text style={{ color: activeMetal === m.key ? m.color : colors.muted, fontSize: scaledFonts.small, fontWeight: '700' }}>{m.label}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>

                      {vaultLoading && !latestVault ? (
                        <View style={{
                          backgroundColor: todayCardBg,
                          borderRadius: 12,
                          borderWidth: 1,
                          borderColor: todayCardBorder,
                          padding: 20,
                        }}>
                          <View style={{ width: '60%', height: 14, backgroundColor: isDarkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)', borderRadius: 4, marginBottom: 12 }} />
                          <View style={{ width: '40%', height: 24, backgroundColor: isDarkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)', borderRadius: 4, marginBottom: 8 }} />
                          <View style={{ width: '80%', height: 10, backgroundColor: isDarkMode ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)', borderRadius: 4 }} />
                        </View>
                      ) : latestVault ? (
                        <View style={{
                          backgroundColor: todayCardBg,
                          borderRadius: 12,
                          borderWidth: 1,
                          borderColor: todayCardBorder,
                          overflow: 'hidden',
                        }}>
                          <View style={{ padding: 16 }}>
                            <View style={{ marginBottom: 14 }}>
                              <Text style={{ color: colors.muted, fontSize: scaledFonts.tiny, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4 }}>Registered</Text>
                              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 10 }}>
                                <Text style={{ color: colors.text, fontSize: scaledFonts.xlarge, fontWeight: '700' }}>{formatOzCompact(latestVault.registered_oz)} oz</Text>
                                {latestVault.registered_change_oz !== 0 && (
                                  <Text style={{ color: getChangeColor(latestVault.registered_change_oz), fontSize: scaledFonts.small, fontWeight: '600' }}>
                                    {getChangeArrow(latestVault.registered_change_oz)} {formatChangeOz(latestVault.registered_change_oz)}
                                  </Text>
                                )}
                              </View>
                            </View>

                            {effHasGoldAccess ? (
                              <>
                                <View style={{ marginBottom: 14 }}>
                                  <Text style={{ color: colors.muted, fontSize: scaledFonts.tiny, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4 }}>Eligible</Text>
                                  <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 10 }}>
                                    <Text style={{ color: latestVault.eligible_oz ? colors.text : colors.muted, fontSize: scaledFonts.large, fontWeight: '600' }}>{latestVault.eligible_oz ? `${formatOzCompact(latestVault.eligible_oz)} oz` : 'N/A'}</Text>
                                    {latestVault.eligible_oz > 0 && latestVault.eligible_change_oz !== 0 && (
                                      <Text style={{ color: getChangeColor(latestVault.eligible_change_oz), fontSize: scaledFonts.small, fontWeight: '600' }}>
                                        {getChangeArrow(latestVault.eligible_change_oz)} {formatChangeOz(latestVault.eligible_change_oz)}
                                      </Text>
                                    )}
                                  </View>
                                </View>

                                <View style={{ marginBottom: 14 }}>
                                  <Text style={{ color: colors.muted, fontSize: scaledFonts.tiny, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4 }}>Combined</Text>
                                  <Text style={{ color: colors.text, fontSize: scaledFonts.large, fontWeight: '600' }}>{formatOzCompact(latestVault.combined_oz)} oz</Text>
                                </View>

                                <View style={{ marginBottom: 4 }}>
                                  <Text style={{ color: colors.muted, fontSize: scaledFonts.tiny, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4 }}>Oversubscribed Ratio</Text>
                                  {ratio > 0 ? (
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                                      <Text style={{ color: ratio > 2 ? '#FBBF24' : colors.text, fontSize: scaledFonts.xlarge, fontWeight: '700' }}>{ratio.toFixed(1)}x</Text>
                                      {ratioWarning && (
                                        <View style={{
                                          flexDirection: 'row',
                                          alignItems: 'center',
                                          gap: 4,
                                          backgroundColor: `${ratioWarning.color}15`,
                                          borderRadius: 6,
                                          paddingHorizontal: 8,
                                          paddingVertical: 3,
                                        }}>
                                          <Text style={{ fontSize: scaledFonts.small }}>{ratioWarning.icon}</Text>
                                          <Text style={{ color: ratioWarning.color, fontSize: scaledFonts.tiny, fontWeight: '600' }}>{ratioWarning.label}</Text>
                                        </View>
                                      )}
                                    </View>
                                  ) : (
                                    <Text style={{ color: colors.muted, fontSize: scaledFonts.xlarge, fontWeight: '700' }}>N/A</Text>
                                  )}
                                </View>
                              </>
                            ) : (
                              <>
                                <View style={{ marginBottom: 14 }}>
                                  <Text style={{ color: colors.muted, fontSize: scaledFonts.tiny, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4 }}>Eligible</Text>
                                  <Text style={{ color: colors.muted, fontSize: scaledFonts.large, fontWeight: '600' }}>{'••••••'} oz</Text>
                                </View>
                                <View style={{ marginBottom: 14 }}>
                                  <Text style={{ color: colors.muted, fontSize: scaledFonts.tiny, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4 }}>Combined</Text>
                                  <Text style={{ color: colors.muted, fontSize: scaledFonts.large, fontWeight: '600' }}>{'••••••'} oz</Text>
                                </View>
                                <View style={{ marginBottom: 4 }}>
                                  <Text style={{ color: colors.muted, fontSize: scaledFonts.tiny, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4 }}>Oversubscribed Ratio</Text>
                                  <Text style={{ color: colors.muted, fontSize: scaledFonts.xlarge, fontWeight: '700' }}>{'•••'}x</Text>
                                </View>
                              </>
                            )}
                          </View>

                          <View style={{ height: 1, backgroundColor: 'rgba(212,168,67,0.15)', marginHorizontal: 16 }} />

                          {chartDataPoints.length >= 2 ? (
                            effHasGoldAccess ? (
                              <View style={{ paddingVertical: 12, paddingHorizontal: 4 }}>
                                <Text style={{ color: colors.muted, fontSize: scaledFonts.tiny, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8, marginLeft: 12 }}>Registered Inventory (30d)</Text>
                                <ScrubChart
                                  data={currentVaultData.filter(d => d.registered_oz > 0).map(d => ({ date: d.date, value: d.registered_oz }))}
                                  color={currentVaultColor}
                                  width={SCREEN_WIDTH - 56}
                                  height={160}
                                  range="1M"
                                  chartId="vaultWatchToday"
                                  yFormat={(v) => {
                                    if (v >= 1e9) return `${(v / 1e9).toFixed(1)}B`;
                                    if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
                                    if (v >= 1e3) return `${(v / 1e3).toFixed(0)}K`;
                                    return v.toLocaleString();
                                  }}
                                  tooltipFormat={(v) => `${Math.round(v).toLocaleString()} oz`}
                                />
                              </View>
                            ) : (
                              <TouchableOpacity
                                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setShowPaywallModal(true); }}
                                style={{ margin: 12, height: 200, borderWidth: 1.5, borderColor: 'rgba(212, 168, 67, 0.3)', borderStyle: 'dashed', borderRadius: 12, justifyContent: 'center', alignItems: 'center', backgroundColor: isDarkMode ? 'rgba(212, 168, 67, 0.03)' : 'rgba(212, 168, 67, 0.05)' }}
                              >
                                <Text style={{ fontSize: scaledFonts.tiny, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.8, color: colors.muted, marginBottom: 12 }}>30-day inventory trend</Text>
                                <Text style={{ fontSize: 28, marginBottom: 8 }}>{'🔒'}</Text>
                                <Text style={{ color: colors.gold, fontSize: scaledFonts.small, fontWeight: '600' }}>Available with Gold</Text>
                              </TouchableOpacity>
                            )
                          ) : chartDataPoints.length > 0 ? (
                            <View style={{ paddingVertical: 16, paddingHorizontal: 16 }}>
                              <Text style={{ color: colors.muted, fontSize: scaledFonts.small, textAlign: 'center', fontStyle: 'italic' }}>Chart available after 2+ days of data collection</Text>
                            </View>
                          ) : null}

                          <View style={{ paddingHorizontal: 16, paddingBottom: 12, paddingTop: 4 }}>
                            <Text style={{ color: colors.muted, fontSize: scaledFonts.tiny, opacity: 0.6 }}>Source: CME Group {'\u00B7'} Updated daily</Text>
                          </View>
                        </View>
                      ) : (
                        <View style={{
                          backgroundColor: todayCardBg,
                          borderRadius: 12,
                          borderWidth: 1,
                          borderColor: todayCardBorder,
                          padding: 24,
                          alignItems: 'center',
                        }}>
                          <Text style={{ color: colors.muted, fontSize: scaledFonts.normal, textAlign: 'center' }}>Vault data updating...</Text>
                          <Text style={{ color: colors.muted, fontSize: scaledFonts.small, marginTop: 4, textAlign: 'center' }}>Check back soon for COMEX inventory data</Text>
                        </View>
                      )}

                    {!effHasGoldAccess && (
                      <>
                        <TouchableOpacity
                          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setShowPaywallModal(true); }}
                          style={{ marginTop: 10, borderWidth: 1, borderColor: 'rgba(212, 168, 67, 0.3)', borderRadius: 10, paddingVertical: 10, paddingHorizontal: 16, alignItems: 'center' }}
                        >
                          <Text style={{ color: colors.gold, fontSize: scaledFonts.small, fontWeight: '600' }}>Unlock with Gold</Text>
                          <Text style={{ color: colors.muted, fontSize: scaledFonts.tiny, marginTop: 2 }}>$4.99/mo · Cancel anytime</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={handleRestore} style={{ marginTop: 6, alignItems: 'center' }}>
                          <Text style={{ color: colors.muted, fontSize: scaledFonts.tiny, textDecorationLine: 'underline' }}>Restore Purchases</Text>
                        </TouchableOpacity>
                      </>
                    )}
                  </View>
                );
              })()}
              {/* Troy one-liner — Vault Watch */}
              {(() => {
                const vd = vaultData[vaultMetal] || [];
                const latest = vd.length > 0 ? vd[vd.length - 1] : null;
                if (!latest) return null;
                const regChange = latest.registered_change_oz || 0;
                const metalLabel = vaultMetal === 'gold' ? 'gold' : vaultMetal === 'silver' ? 'silver' : vaultMetal === 'platinum' ? 'platinum' : 'palladium';
                const absChange = Math.abs(regChange);
                let liner;
                if (regChange < 0) {
                  const ctx = absChange > 1e6 ? 'significant drawdown' : absChange > 500000 ? 'drawdowns continue' : absChange > 100000 ? 'steady bleed' : 'minor movement';
                  liner = <Text style={{ color: colors.muted, fontSize: scaledFonts.small, lineHeight: scaledFonts.small * 1.5, fontStyle: 'italic', flex: 1 }}>COMEX {metalLabel} registered down <Text style={{ fontWeight: '700' }}>{Math.round(absChange).toLocaleString()} oz</Text> — {ctx}.</Text>;
                } else if (regChange > 0) {
                  const ctx = absChange > 1e6 ? 'notable restocking' : absChange > 500000 ? 'some restocking' : 'minor addition';
                  liner = <Text style={{ color: colors.muted, fontSize: scaledFonts.small, lineHeight: scaledFonts.small * 1.5, fontStyle: 'italic', flex: 1 }}>COMEX {metalLabel} registered added <Text style={{ fontWeight: '700' }}>{Math.round(absChange).toLocaleString()} oz</Text> — {ctx}.</Text>;
                } else {
                  liner = <Text style={{ color: colors.muted, fontSize: scaledFonts.small, lineHeight: scaledFonts.small * 1.5, fontStyle: 'italic', flex: 1 }}>COMEX {metalLabel} inventories holding steady.</Text>;
                }
                return (
                  <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginTop: 10 }}>
                    <Image source={TROY_AVATAR} style={{ width: 14, height: 14, borderRadius: 7 }} />
                    {liner}
                  </View>
                );
              })()}
              </View>

              {/* ===== STACK SIGNAL TEASER ===== */}
              <TouchableOpacity
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setCurrentScreen('StackSignal'); setTimeout(() => { scrollRef.current?.scrollTo({ y: 0, animated: false }); }, 100); }}
                activeOpacity={0.7}
                style={{
                  backgroundColor: todayCardBg,
                  borderRadius: 14,
                  borderWidth: 1,
                  borderColor: todayCardBorder,
                  padding: 16,
                  marginBottom: 16,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                }}
              >
                <View style={{
                  width: 40,
                  height: 40,
                  borderRadius: 20,
                  backgroundColor: 'rgba(212,168,67,0.12)',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                  <StackSignalIcon size={24} color={colors.gold} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.text, fontSize: scaledFonts.medium, fontWeight: '600' }}>The Stack Signal</Text>
                  <Text style={{ color: colors.muted, fontSize: scaledFonts.small, marginTop: 2 }}>
                    {stackSignalDaily?.title ? stackSignalDaily.title : 'Daily market synthesis & curated articles'}
                  </Text>
                </View>
                <Text style={{ color: colors.gold, fontSize: 18 }}>{'\u203A'}</Text>
              </TouchableOpacity>

              {/* ===== FOOTER ===== */}
              <View style={{ alignItems: 'center', paddingVertical: 24, marginBottom: 20 }}>
                <Text style={{ color: colors.muted, fontSize: scaledFonts.tiny, opacity: 0.6 }}>Powered by TroyStack</Text>
              </View>

            </View>
          );
        })()}



        {/* PORTFOLIO TAB */}
        {currentScreen === 'MyStack' && (() => {
          // Compile all items with metal tag
          const allItemsRaw = [
            ...silverItems.map(i => ({ ...i, metal: 'silver' })),
            ...goldItems.map(i => ({ ...i, metal: 'gold' })),
            ...platinumItems.map(i => ({ ...i, metal: 'platinum' })),
            ...palladiumItems.map(i => ({ ...i, metal: 'palladium' })),
          ];

          // Metal pill filter
          const metalFiltered = metalTab === 'both' ? allItemsRaw : allItemsRaw.filter(i => i.metal === metalTab);

          // Search filter
          const searchFiltered = stackSearchQuery.trim()
            ? metalFiltered.filter(item =>
                (item.productName && item.productName.toLowerCase().includes(stackSearchQuery.toLowerCase().trim())) ||
                (item.source && item.source.toLowerCase().includes(stackSearchQuery.toLowerCase().trim()))
              )
            : metalFiltered;

          // Sort
          const spotMapLocal = { silver: silverSpot, gold: goldSpot, platinum: platinumSpot, palladium: palladiumSpot };
          const sorted = [...searchFiltered].sort((a, b) => {
            switch (sortBy) {
              case 'date-newest':
                if (!a.datePurchased) return 1;
                if (!b.datePurchased) return -1;
                return new Date(b.datePurchased) - new Date(a.datePurchased);
              case 'date-oldest':
                if (!a.datePurchased) return 1;
                if (!b.datePurchased) return -1;
                return new Date(a.datePurchased) - new Date(b.datePurchased);
              case 'value-high':
                return (b.ozt * b.quantity * (spotMapLocal[b.metal] || 0)) - (a.ozt * a.quantity * (spotMapLocal[a.metal] || 0));
              case 'value-low':
                return (a.ozt * a.quantity * (spotMapLocal[a.metal] || 0)) - (b.ozt * b.quantity * (spotMapLocal[b.metal] || 0));
              case 'name':
                return (a.productName || '').localeCompare(b.productName || '');
              default:
                return 0;
            }
          });

          // Infer item type from product name
          const inferType = (name) => {
            if (!name) return 'Other';
            const n = name.toLowerCase();
            if (n.includes('bar') || n.includes('kilo')) return 'Bar';
            if (n.includes('round')) return 'Round';
            if (n.includes('constitutional') || n.includes('junk') || n.includes('90%') || n.includes('40%')) return 'Constitutional';
            if (n.includes('proof')) return 'Proof';
            if (n.includes('coin') || n.includes('eagle') || n.includes('maple') || n.includes('krugerrand') || n.includes('buffalo') || n.includes('philharmonic') || n.includes('britannia') || n.includes('panda') || n.includes('kangaroo') || n.includes('libertad') || n.includes('sovereign')) return 'Coin';
            return 'Other';
          };

          const metalLabels = { silver: 'Silver', gold: 'Gold', platinum: 'Platinum', palladium: 'Palladium' };
          const metalDots = { silver: '#C0C0C0', gold: '#D4A843', platinum: '#7BB3D4', palladium: '#6BBF8A' };

          // Group items into sections
          let sections = [];
          if (stackGroupBy === 'metal') {
            const groups = {};
            sorted.forEach(item => {
              const key = item.metal;
              if (!groups[key]) groups[key] = [];
              groups[key].push(item);
            });
            ['gold', 'silver', 'platinum', 'palladium'].forEach(m => {
              if (groups[m]) sections.push({ key: m, label: metalLabels[m], color: metalDots[m], items: groups[m] });
            });
          } else if (stackGroupBy === 'type') {
            const groups = {};
            sorted.forEach(item => {
              const key = inferType(item.productName);
              if (!groups[key]) groups[key] = [];
              groups[key].push(item);
            });
            ['Coin', 'Bar', 'Round', 'Constitutional', 'Proof', 'Other'].forEach(t => {
              if (groups[t]) sections.push({ key: t, label: t, color: colors.gold, items: groups[t] });
            });
          } else if (stackGroupBy === 'dealer') {
            const groups = {};
            sorted.forEach(item => {
              const key = item.source || 'Unknown';
              if (!groups[key]) groups[key] = [];
              groups[key].push(item);
            });
            Object.keys(groups).sort().forEach(d => {
              sections.push({ key: d, label: d, color: colors.gold, items: groups[d] });
            });
          }

          // Key metrics
          const totalItems = silverItems.length + goldItems.length + platinumItems.length + palladiumItems.length;
          const totalPieces = allItemsRaw.reduce((sum, i) => sum + (i.quantity || 1), 0);
          const primaryMetal = totalSilverOzt >= totalGoldOzt && totalSilverOzt >= totalPlatinumOzt && totalSilverOzt >= totalPalladiumOzt ? 'silver'
            : totalGoldOzt >= totalPlatinumOzt && totalGoldOzt >= totalPalladiumOzt ? 'gold'
            : totalPlatinumOzt >= totalPalladiumOzt ? 'platinum' : 'palladium';
          const primaryDCA = { silver: avgSilverCostPerOz, gold: avgGoldCostPerOz, platinum: avgPlatinumCostPerOz, palladium: avgPalladiumCostPerOz }[primaryMetal];

          // Avg premium/oz for primary metal
          const primaryItems = { silver: silverItems, gold: goldItems, platinum: platinumItems, palladium: palladiumItems }[primaryMetal];
          const itemsWithSpot = primaryItems.filter(i => i.spotPrice > 0);
          const avgPremPerOz = itemsWithSpot.length > 0
            ? itemsWithSpot.reduce((sum, i) => sum + ((i.unitPrice - i.spotPrice) * i.quantity), 0) / itemsWithSpot.reduce((sum, i) => sum + i.quantity, 0)
            : null;

          const isGainTotal = totalGainLoss >= 0;

          // Toggle section collapse
          const toggleSection = (key) => {
            setCollapsedSections(prev => {
              const next = new Set(prev);
              if (next.has(key)) next.delete(key);
              else next.add(key);
              return next;
            });
          };

          // Render a holding card
          const renderHoldingCard = (item, index) => {
            const itemSpot = spotMapLocal[item.metal] || 0;
            const meltValue = item.ozt * item.quantity * itemSpot;
            const costBasis = getItemCostBasis(item);
            const gainLoss = meltValue - costBasis;
            const gainLossPct = costBasis > 0 ? (gainLoss / costBasis) * 100 : 0;
            const isGain = gainLoss >= 0;
            const costPerOz = (item.ozt * item.quantity) > 0 ? costBasis / (item.ozt * item.quantity) : 0;
            const itemType = inferType(item.productName);
            const dotColor = metalDots[item.metal] || '#888';

            return (
              <TouchableOpacity
                key={item.supabase_id || `${item.metal}-${item.id}-${index}`}
                style={{
                  backgroundColor: '#141414',
                  borderRadius: 12,
                  padding: 16,
                  marginBottom: 8,
                  borderWidth: 1,
                  borderColor: '#222',
                  borderLeftWidth: 3,
                  borderLeftColor: dotColor,
                }}
                onPress={() => viewItemDetail(item, item.metal)}
                activeOpacity={0.7}
              >
                {/* Top line: metadata badges */}
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8, flexWrap: 'wrap', gap: 6 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: dotColor }} />
                    <Text style={{ color: '#888', fontSize: scaledFonts.tiny }}>{metalLabels[item.metal]}</Text>
                  </View>
                  {itemType !== 'Other' && (
                    <>
                      <Text style={{ color: '#555', fontSize: scaledFonts.tiny }}>·</Text>
                      <Text style={{ color: '#888', fontSize: scaledFonts.tiny }}>{itemType}</Text>
                    </>
                  )}
                  {item.source ? (
                    <>
                      <Text style={{ color: '#555', fontSize: scaledFonts.tiny }}>·</Text>
                      <Text style={{ color: '#888', fontSize: scaledFonts.tiny }} numberOfLines={1}>{item.source}</Text>
                    </>
                  ) : null}
                  {item.datePurchased ? (
                    <>
                      <Text style={{ color: '#555', fontSize: scaledFonts.tiny }}>·</Text>
                      <Text style={{ color: '#888', fontSize: scaledFonts.tiny }}>{formatDateDisplay(item.datePurchased)}</Text>
                    </>
                  ) : null}
                </View>

                {/* Product name */}
                <Text style={{ color: '#fff', fontSize: scaledFonts.normal, fontWeight: '600', marginBottom: 10 }} numberOfLines={1}>{item.productName}</Text>

                {/* Main stats: two columns */}
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                  <View>
                    <Text style={{ color: '#fff', fontSize: scaledFonts.normal, fontWeight: '600' }}>{formatOunces(item.ozt * item.quantity)} oz</Text>
                    {item.quantity > 1 && (
                      <Text style={{ color: '#888', fontSize: scaledFonts.tiny, marginTop: 2 }}>Qty: {item.quantity}</Text>
                    )}
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={{ color: '#fff', fontSize: scaledFonts.normal, fontWeight: '700' }}>${formatSmartCurrency(meltValue)}</Text>
                    <Text style={{ color: isGain ? colors.success : colors.error, fontSize: scaledFonts.small, fontWeight: '600', marginTop: 2 }}>
                      {isGain ? '+' : ''}{formatCurrency(gainLoss)} ({isGain ? '+' : ''}{gainLossPct.toFixed(1)}%)
                    </Text>
                  </View>
                </View>

                {/* Bottom line: cost basis detail */}
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.05)', paddingTop: 8 }}>
                  <Text style={{ color: '#666', fontSize: scaledFonts.tiny }}>Cost: ${formatCurrency(costPerOz)}/oz</Text>
                  {item.spotPrice > 0 && (
                    <>
                      <Text style={{ color: '#444', fontSize: scaledFonts.tiny }}>·</Text>
                      <Text style={{ color: '#666', fontSize: scaledFonts.tiny }}>Spot: ${formatCurrency(item.spotPrice)}</Text>
                      <Text style={{ color: '#444', fontSize: scaledFonts.tiny }}>·</Text>
                      <Text style={{ color: '#666', fontSize: scaledFonts.tiny }}>Prem: ${formatCurrency(item.unitPrice - item.spotPrice)}</Text>
                    </>
                  )}
                </View>
              </TouchableOpacity>
            );
          };

          return (
            <>
              {/* ===== SECTION 1: STACK SUMMARY HEADER ===== */}
              <View onLayout={(e) => { sectionOffsets.current['portfolioSummary'] = e.nativeEvent.layout.y; }} style={{ backgroundColor: '#141414', borderRadius: 16, padding: 20, marginBottom: 16, borderWidth: 1, borderColor: '#222' }}>
                {/* Row 1: Total Value + P&L */}
                <Text style={{ color: colors.gold, fontSize: 11, fontWeight: '700', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 8 }}>YOUR STACK</Text>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                  <View style={{ flex: 1 }}>
                    <Text
                      style={{ color: '#fff', fontSize: Math.round(32 * fontScale), fontWeight: '700' }}
                      numberOfLines={1}
                      adjustsFontSizeToFit={true}
                    >
                      ${formatSmartCurrency(demoData ? demoData.totalMeltValue : totalMeltValue)}
                    </Text>
                    <Text style={{ color: '#888', fontSize: scaledFonts.tiny, marginTop: 2 }}>Total Value</Text>
                  </View>
                  {totalCostBasis > 0 && (
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={{ color: isGainTotal ? colors.success : colors.error, fontSize: scaledFonts.medium, fontWeight: '700' }}>
                        {isGainTotal ? '+' : ''}{formatCurrency(totalGainLoss)}
                      </Text>
                      <Text style={{ color: isGainTotal ? colors.success : colors.error, fontSize: scaledFonts.small }}>
                        ({isGainTotal ? '+' : ''}{totalGainLossPct.toFixed(1)}%)
                      </Text>
                      <Text style={{ color: '#888', fontSize: scaledFonts.tiny, marginTop: 2 }}>Total Gain</Text>
                    </View>
                  )}
                </View>

                {/* Row 2: Metal Breakdown Pills */}
                {totalItems > 0 && (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      {[
                        { key: 'gold', sym: 'Au', ozt: totalGoldOzt, color: '#D4A843' },
                        { key: 'silver', sym: 'Ag', ozt: totalSilverOzt, color: '#C0C0C0' },
                        { key: 'platinum', sym: 'Pt', ozt: totalPlatinumOzt, color: '#7BB3D4' },
                        { key: 'palladium', sym: 'Pd', ozt: totalPalladiumOzt, color: '#6BBF8A' },
                      ].filter(m => m.ozt > 0).map(m => (
                        <TouchableOpacity
                          key={m.key}
                          onPress={() => {
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                            setMetalTab(metalTab === m.key ? 'both' : m.key);
                          }}
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            backgroundColor: metalTab === m.key ? `${m.color}20` : 'rgba(255,255,255,0.05)',
                            borderRadius: 20,
                            paddingHorizontal: 12,
                            paddingVertical: 6,
                            borderWidth: 1,
                            borderColor: metalTab === m.key ? `${m.color}40` : 'rgba(255,255,255,0.08)',
                            gap: 6,
                          }}
                        >
                          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: m.color }} />
                          <Text style={{ color: metalTab === m.key ? m.color : '#ccc', fontSize: scaledFonts.small, fontWeight: '600' }}>
                            {m.sym}: {formatOunces(m.ozt, m.key === 'silver' ? 2 : 3)} oz
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </ScrollView>
                )}

                {/* Row 3: Key Metrics */}
                {totalItems > 0 && (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    <View style={{ flexDirection: 'row', gap: 10 }}>
                      <View style={{ backgroundColor: '#1A1A1A', borderRadius: 12, padding: 12, minWidth: 100, borderWidth: 1, borderColor: '#333' }}>
                        <Text style={{ color: '#888', fontSize: scaledFonts.tiny, marginBottom: 4 }}>DCA/oz</Text>
                        <Text style={{ color: colors.gold, fontSize: scaledFonts.normal, fontWeight: '700' }}>${formatCurrency(primaryDCA)}</Text>
                        <Text style={{ color: '#666', fontSize: 10 }}>{metalLabels[primaryMetal]}</Text>
                      </View>
                      <View style={{ backgroundColor: '#1A1A1A', borderRadius: 12, padding: 12, minWidth: 100, borderWidth: 1, borderColor: '#333' }}>
                        <Text style={{ color: '#888', fontSize: scaledFonts.tiny, marginBottom: 4 }}>Avg Prem</Text>
                        <Text style={{ color: colors.gold, fontSize: scaledFonts.normal, fontWeight: '700' }}>
                          {avgPremPerOz !== null ? `$${formatCurrency(avgPremPerOz)}/oz` : '\u2014'}
                        </Text>
                        <Text style={{ color: '#666', fontSize: 10 }}>{metalLabels[primaryMetal]}</Text>
                      </View>
                      <View style={{ backgroundColor: '#1A1A1A', borderRadius: 12, padding: 12, minWidth: 100, borderWidth: 1, borderColor: '#333' }}>
                        <Text style={{ color: '#888', fontSize: scaledFonts.tiny, marginBottom: 4 }}>Total Pcs</Text>
                        <Text style={{ color: '#fff', fontSize: scaledFonts.normal, fontWeight: '700' }}>{totalPieces.toLocaleString()}</Text>
                      </View>
                      <View style={{ backgroundColor: '#1A1A1A', borderRadius: 12, padding: 12, minWidth: 100, borderWidth: 1, borderColor: '#333' }}>
                        <Text style={{ color: '#888', fontSize: scaledFonts.tiny, marginBottom: 4 }}>Holdings</Text>
                        <Text style={{ color: '#fff', fontSize: scaledFonts.normal, fontWeight: '700' }}>{totalItems}</Text>
                      </View>
                    </View>
                  </ScrollView>
                )}

                {/* Troy one-liner — Stack summary */}
                {totalCostBasis > 0 && (() => {
                  const pct = totalGainLossPct;
                  const absPct = Math.abs(pct).toFixed(1);
                  // Find largest holding by oz
                  const metals = [
                    { label: 'gold', ozt: totalGoldOzt },
                    { label: 'silver', ozt: totalSilverOzt },
                    { label: 'platinum', ozt: totalPlatinumOzt },
                    { label: 'palladium', ozt: totalPalladiumOzt },
                  ].filter(m => m.ozt > 0).sort((a, b) => b.ozt - a.ozt);
                  const largest = metals[0];
                  const suffix = largest && metals.length > 1
                    ? <Text> {largest.label.charAt(0).toUpperCase() + largest.label.slice(1)} doing the heavy lifting at <Text style={{ fontWeight: '700' }}>{formatOunces(largest.ozt, largest.label === 'silver' ? 0 : 2)} oz</Text>.</Text>
                    : '.';
                  let msg;
                  if (pct > 50) {
                    msg = <Text style={{ color: colors.muted, fontSize: scaledFonts.small, lineHeight: scaledFonts.small * 1.5, fontStyle: 'italic', flex: 1 }}>Your stack is up <Text style={{ fontWeight: '700' }}>{absPct}%</Text> all-time — patience pays in metal.{suffix}</Text>;
                  } else if (pct > 20) {
                    msg = <Text style={{ color: colors.muted, fontSize: scaledFonts.small, lineHeight: scaledFonts.small * 1.5, fontStyle: 'italic', flex: 1 }}>Up <Text style={{ fontWeight: '700' }}>{absPct}%</Text> since you started stacking — the thesis is working.{suffix}</Text>;
                  } else if (pct > 0) {
                    msg = <Text style={{ color: colors.muted, fontSize: scaledFonts.small, lineHeight: scaledFonts.small * 1.5, fontStyle: 'italic', flex: 1 }}>Stack is green at <Text style={{ fontWeight: '700' }}>+{absPct}%</Text> — every oz is doing its job.{suffix}</Text>;
                  } else {
                    msg = <Text style={{ color: colors.muted, fontSize: scaledFonts.small, lineHeight: scaledFonts.small * 1.5, fontStyle: 'italic', flex: 1 }}>Down <Text style={{ fontWeight: '700' }}>{absPct}%</Text> on paper — stackers buy time, not ticks.</Text>;
                  }
                  return (
                    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginTop: 12 }}>
                      <Image source={TROY_AVATAR} style={{ width: 14, height: 14, borderRadius: 7 }} />
                      {msg}
                    </View>
                  );
                })()}
              </View>

              {/* ===== DEALER PRICE COMPARISON BUTTON ===== */}
              <TouchableOpacity
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  if (!hasGoldAccess) {
                    setShowPaywallModal(true);
                  } else {
                    setCurrentScreen('CompareDealers');
                  }
                }}
                style={{
                  flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                  backgroundColor: colors.cardBg, borderRadius: 14, padding: 14,
                  borderWidth: 1, borderColor: colors.border, marginBottom: 14,
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                  <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: 'rgba(212,168,67,0.15)', alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
                    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
                      <Path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2" stroke={colors.gold} strokeWidth={1.5} strokeLinecap="round" />
                      <Path d="M9 5a2 2 0 012-2h2a2 2 0 012 2v0a2 2 0 01-2 2h-2a2 2 0 01-2-2v0z" stroke={colors.gold} strokeWidth={1.5} />
                      <Path d="M9 12h6M9 16h4" stroke={colors.gold} strokeWidth={1.5} strokeLinecap="round" />
                    </Svg>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.text, fontSize: scaledFonts.normal, fontWeight: '600' }}>Compare Dealer Prices</Text>
                    <Text style={{ color: colors.muted, fontSize: scaledFonts.small, marginTop: 2 }}>Find the lowest premiums on popular products</Text>
                  </View>
                </View>
                {!hasGoldAccess && (
                  <View style={{ backgroundColor: 'rgba(212,168,67,0.2)', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, marginLeft: 8 }}>
                    <Text style={{ color: colors.gold, fontSize: 11, fontWeight: '700' }}>GOLD</Text>
                  </View>
                )}
                <Text style={{ color: colors.muted, fontSize: 18, marginLeft: 8 }}>{'\u203A'}</Text>
              </TouchableOpacity>

              {/* ===== SECTION 2: SORT/FILTER/GROUP BAR ===== */}
              <View onLayout={(e) => { sectionOffsets.current['holdings'] = e.nativeEvent.layout.y; }} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 8 }}>
                {stackSearchVisible ? (
                  <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 10, paddingHorizontal: 12, height: 36 }}>
                    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" style={{ marginRight: 8 }}>
                      <Circle cx="11" cy="11" r="7" stroke="#888" strokeWidth="2" />
                      <Line x1="16.5" y1="16.5" x2="21" y2="21" stroke="#888" strokeWidth="2" strokeLinecap="round" />
                    </Svg>
                    <TextInput
                      style={{ flex: 1, color: '#fff', fontSize: scaledFonts.small, padding: 0 }}
                      placeholder="Search holdings..."
                      placeholderTextColor="#666"
                      value={stackSearchQuery}
                      onChangeText={setStackSearchQuery}
                      autoFocus
                      returnKeyType="done"
                      onSubmitEditing={() => Keyboard.dismiss()}
                    />
                    <TouchableOpacity onPress={() => { setStackSearchQuery(''); setStackSearchVisible(false); }} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                      <Text style={{ color: '#888', fontSize: 16, fontWeight: '600' }}>x</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <>
                    <TouchableOpacity
                      onPress={() => setStackSearchVisible(true)}
                      style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' }}
                    >
                      <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
                        <Circle cx="11" cy="11" r="7" stroke={colors.muted} strokeWidth="2" />
                        <Line x1="16.5" y1="16.5" x2="21" y2="21" stroke={colors.muted} strokeWidth="2" strokeLinecap="round" />
                      </Svg>
                    </TouchableOpacity>
                    <View style={{
                      flex: 1,
                      flexDirection: 'row',
                      backgroundColor: 'rgba(255,255,255,0.08)',
                      borderRadius: 10,
                      padding: 3,
                    }}>
                      {[
                        { key: 'all', label: 'All' },
                        { key: 'metal', label: 'Metal' },
                        { key: 'type', label: 'Type' },
                        { key: 'dealer', label: 'Dealer' },
                      ].map(g => (
                        <TouchableOpacity
                          key={g.key}
                          style={{
                            flex: 1,
                            paddingVertical: 7,
                            borderRadius: 8,
                            alignItems: 'center',
                            backgroundColor: stackGroupBy === g.key ? 'rgba(251,191,36,0.2)' : 'transparent',
                          }}
                          onPress={() => {
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                            setStackGroupBy(g.key);
                            setCollapsedSections(new Set());
                          }}
                        >
                          <Text style={{ color: stackGroupBy === g.key ? colors.gold : colors.muted, fontWeight: '600', fontSize: scaledFonts.small }}>{g.label}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                    <TouchableOpacity
                      style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' }}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        setShowSortMenu(true);
                      }}
                    >
                      <SortIcon size={20} color={colors.muted} />
                    </TouchableOpacity>
                  </>
                )}
              </View>

              {/* Add Purchase + Import CSV */}
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
                <TouchableOpacity style={[styles.button, { flex: 1, backgroundColor: colors.gold }]} onPress={handleAddPurchase}>
                  <Text style={{ color: '#000', fontWeight: '600', fontSize: scaledFonts.normal }}>+ Add Purchase</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.buttonOutline, { flex: 1, borderColor: colors.gold, borderWidth: 1.5 }]} onPress={importSpreadsheet}>
                  <Text style={{ color: colors.gold, fontWeight: '600', fontSize: scaledFonts.normal }}>Import CSV</Text>
                </TouchableOpacity>
              </View>

              {/* ===== SECTION 3: HOLDINGS LIST ===== */}
              {stackGroupBy === 'all' ? (
                <>
                  {sorted.length > 0 ? sorted.map((item, index) => renderHoldingCard(item, index)) : (
                    <View style={styles.emptyState}>
                      <Text style={{ fontSize: 32, marginBottom: 16, color: colors.muted }}>{'\u2014'}</Text>
                      <Text style={{ color: colors.muted, fontSize: scaledFonts.normal }}>
                        {stackSearchQuery.trim() ? 'No matching holdings' : 'No holdings yet'}
                      </Text>
                      {!stackSearchQuery.trim() && (
                        <Text style={{ color: colors.muted, fontSize: scaledFonts.small, marginTop: 8 }}>Tap "+ Add Purchase" to get started</Text>
                      )}
                    </View>
                  )}
                </>
              ) : (
                <>
                  {sections.length > 0 ? sections.map(section => {
                    const sectionOzt = section.items.reduce((sum, i) => sum + (i.ozt * i.quantity), 0);
                    const sectionValue = section.items.reduce((sum, i) => sum + (i.ozt * i.quantity * (spotMapLocal[i.metal] || 0)), 0);
                    const isCollapsed = collapsedSections.has(section.key);

                    return (
                      <View key={section.key} style={{ marginBottom: 12 }}>
                        <TouchableOpacity
                          onPress={() => {
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                            toggleSection(section.key);
                          }}
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            paddingVertical: 10,
                            paddingHorizontal: 4,
                            marginBottom: isCollapsed ? 0 : 8,
                          }}
                        >
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                            <Text style={{ color: section.color, fontWeight: '700', fontSize: scaledFonts.small, textTransform: 'uppercase', letterSpacing: 1 }}>
                              {section.label}
                            </Text>
                            <Text style={{ color: '#888', fontSize: scaledFonts.tiny }}>
                              {section.items.length} {section.items.length === 1 ? 'item' : 'items'}
                            </Text>
                            <Text style={{ color: '#666', fontSize: scaledFonts.tiny }}>
                              {formatOunces(sectionOzt)} oz
                            </Text>
                          </View>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            <Text style={{ color: '#fff', fontSize: scaledFonts.small, fontWeight: '600' }}>
                              ${formatSmartCurrency(sectionValue)}
                            </Text>
                            <Text style={{ color: '#888', fontSize: 12 }}>{isCollapsed ? '\u25B6' : '\u25BC'}</Text>
                          </View>
                        </TouchableOpacity>

                        {!isCollapsed && section.items.map((item, index) => renderHoldingCard(item, index))}
                      </View>
                    );
                  }) : (
                    <View style={styles.emptyState}>
                      <Text style={{ fontSize: 32, marginBottom: 16, color: colors.muted }}>{'\u2014'}</Text>
                      <Text style={{ color: colors.muted, fontSize: scaledFonts.normal }}>
                        {stackSearchQuery.trim() ? 'No matching holdings' : 'No holdings yet'}
                      </Text>
                    </View>
                  )}
                </>
              )}
            </>
          );
        })()}

        {/* ANALYTICS TAB */}
        {currentScreen === 'Analytics' && (() => {
          const effPortfolioIntel = demoData ? demoData.portfolioIntel : portfolioIntel;
          const effAnalyticsSnapshots = demoData ? demoData.analyticsSnapshots : analyticsSnapshots;
          const effHasGoldAccess = demoData ? true : hasGoldAccess;
          const effHasPaidAccess = demoData ? true : hasPaidAccess;
          const effAnalyticsLoading = demoData ? false : analyticsLoading;
          const effPortfolioIntelLoading = demoData ? false : portfolioIntelLoading;
          const effGoldSpotA = demoData ? demoData.goldSpot : goldSpot;
          const effSilverSpotA = demoData ? demoData.silverSpot : silverSpot;
          const effPlatinumSpotA = demoData ? demoData.platinumSpot : platinumSpot;
          const effPalladiumSpotA = demoData ? demoData.palladiumSpot : palladiumSpot;
          const effTotalMeltValueA = demoData ? demoData.totalMeltValue : totalMeltValue;
          return (
          <>
            {/* Inline upgrade bar for non-Gold */}
            {!effHasGoldAccess && (
              <>
                <TouchableOpacity
                  onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setShowPaywallModal(true); }}
                  style={{ marginHorizontal: 2, marginBottom: 8, borderWidth: 1, borderColor: 'rgba(212, 168, 67, 0.3)', borderRadius: 10, paddingVertical: 10, paddingHorizontal: 16, alignItems: 'center', backgroundColor: 'rgba(212, 168, 67, 0.05)' }}
                >
                  <Text style={{ color: colors.gold, fontSize: scaledFonts.small, fontWeight: '600' }}>Unlock advanced analytics — start free</Text>
                  <Text style={{ color: colors.muted, fontSize: scaledFonts.tiny, marginTop: 2 }}>Plans from $4.99/mo · Cancel anytime</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={handleRestore} style={{ marginTop: 6, alignItems: 'center', marginBottom: 4 }}>
                  <Text style={{ color: colors.muted, fontSize: scaledFonts.tiny, textDecorationLine: 'underline' }}>Restore Purchases</Text>
                </TouchableOpacity>
              </>
            )}

            {/* Stack Intelligence */}
            <View onLayout={(e) => { sectionOffsets.current['portfolioIntelligence'] = e.nativeEvent.layout.y; }}>
              {effHasGoldAccess ? (
                <View style={{
                  backgroundColor: colors.cardBg,
                  borderRadius: 16,
                  borderWidth: 1,
                  borderColor: colors.border,
                  borderLeftWidth: 3,
                  borderLeftColor: '#D4A843',
                  padding: 16,
                  marginBottom: 12,
                }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                    <Image source={TROY_AVATAR} style={{ width: 20, height: 20, borderRadius: 10 }} />
                    <Text style={{ color: colors.muted, fontSize: scaledFonts.small, fontWeight: '600' }}>Stack Intelligence</Text>
                  </View>
                  {effPortfolioIntelLoading ? (
                    <ActivityIndicator size="small" color="#D4A843" style={{ paddingVertical: 8 }} />
                  ) : effPortfolioIntel && effPortfolioIntel.text ? (
                    <>
                      <Text style={{ color: colors.text, fontSize: scaledFonts.normal, lineHeight: scaledFonts.normal * 1.5 }} numberOfLines={portfolioIntelExpanded ? undefined : 2}>{effPortfolioIntel.text}</Text>
                      <TouchableOpacity onPress={() => setPortfolioIntelExpanded(!portfolioIntelExpanded)} style={{ marginTop: 4, paddingVertical: 12 }}>
                        <Text style={{ color: '#D4A843', fontSize: scaledFonts.medium, fontWeight: '700' }}>{portfolioIntelExpanded ? 'See less' : 'See more'}</Text>
                      </TouchableOpacity>
                      {portfolioIntelExpanded && <Text style={{ color: '#666', fontSize: scaledFonts.tiny, fontStyle: 'italic' }}>Troy is AI-powered. Not financial advice.</Text>}
                    </>
                  ) : (
                    <Text style={{ color: colors.muted, fontSize: scaledFonts.small, fontStyle: 'italic' }}>
                      Stack intelligence will be available after 6:30 AM EST.
                    </Text>
                  )}
                </View>
              ) : effPortfolioIntel && effPortfolioIntel.text ? (
                <View style={{
                  backgroundColor: colors.cardBg,
                  borderRadius: 16,
                  borderWidth: 1,
                  borderColor: colors.border,
                  borderLeftWidth: 3,
                  borderLeftColor: '#D4A843',
                  padding: 16,
                  marginBottom: 12,
                }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                    <Image source={TROY_AVATAR} style={{ width: 20, height: 20, borderRadius: 10 }} />
                    <Text style={{ color: colors.muted, fontSize: scaledFonts.small, fontWeight: '600' }}>Stack Intelligence</Text>
                  </View>
                  <View style={{ maxHeight: 60, overflow: 'hidden' }}>
                    <Text style={{ color: colors.text, fontSize: scaledFonts.normal, lineHeight: scaledFonts.normal * 1.5 }}>{effPortfolioIntel.text}</Text>
                  </View>
                  <View style={{ height: 40, marginTop: -40 }}>
                    <View style={{ flex: 1, backgroundColor: colors.cardBg, opacity: 0 }} />
                    <View style={{ flex: 1, backgroundColor: colors.cardBg, opacity: 0.4 }} />
                    <View style={{ flex: 1, backgroundColor: colors.cardBg, opacity: 0.7 }} />
                    <View style={{ flex: 1, backgroundColor: colors.cardBg, opacity: 0.95 }} />
                  </View>
                  <TouchableOpacity onPress={() => setShowPaywallModal(true)} style={{ marginTop: 4 }}>
                    <Text style={{ color: '#D4A843', fontSize: scaledFonts.small, fontWeight: '600' }}>Unlock full portfolio intelligence — upgrade to Gold →</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity
                  style={{
                    backgroundColor: colors.cardBg,
                    borderRadius: 16,
                    borderWidth: 1,
                    borderColor: colors.border,
                    borderLeftWidth: 3,
                    borderLeftColor: '#D4A843',
                    padding: 16,
                    marginBottom: 12,
                  }}
                  onPress={() => setShowPaywallModal(true)}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    <Image source={TROY_AVATAR} style={{ width: 20, height: 20, borderRadius: 10 }} />
                    <Text style={{ color: colors.muted, fontSize: scaledFonts.small, fontWeight: '600' }}>Stack Intelligence</Text>
                  </View>
                  <Text style={{ color: colors.muted, fontSize: scaledFonts.small }}>
                    Get Troy's portfolio intelligence — upgrade to Gold
                  </Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 6, backgroundColor: 'rgba(251,191,36,0.15)', alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4 }}>
                    <Text style={{ color: colors.gold, fontSize: scaledFonts.tiny, fontWeight: '600' }}>UPGRADE</Text>
                  </View>
                </TouchableOpacity>
              )}
            </View>

            {/* Analytics Content */}
            <View>
              <>
                {/* Portfolio Value Chart */}
                <View onLayout={(e) => { sectionOffsets.current['portfolioValueChart'] = e.nativeEvent.layout.y; }} style={[styles.card, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <Text style={[styles.cardTitle, { color: colors.text, fontSize: scaledFonts.medium }]}>Stack Value</Text>
                    {effAnalyticsSnapshots.length > 1 && (() => {
                      const first = effAnalyticsSnapshots[0].total_value || 0;
                      const last = effAnalyticsSnapshots[effAnalyticsSnapshots.length - 1].total_value || 0;
                      const pct = first > 0 ? ((last - first) / first * 100) : 0;
                      return (
                        <Text style={{ color: pct >= 0 ? '#4CAF50' : '#F44336', fontSize: scaledFonts.small, fontWeight: '600' }}>
                          {pct >= 0 ? '+' : ''}{pct.toFixed(1)}%
                        </Text>
                      );
                    })()}
                  </View>

                  {/* Time Range Pills */}
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                    {['1M', '3M', '6M', '1Y', '5Y', 'ALL'].map((range) => (
                      <TouchableOpacity
                        key={range}
                        style={{
                          paddingHorizontal: 14,
                          paddingVertical: 6,
                          borderRadius: 8,
                          backgroundColor: analyticsRange === range ? colors.gold : (isDarkMode ? '#27272a' : '#f4f4f5'),
                        }}
                        onPress={() => {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          setAnalyticsRange(range);
                        }}
                      >
                        <Text style={{
                          color: analyticsRange === range ? '#000' : colors.text,
                          fontWeight: analyticsRange === range ? '600' : '400',
                          fontSize: scaledFonts.small,
                        }}>
                          {range === 'ALL' ? 'All' : range}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  {effAnalyticsLoading ? (
                    <View style={{ alignItems: 'center', paddingVertical: 30 }}>
                      <ActivityIndicator size="small" color={colors.gold} />
                    </View>
                  ) : effAnalyticsSnapshots.length > 1 ? (
                    <View style={{ marginTop: 4 }}>
                      <ScrubChart
                        data={effAnalyticsSnapshots.map(s => ({ date: s.date, value: s.total_value || 0 }))}
                        color="#D4A843"
                        fillColor="rgba(212, 168, 67, 0.15)"
                        width={SCREEN_WIDTH - 80}
                        height={190}
                        range={analyticsRange}
                        decimalPlaces={0}
                        chartId="portfolio"
                      />
                    </View>
                  ) : (
                    <View style={{ alignItems: 'center', paddingVertical: 40 }}>
                      <Text style={{ color: colors.muted, textAlign: 'center', fontSize: scaledFonts.normal }}>
                        {silverItems.length === 0 && goldItems.length === 0
                          ? 'Add some holdings to see your stack analytics!'
                          : 'Pull down to refresh'}
                      </Text>
                    </View>
                  )}
                </View>

                {/* Spot Price History — 4 Individual Metal Charts */}
                <View onLayout={(e) => { sectionOffsets.current['spotPriceHistory'] = e.nativeEvent.layout.y; }} style={{ marginBottom: 10, marginLeft: 4 }}>
                  <Text style={{ color: colors.muted, fontSize: scaledFonts.tiny, fontWeight: '600', letterSpacing: 1.2, textTransform: 'uppercase' }}>Historical Spot Prices</Text>
                </View>
                {[
                  { key: 'gold', label: 'Gold', spot: effGoldSpotA, color: '#D4A843', fillColor: 'rgba(212, 168, 67, 0.15)' },
                  { key: 'silver', label: 'Silver', spot: effSilverSpotA, color: '#C0C0C0', fillColor: 'rgba(192, 192, 192, 0.15)' },
                  { key: 'platinum', label: 'Platinum', spot: effPlatinumSpotA, color: '#4A90D9', fillColor: 'rgba(74, 144, 217, 0.15)' },
                  { key: 'palladium', label: 'Palladium', spot: effPalladiumSpotA, color: '#6BBF8A', fillColor: 'rgba(107, 191, 138, 0.15)' },
                ].map(metal => {
                  const mState = spotHistoryMetal[metal.key];
                  const mData = mState.data;
                  const mRange = mState.range;
                  const pctChange = mData && mData.length > 1 ? ((mData[mData.length - 1].value - mData[0].value) / mData[0].value * 100) : 0;

                  return (
                    <View key={metal.key} style={[styles.card, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
                      {/* Header: metal name + price + % change */}
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: metal.color }} />
                          <Text style={{ color: colors.text, fontSize: scaledFonts.medium, fontWeight: '700' }}>{metal.label}</Text>
                          <Text style={{ color: colors.text, fontSize: scaledFonts.normal, fontWeight: '600' }}>${formatCurrency(metal.spot)}</Text>
                        </View>
                        {mData && mData.length > 1 && (
                          <Text style={{ color: pctChange >= 0 ? '#4CAF50' : '#F44336', fontSize: scaledFonts.small, fontWeight: '600' }}>
                            {pctChange >= 0 ? '+' : ''}{pctChange.toFixed(1)}%
                          </Text>
                        )}
                      </View>

                      {/* Time Range Pills */}
                      <View style={{ flexDirection: 'row', gap: 6, marginBottom: 12 }}>
                        {['1M', '3M', '6M', '1Y', '5Y', 'ALL'].map(r => (
                          <TouchableOpacity
                            key={r}
                            style={{
                              paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6,
                              backgroundColor: mRange === r ? metal.color : (isDarkMode ? '#27272a' : '#f4f4f5'),
                            }}
                            onPress={() => {
                              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                              setMetalRange(metal.key, r);
                            }}
                          >
                            <Text style={{ color: mRange === r ? '#000' : colors.text, fontWeight: mRange === r ? '600' : '400', fontSize: scaledFonts.small }}>
                              {r === 'ALL' ? 'All' : r}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>

                      {/* Chart Area */}
                      {mState.loading ? (
                        <View style={{ alignItems: 'center', paddingVertical: 30 }}>
                          <ActivityIndicator size="small" color={metal.color} />
                        </View>
                      ) : mState.error ? (
                        <View style={{ alignItems: 'center', paddingVertical: 30 }}>
                          <Text style={{ color: colors.muted, fontSize: scaledFonts.normal, textAlign: 'center' }}>{mState.error === 'no_data' ? 'No data available for this range' : mState.error}</Text>
                        </View>
                      ) : mData && mData.length > 1 ? (
                        <View style={{ marginTop: 8 }}>
                          <ScrubChart
                            data={mData}
                            color={metal.color}
                            fillColor={metal.fillColor}
                            width={SCREEN_WIDTH - 80}
                            height={175}
                            range={mRange}
                            decimalPlaces={metal.key === 'silver' ? 1 : 0}
                            chartId={metal.key}
                          />
                        </View>
                      ) : (
                        <View style={{ alignItems: 'center', paddingVertical: 30 }}>
                          <Text style={{ color: colors.muted, fontSize: scaledFonts.normal, textAlign: 'center' }}>No data available</Text>
                        </View>
                      )}
                    </View>
                  );
                })}

                {/* Holdings Breakdown */}
                <View onLayout={(e) => { sectionOffsets.current['holdingsBreakdown'] = e.nativeEvent.layout.y; }} style={[styles.card, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
                  <Text style={[styles.cardTitle, { color: colors.text, marginBottom: 12, fontSize: scaledFonts.medium }]}>Holdings Breakdown</Text>
                  {effTotalMeltValueA > 0 ? (
                    effHasPaidAccess ? (
                      <PieChart
                        data={(demoData ? [
                          { label: 'Gold', value: 68.2 * demoData.goldSpot, color: colors.gold },
                          { label: 'Silver', value: 1420 * demoData.silverSpot, color: colors.silver },
                          { label: 'Platinum', value: 7.5 * demoData.platinumSpot, color: colors.platinum },
                          { label: 'Palladium', value: 3.0 * demoData.palladiumSpot, color: colors.palladium },
                        ] : [
                          { label: 'Gold', value: goldMeltValue, color: colors.gold },
                          { label: 'Silver', value: silverMeltValue, color: colors.silver },
                          { label: 'Platinum', value: platinumMeltValue, color: colors.platinum },
                          { label: 'Palladium', value: palladiumMeltValue, color: colors.palladium },
                        ]).filter(d => d.value > 0)}
                        size={160}
                        cardBgColor={colors.cardBg}
                        textColor={colors.text}
                        mutedColor={colors.muted}
                      />
                    ) : (
                      <TouchableOpacity
                        onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setShowPaywallModal(true); }}
                        style={{ height: 180, borderWidth: 1.5, borderColor: 'rgba(212, 168, 67, 0.3)', borderStyle: 'dashed', borderRadius: 12, justifyContent: 'center', alignItems: 'center', backgroundColor: isDarkMode ? 'rgba(212, 168, 67, 0.03)' : 'rgba(212, 168, 67, 0.05)' }}
                      >
                        <Text style={{ fontSize: 28, marginBottom: 8 }}>{'\uD83D\uDD12'}</Text>
                        <Text style={{ color: colors.text, fontSize: scaledFonts.normal, fontWeight: '600', marginBottom: 4 }}>Stack Breakdown</Text>
                        <Text style={{ color: colors.gold, fontSize: scaledFonts.small, fontWeight: '600' }}>Upgrade to unlock</Text>
                      </TouchableOpacity>
                    )
                  ) : (
                    <View style={{ alignItems: 'center', paddingVertical: 20 }}>
                      <Text style={{ color: colors.muted, fontSize: scaledFonts.normal }}>Add holdings to see breakdown</Text>
                    </View>
                  )}
                </View>

                {/* Cost Basis Intelligence */}
                {effHasGoldAccess && effPortfolioIntel && effPortfolioIntel.costBasis ? (
                  <View style={{ backgroundColor: colors.cardBg, borderRadius: 12, borderWidth: 1, borderColor: colors.border, borderLeftWidth: 3, borderLeftColor: '#D4A843', padding: 14, marginHorizontal: 16, marginBottom: 12 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                      <Image source={TROY_AVATAR} style={{ width: 20, height: 20, borderRadius: 10 }} />
                      <Text style={{ color: colors.muted, fontSize: scaledFonts.small, fontWeight: '600' }}>Troy's Take</Text>
                    </View>
                    <Text style={{ color: colors.text, fontSize: scaledFonts.small, lineHeight: scaledFonts.small * 1.5 }} numberOfLines={costBasisIntelExpanded ? undefined : 2}>{effPortfolioIntel.costBasis}</Text>
                    <TouchableOpacity onPress={() => setCostBasisIntelExpanded(!costBasisIntelExpanded)} style={{ marginTop: 4, paddingVertical: 8 }}>
                      <Text style={{ color: '#D4A843', fontSize: scaledFonts.small, fontWeight: '700' }}>{costBasisIntelExpanded ? 'See less' : 'See more'}</Text>
                    </TouchableOpacity>
                    {costBasisIntelExpanded && <Text style={{ color: '#666', fontSize: scaledFonts.tiny, fontStyle: 'italic' }}>AI-generated analysis. Not financial advice.</Text>}
                  </View>
                ) : null}

                {/* Cost Basis Analysis */}
                <View style={[styles.card, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                    <Text style={[styles.cardTitle, { color: colors.text, fontSize: scaledFonts.medium }]}>Cost Basis Analysis</Text>
                    {!effHasGoldAccess && (
                      <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(251, 191, 36, 0.2)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4 }}>
                        <Text style={{ color: colors.gold, fontSize: scaledFonts.tiny, fontWeight: '600' }}>GOLD</Text>
                      </View>
                    )}
                  </View>

                  {/* Gold Analysis */}
                  {goldItems.length > 0 && (
                    <View style={{ marginBottom: 16 }}>
                      <Text style={{ color: colors.gold, fontWeight: '600', marginBottom: 8, fontSize: scaledFonts.normal }}>Gold</Text>
                      {(() => {
                        const totalGoldCost = goldItems.reduce((sum, item) => sum + ((item.unitPrice || 0) * (item.quantity || 1)), 0);
                        const goldMeltValue = totalGoldOzt * goldSpot;
                        const goldPL = goldMeltValue - totalGoldCost;
                        const goldPLPercent = totalGoldCost > 0 ? (goldPL / totalGoldCost) * 100 : 0;
                        const avgGoldCostPerOz = totalGoldOzt > 0 ? totalGoldCost / totalGoldOzt : 0;
                        const goldWithPremium = goldItems.filter(i => (i.premium || 0) > 0);
                        const avgGoldPremium = goldWithPremium.length > 0 ? goldWithPremium.reduce((sum, i) => sum + i.premium * i.quantity, 0) / goldWithPremium.reduce((sum, i) => sum + i.quantity, 0) : null;
                        // Redact values for free users
                        const redact = !effHasGoldAccess;
                        return (
                          <>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                              <Text style={{ color: colors.muted, fontSize: scaledFonts.normal }}>Total Cost</Text>
                              <Text style={{ color: colors.text, fontSize: scaledFonts.normal }}>{redact ? '$•••••' : `$${formatCurrency(totalGoldCost)}`}</Text>
                            </View>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                              <Text style={{ color: colors.muted, fontSize: scaledFonts.normal }}>Current Value</Text>
                              <Text style={{ color: colors.text, fontSize: scaledFonts.normal }}>{redact ? '$•••••' : `$${formatCurrency(goldMeltValue)}`}</Text>
                            </View>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                              <Text style={{ color: colors.muted, fontSize: scaledFonts.normal }}>Avg Cost/oz</Text>
                              <Text style={{ color: colors.text, fontSize: scaledFonts.normal }}>{redact ? '$•••••' : `$${formatCurrency(avgGoldCostPerOz)}`}</Text>
                            </View>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                              <Text style={{ color: colors.muted, fontSize: scaledFonts.normal }}>Unrealized P/L</Text>
                              <Text style={{ color: redact ? colors.muted : (goldPL >= 0 ? colors.success : colors.error), fontSize: scaledFonts.normal }}>
                                {redact ? '$••••• (•••%)' : `${goldPL >= 0 ? '+' : ''}$${formatCurrency(goldPL)} (${goldPLPercent >= 0 ? '+' : ''}${goldPLPercent.toFixed(1)}%)`}
                              </Text>
                            </View>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                              <Text style={{ color: colors.muted, fontSize: scaledFonts.normal }}>Avg Premium Over Spot</Text>
                              <Text style={{ color: colors.text, fontSize: scaledFonts.normal }}>{avgGoldPremium === null ? 'N/A' : (redact ? '$•••••' : `$${formatCurrency(avgGoldPremium)}/unit`)}</Text>
                            </View>
                          </>
                        );
                      })()}
                    </View>
                  )}

                  {/* Silver Analysis */}
                  {silverItems.length > 0 && (
                    <View>
                      <Text style={{ color: colors.silver, fontWeight: '600', marginBottom: 8, fontSize: scaledFonts.normal }}>Silver</Text>
                      {(() => {
                        const totalSilverCost = silverItems.reduce((sum, item) => sum + ((item.unitPrice || 0) * (item.quantity || 1)), 0);
                        const silverMeltValue = totalSilverOzt * silverSpot;
                        const silverPL = silverMeltValue - totalSilverCost;
                        const silverPLPercent = totalSilverCost > 0 ? (silverPL / totalSilverCost) * 100 : 0;
                        const avgSilverCostPerOz = totalSilverOzt > 0 ? totalSilverCost / totalSilverOzt : 0;
                        const silverWithPremium = silverItems.filter(i => (i.premium || 0) > 0);
                        const avgSilverPremium = silverWithPremium.length > 0 ? silverWithPremium.reduce((sum, i) => sum + i.premium * i.quantity, 0) / silverWithPremium.reduce((sum, i) => sum + i.quantity, 0) : null;
                        // Redact values for free users
                        const redact = !effHasGoldAccess;
                        return (
                          <>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                              <Text style={{ color: colors.muted, fontSize: scaledFonts.normal }}>Total Cost</Text>
                              <Text style={{ color: colors.text, fontSize: scaledFonts.normal }}>{redact ? '$•••••' : `$${formatCurrency(totalSilverCost)}`}</Text>
                            </View>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                              <Text style={{ color: colors.muted, fontSize: scaledFonts.normal }}>Current Value</Text>
                              <Text style={{ color: colors.text, fontSize: scaledFonts.normal }}>{redact ? '$•••••' : `$${formatCurrency(silverMeltValue)}`}</Text>
                            </View>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                              <Text style={{ color: colors.muted, fontSize: scaledFonts.normal }}>Avg Cost/oz</Text>
                              <Text style={{ color: colors.text, fontSize: scaledFonts.normal }}>{redact ? '$•••••' : `$${formatCurrency(avgSilverCostPerOz)}`}</Text>
                            </View>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                              <Text style={{ color: colors.muted, fontSize: scaledFonts.normal }}>Unrealized P/L</Text>
                              <Text style={{ color: redact ? colors.muted : (silverPL >= 0 ? colors.success : colors.error), fontSize: scaledFonts.normal }}>
                                {redact ? '$••••• (•••%)' : `${silverPL >= 0 ? '+' : ''}$${formatCurrency(silverPL)} (${silverPLPercent >= 0 ? '+' : ''}${silverPLPercent.toFixed(1)}%)`}
                              </Text>
                            </View>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                              <Text style={{ color: colors.muted, fontSize: scaledFonts.normal }}>Avg Premium Over Spot</Text>
                              <Text style={{ color: colors.text, fontSize: scaledFonts.normal }}>{avgSilverPremium === null ? 'N/A' : (redact ? '$•••••' : `$${formatCurrency(avgSilverPremium)}/unit`)}</Text>
                            </View>
                          </>
                        );
                      })()}
                    </View>
                  )}

                  {/* Platinum Analysis */}
                  {platinumItems.length > 0 && (
                    <View style={{ marginTop: 16 }}>
                      <Text style={{ color: colors.platinum, fontWeight: '600', marginBottom: 8, fontSize: scaledFonts.normal }}>Platinum</Text>
                      {(() => {
                        const totalPtCost = platinumItems.reduce((sum, item) => sum + ((item.unitPrice || 0) * (item.quantity || 1)), 0);
                        const ptMeltValue = totalPlatinumOzt * platinumSpot;
                        const ptPL = ptMeltValue - totalPtCost;
                        const ptPLPercent = totalPtCost > 0 ? (ptPL / totalPtCost) * 100 : 0;
                        const avgPtCostPerOz = totalPlatinumOzt > 0 ? totalPtCost / totalPlatinumOzt : 0;
                        const ptWithPremium = platinumItems.filter(i => (i.premium || 0) > 0);
                        const avgPtPremium = ptWithPremium.length > 0 ? ptWithPremium.reduce((sum, i) => sum + i.premium * i.quantity, 0) / ptWithPremium.reduce((sum, i) => sum + i.quantity, 0) : null;
                        const redact = !effHasGoldAccess;
                        return (
                          <>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                              <Text style={{ color: colors.muted, fontSize: scaledFonts.normal }}>Total Cost</Text>
                              <Text style={{ color: colors.text, fontSize: scaledFonts.normal }}>{redact ? '$•••••' : `$${formatCurrency(totalPtCost)}`}</Text>
                            </View>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                              <Text style={{ color: colors.muted, fontSize: scaledFonts.normal }}>Current Value</Text>
                              <Text style={{ color: colors.text, fontSize: scaledFonts.normal }}>{redact ? '$•••••' : `$${formatCurrency(ptMeltValue)}`}</Text>
                            </View>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                              <Text style={{ color: colors.muted, fontSize: scaledFonts.normal }}>Avg Cost/oz</Text>
                              <Text style={{ color: colors.text, fontSize: scaledFonts.normal }}>{redact ? '$•••••' : `$${formatCurrency(avgPtCostPerOz)}`}</Text>
                            </View>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                              <Text style={{ color: colors.muted, fontSize: scaledFonts.normal }}>Unrealized P/L</Text>
                              <Text style={{ color: redact ? colors.muted : (ptPL >= 0 ? colors.success : colors.error), fontSize: scaledFonts.normal }}>
                                {redact ? '$••••• (•••%)' : `${ptPL >= 0 ? '+' : ''}$${formatCurrency(ptPL)} (${ptPLPercent >= 0 ? '+' : ''}${ptPLPercent.toFixed(1)}%)`}
                              </Text>
                            </View>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                              <Text style={{ color: colors.muted, fontSize: scaledFonts.normal }}>Avg Premium Over Spot</Text>
                              <Text style={{ color: colors.text, fontSize: scaledFonts.normal }}>{avgPtPremium === null ? 'N/A' : (redact ? '$•••••' : `$${formatCurrency(avgPtPremium)}/unit`)}</Text>
                            </View>
                          </>
                        );
                      })()}
                    </View>
                  )}

                  {/* Palladium Analysis */}
                  {palladiumItems.length > 0 && (
                    <View style={{ marginTop: 16 }}>
                      <Text style={{ color: colors.palladium, fontWeight: '600', marginBottom: 8, fontSize: scaledFonts.normal }}>Palladium</Text>
                      {(() => {
                        const totalPdCost = palladiumItems.reduce((sum, item) => sum + ((item.unitPrice || 0) * (item.quantity || 1)), 0);
                        const pdMeltValue = totalPalladiumOzt * palladiumSpot;
                        const pdPL = pdMeltValue - totalPdCost;
                        const pdPLPercent = totalPdCost > 0 ? (pdPL / totalPdCost) * 100 : 0;
                        const avgPdCostPerOz = totalPalladiumOzt > 0 ? totalPdCost / totalPalladiumOzt : 0;
                        const pdWithPremium = palladiumItems.filter(i => (i.premium || 0) > 0);
                        const avgPdPremium = pdWithPremium.length > 0 ? pdWithPremium.reduce((sum, i) => sum + i.premium * i.quantity, 0) / pdWithPremium.reduce((sum, i) => sum + i.quantity, 0) : null;
                        const redact = !effHasGoldAccess;
                        return (
                          <>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                              <Text style={{ color: colors.muted, fontSize: scaledFonts.normal }}>Total Cost</Text>
                              <Text style={{ color: colors.text, fontSize: scaledFonts.normal }}>{redact ? '$•••••' : `$${formatCurrency(totalPdCost)}`}</Text>
                            </View>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                              <Text style={{ color: colors.muted, fontSize: scaledFonts.normal }}>Current Value</Text>
                              <Text style={{ color: colors.text, fontSize: scaledFonts.normal }}>{redact ? '$•••••' : `$${formatCurrency(pdMeltValue)}`}</Text>
                            </View>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                              <Text style={{ color: colors.muted, fontSize: scaledFonts.normal }}>Avg Cost/oz</Text>
                              <Text style={{ color: colors.text, fontSize: scaledFonts.normal }}>{redact ? '$•••••' : `$${formatCurrency(avgPdCostPerOz)}`}</Text>
                            </View>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                              <Text style={{ color: colors.muted, fontSize: scaledFonts.normal }}>Unrealized P/L</Text>
                              <Text style={{ color: redact ? colors.muted : (pdPL >= 0 ? colors.success : colors.error), fontSize: scaledFonts.normal }}>
                                {redact ? '$••••• (•••%)' : `${pdPL >= 0 ? '+' : ''}$${formatCurrency(pdPL)} (${pdPLPercent >= 0 ? '+' : ''}${pdPLPercent.toFixed(1)}%)`}
                              </Text>
                            </View>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                              <Text style={{ color: colors.muted, fontSize: scaledFonts.normal }}>Avg Premium Over Spot</Text>
                              <Text style={{ color: colors.text, fontSize: scaledFonts.normal }}>{avgPdPremium === null ? 'N/A' : (redact ? '$•••••' : `$${formatCurrency(avgPdPremium)}/unit`)}</Text>
                            </View>
                          </>
                        );
                      })()}
                    </View>
                  )}

                  {goldItems.length === 0 && silverItems.length === 0 && platinumItems.length === 0 && palladiumItems.length === 0 && (
                    <Text style={{ color: colors.muted, textAlign: 'center', paddingVertical: 20, fontSize: scaledFonts.normal }}>
                      Add holdings to see cost analysis
                    </Text>
                  )}
                </View>

                {/* Purchase Stats Intelligence */}
                {effHasGoldAccess && effPortfolioIntel && effPortfolioIntel.purchaseStats ? (
                  <View style={{ backgroundColor: colors.cardBg, borderRadius: 12, borderWidth: 1, borderColor: colors.border, borderLeftWidth: 3, borderLeftColor: '#D4A843', padding: 14, marginHorizontal: 16, marginBottom: 12 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                      <Image source={TROY_AVATAR} style={{ width: 20, height: 20, borderRadius: 10 }} />
                      <Text style={{ color: colors.muted, fontSize: scaledFonts.small, fontWeight: '600' }}>Troy's Take</Text>
                    </View>
                    <Text style={{ color: colors.text, fontSize: scaledFonts.small, lineHeight: scaledFonts.small * 1.5 }} numberOfLines={purchaseStatsIntelExpanded ? undefined : 2}>{effPortfolioIntel.purchaseStats}</Text>
                    <TouchableOpacity onPress={() => setPurchaseStatsIntelExpanded(!purchaseStatsIntelExpanded)} style={{ marginTop: 4, paddingVertical: 8 }}>
                      <Text style={{ color: '#D4A843', fontSize: scaledFonts.small, fontWeight: '700' }}>{purchaseStatsIntelExpanded ? 'See less' : 'See more'}</Text>
                    </TouchableOpacity>
                    {purchaseStatsIntelExpanded && <Text style={{ color: '#666', fontSize: scaledFonts.tiny, fontStyle: 'italic' }}>AI-generated analysis. Not financial advice.</Text>}
                  </View>
                ) : null}

                {/* Purchase Stats */}
                <View onLayout={(e) => { sectionOffsets.current['purchaseStatistics'] = e.nativeEvent.layout.y; }} style={[styles.card, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
                  <Text style={[styles.cardTitle, { color: colors.text, marginBottom: 12, fontSize: scaledFonts.medium }]}>Purchase Statistics</Text>

                  {(() => {
                    const allItems = [...goldItems, ...silverItems, ...platinumItems, ...palladiumItems];
                    const itemsWithDates = allItems.filter(i => i.datePurchased);
                    const dealers = [...new Set(allItems.map(i => i.source).filter(Boolean))];

                    // Find earliest and latest purchase
                    const sortedByDate = itemsWithDates.sort((a, b) =>
                      new Date(a.datePurchased) - new Date(b.datePurchased)
                    );
                    const firstPurchase = sortedByDate[0]?.datePurchased;
                    const lastPurchase = sortedByDate[sortedByDate.length - 1]?.datePurchased;

                    return (
                      <>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                          <Text style={{ color: colors.muted, fontSize: scaledFonts.normal }}>Total Items</Text>
                          <Text style={{ color: colors.text, fontSize: scaledFonts.normal }}>{allItems.length}</Text>
                        </View>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                          <Text style={{ color: colors.muted, fontSize: scaledFonts.normal }}>Unique Dealers</Text>
                          <Text style={{ color: colors.text, fontSize: scaledFonts.normal }}>{dealers.length}</Text>
                        </View>
                        {firstPurchase && (
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                            <Text style={{ color: colors.muted, fontSize: scaledFonts.normal }}>First Purchase</Text>
                            <Text style={{ color: colors.text, fontSize: scaledFonts.normal }}>{firstPurchase}</Text>
                          </View>
                        )}
                        {lastPurchase && lastPurchase !== firstPurchase && (
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                            <Text style={{ color: colors.muted, fontSize: scaledFonts.normal }}>Latest Purchase</Text>
                            <Text style={{ color: colors.text, fontSize: scaledFonts.normal }}>{lastPurchase}</Text>
                          </View>
                        )}
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                          <Text style={{ color: colors.muted, fontSize: scaledFonts.normal }}>Total Gold</Text>
                          <Text style={{ color: colors.gold, fontSize: scaledFonts.normal }}>{totalGoldOzt.toFixed(4)} oz</Text>
                        </View>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: totalPlatinumOzt > 0 || totalPalladiumOzt > 0 ? 8 : 0 }}>
                          <Text style={{ color: colors.muted, fontSize: scaledFonts.normal }}>Total Silver</Text>
                          <Text style={{ color: colors.silver, fontSize: scaledFonts.normal }}>{totalSilverOzt.toFixed(4)} oz</Text>
                        </View>
                        {totalPlatinumOzt > 0 && (
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: totalPalladiumOzt > 0 ? 8 : 0 }}>
                            <Text style={{ color: colors.muted, fontSize: scaledFonts.normal }}>Total Platinum</Text>
                            <Text style={{ color: colors.platinum, fontSize: scaledFonts.normal }}>{totalPlatinumOzt.toFixed(4)} oz</Text>
                          </View>
                        )}
                        {totalPalladiumOzt > 0 && (
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                            <Text style={{ color: colors.muted, fontSize: scaledFonts.normal }}>Total Palladium</Text>
                            <Text style={{ color: colors.palladium, fontSize: scaledFonts.normal }}>{totalPalladiumOzt.toFixed(4)} oz</Text>
                          </View>
                        )}
                      </>
                    );
                  })()}
                </View>

                {/* Break-Even Analysis */}
                <View onLayout={(e) => { sectionOffsets.current['breakEvenAnalysis'] = e.nativeEvent.layout.y; }} style={[styles.card, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
                  <Text style={[styles.cardTitle, { color: colors.text, fontSize: scaledFonts.medium }]}>Break-Even Analysis</Text>
                  {totalSilverOzt > 0 && (
                    <View style={{ backgroundColor: `${colors.silver}22`, padding: 12, borderRadius: 8, marginBottom: 8 }}>
                      <Text style={{ color: colors.silver, fontSize: scaledFonts.normal }}>Silver: {effHasPaidAccess ? `$${formatCurrency(silverBreakeven)}` : '$•••••'}/oz needed</Text>
                      <Text style={{ color: colors.muted, fontSize: scaledFonts.tiny }}>{silverSpot >= silverBreakeven ? 'Profitable!' : (effHasPaidAccess ? `Need +$${formatCurrency(silverBreakeven - silverSpot)}` : 'Not yet')}</Text>
                    </View>
                  )}
                  {totalGoldOzt > 0 && (
                    <View style={{ backgroundColor: `${colors.gold}22`, padding: 12, borderRadius: 8, marginBottom: 8 }}>
                      <Text style={{ color: colors.gold, fontSize: scaledFonts.normal }}>Gold: {effHasPaidAccess ? `$${formatCurrency(goldBreakeven)}` : '$•••••'}/oz needed</Text>
                      <Text style={{ color: colors.muted, fontSize: scaledFonts.tiny }}>{goldSpot >= goldBreakeven ? 'Profitable!' : (effHasPaidAccess ? `Need +$${formatCurrency(goldBreakeven - goldSpot)}` : 'Not yet')}</Text>
                    </View>
                  )}
                  {totalPlatinumOzt > 0 && (
                    <View style={{ backgroundColor: `${colors.platinum}22`, padding: 12, borderRadius: 8, marginBottom: 8 }}>
                      <Text style={{ color: colors.platinum, fontSize: scaledFonts.normal }}>Platinum: {effHasPaidAccess ? `$${formatCurrency(platinumBreakeven)}` : '$•••••'}/oz needed</Text>
                      <Text style={{ color: colors.muted, fontSize: scaledFonts.tiny }}>{platinumSpot >= platinumBreakeven ? 'Profitable!' : (effHasPaidAccess ? `Need +$${formatCurrency(platinumBreakeven - platinumSpot)}` : 'Not yet')}</Text>
                    </View>
                  )}
                  {totalPalladiumOzt > 0 && (
                    <View style={{ backgroundColor: `${colors.palladium}22`, padding: 12, borderRadius: 8 }}>
                      <Text style={{ color: colors.palladium, fontSize: scaledFonts.normal }}>Palladium: {effHasPaidAccess ? `$${formatCurrency(palladiumBreakeven)}` : '$•••••'}/oz needed</Text>
                      <Text style={{ color: colors.muted, fontSize: scaledFonts.tiny }}>{palladiumSpot >= palladiumBreakeven ? 'Profitable!' : (effHasPaidAccess ? `Need +$${formatCurrency(palladiumBreakeven - palladiumSpot)}` : 'Not yet')}</Text>
                    </View>
                  )}
                </View>

                {/* ===== TOOLS ===== */}
                <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 16, marginBottom: 12, gap: 8, marginHorizontal: 16 }}>
                  <Text style={{ color: colors.muted, fontSize: scaledFonts.tiny, fontWeight: '600', letterSpacing: 1.2, textTransform: 'uppercase' }}>Tools</Text>
                  <View style={{ flex: 1, height: 1, backgroundColor: 'rgba(212,168,67,0.2)' }} />
                </View>

                {/* Price Alerts */}
                <View onLayout={(e) => { sectionOffsets.current['priceAlerts'] = e.nativeEvent.layout.y; }}>
                <TouchableOpacity
                  style={[styles.card, { backgroundColor: colors.cardBg, borderColor: colors.border }]}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setShowAddAlertModal(true);
                  }}
                >
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><View style={{ width: 18, height: 18, justifyContent: 'center', alignItems: 'center' }}><BellIcon size={18} color={colors.gold} /></View><Text style={[styles.cardTitle, { color: colors.text, fontSize: scaledFonts.medium, marginBottom: 0 }]}>Price Alerts</Text></View>
                    {priceAlerts.length > 0 && (
                      <Text style={{ color: colors.muted, fontSize: scaledFonts.tiny }}>{priceAlerts.length} active</Text>
                    )}
                  </View>
                  <Text style={{ color: colors.muted, fontSize: scaledFonts.normal }}>Set alerts for gold and silver price targets</Text>
                </TouchableOpacity>
                </View>

                <View onLayout={(e) => { sectionOffsets.current['speculationTool'] = e.nativeEvent.layout.y; }}>
                <TouchableOpacity style={[styles.card, { backgroundColor: colors.cardBg, borderColor: colors.border }]} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setShowSpeculationModal(true); }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><View style={{ width: 18, height: 18, justifyContent: 'center', alignItems: 'center' }}><TrendingUpIcon size={18} color={colors.gold} /></View><Text style={[styles.cardTitle, { color: colors.text, fontSize: scaledFonts.medium, marginBottom: 0 }]}>Speculation Tool</Text></View>
                  <Text style={{ color: colors.muted, fontSize: scaledFonts.normal }}>What if silver hits $100? What if gold hits $10,000?</Text>
                </TouchableOpacity>
                </View>

                <View onLayout={(e) => { sectionOffsets.current['junkSilver'] = e.nativeEvent.layout.y; }}>
                <TouchableOpacity style={[styles.card, { backgroundColor: colors.cardBg, borderColor: colors.border }]} onPress={() => setShowJunkCalcModal(true)}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><View style={{ width: 18, height: 18, justifyContent: 'center', alignItems: 'center' }}><CalculatorIcon size={18} color={colors.gold} /></View><Text style={[styles.cardTitle, { color: colors.text, fontSize: scaledFonts.medium, marginBottom: 0 }]}>Junk Silver Calculator</Text></View>
                  <Text style={{ color: colors.muted, fontSize: scaledFonts.normal }}>Calculate melt value of constitutional silver</Text>
                </TouchableOpacity>
                </View>

                {/* Stack Milestones */}
                <View onLayout={(e) => { sectionOffsets.current['stackMilestones'] = e.nativeEvent.layout.y; }}>
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setTempSilverMilestone(customSilverMilestone?.toString() || '');
                    setTempGoldMilestone(customGoldMilestone?.toString() || '');
                    setShowMilestoneModal(true);
                  }}
                >
                  <View style={[styles.card, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><View style={{ width: 18, height: 18, justifyContent: 'center', alignItems: 'center' }}><TrophyIcon size={18} color={colors.gold} /></View><Text style={[styles.cardTitle, { color: colors.text, fontSize: scaledFonts.medium, marginBottom: 0 }]}>Stack Milestones</Text></View>
                      <Text style={{ color: colors.muted, fontSize: scaledFonts.tiny }}>Tap to edit</Text>
                    </View>
                    <ProgressBar value={totalSilverOzt} max={nextSilverMilestone} color={colors.silver} label={`Silver: ${formatOunces(totalSilverOzt, 0)} / ${nextSilverMilestone} oz${customSilverMilestone ? ' (custom)' : ''}`} />
                    <ProgressBar value={totalGoldOzt} max={nextGoldMilestone} color={colors.gold} label={`Gold: ${formatOunces(totalGoldOzt, 2)} / ${nextGoldMilestone} oz${customGoldMilestone ? ' (custom)' : ''}`} />
                  </View>
                </TouchableOpacity>
                </View>

                {/* Share My Stack */}
                <View onLayout={(e) => { sectionOffsets.current['shareMyStack'] = e.nativeEvent.layout.y; }}>
                {(silverItems.length > 0 || goldItems.length > 0 || platinumItems.length > 0 || palladiumItems.length > 0) && (() => {
                  const shareMetals = [
                    { label: 'Gold', symbol: 'Au', ozt: totalGoldOzt, spot: goldSpot, color: '#D4A843', decimals: 3, value: totalGoldOzt * goldSpot },
                    { label: 'Silver', symbol: 'Ag', ozt: totalSilverOzt, spot: silverSpot, color: '#9ca3af', decimals: 2, value: totalSilverOzt * silverSpot },
                    { label: 'Platinum', symbol: 'Pt', ozt: totalPlatinumOzt, spot: platinumSpot, color: '#7BB3D4', decimals: 3, value: totalPlatinumOzt * platinumSpot },
                    { label: 'Palladium', symbol: 'Pd', ozt: totalPalladiumOzt, spot: palladiumSpot, color: '#6BBF8A', decimals: 3, value: totalPalladiumOzt * palladiumSpot },
                  ].filter(m => m.ozt > 0);
                  return (
                    <View style={{ position: 'relative' }}>
                      <ViewShot
                        ref={shareViewRef}
                        options={{ format: 'png', quality: 1.0, result: 'tmpfile' }}
                      >
                        <View style={{
                          backgroundColor: '#111111',
                          borderRadius: 16,
                          overflow: 'hidden',
                        }}>
                          <View style={{ height: 2, backgroundColor: '#D4A843' }} />
                          <View style={{ padding: 20, paddingTop: 16 }}>
                            <View style={{ alignItems: 'center', marginBottom: 12 }}>
                              <Image source={require('./assets/icon.png')} style={{ width: 44, height: 44, borderRadius: 10, marginBottom: 8 }} />
                              <Text style={{ color: '#ffffff', fontSize: 13, fontWeight: '700', letterSpacing: 3, textTransform: 'uppercase' }}>My Stack</Text>
                            </View>
                            <Text style={{ color: '#ffffff', fontSize: 36, fontWeight: '700', textAlign: 'center', marginBottom: 8 }}>${formatCurrency(totalMeltValue, 0)}</Text>
                            <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: 16 }}>
                              {shareMetals.map(m => (
                                <View key={m.label} style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: m.color }} />
                              ))}
                            </View>
                            <View style={{ height: 1, backgroundColor: 'rgba(212,168,67,0.4)', marginBottom: 16 }} />
                            {shareMetals.map(m => {
                              const pct = totalMeltValue > 0 ? ((m.value / totalMeltValue) * 100).toFixed(0) : '0';
                              return (
                                <View key={m.label} style={{ marginBottom: 12 }}>
                                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                      <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: m.color }} />
                                      <Text style={{ color: '#ffffff', fontSize: 15, fontWeight: '600' }}>{m.label}</Text>
                                    </View>
                                    <Text style={{ color: '#ffffff', fontSize: 15, fontWeight: '700' }}>${formatCurrency(m.value, 0)}</Text>
                                  </View>
                                  <Text style={{ color: '#71717a', fontSize: 12, marginLeft: 18, marginTop: 2 }}>{formatOunces(m.ozt, m.decimals)} oz · {pct}%</Text>
                                </View>
                              );
                            })}
                            <View style={{ height: 1, backgroundColor: 'rgba(212,168,67,0.4)', marginTop: 4, marginBottom: 12 }} />
                            <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 12, marginBottom: 16 }}>
                              {shareMetals.map(m => (
                                <Text key={m.symbol} style={{ color: '#71717a', fontSize: 12, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' }}>{m.symbol} ${m.symbol === 'Ag' ? m.spot.toFixed(2) : m.spot.toFixed(0)}</Text>
                              ))}
                            </View>
                            <View style={{ alignItems: 'center' }}>
                              <Text style={{ color: '#D4A843', fontSize: 14, fontWeight: '700', marginBottom: 2 }}>troystack.com</Text>
                              <Text style={{ color: '#52525b', fontSize: 11 }}>Tracked with TroyStack</Text>
                            </View>
                          </View>
                        </View>
                      </ViewShot>
                      <TouchableOpacity
                        style={{
                          position: 'absolute',
                          top: 14,
                          right: 12,
                          zIndex: 10,
                          width: 36,
                          height: 36,
                          borderRadius: 18,
                          backgroundColor: 'rgba(255,255,255,0.1)',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                        onPress={() => {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          shareMyStack();
                        }}
                      >
                        <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
                          <Path d="M12 2L12 16M12 2L8 6M12 2L16 6" stroke="#D4A843" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                          <Path d="M4 14V18C4 19.1 4.9 20 6 20H18C19.1 20 20 19.1 20 18V14" stroke="#D4A843" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                        </Svg>
                      </TouchableOpacity>
                    </View>
                  );
                })()}
                </View>

              </>

            </View>
          </>
          );
        })()}

        {/* SETTINGS TAB */}
        {currentScreen === 'Settings' && (() => {
          // iOS Settings style colors
          const settingsBg = isDarkMode ? '#000000' : '#f2f2f7';
          const groupBg = isDarkMode ? '#1c1c1e' : '#ffffff';
          const separatorColor = isDarkMode ? '#38383a' : '#c6c6c8';
          const chevronColor = isDarkMode ? '#48484a' : '#c7c7cc';

          // Reusable iOS Settings Row Component
          const SettingsRow = ({ label, value, onPress, isFirst, isLast, showChevron = true, rightElement, subtitle, labelColor }) => (
            <TouchableOpacity
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                backgroundColor: groupBg,
                paddingVertical: 12,
                paddingHorizontal: 16,
                minHeight: 44,
                borderTopLeftRadius: isFirst ? 10 : 0,
                borderTopRightRadius: isFirst ? 10 : 0,
                borderBottomLeftRadius: isLast ? 10 : 0,
                borderBottomRightRadius: isLast ? 10 : 0,
              }}
              onPress={onPress}
              disabled={!onPress}
              activeOpacity={onPress ? 0.6 : 1}
            >
              <View style={{ flex: 1 }}>
                <Text style={{ color: labelColor || colors.text, fontSize: scaledFonts.normal }}>{label}</Text>
                {subtitle && <Text style={{ color: colors.muted, fontSize: scaledFonts.small, marginTop: 2 }}>{subtitle}</Text>}
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                {value && <Text style={{ color: colors.muted, fontSize: scaledFonts.normal }}>{value}</Text>}
                {rightElement}
                {showChevron && onPress && <Text style={{ color: chevronColor, fontSize: scaledFonts.large, fontWeight: '600' }}>›</Text>}
              </View>
            </TouchableOpacity>
          );

          // Separator between rows
          const RowSeparator = () => (
            <View style={{ backgroundColor: groupBg }}>
              <View style={{ height: 0.5, backgroundColor: separatorColor, marginLeft: 16 }} />
            </View>
          );

          // Section Header
          const SectionHeader = ({ title }) => (
            <Text style={{
              color: isDarkMode ? '#8e8e93' : '#6d6d72',
              fontSize: scaledFonts.small,
              fontWeight: '400',
              textTransform: 'uppercase',
              marginBottom: 8,
              marginTop: 24,
              marginLeft: 16,
              letterSpacing: 0.5,
            }}>{title}</Text>
          );

          // Section Footer
          const SectionFooter = ({ text }) => (
            <Text style={{
              color: isDarkMode ? '#8e8e93' : '#6d6d72',
              fontSize: scaledFonts.small,
              marginTop: 8,
              marginLeft: 16,
              marginRight: 16,
              lineHeight: 18,
            }}>{text}</Text>
          );

          // Sub-page header with back button
          const SubPageHeader = ({ title }) => (
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingTop: 12, paddingBottom: 4 }}>
              <TouchableOpacity
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setSettingsSubPage(null); }}
                style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8 }}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Text style={{ color: '#007AFF', fontSize: scaledFonts.large, marginRight: 4 }}>‹</Text>
                <Text style={{ color: '#007AFF', fontSize: scaledFonts.normal }}>Settings</Text>
              </TouchableOpacity>
            </View>
          );

          const pageStyle = { flex: 1, backgroundColor: settingsBg, marginHorizontal: -20, marginTop: -20, paddingHorizontal: 16, paddingTop: 8 };

          // ===== MAIN SETTINGS PAGE =====
          return (
            <View style={pageStyle}>
              {/* Done button header */}
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4, marginTop: 12, marginBottom: 8 }}>
                <Text style={{ color: colors.text, fontSize: scaledFonts.xlarge, fontWeight: '700' }}>Settings</Text>
                <TouchableOpacity onPress={() => setCurrentScreen(previousScreen)}>
                  <Text style={{ color: colors.gold, fontSize: scaledFonts.medium, fontWeight: '600' }}>Done</Text>
                </TouchableOpacity>
              </View>
              {/* ACCOUNT (no section header, card at top) */}
              <View onLayout={(e) => { sectionOffsets.current['account'] = e.nativeEvent.layout.y; }} style={{ marginTop: 8 }}>
                <View style={{ borderRadius: 10, overflow: 'hidden' }}>
                  {/* Profile row */}
                  {supabaseUser ? (
                    <TouchableOpacity
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        backgroundColor: groupBg,
                        paddingVertical: 14,
                        paddingHorizontal: 16,
                        minHeight: 56,
                        borderTopLeftRadius: 10,
                        borderTopRightRadius: 10,
                      }}
                      onPress={() => setShowAccountScreen(true)}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                        <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.gold, alignItems: 'center', justifyContent: 'center' }}>
                          <ProfileIcon size={22} color="#18181b" />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={{ color: colors.text, fontSize: scaledFonts.normal, fontWeight: '500' }}>{supabaseUser.email}</Text>
                          <Text style={{ color: colors.muted, fontSize: scaledFonts.small, marginTop: 1 }}>Manage Account</Text>
                        </View>
                      </View>
                      <Text style={{ color: chevronColor, fontSize: scaledFonts.large, fontWeight: '600' }}>›</Text>
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        backgroundColor: groupBg,
                        paddingVertical: 14,
                        paddingHorizontal: 16,
                        minHeight: 56,
                        borderTopLeftRadius: 10,
                        borderTopRightRadius: 10,
                      }}
                      onPress={() => disableGuestMode()}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                        <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: '#007AFF', alignItems: 'center', justifyContent: 'center' }}>
                          <ProfileIcon size={22} color="#fff" />
                        </View>
                        <View>
                          <Text style={{ color: colors.text, fontSize: scaledFonts.normal, fontWeight: '500' }}>Sign In or Create Account</Text>
                          <Text style={{ color: colors.muted, fontSize: scaledFonts.small, marginTop: 1 }}>Sync your data across devices</Text>
                        </View>
                      </View>
                      <Text style={{ color: chevronColor, fontSize: scaledFonts.large, fontWeight: '600' }}>›</Text>
                    </TouchableOpacity>
                  )}
                  <RowSeparator />
                  {/* Membership row */}
                  <TouchableOpacity
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      backgroundColor: groupBg,
                      paddingVertical: 12,
                      paddingHorizontal: 16,
                      minHeight: 44,
                      borderBottomLeftRadius: 10,
                      borderBottomRightRadius: 10,
                    }}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      hasPaidAccess ? setShowBenefitsScreen(true) : setShowPaywallModal(true);
                    }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                      <View style={{ width: 30, height: 30, borderRadius: 6, backgroundColor: hasGoldAccess ? 'rgba(251, 191, 36, 0.2)' : 'rgba(113, 113, 122, 0.2)', alignItems: 'center', justifyContent: 'center' }}>
                        <Text style={{ fontSize: 16 }}>{hasLifetimeAccess ? '💎' : hasGold ? '👑' : '🆓'}</Text>
                      </View>
                      <Text style={{ color: colors.text, fontSize: scaledFonts.normal }}>
                        {hasLifetimeAccess ? 'Lifetime Member' : hasGold ? 'Gold Member' : 'Free'}
                      </Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      {!hasGoldAccess && <Text style={{ color: '#007AFF', fontSize: scaledFonts.small }}>Upgrade</Text>}
                      {hasLifetimeAccess && <Text style={{ color: colors.success, fontSize: scaledFonts.small }}>Thank you!</Text>}
                      <Text style={{ color: chevronColor, fontSize: scaledFonts.large, fontWeight: '600' }}>›</Text>
                    </View>
                  </TouchableOpacity>
                </View>
              </View>

              {/* PREFERENCES */}
              <SectionHeader title="Preferences" />
              <View onLayout={(e) => { sectionOffsets.current['notifications'] = e.nativeEvent.layout.y; }} style={{ borderRadius: 10, overflow: 'hidden' }}>
                <SettingsRow
                  label="Notifications"
                  onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setSettingsSubPage('notifications'); scrollRef.current?.scrollTo({ y: 0, animated: false }); }}
                  isFirst={true}
                  isLast={false}
                />
                <RowSeparator />
                <SettingsRow
                  label="Appearance"
                  onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setSettingsSubPage('appearance'); scrollRef.current?.scrollTo({ y: 0, animated: false }); }}
                  isFirst={false}
                  isLast={false}
                />
                <RowSeparator />
                <SettingsRow
                  label="Display"
                  onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setSettingsSubPage('display'); scrollRef.current?.scrollTo({ y: 0, animated: false }); }}
                  isFirst={false}
                  isLast={true}
                />
              </View>

              {/* DATA */}
              <SectionHeader title="Data" />
              <View style={{ borderRadius: 10, overflow: 'hidden' }}>
                <SettingsRow
                  label="Export & Backup"
                  onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setSettingsSubPage('exportBackup'); scrollRef.current?.scrollTo({ y: 0, animated: false }); }}
                  isFirst={true}
                  isLast={false}
                />
                <RowSeparator />
                <SettingsRow
                  label="Advanced"
                  onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setSettingsSubPage('advanced'); scrollRef.current?.scrollTo({ y: 0, animated: false }); }}
                  isFirst={false}
                  isLast={true}
                />
              </View>

              {/* ABOUT */}
              <View onLayout={(e) => { sectionOffsets.current['about'] = e.nativeEvent.layout.y; }}>
              <SectionHeader title="About" />
              <View onLayout={(e) => { sectionOffsets.current['whatsNew'] = e.nativeEvent.layout.y; }} style={{ borderRadius: 10, overflow: 'hidden' }}>
                <SettingsRow
                  label="Help Guide"
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setShowHelpModal(true);
                  }}
                  isFirst={true}
                  isLast={false}
                />
                <RowSeparator />
                {/* Version - triple-tap in __DEV__ to toggle screenshot mode */}
                <TouchableOpacity
                  onPress={__DEV__ ? handleVersionTap : undefined}
                  activeOpacity={__DEV__ ? 0.7 : 1}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    backgroundColor: groupBg,
                    paddingVertical: 12,
                    paddingHorizontal: 16,
                    minHeight: 44,
                  }}>
                  <Text style={{ color: colors.text, fontSize: scaledFonts.normal }}>Version</Text>
                  <Text style={{ color: screenshotMode ? '#D4A843' : colors.muted, fontSize: scaledFonts.normal }}>
                    {appVersion}{screenshotMode ? ' 📸' : ''}
                  </Text>
                </TouchableOpacity>
                <RowSeparator />
                {/* Privacy Policy · Terms of Use - single row */}
                <View style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: groupBg,
                  paddingVertical: 12,
                  paddingHorizontal: 16,
                  minHeight: 44,
                  borderBottomLeftRadius: 10,
                  borderBottomRightRadius: 10,
                }}>
                  <TouchableOpacity onPress={() => setShowPrivacyModal(true)}>
                    <Text style={{ color: '#007AFF', fontSize: scaledFonts.normal }}>Privacy Policy</Text>
                  </TouchableOpacity>
                  <Text style={{ color: colors.muted, fontSize: scaledFonts.normal, marginHorizontal: 8 }}>{'\u00B7'}</Text>
                  <TouchableOpacity onPress={() => Linking.openURL('https://api.stacktrackergold.com/terms')}>
                    <Text style={{ color: '#007AFF', fontSize: scaledFonts.normal }}>Terms of Use</Text>
                  </TouchableOpacity>
                </View>
              </View>
              </View>

              {/* Scan Usage - only show for free users */}
              {!hasGold && !hasLifetimeAccess && (
                <>
                  <SectionHeader title="Usage" />
                  <View style={{ borderRadius: 10, overflow: 'hidden' }}>
                    <View style={{
                      backgroundColor: groupBg,
                      paddingVertical: 12,
                      paddingHorizontal: 16,
                      borderRadius: 10,
                    }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Text style={{ color: colors.text, fontSize: scaledFonts.normal }}>Receipt Scans</Text>
                        <Text style={{ color: scanUsage.scansUsed >= scanUsage.scansLimit ? colors.error : colors.muted, fontSize: scaledFonts.normal, fontWeight: '600' }}>
                          {scanUsage.scansUsed} / {scanUsage.scansLimit}
                        </Text>
                      </View>
                      {/* Progress bar */}
                      <View style={{ height: 4, backgroundColor: isDarkMode ? '#39393d' : '#e5e5ea', borderRadius: 2, marginTop: 8 }}>
                        <View style={{
                          height: 4,
                          backgroundColor: scanUsage.scansUsed >= scanUsage.scansLimit ? colors.error : '#34c759',
                          borderRadius: 2,
                          width: `${Math.min((scanUsage.scansUsed / scanUsage.scansLimit) * 100, 100)}%`
                        }} />
                      </View>
                    </View>
                  </View>
                  {scanUsage.resetsAt && (
                    <SectionFooter text={`Resets ${new Date(scanUsage.resetsAt).toLocaleDateString()}`} />
                  )}
                </>
              )}

              {/* Sign Out */}
              <View style={{ marginTop: 32 }}>
                <View style={{ borderRadius: 10, overflow: 'hidden' }}>
                  <TouchableOpacity
                    style={{
                      backgroundColor: groupBg,
                      paddingVertical: 12,
                      paddingHorizontal: 16,
                      minHeight: 44,
                      borderRadius: 10,
                      alignItems: 'center',
                    }}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                      if (supabaseUser) {
                        // Authenticated users — sign out immediately
                        performSignOut();
                      } else {
                        // Guest users — warn about data loss
                        Alert.alert(
                          'You\'re not signed in',
                          'Signing out will delete any data you\'ve added. Create an account to save your stack.',
                          [
                            { text: 'Cancel', style: 'cancel' },
                            { text: 'Create Account', onPress: () => disableGuestMode() },
                            { text: 'Sign Out', style: 'destructive', onPress: () => performSignOut() },
                          ]
                        );
                      }
                    }}
                  >
                    <Text style={{ color: '#007AFF', fontSize: scaledFonts.normal }}>Sign Out</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Extra padding at bottom */}
              <View style={{ height: 50 }} />
            </View>
          );
        })()}

        {/* SIGNAL TAB */}
        {currentScreen === 'StackSignal' && (() => {
          const effHasPaidAccess = demoData ? true : hasPaidAccess;
          const signalCardBg = isDarkMode ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)';
          const signalCardBorder = isDarkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)';
          const digestArticles = stackSignalDaily ? [stackSignalDaily] : [];
          const feedArticles = stackSignalArticles.filter(a => !a.is_stack_signal);

          const getDigestType = (title) => {
            if (!title) return 'The Stack Signal';
            const lower = title.toLowerCase();
            if (lower.includes('evening')) return 'Evening Signal';
            if (lower.includes('weekly recap')) return 'Weekly Recap';
            if (lower.includes('week ahead')) return 'The Week Ahead';
            if (lower.includes('monthly review')) return 'Monthly Review';
            if (lower.includes('year in review')) return 'Year in Review';
            return 'The Stack Signal';
          };

          return (
            <View style={{ backgroundColor: isDarkMode ? '#0d0d0d' : colors.bg, marginHorizontal: -20, paddingTop: 4, minHeight: Dimensions.get('window').height - 200 }}>

              {/* DIGEST SECTION */}
              <View onLayout={(e) => { sectionOffsets.current['stackSignal'] = e.nativeEvent.layout.y; }} style={{ marginBottom: 20 }}>
                {/* Digest header */}
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 14, gap: 8, paddingHorizontal: 16 }}>
                  <StackSignalIcon size={16} color="#C9A84C" />
                  <Text style={{ color: '#C9A84C', fontSize: scaledFonts.tiny, fontWeight: '700', letterSpacing: 1.5, textTransform: 'uppercase' }}>Latest from Troy</Text>
                  <View style={{ flex: 1, height: 1, backgroundColor: 'rgba(201,168,76,0.2)' }} />
                </View>

                {digestArticles.length > 0 ? (
                  <View style={{ paddingHorizontal: 16, gap: 12 }}>
                    {digestArticles.map((digest) => {
                      const isExpanded = expandedArticleId === digest.id;
                      const digestType = getDigestType(digest.title);
                      return (
                        <TouchableOpacity
                          key={digest.id || digest.slug}
                          activeOpacity={0.85}
                          onPress={async () => {
                            if (isExpanded) {
                              setExpandedArticleId(null);
                              return;
                            }
                            setExpandedArticleId(digest.id);
                            if (!viewedArticlesRef.current.has(digest.id)) {
                              viewedArticlesRef.current.add(digest.id);
                              recordArticleView(digest.id);
                            }
                            fetchArticleLikeStatus(digest.id);
                            if (!digest.troy_commentary && digest.slug) {
                              try {
                                const fullRes = await stackSignalAPI.fetchArticle(digest.slug);
                                const full = fullRes?.article || fullRes;
                                if (full && full.troy_commentary) {
                                  setStackSignalArticles(prev => prev.map(a =>
                                    a.id === digest.id ? { ...a, troy_commentary: full.troy_commentary, sources: full.sources } : a
                                  ));
                                }
                              } catch (err) {
                                if (__DEV__) console.log('Stack Signal article fetch error:', err.message);
                              }
                            }
                          }}
                          style={{ backgroundColor: signalCardBg, borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: isDarkMode ? '#222' : 'rgba(0,0,0,0.08)' }}
                        >
                          {digest.image_url ? (
                            <View style={{ backgroundColor: '#1a1a1a', borderTopLeftRadius: 12, borderTopRightRadius: 12 }}>
                              <Image source={{ uri: digest.image_url, cache: 'force-cache' }} style={{ width: '100%', height: 200 }} resizeMode="cover" />
                            </View>
                          ) : null}
                          <View style={{ padding: 14 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                              <View style={{ backgroundColor: 'rgba(201,168,76,0.15)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4 }}>
                                <Text style={{ color: '#C9A84C', fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 }}>{digestType}</Text>
                              </View>
                              <Text style={{ color: colors.muted, fontSize: 11 }}>
                                {digest.published_at
                                  ? new Date(digest.published_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                                  : 'Today'}
                              </Text>
                            </View>
                            <Text style={{ color: colors.text, fontSize: 16, fontWeight: '700', marginBottom: 6 }}>{digest.title}</Text>
                            {digest.troy_one_liner ? (
                              <Text style={{ color: '#C9A84C', fontSize: 13, fontStyle: 'italic', lineHeight: 18 }} numberOfLines={isExpanded ? undefined : 2}>{digest.troy_one_liner}</Text>
                            ) : null}

                            {isExpanded && (
                              <View style={{ marginTop: 12 }}>
                                {digest.troy_commentary ? (
                                  <Markdown style={{
                                    body: { color: isDarkMode ? '#f5f5f5' : colors.text, fontSize: 15, lineHeight: 22 },
                                    paragraph: { marginTop: 0, marginBottom: 8 },
                                    strong: { fontWeight: '700' },
                                    em: { fontStyle: 'italic' },
                                    bullet_list: { marginTop: 2, marginBottom: 2 },
                                    ordered_list: { marginTop: 2, marginBottom: 2 },
                                    list_item: { marginTop: 1, marginBottom: 1 },
                                  }}>{digest.troy_commentary}</Markdown>
                                ) : (
                                  <ActivityIndicator size="small" color="#C9A84C" style={{ marginVertical: 12 }} />
                                )}
                                {digest.sources && Array.isArray(digest.sources) && digest.sources.length > 0 ? (() => {
                                  const seen = new Set();
                                  const unique = digest.sources.filter(src => {
                                    const key = src.name || src.url;
                                    if (seen.has(key)) return false;
                                    seen.add(key);
                                    return true;
                                  });
                                  return (
                                    <View style={{ marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: isDarkMode ? '#222' : '#ddd' }}>
                                      <Text style={{ color: colors.muted, fontSize: 11, fontWeight: '600', marginBottom: 6 }}>SOURCES</Text>
                                      {unique.slice(0, 5).map((src, idx) => (
                                        <TouchableOpacity key={idx} onPress={() => Linking.openURL(src.url)} style={{ marginBottom: 4 }}>
                                          <Text style={{ color: '#4A90D9', fontSize: 13 }}>{src.name || src.url}</Text>
                                        </TouchableOpacity>
                                      ))}
                                    </View>
                                  );
                                })() : null}
                                <TouchableOpacity
                                  onPress={() => handleShareArticle(digest)}
                                  style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 14, paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: isDarkMode ? '#333' : '#ddd', backgroundColor: 'rgba(201,168,76,0.06)' }}
                                >
                                  <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" style={{ marginRight: 8 }}>
                                    <Path d="M12 2L12 15" stroke="#C9A84C" strokeWidth="2" strokeLinecap="round" />
                                    <Path d="M8.5 7.5L12 4L15.5 7.5" stroke="#C9A84C" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                    <Path d="M20 14V18C20 19.1046 19.1046 20 18 20H6C4.89543 20 4 19.1046 4 18V14" stroke="#C9A84C" strokeWidth="2" strokeLinecap="round" />
                                  </Svg>
                                  <Text style={{ color: '#C9A84C', fontSize: 14, fontWeight: '600' }}>Share Article</Text>
                                </TouchableOpacity>
                              </View>
                            )}
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                ) : stackSignalArticles.length === 0 ? (
                  <View style={{ alignItems: 'center', justifyContent: 'center', padding: 40 }}>
                    <Image source={TROY_AVATAR} style={{ width: 48, height: 48, borderRadius: 24 }} />
                    <Text style={{ color: colors.muted, fontSize: 15, textAlign: 'center', marginTop: 16, lineHeight: 22 }}>Troy is monitoring the markets. The Stack Signal will arrive shortly.</Text>
                  </View>
                ) : null}
              </View>

              {/* FEED SECTION */}
              {feedArticles.length > 0 && (
                <View style={{ paddingHorizontal: 16 }}>
                  {/* Feed header */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 14, gap: 8 }}>
                    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
                      <Path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </Svg>
                    <Text style={{ color: '#fff', fontSize: scaledFonts.tiny, fontWeight: '700', letterSpacing: 1.5, textTransform: 'uppercase' }}>Troy's Feed</Text>
                    <View style={{ flex: 1, height: 1, backgroundColor: isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)' }} />
                  </View>

                  <View style={{ gap: 12 }}>
                    {feedArticles.map((item) => {
                      const categoryColors = {
                        price_action: '#C9A84C',
                        comex_vaults: '#E8432A',
                        central_banks: '#C9A84C',
                        macro: '#4A90D9',
                        supply: '#7B8D6F',
                        geopolitical: '#D4A574',
                        sentiment: '#9B59B6',
                        silver: '#C0C0C0',
                        gold: '#C9A84C',
                        mining: '#7B8D6F',
                        market_data: '#4A90D9',
                      };
                      const catColor = categoryColors[item.category] || '#C9A84C';
                      const timeAgo = (() => {
                        if (!item.published_at) return '';
                        const diff = Date.now() - new Date(item.published_at).getTime();
                        const mins = Math.floor(diff / 60000);
                        if (mins < 60) return `${mins}m ago`;
                        const hrs = Math.floor(mins / 60);
                        if (hrs < 24) return `${hrs}h ago`;
                        const days = Math.floor(hrs / 24);
                        if (days === 1) return 'Yesterday';
                        return `${days}d ago`;
                      })();
                      const isCommentaryExpanded = expandedCommentary[item.id];
                      return (
                        <View
                          key={item.id || item.slug}
                          style={{ backgroundColor: signalCardBg, borderRadius: 12, borderWidth: 1, borderColor: isDarkMode ? '#222' : 'rgba(0,0,0,0.08)', overflow: 'hidden' }}
                        >
                          {item.image_url ? (
                            <View style={{ backgroundColor: '#1a1a1a', borderTopLeftRadius: 12, borderTopRightRadius: 12 }}>
                              <Image source={{ uri: item.image_url, cache: 'force-cache' }} style={{ width: '100%', height: 200 }} resizeMode="cover" />
                            </View>
                          ) : null}
                          <View style={{ padding: 14 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                              {item.category ? (
                                <View style={{ backgroundColor: catColor + '22', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4 }}>
                                  <Text style={{ color: catColor, fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 }}>{(item.category || '').replace(/_/g, ' ')}</Text>
                                </View>
                              ) : <View />}
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                                <Text style={{ color: colors.muted, fontSize: 11 }}>{item.source ? item.source.replace(/_/g, ' ') : ''} · {timeAgo}</Text>
                                <TouchableOpacity
                                  onPress={() => handleShareArticle(item)}
                                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                >
                                  <Svg width={15} height={15} viewBox="0 0 24 24" fill="none">
                                    <Path d="M12 2L12 15" stroke="#666" strokeWidth="2" strokeLinecap="round" />
                                    <Path d="M8.5 7.5L12 4L15.5 7.5" stroke="#666" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                    <Path d="M20 14V18C20 19.1046 19.1046 20 18 20H6C4.89543 20 4 19.1046 4 18V14" stroke="#666" strokeWidth="2" strokeLinecap="round" />
                                  </Svg>
                                </TouchableOpacity>
                              </View>
                            </View>
                            <Text style={{ color: colors.text, fontSize: 16, fontWeight: '700', marginBottom: 4 }}>{item.title}</Text>
                            {item.troy_one_liner ? (
                                <Text style={{ color: '#C9A84C', fontSize: 13, fontStyle: 'italic', lineHeight: 18 }}>{item.troy_one_liner}</Text>
                            ) : null}

                            {/* Troy commentary — see more / see less */}
                            {item.troy_commentary ? (
                              <View style={{ marginTop: 8 }}>
                                <Text style={{ color: isDarkMode ? '#ccc' : colors.text, fontSize: 14, lineHeight: 20 }} numberOfLines={isCommentaryExpanded ? undefined : 2}>{item.troy_commentary}</Text>
                                <TouchableOpacity onPress={() => setExpandedCommentary(prev => ({ ...prev, [item.id]: !prev[item.id] }))} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                                  <Text style={{ color: '#C9A84C', fontSize: 13, fontWeight: '600', marginTop: 4 }}>{isCommentaryExpanded ? 'see less' : 'see more'}</Text>
                                </TouchableOpacity>
                              </View>
                            ) : null}

                            {/* Social bar — views, likes, share */}
                            {(() => {
                              const likeState = likedArticles[item.id];
                              const viewCount = item.view_count || 0;
                              const likeCount = likeState ? likeState.count : (item.like_count || 0);
                              const isLiked = likeState ? likeState.liked : false;
                              return (
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 8 }}>
                                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                    <Svg width={14} height={14} viewBox="0 0 24 24" fill="none">
                                      <Path d="M1 12C1 12 5 4 12 4C19 4 23 12 23 12C23 12 19 20 12 20C5 20 1 12 1 12Z" stroke={colors.muted} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                      <Circle cx="12" cy="12" r="3" stroke={colors.muted} strokeWidth="2" />
                                    </Svg>
                                    <Text style={{ color: colors.muted, fontSize: 12 }}>{viewCount}</Text>
                                  </View>
                                  <TouchableOpacity onPress={() => toggleArticleLike(item.id)} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                                    <Svg width={14} height={14} viewBox="0 0 24 24" fill={isLiked ? '#E8432A' : 'none'}>
                                      <Path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78z" stroke={isLiked ? '#E8432A' : colors.muted} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                    </Svg>
                                    <Text style={{ color: isLiked ? '#E8432A' : colors.muted, fontSize: 12 }}>{likeCount}</Text>
                                  </TouchableOpacity>
                                  <TouchableOpacity onPress={() => handleShareArticle(item)} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                                    <Svg width={14} height={14} viewBox="0 0 24 24" fill="none">
                                      <Path d="M12 2L12 15" stroke={colors.muted} strokeWidth="2" strokeLinecap="round" />
                                      <Path d="M8.5 7.5L12 4L15.5 7.5" stroke={colors.muted} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                      <Path d="M20 14V18C20 19.1046 19.1046 20 18 20H6C4.89543 20 4 19.1046 4 18V14" stroke={colors.muted} strokeWidth="2" strokeLinecap="round" />
                                    </Svg>
                                  </TouchableOpacity>
                                </View>
                              );
                            })()}
                          </View>
                        </View>
                      );
                    })}
                  </View>
                </View>
              )}

              {/* Loading state */}
              {stackSignalArticles.length === 0 && stackSignalDaily && (
                <View style={{ gap: 12, paddingHorizontal: 16 }}>
                  {[1, 2, 3].map(i => (
                    <View key={i} style={{ backgroundColor: signalCardBg, borderRadius: 12, borderWidth: 1, borderColor: signalCardBorder, overflow: 'hidden' }}>
                      <View style={{ width: '100%', aspectRatio: 16/9, backgroundColor: isDarkMode ? '#222' : '#eee' }} />
                      <View style={{ padding: 14 }}>
                        <View style={{ width: 60, height: 10, backgroundColor: isDarkMode ? '#222' : '#ddd', borderRadius: 4, marginBottom: 10 }} />
                        <View style={{ width: '90%', height: 14, backgroundColor: isDarkMode ? '#222' : '#ddd', borderRadius: 4, marginBottom: 8 }} />
                        <View style={{ width: '70%', height: 11, backgroundColor: isDarkMode ? '#1a1a1a' : '#eee', borderRadius: 4 }} />
                      </View>
                    </View>
                  ))}
                </View>
              )}

              {/* Footer */}
              <View style={{ alignItems: 'center', paddingVertical: 24, marginBottom: 20 }}>
                <Text style={{ color: colors.muted, fontSize: scaledFonts.tiny, opacity: 0.6 }}>Powered by Troy — TroyStack</Text>
              </View>
            </View>
          );
        })()}

        <View style={{ height: (currentScreen === 'Settings' || currentScreen === 'Analytics' || currentScreen === 'StackSignal') ? 300 : 100 }} />

      </ScrollView>
      )}

      {/* Troy Tab — Inline Chat (rendered outside ScrollView) */}
      {currentScreen === 'TroyChat' && (
        <View style={{ flex: 1, backgroundColor: '#000' }}>
          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={Platform.OS === 'ios' ? (insets.top + 68) : 0}>
            {/* Message List */}
            <FlatList
              ref={troyFlatListRef}
              data={troyMessages}
              keyExtractor={(item, index) => item.id || `msg-${index}`}
              style={{ flex: 1 }}
              contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 16, flexGrow: 1 }}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="interactive"
              onContentSizeChange={() => {
                troyFlatListRef.current?.scrollToEnd({ animated: true });
              }}
              ListEmptyComponent={
                !troyLoading ? (
                  <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 60 }}>
                    <Image source={TROY_AVATAR} style={{ width: 64, height: 64, borderRadius: 32 }} />
                    <Text style={{ color: '#fff', fontSize: 18, fontWeight: '600', marginTop: 16 }}>Ask Troy anything</Text>
                    <Text style={{ color: '#999', fontSize: 14, marginTop: 8, textAlign: 'center', lineHeight: 20 }}>
                      Your personal stack analyst. I know your stack{'\n'}and can help you make smarter decisions.
                    </Text>
                    <View style={{ marginTop: 24, gap: 10, alignSelf: 'stretch', paddingHorizontal: 16 }}>
                      {[
                        { label: "Today's Brief", action: 'brief' },
                        { label: "How's my stack?", action: 'send', text: "How's my stack performing?" },
                        { label: 'Gold/Silver Ratio', action: 'send', text: 'Analyze my gold-to-silver ratio' },
                        { label: 'Purchasing Power', action: 'send', text: "What can my stack buy in real terms? Show me purchasing power." },
                        { label: 'Scan a receipt', action: 'scan' },
                      ].map((chip, i) => (
                        <TouchableOpacity
                          key={i}
                          style={{
                            backgroundColor: 'rgba(212,168,67,0.08)',
                            borderRadius: 16,
                            paddingVertical: 10,
                            paddingHorizontal: 14,
                            borderWidth: 1,
                            borderColor: 'rgba(212,168,67,0.2)',
                            alignSelf: 'flex-start',
                          }}
                          onPress={() => {
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                            if (chip.action === 'brief') {
                              fetchAndShowDailyBrief();
                            } else if (chip.action === 'scan') {
                              Alert.alert('Scan Receipt', 'Choose a source', [
                                { text: 'Take Photo', onPress: () => performScan('camera') },
                                { text: 'Choose from Library', onPress: () => performScan('gallery') },
                                { text: 'Cancel', style: 'cancel' },
                              ]);
                            } else {
                              sendTroyMessage(chip.text);
                            }
                          }}
                        >
                          <Text style={{ color: '#D4A843', fontSize: 13 }}>{chip.label}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                ) : null
              }
              renderItem={({ item }) => {
                const anim = messageAnimsRef.current.get(item.id);
                const animStyle = anim ? {
                  opacity: anim,
                  transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [30, 0] }) }],
                } : {};
                return (
                <Animated.View style={[{
                  alignSelf: item.role === 'user' ? 'flex-end' : 'flex-start',
                  maxWidth: '85%',
                  marginBottom: 12,
                }, animStyle]}>
                  {item.role === 'assistant' && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                      <Image source={TROY_AVATAR} style={{ width: 20, height: 20, borderRadius: 10 }} />
                      <Text style={{ color: '#C9A84C', fontSize: 12, fontWeight: '600', marginLeft: 6 }}>Troy</Text>
                    </View>
                  )}
                  <View style={{
                    backgroundColor: item.role === 'user' ? '#C9A84C' : '#1a1a1a',
                    borderRadius: 16,
                    paddingHorizontal: 14,
                    paddingVertical: 10,
                    borderTopRightRadius: item.role === 'user' ? 4 : 16,
                    borderTopLeftRadius: item.role === 'assistant' ? 4 : 16,
                  }}>
                    {item.role === 'user' ? (
                      <Text style={{ color: '#000', fontSize: 15, lineHeight: 22 }}>{item.content}</Text>
                    ) : (
                      <Markdown style={{
                        body: { color: '#f5f5f5', fontSize: 15, lineHeight: 22 },
                        paragraph: { marginTop: 0, marginBottom: 4 },
                        strong: { fontWeight: '700' },
                        em: { fontStyle: 'italic' },
                        bullet_list: { marginTop: 2, marginBottom: 2 },
                        ordered_list: { marginTop: 2, marginBottom: 2 },
                        list_item: { marginTop: 1, marginBottom: 1 },
                      }}>{item.content}</Markdown>
                    )}
                    {/* Inline rich content card — renders inside the bubble */}
                    {item.role === 'assistant' && item.preview && renderInlineCard(item.preview, openPreview)}
                  </View>
                  {/* Preview button — only for types that need the bottom sheet */}
                  {item.role === 'assistant' && item.preview && shouldShowPreviewButton(item.preview) && (
                    <TouchableOpacity
                      onPress={() => openPreview(item.preview)}
                      style={{
                        flexDirection: 'row', alignItems: 'center',
                        marginTop: 8, paddingVertical: 6, paddingHorizontal: 12,
                        backgroundColor: 'rgba(218, 165, 32, 0.1)',
                        borderRadius: 8, alignSelf: 'flex-start',
                      }}
                    >
                      <Text style={{ color: '#DAA520', fontSize: 14, fontWeight: '600' }}>
                        {getPreviewLabel(item.preview)}
                      </Text>
                      <Text style={{ color: '#DAA520', fontSize: 14, marginLeft: 6 }}>→</Text>
                    </TouchableOpacity>
                  )}
                  {/* Troy Voice — pause/resume/listen per message */}
                  {item.role === 'assistant' && (
                    <TouchableOpacity
                      onPress={async () => {
                        if (playingMessageId === item.id && !isPaused) {
                          if (currentSoundRef.current) {
                            try { await currentSoundRef.current.pauseAsync(); } catch {}
                          }
                          setIsPaused(true);
                        } else if (playingMessageId === item.id && isPaused) {
                          if (currentSoundRef.current) {
                            try { await currentSoundRef.current.playAsync(); } catch {}
                          }
                          setIsPaused(false);
                        } else {
                          await stopTroyAudio();
                          playTroyVoice(item.content, item.id);
                        }
                      }}
                      style={{ flexDirection: 'row', alignItems: 'center', marginTop: 6, paddingVertical: 4, paddingHorizontal: 8 }}
                    >
                      {playingMessageId === item.id && !isPaused ? (
                        <Text style={{ color: '#DAA520', fontSize: 13 }}>❚❚ Pause</Text>
                      ) : playingMessageId === item.id && isPaused ? (
                        <Text style={{ color: '#DAA520', fontSize: 13 }}>▶ Resume</Text>
                      ) : (
                        <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>▶ Listen</Text>
                      )}
                    </TouchableOpacity>
                  )}
                </Animated.View>
              );
              }}
            />

            {/* Typing Indicator */}
            {troyLoading && troyMessages.length > 0 && (
              <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Image source={TROY_AVATAR} style={{ width: 20, height: 20, borderRadius: 10 }} />
                  <Text style={{ color: '#999', fontSize: 13, marginLeft: 6, fontStyle: 'italic' }}>Troy is thinking...</Text>
                </View>
              </View>
            )}

            {/* Suggestion Chips — compact horizontal pills above input */}
            {troyMessages.length === 0 && !troyLoading && (
              <View style={{ height: 44, borderTopWidth: 1, borderTopColor: '#1a1a1a', backgroundColor: '#000' }}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ alignItems: 'center', paddingHorizontal: 12, gap: 8, height: 44 }}>
                  {[
                    { label: "Today's Brief", action: 'brief' },
                    { label: 'My stack', action: 'send', text: "How's my stack performing?" },
                    { label: 'Ratio', action: 'send', text: 'Analyze my gold-to-silver ratio' },
                    { label: 'Buying power', action: 'send', text: "What can my stack buy in real terms? Show me purchasing power." },
                    { label: 'Scan receipt', action: 'scan' },
                  ].map((chip, i) => (
                    <TouchableOpacity
                      key={i}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        if (chip.action === 'brief') fetchAndShowDailyBrief();
                        else if (chip.action === 'scan') {
                          Alert.alert('Scan Receipt', 'Choose a source', [
                            { text: 'Take Photo', onPress: () => performScan('camera') },
                            { text: 'Choose from Library', onPress: () => performScan('gallery') },
                            { text: 'Cancel', style: 'cancel' },
                          ]);
                        }
                        else sendTroyMessage(chip.text);
                      }}
                      style={{ backgroundColor: '#1a1a1a', borderRadius: 14, height: 30, paddingHorizontal: 10, justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' }}
                    >
                      <Text style={{ color: '#d4d4d8', fontSize: 12 }}>{chip.label}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}

            {/* Input Bar */}
            <View style={{
              flexDirection: 'row',
              alignItems: 'flex-end',
              paddingHorizontal: 12,
              paddingVertical: 8,
              borderTopWidth: troyMessages.length === 0 && !troyLoading ? 0 : 1,
              borderTopColor: '#1a1a1a',
              backgroundColor: '#000',
            }}>
              <TouchableOpacity
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  Alert.alert('Add to your stack', null, [
                    { text: 'Take a Photo', onPress: () => performScan('camera') },
                    { text: 'Choose Photo', onPress: () => performScan('gallery') },
                    { text: 'Import Spreadsheet', onPress: () => importSpreadsheet() },
                    { text: 'Cancel', style: 'cancel' },
                  ]);
                }}
                style={{
                  width: 32, height: 32, borderRadius: 16,
                  backgroundColor: 'rgba(255,255,255,0.08)',
                  justifyContent: 'center', alignItems: 'center',
                  marginRight: 8, marginBottom: 2,
                }}
              >
                <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 20, lineHeight: 22 }}>+</Text>
              </TouchableOpacity>
              <TextInput
                style={{
                  flex: 1,
                  backgroundColor: '#1a1a1a',
                  borderRadius: 20,
                  paddingHorizontal: 16,
                  paddingTop: 10,
                  paddingBottom: 10,
                  color: '#fff',
                  fontSize: 15,
                  maxHeight: 100,
                }}
                placeholder="Ask Troy..."
                placeholderTextColor="#666"
                value={troyInputText}
                onChangeText={setTroyInputText}
                multiline={true}
                textAlignVertical="top"
                returnKeyType="default"
                blurOnSubmit={false}
                autoCorrect={true}
                spellCheck={true}
                autoCapitalize="sentences"
              />
              {/* Right button: 4 states — stop generation | stop speaking | send | mic */}
              {troyLoading ? (
                <TouchableOpacity
                  onPress={stopTroyGeneration}
                  style={{ marginLeft: 8, width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.15)', justifyContent: 'center', alignItems: 'center' }}
                >
                  <View style={{ width: 14, height: 14, backgroundColor: '#fff', borderRadius: 2 }} />
                </TouchableOpacity>
              ) : playingMessageId ? (
                <TouchableOpacity
                  onPress={stopTroyAudio}
                  style={{ marginLeft: 8, width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(218,165,32,0.2)', justifyContent: 'center', alignItems: 'center' }}
                >
                  <View style={{ width: 14, height: 14, backgroundColor: '#DAA520', borderRadius: 2 }} />
                </TouchableOpacity>
              ) : troyInputText.trim() ? (
                <TouchableOpacity
                  onPress={() => sendTroyMessage()}
                  style={{ marginLeft: 8, width: 36, height: 36, borderRadius: 18, backgroundColor: '#C9A84C', justifyContent: 'center', alignItems: 'center' }}
                >
                  <Text style={{ color: '#000', fontSize: 16, fontWeight: '700' }}>{'\u2191'}</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  onPress={isRecording ? stopVoiceRecording : voiceState === 'transcribing' ? undefined : startVoiceRecording}
                  disabled={voiceState === 'transcribing'}
                  style={{ marginLeft: 8, width: 36, height: 36, borderRadius: 18, backgroundColor: isRecording ? '#EF4444' : voiceState === 'transcribing' ? '#DAA520' : 'rgba(255,255,255,0.1)', justifyContent: 'center', alignItems: 'center' }}
                >
                  {isRecording ? (
                    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
                      <Path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      <Path d="M19 10v2a7 7 0 01-14 0v-2" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </Svg>
                  ) : voiceState === 'transcribing' ? (
                    <ActivityIndicator size="small" color="#000" />
                  ) : (
                    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
                      <Path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" stroke="rgba(255,255,255,0.5)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      <Path d="M19 10v2a7 7 0 01-14 0v-2" stroke="rgba(255,255,255,0.5)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      <Path d="M12 19v4M8 23h8" stroke="rgba(255,255,255,0.5)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </Svg>
                  )}
                </TouchableOpacity>
              )}
            </View>
          </KeyboardAvoidingView>

          {/* Troy conversation sidebar removed — now in drawer sidebar */}
        </View>
      )}

      {/* ===== NOTIFICATIONS SETTINGS SUB-PAGE ===== */}
      {settingsSubPage === 'notifications' && (
        <View {...notificationsSwipe.panHandlers} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#000', zIndex: 9998 }}>
          <SafeAreaView style={{ flex: 1, backgroundColor: '#000' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#1a1a1a' }}>
              <TouchableOpacity onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setSettingsSubPage(null); }} style={{ marginRight: 12 }} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Text style={{ color: '#C9A84C', fontSize: 28, fontWeight: '300' }}>{'\u2039'}</Text>
              </TouchableOpacity>
              <Text style={{ color: '#fff', fontSize: 17, fontWeight: '700', flex: 1 }}>Notifications</Text>
            </View>
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
              {(() => {
                const grpBg = isDarkMode ? '#1c1c1e' : '#ffffff';
                const sepColor = isDarkMode ? '#38383a' : '#c6c6c8';
                const notifSwitchTrack = { false: isDarkMode ? '#39393d' : '#e9e9eb', true: '#34c759' };
                const notifSwitchBg = isDarkMode ? '#39393d' : '#e9e9eb';
                const renderNotifRow = (prefKey, label, description, { isFirst, isLast, indented, disabled } = {}) => (
                  <View key={prefKey} style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    backgroundColor: grpBg,
                    paddingVertical: 12,
                    paddingHorizontal: 16,
                    paddingLeft: indented ? 40 : 16,
                    minHeight: 44,
                    opacity: disabled ? 0.4 : 1,
                    ...(isFirst ? { borderTopLeftRadius: 10, borderTopRightRadius: 10 } : {}),
                    ...(isLast ? { borderBottomLeftRadius: 10, borderBottomRightRadius: 10 } : {}),
                  }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: colors.text, fontSize: scaledFonts.normal }}>{label}</Text>
                      <Text style={{ color: colors.muted, fontSize: scaledFonts.small, marginTop: 2 }}>{description}</Text>
                    </View>
                    <Switch
                      value={notifPrefs[prefKey]}
                      onValueChange={(value) => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        saveNotifPref(prefKey, value);
                      }}
                      trackColor={notifSwitchTrack}
                      thumbColor="#fff"
                      ios_backgroundColor={notifSwitchBg}
                      disabled={disabled}
                    />
                  </View>
                );
                const Sep = () => (<View style={{ backgroundColor: grpBg }}><View style={{ height: 0.5, backgroundColor: sepColor, marginLeft: 16 }} /></View>);
                return (
                  <>
                    <Text style={{ color: colors.muted, fontSize: scaledFonts.small, fontWeight: '600', textTransform: 'uppercase', marginLeft: 16, marginTop: 8, marginBottom: 6 }}>Troy's Notifications</Text>
                    <View style={{ borderRadius: 10, overflow: 'hidden' }}>
                      {renderNotifRow('daily_brief', "Your Daily Brief", "Troy's morning market briefing", { isFirst: true })}
                      <Sep />
                      {renderNotifRow('price_alerts', 'Price Alerts', 'Triggered when your price targets are hit', { isLast: true })}
                    </View>

                    <Text style={{ color: colors.muted, fontSize: scaledFonts.small, fontWeight: '600', textTransform: 'uppercase', marginLeft: 16, marginTop: 24, marginBottom: 6 }}>COMEX Vault Alerts</Text>
                    <View style={{ borderRadius: 10, overflow: 'hidden' }}>
                      {renderNotifRow('comex_alerts', 'All Vault Changes', 'Coming soon', { isFirst: true, isLast: true, disabled: true })}
                    </View>
                  </>
                );
              })()}
            </ScrollView>
          </SafeAreaView>
        </View>
      )}

      {/* ===== APPEARANCE SETTINGS SUB-PAGE ===== */}
      {settingsSubPage === 'appearance' && (
        <View {...appearanceSwipe.panHandlers} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#000', zIndex: 9998 }}>
          <SafeAreaView style={{ flex: 1, backgroundColor: '#000' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#1a1a1a' }}>
              <TouchableOpacity onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setSettingsSubPage(null); }} style={{ marginRight: 12 }} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Text style={{ color: '#C9A84C', fontSize: 28, fontWeight: '300' }}>{'\u2039'}</Text>
              </TouchableOpacity>
              <Text style={{ color: '#fff', fontSize: 17, fontWeight: '700', flex: 1 }}>Appearance</Text>
            </View>
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
              <View style={{ borderRadius: 10, overflow: 'hidden', marginTop: 8 }}>
                <View style={{
                  backgroundColor: isDarkMode ? '#1c1c1e' : '#ffffff',
                  paddingVertical: 12,
                  paddingHorizontal: 16,
                  borderRadius: 10,
                }}>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    {[
                      { key: 'dark', label: 'Dark', icon: '🌙' },
                      { key: 'light', label: 'Light', icon: '☀️' },
                      { key: 'system', label: 'Auto', icon: '⚙️' },
                    ].map((option) => (
                      <TouchableOpacity
                        key={option.key}
                        style={{
                          flex: 1,
                          paddingVertical: 10,
                          paddingHorizontal: 8,
                          borderRadius: 8,
                          backgroundColor: themePreference === option.key
                            ? (isDarkMode ? '#48484a' : '#e5e5ea')
                            : 'transparent',
                          alignItems: 'center',
                        }}
                        onPress={() => {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          changeTheme(option.key);
                        }}
                      >
                        <Text style={{ fontSize: 20, marginBottom: 4 }}>{option.icon}</Text>
                        <Text style={{
                          color: themePreference === option.key ? colors.text : colors.muted,
                          fontWeight: themePreference === option.key ? '600' : '400',
                          fontSize: scaledFonts.small,
                        }}>
                          {option.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              </View>
              <Text style={{ color: isDarkMode ? '#8e8e93' : '#6d6d72', fontSize: scaledFonts.small, marginTop: 8, marginLeft: 16, marginRight: 16, lineHeight: 18 }}>{themePreference === 'system' ? 'Follows your iOS appearance settings' : `${themePreference === 'dark' ? 'Dark' : 'Light'} mode enabled`}</Text>
            </ScrollView>
          </SafeAreaView>
        </View>
      )}

      {/* ===== DISPLAY SETTINGS SUB-PAGE ===== */}
      {settingsSubPage === 'display' && (
        <View {...displaySwipe.panHandlers} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#000', zIndex: 9998 }}>
          <SafeAreaView style={{ flex: 1, backgroundColor: '#000' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#1a1a1a' }}>
              <TouchableOpacity onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setSettingsSubPage(null); }} style={{ marginRight: 12 }} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Text style={{ color: '#C9A84C', fontSize: 28, fontWeight: '300' }}>{'\u2039'}</Text>
              </TouchableOpacity>
              <Text style={{ color: '#fff', fontSize: 17, fontWeight: '700', flex: 1 }}>Display</Text>
            </View>
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
              {(() => {
                const grpBg = isDarkMode ? '#1c1c1e' : '#ffffff';
                const sepColor = isDarkMode ? '#38383a' : '#c6c6c8';
                const Sep = () => (<View style={{ backgroundColor: grpBg }}><View style={{ height: 0.5, backgroundColor: sepColor, marginLeft: 16 }} /></View>);
                return (
                  <View style={{ borderRadius: 10, overflow: 'hidden', marginTop: 8 }}>
                    {/* Large Text */}
                    <View style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      backgroundColor: grpBg,
                      paddingVertical: 12,
                      paddingHorizontal: 16,
                      minHeight: 44,
                      borderTopLeftRadius: 10,
                      borderTopRightRadius: 10,
                    }}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: colors.text, fontSize: scaledFonts.normal }}>Large Text</Text>
                        <Text style={{ color: colors.muted, fontSize: scaledFonts.small, marginTop: 2 }}>Increase font sizes throughout the app</Text>
                      </View>
                      <Switch
                        value={largeText}
                        onValueChange={(value) => {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          toggleLargeText(value);
                        }}
                        trackColor={{ false: isDarkMode ? '#39393d' : '#e9e9eb', true: '#34c759' }}
                        thumbColor="#fff"
                        ios_backgroundColor={isDarkMode ? '#39393d' : '#e9e9eb'}
                      />
                    </View>
                    <Sep />
                    {/* Widget Hide Values */}
                    <View style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      backgroundColor: grpBg,
                      paddingVertical: 12,
                      paddingHorizontal: 16,
                      minHeight: 44,
                      borderBottomLeftRadius: 10,
                      borderBottomRightRadius: 10,
                    }}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: colors.text, fontSize: scaledFonts.normal }}>Hide Values on Widget</Text>
                        <Text style={{ color: colors.muted, fontSize: scaledFonts.small, marginTop: 2 }}>Show dots instead of dollar amounts</Text>
                      </View>
                      <Switch
                        value={hideWidgetValues}
                        onValueChange={(value) => {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          setHideWidgetValues(value);
                          AsyncStorage.setItem('stack_hide_widget_values', value ? 'true' : 'false');
                        }}
                        trackColor={{ false: isDarkMode ? '#39393d' : '#e9e9eb', true: '#34c759' }}
                        thumbColor="#fff"
                        ios_backgroundColor={isDarkMode ? '#39393d' : '#e9e9eb'}
                      />
                    </View>
                  </View>
                );
              })()}
            </ScrollView>
          </SafeAreaView>
        </View>
      )}

      {/* ===== EXPORT & BACKUP SETTINGS SUB-PAGE ===== */}
      {settingsSubPage === 'exportBackup' && (
        <View {...exportSwipe.panHandlers} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#000', zIndex: 9998 }}>
          <SafeAreaView style={{ flex: 1, backgroundColor: '#000' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#1a1a1a' }}>
              <TouchableOpacity onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setSettingsSubPage(null); }} style={{ marginRight: 12 }} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Text style={{ color: '#C9A84C', fontSize: 28, fontWeight: '300' }}>{'\u2039'}</Text>
              </TouchableOpacity>
              <Text style={{ color: '#fff', fontSize: 17, fontWeight: '700', flex: 1 }}>Export & Backup</Text>
            </View>
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
              {(() => {
                const grpBg = isDarkMode ? '#1c1c1e' : '#ffffff';
                const sepColor = isDarkMode ? '#38383a' : '#c6c6c8';
                const chevColor = isDarkMode ? '#48484a' : '#c7c7cc';
                const Sep = () => (<View style={{ backgroundColor: grpBg }}><View style={{ height: 0.5, backgroundColor: sepColor, marginLeft: 16 }} /></View>);
                const Row = ({ label, onPress, isFirst, isLast }) => (
                  <TouchableOpacity
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      backgroundColor: grpBg,
                      paddingVertical: 12,
                      paddingHorizontal: 16,
                      minHeight: 44,
                      borderTopLeftRadius: isFirst ? 10 : 0,
                      borderTopRightRadius: isFirst ? 10 : 0,
                      borderBottomLeftRadius: isLast ? 10 : 0,
                      borderBottomRightRadius: isLast ? 10 : 0,
                    }}
                    onPress={onPress}
                    activeOpacity={0.6}
                  >
                    <Text style={{ color: colors.text, fontSize: scaledFonts.normal }}>{label}</Text>
                    <Text style={{ color: chevColor, fontSize: scaledFonts.large, fontWeight: '600' }}>›</Text>
                  </TouchableOpacity>
                );
                return (
                  <>
                    <View style={{ borderRadius: 10, overflow: 'hidden', marginTop: 8 }}>
                      <Row label="Export to Backup" onPress={createBackup} isFirst={true} isLast={false} />
                      <Sep />
                      <Row label="Restore from Backup" onPress={restoreBackup} isFirst={false} isLast={false} />
                      <Sep />
                      <Row label="Export as CSV" onPress={exportCSV} isFirst={false} isLast={false} />
                      <Sep />
                      <TouchableOpacity onPress={requestLedgerExport} style={{ backgroundColor: grpBg, paddingVertical: 12, paddingHorizontal: 16, minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomLeftRadius: 10, borderBottomRightRadius: 10 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                          <Svg width={14} height={14} viewBox="0 0 24 24" fill="none">
                            <Path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" stroke={colors.gold} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            <Path d="M14 2v6h6M12 18v-6M9 15l3 3 3-3" stroke={colors.gold} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                          </Svg>
                          <Text style={{ color: colors.text, fontSize: scaledFonts.normal }}>Export Stack Ledger</Text>
                          <View style={{ backgroundColor: 'rgba(201,168,76,0.2)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, marginLeft: 4 }}>
                            <Text style={{ color: colors.gold, fontSize: 9, fontWeight: '700', letterSpacing: 0.5 }}>GOLD</Text>
                          </View>
                        </View>
                        <Text style={{ color: colors.muted, fontSize: 18 }}>›</Text>
                      </TouchableOpacity>
                    </View>
                    <Text style={{ color: isDarkMode ? '#8e8e93' : '#6d6d72', fontSize: scaledFonts.small, marginTop: 8, marginLeft: 16, marginRight: 16, lineHeight: 18 }}>Backups include all holdings and settings. Export to Files, iCloud Drive, or any storage.</Text>

                    {/* Clear All Data */}
                    <View style={{ marginTop: 40 }}>
                      <View style={{ borderRadius: 10, overflow: 'hidden' }}>
                        <TouchableOpacity
                          style={{
                            backgroundColor: grpBg,
                            paddingVertical: 12,
                            paddingHorizontal: 16,
                            minHeight: 44,
                            borderRadius: 10,
                            alignItems: 'center',
                          }}
                          onPress={() => {
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                            Alert.alert(
                              'Clear All Data',
                              'Are you sure? This will permanently delete all your holdings and settings.',
                              [
                                { text: 'Cancel', style: 'cancel' },
                                {
                                  text: 'Continue',
                                  style: 'destructive',
                                  onPress: () => {
                                    Alert.prompt(
                                      'This cannot be undone',
                                      'Type DELETE to confirm.',
                                      [
                                        { text: 'Cancel', style: 'cancel' },
                                        {
                                          text: 'Clear Everything',
                                          style: 'destructive',
                                          onPress: (text) => {
                                            if (text === 'DELETE') {
                                              clearAllData();
                                            } else {
                                              Alert.alert('Not deleted', 'You must type DELETE exactly to confirm.');
                                            }
                                          },
                                        },
                                      ],
                                      'plain-text',
                                      '',
                                      'default'
                                    );
                                  },
                                },
                              ]
                            );
                          }}
                        >
                          <Text style={{ color: '#FF3B30', fontSize: scaledFonts.normal }}>Clear All Data</Text>
                        </TouchableOpacity>
                      </View>
                      <Text style={{ color: isDarkMode ? '#8e8e93' : '#6d6d72', fontSize: scaledFonts.small, marginTop: 8, marginLeft: 16, marginRight: 16, lineHeight: 18 }}>This will permanently delete all holdings, settings, and preferences. This action cannot be undone.</Text>
                    </View>
                  </>
                );
              })()}
            </ScrollView>
          </SafeAreaView>
        </View>
      )}

      {/* ===== ADVANCED SETTINGS SUB-PAGE ===== */}
      {settingsSubPage === 'advanced' && (
        <View {...advancedSwipe.panHandlers} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#000', zIndex: 9998 }}>
          <SafeAreaView style={{ flex: 1, backgroundColor: '#000' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#1a1a1a' }}>
              <TouchableOpacity onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setSettingsSubPage(null); }} style={{ marginRight: 12 }} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Text style={{ color: '#C9A84C', fontSize: 28, fontWeight: '300' }}>{'\u2039'}</Text>
              </TouchableOpacity>
              <Text style={{ color: '#fff', fontSize: 17, fontWeight: '700', flex: 1 }}>Advanced</Text>
            </View>
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
              {supabaseUser && (
                <>
                  <Text style={{ color: isDarkMode ? '#8e8e93' : '#6d6d72', fontSize: scaledFonts.small, fontWeight: '400', textTransform: 'uppercase', marginBottom: 8, marginTop: 24, marginLeft: 16, letterSpacing: 0.5 }}>Support</Text>
                  <View style={{ borderRadius: 10, overflow: 'hidden' }}>
                    <TouchableOpacity
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        backgroundColor: isDarkMode ? '#1c1c1e' : '#ffffff',
                        paddingVertical: 12,
                        paddingHorizontal: 16,
                        minHeight: 44,
                        borderRadius: 10,
                      }}
                      onPress={() => {
                        Clipboard.setString(supabaseUser.id);
                        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                        Alert.alert('Copied', 'Support ID copied to clipboard');
                      }}
                    >
                      <View style={{ flex: 1, marginRight: 12 }}>
                        <Text style={{ color: colors.text, fontSize: scaledFonts.normal }}>Support ID</Text>
                        <Text style={{ color: colors.muted, fontSize: scaledFonts.tiny, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace', marginTop: 4 }} numberOfLines={1}>{supabaseUser.id}</Text>
                      </View>
                      <Text style={{ color: '#007AFF', fontSize: scaledFonts.small }}>Copy</Text>
                    </TouchableOpacity>
                  </View>
                  <Text style={{ color: isDarkMode ? '#8e8e93' : '#6d6d72', fontSize: scaledFonts.small, marginTop: 8, marginLeft: 16, marginRight: 16, lineHeight: 18 }}>Share this ID with support when requesting help.</Text>
                </>
              )}
            </ScrollView>
          </SafeAreaView>
        </View>
      )}

      {/* ===== THE STACK SIGNAL FULL-SCREEN PAGE ===== */}
      {showStackSignal && (
        <View {...stackSignalSwipe.panHandlers} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#000', zIndex: 9998 }}>
          <SafeAreaView style={{ flex: 1, backgroundColor: '#000' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#1a1a1a' }}>
              <TouchableOpacity onPress={() => setShowStackSignal(false)} style={{ marginRight: 12 }} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Text style={{ color: '#C9A84C', fontSize: 28, fontWeight: '300' }}>{'\u2039'}</Text>
              </TouchableOpacity>
              <StackSignalIcon size={20} color="#C9A84C" />
              <Text style={{ color: '#fff', fontSize: 17, fontWeight: '700', flex: 1, marginLeft: 8 }}>The Stack Signal</Text>
              {stackSignalDaily && stackSignalDaily.title ? (
                <TouchableOpacity
                  onPress={() => handleShareArticle(stackSignalDaily)}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  style={{ padding: 4 }}
                >
                  <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
                    <Path d="M12 2L12 15" stroke="#C9A84C" strokeWidth="2" strokeLinecap="round" />
                    <Path d="M8.5 7.5L12 4L15.5 7.5" stroke="#C9A84C" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    <Path d="M20 14V18C20 19.1046 19.1046 20 18 20H6C4.89543 20 4 19.1046 4 18V14" stroke="#C9A84C" strokeWidth="2" strokeLinecap="round" />
                  </Svg>
                </TouchableOpacity>
              ) : null}
            </View>

            {stackSignalLoading && !stackSignalRefreshing ? (
              /* Loading skeleton */
              <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }}>
                {/* Daily card skeleton */}
                <View style={{ borderRadius: 12, borderWidth: 1, borderColor: 'rgba(201,168,76,0.3)', padding: 16, marginBottom: 16 }}>
                  <View style={{ width: 140, height: 12, backgroundColor: '#222', borderRadius: 4, marginBottom: 12 }} />
                  <View style={{ width: '100%', aspectRatio: 16/9, backgroundColor: '#222', borderRadius: 8, marginBottom: 12 }} />
                  <View style={{ width: '80%', height: 14, backgroundColor: '#222', borderRadius: 4, marginBottom: 8 }} />
                  <View style={{ width: '60%', height: 12, backgroundColor: '#1a1a1a', borderRadius: 4 }} />
                </View>
                {/* Article skeletons */}
                {[1, 2, 3].map(i => (
                  <View key={i} style={{ backgroundColor: '#111', borderRadius: 12, marginBottom: 12, overflow: 'hidden' }}>
                    <View style={{ width: '100%', aspectRatio: 16/9, backgroundColor: '#222' }} />
                    <View style={{ padding: 14 }}>
                      <View style={{ width: 60, height: 10, backgroundColor: '#222', borderRadius: 4, marginBottom: 10 }} />
                      <View style={{ width: '90%', height: 14, backgroundColor: '#222', borderRadius: 4, marginBottom: 8 }} />
                      <View style={{ width: '70%', height: 11, backgroundColor: '#1a1a1a', borderRadius: 4 }} />
                    </View>
                  </View>
                ))}
              </ScrollView>
            ) : stackSignalArticles.length === 0 && !stackSignalDaily ? (
              /* Empty state */
              <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 }}>
                <Image source={TROY_AVATAR} style={{ width: 48, height: 48, borderRadius: 24 }} />
                <Text style={{ color: '#999', fontSize: 15, textAlign: 'center', marginTop: 16, lineHeight: 22 }}>Troy is monitoring the markets. The Stack Signal will arrive shortly.</Text>
              </View>
            ) : (
              /* Article feed */
              <FlatList
                data={stackSignalArticles.filter(a => !a.is_stack_signal)}
                keyExtractor={(item) => item.id?.toString() || item.slug}
                contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
                refreshControl={
                  <RefreshControl
                    refreshing={stackSignalRefreshing}
                    onRefresh={refreshStackSignal}
                    tintColor="#C9A84C"
                  />
                }
                onEndReached={loadMoreStackSignal}
                onEndReachedThreshold={0.3}
                ListHeaderComponent={() => {
                  /* Daily Synthesis Card */
                  const daily = stackSignalDaily;
                  return (
                    <View style={{ borderRadius: 12, borderWidth: 1, borderColor: '#C9A84C', backgroundColor: '#111', marginBottom: 20, overflow: 'hidden' }}>
                      {daily && daily.image_url ? (
                        <Image source={{ uri: daily.image_url, cache: 'force-cache' }} style={{ width: '100%', aspectRatio: 16/9 }} resizeMode="cover" />
                      ) : null}
                      <View style={{ padding: 16 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 4 }}>
                          <StackSignalIcon size={12} color="#C9A84C" />
                          <Text style={{ color: '#C9A84C', fontSize: 11, fontWeight: '700', letterSpacing: 1.5 }}>THE STACK SIGNAL</Text>
                        </View>
                        <Text style={{ color: '#999', fontSize: 12, marginBottom: 10 }}>
                          {daily && daily.published_at
                            ? new Date(daily.published_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
                            : new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                        </Text>
                        {daily && daily.title ? (
                          <>
                            <Text style={{ color: '#fff', fontSize: 18, fontWeight: '700', marginBottom: 8 }}>{daily.title}</Text>
                            {daily.troy_one_liner ? (
                              <Text style={{ color: '#C9A84C', fontSize: 14, fontStyle: 'italic', marginBottom: 12, lineHeight: 20 }}>{daily.troy_one_liner}</Text>
                            ) : null}
                            {daily.troy_commentary ? (
                                <Markdown style={{
                                  body: { color: '#f5f5f5', fontSize: 15, lineHeight: 22 },
                                  paragraph: { marginTop: 0, marginBottom: 8 },
                                  strong: { fontWeight: '700' },
                                  em: { fontStyle: 'italic' },
                                  bullet_list: { marginTop: 2, marginBottom: 2 },
                                  ordered_list: { marginTop: 2, marginBottom: 2 },
                                  list_item: { marginTop: 1, marginBottom: 1 },
                                }}>{daily.troy_commentary}</Markdown>
                            ) : null}
                            {daily.sources && Array.isArray(daily.sources) && daily.sources.length > 0 ? (() => {
                              const seen = new Set();
                              const unique = daily.sources.filter(src => {
                                const key = src.name || src.url;
                                if (seen.has(key)) return false;
                                seen.add(key);
                                return true;
                              });
                              return (
                              <View style={{ marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#222' }}>
                                <Text style={{ color: '#666', fontSize: 11, fontWeight: '600', marginBottom: 6 }}>SOURCES</Text>
                                {unique.slice(0, 5).map((src, idx) => (
                                  <TouchableOpacity key={idx} onPress={() => Linking.openURL(src.url)} style={{ marginBottom: 4 }}>
                                    <Text style={{ color: '#4A90D9', fontSize: 13 }}>{src.name || src.url}</Text>
                                  </TouchableOpacity>
                                ))}
                                {unique.length > 5 && (
                                  <Text style={{ color: '#666', fontSize: 12, marginTop: 2 }}>and {unique.length - 5} more sources</Text>
                                )}
                              </View>
                              );
                            })() : null}
                          </>
                        ) : (
                          <Text style={{ color: '#666', fontSize: 14, fontStyle: 'italic' }}>Troy's daily synthesis arrives at 6:30 AM</Text>
                        )}
                      </View>
                    </View>
                  );
                }}
                renderItem={({ item }) => {
                  const isExpanded = expandedArticleId === item.id;
                  const categoryColors = {
                    price_action: '#C9A84C',
                    comex_vaults: '#E8432A',
                    central_banks: '#C9A84C',
                    macro: '#4A90D9',
                    supply: '#7B8D6F',
                    geopolitical: '#D4A574',
                    sentiment: '#9B59B6',
                    silver: '#C0C0C0',
                    gold: '#C9A84C',
                    mining: '#7B8D6F',
                    market_data: '#4A90D9',
                  };
                  const catColor = categoryColors[item.category] || '#C9A84C';
                  const timeAgo = (() => {
                    if (!item.published_at) return '';
                    const diff = Date.now() - new Date(item.published_at).getTime();
                    const mins = Math.floor(diff / 60000);
                    if (mins < 60) return `${mins}m ago`;
                    const hrs = Math.floor(mins / 60);
                    if (hrs < 24) return `${hrs}h ago`;
                    const days = Math.floor(hrs / 24);
                    if (days === 1) return 'Yesterday';
                    return `${days}d ago`;
                  })();
                  return (
                    <TouchableOpacity
                      activeOpacity={0.8}
                      onPress={() => {
                        if (isExpanded) {
                          setExpandedArticleId(null);
                          return;
                        }
                        setExpandedArticleId(item.id);
                        // Record view once per session
                        if (!viewedArticlesRef.current.has(item.id)) {
                          viewedArticlesRef.current.add(item.id);
                          recordArticleView(item.id);
                        }
                        // Fetch like status
                        fetchArticleLikeStatus(item.id);
                      }}
                      style={{ backgroundColor: '#111', borderRadius: 12, marginBottom: 12, overflow: 'hidden' }}
                    >
                      {item.image_url ? (
                        <Image source={{ uri: item.image_url, cache: 'force-cache' }} style={{ width: '100%', aspectRatio: 16/9 }} resizeMode="cover" />
                      ) : null}
                      <View style={{ padding: 14 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                          {item.category ? (
                            <View style={{ backgroundColor: catColor + '22', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4 }}>
                              <Text style={{ color: catColor, fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 }}>{(item.category || '').replace(/_/g, ' ')}</Text>
                            </View>
                          ) : <View />}
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                            <Text style={{ color: '#666', fontSize: 11 }}>{timeAgo}</Text>
                            <TouchableOpacity
                              onPress={() => handleShareArticle(item)}
                              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            >
                              <Svg width={15} height={15} viewBox="0 0 24 24" fill="none">
                                <Path d="M12 2L12 15" stroke="#666" strokeWidth="2" strokeLinecap="round" />
                                <Path d="M8.5 7.5L12 4L15.5 7.5" stroke="#666" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                <Path d="M20 14V18C20 19.1046 19.1046 20 18 20H6C4.89543 20 4 19.1046 4 18V14" stroke="#666" strokeWidth="2" strokeLinecap="round" />
                              </Svg>
                            </TouchableOpacity>
                          </View>
                        </View>
                        <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700', marginBottom: 4 }}>{item.title}</Text>
                        {item.troy_one_liner ? (
                          <Text style={{ color: '#999', fontSize: 13, fontStyle: 'italic', lineHeight: 18 }} numberOfLines={isExpanded ? undefined : 2}>{item.troy_one_liner}</Text>
                        ) : null}

                        {/* Social bar — views, likes, share */}
                        {(() => {
                          const likeState = likedArticles[item.id];
                          const viewCount = item.view_count || 0;
                          const likeCount = likeState ? likeState.count : (item.like_count || 0);
                          const isLiked = likeState ? likeState.liked : false;
                          return (
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 8 }}>
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                <Svg width={14} height={14} viewBox="0 0 24 24" fill="none">
                                  <Path d="M1 12C1 12 5 4 12 4C19 4 23 12 23 12C23 12 19 20 12 20C5 20 1 12 1 12Z" stroke="#666" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                  <Circle cx="12" cy="12" r="3" stroke="#666" strokeWidth="2" />
                                </Svg>
                                <Text style={{ color: '#666', fontSize: 12 }}>{viewCount}</Text>
                              </View>
                              <TouchableOpacity onPress={() => toggleArticleLike(item.id)} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                                <Svg width={14} height={14} viewBox="0 0 24 24" fill={isLiked ? '#E8432A' : 'none'}>
                                  <Path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78z" stroke={isLiked ? '#E8432A' : '#666'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                </Svg>
                                <Text style={{ color: isLiked ? '#E8432A' : '#666', fontSize: 12 }}>{likeCount}</Text>
                              </TouchableOpacity>
                              <TouchableOpacity onPress={() => handleShareArticle(item)} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                                <Svg width={14} height={14} viewBox="0 0 24 24" fill="none">
                                  <Path d="M12 2L12 15" stroke="#666" strokeWidth="2" strokeLinecap="round" />
                                  <Path d="M8.5 7.5L12 4L15.5 7.5" stroke="#666" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                  <Path d="M20 14V18C20 19.1046 19.1046 20 18 20H6C4.89543 20 4 19.1046 4 18V14" stroke="#666" strokeWidth="2" strokeLinecap="round" />
                                </Svg>
                              </TouchableOpacity>
                            </View>
                          );
                        })()}

                        {isExpanded && (
                          <View style={{ marginTop: 12 }}>
                            {item.troy_commentary ? (
                                <Markdown style={{
                                  body: { color: '#f5f5f5', fontSize: 15, lineHeight: 22 },
                                  paragraph: { marginTop: 0, marginBottom: 8 },
                                  strong: { fontWeight: '700' },
                                  em: { fontStyle: 'italic' },
                                  bullet_list: { marginTop: 2, marginBottom: 2 },
                                  ordered_list: { marginTop: 2, marginBottom: 2 },
                                  list_item: { marginTop: 1, marginBottom: 1 },
                                }}>{item.troy_commentary}</Markdown>
                            ) : null}

                            {(item.gold_price_at_publish || item.silver_price_at_publish) ? (
                              <View style={{ flexDirection: 'row', gap: 12, marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#222' }}>
                                {item.gold_price_at_publish ? (
                                  <Text style={{ color: '#666', fontSize: 11 }}>Au ${Number(item.gold_price_at_publish).toLocaleString()}</Text>
                                ) : null}
                                {item.silver_price_at_publish ? (
                                  <Text style={{ color: '#666', fontSize: 11 }}>Ag ${Number(item.silver_price_at_publish).toFixed(2)}</Text>
                                ) : null}
                              </View>
                            ) : null}

                            {item.sources && Array.isArray(item.sources) && item.sources.length > 0 ? (() => {
                              const seen = new Set();
                              const unique = item.sources.filter(src => {
                                const key = src.name || src.url;
                                if (seen.has(key)) return false;
                                seen.add(key);
                                return true;
                              });
                              return (
                              <View style={{ marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#222' }}>
                                <Text style={{ color: '#666', fontSize: 11, fontWeight: '600', marginBottom: 6 }}>SOURCES</Text>
                                {unique.slice(0, 5).map((src, idx) => (
                                  <TouchableOpacity key={idx} onPress={() => Linking.openURL(src.url)} style={{ marginBottom: 4 }}>
                                    <Text style={{ color: '#4A90D9', fontSize: 13 }}>{src.name || src.url}</Text>
                                  </TouchableOpacity>
                                ))}
                                {unique.length > 5 && (
                                  <Text style={{ color: '#666', fontSize: 12, marginTop: 2 }}>and {unique.length - 5} more sources</Text>
                                )}
                              </View>
                              );
                            })() : null}

                            {/* Share button */}
                            <TouchableOpacity
                              onPress={() => handleShareArticle(item)}
                              style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 14, paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: '#333', backgroundColor: 'rgba(201,168,76,0.06)' }}
                            >
                              <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" style={{ marginRight: 8 }}>
                                <Path d="M12 2L12 15" stroke="#C9A84C" strokeWidth="2" strokeLinecap="round" />
                                <Path d="M8.5 7.5L12 4L15.5 7.5" stroke="#C9A84C" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                <Path d="M20 14V18C20 19.1046 19.1046 20 18 20H6C4.89543 20 4 19.1046 4 18V14" stroke="#C9A84C" strokeWidth="2" strokeLinecap="round" />
                              </Svg>
                              <Text style={{ color: '#C9A84C', fontSize: 13, fontWeight: '600' }}>Share Article</Text>
                            </TouchableOpacity>
                          </View>
                        )}
                      </View>
                    </TouchableOpacity>
                  );
                }}
                ListEmptyComponent={() => (
                  <View style={{ alignItems: 'center', padding: 40 }}>
                    <Text style={{ color: '#666', fontSize: 14 }}>No articles yet</Text>
                  </View>
                )}
              />
            )}
          </SafeAreaView>
        </View>
      )}

      {/* ACCOUNT SCREEN */}
      {showAccountScreen && (
        <View {...accountSwipe.panHandlers} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#000', zIndex: 9998 }}>
          <AccountScreen
            onClose={() => setShowAccountScreen(false)}
            onSignOut={() => performSignOut()}
            hasGold={hasGold}
            hasLifetime={hasLifetimeAccess}
            colors={colors}
          />
        </View>
      )}

      {/* Benefits Screen */}
      {showBenefitsScreen && (
        <View {...benefitsSwipe.panHandlers} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#000', zIndex: 9998 }}>
          <SafeAreaView style={{ flex: 1, backgroundColor: '#000' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#1a1a1a' }}>
              <TouchableOpacity onPress={() => setShowBenefitsScreen(false)} style={{ marginRight: 12 }} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Text style={{ color: '#C9A84C', fontSize: 28, fontWeight: '300' }}>{'\u2039'}</Text>
              </TouchableOpacity>
              <Text style={{ color: '#fff', fontSize: 17, fontWeight: '700', flex: 1 }}>
                {hasLifetimeAccess ? 'Lifetime Benefits' : hasGold ? 'Gold Benefits' : 'Membership'}
              </Text>
            </View>
            <ScrollView style={{ flex: 1, padding: 16 }}>
            {/* Current plan header */}
            <View style={{ alignItems: 'center', paddingVertical: 24 }}>
              <Text style={{ fontSize: 48, marginBottom: 12 }}>{hasLifetimeAccess ? '💎' : hasGold ? '👑' : '🆓'}</Text>
              <Text style={{ color: colors.text, fontSize: scaledFonts.xlarge, fontWeight: '700', marginBottom: 4 }}>
                {hasLifetimeAccess ? 'Lifetime Member' : hasGold ? 'Gold Member' : 'Free Plan'}
              </Text>
              {hasLifetimeAccess && <Text style={{ color: colors.success, fontSize: scaledFonts.normal }}>Thank you for your support!</Text>}
            </View>

            {/* Free features - always shown */}
            <Text style={{ color: isDarkMode ? '#8e8e93' : '#6d6d72', fontSize: scaledFonts.small, fontWeight: '400', textTransform: 'uppercase', marginBottom: 8, marginLeft: 4, letterSpacing: 0.5 }}>
              {hasPaidAccess ? 'Included' : 'Free Features'}
            </Text>
            <View style={{ backgroundColor: isDarkMode ? '#1c1c1e' : '#ffffff', borderRadius: 10, overflow: 'hidden', marginBottom: 20 }}>
              {[
                { icon: '📊', label: 'Live gold & silver spot prices' },
                { icon: '📝', label: 'Manual holdings entry' },
                { icon: '📸', label: 'AI receipt scanning (5/month)' },
                { icon: '📤', label: 'Export CSV & manual backup' },
                { icon: '🌙', label: 'Dark mode & accessibility' },
                { icon: '🔔', label: 'Price alerts & push notifications' },
                { icon: '🔮', label: 'What If scenarios & speculation tool' },
                { icon: '🧮', label: 'Junk silver calculator' },
                { icon: '🏆', label: 'Stack milestones & Share My Stack' },
              ].map((item, i, arr) => (
                <View key={i}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 16 }}>
                    <Text style={{ fontSize: 18 }}>{item.icon}</Text>
                    <Text style={{ color: colors.text, fontSize: scaledFonts.normal, flex: 1 }}>{item.label}</Text>
                    <Text style={{ color: colors.success, fontSize: 16 }}>✓</Text>
                  </View>
                  {i < arr.length - 1 && <View style={{ height: 0.5, backgroundColor: isDarkMode ? '#38383a' : '#c6c6c8', marginLeft: 50 }} />}
                </View>
              ))}
            </View>

            {/* Gold features */}
            <Text style={{ color: isDarkMode ? '#8e8e93' : '#6d6d72', fontSize: scaledFonts.small, fontWeight: '400', textTransform: 'uppercase', marginBottom: 8, marginLeft: 4, letterSpacing: 0.5 }}>
              {hasGoldAccess ? 'Gold Features' : 'Gold — $4.99/mo'}
            </Text>
            <View style={{ backgroundColor: isDarkMode ? '#1c1c1e' : '#ffffff', borderRadius: 10, overflow: 'hidden', marginBottom: 20 }}>
              {[
                { icon: '🧠', label: 'Market Intelligence' },
                { icon: '🏦', label: 'COMEX Vault Watch' },
                { icon: 'troy', label: 'Troy — Unlimited messages' },
                { icon: '📊', label: 'Advanced Analytics & Cost Basis' },
                { icon: '📸', label: 'Unlimited receipt scans' },
                { icon: '☁️', label: 'Cloud sync across devices' },
                ...(Platform.OS === 'ios' ? [{ icon: '📱', label: 'Home screen widgets' }] : []),
              ].map((item, i, arr) => (
                <View key={i}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 16 }}>
                    {item.icon === 'troy' ? <Image source={TROY_AVATAR} style={{ width: 20, height: 20, borderRadius: 10 }} /> : <Text style={{ fontSize: 18 }}>{item.icon}</Text>}
                    <Text style={{ color: colors.text, fontSize: scaledFonts.normal, flex: 1 }}>{item.label}</Text>
                    {hasGoldAccess ? (
                      <Text style={{ color: colors.success, fontSize: 16 }}>✓</Text>
                    ) : (
                      <Text style={{ color: colors.gold, fontSize: 14 }}>🔒</Text>
                    )}
                  </View>
                  {i < arr.length - 1 && <View style={{ height: 0.5, backgroundColor: isDarkMode ? '#38383a' : '#c6c6c8', marginLeft: 50 }} />}
                </View>
              ))}
            </View>

            {/* Upgrade button for non-Gold users */}
            {!hasGoldAccess && (
              <TouchableOpacity
                style={{
                  backgroundColor: colors.gold,
                  paddingVertical: 16,
                  borderRadius: 12,
                  alignItems: 'center',
                  marginBottom: 20,
                }}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  setShowBenefitsScreen(false);
                  setTimeout(() => setShowPaywallModal(true), 300);
                }}
              >
                <Text style={{ color: '#000', fontWeight: '700', fontSize: scaledFonts.medium }}>Choose a Plan</Text>
              </TouchableOpacity>
            )}

            <View style={{ height: 40 }} />
          </ScrollView>
        </SafeAreaView>
      </View>
      )}

      {/* ADD/EDIT — Full Screen */}
      {showAddModal && (
        <View {...addModalSwipe.panHandlers} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#000', zIndex: 9998 }}>
          <SafeAreaView style={{ flex: 1, backgroundColor: '#000' }}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={{ flex: 1 }}
          >
            <View style={{ flex: 1 }}>
              {/* Header */}
              <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#1a1a1a' }}>
                <TouchableOpacity
                  onPress={() => {
                    if (editingItem?.scannedIndex !== undefined) {
                      resetForm();
                      setShowAddModal(false);
                      setShowScannedItemsPreview(true);
                    } else if (editingItem?.importIndex !== undefined) {
                      resetForm();
                      setShowAddModal(false);
                      setShowImportPreview(true);
                    } else {
                      resetForm();
                      setShowAddModal(false);
                    }
                  }}
                  style={{ marginRight: 12 }}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Text style={{ color: '#C9A84C', fontSize: 28, fontWeight: '300' }}>{'\u2039'}</Text>
                </TouchableOpacity>
                <Text style={{ color: '#fff', fontSize: 17, fontWeight: '700', flex: 1 }}>{editingItem ? 'Edit' : 'Add'} Purchase</Text>
              </View>

              {/* Guest mode warning */}
              {guestMode && !supabaseUser && (
                <View style={{ backgroundColor: isDarkMode ? 'rgba(251,191,36,0.1)' : 'rgba(251,191,36,0.12)', paddingVertical: 10, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={{ fontSize: scaledFonts.small }}>⚠️</Text>
                  <Text style={{ color: colors.gold, fontSize: scaledFonts.small, flex: 1 }}>
                    You're not signed in. This data won't be saved when you close the app.
                  </Text>
                </View>
              )}

              {/* Scrollable Content */}
              <ScrollView
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="on-drag"
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingBottom: 20 }}
              >
                  {scanStatus && (
                    <View style={[styles.scanStatus, { backgroundColor: scanStatus === 'success' ? `${colors.success}22` : scanStatus === 'error' ? `${colors.error}22` : `${colors.gold}22` }]}>
                      <Text style={{ color: scanStatus === 'success' ? colors.success : scanStatus === 'error' ? colors.error : colors.gold, fontSize: scaledFonts.normal }}>{scanMessage}</Text>
                    </View>
                  )}

                  <View style={[styles.card, { backgroundColor: isDarkMode ? 'rgba(148,163,184,0.1)' : `${colors.gold}15` }]}>
                    <Text style={{ color: colors.text, fontWeight: '600', marginBottom: 12, fontSize: scaledFonts.normal }}>AI Receipt Scanner</Text>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <TouchableOpacity style={[styles.button, { backgroundColor: colors.gold, flex: 1 }]} onPress={() => performScan('camera')}>
                        <Text style={{ color: '#000', fontSize: scaledFonts.normal }} numberOfLines={1} adjustsFontSizeToFit={true}>Camera</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[styles.button, { backgroundColor: colors.gold, flex: 1 }]} onPress={() => performScan('gallery')}>
                        <Text style={{ color: '#000', fontSize: scaledFonts.normal }} numberOfLines={1} adjustsFontSizeToFit={true}>Upload</Text>
                      </TouchableOpacity>
                    </View>
                    <Text style={{ color: colors.muted, fontSize: scaledFonts.tiny, marginTop: 6, textAlign: 'center' }}>
                      Tip: Lay flat with good lighting for best results
                    </Text>
                    {!hasGold && !hasLifetimeAccess && (
                      <Text style={{ color: colors.muted, fontSize: scaledFonts.tiny, marginTop: 8, textAlign: 'center' }}>
                        {scanUsage.scansUsed >= scanUsage.scansLimit ? (
                          <Text style={{ color: colors.error }}>All {scanUsage.scansLimit} free scans used.{scanUsage.resetsAt ? ` Resets ${new Date(scanUsage.resetsAt).toLocaleDateString()}.` : ''}</Text>
                        ) : (
                          <Text>Scans: {scanUsage.scansUsed}/{scanUsage.scansLimit}{scanUsage.resetsAt ? ` (resets ${new Date(scanUsage.resetsAt).toLocaleDateString()})` : ''}</Text>
                        )}
                      </Text>
                    )}
                    {hasGold && (
                      <Text style={{ color: colors.gold, fontSize: scaledFonts.tiny, marginTop: 8, textAlign: 'center' }}>
                        ✓ Unlimited scans with Gold
                      </Text>
                    )}
                    {hasLifetimeAccess && !hasGold && (
                      <Text style={{ color: colors.success, fontSize: scaledFonts.tiny, marginTop: 8, textAlign: 'center' }}>
                        ✓ Unlimited scans (Lifetime Access)
                      </Text>
                    )}
                  </View>

                  <View style={[styles.metalTabs, { flexWrap: 'wrap' }]}>
                    {[
                      { key: 'silver', label: 'Silver', color: colors.silver },
                      { key: 'gold', label: 'Gold', color: colors.gold },
                      { key: 'platinum', label: 'Platinum', color: colors.platinum },
                      { key: 'palladium', label: 'Palladium', color: colors.palladium },
                    ].map(m => (
                      <TouchableOpacity key={m.key} style={[styles.metalTab, { borderColor: metalTab === m.key ? m.color : colors.border, backgroundColor: metalTab === m.key ? `${m.color}22` : 'transparent' }]} onPress={() => handleMetalTabChange(m.key)}>
                        <Text style={{ color: metalTab === m.key ? m.color : colors.muted, fontSize: scaledFonts.normal }}>{m.label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <FloatingInput label="Product Name" value={form.productName} onChangeText={v => { setForm(p => ({ ...p, productName: v })); if (v) setFormErrors(e => ({ ...e, productName: false })); }} placeholder={{ gold: 'e.g. American Gold Eagle', silver: 'e.g. American Silver Eagle', platinum: 'e.g. American Platinum Eagle', palladium: 'e.g. Canadian Palladium Maple Leaf' }[metalTab] || 'e.g. American Silver Eagle'} colors={colors} isDarkMode={isDarkMode} scaledFonts={scaledFonts} required error={formErrors.productName} />
                  <FloatingInput label="Dealer" value={form.source} onChangeText={v => setForm(p => ({ ...p, source: v }))} placeholder="APMEX" colors={colors} isDarkMode={isDarkMode} scaledFonts={scaledFonts} />
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <View style={{ flex: 1 }}>
                      <TouchableOpacity style={{ backgroundColor: isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)', borderRadius: 10, padding: 14, borderWidth: 1, borderColor: colors.border }} onPress={() => { Keyboard.dismiss(); setShowDatePicker(true); }}>
                        <Text style={{ color: colors.muted, fontSize: scaledFonts.tiny, marginBottom: 2 }}>Date</Text>
                        <Text style={{ color: form.datePurchased ? colors.text : colors.muted, fontSize: scaledFonts.normal }}>{form.datePurchased ? (() => { const [y,m,d] = form.datePurchased.split('-'); return `${m}-${d}-${y}`; })() : 'Tap to select'}</Text>
                      </TouchableOpacity>
                    </View>
                    <View style={{ flex: 1 }}>
                      <TouchableOpacity style={{ backgroundColor: isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)', borderRadius: 10, padding: 14, borderWidth: 1, borderColor: colors.border }} onPress={() => { Keyboard.dismiss(); setShowTimePicker(true); }}>
                        <Text style={{ color: colors.muted, fontSize: scaledFonts.tiny, marginBottom: 2 }}>Time</Text>
                        <Text style={{ color: form.timePurchased ? colors.text : colors.muted, fontSize: scaledFonts.normal }}>{form.timePurchased ? (() => { const [h,m] = form.timePurchased.split(':').map(Number); const p = h >= 12 ? 'PM' : 'AM'; const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h; return `${h12}:${String(m).padStart(2,'0')} ${p}`; })() : 'Optional'}</Text>
                      </TouchableOpacity>
                    </View>
                  </View>

                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <View style={{ flex: 1 }}><FloatingInput label="OZT per unit" value={form.ozt} onChangeText={v => { setForm(p => ({ ...p, ozt: v })); if (v && parseFloat(v) > 0) setFormErrors(e => ({ ...e, ozt: false })); }} placeholder="1, 10, 100..." keyboardType="decimal-pad" colors={colors} isDarkMode={isDarkMode} scaledFonts={scaledFonts} required error={formErrors.ozt} /></View>
                    <View style={{ flex: 1 }}><FloatingInput label="Quantity" value={form.quantity} onChangeText={v => { setForm(p => ({ ...p, quantity: v })); if (v && parseInt(v) > 0) setFormErrors(e => ({ ...e, quantity: false })); }} placeholder="Quantity" keyboardType="number-pad" colors={colors} isDarkMode={isDarkMode} scaledFonts={scaledFonts} required error={formErrors.quantity} /></View>
                  </View>

                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <View style={{ flex: 1 }}><FloatingInput label="Unit Price" value={form.unitPrice} onChangeText={v => { setForm(p => ({ ...p, unitPrice: v })); if (v && parseFloat(v) > 0) setFormErrors(e => ({ ...e, unitPrice: false })); }} placeholder="0.00" keyboardType="decimal-pad" prefix="$" colors={colors} isDarkMode={isDarkMode} scaledFonts={scaledFonts} required error={formErrors.unitPrice} /></View>
                    <View style={{ flex: 1 }}><FloatingInput label="Spot at Purchase" value={form.spotPrice} onChangeText={v => { setForm(p => ({ ...p, spotPrice: v })); setSpotPriceSource(null); }} placeholder="Auto" keyboardType="decimal-pad" prefix="$" colors={colors} isDarkMode={isDarkMode} scaledFonts={scaledFonts} /></View>
                  </View>

                  {/* Accuracy indicators for historical spot prices */}
                  {spotPriceSource === 'price_log' && (
                    <Text style={{ color: '#22C55E', fontSize: scaledFonts.small, marginTop: -4, marginBottom: 4 }}>
                      Exact price from our records
                    </Text>
                  )}
                  {spotPriceSource === 'etf_derived' && (
                    <Text style={{ color: '#3B82F6', fontSize: scaledFonts.small, marginTop: -4, marginBottom: 4 }}>
                      Daily ETF-derived price. You can adjust if needed.
                    </Text>
                  )}
                  {(spotPriceSource === 'macrotrends' || spotPriceSource === 'static-json' || spotPriceSource === 'static-json-nearest') && (
                    <Text style={{ color: '#E69500', fontSize: scaledFonts.small, marginTop: -4, marginBottom: 4 }}>
                      Monthly average (daily price unavailable). You can edit this manually.
                    </Text>
                  )}
                  {(spotPriceSource === 'current-spot' || spotPriceSource === 'current-fallback' || spotPriceSource === 'client-fallback' || spotPriceSource === 'current_fallback') && (
                    <Text style={{ color: '#E69500', fontSize: scaledFonts.small, marginTop: -4, marginBottom: 4 }}>
                      Historical price unavailable - using today's spot. You can edit this manually.
                    </Text>
                  )}

                  {/* Warning when user's spot price differs significantly from historical */}
                  {historicalSpotSuggestion && (() => {
                    const userSpot = parseFloat(form.spotPrice) || 0;
                    const histSpot = historicalSpotSuggestion.price;
                    const diff = Math.abs(userSpot - histSpot);
                    const pctDiff = histSpot > 0 ? (diff / histSpot) * 100 : 0;
                    // Only show warning if difference > 10% and user has entered a value
                    if (pctDiff <= 10 || userSpot === 0) return null;
                    return (
                      <View style={{ backgroundColor: 'rgba(251, 191, 36, 0.15)', padding: 10, borderRadius: 8, marginTop: -4, marginBottom: 8, borderWidth: 1, borderColor: 'rgba(251, 191, 36, 0.3)' }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                          <View style={{ flex: 1 }}>
                            <Text style={{ color: '#E69500', fontSize: scaledFonts.small, fontWeight: '600' }}>
                              Your price differs by {pctDiff.toFixed(0)}%
                            </Text>
                            <Text style={{ color: colors.muted, fontSize: scaledFonts.tiny, marginTop: 2 }}>
                              Historical spot was ${formatCurrency(histSpot)} on {historicalSpotSuggestion.date}
                            </Text>
                          </View>
                          <TouchableOpacity
                            onPress={() => {
                              setForm(prev => ({ ...prev, spotPrice: histSpot.toString() }));
                              setSpotPriceSource(historicalSpotSuggestion.source);
                            }}
                            style={{ paddingHorizontal: 10, paddingVertical: 6, backgroundColor: 'rgba(251, 191, 36, 0.3)', borderRadius: 6, marginLeft: 8 }}
                          >
                            <Text style={{ color: '#E69500', fontSize: scaledFonts.tiny, fontWeight: '600' }}>Use ${formatCurrency(histSpot)}</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    );
                  })()}

                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <View style={{ flex: 1 }}><FloatingInput label="Taxes" value={form.taxes} onChangeText={v => setForm(p => ({ ...p, taxes: v }))} placeholder="0.00" keyboardType="decimal-pad" prefix="$" colors={colors} isDarkMode={isDarkMode} scaledFonts={scaledFonts} /></View>
                    <View style={{ flex: 1 }}><FloatingInput label="Shipping" value={form.shipping} onChangeText={v => setForm(p => ({ ...p, shipping: v }))} placeholder="0.00" keyboardType="decimal-pad" prefix="$" colors={colors} isDarkMode={isDarkMode} scaledFonts={scaledFonts} /></View>
                  </View>

                  {/* Total Cost Basis - editable for adjustments */}
                  <View style={[styles.card, { backgroundColor: `${colors.success}15`, marginTop: 8 }]}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <Text style={{ color: colors.success, fontWeight: '600', fontSize: scaledFonts.normal }}>Total Cost Basis</Text>
                      <TouchableOpacity
                        onPress={() => {
                          // Recalculate from components
                          const calculated = ((parseFloat(form.unitPrice) || 0) * (parseInt(form.quantity) || 1)) + (parseFloat(form.taxes) || 0) + (parseFloat(form.shipping) || 0);
                          setForm(p => ({ ...p, costBasis: calculated.toFixed(2) }));
                        }}
                        style={{ paddingHorizontal: 8, paddingVertical: 4, backgroundColor: `${colors.success}30`, borderRadius: 6 }}
                      >
                        <Text style={{ color: colors.success, fontSize: scaledFonts.tiny }}>Recalculate</Text>
                      </TouchableOpacity>
                    </View>
                    <FloatingInput
                      label="Total Cost (adjust if needed)"
                      value={form.costBasis || (((parseFloat(form.unitPrice) || 0) * (parseInt(form.quantity) || 1)) + (parseFloat(form.taxes) || 0) + (parseFloat(form.shipping) || 0)).toFixed(2)}
                      onChangeText={v => setForm(p => ({ ...p, costBasis: v }))}
                      placeholder="0"
                      keyboardType="decimal-pad"
                      prefix="$"
                      colors={colors}
                      isDarkMode={isDarkMode}
                      scaledFonts={scaledFonts}
                    />
                    <Text style={{ color: colors.muted, fontSize: scaledFonts.tiny, marginTop: 4 }}>
                      Edit to adjust for forgotten costs or corrections
                    </Text>
                  </View>

                  <View style={[styles.card, { backgroundColor: `${colors.gold}15` }]}>
                    <Text style={{ color: colors.gold, fontWeight: '600', marginBottom: 8, fontSize: scaledFonts.normal }}>Premium (Auto-calculated)</Text>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <View style={{ flex: 1 }}><FloatingInput label="Per Unit" value={form.premium} onChangeText={v => setForm(p => ({ ...p, premium: v }))} keyboardType="decimal-pad" prefix="$" colors={colors} isDarkMode={isDarkMode} scaledFonts={scaledFonts} /></View>
                      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                        {(() => {
                          const totalPremium = parseFloat(form.premium || 0) * parseInt(form.quantity || 1);
                          const unitPrice = parseFloat(form.unitPrice || 0);
                          const premiumPct = calculatePremiumPercent(parseFloat(form.premium || 0), unitPrice);
                          return (
                            <>
                              <Text style={{ color: colors.muted, fontSize: scaledFonts.small }}>Total: ${formatCurrency(totalPremium)}</Text>
                              {premiumPct > 0 && (
                                <Text style={{ color: colors.gold, fontSize: scaledFonts.tiny, marginTop: 2 }}>+{premiumPct.toFixed(1)}%</Text>
                              )}
                            </>
                          );
                        })()}
                      </View>
                    </View>
                  </View>
                </ScrollView>

                {/* Sticky Save Button */}
                <View style={[styles.stickyButtonContainer, { backgroundColor: isDarkMode ? '#1a1a2e' : '#ffffff', borderTopColor: colors.border }]}>
                  <TouchableOpacity style={[styles.button, { backgroundColor: colors.gold }]} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); savePurchase(); }}>
                    <Text style={{ color: '#000', fontWeight: '600', fontSize: scaledFonts.normal }}>{editingItem ? 'Update' : 'Add'} Purchase</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </KeyboardAvoidingView>

            {/* DATE/TIME PICKER OVERLAYS */}
            <DatePickerModal
              visible={showDatePicker}
              onClose={() => setShowDatePicker(false)}
              initialDate={form.datePurchased}
              onConfirm={(date) => {
                setShowDatePicker(false);
                handleDateChange(date);
              }}
            />
            <TimePickerModal
              visible={showTimePicker}
              onClose={() => setShowTimePicker(false)}
              initialTime={form.timePurchased}
              onConfirm={(time) => {
                setShowTimePicker(false);
                handleTimeChange(time);
              }}
            />
          </SafeAreaView>
        </View>
      )}

      {/* SPECULATION */}
      {showSpeculationModal && (
        <View {...speculationSwipe.panHandlers} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#000', zIndex: 9998 }}>
          <SafeAreaView style={{ flex: 1, backgroundColor: '#000' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#1a1a1a' }}>
              <TouchableOpacity onPress={() => setShowSpeculationModal(false)} style={{ marginRight: 12 }} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Text style={{ color: '#C9A84C', fontSize: 28, fontWeight: '300' }}>{'\u2039'}</Text>
              </TouchableOpacity>
              <Text style={{ color: '#fff', fontSize: 17, fontWeight: '700', flex: 1 }}>What If...</Text>
            </View>
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
        {/* Inputs at TOP */}
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
          <View style={{ flex: 1 }}><FloatingInput label="Silver" value={specSilverPrice} onChangeText={setSpecSilverPrice} keyboardType="decimal-pad" prefix="$" colors={colors} isDarkMode={isDarkMode} scaledFonts={scaledFonts} /></View>
          <View style={{ flex: 1 }}><FloatingInput label="Gold" value={specGoldPrice} onChangeText={setSpecGoldPrice} keyboardType="decimal-pad" prefix="$" colors={colors} isDarkMode={isDarkMode} scaledFonts={scaledFonts} /></View>
        </View>
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
          <View style={{ flex: 1 }}><FloatingInput label="Platinum" value={specPlatinumPrice} onChangeText={setSpecPlatinumPrice} keyboardType="decimal-pad" prefix="$" colors={colors} isDarkMode={isDarkMode} scaledFonts={scaledFonts} /></View>
          <View style={{ flex: 1 }}><FloatingInput label="Palladium" value={specPalladiumPrice} onChangeText={setSpecPalladiumPrice} keyboardType="decimal-pad" prefix="$" colors={colors} isDarkMode={isDarkMode} scaledFonts={scaledFonts} /></View>
        </View>

        {/* Quick presets */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
          {[
            { s: 200, g: 7500, pt: 3000, pd: 2500, label: 'Bull' },
            { s: 350, g: 10000, pt: 5000, pd: 4000, label: 'Moon' },
            { s: 1000, g: 25000, pt: 10000, pd: 8000, label: 'Hyper' },
          ].map((preset, i) => (
            <TouchableOpacity key={i} style={{ backgroundColor: colors.border, padding: 12, borderRadius: 12, marginRight: 8 }} onPress={() => { setSpecSilverPrice(preset.s.toString()); setSpecGoldPrice(preset.g.toString()); setSpecPlatinumPrice(preset.pt.toString()); setSpecPalladiumPrice(preset.pd.toString()); Keyboard.dismiss(); }}>
              <Text style={{ color: colors.text, fontSize: scaledFonts.normal }}>{preset.label}</Text>
              <Text style={{ color: colors.muted, fontSize: scaledFonts.tiny }}>Ag ${preset.s} / Au ${preset.g}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Results */}
        <View style={[styles.card, { backgroundColor: `${colors.success}22` }]}>
          <Text style={{ color: colors.success, fontWeight: '600', fontSize: scaledFonts.normal }}>Projected Value</Text>
          <Text style={{ color: colors.text, fontSize: scaledFonts.huge, fontWeight: '700' }}>${specTotalValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</Text>
          <Text style={{ color: specGainLoss >= 0 ? colors.success : colors.error, fontSize: scaledFonts.normal }}>{specGainLoss >= 0 ? '+' : ''}{specGainLossPct.toFixed(1)}% from cost basis</Text>
        </View>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {[
            { label: 'Silver', color: colors.silver, value: totalSilverOzt * specSilverNum },
            { label: 'Gold', color: colors.gold, value: totalGoldOzt * specGoldNum },
            { label: 'Platinum', color: colors.platinum, value: totalPlatinumOzt * specPlatinumNum },
            { label: 'Palladium', color: colors.palladium, value: totalPalladiumOzt * specPalladiumNum },
          ].filter(m => m.value > 0).map(m => (
            <View key={m.label} style={[styles.card, { width: '47%', backgroundColor: `${m.color}22` }]}>
              <Text style={{ color: m.color, fontSize: scaledFonts.small }}>{m.label}</Text>
              <Text style={{ color: colors.text, fontSize: scaledFonts.large, fontWeight: '600' }}>${m.value.toLocaleString()}</Text>
            </View>
          ))}
        </View>
            </ScrollView>
          </SafeAreaView>
        </View>
      )}

      {/* JUNK SILVER CALCULATOR */}
      {showJunkCalcModal && (
        <View {...junkCalcSwipe.panHandlers} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#000', zIndex: 9998 }}>
          <SafeAreaView style={{ flex: 1, backgroundColor: '#000' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#1a1a1a' }}>
              <TouchableOpacity onPress={() => setShowJunkCalcModal(false)} style={{ marginRight: 12 }} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Text style={{ color: '#C9A84C', fontSize: 28, fontWeight: '300' }}>{'\u2039'}</Text>
              </TouchableOpacity>
              <Text style={{ color: '#fff', fontSize: 17, fontWeight: '700', flex: 1 }}>Junk Silver Calculator</Text>
            </View>
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
        {/* Type selector at TOP */}
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
          {[{ k: '90', l: '90%' }, { k: '40', l: '40%' }, { k: '35', l: 'War Nickels' }].map(t => (
            <TouchableOpacity key={t.k} style={[styles.metalTab, { flex: 1, borderColor: junkType === t.k ? colors.silver : colors.border, backgroundColor: junkType === t.k ? `${colors.silver}22` : 'transparent' }]} onPress={() => { setJunkType(t.k); Keyboard.dismiss(); }}>
              <Text style={{ color: junkType === t.k ? colors.silver : colors.muted, fontSize: scaledFonts.small }}>{t.l}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Input */}
        <FloatingInput label={junkType === '35' ? '# of Nickels' : 'Face Value ($)'} value={junkFaceValue} onChangeText={setJunkFaceValue} keyboardType="decimal-pad" prefix={junkType === '35' ? '' : '$'} colors={colors} isDarkMode={isDarkMode} scaledFonts={scaledFonts} />

        {/* Results */}
        <View style={[styles.card, { backgroundColor: `${colors.silver}22` }]}>
          <Text style={{ color: colors.silver, fontSize: scaledFonts.normal }}>Silver Content</Text>
          <Text style={{ color: colors.text, fontSize: scaledFonts.xlarge, fontWeight: '700' }}>{junkOzt.toFixed(3)} oz</Text>
        </View>

        <View style={[styles.card, { backgroundColor: `${colors.success}22` }]}>
          <Text style={{ color: colors.success, fontSize: scaledFonts.normal }}>Melt Value @ ${formatCurrency(silverSpot)}/oz</Text>
          <Text style={{ color: colors.text, fontSize: scaledFonts.huge, fontWeight: '700' }}>${formatCurrency(junkMeltValue)}</Text>
        </View>

        <View style={{ backgroundColor: isDarkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)', padding: 12, borderRadius: 8 }}>
          <Text style={{ color: colors.muted, fontSize: scaledFonts.tiny }}>
            {junkType === '90' && '90% silver: Pre-1965 dimes, quarters, halves. Multiply face value × 0.715 for oz.'}
            {junkType === '40' && '40% silver: 1965-1970 Kennedy halves. Multiply face value × 0.295 for oz.'}
            {junkType === '35' && '35% silver: War Nickels (1942-1945). Each contains 0.0563 oz silver.'}
          </Text>
        </View>
            </ScrollView>
          </SafeAreaView>
        </View>
      )}

      {/* PREMIUM ANALYSIS */}
      {showPremiumAnalysisModal && (
        <View {...premiumSwipe.panHandlers} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#000', zIndex: 9998 }}>
          <SafeAreaView style={{ flex: 1, backgroundColor: '#000' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#1a1a1a' }}>
              <TouchableOpacity onPress={() => setShowPremiumAnalysisModal(false)} style={{ marginRight: 12 }} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Text style={{ color: '#C9A84C', fontSize: 28, fontWeight: '300' }}>{'\u2039'}</Text>
              </TouchableOpacity>
              <Text style={{ color: '#fff', fontSize: 17, fontWeight: '700', flex: 1 }}>Premium Analysis</Text>
            </View>
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        {(() => {
          // Simply read saved item.premium values — already calculated when added/edited
          const metalPremiums = [
            { key: 'silver', label: 'Silver', items: silverItems, color: colors.silver },
            { key: 'gold', label: 'Gold', items: goldItems, color: colors.gold },
            { key: 'platinum', label: 'Platinum', items: platinumItems, color: colors.platinum },
            { key: 'palladium', label: 'Palladium', items: palladiumItems, color: colors.palladium },
          ];

          let grandTotal = 0;
          let totalAll = 0;
          let totalWith = 0;
          metalPremiums.forEach(m => {
            totalAll += m.items.length;
            const withPremium = m.items.filter(i => (i.premium || 0) > 0);
            totalWith += withPremium.length;
            grandTotal += withPremium.reduce((sum, i) => sum + i.premium * i.quantity, 0);
          });

          return (
            <>
              {metalPremiums.filter(m => m.items.length > 0).map(m => {
                const withPremium = m.items.filter(i => (i.premium || 0) > 0);
                const metalTotal = withPremium.reduce((sum, i) => sum + i.premium * i.quantity, 0);
                return (
                  <View key={m.key} style={[styles.card, { backgroundColor: `${m.color}15`, borderColor: `${m.color}30` }]}>
                    <Text style={{ color: m.color, fontWeight: '700', fontSize: scaledFonts.normal, marginBottom: 8 }}>{m.label} Premiums</Text>
                    {withPremium.length > 0 ? (
                      <>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                          <Text style={{ color: colors.muted, fontSize: scaledFonts.normal }}>Total Paid</Text>
                          <Text style={{ color: colors.text, fontSize: scaledFonts.normal, fontWeight: '600' }}>${formatCurrency(metalTotal)}</Text>
                        </View>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                          <Text style={{ color: colors.muted, fontSize: scaledFonts.normal }}>Avg per Unit</Text>
                          <Text style={{ color: colors.text, fontSize: scaledFonts.normal }}>${formatCurrency(metalTotal / withPremium.reduce((s, i) => s + i.quantity, 0))}</Text>
                        </View>
                      </>
                    ) : (
                      <Text style={{ color: colors.muted, fontSize: scaledFonts.small, marginBottom: 4 }}>No premium data available</Text>
                    )}
                    <Text style={{ color: colors.muted, fontSize: scaledFonts.tiny, marginTop: 4 }}>
                      {withPremium.length} of {m.items.length} holding{m.items.length !== 1 ? 's' : ''} with data
                    </Text>
                  </View>
                );
              })}

              {/* Total */}
              <View style={[styles.card, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={{ color: colors.text, fontWeight: '700', fontSize: scaledFonts.medium }}>Total Premiums Paid</Text>
                  <Text style={{ color: colors.gold, fontSize: scaledFonts.large, fontWeight: '700' }}>${formatCurrency(grandTotal)}</Text>
                </View>
                <Text style={{ color: colors.muted, fontSize: scaledFonts.tiny, marginTop: 8 }}>
                  {totalWith} of {totalAll} holding{totalAll !== 1 ? 's' : ''} with premium data
                </Text>
              </View>

              {totalWith === 0 && (
                <View style={[styles.card, { backgroundColor: isDarkMode ? 'rgba(251,191,36,0.1)' : 'rgba(251,191,36,0.15)', borderColor: `${colors.gold}30` }]}>
                  <Text style={{ color: colors.gold, fontWeight: '600', fontSize: scaledFonts.normal, marginBottom: 4 }}>How to add premium data</Text>
                  <Text style={{ color: colors.muted, fontSize: scaledFonts.small }}>
                    Edit a holding and enter the "Spot at Purchase" price. The premium will be calculated automatically as the difference between your unit price and the spot price.
                  </Text>
                </View>
              )}
            </>
          );
        })()}
            </ScrollView>
          </SafeAreaView>
        </View>
      )}

      {/* PRIVACY & SECURITY */}
      {showPrivacyModal && (
        <View {...privacySwipe.panHandlers} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#000', zIndex: 9998 }}>
          <SafeAreaView style={{ flex: 1, backgroundColor: '#000' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#1a1a1a' }}>
              <TouchableOpacity onPress={() => setShowPrivacyModal(false)} style={{ marginRight: 12 }} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Text style={{ color: '#C9A84C', fontSize: 28, fontWeight: '300' }}>{'\u2039'}</Text>
              </TouchableOpacity>
              <Text style={{ color: '#fff', fontSize: 17, fontWeight: '700', flex: 1 }}>Privacy & Security</Text>
            </View>
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <View style={[styles.card, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
          <Text style={[styles.cardTitle, { color: colors.success }]}>How We Protect Your Data</Text>
          <Text style={[styles.privacyItem, { color: colors.text }]}>• Your stack data is stored securely on our servers for sync and backup</Text>
          <Text style={[styles.privacyItem, { color: colors.text }]}>• All data is encrypted in transit and at rest</Text>
          <Text style={[styles.privacyItem, { color: colors.text }]}>• Guest mode keeps data only on your device</Text>
          <Text style={[styles.privacyItem, { color: colors.text }]}>• Receipt images are processed in memory and deleted immediately after scanning</Text>
          <Text style={[styles.privacyItem, { color: colors.text }]}>• Analytics snapshots are stored to power your stack charts</Text>
          <Text style={[styles.privacyItem, { color: colors.text }]}>• Push notification tokens are stored only to deliver alerts you've opted into</Text>
        </View>
        <View style={[styles.card, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
          <Text style={[styles.cardTitle, { color: '#007AFF' }]}>AI-Powered Features</Text>
          <Text style={[styles.privacyItem, { color: colors.text }]}>• Your Daily Brief and Troy's Take use Google Gemini AI</Text>
          <Text style={[styles.privacyItem, { color: colors.text }]}>• Stack data is sent to the AI provider for analysis only</Text>
          <Text style={[styles.privacyItem, { color: colors.text }]}>• AI-generated content is for informational purposes, not financial advice</Text>
          <Text style={[styles.privacyItem, { color: colors.text }]}>• Your data is not shared beyond the AI provider</Text>
        </View>
        <View style={[styles.card, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
          <Text style={[styles.cardTitle, { color: colors.error }]}>What We Never Do</Text>
          <Text style={[styles.privacyItem, { color: colors.text }]}>• Sell or share your data with third parties</Text>
          <Text style={[styles.privacyItem, { color: colors.text }]}>• Share your information with advertisers</Text>
          <Text style={[styles.privacyItem, { color: colors.text }]}>• Track your browsing or behavior outside the app</Text>
          <Text style={[styles.privacyItem, { color: colors.text }]}>• Use push tokens for advertising or tracking</Text>
        </View>
        <View style={[styles.card, { backgroundColor: `${colors.success}22` }]}>
          <Text style={{ color: colors.success, fontWeight: '600' }}>Your Data, Your Control</Text>
          <Text style={{ color: colors.muted, fontStyle: 'italic' }}>"Your data is private and secure. We store it only to power your experience - never to sell or share."</Text>
        </View>
        <TouchableOpacity
          style={{ alignItems: 'center', paddingVertical: 16 }}
          onPress={() => Linking.openURL('https://api.stacktrackergold.com/privacy')}
        >
          <Text style={{ color: '#007AFF', fontSize: scaledFonts.normal }}>View Complete Privacy Policy</Text>
        </TouchableOpacity>
            </ScrollView>
          </SafeAreaView>
        </View>
      )}

      {/* HELP GUIDE */}
      {showHelpModal && (
        <View {...helpSwipe.panHandlers} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#000', zIndex: 9998 }}>
          <SafeAreaView style={{ flex: 1, backgroundColor: '#000' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#1a1a1a' }}>
              <TouchableOpacity onPress={() => setShowHelpModal(false)} style={{ marginRight: 12 }} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Text style={{ color: '#C9A84C', fontSize: 28, fontWeight: '300' }}>{'\u2039'}</Text>
              </TouchableOpacity>
              <Text style={{ color: '#fff', fontSize: 17, fontWeight: '700', flex: 1 }}>Help Guide</Text>
            </View>
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <View style={[styles.card, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
          <Text style={[styles.cardTitle, { color: colors.text, fontSize: scaledFonts.medium }]}>Today Tab</Text>
          <Text style={[styles.privacyItem, { color: colors.text, fontSize: scaledFonts.small }]}>{'\u2022'} Stack Pulse — Daily P/L and stack snapshot</Text>
          <Text style={[styles.privacyItem, { color: colors.text, fontSize: scaledFonts.small }]}>{'\u2022'} Metal Movers — Spot price changes across all metals</Text>
          <Text style={[styles.privacyItem, { color: colors.text, fontSize: scaledFonts.small }]}>{'\u2022'} Vault Watch — COMEX warehouse inventory for Ag, Au, Pt</Text>
          <Text style={[styles.privacyItem, { color: colors.text, fontSize: scaledFonts.small }]}>{'\u2022'} Market Intelligence — AI-curated news and analysis</Text>
          <Text style={[styles.privacyItem, { color: colors.text, fontSize: scaledFonts.small }]}>{'\u2022'} Your Daily Brief — AI market summary delivered to your feed</Text>
        </View>

        <View style={[styles.card, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
          <Text style={[styles.cardTitle, { color: colors.text, fontSize: scaledFonts.medium }]}>Stack Tab</Text>
          <Text style={[styles.privacyItem, { color: colors.text, fontSize: scaledFonts.small }]}>{'\u2022'} Add holdings manually with the "+" button</Text>
          <Text style={[styles.privacyItem, { color: colors.text, fontSize: scaledFonts.small }]}>{'\u2022'} AI Receipt Scanner — Snap a photo to auto-extract purchase data</Text>
          <Text style={[styles.privacyItem, { color: colors.text, fontSize: scaledFonts.small }]}>{'\u2022'} Swipe left on a holding to edit or delete</Text>
          <Text style={[styles.privacyItem, { color: colors.text, fontSize: scaledFonts.small }]}>{'\u2022'} Pull down to refresh live spot prices</Text>
          <View style={{ backgroundColor: 'rgba(251, 191, 36, 0.15)', padding: 10, borderRadius: 8, marginTop: 8 }}>
            <Text style={{ color: colors.gold, fontSize: scaledFonts.small, fontWeight: '600' }}>Tip: Digital screenshots of online receipts work best for scanning!</Text>
          </View>
        </View>

        <View style={[styles.card, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
            <Text style={[styles.cardTitle, { color: colors.text, fontSize: scaledFonts.medium }]}>Analytics Tab</Text>
            <View style={{ backgroundColor: 'rgba(251, 191, 36, 0.2)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
              <Text style={{ color: colors.gold, fontSize: scaledFonts.tiny, fontWeight: '600' }}>GOLD</Text>
            </View>
          </View>
          <Text style={[styles.privacyItem, { color: colors.text, fontSize: scaledFonts.small }]}>{'\u2022'} Troy's Take — AI analysis of your holdings</Text>
          <Text style={[styles.privacyItem, { color: colors.text, fontSize: scaledFonts.small }]}>{'\u2022'} Stack Value Chart — Track value over 1D to All Time</Text>
          <Text style={[styles.privacyItem, { color: colors.text, fontSize: scaledFonts.small }]}>{'\u2022'} Spot Price History — Historical charts for each metal</Text>
          <Text style={[styles.privacyItem, { color: colors.text, fontSize: scaledFonts.small }]}>{'\u2022'} Cost Basis Analysis — Total cost, P/L, and avg premium per metal</Text>
          <Text style={[styles.privacyItem, { color: colors.text, fontSize: scaledFonts.small }]}>{'\u2022'} Break-Even Analysis — Spot price needed to break even</Text>
        </View>

        <View style={[styles.card, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
          <Text style={[styles.cardTitle, { color: colors.text, fontSize: scaledFonts.medium }]}>Tools Tab</Text>
          <Text style={[styles.privacyItem, { color: colors.text, fontSize: scaledFonts.small }]}>{'\u2022'} Price Alerts — Push notifications when metals hit your target</Text>
          <Text style={[styles.privacyItem, { color: colors.text, fontSize: scaledFonts.small }]}>{'\u2022'} Share My Stack — Generate a shareable stack image</Text>
          <Text style={[styles.privacyItem, { color: colors.text, fontSize: scaledFonts.small }]}>{'\u2022'} Speculation Tool — Model stack value at hypothetical prices</Text>
          <Text style={[styles.privacyItem, { color: colors.text, fontSize: scaledFonts.small }]}>{'\u2022'} Junk Silver Calculator — Melt value for constitutional silver</Text>
          <Text style={[styles.privacyItem, { color: colors.text, fontSize: scaledFonts.small }]}>{'\u2022'} Stack Milestones — Set and track oz goals</Text>
        </View>

        <View style={[styles.card, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
          <Text style={[styles.cardTitle, { color: colors.text, fontSize: scaledFonts.medium }]}>Settings</Text>
          <Text style={[styles.privacyItem, { color: colors.text, fontSize: scaledFonts.small }]}>{'\u2022'} Notifications — Toggle Your Daily Brief, price alerts, breaking news</Text>
          <Text style={[styles.privacyItem, { color: colors.text, fontSize: scaledFonts.small }]}>{'\u2022'} Appearance — Light, dark, or auto theme</Text>
          <Text style={[styles.privacyItem, { color: colors.text, fontSize: scaledFonts.small }]}>{'\u2022'} Export & Backup — Backup, restore, or export CSV</Text>
        </View>

        {Platform.OS === 'ios' && (
          <View style={[styles.card, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
            <Text style={[styles.cardTitle, { color: colors.text, fontSize: scaledFonts.medium }]}>Widgets</Text>
            <Text style={[styles.privacyItem, { color: colors.text, fontSize: scaledFonts.small }]}>{'\u2022'} Home screen widgets with live stack value and spot prices</Text>
            <Text style={[styles.privacyItem, { color: colors.text, fontSize: scaledFonts.small }]}>{'\u2022'} Long-press home screen {'\u2192'} "+" {'\u2192'} search "TroyStack"</Text>
            <Text style={[styles.privacyItem, { color: colors.text, fontSize: scaledFonts.small }]}>{'\u2022'} Small, medium, and large sizes available</Text>
          </View>
        )}

        <View style={[styles.card, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
          <Text style={[styles.cardTitle, { color: colors.text, fontSize: scaledFonts.medium }]}>Push Notifications</Text>
          <Text style={[styles.privacyItem, { color: colors.text, fontSize: scaledFonts.small }]}>{'\u2022'} Your Daily Brief — Daily market summary push</Text>
          <Text style={[styles.privacyItem, { color: colors.text, fontSize: scaledFonts.small }]}>{'\u2022'} Price Alerts — Triggered when your targets are hit</Text>
          <Text style={[styles.privacyItem, { color: colors.text, fontSize: scaledFonts.small }]}>{'\u2022'} Breaking News & COMEX — Major events and vault changes</Text>
          <Text style={[styles.privacyItem, { color: colors.muted, fontSize: scaledFonts.small, marginTop: 4 }]}>Manage in Settings {'\u2192'} Notifications</Text>
        </View>

        <View style={[styles.card, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
          <Text style={[styles.cardTitle, { color: colors.text, fontSize: scaledFonts.medium }]}>Support</Text>
          <Text style={[styles.privacyItem, { color: colors.text, fontSize: scaledFonts.small }]}>{'\u2022'} Visit troystack.com for help</Text>
        </View>
            </ScrollView>
          </SafeAreaView>
        </View>
      )}

      {/* Stack Ledger PIN Modal */}
      <Modal visible={showLedgerPinModal} transparent animationType="fade" onRequestClose={() => !ledgerGenerating && setShowLedgerPinModal(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', padding: 24 }}>
          <View style={{ backgroundColor: '#1a1a1a', borderRadius: 16, padding: 24, width: '100%', maxWidth: 360, borderWidth: 1, borderColor: 'rgba(201,168,76,0.3)' }}>
            <View style={{ alignItems: 'center', marginBottom: 16 }}>
              <Svg width={32} height={32} viewBox="0 0 24 24" fill="none">
                <Path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" stroke="#C9A84C" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                <Path d="M14 2v6h6M12 18v-6M9 15l3 3 3-3" stroke="#C9A84C" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </Svg>
            </View>
            <Text style={{ color: '#fff', fontSize: 18, fontWeight: '700', textAlign: 'center', marginBottom: 6 }}>Set a 4-digit PIN</Text>
            <Text style={{ color: '#999', fontSize: 13, textAlign: 'center', marginBottom: 20, lineHeight: 18 }}>This PIN is a personal reference tag for your ledger. Keep it somewhere safe.</Text>

            <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 12, marginBottom: 24 }}>
              {[0, 1, 2, 3].map(i => (
                <TextInput
                  key={i}
                  ref={(el) => { ledgerPinRefs.current[i] = el; }}
                  value={ledgerPinDigits[i]}
                  onChangeText={(v) => {
                    const digit = v.replace(/[^0-9]/g, '').slice(-1);
                    const next = [...ledgerPinDigits];
                    next[i] = digit;
                    setLedgerPinDigits(next);
                    if (digit && i < 3) ledgerPinRefs.current[i + 1]?.focus();
                  }}
                  onKeyPress={({ nativeEvent }) => {
                    if (nativeEvent.key === 'Backspace' && !ledgerPinDigits[i] && i > 0) {
                      ledgerPinRefs.current[i - 1]?.focus();
                    }
                  }}
                  keyboardType="number-pad"
                  maxLength={1}
                  editable={!ledgerGenerating}
                  style={{ width: 52, height: 60, borderRadius: 12, backgroundColor: '#000', borderWidth: 1, borderColor: ledgerPinDigits[i] ? '#C9A84C' : 'rgba(255,255,255,0.15)', color: '#fff', fontSize: 24, textAlign: 'center', fontWeight: '700' }}
                />
              ))}
            </View>

            {ledgerGenerating ? (
              <View style={{ alignItems: 'center', paddingVertical: 8 }}>
                <ActivityIndicator size="small" color="#C9A84C" />
                <Text style={{ color: '#C9A84C', fontSize: 13, marginTop: 8 }}>Generating ledger…</Text>
              </View>
            ) : (
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <TouchableOpacity onPress={() => setShowLedgerPinModal(false)} style={{ flex: 1, paddingVertical: 12, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center' }}>
                  <Text style={{ color: '#fff', fontSize: 15, fontWeight: '600' }}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => {
                    const pin = ledgerPinDigits.join('');
                    if (pin.length !== 4) {
                      Alert.alert('Enter PIN', 'Please enter all 4 digits.');
                      return;
                    }
                    generateStackLedger(pin);
                  }}
                  disabled={ledgerPinDigits.join('').length !== 4}
                  style={{ flex: 1, paddingVertical: 12, borderRadius: 10, backgroundColor: ledgerPinDigits.join('').length === 4 ? '#C9A84C' : 'rgba(201,168,76,0.3)', alignItems: 'center' }}
                >
                  <Text style={{ color: ledgerPinDigits.join('').length === 4 ? '#000' : 'rgba(0,0,0,0.5)', fontSize: 15, fontWeight: '700' }}>Generate</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </Modal>

      {/* Gold Paywall */}
      <GoldPaywall
        visible={showPaywallModal}
        onClose={() => setShowPaywallModal(false)}
        onPurchaseSuccess={checkEntitlements}
        userTier={userTier}
      />

      {/* PRICE ALERTS */}
      {showAddAlertModal && (
        <View {...alertSwipe.panHandlers} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#000', zIndex: 9998 }}>
          <SafeAreaView style={{ flex: 1, backgroundColor: '#000' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#1a1a1a' }}>
              <TouchableOpacity onPress={() => { setShowAddAlertModal(false); setNewAlert({ metal: 'silver', targetPrice: '', direction: 'above' }); }} style={{ marginRight: 12 }} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Text style={{ color: '#C9A84C', fontSize: 28, fontWeight: '300' }}>{'\u2039'}</Text>
              </TouchableOpacity>
              <Text style={{ color: '#fff', fontSize: 17, fontWeight: '700', flex: 1 }}>Price Alerts</Text>
            </View>
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
        {/* TODO v2.1: ATH alerts section removed — implement with backend tracking */}

        {/* Custom Price Alert */}
        <View style={{ marginBottom: 20 }}>
          <Text style={{ color: colors.text, fontWeight: '700', fontSize: 16, marginBottom: 12 }}>New Alert</Text>
          <Text style={{ color: colors.muted, fontSize: 12, marginBottom: 16 }}>
            Get notified when spot prices reach your target
          </Text>

          {/* Metal Selection */}
          <Text style={{ color: colors.text, fontWeight: '600', marginBottom: 8 }}>Metal</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
            {[
              { key: 'silver', label: 'Silver', color: colors.silver },
              { key: 'gold', label: 'Gold', color: colors.gold },
              { key: 'platinum', label: 'Platinum', color: colors.platinum },
              { key: 'palladium', label: 'Palladium', color: colors.palladium },
            ].map((m) => (
              <TouchableOpacity
                key={m.key}
                style={{
                  width: '47%',
                  paddingVertical: 12,
                  borderRadius: 8,
                  backgroundColor: newAlert.metal === m.key
                    ? m.color
                    : (isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)'),
                  alignItems: 'center',
                }}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setNewAlert(prev => ({ ...prev, metal: m.key }));
                }}
              >
                <Text style={{
                  color: newAlert.metal === m.key ? '#000' : colors.text,
                  fontWeight: '600',
                }}>
                  {m.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Direction Selection */}
          <Text style={{ color: colors.text, fontWeight: '600', marginBottom: 8 }}>Alert When Price Goes...</Text>
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
            {[
              { key: 'above', label: '↑ Above' },
              { key: 'below', label: '↓ Below' },
            ].map((option) => (
              <TouchableOpacity
                key={option.key}
                style={{
                  flex: 1,
                  paddingVertical: 12,
                  borderRadius: 8,
                  backgroundColor: newAlert.direction === option.key
                    ? (option.key === 'above' ? colors.success : colors.error)
                    : (isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)'),
                  alignItems: 'center',
                }}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setNewAlert(prev => ({ ...prev, direction: option.key }));
                }}
              >
                <Text style={{
                  color: newAlert.direction === option.key ? '#fff' : colors.text,
                  fontWeight: '600',
                }}>
                  {option.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Target Price Input */}
          <Text style={{ color: colors.text, fontWeight: '600', marginBottom: 8 }}>Target Price ($/oz)</Text>
          <View style={{
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: isDarkMode ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.05)',
            borderRadius: 8,
            paddingHorizontal: 12,
            borderWidth: 1,
            borderColor: colors.border,
          }}>
            <Text style={{ color: colors.text, fontSize: 16, marginRight: 4 }}>$</Text>
            <TextInput
              style={{ flex: 1, color: colors.text, fontSize: 16, paddingVertical: 14 }}
              value={newAlert.targetPrice}
              onChangeText={(value) => setNewAlert(prev => ({ ...prev, targetPrice: value }))}
              keyboardType="decimal-pad"
              placeholder={{ gold: '4500.00', silver: '75.00', platinum: '2100.00', palladium: '1740.00' }[newAlert.metal] || '75.00'}
              placeholderTextColor={colors.muted}
            />
          </View>
          <Text style={{ color: colors.muted, fontSize: 11, marginTop: 4 }}>
            Current {{ gold: 'gold', silver: 'silver', platinum: 'platinum', palladium: 'palladium' }[newAlert.metal]} spot: ${{ gold: goldSpot, silver: silverSpot, platinum: platinumSpot, palladium: palladiumSpot }[newAlert.metal]?.toFixed(2)}/oz
          </Text>
        </View>

        {/* Create / Update Alert Button */}
        <TouchableOpacity
          style={{
            backgroundColor: colors.gold,
            padding: 16,
            borderRadius: 10,
            alignItems: 'center',
          }}
          onPress={createPriceAlert}
        >
          <Text style={{ color: '#000', fontWeight: '700', fontSize: 16 }}>Create Alert</Text>
        </TouchableOpacity>

        {!expoPushToken && (
          <View style={{ marginTop: 16, alignItems: 'center' }}>
            <Text style={{ color: colors.error, fontSize: 12, textAlign: 'center', marginBottom: 10 }}>
              Push notifications not enabled. Tap below to allow notifications.
            </Text>
            <TouchableOpacity
              style={{
                backgroundColor: '#FF9500',
                paddingHorizontal: 20,
                paddingVertical: 10,
                borderRadius: 8,
              }}
              onPress={async () => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                const token = await registerForPushNotifications();
                if (token) {
                  setExpoPushToken(token);
                  Alert.alert('Notifications Enabled', 'You will now receive price alert notifications.');
                } else {
                  Alert.alert('Notifications Blocked', 'Please enable notifications for Stack Tracker in your iOS Settings app.', [
                    { text: 'Open Settings', onPress: () => Linking.openSettings() },
                    { text: 'Cancel', style: 'cancel' },
                  ]);
                }
              }}
            >
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>Enable Notifications</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Saved Alerts List */}
        {priceAlerts.length > 0 && (
          <View style={{ marginTop: 24 }}>
            <View style={{ height: 1, backgroundColor: colors.border, marginBottom: 16 }} />
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <Text style={{ color: colors.text, fontWeight: '700', fontSize: 16 }}>Your Alerts</Text>
              <TouchableOpacity onPress={clearAllAlerts} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Text style={{ color: '#F44336', fontSize: 13, fontWeight: '600' }}>Clear All</Text>
              </TouchableOpacity>
            </View>
            {priceAlerts.map((alert) => (
              <SwipeableAlertRow
                key={alert.id}
                alert={alert}
                colors={colors}
                onDelete={deletePriceAlertDirect}
                onToggle={togglePriceAlert}
                spotPrices={{ gold: goldSpot, silver: silverSpot, platinum: platinumSpot, palladium: palladiumSpot }}
              />
            ))}
          </View>
        )}
            </ScrollView>
          </SafeAreaView>
        </View>
      )}

      {/* STACK MILESTONES */}
      {showMilestoneModal && (
        <View {...milestoneSwipe.panHandlers} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#000', zIndex: 9998 }}>
          <SafeAreaView style={{ flex: 1, backgroundColor: '#000' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#1a1a1a' }}>
              <TouchableOpacity onPress={() => { setShowMilestoneModal(false); setTempSilverMilestone(''); setTempGoldMilestone(''); }} style={{ marginRight: 12 }} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Text style={{ color: '#C9A84C', fontSize: 28, fontWeight: '300' }}>{'\u2039'}</Text>
              </TouchableOpacity>
              <Text style={{ color: '#fff', fontSize: 17, fontWeight: '700', flex: 1 }}>Stack Milestones</Text>
            </View>
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
        <View style={{ marginBottom: 20 }}>
          <Text style={{ color: colors.muted, marginBottom: 16, fontSize: scaledFonts.small }}>
            Set custom goals for your stack. Leave blank to use default milestones.
          </Text>

          {/* Current Progress Summary */}
          <View style={{
            backgroundColor: isDarkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)',
            padding: 12,
            borderRadius: 8,
            marginBottom: 20
          }}>
            <Text style={{ color: colors.muted, fontSize: scaledFonts.tiny, marginBottom: 4 }}>Current Stack</Text>
            <Text style={{ color: colors.silver, fontWeight: '600', fontSize: scaledFonts.normal }}>
              Silver: {totalSilverOzt.toFixed(1)} oz
            </Text>
            <Text style={{ color: colors.gold, fontWeight: '600', fontSize: scaledFonts.normal }}>
              Gold: {totalGoldOzt.toFixed(3)} oz
            </Text>
          </View>

          {/* Silver Milestone Input */}
          <Text style={{ color: colors.text, fontWeight: '600', marginBottom: 8, fontSize: scaledFonts.normal }}>Silver Goal (oz)</Text>
          <View style={{
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: isDarkMode ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.05)',
            borderRadius: 8,
            paddingHorizontal: 12,
            borderWidth: 1,
            borderColor: colors.border,
            marginBottom: 12,
          }}>
            <TextInput
              style={{ flex: 1, color: colors.text, fontSize: scaledFonts.medium, paddingVertical: 14 }}
              value={tempSilverMilestone}
              onChangeText={setTempSilverMilestone}
              keyboardType="decimal-pad"
              placeholder={`Default: ${defaultSilverMilestones.find(m => totalSilverOzt < m) || 1000}`}
              placeholderTextColor={colors.muted}
            />
            <Text style={{ color: colors.muted, fontSize: scaledFonts.normal }}>oz</Text>
          </View>

          {/* Quick Silver Suggestions */}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
            {[100, 250, 500, 1000].map((val) => (
              <TouchableOpacity
                key={`silver-${val}`}
                style={{
                  paddingHorizontal: 12,
                  paddingVertical: 6,
                  borderRadius: 16,
                  backgroundColor: isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)',
                }}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setTempSilverMilestone(val.toString());
                }}
              >
                <Text style={{ color: colors.silver, fontSize: scaledFonts.small }}>{val} oz</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Gold Milestone Input */}
          <Text style={{ color: colors.text, fontWeight: '600', marginBottom: 8, fontSize: scaledFonts.normal }}>Gold Goal (oz)</Text>
          <View style={{
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: isDarkMode ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.05)',
            borderRadius: 8,
            paddingHorizontal: 12,
            borderWidth: 1,
            borderColor: colors.border,
            marginBottom: 12,
          }}>
            <TextInput
              style={{ flex: 1, color: colors.text, fontSize: scaledFonts.medium, paddingVertical: 14 }}
              value={tempGoldMilestone}
              onChangeText={setTempGoldMilestone}
              keyboardType="decimal-pad"
              placeholder={`Default: ${defaultGoldMilestones.find(m => totalGoldOzt < m) || 100}`}
              placeholderTextColor={colors.muted}
            />
            <Text style={{ color: colors.muted, fontSize: scaledFonts.normal }}>oz</Text>
          </View>

          {/* Quick Gold Suggestions */}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
            {[5, 10, 25, 50].map((val) => (
              <TouchableOpacity
                key={`gold-${val}`}
                style={{
                  paddingHorizontal: 12,
                  paddingVertical: 6,
                  borderRadius: 16,
                  backgroundColor: isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)',
                }}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setTempGoldMilestone(val.toString());
                }}
              >
                <Text style={{ color: colors.gold, fontSize: scaledFonts.small }}>{val} oz</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Save Button */}
        <TouchableOpacity
          style={{
            backgroundColor: colors.gold,
            padding: 16,
            borderRadius: 10,
            alignItems: 'center',
            marginBottom: 12,
          }}
          onPress={saveMilestones}
        >
          <Text style={{ color: '#000', fontWeight: '700', fontSize: scaledFonts.medium }}>Save Goals</Text>
        </TouchableOpacity>

        {/* Reset to Defaults Button */}
        {(customSilverMilestone || customGoldMilestone) && (
          <TouchableOpacity
            style={{
              padding: 12,
              borderRadius: 10,
              alignItems: 'center',
              backgroundColor: isDarkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)',
            }}
            onPress={async () => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setCustomSilverMilestone(null);
              setCustomGoldMilestone(null);
              setTempSilverMilestone('');
              setTempGoldMilestone('');
              await AsyncStorage.removeItem('stack_silver_milestone');
              await AsyncStorage.removeItem('stack_gold_milestone');
              setShowMilestoneModal(false);
            }}
          >
            <Text style={{ color: colors.muted, fontWeight: '500', fontSize: scaledFonts.normal }}>Reset to Default Milestones</Text>
          </TouchableOpacity>
        )}
            </ScrollView>
          </SafeAreaView>
        </View>
      )}

      {/* Scanned Items Preview Modal */}
      <ModalWrapper
        visible={showScannedItemsPreview}
        onClose={() => {
          setShowScannedItemsPreview(false);
          setScannedItems([]);
          setScannedMetadata({ purchaseDate: '', purchaseTime: '', dealer: '' });
        }}
        title="Receipt Scanned"
        colors={colors}
        isDarkMode={isDarkMode}
      >
        <View style={{ marginBottom: 16 }}>
          <Text style={{ color: colors.success, fontSize: 18, fontWeight: '600', marginBottom: 4 }}>
            Found {scannedItems.length} Item{scannedItems.length > 1 ? 's' : ''}
          </Text>
          {scannedMetadata.dealer && (
            <Text style={{ color: colors.muted, fontSize: 12 }}>Dealer: {scannedMetadata.dealer}</Text>
          )}
          {scannedMetadata.purchaseDate && (
            <Text style={{ color: colors.muted, fontSize: 12 }}>Date: {scannedMetadata.purchaseDate}{scannedMetadata.purchaseTime ? ` at ${scannedMetadata.purchaseTime}` : ''}</Text>
          )}
        </View>

        {scannedItems.map((item, index) => {
          const itemMetal = item.metal || 'silver';
          const itemColor = itemMetal === 'silver' ? colors.silver : colors.gold;

          return (
            <View key={index} style={[styles.card, { marginBottom: 12, padding: 12, borderLeftWidth: 3, borderLeftColor: itemColor }]}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.text, fontWeight: '600', fontSize: 14 }}>{item.productName || 'Unknown Item'}</Text>
                  <Text style={{ color: itemColor, fontSize: 12, marginTop: 2 }}>
                    {itemMetal.toUpperCase()} • {item.ozt ?? 0} oz{(item.quantity ?? 1) > 1 ? ` • Qty: ${item.quantity}` : ''}
                  </Text>
                </View>
              </View>

              {/* Editable Price Fields */}
              <View style={{ flexDirection: 'row', gap: 12, marginTop: 8 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.muted, fontSize: 10, marginBottom: 4 }}>Unit Price</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.cardBg, borderRadius: 6, paddingHorizontal: 8 }}>
                    <Text style={{ color: colors.text, fontSize: 14 }}>$</Text>
                    <TextInput
                      style={{ flex: 1, color: colors.text, fontSize: 14, paddingVertical: 8 }}
                      value={(item.unitPrice ?? 0).toFixed(2)}
                      keyboardType="decimal-pad"
                      onChangeText={(value) => updateScannedItemPrice(index, 'unitPrice', value)}
                      selectTextOnFocus
                    />
                  </View>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.muted, fontSize: 10, marginBottom: 4 }}>Line Total{(item.quantity ?? 1) > 1 ? ` (×${item.quantity})` : ''}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.cardBg, borderRadius: 6, paddingHorizontal: 8 }}>
                    <Text style={{ color: colors.text, fontSize: 14 }}>$</Text>
                    <TextInput
                      style={{ flex: 1, color: colors.text, fontSize: 14, paddingVertical: 8 }}
                      value={(item.extPrice ?? 0).toFixed(2)}
                      keyboardType="decimal-pad"
                      onChangeText={(value) => updateScannedItemPrice(index, 'extPrice', value)}
                      selectTextOnFocus
                    />
                  </View>
                </View>
              </View>

              {(item.spotPrice ?? 0) > 0 && (
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 }}>
                  <Text style={{ color: colors.muted, fontSize: 11 }}>
                    Spot: ${(item.spotPrice ?? 0).toFixed(2)}
                  </Text>
                  {(item.premium ?? 0) !== 0 && (
                    <Text style={{ color: (item.premium ?? 0) > 0 ? colors.gold : colors.error, fontSize: 11 }}>
                      Premium: ${(item.premium ?? 0).toFixed(2)}
                    </Text>
                  )}
                </View>
              )}

              {/* Price warning for suspicious values */}
              {item.priceWarning && (
                <View style={{ backgroundColor: 'rgba(239, 68, 68, 0.15)', padding: 8, borderRadius: 6, marginTop: 8 }}>
                  <Text style={{ color: colors.error, fontSize: 11 }}>{item.priceWarning}</Text>
                </View>
              )}

              <TouchableOpacity
                style={{
                  marginTop: 10,
                  paddingVertical: 6,
                  paddingHorizontal: 12,
                  backgroundColor: 'rgba(251,191,36,0.2)',
                  borderRadius: 6,
                  alignSelf: 'flex-start',
                }}
                onPress={() => editScannedItem(index)}
              >
                <Text style={{ color: colors.gold, fontSize: 12, fontWeight: '600' }}>Edit All Details</Text>
              </TouchableOpacity>
            </View>
          );
        })}

        {/* AI Disclaimer */}
        <Text style={{ color: colors.muted, fontSize: 11, textAlign: 'center', marginTop: 12, marginBottom: 8 }}>
          AI scanner may make mistakes. Please verify all values before adding.
        </Text>

        <View style={{ marginTop: 8 }}>
          <TouchableOpacity
            style={[styles.button, { backgroundColor: colors.success, marginBottom: 8 }]}
            onPress={confirmScannedItems}
          >
            <Text style={{ color: '#000', fontWeight: '600', fontSize: 16 }}>
              {scannedItems.length === 1
                ? 'Add Item'
                : `Add All ${scannedItems.length} Items`}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.buttonOutline]}
            onPress={() => {
              setShowScannedItemsPreview(false);
              setScannedItems([]);
              setScannedMetadata({ purchaseDate: '', purchaseTime: '', dealer: '' });
            }}
          >
            <Text style={{ color: colors.text }}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </ModalWrapper>

      {/* Dealer Selector Modal */}
      <Modal visible={showDealerSelector} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: isDarkMode ? '#1a1a2e' : '#ffffff', maxHeight: '80%' }]}>
            {/* Header */}
            <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>Select Dealer</Text>
              <TouchableOpacity
                onPress={() => {
                  setShowDealerSelector(false);
                  setPendingImportFile(null);
                  setSelectedDealer(null);
                }}
                style={[styles.closeButton, { backgroundColor: isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)' }]}
                hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}
              >
                <Text style={[styles.closeButtonText, { color: colors.text }]}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={{ padding: 20 }} showsVerticalScrollIndicator={false}>
              <Text style={{ color: colors.muted, marginBottom: 16, fontSize: 14 }}>
                We couldn't auto-detect the format. Select the dealer this CSV came from, or choose Generic if unsure.
              </Text>

              {Object.entries(DEALER_TEMPLATES)
                .filter(([key]) => key !== 'stacktracker') // Stack Tracker format is auto-detected
                .map(([key, template]) => (
                <TouchableOpacity
                  key={key}
                  style={[
                    styles.card,
                    {
                      backgroundColor: colors.cardBg,
                      borderColor: selectedDealer === key ? colors.gold : colors.border,
                      borderWidth: selectedDealer === key ? 2 : 1,
                      marginBottom: 12,
                      padding: 16,
                    },
                  ]}
                  onPress={() => setSelectedDealer(key)}
                >
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={{ color: colors.text, fontWeight: '600', fontSize: 16 }}>{template.name}</Text>
                    {selectedDealer === key && <Text style={{ color: colors.gold, fontSize: 18 }}>✓</Text>}
                  </View>
                  <Text style={{ color: colors.muted, fontSize: 12, marginTop: 4 }}>{template.instructions}</Text>
                </TouchableOpacity>
              ))}

              <View style={{ height: 20 }} />
            </ScrollView>

            {/* Footer buttons */}
            <View style={{ flexDirection: 'row', gap: 8, padding: 20, paddingTop: 0 }}>
              <TouchableOpacity
                style={[styles.buttonOutline, { flex: 1 }]}
                onPress={() => {
                  setShowDealerSelector(false);
                  setPendingImportFile(null);
                  setSelectedDealer(null);
                }}
              >
                <Text style={{ color: colors.text }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.button, { flex: 1, backgroundColor: selectedDealer ? colors.success : colors.muted, opacity: selectedDealer ? 1 : 0.5 }]}
                onPress={() => selectedDealer && handleDealerSelected(selectedDealer)}
                disabled={!selectedDealer}
              >
                <Text style={{ color: '#000', fontWeight: '600' }}>Continue</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Import Preview Modal */}
      {/* Import Preview Modal - Custom structure for FlatList */}
      <Modal visible={showImportPreview} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: isDarkMode ? '#1a1a2e' : '#ffffff' }]}>
            {/* Header */}
            <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>Import Preview</Text>
              <TouchableOpacity
                onPress={() => {
                  setShowImportPreview(false);
                  setImportData([]);
                }}
                style={[styles.closeButton, { backgroundColor: isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)' }]}
                hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}
              >
                <Text style={[styles.closeButtonText, { color: colors.text }]}>✕</Text>
              </TouchableOpacity>
            </View>

            {/* FlatList with header and footer */}
            <FlatList
              data={importData}
              keyExtractor={(item, index) => index.toString()}
              ListHeaderComponent={
                <Text style={{ color: colors.text, marginBottom: 16, fontWeight: '600', paddingHorizontal: 20 }}>
                  Found {importData.length} item{importData.length > 1 ? 's' : ''}. Tap any item to edit before importing:
                </Text>
              }
              contentContainerStyle={{ paddingBottom: 20 }}
              renderItem={({ item, index }) => {
                const itemColor = item.metal === 'silver' ? colors.silver : colors.gold;
                const hasAutoDetected = item.autoDetected && (item.autoDetected.metal || item.autoDetected.ozt);

                return (
                  <View style={[styles.card, { backgroundColor: colors.cardBg, borderColor: colors.border, marginBottom: 12, padding: 12, borderLeftWidth: 3, borderLeftColor: itemColor, marginHorizontal: 20 }]}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: colors.text, fontWeight: '600', fontSize: 14 }}>{item.productName}</Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2, flexWrap: 'wrap', gap: 4 }}>
                          <Text style={{ color: itemColor, fontSize: 12 }}>
                            {item.metal.toUpperCase()} • {item.ozt} oz{item.quantity > 1 ? ` • Qty: ${item.quantity}` : ''}
                          </Text>
                          {item.autoDetected?.metal && (
                            <View style={{ backgroundColor: 'rgba(251,191,36,0.2)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                              <Text style={{ color: colors.gold, fontSize: 9, fontWeight: '600' }}>AUTO-METAL</Text>
                            </View>
                          )}
                          {item.autoDetected?.ozt && (
                            <View style={{ backgroundColor: 'rgba(148,163,184,0.2)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                              <Text style={{ color: colors.silver, fontSize: 9, fontWeight: '600' }}>AUTO-OZT</Text>
                            </View>
                          )}
                        </View>
                      </View>
                      <Text style={{ color: colors.text, fontWeight: '600', fontSize: 14 }}>
                        ${(item.unitPrice * item.quantity).toFixed(2)}
                      </Text>
                    </View>

                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
                      <Text style={{ color: colors.muted, fontSize: 11 }}>
                        ${item.unitPrice.toFixed(2)} per item
                      </Text>
                      {item.datePurchased && (
                        <Text style={{ color: colors.muted, fontSize: 11 }}>
                          {item.datePurchased}
                        </Text>
                      )}
                    </View>

                    {item.source && (
                      <Text style={{ color: colors.muted, fontSize: 11, marginTop: 2 }}>
                        From: {item.source}
                      </Text>
                    )}

                    <TouchableOpacity
                      style={{
                        marginTop: 8,
                        paddingVertical: 6,
                        paddingHorizontal: 12,
                        backgroundColor: 'rgba(251,191,36,0.2)',
                        borderRadius: 6,
                        alignSelf: 'flex-start',
                      }}
                      onPress={() => editImportedItem(index)}
                    >
                      <Text style={{ color: colors.gold, fontSize: 12, fontWeight: '600' }}>Edit</Text>
                    </TouchableOpacity>
                  </View>
                );
              }}
            />

            {/* Footer buttons */}
            <View style={{ flexDirection: 'row', gap: 8, padding: 20, paddingTop: 0 }}>
              <TouchableOpacity
                style={[styles.buttonOutline, { flex: 1 }]}
                onPress={() => {
                  setShowImportPreview(false);
                  setImportData([]);
                }}
              >
                <Text style={{ color: colors.text }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.button, { flex: 1, backgroundColor: colors.success }]}
                onPress={confirmImport}
              >
                <Text style={{ color: '#000', fontWeight: '600' }}>Import {importData.length} Items</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ===== COMPARE DEALERS SCREEN ===== */}
      {currentScreen === 'CompareDealers' && (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#000', zIndex: 9998 }}>
          <SafeAreaView style={{ flex: 1, backgroundColor: '#000' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#1a1a1a' }}>
              <TouchableOpacity onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setCurrentScreen('TroyChat'); }} style={{ marginRight: 12 }} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Text style={{ color: '#C9A84C', fontSize: 28, fontWeight: '300' }}>{'\u2039'}</Text>
              </TouchableOpacity>
              <Text style={{ color: '#fff', fontSize: 17, fontWeight: '700', flex: 1 }}>Compare Dealer Prices</Text>
            </View>
            {(() => {
              const spotMap = { gold: goldSpot, silver: silverSpot, platinum: platinumSpot, palladium: palladiumSpot };

              const metalPills = [
                { key: 'silver', label: 'Silver' },
                { key: 'gold', label: 'Gold' },
              ];

              const currentSpot = spotMap[dealerMetal] || 0;

              return (
                <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 60 }}>
                  {/* Metal selector pills */}
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
                    {metalPills.map(m => (
                      <TouchableOpacity
                        key={m.key}
                        onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setDealerMetal(m.key); }}
                        style={{
                          paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, marginRight: 8,
                          backgroundColor: dealerMetal === m.key ? 'rgba(212,168,67,0.25)' : 'rgba(255,255,255,0.08)',
                          borderWidth: 1, borderColor: dealerMetal === m.key ? colors.gold : 'transparent',
                        }}
                      >
                        <Text style={{ color: dealerMetal === m.key ? colors.gold : colors.muted, fontSize: scaledFonts.small, fontWeight: dealerMetal === m.key ? '700' : '500' }}>
                          {m.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>

                  {/* Spot price reference */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16, paddingHorizontal: 4 }}>
                    <Text style={{ color: colors.muted, fontSize: scaledFonts.small }}>
                      Live Spot: <Text style={{ color: colors.gold, fontWeight: '700' }}>${currentSpot.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Text>/oz
                    </Text>
                  </View>

                  {/* Loading state */}
                  {dealerLoading && (
                    <View style={{ paddingTop: 40 }}>
                      {[1,2,3].map(i => (
                        <View key={i} style={{ backgroundColor: colors.cardBg, borderRadius: 14, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: colors.border }}>
                          <View style={{ height: 18, width: '60%', backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 6, marginBottom: 12 }} />
                          <View style={{ height: 14, width: '40%', backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 6, marginBottom: 16 }} />
                          {[1,2,3].map(j => (
                            <View key={j} style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 }}>
                              <View style={{ height: 14, width: '30%', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 6 }} />
                              <View style={{ height: 14, width: '20%', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 6 }} />
                            </View>
                          ))}
                        </View>
                      ))}
                    </View>
                  )}

                  {/* Error / coming soon state */}
                  {!dealerLoading && (dealerError || !dealerData?.products?.length) && (
                    <View style={{ paddingTop: 20, paddingHorizontal: 4 }}>
                      {/* APMEX Quick Links */}
                      <Text style={{ color: colors.text, fontSize: scaledFonts.large, fontWeight: '700', marginBottom: 4 }}>Shop APMEX</Text>
                      <Text style={{ color: colors.muted, fontSize: scaledFonts.small, marginBottom: 16, lineHeight: scaledFonts.small * 1.5 }}>
                        Browse products on one of the largest online bullion dealers.
                      </Text>
                      {[
                        { label: 'Best Sellers', sub: 'Most popular products', url: 'https://track.flexlinkspro.com/g.ashx?foid=156074.13444.1055574&trid=1546671.246173&foc=16&fot=9999&fos=6' },
                        { label: 'Silver Eagles', sub: 'American Silver Eagle coins', url: 'https://track.flexlinkspro.com/g.ashx?foid=156074.13444.1055589&trid=1546671.246173&foc=16&fot=9999&fos=6' },
                        { label: 'Gold Eagles', sub: 'American Gold Eagle coins', url: 'https://track.flexlinkspro.com/g.ashx?foid=156074.13444.1055590&trid=1546671.246173&foc=16&fot=9999&fos=6' },
                        { label: 'Browse All', sub: 'Full APMEX catalog', url: 'https://track.flexlinkspro.com/g.ashx?foid=156074.13444.1099573&trid=1546671.246173&foc=16&fot=9999&fos=6' },
                      ].map((link, i) => (
                        <TouchableOpacity
                          key={i}
                          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); Linking.openURL(link.url); }}
                          style={{
                            backgroundColor: colors.cardBg, borderRadius: 12, padding: 14, marginBottom: 10,
                            borderWidth: 1, borderColor: colors.border,
                            flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                          }}
                        >
                          <View>
                            <Text style={{ color: colors.text, fontSize: scaledFonts.normal, fontWeight: '600' }}>{link.label}</Text>
                            <Text style={{ color: colors.muted, fontSize: scaledFonts.small, marginTop: 2 }}>{link.sub}</Text>
                          </View>
                          <Text style={{ color: colors.gold, fontSize: 18 }}>→</Text>
                        </TouchableOpacity>
                      ))}

                      {/* SD Bullion Quick Links */}
                      <Text style={{ color: colors.text, fontSize: scaledFonts.large, fontWeight: '700', marginTop: 20, marginBottom: 4 }}>Shop SD Bullion</Text>
                      <Text style={{ color: colors.muted, fontSize: scaledFonts.small, marginBottom: 16, lineHeight: scaledFonts.small * 1.5 }}>
                        Competitive premiums and frequent deals.
                      </Text>
                      {[
                        { label: 'Deals', sub: 'Current sales and specials', url: 'https://www.awin1.com/cread.php?awinmid=78598&awinaffid=2844460&ued=https%3A%2F%2Fsdbullion.com%2Fdeals' },
                        { label: 'Silver Eagles', sub: 'American Silver Eagle coins', url: 'https://www.awin1.com/cread.php?awinmid=78598&awinaffid=2844460&ued=https%3A%2F%2Fsdbullion.com%2Fsilver%2Fus-mint-american-silver-eagle-coins%2Fsilver-american-eagles-1-ounce' },
                        { label: 'Gold Eagles', sub: 'American Gold Eagle coins', url: 'https://www.awin1.com/cread.php?awinmid=78598&awinaffid=2844460&ued=https%3A%2F%2Fsdbullion.com%2Fgold%2Famerican-gold-eagle-coins' },
                        { label: 'Browse All', sub: 'Full SD Bullion catalog', url: 'https://www.awin1.com/cread.php?awinmid=78598&awinaffid=2844460&ued=https%3A%2F%2Fsdbullion.com' },
                      ].map((link, i) => (
                        <TouchableOpacity
                          key={`sd-${i}`}
                          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); Linking.openURL(link.url); }}
                          style={{
                            backgroundColor: colors.cardBg, borderRadius: 12, padding: 14, marginBottom: 10,
                            borderWidth: 1, borderColor: colors.border,
                            flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                          }}
                        >
                          <View>
                            <Text style={{ color: colors.text, fontSize: scaledFonts.normal, fontWeight: '600' }}>{link.label}</Text>
                            <Text style={{ color: colors.muted, fontSize: scaledFonts.small, marginTop: 2 }}>{link.sub}</Text>
                          </View>
                          <Text style={{ color: colors.gold, fontSize: 18 }}>→</Text>
                        </TouchableOpacity>
                      ))}

                      {/* Coming soon notice */}
                      <View style={{ alignItems: 'center', paddingTop: 30, paddingHorizontal: 20 }}>
                        <Text style={{ color: colors.muted, fontSize: scaledFonts.small, textAlign: 'center', lineHeight: scaledFonts.small * 1.5 }}>
                          Live price comparison across multiple dealers coming soon.
                        </Text>
                      </View>
                    </View>
                  )}

                  {/* Product list */}
                  {!dealerLoading && dealerData?.products?.length > 0 && dealerData.products.map((product, idx) => {
                    const bestPrice = product.dealers?.[0]?.price;
                    const premiumAmt = bestPrice && currentSpot ? bestPrice - (currentSpot * (product.weight_oz || 1)) : null;
                    const premiumPct = premiumAmt && currentSpot ? (premiumAmt / (currentSpot * (product.weight_oz || 1))) * 100 : null;

                    return (
                      <View key={product.id || idx} style={{ backgroundColor: colors.cardBg, borderRadius: 14, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: colors.border }}>
                        {/* Product header */}
                        <Text style={{ color: colors.text, fontSize: scaledFonts.normal, fontWeight: '700', marginBottom: 4 }}>{product.name}</Text>
                        {product.weight_oz && (
                          <Text style={{ color: colors.muted, fontSize: scaledFonts.small, marginBottom: 12 }}>
                            {product.weight_oz} oz {dealerMetal.charAt(0).toUpperCase() + dealerMetal.slice(1)}
                            {premiumPct != null && ` · Best premium: ${premiumPct.toFixed(1)}%`}
                          </Text>
                        )}

                        {/* Dealer rows sorted by price */}
                        {(product.dealers || []).map((dealer, dIdx) => {
                          const dPremium = dealer.price && currentSpot ? ((dealer.price / (currentSpot * (product.weight_oz || 1))) - 1) * 100 : null;
                          const isBest = dIdx === 0;
                          return (
                            <View key={dealer.name || dIdx} style={{
                              flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                              paddingVertical: 10,
                              borderTopWidth: dIdx > 0 ? 1 : 0, borderTopColor: 'rgba(255,255,255,0.06)',
                            }}>
                              <View style={{ flex: 1 }}>
                                <Text style={{ color: isBest ? colors.gold : colors.text, fontSize: scaledFonts.normal, fontWeight: isBest ? '700' : '500' }}>
                                  {dealer.name}
                                  {isBest && ' ★'}
                                </Text>
                                {dealer.in_stock === false && (
                                  <Text style={{ color: '#ef4444', fontSize: scaledFonts.small, marginTop: 2 }}>Out of stock</Text>
                                )}
                              </View>
                              <View style={{ alignItems: 'flex-end' }}>
                                <Text style={{ color: isBest ? colors.gold : colors.text, fontSize: scaledFonts.normal, fontWeight: '700' }}>
                                  ${dealer.price?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </Text>
                                {dPremium != null && (
                                  <Text style={{ color: colors.muted, fontSize: scaledFonts.small, marginTop: 1 }}>
                                    +{dPremium.toFixed(1)}% over spot
                                  </Text>
                                )}
                              </View>
                            </View>
                          );
                        })}
                      </View>
                    );
                  })}

                  {/* Updated timestamp */}
                  {!dealerLoading && dealerData?.updated_at && (
                    <Text style={{ color: colors.muted, fontSize: scaledFonts.small, textAlign: 'center', marginTop: 8 }}>
                      Last updated: {new Date(dealerData.updated_at).toLocaleString()}
                    </Text>
                  )}
                </ScrollView>
              );
            })()}
          </SafeAreaView>
        </View>
      )}

      {/* Detail View Modal */}
      {showDetailView && (
        <View {...detailSwipe.panHandlers} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#000', zIndex: 9998 }}>
          <SafeAreaView style={{ flex: 1, backgroundColor: '#000' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#1a1a1a' }}>
              <TouchableOpacity onPress={() => { setShowDetailView(false); setDetailItem(null); setDetailMetal(null); }} style={{ marginRight: 12 }} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Text style={{ color: '#C9A84C', fontSize: 28, fontWeight: '300' }}>{'\u2039'}</Text>
              </TouchableOpacity>
              <Text style={{ color: '#fff', fontSize: 17, fontWeight: '700', flex: 1 }}>Holding Details</Text>
            </View>
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        {detailItem && (
          <>
            <View style={[styles.card, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
              <Text style={[styles.cardTitle, { fontSize: scaledFonts.xlarge, color: colors.text }]}>{detailItem.productName}</Text>
              {detailItem.datePurchased && (
                <View style={styles.statRow}>
                  <Text style={[styles.statRowLabel, { fontSize: scaledFonts.small }]}>Purchase Date</Text>
                  <Text style={[styles.statRowValue, { color: colors.text, fontSize: scaledFonts.normal }]}>
                    {formatDateDisplay(detailItem.datePurchased)}{detailItem.timePurchased ? ` at ${detailItem.timePurchased}` : ''}
                  </Text>
                </View>
              )}
              {detailItem.source && (
                <View style={styles.statRow}>
                  <Text style={[styles.statRowLabel, { fontSize: scaledFonts.small }]}>Dealer</Text>
                  <Text style={[styles.statRowValue, { color: colors.text, fontSize: scaledFonts.normal }]}>{detailItem.source}</Text>
                </View>
              )}
              <View style={[styles.divider, { backgroundColor: colors.border }]} />
              <View style={styles.statRow}>
                <Text style={[styles.statRowLabel, { fontSize: scaledFonts.small }]}>Quantity</Text>
                <Text style={[styles.statRowValue, { color: colors.text, fontSize: scaledFonts.normal }]}>{detailItem.quantity}</Text>
              </View>
              <View style={styles.statRow}>
                <Text style={[styles.statRowLabel, { fontSize: scaledFonts.small }]}>Unit Price</Text>
                <Text style={[styles.statRowValue, { color: colors.text, fontSize: scaledFonts.normal }]}>${formatCurrency(detailItem.unitPrice)}</Text>
              </View>
              <View style={styles.statRow}>
                <Text style={[styles.statRowLabel, { fontSize: scaledFonts.small }]}>Troy Ounces (each)</Text>
                <Text style={[styles.statRowValue, { color: colors.text, fontSize: scaledFonts.normal }]}>{detailItem.ozt} oz</Text>
              </View>
              <View style={styles.statRow}>
                <Text style={[styles.statRowLabel, { fontSize: scaledFonts.small }]}>Total Weight</Text>
                <Text style={[styles.statRowValue, { color: colors.text, fontSize: scaledFonts.normal }]}>{formatOunces(detailItem.ozt * detailItem.quantity)} oz</Text>
              </View>
              <View style={[styles.divider, { backgroundColor: colors.border }]} />
              {detailItem.taxes > 0 && (
                <View style={styles.statRow}>
                  <Text style={[styles.statRowLabel, { fontSize: scaledFonts.small }]}>Taxes</Text>
                  <Text style={[styles.statRowValue, { color: colors.text, fontSize: scaledFonts.normal }]}>${formatCurrency(detailItem.taxes)}</Text>
                </View>
              )}
              {detailItem.shipping > 0 && (
                <View style={styles.statRow}>
                  <Text style={[styles.statRowLabel, { fontSize: scaledFonts.small }]}>Shipping</Text>
                  <Text style={[styles.statRowValue, { color: colors.text, fontSize: scaledFonts.normal }]}>${formatCurrency(detailItem.shipping)}</Text>
                </View>
              )}
              <View style={[styles.divider, { backgroundColor: colors.border }]} />
              {(() => {
                const costBasis = getItemCostBasis(detailItem);
                const detailSpotMap = { silver: silverSpot, gold: goldSpot, platinum: platinumSpot, palladium: palladiumSpot };
                const meltValue = detailItem.ozt * detailItem.quantity * (detailSpotMap[detailMetal] || goldSpot);
                const gainLoss = meltValue - costBasis;
                const gainLossPct = costBasis > 0 ? (gainLoss / costBasis) * 100 : 0;
                const isGain = gainLoss >= 0;
                return (
                  <>
                    <View style={styles.statRow}>
                      <Text style={[styles.statRowLabel, { fontSize: scaledFonts.normal, fontWeight: '600' }]}>Total Cost Basis</Text>
                      <Text style={[styles.statRowValue, { fontSize: scaledFonts.medium, color: colors.text }]}>
                        ${formatCurrency(costBasis)}
                      </Text>
                    </View>
                    <View style={styles.statRow}>
                      <Text style={[styles.statRowLabel, { fontSize: scaledFonts.normal, fontWeight: '600' }]}>Current Value</Text>
                      <Text style={[styles.statRowValue, { fontSize: scaledFonts.medium, color: metalColorMap[detailMetal] || colors.gold }]}>
                        ${formatCurrency(meltValue)}
                      </Text>
                    </View>
                    <View style={[styles.divider, { backgroundColor: colors.border }]} />
                    <View style={styles.statRow}>
                      <Text style={[styles.statRowLabel, { fontSize: scaledFonts.normal, fontWeight: '600' }]}>Gain/Loss</Text>
                      <Text style={[styles.statRowValue, { fontSize: scaledFonts.medium, fontWeight: '700', color: isGain ? colors.success : colors.error }]}>
                        {isGain ? '+' : ''}{formatCurrency(gainLoss)} ({isGain ? '+' : ''}{gainLossPct.toFixed(1)}%)
                      </Text>
                    </View>
                  </>
                );
              })()}
            </View>

            <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
              <TouchableOpacity
                style={[styles.button, { flex: 1, backgroundColor: metalColorMap[detailMetal] || colors.gold }]}
                onPress={() => {
                  setShowDetailView(false);
                  editItem(detailItem, detailMetal);
                }}
              >
                <Text style={{ color: '#000', fontWeight: '600', fontSize: scaledFonts.normal }}>Edit</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.buttonOutline, { flex: 1, borderColor: colors.error }]}
                onPress={() => deleteItem(detailItem.id, detailMetal)}
              >
                <Text style={{ color: colors.error, fontWeight: '600', fontSize: scaledFonts.normal }}>Delete</Text>
              </TouchableOpacity>
            </View>
          </>
        )}
            </ScrollView>
          </SafeAreaView>
        </View>
      )}

      {/* Sort Menu Modal */}
      <ModalWrapper
        visible={showSortMenu}
        onClose={() => setShowSortMenu(false)}
        title="Sort Holdings"
        colors={colors}
        isDarkMode={isDarkMode}
      >
        <TouchableOpacity
          style={[styles.card, sortBy === 'date-newest' && { backgroundColor: 'rgba(251,191,36,0.15)', borderColor: colors.gold }]}
          onPress={() => {
            setSortBy('date-newest');
            setShowSortMenu(false);
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          }}
        >
          <Text style={[styles.cardTitle, { marginBottom: 0, color: colors.text }]}>Date (Newest First)</Text>
          <Text style={{ color: colors.muted, fontSize: 12, marginTop: 4 }}>Most recent purchases first</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.card, sortBy === 'date-oldest' && { backgroundColor: 'rgba(251,191,36,0.15)', borderColor: colors.gold }]}
          onPress={() => {
            setSortBy('date-oldest');
            setShowSortMenu(false);
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          }}
        >
          <Text style={[styles.cardTitle, { marginBottom: 0, color: colors.text }]}>Date (Oldest First)</Text>
          <Text style={{ color: colors.muted, fontSize: 12, marginTop: 4 }}>Earliest purchases first</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.card, sortBy === 'value-high' && { backgroundColor: 'rgba(251,191,36,0.15)', borderColor: colors.gold }]}
          onPress={() => {
            setSortBy('value-high');
            setShowSortMenu(false);
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          }}
        >
          <Text style={[styles.cardTitle, { marginBottom: 0, color: colors.text }]}>Value (High to Low)</Text>
          <Text style={{ color: colors.muted, fontSize: 12, marginTop: 4 }}>Highest value first</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.card, sortBy === 'value-low' && { backgroundColor: 'rgba(251,191,36,0.15)', borderColor: colors.gold }]}
          onPress={() => {
            setSortBy('value-low');
            setShowSortMenu(false);
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          }}
        >
          <Text style={[styles.cardTitle, { marginBottom: 0, color: colors.text }]}>Value (Low to High)</Text>
          <Text style={{ color: colors.muted, fontSize: 12, marginTop: 4 }}>Lowest value first</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.card, sortBy === 'name' && { backgroundColor: 'rgba(251,191,36,0.15)', borderColor: colors.gold }]}
          onPress={() => {
            setSortBy('name');
            setShowSortMenu(false);
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          }}
        >
          <Text style={[styles.cardTitle, { marginBottom: 0, color: colors.text }]}>Name (A-Z)</Text>
          <Text style={{ color: colors.muted, fontSize: 12, marginTop: 4 }}>Alphabetical by product name</Text>
        </TouchableOpacity>
      </ModalWrapper>


      {/* First Launch Tutorial */}
      <Tutorial
        visible={showTutorial}
        onComplete={handleTutorialComplete}
      />

      {/* Old custom drawer removed — replaced by React Navigation drawer */}

      {forceUpdate && (
        <Modal
          visible={true}
          transparent={true}
          animationType="fade"
          onRequestClose={() => {}}
        >
          <View style={{
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.95)',
            justifyContent: 'center',
            alignItems: 'center',
            padding: 32,
          }}>
            <View style={{
              backgroundColor: '#1a1a1a',
              borderRadius: 16,
              padding: 32,
              width: '100%',
              maxWidth: 340,
              alignItems: 'center',
            }}>
              <Text style={{
                color: '#C9A84C',
                fontSize: 22,
                fontWeight: '700',
                marginBottom: 16,
                textAlign: 'center',
              }}>
                Update Required
              </Text>
              <Text style={{
                color: '#ccc',
                fontSize: 15,
                lineHeight: 22,
                textAlign: 'center',
                marginBottom: 28,
              }}>
                {forceUpdate.message}
              </Text>
              <TouchableOpacity
                onPress={() => {
                  if (forceUpdate.storeUrl) {
                    Linking.openURL(forceUpdate.storeUrl);
                  }
                }}
                style={{
                  backgroundColor: '#C9A84C',
                  borderRadius: 8,
                  paddingVertical: 14,
                  paddingHorizontal: 40,
                  width: '100%',
                  alignItems: 'center',
                }}
              >
                <Text style={{
                  color: '#000',
                  fontSize: 16,
                  fontWeight: '700',
                }}>
                  Update Now
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      )}
    </SafeAreaView>
        )}
      </Drawer.Screen>
    </Drawer.Navigator>
  );
}

// Export App wrapped with SafeAreaProvider, ErrorBoundary, AuthProvider, and NavigationContainer
export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ErrorBoundary>
          <AuthProvider>
            <PreviewProvider>
              <NavigationContainer>
                <AppContent />
                <PreviewBottomSheet />
              </NavigationContainer>
            </PreviewProvider>
          </AuthProvider>
        </ErrorBoundary>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

// ============================================
// STYLES
// ============================================

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f0f0f' },
  header: { backgroundColor: 'rgba(0,0,0,0.4)', borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.1)', paddingHorizontal: 20, paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0 },
  headerContent: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 16 },
  logo: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  logoIcon: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  logoTitle: { color: '#fff', fontWeight: '700', fontSize: 18 },
  logoSubtitle: { color: '#71717a', fontSize: 11 },
  privacyBadge: { paddingHorizontal: 12, paddingVertical: 6, backgroundColor: 'rgba(34,197,94,0.15)', borderRadius: 20, borderWidth: 1, borderColor: 'rgba(34,197,94,0.3)' },
  content: { flex: 1, padding: 20 },
  upgradeBanner: {
    flexDirection: 'row',
    backgroundColor: '#fbbf24',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: 'rgba(251, 191, 36, 0.3)',
    shadowColor: '#fbbf24',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 8,
  },
  bottomTabs: { flexDirection: 'row', backgroundColor: 'rgba(0,0,0,0.8)', borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.1)', paddingTop: 10 },
  bottomTab: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  metalTabs: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  metalTab: { flex: 1, padding: 12, borderRadius: 12, borderWidth: 2, borderColor: 'rgba(255,255,255,0.1)', alignItems: 'center' },
  card: { backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 16, padding: 20, marginBottom: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  cardTitle: { fontSize: 16, fontWeight: '600', color: '#fff', marginBottom: 12 },
  statRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8 },
  statRowLabel: { color: '#71717a', fontSize: 13 },
  statRowValue: { color: '#fff', fontWeight: '600' },
  divider: { height: 1, backgroundColor: 'rgba(255,255,255,0.1)', marginVertical: 12 },
  button: { paddingVertical: 14, paddingHorizontal: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  buttonOutline: { paddingVertical: 14, paddingHorizontal: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' },
  itemCard: { backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: 12, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)', flexDirection: 'row', alignItems: 'center' },
  itemTitle: { color: '#fff', fontWeight: '600', marginBottom: 4 },
  itemSubtitle: { color: '#71717a', fontSize: 12 },
  itemValue: { fontWeight: '600', fontSize: 16 },
  emptyState: { alignItems: 'center', padding: 40 },
  // Modal styles - improved
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.95)', justifyContent: 'flex-start', paddingTop: Platform.OS === 'ios' ? 60 : 40 },
  modalKeyboardView: { flex: 1, backgroundColor: '#1a1a2e' },
  modalContent: {
    backgroundColor: '#1a1a2e',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    flex: 1,
    height: '100%'
  },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.1)' },
  modalTitle: { color: '#fff', fontSize: 20, fontWeight: '700' },
  closeButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 22 },
  closeButtonText: { color: '#fff', fontSize: 18, fontWeight: '600' },

  scanStatus: { padding: 12, borderRadius: 10, marginBottom: 16 },
  privacyItem: { color: '#a1a1aa', fontSize: 13, lineHeight: 24 },

  // Sticky button container for Add/Edit modal
  stickyButtonContainer: {
    paddingTop: 12,
    paddingBottom: Platform.OS === 'ios' ? 20 : 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
    backgroundColor: '#1a1a2e',
  },
});
