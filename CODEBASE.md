# TroyStack Codebase Reference

> Auto-generated codebase map for Claude project knowledge. Updated 2026-04-11.
> **Standing instruction:** If any task creates, deletes, or moves files, routes, or database columns, update this file before committing.

---

## 1. App Structure

### mobile-app/App.js
- **Purpose:** Monolithic React Native app (~14,200 lines) — all screens, state, navigation, UI
- **Exports:** `App` (default), wrapped in `SafeAreaProvider`, `ErrorBoundary`, `PreviewProvider`, `NavigationContainer`, `GestureHandlerRootView`
- **Dependencies:** React Native, Expo SDK 52, react-native-reanimated, react-navigation (drawer), RevenueCat, Supabase, expo-av, react-native-track-player
- **Last modified:** 2026-04-08
- **Key sections (by line):**
  - Lines 49-85: PreviewContext + PreviewProvider (bottom sheet state management)
  - Lines 90-350: Preview components (PreviewChart, PreviewPortfolio, PreviewArticle, etc.)
  - Lines 353-560: Inline card components + renderInlineCard + shouldShowPreviewButton + getPreviewLabel
  - Lines 600-710: PreviewBottomSheet (full-screen swipeable sheet)
  - Lines 750-810: Utility functions (generateUUID, useSwipeBack, isVersionBelow, getUserTier)
  - Lines 814-950: Dealer CSV templates + metal/weight detection helpers
  - Lines 1123-1520: Reusable UI components (FloatingInput, PieChart, ProgressBar, WheelPicker, DatePicker, TimePicker, ModalWrapper, SwipeableAlertRow)
  - Lines 1630-1870: Chart components (ScrubSparkline, ScrubChart with monotone cubic interpolation)
  - Lines 2170+: AppContent() — main component with 160 useState, 48 useEffect
  - Lines 3728-3770: TrackPlayer initialization + remote event handlers
  - Lines 4330-4360: troyAPI object (createConversation, listConversations, getConversation, deleteConversation, sendMessage)
  - Lines 4570-4810: Voice pipeline (startVoiceRecording, stopVoiceRecording, playTroyVoice, stopTroyAudio)
  - Lines 4850-4950: sendTroyMessage with AbortController
  - Lines 5250-5350: Widget sync (syncWidget)
  - Lines 5730-5760: Sparkline data fetch
  - Lines 6540-6660: Receipt scanning (performScan)
  - Lines 7000-7200: Spreadsheet import (importSpreadsheet)
  - Lines 8060-8240: Custom sidebar (renderCustomSidebar) with conversation history
  - Lines 8250-8300: Loading/auth/biometric early returns
  - Lines 8350+: Main UI render (header, content screens, modals, overlays)
- **Screens rendered via `currentScreen` state:**
  - TroyChat, Dashboard, MyStack, Analytics, StackSignal, CompareDealers, Settings

### mobile-app/ErrorBoundary.js
- **Purpose:** React error boundary — catches crashes, shows fallback UI
- **Exports:** `ErrorBoundary` (default)
- **Dependencies:** React, expo-updates
- **Last modified:** 2026-02-03

### mobile-app/babel.config.js
- **Purpose:** Babel config with react-native-reanimated/plugin
- **Last modified:** 2026-04-07

---

## 2. Components

### mobile-app/src/components/GoldPaywall.js
- **Purpose:** RevenueCat subscription paywall modal (Gold monthly/yearly/lifetime). Loads the offering and trial eligibility through `loadGoldOffering` and shows a free trial only when this Apple ID can still get it
- **Exports:** `GoldPaywall` (default)
- **Props:** `visible`, `onClose`, `onPurchaseSuccess`, `userTier`, `initialCycle` ('yearly' or 'monthly', the plan a prompt's promised trial is on, so the screen opens on it)
- **Merging with PR #42 (fix/keep-web-gold):** the merge conflicts in four places, and each must keep both sides, or the app throws at runtime on a name only one side declared. GoldPaywall's props line becomes `({ visible, onClose, onPurchaseSuccess, onRestored, userTier = 'free', initialCycle = null })`. App.js's imports keep one entitlements import with `loadGoldOffering` and every other import from both sides. App.js's plan refs and state after `revenueCatUserId` keep #42's refs and this branch's `goldTrial` and `paywallCycle`. This entry keeps both props. The `<GoldPaywall>` element merges by itself, with both `onRestored` and `initialCycle`
- **Last modified:** 2026-10-09

### mobile-app/src/components/TroyCoinIcon.js
- **Purpose:** Custom Troy Aureus coin SVG icon
- **Last modified:** 2026-02-20

### mobile-app/src/components/GlobeIcon.js
- **Purpose:** Globe SVG icon for internationalization
- **Last modified:** 2026-01-27

### mobile-app/src/components/Tutorial.js
- **Purpose:** Onboarding tutorial component
- **Last modified:** 2026-02-03

### mobile-app/src/components/StackSignalIcon.js
- **Purpose:** Stack Signal feature icon
- **Last modified:** 2026-02-10

### Icon Library (mobile-app/src/components/icons/)
All TSX, export SVG icon components with `size` and `color` props:
- `AnalyticsIcon.tsx`, `AppleLogo.tsx`, `BellIcon.tsx`, `CalculatorIcon.tsx`
- `DashboardIcon.tsx`, `GoogleLogo.tsx`, `HoldingsIcon.tsx`, `ProfileIcon.tsx`
- `SettingsIcon.tsx`, `SortIcon.tsx`, `TodayIcon.tsx`, `ToolsIcon.tsx`
- `TrendingUpIcon.tsx`, `TrophyIcon.tsx`
- `index.ts` — barrel export

### Inline Card Components (in App.js, lines 353-520)
| Component | Preview Type | Data Shape |
|-----------|-------------|------------|
| `InlinePortfolioCard` | `portfolio` | `{ totalValue, totalGain, totalGainPercent, metalTotals, goldPrice, silverPrice }` |
| `InlinePriceCard` | `chart` (spot_price) | `{ goldPrice, silverPrice, change: { gold: {percent}, silver: {percent} } }` |
| `InlineRatioCard` | `chart` (ratio) | `{ ratio, interpretation }` |
| `InlineCostBasisCard` | `cost_basis` | `{ holdings[], totalCost, totalValue }` |
| `InlinePurchasingPowerCard` | `purchasing_power` | `{ stackBarrelsOfOil, stackMonthsOfRent, stackHoursOfLabor, goldOilRatio1971, goldPerBarrelOfOil }` |
| `InlineDealerCard` | `dealer_link` | `{ dealer, product, url }` |

### Preview Components (in App.js, lines 90-350)
Bottom sheet content for each preview type:
- `PreviewChart` — spot prices or ratio display
- `PreviewPortfolio` — full portfolio breakdown with metal cards
- `PreviewArticle` — Stack Signal article view
- `PreviewDailyBrief` — Troy's daily brief
- `PreviewDealerComparison` — dealer comparison table
- `PreviewCostBasis` — cost basis by metal with avg/spot comparison
- `PreviewSpeculation` — "what if" scenario calculator
- `PreviewPurchasingPower` — purchasing power with 1971 comparison

---

## 3. Lib / Utils

### mobile-app/src/contexts/AuthContext.tsx
- **Purpose:** Supabase auth context with Google/Apple OAuth, session management
- **Exports:** `AuthProvider`, `useAuth()` hook
- **Key methods:** `signUp`, `signIn`, `signInWithGoogle`, `signInWithApple`, `linkWithGoogle`, `linkWithApple`, `signOut`, `resetPassword`
- **Last modified:** 2026-02-20

### mobile-app/src/lib/supabase.ts
- **Purpose:** Supabase client initialization (URL: sixwgsqfutnvdxhrvkzd.supabase.co)
- **Exports:** `supabase` client instance
- **Dependencies:** @supabase/supabase-js, AsyncStorage
- **Last modified:** 2026-01-27

### mobile-app/src/services/supabaseHoldings.ts
- **Purpose:** Holdings CRUD — sync between local AsyncStorage and Supabase
- **Exports:** `localToSupabase`, `supabaseToLocal`, `fetchHoldings`, `addHolding`, `updateHolding`, `deleteHolding`, `findHoldingByLocalId`, `syncLocalToSupabase`, `fullSync`
- **Last modified:** 2026-02-10

### mobile-app/src/utils/entitlements.js
- **Purpose:** RevenueCat subscription status checks
- **Exports:** `initializePurchases`, `hasGoldEntitlement`, `hasSilverEntitlement`, `getUserEntitlements`, `loginRevenueCat`, `logoutRevenueCat`, `restorePurchases`, `loadGoldOffering` (current offering, trial eligibility for its yearly and monthly plans, and the trial a prompt may promise), `INTRO_ELIGIBLE_STATUS`
- **Last modified:** 2026-10-09

### mobile-app/src/utils/goldOffer.js
- **Purpose:** What Gold prompts may say. A free trial only when RevenueCat says this Apple ID is eligible, carrying the plan it's on so the Gold screen opens there, and Troy's limits as the API enforces them (30 questions a day, and 20 voice uses a day that spoken questions and answers share, reset at midnight Eastern time). Also the prompt a free account sees under Historical Spot Prices on Analytics, where Gold's charts go (history only loads with Gold); a Gold account whose history is empty still sees "No data available". And who already pays: `alreadyPaid` reads RevenueCat Gold or Lifetime, `userTier`, and the account's profile row (a gold or lifetime `subscription_tier`, or a `stripe_customer_id`, since the app's own launch sync can write free over a web member's tier), which App.js reads at sign-in in its ALREADY PAYING block and again each time the app comes to the front, at most once a minute, so a web plan bought while the app sat in the background counts. `upsellPlan` turns that into 'paid', 'unknown' or 'free', and every upgrade prompt (the Listen 403 prompt, the dashboard and Analytics banners, the price history card and the free week sheet) promises the free trial only to 'free' (`upsellTrial`); a refused Listen shows Voice Unavailable to 'paid' or 'unknown' (`listenRefusedPrompt`), saying voice comes with Gold and can take a few minutes to show up, which holds for a lapsed web customer whose `stripe_customer_id` stays on the profile, so an App Store trial isn't pitched to someone Stripe already bills
- **Exports:** `freeTrialPeriod`, `trialLabel`, `offeringFreeTrial`, `unlockLine`, `priceHistoryPrompt`, `alreadyPaid`, `upsellPlan`, `upsellTrial`, `listenRefusedPrompt`, `TROY_GOLD_LINE`, `TROY_GOLD_DAILY_QUESTIONS`, `TROY_GOLD_DAILY_VOICE`, `speakFailure`, `listenGoldPrompt`, `listenLimitPrompt`, `INTRO_ELIGIBLE`
- **Tests:** `node --test mobile-app/src/utils/goldOffer.test.mjs`
- **Last modified:** 2026-10-10

### mobile-app/src/utils/freeWeekOffer.js
- **Purpose:** The one-time free week offer. Right after someone adds their first holding (by hand, receipt scan or import), once they're back on the dashboard with the stack's live value showing, App.js shows a short sheet offering Gold's free trial. Only to a signed-in account (a guest's Lifetime from an earlier install is invisible to RevenueCat until Restore, while the Apple ID still reads trial eligible), only when `loadGoldOffering` found a trial this Apple ID can get and `upsellPlan` (goldOffer.js) says the account is 'free'; not after the Gold screen has opened this session; at most once per device (AsyncStorage `stack_free_week_offer_shown`, written as it opens, whatever's tapped); never over another sheet, the Gold screen, the tutorial, the drawer, an alert or a system prompt; never for holdings that arrived by sync, restore or launch. Its start button opens the Gold screen on the plan the trial is on. A sheet that's up closes for good when the account changes or the main screen goes (a session that ends, a reset password link), so it never comes back on the next account
- **Exports:** `isFirstHolding`, `freeWeekOfferBlocker` (why it can't show yet, or null), `freeWeekOfferCopy`, `watchAlerts`, `FREE_WEEK_OFFER_KEY`, `FREE_WEEK_OFFER_DELAY_MS`
- **In App.js:** the FREE WEEK OFFER block after `openGoldScreen`; `noteHoldingsAdded` in `savePurchase`, `confirmScannedItems`, `addScannedItemIndividually` and `confirmImport`; the sheet after `<Tutorial>`; `DrawerStatusCapture` in the main screen. `watchAlerts(Alert)` runs once at load and wraps `Alert.alert` for the whole app to count open alerts, since React Native can't say whether one is showing and AppState stays active under one. Callers' buttons, options and `onDismiss` pass through unchanged, an alert with no buttons gets the same single OK, and a `Symbol.for` mark on the Alert module keeps Fast Refresh from wrapping it twice
- **Tests:** `node --test mobile-app/src/utils/freeWeekOffer.test.mjs`
- **Last modified:** 2026-10-10

### mobile-app/src/utils/troyReport.js
- **Purpose:** Reporting one of Troy's replies, which Google Play's AI-generated content policy asks for. Each assistant message in Troy's chat has a Report button beside Listen. `reportTroyReply` in App.js asks for a reason and sends the reply to `POST /v1/troy/report` with the Supabase session token when there is one. When the route can't take it (404 before it's live, any other non-2xx, a timeout or no connection) the app offers a support email with the reply in it
- **Exports:** `sendTroyReport({ apiBase, token, userId, conversationId, message, reason })` answers `'sent'` or `'unavailable'`. `reportEmailUrl` builds the mailto. `REPORT_REASONS` ('offensive', 'wrong'), `SUPPORT_EMAIL`, `REPORT_CONTENT_MAX` (4000 characters of the reply), `REPORT_TIMEOUT_MS`
- **Tests:** `node --test mobile-app/src/utils/troyReport.test.mjs`
- **Last modified:** 2026-10-14

### mobile-app/src/utils/widgetKit.js
- **Purpose:** iOS WidgetKit data bridge — sends portfolio data to native widget
- **Exports:** `isWidgetKitAvailable`, `updateWidgetData`, `refreshWidgets`, `syncWidgetData`, `getWidgetConfigurations`
- **Last modified:** 2026-02-21

### mobile-app/src/utils/backgroundTasks.js
- **Purpose:** Background price fetching for widget updates when app is closed
- **Exports:** `registerBackgroundFetch`, `getBackgroundFetchStatus`
- **Task ID:** `background-fetch-prices`
- **Last modified:** 2026-02-19

---

## 4. Voice Pipeline

### Flow: User Speech -> Text -> Troy -> Audio -> Playback

```
1. User taps mic button (App.js)
   └─ startVoiceRecording()
      ├─ Stop any TTS playback (stopTroyAudio)
      ├─ Audio.setAudioModeAsync({ allowsRecordingIOS: true })
      ├─ new Audio.Recording() with isMeteringEnabled: true
      ├─ Silence detection: 300ms interval, -40dBFS threshold, 2s duration
      └─ 15s max timeout

2. User releases / silence detected / 15s max
   └─ stopVoiceRecording()
      ├─ recording.stopAndUnloadAsync()
      ├─ resetAudioMode() + 300ms settle delay
      ├─ POST /v1/troy/transcribe (FormData: audio file + userId)
      │   └─ Backend: multer -> OpenAI Whisper API (whisper-1 model)
      │      └─ Returns: { text: "transcribed speech" }
      ├─ Show transcribed text in input bar (300ms)
      ├─ autoPlayNextResponseRef.current = true
      └─ sendTroyMessage(text)

3. Troy responds
   └─ sendTroyMessage() -> troyAPI.sendMessage()
      ├─ POST /v1/troy/conversations/:id/messages
      ├─ Backend: Anthropic Claude API generates response
      ├─ detectPreviewContent() checks for inline card data
      └─ If autoPlayNextResponseRef.current:
         └─ playTroyVoice(assistantMsg.content, assistantMsg.id)

4. TTS Playback
   └─ playTroyVoice()
      ├─ POST /v1/troy/speak { text, userId }
      │   └─ Backend: ElevenLabs TTS API (eleven_turbo_v2_5)
      │      ├─ Voice: ELEVENLABS_VOICE_ID env var
      │      ├─ API key: ELEVENLABS_API_KEY env var
      │      └─ Returns: audio/mpeg stream
      ├─ 403 (not Gold): Listen tap opens the Gold prompt, free trial named only when eligible and the Gold screen opened on that trial's plan; auto-play stays quiet
      ├─ 429 Voice limit reached: "Voice limit reached" alert, the day's voice uses (spoken questions and answers together, the 429's own limit) and the midnight Eastern reset
      ├─ arrayBuffer -> base64 -> FileSystem cache (.mp3)
      └─ TrackPlayer.add({ url, title: 'Troy', artist: 'TroyStack', artwork }) -> TrackPlayer.play()
```

### Configuration
- **react-native-track-player** setup in useEffect on app init:
  - `iosCategory: 'playback'`, `iosCategoryMode: 'spokenAudio'`
  - Capabilities: Play, Pause, Stop
  - Remote event handlers: RemotePause, RemotePlay, RemoteStop, PlaybackQueueEnded
  - Volume set to 1.0 globally
- **expo-av** used only for Audio.Recording (mic input)
- **Voice usage caps** (server-enforced): Free 1/day, Gold 20/day
- **Env vars needed:** `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID`, `OPENAI_API_KEY`

---

## 5. Inline Cards

See Section 2 "Inline Card Components" table above. Rendering logic:

```javascript
// In App.js renderInlineCard():
switch (preview.type) {
  case 'portfolio':        -> InlinePortfolioCard
  case 'purchasing_power': -> InlinePurchasingPowerCard (with "See full breakdown" expand)
  case 'cost_basis':       -> InlineCostBasisCard
  case 'dealer_link':      -> InlineDealerCard (tappable, opens APMEX affiliate URL)
  case 'chart':
    chartType 'spot_price' -> InlinePriceCard
    chartType 'ratio'      -> InlineRatioCard
}

// shouldShowPreviewButton() — these types get a bottom sheet button:
// signal_article, daily_brief, dealer_comparison, speculation, chart (with chartData)
// All others are inline-only.
```

---

## 6. Navigation

### Drawer Structure (sidebar)
```
sidebarNavItems = [
  { key: 'TroyChat',       label: 'Troy',            iconType: 'troy' },
  { key: 'Dashboard',      label: 'Dashboard',       iconType: 'today' },
  { key: 'MyStack',        label: 'My Stack',        iconType: 'holdings' },
  { key: 'Analytics',      label: 'Analytics',       iconType: 'analytics' },
  { key: 'StackSignal',    label: 'Stack Signal',    iconType: 'signal' },
  { key: 'VaultWatch',     label: 'Vault Watch',     iconType: 'trending' },  // scrolls within Dashboard
  { key: 'CompareDealers', label: 'Compare Dealers', iconType: 'calculator' },
]
```

### Deep Links
| URL | Screen | Handler |
|-----|--------|---------|
| `troystack://chat` | TroyChat | `setCurrentScreen('TroyChat')` |
| `troystack://voice` | TroyChat | `setCurrentScreen('TroyChat')` (voice input is future) |
| `troystack://scan` | MyStack + scanner | `setCurrentScreen('MyStack')` + `setTimeout(performScan, 500)` |
| `stacktrackergold://auth/reset-password#...` | Reset password | Supabase session + `setShowResetPasswordScreen(true)` |

### URL Schemes (app.json)
```json
"scheme": ["stacktrackergold", "troystack"]
```

---

## 7. Widgets

### WidgetKit Extension Files

#### mobile-app/targets/widget/StackTrackerWidget.swift
- **Purpose:** Main widget bundle + timeline provider + network fetching
- **Widgets:** `StackTrackerWidget` (portfolio), `TroyActionWidget` (quick actions)
- **Provider:** Fetches from `https://api.stacktrackergold.com/v1/widget-data`
- **Timeline:** 24 entries over 6 hours (15-min intervals)
- **App Group:** `group.com.stacktrackerpro.shared`
- **Last modified:** 2026-04-08

#### mobile-app/targets/widget/WidgetViews.swift
- **Purpose:** All SwiftUI widget views (small/medium/large + Troy action)
- **Views:** `SmallWidgetView`, `MediumWidgetView`, `LargeWidgetView`, `TroyActionWidgetView`
- **Features:** Catmull-Rom smooth sparklines, dotted reference line, compressed Y-axis, date label
- **Layout:** Stocks-style metal rows (dot + "Gold (Au)" + sparkline + price + change)
- **Troy Action Widget:** 3 tap targets — Ask Troy (chat), Scan (camera), Voice (mic)
- **Last modified:** 2026-04-08

#### mobile-app/targets/widget/WidgetData.swift
- **Purpose:** Codable data model matching JSON from React Native
- **Fields:** portfolioValue, dailyChange, spot prices (4 metals), sparklines (4 arrays), holdings, subscription status
- **Methods:** `recalculatePortfolio()`, `validateConsistency()`, `portfolioSparkline()`
- **Last modified:** 2026-02-21

#### mobile-app/targets/widget/expo-target.config.js
- **Purpose:** @bacons/apple-targets config — widget type, name, colors, frameworks
- **Background:** `#0A0A0E`
- **Last modified:** 2026-04-07

#### mobile-app/targets/widget/Assets.xcassets/
- `AppIcon.imageset/` — App icon at 1x/2x/3x
- `TroyIcon.imageset/` — Troy Aureus icon for action widget

### Build Plugins

#### mobile-app/plugins/ios-widget/withWidget.js
- **Purpose:** Expo config plugin — creates widget extension directory, copies Swift files, sets up Xcode project
- **Creates:** Widget entitlements, Assets.xcassets (AccentColor, WidgetBackground, AppIcon, TroyIcon)
- **Last modified:** 2026-04-07

#### mobile-app/plugins/withWidgetNativeModule.js
- **Purpose:** Copies WidgetKitModule.swift/.m to iOS project for RN-to-WidgetKit bridge
- **Last modified:** 2026-01-19

### Plugin Widget Files (synced copies)
- `plugins/ios-widget/widget-files/StackTrackerWidget.swift`
- `plugins/ios-widget/widget-files/WidgetViews.swift`
- `plugins/ios-widget/widget-files/WidgetData.swift`
- `plugins/ios-widget/widget-files/WidgetKitModule.swift`
- `plugins/ios-widget/widget-files/WidgetKitModule.m`

> **Important:** `targets/widget/` and `plugins/ios-widget/widget-files/` must stay in sync. Always copy after editing.

---

## 8. Auth Configuration

### Supabase Auth
- **Project URL:** `https://sixwgsqfutnvdxhrvkzd.supabase.co`
- **Client:** `mobile-app/src/lib/supabase.ts`
- **Context:** `mobile-app/src/contexts/AuthContext.tsx`
- **Providers:** Email/password, Google OAuth, Apple Sign In
- **Session:** AsyncStorage persistence, auto-refresh
- **User ID format:** UUID (e.g., `704f226d-xxxx-xxxx-xxxx-xxxxxxxxxxxx`)

### RevenueCat
- **Apple API Key:** `appl_WDKPrWsOHfWzfJhxOGluQYsniLW` (public, in App.js)
- **Google Play API Key:** `REVENUECAT_GOOGLE_KEY` near the top of App.js, empty until the Play app is added to the RevenueCat project. Android uses it and iOS the Apple key. With it empty, setup stops on Android and the app shows free. `checkTrialOrIntroductoryPriceEligibility` is iOS only, so Android shows no trial wording until the app reads Play's offers
- **Products:** `stacktracker_gold_monthly` ($4.99), `stacktracker_gold_yearly` ($39.99), `stacktracker_lifetime` ($149.99)
- **Entitlement:** `Gold` — any active subscription or lifetime
- **User ID:** Tied to Supabase user ID via `loginRevenueCat(supabaseUser.id)`
- **Config:** `mobile-app/src/utils/entitlements.js`

### Session Flow
```
App Launch → Supabase session check → Biometric auth (optional)
  → RevenueCat login → Load holdings → Sync widget → Fetch conversations
```

---

## 9. External Services

| Service | Purpose | Auth | Endpoint/SDK |
|---------|---------|------|-------------|
| **Supabase** | Database + Auth | Service role key (backend), anon key (mobile) | `sixwgsqfutnvdxhrvkzd.supabase.co` |
| **Anthropic Claude** | Receipt OCR + Troy AI | `ANTHROPIC_API_KEY` env var | `@anthropic-ai/sdk` |
| **ElevenLabs** | Troy TTS voice | `ELEVENLABS_API_KEY` + `ELEVENLABS_VOICE_ID` env vars | `api.elevenlabs.io/v1/text-to-speech/{voice_id}` |
| **OpenAI Whisper** | Voice transcription (STT) | `OPENAI_API_KEY` env var | `api.openai.com/v1/audio/transcriptions` |
| **RevenueCat** | Subscriptions | `REVENUECAT_API_KEY` env var (backend) | `api.revenuecat.com/v1/subscribers` |
| **Stripe** | Payment processing | `STRIPE_SECRET_KEY` env var | Stripe SDK |
| **APMEX/FlexOffers** | Affiliate product links | Tracking IDs in URLs | `track.flexlinkspro.com` |
| **Yahoo Finance** | Historical ETF prices (GLD/SLV/PPLT/PALL) | None (public) | `backend/services/etfPrices.js` |
| **Expo Push** | Push notifications | Expo project ID | `expo-server-sdk` |

### APMEX Affiliate URLs (FlexOffers)
- Homepage: `https://track.flexlinkspro.com/g.ashx?foid=156074.13444.1099573&trid=1546671.246173&foc=16&fot=9999&fos=6`
- Silver Eagles: `https://track.flexlinkspro.com/g.ashx?foid=156074.13444.1055589&trid=1546671.246173&foc=16&fot=9999&fos=6`
- Gold Eagles: `https://track.flexlinkspro.com/g.ashx?foid=156074.13444.1055590&trid=1546671.246173&foc=16&fot=9999&fos=6`
- Best Sellers: `https://track.flexlinkspro.com/g.ashx?foid=156074.13444.1055574&trid=1546671.246173&foc=16&fot=9999&fos=6`

### SD Bullion Affiliate URLs (Awin — awinmid 78598, awinaffid 2844460)
- Homepage: `https://www.awin1.com/cread.php?awinmid=78598&awinaffid=2844460&ued=https%3A%2F%2Fsdbullion.com`
- Silver Eagles: `https://www.awin1.com/cread.php?awinmid=78598&awinaffid=2844460&ued=https%3A%2F%2Fsdbullion.com%2Fsilver%2Fus-mint-american-silver-eagle-coins%2Fsilver-american-eagles-1-ounce`
- Gold Eagles: `https://www.awin1.com/cread.php?awinmid=78598&awinaffid=2844460&ued=https%3A%2F%2Fsdbullion.com%2Fgold%2Famerican-gold-eagle-coins`
- Gold Coins: `https://www.awin1.com/cread.php?awinmid=78598&awinaffid=2844460&ued=https%3A%2F%2Fsdbullion.com%2Fgold%2Fgold-coins`
- Deals: `https://www.awin1.com/cread.php?awinmid=78598&awinaffid=2844460&ued=https%3A%2F%2Fsdbullion.com%2Fdeals`

### Support Email
- **All user-facing support contact:** `support@troystack.com`
- Used in: AccountScreen delete flow, backend privacy/terms pages, contact links

### Free Tier Limits
| Feature | Free | Gold/Lifetime |
|---------|------|---------------|
| Holdings (items) | 25 max | Unlimited |
| Troy questions | 3/day | 30/day (the server's GOLD_DAILY_LIMIT) |
| Voice exchanges (TTS+STT combined) | 1/day | 20/day |
| Receipt scans | Limited | Unlimited |
| Encrypted PDF Ledger Export | — | ✓ Gold-only |
| Enforcement: `handleAddPurchase()` checks `!hasGoldAccess && totalItems >= 25` |

### Encrypted Ledger Export (Gold/Lifetime)
- **Trigger:** Settings → "Export Encrypted Ledger" row (with lock icon + GOLD badge)
- **Function:** `requestLedgerExport()` → `generateEncryptedLedger(pin)` in App.js
- **Library:** `pdf-lib` (pure JS, lazy-loaded via `require()` only when used)
- **Flow:**
  1. Gold check → if free, show paywall
  2. PIN modal with 4 auto-advancing input boxes
  3. Generate PDF with header, summary box (total value/cost/P&L), holdings table
  4. Save to `FileSystem.documentDirectory/TroyStack_Ledger_YYYY-MM-DD.pdf`
  5. Open share sheet via `Sharing.shareAsync`
- **PIN handling:** PIN is written to PDF metadata (Subject + Keywords) as a tag.
  Note: `pdf-lib` does NOT support true PDF encryption on save. The PDF is
  PIN-tagged but not password-locked. For real encryption, requires native
  module or future server-side flow.
- **State:** `showLedgerPinModal`, `ledgerPinDigits`, `ledgerPinRefs`, `ledgerGenerating`

---

## 10. Push Notifications

### Registration
- `registerForPushNotifications()` in App.js
- Sends `POST /v1/push/register` with `{ expo_push_token, platform, app_version, user_id, device_id }`
- Triggered on auth + periodically on app foreground
- Android creates the `default` channel before asking permission, since Android 13 and later shows the prompt only once a channel exists. Android push needs FCM: a `google-services.json` from the Firebase project, `android.googleServicesFile` in app.json and the FCM key in EAS. Until then `getExpoPushTokenAsync` throws on Android and registration stops quietly

### Notification Types
| Type | Source | Trigger |
|------|--------|---------|
| Price Alert | Backend cron | Metal price crosses user's target |
| Daily Brief | Backend cron | Morning market summary |
| COMEX Alert | Backend cron | Significant vault changes |

### Backend Services
- `backend/services/expoPushNotifications.js` — send via Expo push API
- `backend/services/priceAlertChecker.js` — periodic alert checking cron
- `backend/services/priceAlerts.js` — CRUD for alert records

### App Handling
- Notification tap → deep link or screen navigation
- Permission request on first authenticated launch
- Token stored in Supabase `push_tokens` table

---

## 11. Build Configuration

### mobile-app/app.json
- **Name:** TroyStack
- **Bundle ID:** `com.stacktrackerpro.app`
- **Version:** 3.0.1
- **Scheme:** `["stacktrackergold", "troystack"]`
- **iOS deployment target:** 17.0 (widget)
- **Apple Team ID:** `3BKELS5FG9`
- **Background modes:** audio, fetch, processing, remote-notification
- **Entitlements:** App Groups (`group.com.stacktrackerpro.shared`), In-App Purchase, iCloud
- **Splash:** Solid `#0A0A0E` background (no logo)
- **Plugins:** `withWidgetNativeModule`, `@bacons/apple-targets`
- **Android:** package `com.stacktrackerpro.app`. `RECORD_AUDIO` is requested for Troy's voice and isn't blocked. Android registers an empty React Native Track Player playback service at the top of App.js, since its player runs in a service that needs a registered task. The remote controls stay on the in-app handlers

### mobile-app/eas.json
- **development:** iOS simulator + dev client
- **preview:** Internal distribution
- **production:** App Store submission with auto-submit. Android builds an app bundle and EAS raises `android.versionCode` in app.json each build (`autoIncrement`, with `appVersionSource` local). `eas submit` sends Android to the Play internal track with `google-service-account.json`, which is gitignored
- **Last modified:** 2026-10-14

### Backend Deployment
- **Host:** Railway (auto-deploys from `main` branch)
- **URL:** `https://api.stacktrackergold.com`
- **Port:** `process.env.PORT || 3000`

### Key Native Dependencies (require new build when changed)
- `react-native-track-player` — TTS audio playback
- `expo-av` — Audio recording
- `react-native-purchases` — RevenueCat
- `react-native-cloud-storage` — iCloud sync
- `expo-notifications` — Push notifications
- `@bacons/apple-targets` — Widget extension

---

## Backend Routes Summary

### Troy AI
| Method | Route | Purpose |
|--------|-------|---------|
| POST | `/v1/troy/conversations` | Create conversation |
| GET | `/v1/troy/conversations` | List conversations |
| GET | `/v1/troy/conversations/:id` | Get conversation + messages |
| DELETE | `/v1/troy/conversations/:id` | Delete conversation |
| POST | `/v1/troy/conversations/:id/messages` | Send message, get Troy response |
| POST | `/v1/troy/speak` | ElevenLabs TTS (voice caps enforced) |
| POST | `/v1/troy/transcribe` | OpenAI Whisper STT (voice caps enforced) |
| POST | `/v1/troy/report` | Report a Troy reply for review (asked of troystack-api 10/14, not live yet) |

### Prices & Data
| Method | Route | Purpose |
|--------|-------|---------|
| GET | `/v1/spot-prices` | Current spot prices |
| GET | `/v1/widget-data` | Widget cache endpoint |
| GET | `/v1/sparkline-24h` | 24h sparkline data |
| GET | `/v1/historical-spot` | Historical price lookup |
| POST | `/v1/historical-spot-batch` | Batch historical lookup |
| GET | `/v1/spot-price-history` | Full price history |
| GET | `/v1/dealer-prices` | Dealer price comparison |

### Portfolio
| Method | Route | Purpose |
|--------|-------|---------|
| POST | `/v1/snapshots` | Save portfolio snapshot |
| GET | `/v1/snapshots/:userId` | Get snapshots |

### Push & Alerts
| Method | Route | Purpose |
|--------|-------|---------|
| POST | `/v1/push/register` | Register push token |
| POST | `/v1/push/price-alerts` | Create price alert |
| GET | `/v1/push/price-alerts` | Get user's alerts |
| DELETE | `/v1/push/price-alerts/:id` | Delete alert |
| POST | `/v1/push/notification-preferences` | Update notification prefs |

### Content
| Method | Route | Purpose |
|--------|-------|---------|
| GET | `/v1/daily-brief` | Get daily market brief |
| GET | `/v1/stack-signal` | Get Stack Signal articles |
| GET | `/v1/vault-data` | Get COMEX vault data |
| GET | `/v1/intelligence` | Get market intelligence |
| POST | `/v1/scan-receipt` | AI receipt scanning |

### Auth & Billing
| Method | Route | Purpose |
|--------|-------|---------|
| GET | `/v1/sync-subscription` | Sync RevenueCat status |
| POST | `/v1/webhooks/revenuecat` | RevenueCat webhook |
| POST | `/v1/webhooks/stripe` | Stripe webhook |
| GET | `/v1/min-version` | Minimum app version check |

---

## Voice Usage Tracking (Backend)

In-memory `voiceUsage` map keyed by `date:userId`. Shared between `/v1/troy/speak` and `/v1/troy/transcribe`.
- **Free tier:** 1 voice exchange/day
- **Gold/Lifetime:** 20 voice exchanges/day
- User tier checked via Supabase `profiles.subscription_tier`
- Returns HTTP 429 with message when limit reached

---

## Database Tables (Supabase)

| Table | Purpose |
|-------|---------|
| `profiles` | User profiles, subscription tier, preferences |
| `holdings` | Precious metals holdings (synced from app) |
| `troy_conversations` | Troy chat conversation metadata |
| `troy_messages` | Individual Troy chat messages |
| `portfolio_snapshots` | Daily portfolio value snapshots |
| `push_tokens` | Expo push notification tokens |
| `price_alerts` | User price alert configurations |
| `intelligence_briefs` | AI-generated market intelligence |
| `daily_briefs` | Troy's daily market briefs |
| `stack_signal_articles` | Stack Signal news articles |
| `vault_data` | COMEX vault tracking data |
