# Stack Tracker Pro - Claude Code Instructions

## BUILD RULES — READ BEFORE EVERY BUILD
1. NEVER manually set buildNumber. Always INCREMENT from the current value.
2. Before any build, run: cat app.json | grep buildNumber — confirm it's HIGHER than the last submitted build.
3. The current highest build number Apple has received is 65. Next build must be 66 or higher.
4. If a build FAILS, the buildNumber may still have been auto-incremented by EAS. Always check app.json after a failed build.
5. After every successful submission, update this number: LAST SUBMITTED BUILD: 69
- EAS auto-increments buildNumber on every build. Do NOT manually set buildNumber unless it needs to jump past a number Apple already received.
- Before building, just VERIFY the current buildNumber is higher than LAST SUBMITTED BUILD. If it is, don't touch it — EAS will increment it.
- After each build, update LAST SUBMITTED BUILD to whatever EAS set it to.

## Project Overview
Stack Tracker Pro is a privacy-first iOS app for tracking precious metals portfolios (gold, silver, platinum, palladium). Built with React Native/Expo, RevenueCat for subscriptions.

## CRITICAL: Build Workflow (READ FIRST!)

### DO NOT waste EAS builds on iterative testing!
- EAS free tier: 15 iOS builds/month
- Each build takes 15-30+ minutes
- Free tier has slow queue times

### Correct Workflow:
1. **Development/Testing**: Use the DEV BUILD with hot reload
   - `eas build --profile development --platform ios` (only need to do this once, or when native config changes)
   - JavaScript changes reload instantly - NO BUILD NEEDED
   
2. **Production/TestFlight**: Only when READY TO SHIP
   - `eas build --profile production --platform ios --auto-submit`
   - Use sparingly!

### When you DO need a new build:
- Changed app.json (native config)
- Added new native packages
- Changed iOS entitlements/capabilities
- Ready to submit to TestFlight/App Store

### When you DON'T need a new build:
- JavaScript/React code changes
- Bug fixes in App.js
- UI changes

## Tech Stack

### Mobile App
- **Framework**: React Native with Expo (SDK 52)
- **Location**: `/mobile-app`
- **Main file**: `App.js` (monolithic, ~2500+ lines)
- **State**: React useState + AsyncStorage for persistence
- **Subscriptions**: RevenueCat

### Key Services
- **RevenueCat**: Subscription management (Gold Monthly $9.99, Yearly $79.99, Lifetime $149.99)
- **MetalPriceAPI**: Live spot prices (primary)
- **GoldAPI**: Fallback for spot prices
- **Claude Vision API**: Receipt OCR scanning

## App Features

### Free Tier
- Portfolio tracking (unlimited holdings)
- Live spot prices
- Basic analytics
- CSV export

### Gold/Lifetime Tier ($9.99/mo, $79.99/yr, $149.99 lifetime)
- AI Intelligence Feed
- COMEX Vault Watch
- AI Stack Advisor (coming soon)
- AI Daily Brief (coming soon)
- AI Deal Finder (coming soon)
- Spot Price History charts
- Advanced Analytics
- All free features

## Important Files

```
mobile-app/
├── App.js              # Main app (all screens, logic)
├── app.json            # Expo config, native settings
├── eas.json            # EAS build profiles
├── src/
│   └── components/
│       └── GoldPaywall.js  # Subscription paywall
└── assets/             # Icons, images
```

## Known Issues & Quirks

### Receipt OCR
- Claude Vision sometimes misreads digits (8→3, 7→2)
- Price validation compares against live spot prices
- Still not 100% accurate - users should verify prices

### Spot Prices
- Silver is in a historic bull run (~$70-80/oz as of Jan 2026)
- Don't hardcode spot prices - always use live cache
- Gold is ~$4500/oz

### Data Persistence
- Bug was fixed where data wiped on app restart (race condition with AsyncStorage)
- `dataLoaded` flag prevents saving empty arrays before load completes

## Apple Developer Setup

### App ID: com.stacktrackerpro.app
### Team ID: 3BKELS5FG9

### Capabilities Enabled:
- In-App Purchase
- iCloud (CloudKit)
  - Container: iCloud.com.stacktrackerpro.app

## RevenueCat Setup

### Products:
- `stacktracker_gold_monthly` - $9.99/month
- `stacktracker_gold_yearly` - $79.99/year (save 33%)
- `stacktracker_lifetime` - $149.99 one-time

### Entitlements:
- `Gold` - Any active subscription or lifetime purchase
- Existing $4.99/mo subscribers grandfathered at old price

### Testing:
- Grant promotional entitlements via RevenueCat dashboard
- Customers → Search by $RCAnonymousID → Grant Promotional

## Deployment Checklist

### Mobile App (TestFlight):
1. Make sure all JS changes are tested in dev build first
2. Bump version in app.json if needed
3. `git add . && git commit -m "message" && git push`
4. `eas build --profile production --platform ios --auto-submit`
5. Wait for build + Apple processing (can take 1-2 hours total)
6. Test in TestFlight before App Store submission

### App Store Submission:
1. Go to App Store Connect
2. Create new version or select draft
3. Select build
4. Fill "What's New"
5. Submit for Review (24-48 hours typically)

## Common Commands

```bash
# Development
cd mobile-app
npx expo start                    # Start dev server (use with dev build)

# Building
eas build --profile development --platform ios    # Dev build (testing)
eas build --profile production --platform ios     # Production build
```

## Monetization Strategy

Two tiers only: FREE and GOLD (no Platinum tier).

Gold benefits:
1. AI Intelligence Feed
2. COMEX Vault Watch
3. Spot Price History charts
4. Advanced Analytics
5. AI Stack Advisor (coming soon)
6. AI Daily Brief (coming soon)
7. AI Deal Finder (coming soon)

## Contact & Support
- Support email: stacktrackergold@gmail.com
- Users can find Support ID in Settings → Advanced
