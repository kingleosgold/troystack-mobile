# Stack Tracker Pro - Mobile App

Privacy-first precious metals portfolio tracker for iOS and Android.

## Features

- 📊 **Portfolio Tracking** - Track silver & gold holdings with real-time spot prices
- 📷 **AI Receipt Scanner** - Photograph receipts for automatic data entry
- 🔒 **Privacy-First** - All data stored locally with AES-256 encryption
- 👆 **Biometric Lock** - Face ID / Touch ID / Fingerprint protection
- 📈 **Numismatic Tracking** - Track collector premiums separately from melt value
- 📥 **CSV Export** - Export your complete portfolio for tax records
- 🔔 **Price Alerts** - Get notified when metals hit your targets

## Privacy Architecture

| What We Do | What We DON'T Do |
|------------|------------------|
| Store data locally on YOUR device | Store data on our servers |
| Encrypt with AES-256 | Send unencrypted data |
| Process receipt images in RAM only | Save receipt images anywhere |
| Use biometric authentication | Create user accounts |
| Delete images after scanning | Track or profile users |

## Quick Start

### Prerequisites

- Node.js 18+
- Expo CLI (`npm install -g expo-cli`)
- Expo Go app on your phone (for testing)

### Development

```bash
# Install dependencies
npm install

# Start development server
npx expo start

# Run on iOS simulator
npx expo start --ios

# Run on Android emulator
npx expo start --android
```

### Testing Receipt Scanner

1. Deploy the backend API (see `stack-tracker-backend/` folder)
2. Update `API_BASE_URL` in App.js to point to your backend
3. Run the app and test scanning a receipt

## 🚀 Production Build & Deployment

**⚡ Quick Reference:**
```bash
# Run pre-launch checklist
./pre-launch-checklist.sh

# Build for production
eas build --profile production --platform ios
eas build --profile production --platform android

# Submit to stores
eas submit --platform ios --latest
eas submit --platform android --latest
```

### Complete App Store Submission Guide

See **[BUILD_READY.md](../BUILD_READY.md)** for the comprehensive production deployment guide including:
- Complete setup instructions
- App Store Connect configuration
- Privacy policy requirements
- Asset requirements
- Submission checklist
- Common issues & solutions

### Setup EAS Build (First Time)

```bash
# Install EAS CLI
npm install -g eas-cli

# Login to Expo
eas login

# Initialize project
eas init

# Update app.json with your project ID
# Update eas.json with your Apple/Google credentials
```

### Build Profiles

#### Development (Local Testing)
```bash
eas build --profile development --platform ios
```
- Development client for testing
- Runs on simulator
- Uses localhost API

#### Preview (TestFlight/Internal Testing)
```bash
eas build --profile preview --platform ios
eas build --profile preview --platform android
```
- Internal distribution
- Production API endpoint
- APK for Android testers

#### Production (App Store Release)
```bash
eas build --profile production --platform ios
eas build --profile production --platform android
```
- Auto-increments build numbers
- Production API endpoint
- AAB for Google Play (required)

## Project Structure

```
react-native-app/
├── App.js              # Main application component
├── app.json            # Expo configuration
├── package.json        # Dependencies
├── assets/             # App icons and splash screens
│   ├── icon.png        # App icon (1024x1024)
│   ├── splash.png      # Splash screen
│   ├── adaptive-icon.png # Android adaptive icon
│   └── favicon.png     # Web favicon
└── README.md           # This file
```

## Required Assets

Before building, create these images in the `assets/` folder:

- `icon.png` - 1024x1024 app icon
- `splash.png` - 1284x2778 splash screen  
- `adaptive-icon.png` - 1024x1024 Android foreground icon
- `favicon.png` - 32x32 web favicon

## API Configuration

Update `API_BASE_URL` in App.js to point to your deployed backend:

```javascript
const API_BASE_URL = 'https://api.yourdomain.com';
```

For local development:

```javascript
const API_BASE_URL = 'http://localhost:3000';
```

## App Store Submission Checklist

### iOS (App Store)

- [ ] Create App Store Connect listing
- [ ] Add app description emphasizing privacy
- [ ] Upload screenshots (6.5" and 5.5" iPhones)
- [ ] Set age rating (4+)
- [ ] Add privacy policy URL
- [ ] Fill out App Privacy section (minimal data collection)
- [ ] Submit for review

### Android (Google Play)

- [ ] Create Google Play Console listing
- [ ] Upload screenshots and feature graphic
- [ ] Fill out Data Safety section
- [ ] Set content rating
- [ ] Add privacy policy URL
- [ ] Submit for review

## Privacy Policy Requirements

Your privacy policy should emphasize:

1. **Local-first storage** - All portfolio data stays on device
2. **No accounts** - No user registration required
3. **Receipt processing** - Images processed in memory, never stored
4. **No tracking** - No analytics or user profiling
5. **Encryption** - AES-256 encryption for local data
6. **Export capability** - Users can export all their data
7. **Deletion** - Uninstalling removes all data

## Monetization (Optional)

The app supports a freemium model with in-app purchases:

| Feature | Free | TroyStack Gold Monthly ($4.99/mo) | TroyStack Gold Yearly ($39.99/yr) | Lifetime Gold Pass ($149.99 one-time) |
|---------|------|-----------------------------------|-----------------------------------|--------------------------------------|
| Manual entry | 10 items | Unlimited | Unlimited | Unlimited |
| Receipt scanning | ❌ | Unlimited | Unlimited | Unlimited |
| Price alerts | 1 | Unlimited | Unlimited | Unlimited |
| CSV export | ❌ | ✅ | ✅ | ✅ |
| Cloud sync | ❌ | ✅ (E2E encrypted) | ✅ (E2E encrypted) | ✅ (E2E encrypted) |

To implement, add `expo-in-app-purchases` and create products in App Store Connect / Google Play Console.

## Support

- Email: support@stacktracker.app
- Privacy: privacy@stacktracker.app

## License

MIT
