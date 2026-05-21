# Stack Tracker Pro - Features Update

## Summary of Changes

This update adds significant new features to Stack Tracker Pro, including multi-item receipt scanning, spreadsheet import functionality, and usage limits for the free tier.

---

## 1. Multi-Item Receipt Scanning

### What Changed
- **Backend AI Enhancement**: The Claude Vision API now extracts ALL items from a single receipt
- **Support for Mixed Receipts**: Can now handle receipts containing both Silver AND Gold purchases
- **Automatic Separation**: Each item is automatically added to the correct holdings (Silver/Gold)

### How It Works
1. User scans a receipt that contains multiple items
2. Claude AI extracts all line items from the receipt:
   - Dealer name (shared across all items)
   - Purchase date (shared across all items)
   - Individual item details (metal type, product name, quantity, price, weight)
3. App creates separate holdings for each item
4. Shows summary: "Found 3 items: 2 Silver, 1 Gold"

### Technical Details
- **Backend**: `backend/server.js` (lines 474-547)
  - Updated prompt to extract items array instead of single item
  - New response format:
    ```json
    {
      "dealer": "APMEX",
      "purchaseDate": "2025-12-25",
      "items": [
        {
          "metal": "silver",
          "description": "American Silver Eagle",
          "quantity": 10,
          "ozt": 1,
          "unitPrice": 35.50
        },
        {
          "metal": "gold",
          "description": "Canadian Maple Leaf 1oz",
          "quantity": 1,
          "ozt": 1,
          "unitPrice": 2400.00
        }
      ]
    }
    ```

- **Mobile App**: `mobile-app/App.js` (lines 614-706)
  - Loops through all items in response
  - Gets historical spot price for each item
  - Calculates premium per item
  - Adds each item to appropriate holdings array
  - Sets metal tab to "both" if mixed metals detected

### User Experience
- Scans one receipt → automatically creates multiple holdings
- No manual entry required for each item
- Summary message shows what was found
- Modal auto-closes after 2 seconds on success

---

## 2. Spreadsheet Import Feature

### What Changed
- **New Import Button**: Added "Import from Spreadsheet" button to Holdings screen
- **CSV & Excel Support**: Accepts .csv, .xls, and .xlsx files
- **Flexible Column Mapping**: Auto-detects common column names
- **Preview Before Import**: Shows what will be imported before confirming
- **Bulk Import**: Add hundreds of items at once

### How It Works
1. User taps "Import from Spreadsheet" button on Holdings screen
2. Selects a CSV or Excel file from their device
3. App parses the file and maps columns automatically:
   - **Product Name**: product, name, item, description
   - **Metal Type**: metal, type (must contain "gold" or "silver")
   - **Quantity**: quantity, qty, count, amount
   - **Unit Price**: price, unit price, cost, unit cost
   - **Date**: date, purchased, purchase date, order date
   - **Dealer**: dealer, source, vendor, seller
   - **OZT**: oz, ozt, ounces, troy oz, weight
4. Shows preview of first 10 items
5. User confirms → all items imported

### Required Columns
- **Product Name** (required)
- **Metal Type** (required - must be "gold" or "silver")
- All other columns are optional (defaults: quantity=1, ozt=1, price=0)

### Example Spreadsheet Format

| Product Name | Metal Type | Quantity | Unit Price | OZT | Date | Dealer |
|---|---|---|---|---|---|---|
| American Silver Eagle | Silver | 10 | 35.50 | 1 | 2025-12-20 | APMEX |
| Canadian Maple Leaf | Gold | 1 | 2400 | 1 | 2025-12-15 | JM Bullion |
| Mercury Dime Roll | Silver | 50 | 4.25 | 0.07234 | 2025-11-10 | Local Coin Shop |

### Technical Details
- **Library Used**: `xlsx` (npm package)
- **Parsing**: `mobile-app/App.js` (lines 765-875)
  - Reads file as base64
  - Converts to Uint8Array
  - Parses with XLSX.read()
  - Flexible column detection with fuzzy matching
  - Validates required columns exist
  - Skips rows with missing essential data

- **File Types Supported**:
  - `.csv` - Comma-separated values
  - `.xls` - Excel 97-2003
  - `.xlsx` - Excel 2007+

### User Experience
- One-click bulk import
- Automatic column detection (no manual mapping needed)
- Preview shows exactly what will be imported
- Cancel anytime before confirmation
- Success message shows: "Imported 50 items: 30 Silver, 20 Gold"

---

## 3. Updated Pricing

### What Changed
- **Lifetime Tier Price Increase**: $29.99 → $79.99
- **Updated Marketing Copy**: "Pay once, use forever - Best value!"

### Pricing Structure
| Tier | Price | Description | Best For |
|---|---|---|---|
| **Monthly** | $4.99/mo | Perfect for trying out Gold tier | New users |
| **Yearly** | $39.99/yr | Save 33% compared to monthly | **MOST POPULAR** |
| **Lifetime** | $149.99 | Pay once, use forever - Best value! | Serious stackers |

### What's Included in Gold
- ✅ Unlimited holdings (free tier: 25 items max)
- ✅ Unlimited AI receipt scans (free tier: 5 scans)
- ✅ Unlimited spreadsheet imports (free tier: counted as 1 scan)
- ✅ Cloud backup & sync
- ✅ Advanced analytics

### Technical Details
- Updated in: `mobile-app/src/components/GoldPaywall.js` (line 295)
- **Note**: RevenueCat dashboard must also be updated manually to reflect new pricing

---

## 4. Receipt Scan Limits

### What Changed
- **Free Tier Limits**: 5 scans total (photos OR spreadsheets)
- **Gold Tier**: Unlimited scans
- **Usage Tracking**: Scan count persisted in AsyncStorage
- **Clear Messaging**: Shows remaining scans in UI

### How It Works

#### Free Tier
- 5 total scans included
- **Each photo scan = 1 scan**
- **Each spreadsheet import = 1 scan** (regardless of how many rows)
- Scan counter shown in Add/Edit modal
- When limit reached, shows upgrade prompt

#### Gold Tier
- Unlimited scans
- No tracking needed
- UI shows: "✓ Unlimited scans with Gold"

### Scan Count Display
- **Add/Edit Modal** (under AI Receipt Scanner):
  - Free tier: "Scans used: 3/5"
  - Limit reached: "Scan limit reached. Upgrade to Gold for unlimited!"
  - Gold tier: "✓ Unlimited scans with Gold"

### Technical Details
- **State**: `mobile-app/App.js` (line 203-204)
  ```javascript
  const [scanCount, setScanCount] = useState(0);
  const FREE_SCAN_LIMIT = 5;
  ```

- **Persistence**: AsyncStorage key `stack_scan_count`

- **Check Before Scan**: Lines 463-479
  ```javascript
  const checkScanLimit = () => {
    if (hasGold) return true; // Gold tier bypass

    if (scanCount >= FREE_SCAN_LIMIT) {
      Alert.alert(
        'Scan Limit Reached',
        'Free tier includes 5 scans...',
        [
          { text: 'Maybe Later', style: 'cancel' },
          { text: 'Upgrade to Gold', onPress: () => setShowPaywallModal(true) }
        ]
      );
      return false;
    }
    return true;
  };
  ```

- **Increment on Use**: Lines 452-456
  - Called in `scanReceipt()` (line 635)
  - Called in `importSpreadsheet()` (line 778)

### User Experience
- Always know how many scans remaining
- Clear upgrade path when limit reached
- Fair usage: 1 spreadsheet = 1 scan (even if it has 100 rows)
- No hidden limits or surprises

---

## 5. Updated Free Tier Features

### Free Tier Includes
| Feature | Limit | Notes |
|---|---|---|
| Holdings | 25 items max | Mix of silver and gold |
| Receipt Scans | 5 scans | Photos OR spreadsheets |
| Spreadsheet Import | Counts as 1 scan | Even if 100+ rows |
| Manual Entry | Unlimited | No limit on manual adds |
| Cloud Backup | ✅ Available | Export/restore anytime |
| Live Spot Prices | ✅ Available | 15-minute refresh |
| Analytics | ✅ Basic | Dashboard, charts, stats |

### Gold Tier Includes
| Feature | Limit |
|---|---|
| Holdings | ✅ Unlimited |
| Receipt Scans | ✅ Unlimited |
| Spreadsheet Import | ✅ Unlimited |
| Cloud Backup | ✅ Enhanced |
| Advanced Analytics | ✅ Yes |

---

## User-Facing Copy Updates

### Tutorial (First Launch)
- **Screen 1**: "Track Your Stack" - Your data stays on YOUR device. 100% private.
- **Screen 2**: "Scan Receipts with AI" - Just snap a photo and let Claude AI extract all the details automatically.
- **Screen 3**: "Go Gold for Unlimited" - Free tier: 25 items, 5 scans. Gold tier: unlimited items, unlimited scanning, cloud backup.

### Paywall Screen
- **Title**: "Upgrade to Gold"
- **Subtitle**: "Unlock unlimited precious metals tracking"

**Features Listed**:
- ∞ Unlimited gold & silver items
- 📷 AI receipt scanning (unlimited)
- 📊 Advanced analytics
- 📥 Cloud backup & sync

**Pricing Display**:
- Monthly: $4.99/mo - "Perfect for trying out Gold tier"
- Yearly: $39.99/yr - "Save 33% compared to monthly" [MOST POPULAR]
- Lifetime: $149.99 - "Pay once, use forever - Best value!"

**Coming Soon Message** (if offerings not loaded):
"Gold memberships are being activated. Your developer account is being set up with Apple and Google. Try again in 24 hours, or leave your email to be notified when it's ready!"

---

## Testing Instructions

### Test Multi-Item Receipt Scanning
1. Find a receipt with multiple precious metals items (or create a test image)
2. Open app → Holdings → "+ Add Purchase"
3. Tap "Scan from Gallery"
4. Select the multi-item receipt
5. **Expected**: Message shows "Found X items: Y Silver, Z Gold"
6. **Expected**: All items added to holdings automatically
7. **Expected**: Metal tab switches to "both" if mixed metals

### Test Spreadsheet Import
1. Create a CSV file with columns: Product Name, Metal Type, Quantity, Unit Price, OZT
2. Add 10-20 test items (mix of silver and gold)
3. Open app → Holdings → "Import from Spreadsheet"
4. Select the CSV file
5. **Expected**: Preview modal shows first 10 items
6. Tap "Import X Items"
7. **Expected**: Success message shows count breakdown
8. **Expected**: All items appear in holdings

### Test Scan Limits
1. Use a fresh install or reset scan count (delete AsyncStorage key)
2. Scan 4 receipts → should show "Scans used: 4/5"
3. Scan 5th receipt → should show "Scans used: 5/5"
4. Try to scan 6th receipt → **Expected**: Alert "Scan Limit Reached"
5. **Expected**: Offered to upgrade to Gold
6. Upgrade to Gold → **Expected**: Shows "✓ Unlimited scans with Gold"

### Test Pricing Display
1. Open app → Holdings → "+ Add Purchase" (when not Gold)
2. Scroll to see paywall trigger (add 26+ items)
3. **Expected**: Paywall shows $149.99 for Lifetime
4. **Expected**: Description says "Pay once, use forever - Best value!"

---

## Migration Notes

### For Existing Users
- **No data loss**: All existing holdings preserved
- **Scan count starts at 0**: Existing users get 5 free scans
- **No pricing changes for current subscribers**: Only affects new purchases
- **Multi-item scanning**: Works automatically on next receipt scan

### For Developers
- **Backend Changes**: Deploy updated `server.js` with new receipt scanning prompt
- **Mobile App**: Deploy updated app with new features
- **RevenueCat**: Manually update Lifetime pricing in RevenueCat dashboard to $149.99
- **Dependencies**: New dependency `xlsx` added to mobile-app package.json

---

## API Changes

### Receipt Scanning Endpoint (`POST /api/scan-receipt`)

**Previous Response**:
```json
{
  "success": true,
  "dealer": "APMEX",
  "purchaseDate": "2025-12-25",
  "metal": "silver",
  "description": "American Silver Eagle",
  "quantity": 10,
  "ozt": 1,
  "unitPrice": 35.50
}
```

**New Response**:
```json
{
  "success": true,
  "dealer": "APMEX",
  "purchaseDate": "2025-12-25",
  "items": [
    {
      "metal": "silver",
      "description": "American Silver Eagle",
      "quantity": 10,
      "ozt": 1,
      "unitPrice": 35.50
    },
    {
      "metal": "gold",
      "description": "1oz Gold Bar",
      "quantity": 1,
      "ozt": 1,
      "unitPrice": 2400
    }
  ],
  "itemCount": 2,
  "privacyNote": "Image processed in memory and immediately discarded"
}
```

**Breaking Change**: Yes, but mobile app handles both formats gracefully

---

## Known Limitations

1. **Spreadsheet Import**:
   - Only processes first sheet in multi-sheet workbooks
   - Requires "Product Name" and "Metal Type" columns
   - Skips rows with missing essential data
   - Metal type must contain "gold" or "silver" (case-insensitive)

2. **Receipt Scanning**:
   - Accuracy depends on receipt quality/format
   - May not extract all fields from unusual receipt formats
   - Currently supports English text only

3. **Scan Limit**:
   - No way to reset scan count without reinstalling app
   - Scan count tied to device, not account (local-only app)

---

## Future Enhancements

1. **Spreadsheet Export**: Export holdings to CSV/Excel format
2. **Template Download**: Provide example spreadsheet template for import
3. **Multi-Sheet Support**: Import from specific sheet in workbook
4. **Scan Count Reset**: Allow manual reset once per month
5. **Receipt History**: Keep history of scanned receipts (opt-in)

---

## Support

### User Questions

**Q: Why does a spreadsheet with 100 rows only count as 1 scan?**
A: We believe this is fair usage. You're using AI once to process the file, so it counts as one scan - regardless of how many items are in it.

**Q: Can I reset my scan count?**
A: Currently no. The scan count is tied to your device. If you upgrade to Gold, you get unlimited scans.

**Q: What if my receipt has 10 items but AI only finds 8?**
A: You can manually add the missing 2 items. AI scanning is a convenience feature - you can always add items manually.

**Q: Why did Lifetime price increase?**
A: The app now includes significantly more features (multi-item scanning, spreadsheet import, unlimited scans for Gold). The $149.99 lifetime price better reflects the value provided.

**Q: Do scan limits apply to manual entry?**
A: No! Manual entry is always unlimited, even on free tier. Scan limits only apply to AI-powered receipt scanning and spreadsheet imports.

---

## Changelog

### Version 1.1.0 (2025-12-27)

**Added**:
- Multi-item receipt scanning with Claude AI
- Spreadsheet import feature (CSV, Excel)
- Receipt scan limits (5 free, unlimited Gold)
- Scan count display in UI
- Import preview modal with confirmation

**Changed**:
- Lifetime Gold pricing: $29.99 → $79.99
- Improved paywall messaging
- Receipt scanner now processes all items on receipt

**Fixed**:
- Receipt scanning now handles mixed metal receipts
- Better error messages for scan limits

**Technical**:
- Added `xlsx` dependency
- Updated Claude Vision prompt for multi-item extraction
- Added AsyncStorage key `stack_scan_count` for usage tracking
