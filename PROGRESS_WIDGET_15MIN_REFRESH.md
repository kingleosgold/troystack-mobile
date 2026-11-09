# Widget 15-Minute Refresh - Matching App Background Fetch

## Question from User
"If the app is fetching new prices from backend cache every 15 mins, why can't the widget also? Or why can't the app push every new price to the widget?"

## Answer: It Already Does (But Widget Timeline Was Too Slow)

### How Background Fetch + Widget Works

**1. App Background Fetch (Every 15 Minutes)**
- iOS wakes app in background
- App fetches prices from backend
- App updates AsyncStorage
- **App pushes update to widget** via `WidgetKitModule.reloadAllTimelines()`
- Widget displays fresh data

**2. Widget Timeline (Independent Refresh)**
- Widget has its own timeline with scheduled updates
- **BEFORE:** Widget timeline refresh every 1 hour
- **AFTER:** Widget timeline refresh every 15 minutes
- Widget fetches directly from backend cache

### The Issue
The widget timeline policy was set to refresh every **1 hour**, but the app's background fetch runs every **15 minutes**. This created a disconnect:
- App was pushing updates every 15 minutes ✓
- Widget was only refreshing its own timeline every 1 hour ✗

### The Fix
Changed widget timeline policy from:
```swift
let nextRefresh = Calendar.current.date(byAdding: .hour, value: 1, to: currentDate)!
```

To:
```swift
let nextRefresh = Calendar.current.date(byAdding: .minute, value: 15, to: currentDate)!
```

### How It Works Now (Two-Pronged Approach)

**Method 1: App Pushes to Widget (When App Background Fetch Runs)**
- Background fetch runs every 15+ minutes (iOS-controlled)
- Fetches prices from backend
- Calls `WidgetKitModule.reloadAllTimelines()`
- Widget updates immediately

**Method 2: Widget Pulls from Backend (Independent)**
- Widget timeline expires every 15 minutes
- Widget calls `getTimeline()`
- Fetches fresh prices directly from backend cache
- Creates new timeline with 24 entries (6 hours)
- Schedules next refresh in 15 minutes

**Combined Result:**
- Widget gets updates from **both** the app (push) AND its own timeline (pull)
- If background fetch doesn't run, widget still refreshes every 15 minutes on its own
- If background fetch runs more frequently, widget benefits from those pushes too
- **Maximum staleness:** 15 minutes (matching app refresh rate)

## Why This Is Better

**Before:**
- App background fetch: every 15 min ✓
- Widget timeline: every 1 hour ✗
- Widget could be up to 1 hour stale even though app had fresh data

**After:**
- App background fetch: every 15 min ✓
- Widget timeline: every 15 min ✓
- Widget maximum 15 minutes stale, matching app refresh rate

## iOS Background Fetch Reality Check

**Important:** iOS controls when background fetch actually runs. The 15-minute minimum is just that - a minimum. iOS may run it:
- More frequently if app is used often
- Less frequently to save battery
- Not at all if Low Power Mode is enabled

**That's why having the widget timeline as backup is crucial.** Even if iOS throttles background fetch, the widget will still refresh every 15 minutes on its own.

## Battery Impact

**Minimal.** Why?
- Widget only fetches when visible on home screen
- Backend has 5-minute cache (not re-scraping every time)
- Fetch is lightweight (~1KB JSON response)
- iOS optimizes widget refresh based on usage patterns
- If widget isn't being viewed, iOS may delay refreshes to save battery

## Files Changed
- ✅ `mobile-app/targets/widget/StackTrackerWidget.swift`
- ✅ `mobile-app/targets/widget/StackTrackerWidget.swift`

## Technical Details

### Timeline Structure
- **24 entries** over 6 hours (every 15 minutes)
- Each entry has the same data (current prices)
- Next refresh scheduled 15 minutes from now
- When refresh happens, new timeline created with fresh prices

### Why 24 Entries?
If widget timeline refresh fails (network issue, iOS throttling), the widget still has entries to display. This prevents the widget from going blank if it can't fetch new data immediately.

### Why Not Refresh Every 5 Minutes?
- iOS may throttle very aggressive refresh rates
- Backend cache is 5 minutes, so more frequent than that is wasteful
- 15 minutes is the sweet spot: frequent enough to feel fresh, conservative enough that iOS won't throttle

## Status
✅ **COMPLETE** - Widget now refreshes every 15 minutes (matching app background fetch), with backup timeline refresh if background fetch is throttled.
