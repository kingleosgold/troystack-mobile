# Stack Tracker Pro - Production Build Guide

## 📱 App Store Submission Checklist

This guide contains everything you need to successfully submit Stack Tracker Pro to the iOS App Store and Google Play Store.

---

## ✅ Pre-Build Checklist

### 1. **Environment Setup**
- [ ] Install Expo CLI: `npm install -g eas-cli`
- [ ] Login to Expo: `eas login`
- [ ] Create Expo account if needed: https://expo.dev/signup
- [ ] Install Xcode (iOS builds) or Android Studio (Android builds)

### 2. **Project Configuration**
- [x] Bundle identifier configured: `com.stacktrackerpro.app`
- [x] Version set: `1.0.0`
- [x] Build numbers set: iOS `1`, Android `1`
- [x] Privacy descriptions added for App Store compliance
- [x] Production API endpoint configured
- [x] App icons and splash screens ready

### 3. **Update app.json**
Replace these placeholders in `mobile-app/app.json`:
```json
{
  "expo": {
    "extra": {
      "eas": {
        "projectId": "your-project-id-here"  // ← Get from: eas init
      }
    },
    "owner": "your-expo-username"  // ← Your Expo username
  }
}
```

### 4. **Update eas.json**
Replace these placeholders in `mobile-app/eas.json`:
```json
{
  "submit": {
    "production": {
      "ios": {
        "appleId": "your-apple-id@example.com",      // ← Your Apple ID
        "ascAppId": "your-asc-app-id",               // ← From App Store Connect
        "appleTeamId": "your-team-id"                // ← From Apple Developer
      }
    }
  }
}
```

---

## 🏗️ Build Configuration

### **Build Profiles**

#### 1. **Development** (Local testing)
```bash
cd mobile-app
eas build --profile development --platform ios
```
- Development client for Expo Go
- Runs on simulator
- Uses localhost API

#### 2. **Preview** (TestFlight/Internal Testing)
```bash
cd mobile-app
eas build --profile preview --platform ios
eas build --profile preview --platform android
```
- Internal distribution
- Production API endpoint
- APK for Android

#### 3. **Production** (App Store/Play Store)
```bash
cd mobile-app
eas build --profile production --platform ios
eas build --profile production --platform android
```
- Production builds for store submission
- Auto-increment build numbers
- AAB for Android (Play Store requires)

---

## 🚀 Building for Production

### **iOS Build**

1. **Prerequisites:**
   - Apple Developer account ($99/year)
   - App created in App Store Connect
   - Certificates and provisioning profiles (EAS handles automatically)

2. **Build Command:**
   ```bash
   cd mobile-app
   eas build --profile production --platform ios
   ```

3. **What happens:**
   - EAS creates production build on cloud
   - Auto-increments build number
   - Takes ~15-20 minutes
   - Downloads `.ipa` file when complete

4. **Submit to App Store:**
   ```bash
   eas submit --platform ios --latest
   ```
   OR manually upload via Xcode or Transporter app

### **Android Build**

1. **Prerequisites:**
   - Google Play Developer account ($25 one-time)
   - App created in Google Play Console
   - Service account JSON key (for automated submission)

2. **Build Command:**
   ```bash
   cd mobile-app
   eas build --profile production --platform android
   ```

3. **What happens:**
   - EAS creates production AAB (App Bundle)
   - Takes ~10-15 minutes
   - Downloads `.aab` file when complete

4. **Submit to Play Store:**
   ```bash
   eas submit --platform android --latest
   ```
   OR manually upload via Google Play Console

---

## 📋 App Store Requirements

### **iOS App Store Connect**

1. **App Information:**
   - **Name:** Stack Tracker Pro
   - **Subtitle:** Privacy-First Precious Metals Tracker
   - **Category:** Finance
   - **Content Rating:** 4+

2. **Privacy Policy:**
   - Required URL: Create a privacy policy page
   - Key points:
     - Data stored locally on device only
     - No data collection or analytics
     - Receipt photos processed in memory and immediately deleted
     - We cannot access user data

3. **App Description:**
   ```
   Track your precious metals portfolio with complete privacy.

   PRIVACY FIRST
   • Your data stays on YOUR device
   • No accounts, no cloud sync, no tracking
   • We architected it so we CAN'T access your data

   AI-POWERED RECEIPT SCANNING
   • Scan purchase receipts with your camera
   • AI extracts product, price, and weight automatically
   • Photos processed in memory and immediately deleted

   COMPREHENSIVE TRACKING
   • Track gold, silver, platinum, palladium
   • Real-time spot prices
   • Historical price data back to 1971
   • Premium calculations
   • Break-even analysis

   PROFESSIONAL TOOLS
   • Portfolio analytics
   • Export to CSV
   • Cloud backup (iCloud/Google Drive)
   • Junk silver calculator
   • Speculation tools

   SECURE
   • Face ID / Touch ID protection
   • Local encryption
   • No internet required (works offline)

   "Make Stacking Great Again" 🪙
   ```

4. **Keywords:**
   ```
   gold,silver,precious metals,portfolio,tracker,privacy,bullion,coins,stack,investment
   ```

5. **Screenshots Required:**
   - 6.5" iPhone (1284 x 2778): At least 3 screenshots
   - 12.9" iPad Pro (2048 x 2732): At least 3 screenshots
   - Highlight key features:
     1. Portfolio dashboard
     2. AI receipt scanning
     3. Holdings breakdown
     4. Privacy features

### **Google Play Store**

1. **Store Listing:**
   - **Short description:** Privacy-first precious metals portfolio tracker
   - **Full description:** Same as iOS with formatting adjusted

2. **Content Rating:**
   - Complete questionnaire (Finance app, no objectionable content)
   - Expected: Everyone

3. **Privacy & Security:**
   - Complete Data Safety form
   - Declare: No data collected
   - Declare: No data shared with third parties

4. **Screenshots:**
   - Phone: 1080 x 1920 (at least 2)
   - Tablet: 1600 x 2560 (at least 1)

---

## 🔐 Privacy & Permissions

### **iOS Info.plist Descriptions**

All privacy descriptions are App Store compliant and explain:
- **Why** we need the permission
- **What** we do with it
- **Privacy** assurances

**Camera Access:**
> "Stack Tracker Pro needs camera access to scan your precious metals purchase receipts using AI-powered OCR. Your photos are processed securely and never stored."

**Photo Library Access:**
> "Stack Tracker Pro needs photo library access to scan your purchase receipts. Your photos are processed securely and never stored on our servers."

**Face ID:**
> "Stack Tracker Pro uses Face ID to securely protect your precious metals portfolio data with biometric authentication."

### **Android Permissions**

Required permissions with justifications:
- `CAMERA`: Receipt scanning
- `READ_EXTERNAL_STORAGE`: Photo access for receipt scanning
- `WRITE_EXTERNAL_STORAGE`: Export CSV files
- `USE_BIOMETRIC`: Fingerprint authentication
- `USE_FINGERPRINT`: Legacy fingerprint support

**Blocked permissions** (prevents unnecessary access):
- Location (not needed)
- Microphone (not needed)

---

## 🎨 Assets Required

### **App Icons**
- **iOS:** 1024x1024 PNG (no transparency, no rounded corners)
- **Android:** 512x512 PNG (adaptive icon with foreground/background)
- Location: `mobile-app/assets/icon.png`

### **Splash Screen**
- **Size:** 1284x2778 (iPhone 14 Pro Max)
- **Format:** PNG with transparency
- **Background:** #0f0f0f (dark)
- Location: `mobile-app/assets/splash.png`

### **Adaptive Icon (Android)**
- **Foreground:** 512x512 PNG (with transparency)
- **Background:** Solid color #0f0f0f
- Location: `mobile-app/assets/adaptive-icon.png`

---

## 🧪 Pre-Submission Testing

### **Functionality Checklist**
- [ ] App launches without errors
- [ ] Biometric authentication works (Face ID/Touch ID)
- [ ] Can add/edit/delete holdings
- [ ] Receipt scanning works with test images
- [ ] Spot prices load from production API
- [ ] Historical prices work (test with different dates)
- [ ] Export CSV generates valid file
- [ ] Cloud backup/restore works
- [ ] Junk silver calculator accurate
- [ ] All modals dismiss properly
- [ ] No console errors or warnings

### **Privacy Verification**
- [ ] No analytics or tracking code
- [ ] No data sent to servers (except API calls)
- [ ] Receipt images not saved
- [ ] Data persists only in AsyncStorage (local)
- [ ] App works offline (cached prices)

## 📱 Local Testing

### **iOS Simulator**
```bash
cd mobile-app
npm install
npx expo start --ios
```

### **Android Emulator**
```bash
cd mobile-app
npm install
npx expo start --android
```

### **Physical Device (Expo Go)**
```bash
cd mobile-app
npx expo start
# Scan QR code with Expo Go app
```

---

## 🚨 Common Issues & Solutions

### **Build Fails: "Invalid bundle identifier"**
- Ensure `bundleIdentifier` in app.json matches App Store Connect
- Format: `com.stacktrackerpro.app`

### **Build Fails: "Provisioning profile not found"**
- Run: `eas build:configure`
- EAS will create certificates automatically

### **API not reachable in production build**
- Check `app.json` → `extra.apiUrl` is set correctly

### **App rejected: Missing privacy policy**
- Create a simple privacy policy page
- Add URL to App Store Connect
- Example: GitHub Pages or simple static site

### **Receipt scanning not working**
- Verify Camera permission granted
- Test scan endpoint manually

---

## 📞 Support & Resources

### **Expo Documentation**
- EAS Build: https://docs.expo.dev/build/introduction/
- EAS Submit: https://docs.expo.dev/submit/introduction/
- App Store: https://docs.expo.dev/submit/ios/

### **Apple Resources**
- App Store Connect: https://appstoreconnect.apple.com
- Developer Portal: https://developer.apple.com
- Review Guidelines: https://developer.apple.com/app-store/review/guidelines/

### **Google Resources**
- Play Console: https://play.google.com/console
- Review Guidelines: https://play.google.com/about/developer-content-policy/

---

## 🎯 Quick Start Guide

**First time setup:**
```bash
# 1. Install EAS CLI
npm install -g eas-cli

# 2. Login to Expo
eas login

# 3. Initialize project
cd mobile-app
eas init

# 4. Update app.json and eas.json with your details

# 5. Install dependencies
npm install

# 6. Test locally
npx expo start

# 7. Build for iOS
eas build --profile production --platform ios

# 8. Build for Android
eas build --profile production --platform android

# 9. Submit to stores
eas submit --platform ios --latest
eas submit --platform android --latest
```

---

## 📦 What's Included

### **Current Configuration:**
- ✅ Bundle IDs: `com.stacktrackerpro.app`
- ✅ Version: `1.0.0`
- ✅ Privacy descriptions: All required permissions
- ✅ Build profiles: Development, Preview, Production
- ✅ Auto-increment build numbers
- ✅ App Store compliance ready

### **What You Need to Add:**
1. Expo project ID (run `eas init`)
2. Your Expo username
3. Apple Developer credentials
4. Google Play credentials
5. Privacy policy URL
6. App icons (if not using defaults)
7. Screenshots for store listings

---

## 🎉 Ready to Ship!

Stack Tracker Pro is configured and ready for production builds. Follow this guide step-by-step, and you'll have your app in the App Store and Play Store.

**Questions?** Review the Expo documentation.

**Good luck with your launch! 🚀**
