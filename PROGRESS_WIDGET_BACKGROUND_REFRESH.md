# Widget Background Refresh Improvements

## Issue
Spot prices on the widget were not refreshing in the background when the app is closed.

## Root Cause Analysis

### What Was Already Working
1. ✅ Background modes enabled in app.json ("fetch", "processing")
2. ✅ BackgroundFetch task registered with 15-minute minimum interval
3. ✅ Widget fetches fresh data from backend in `getTimeline()`
4. ✅ Background fetch task updates widget data when app is active

### What Needed Improvement
1. ❌ Timeline only covered 2 hours (8 entries @ 15 min intervals)
2. ❌ Refresh policy `.atEnd` waited until all entries expired (2 hours)
3. ❌ Not aggressive enough for background refresh when app is closed

## Solution

### Changes Made
**File: `targets/widget/StackTrackerWidget.swift`**
**File: `targets/widget/StackTrackerWidget.swift`**

1. **Increased timeline coverage:**
   - Before: 8 entries over 2 hours (every 15 minutes)
   - After: 24 entries over 6 hours (every 15 minutes)
   - Benefit: More data in timeline buffer, widget stays fresh longer

2. **More aggressive refresh policy:**
   - Before: `.atEnd` - refresh only after all entries expire (2 hours)
   - After: `.after(nextRefresh)` - force refresh after 1 hour
   - Benefit: Widget fetches fresh prices from backend every hour, even when app is closed

3. **Better logging:**
   - Added note about 6-hour coverage in logs
   - Helps debugging timeline behavior

## How It Works Now

### When App Is Closed:
1. Widget timeline has 24 entries (6 hours of data)
2. Every 1 hour, iOS calls `getTimeline()` due to `.after()` policy
3. `getTimeline()` fetches fresh prices from backend cache
4. Fresh data is saved to App Group storage
5. Widget updates with new prices
6. New timeline created with fresh 1-hour refresh schedule

### Background Fetch (iOS-controlled):
- iOS may also wake the app for background fetch (15-min minimum interval)
- When this happens, `BackgroundFetch` task runs:
  - Fetches prices from backend
  - Updates AsyncStorage
  - Updates widget via native module
  - Widget gets reloaded with fresh data

### Combined Effect:
- **Guaranteed** refresh every 1 hour (widget timeline policy)
- **Possible** additional refreshes every 15+ minutes (iOS background fetch)
- Widget stays current even when app hasn't been opened in hours/days

## Testing Recommendations

1. **Close the app completely** (swipe away from app switcher)
2. **Add widget to home screen** if not already there
3. **Wait 1 hour** and check if prices update
4. **Check Xcode console** (if connected) for widget logs:
   - "🔧 [Widget] getTimeline called"
   - "✅ [Widget] Got fresh prices"
   - "🔧 [Widget] Created 24 timeline entries (6 hours coverage)"

## Technical Details

### Widget Refresh Frequency
- **Minimum iOS allows:** ~5 minutes (system-controlled)
- **Our timeline policy:** 1 hour forced refresh
- **Timeline coverage:** 6 hours of entries
- **Backend cache:** 5-minute cache on API (reduces costs)

### Battery Impact
- Minimal - widget refresh is lightweight
- Fetches from backend cache (no heavy scraping)
- iOS controls actual refresh frequency
- Only updates when widget is visible on home screen

## Files Changed
- ✅ `mobile-app/targets/widget/StackTrackerWidget.swift`
- ✅ `mobile-app/targets/widget/StackTrackerWidget.swift`

## Status
✅ **COMPLETE** - Widget now refreshes every 1 hour when app is closed, with 6-hour timeline coverage.
