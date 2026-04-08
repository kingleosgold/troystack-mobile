import SwiftUI
import WidgetKit

// MARK: - Design Constants

let wBgColor = Color(hex: "#0A0A0E")
let wGold = Color(hex: "#DAA520")
let wGreen = Color(hex: "#4ADE80")
let wRed = Color(hex: "#EF4444")
let wMuted = Color(hex: "#71717a")
let wSilver = Color(hex: "#C0C0C0")
let wPlatinum = Color(hex: "#7DD3FC")
let wPalladium = Color(hex: "#4ADE80")

// MARK: - Pure formatting functions

func wChangeColor(_ val: Double) -> Color {
    return val >= 0 ? wGreen : wRed
}

func wFormatCurrency(_ val: Double) -> String {
    let f = NumberFormatter()
    f.numberStyle = .currency
    f.maximumFractionDigits = 0
    return f.string(from: NSNumber(value: val)) ?? "$0"
}

func wFormatSpot(_ val: Double) -> String {
    let f = NumberFormatter()
    f.numberStyle = .currency
    f.minimumFractionDigits = 2
    f.maximumFractionDigits = 2
    return f.string(from: NSNumber(value: val)) ?? "$0.00"
}

func wFormatChange(_ val: Double) -> String {
    let prefix = val >= 0 ? "+" : ""
    let f = NumberFormatter()
    f.numberStyle = .currency
    f.maximumFractionDigits = 0
    return prefix + (f.string(from: NSNumber(value: val)) ?? "$0")
}

func wFormatPct(_ val: Double) -> String {
    let prefix = val >= 0 ? "+" : ""
    return "\(prefix)\(String(format: "%.1f", val))%"
}

func wPrivacy(_ text: String, _ hide: Bool) -> String {
    return hide ? "••••••" : text
}

/// Format today's date as "Mon, Apr 7"
func wFormattedDate() -> String {
    let f = DateFormatter()
    f.dateFormat = "EEE, MMM d"
    return f.string(from: Date())
}

// MARK: - Sparkline Data Compression

/// Compress sparkline data to ~14 evenly spaced points.
/// If data has more than 14 points, sample every Nth to get 14.
func compressSparkline(_ data: [Double], targetCount: Int = 14) -> [Double] {
    guard data.count > targetCount else { return data }
    let step = Double(data.count - 1) / Double(targetCount - 1)
    return (0..<targetCount).map { i in
        let idx = Int(round(Double(i) * step))
        return data[min(idx, data.count - 1)]
    }
}

// MARK: - Catmull-Rom Smooth Sparkline Path Building

/// Normalize raw data points into CGPoints scaled to the given rect.
/// Uses tight 5% padding so small price moves look dramatic.
func normalizeSparklinePoints(data: [Double], width: CGFloat, height: CGFloat) -> [CGPoint] {
    guard data.count >= 2 else { return [] }
    let dataMin = data.min() ?? 0
    let dataMax = data.max() ?? 1
    let range = dataMax - dataMin
    let safeRange = range > 0 ? range : 1.0
    // 5% padding above and below — tight Y-axis
    let lo = dataMin - safeRange * 0.05
    let hi = dataMax + safeRange * 0.05
    let totalRange = hi - lo
    return data.enumerated().map { i, val in
        let x = width * CGFloat(i) / CGFloat(data.count - 1)
        let y = height * (1 - CGFloat((val - lo) / totalRange))
        return CGPoint(x: x, y: y)
    }
}

/// Y position of the opening price (first data point) for the reference line
func openingPriceY(data: [Double], height: CGFloat) -> CGFloat? {
    guard data.count >= 2 else { return nil }
    let dataMin = data.min() ?? 0
    let dataMax = data.max() ?? 1
    let range = dataMax - dataMin
    let safeRange = range > 0 ? range : 1.0
    let lo = dataMin - safeRange * 0.05
    let hi = dataMax + safeRange * 0.05
    let totalRange = hi - lo
    return height * (1 - CGFloat((data[0] - lo) / totalRange))
}

/// Add a Catmull-Rom spline through the given points to a Path
func addSmoothCurve(to path: inout Path, points: [CGPoint]) {
    guard points.count > 1 else { return }

    if points.count == 2 {
        path.addLine(to: points[1])
        return
    }

    for i in 1..<points.count {
        let p0 = points[max(i - 2, 0)]
        let p1 = points[i - 1]
        let p2 = points[i]
        let p3 = points[min(i + 1, points.count - 1)]

        let tension: CGFloat = 0.3

        let cp1 = CGPoint(
            x: p1.x + (p2.x - p0.x) * tension,
            y: p1.y + (p2.y - p0.y) * tension
        )
        let cp2 = CGPoint(
            x: p2.x - (p3.x - p1.x) * tension,
            y: p2.y - (p3.y - p1.y) * tension
        )

        path.addCurve(to: p2, control1: cp1, control2: cp2)
    }
}

/// Build a smooth sparkline stroke path
func buildSmoothSparklinePath(points: [CGPoint]) -> Path {
    var p = Path()
    guard points.count >= 2 else { return p }
    p.move(to: points[0])
    addSmoothCurve(to: &p, points: points)
    return p
}

/// Build a smooth sparkline fill path (closed at bottom)
func buildSmoothSparklineFill(points: [CGPoint], height: CGFloat) -> Path {
    var p = Path()
    guard points.count >= 2 else { return p }
    p.move(to: CGPoint(x: points[0].x, y: height))
    p.addLine(to: points[0])
    addSmoothCurve(to: &p, points: points)
    p.addLine(to: CGPoint(x: points[points.count - 1].x, y: height))
    p.closeSubpath()
    return p
}

// MARK: - SmoothSparkline View

struct SmoothSparkline: View {
    let data: [Double]
    let color: Color
    let lineWidth: CGFloat
    let showGradient: Bool
    let showReferenceLine: Bool

    init(data: [Double], color: Color, lineWidth: CGFloat = 1.5, showGradient: Bool = false, showReferenceLine: Bool = true) {
        self.data = compressSparkline(data)
        self.color = color
        self.lineWidth = lineWidth
        self.showGradient = showGradient
        self.showReferenceLine = showReferenceLine
    }

    var body: some View {
        GeometryReader { geo in
            let w = geo.size.width
            let h = geo.size.height
            let points = normalizeSparklinePoints(data: data, width: w, height: h)

            if points.count >= 2 {
                ZStack {
                    // Dotted reference line at opening price
                    if showReferenceLine, let refY = openingPriceY(data: data, height: h) {
                        Path { path in
                            path.move(to: CGPoint(x: 0, y: refY))
                            path.addLine(to: CGPoint(x: w, y: refY))
                        }
                        .stroke(
                            Color.white.opacity(0.2),
                            style: StrokeStyle(lineWidth: 0.5, dash: [2, 4])
                        )
                    }

                    // Gradient fill below the line
                    if showGradient {
                        buildSmoothSparklineFill(points: points, height: h)
                            .fill(
                                LinearGradient(
                                    gradient: Gradient(colors: [color.opacity(0.3), color.opacity(0.0)]),
                                    startPoint: .top,
                                    endPoint: .bottom
                                )
                            )
                    }

                    // The smooth line
                    buildSmoothSparklinePath(points: points)
                        .stroke(color, style: StrokeStyle(lineWidth: lineWidth, lineCap: .round, lineJoin: .round))
                }
            }
        }
    }
}

// MARK: - Date Label

struct WidgetDateLabel: View {
    var body: some View {
        Text(wFormattedDate())
            .font(.system(size: 11, weight: .medium))
            .foregroundColor(.white.opacity(0.5))
    }
}

// MARK: - Reusable Text Components

struct WBoldCurrencyText: View {
    let text: String
    let size: CGFloat

    var body: some View {
        Text(text)
            .font(.system(size: size, weight: .bold))
            .foregroundColor(.white)
            .minimumScaleFactor(0.5)
            .lineLimit(1)
    }
}

// MARK: - DailyChangeRow

struct DailyChangeRow: View {
    let amount: Double
    let percent: Double
    let hideValues: Bool
    let arrowSize: CGFloat
    let amountSize: CGFloat
    let pctSize: CGFloat
    var marketsClosed: Bool = false

    var body: some View {
        if marketsClosed {
            Text("Markets Closed")
                .font(.system(size: amountSize, weight: .medium))
                .foregroundColor(wMuted)
                .lineLimit(1)
        } else {
            HStack(spacing: 3) {
                Text(amount >= 0 ? "▲" : "▼")
                    .font(.system(size: arrowSize, weight: .bold))
                    .foregroundColor(wChangeColor(amount))
                Text(wPrivacy(wFormatChange(amount), hideValues))
                    .font(.system(size: amountSize, weight: .semibold))
                    .foregroundColor(wChangeColor(amount))
                Text("(" + wFormatPct(percent) + ")")
                    .font(.system(size: pctSize))
                    .foregroundColor(wChangeColor(amount))
            }
            .lineLimit(1)
            .minimumScaleFactor(0.7)
        }
    }
}

// MARK: - Separator

struct WidgetDivider: View {
    var body: some View {
        Rectangle()
            .fill(Color.white.opacity(0.1))
            .frame(height: 0.5)
    }
}

// MARK: - LockedViews

struct LockedSmallView: View {
    var body: some View {
        VStack(spacing: 4) {
            Spacer()
            Text("Upgrade to Gold")
                .font(.system(size: 14, weight: .semibold))
                .foregroundColor(wGold)
            Text("for widget access")
                .font(.system(size: 11))
                .foregroundColor(wMuted)
            Spacer()
        }
        .frame(maxWidth: .infinity)
    }
}

struct LockedLargeView: View {
    let titleSize: CGFloat
    let subtitleSize: CGFloat

    var body: some View {
        VStack(spacing: 8) {
            Image(systemName: "lock.fill")
                .font(.system(size: 32))
                .foregroundColor(wMuted)
            Spacer()
            Text("Upgrade to Gold")
                .font(.system(size: titleSize, weight: .semibold))
                .foregroundColor(wGold)
            Text("Get stack widgets on your home screen")
                .font(.system(size: subtitleSize))
                .foregroundColor(wMuted)
                .multilineTextAlignment(.center)
            Spacer()
        }
        .frame(maxWidth: .infinity)
        .padding()
    }
}

// MARK: - Metal Row (Stocks-style: label | sparkline | gap | price + change)
// Fixed-width columns so all rows align vertically.

struct MetalStocksRow: View {
    let symbol: String
    let fullName: String
    let price: Double
    let changePct: Double
    let changeAmt: Double
    let sparkline: [Double]
    let dotColor: Color
    var marketsClosed: Bool = false
    var rowHeight: CGFloat = 36

    var body: some View {
        GeometryReader { geo in
            let totalW = geo.size.width
            let labelW: CGFloat = 100
            let priceW: CGFloat = 110
            let gap: CGFloat = 12
            let sparkW = max(totalW - labelW - priceW - gap, 40)

            HStack(spacing: 0) {
                // Left: colored dot + full name (symbol)
                HStack(spacing: 4) {
                    Circle()
                        .fill(dotColor)
                        .frame(width: 6, height: 6)
                    Text("\(fullName) (\(symbol))")
                        .font(.system(size: 11, weight: .bold))
                        .foregroundColor(.white.opacity(0.7))
                        .lineLimit(1)
                }
                .frame(width: labelW, alignment: .leading)

                // Center: sparkline (fixed width)
                if sparkline.count >= 2 {
                    SmoothSparkline(
                        data: sparkline,
                        color: marketsClosed ? wMuted : wChangeColor(changeAmt),
                        lineWidth: 1.0,
                        showGradient: false
                    )
                    .frame(width: sparkW, height: 20)
                } else {
                    Spacer()
                        .frame(width: sparkW)
                }

                // Gap
                Spacer()
                    .frame(width: gap)

                // Right: price + change (fixed width, right-aligned)
                HStack(spacing: 4) {
                    Text(wFormatSpot(price))
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundColor(.white)
                        .lineLimit(1)
                        .minimumScaleFactor(0.7)

                    if marketsClosed {
                        Text("Closed")
                            .font(.system(size: 12, weight: .medium))
                            .foregroundColor(wMuted)
                    } else {
                        Text(wFormatPct(changePct))
                            .font(.system(size: 12, weight: .medium))
                            .foregroundColor(wChangeColor(changeAmt))
                    }
                }
                .frame(width: priceW, alignment: .trailing)
            }
            .frame(height: geo.size.height)
        }
        .frame(height: rowHeight)
    }
}

// MARK: - Troy Action Widget View (Ask Troy)

struct TroyActionWidgetView: View {
    var body: some View {
        VStack(spacing: 0) {
            // Top: Troy icon + "Ask Troy" — opens chat
            Link(destination: URL(string: "troystack://chat")!) {
                HStack(spacing: 8) {
                    Image("TroyIcon")
                        .resizable()
                        .aspectRatio(contentMode: .fill)
                        .frame(width: 24, height: 24)
                        .clipShape(Circle())
                    Text("Ask Troy")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundColor(.white)
                    Spacer()
                }
                .padding(.horizontal, 14)
                .padding(.top, 16)
                .padding(.bottom, 8)
            }

            Spacer()

            // Bottom: two action buttons
            HStack(spacing: 8) {
                // Scan button
                Link(destination: URL(string: "troystack://scan")!) {
                    VStack(spacing: 4) {
                        Image(systemName: "camera.fill")
                            .font(.system(size: 16))
                            .foregroundColor(.white)
                        Text("Scan")
                            .font(.system(size: 11, weight: .medium))
                            .foregroundColor(.white.opacity(0.7))
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 10)
                    .background(Color.white.opacity(0.08))
                    .cornerRadius(10)
                }

                // Voice button
                Link(destination: URL(string: "troystack://voice")!) {
                    VStack(spacing: 4) {
                        Image(systemName: "mic.fill")
                            .font(.system(size: 16))
                            .foregroundColor(.white)
                        Text("Voice")
                            .font(.system(size: 11, weight: .medium))
                            .foregroundColor(.white.opacity(0.7))
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 10)
                    .background(Color.white.opacity(0.08))
                    .cornerRadius(10)
                }
            }
            .padding(.horizontal, 12)
            .padding(.bottom, 12)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

// MARK: - Main Entry View

struct StackTrackerWidgetEntryView: View {
    @Environment(\.widgetFamily) var family
    var entry: WidgetEntry

    var body: some View {
        switch family {
        case .systemSmall:
            SmallWidgetView(data: entry.data)
        case .systemMedium:
            MediumWidgetView(data: entry.data)
        case .systemLarge:
            LargeWidgetView(data: entry.data)
        default:
            SmallWidgetView(data: entry.data)
        }
    }
}

// MARK: - Small Widget (2x2)
// Date + stack total + daily change + sparkline.

struct SmallWidgetView: View {
    let data: WidgetData

    var body: some View {
        if data.hasSubscription {
            SmallSubscribedView(data: data)
        } else {
            LockedSmallView()
        }
    }
}

struct SmallSubscribedView: View {
    let data: WidgetData

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            // Date
            WidgetDateLabel()
                .padding(.top, 20)
                .padding(.bottom, 2)

            // Stack value
            WBoldCurrencyText(
                text: wPrivacy(wFormatCurrency(data.portfolioValue), data.hideValues),
                size: 32
            )
            .padding(.bottom, 2)

            // Daily change
            DailyChangeRow(
                amount: data.dailyChangeAmount,
                percent: data.dailyChangePercent,
                hideValues: data.hideValues,
                arrowSize: 10, amountSize: 13, pctSize: 11,
                marketsClosed: data.marketsClosed
            )

            Spacer(minLength: 4)

            // Sparkline — bottom third, edge to edge, gradient fill
            let pts = data.portfolioSparkline()
            if pts.count >= 2 {
                SmoothSparkline(
                    data: pts,
                    color: data.marketsClosed ? wMuted : wChangeColor(data.dailyChangeAmount),
                    lineWidth: 1.5,
                    showGradient: true
                )
                .frame(maxHeight: 46)
            } else {
                Spacer(minLength: 16)
            }
        }
        .padding(.horizontal, 12)
        .padding(.bottom, 8)
    }
}

// MARK: - Medium Widget (4x2)
// Date + stack value hero + Au and Ag rows in Stocks-style layout.

struct MediumWidgetView: View {
    let data: WidgetData

    var body: some View {
        if data.hasSubscription {
            MediumSubscribedView(data: data)
        } else {
            LockedLargeView(titleSize: 16, subtitleSize: 12)
        }
    }
}

struct MediumSubscribedView: View {
    let data: WidgetData

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            // Date
            WidgetDateLabel()
                .padding(.top, 20)
                .padding(.bottom, 2)

            // Top row: stack value + daily change
            HStack(alignment: .firstTextBaseline) {
                WBoldCurrencyText(
                    text: wPrivacy(wFormatCurrency(data.portfolioValue), data.hideValues),
                    size: 28
                )
                Spacer(minLength: 8)
                DailyChangeRow(
                    amount: data.dailyChangeAmount,
                    percent: data.dailyChangePercent,
                    hideValues: data.hideValues,
                    arrowSize: 10, amountSize: 13, pctSize: 11,
                    marketsClosed: data.marketsClosed
                )
            }

            WidgetDivider()
                .padding(.vertical, 6)

            // Au row
            MetalStocksRow(
                symbol: "Au", fullName: "Gold",
                price: data.goldSpot,
                changePct: data.goldChangePercent,
                changeAmt: data.goldChangeAmount,
                sparkline: data.goldSparkline,
                dotColor: wGold,
                marketsClosed: data.marketsClosed
            )

            WidgetDivider()

            // Ag row
            MetalStocksRow(
                symbol: "Ag", fullName: "Silver",
                price: data.silverSpot,
                changePct: data.silverChangePercent,
                changeAmt: data.silverChangeAmount,
                sparkline: data.silverSparkline,
                dotColor: wSilver,
                marketsClosed: data.marketsClosed
            )

            Spacer(minLength: 2)
        }
        .padding(.horizontal, 12)
        .padding(.bottom, 6)
    }
}

// MARK: - Large Widget (4x4)
// Date + stack hero with sparkline + all 4 metals in Stocks rows + Au/Ag ratio.

struct LargeWidgetView: View {
    let data: WidgetData

    var body: some View {
        if data.hasSubscription {
            LargeSubscribedView(data: data)
        } else {
            LockedLargeView(titleSize: 18, subtitleSize: 13)
        }
    }
}

struct LargeSubscribedView: View {
    let data: WidgetData
    private let metalRowHeight: CGFloat = 46

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Spacer(minLength: 4)

            // Date
            WidgetDateLabel()
                .padding(.bottom, 4)

            // Hero section: stack value + change on same line
            HStack(alignment: .firstTextBaseline) {
                WBoldCurrencyText(
                    text: wPrivacy(wFormatCurrency(data.portfolioValue), data.hideValues),
                    size: 38
                )
                Spacer(minLength: 8)
                DailyChangeRow(
                    amount: data.dailyChangeAmount,
                    percent: data.dailyChangePercent,
                    hideValues: data.hideValues,
                    arrowSize: 10, amountSize: 13, pctSize: 11,
                    marketsClosed: data.marketsClosed
                )
            }

            // Portfolio sparkline — full width with gradient
            let pts = data.portfolioSparkline()
            if pts.count >= 2 {
                SmoothSparkline(
                    data: pts,
                    color: data.marketsClosed ? wMuted : wChangeColor(data.dailyChangeAmount),
                    lineWidth: 1.5,
                    showGradient: true
                )
                .frame(height: 50)
                .padding(.top, 10)
            }

            WidgetDivider()
                .padding(.top, 12)
                .padding(.bottom, 6)

            // Four metal rows — Stocks-style with dividers between
            MetalStocksRow(
                symbol: "Au", fullName: "Gold",
                price: data.goldSpot,
                changePct: data.goldChangePercent,
                changeAmt: data.goldChangeAmount,
                sparkline: data.goldSparkline,
                dotColor: wGold,
                marketsClosed: data.marketsClosed,
                rowHeight: metalRowHeight
            )
            WidgetDivider()
            MetalStocksRow(
                symbol: "Ag", fullName: "Silver",
                price: data.silverSpot,
                changePct: data.silverChangePercent,
                changeAmt: data.silverChangeAmount,
                sparkline: data.silverSparkline,
                dotColor: wSilver,
                marketsClosed: data.marketsClosed,
                rowHeight: metalRowHeight
            )
            WidgetDivider()
            MetalStocksRow(
                symbol: "Pt", fullName: "Platinum",
                price: data.platinumSpot,
                changePct: data.platinumChangePercent,
                changeAmt: data.platinumChangeAmount,
                sparkline: data.platinumSparkline,
                dotColor: wPlatinum,
                marketsClosed: data.marketsClosed,
                rowHeight: metalRowHeight
            )
            WidgetDivider()
            MetalStocksRow(
                symbol: "Pd", fullName: "Palladium",
                price: data.palladiumSpot,
                changePct: data.palladiumChangePercent,
                changeAmt: data.palladiumChangeAmount,
                sparkline: data.palladiumSparkline,
                dotColor: wPalladium,
                marketsClosed: data.marketsClosed,
                rowHeight: metalRowHeight
            )

            WidgetDivider()
                .padding(.top, 6)
                .padding(.bottom, 10)

            // Au/Ag ratio
            HStack {
                Text("Au/Ag Ratio:")
                    .font(.system(size: 13, weight: .medium))
                    .foregroundColor(wMuted)
                if data.silverSpot > 0 {
                    Text(String(format: "%.1f", data.goldSpot / data.silverSpot))
                        .font(.system(size: 13, weight: .bold))
                        .foregroundColor(.white)
                }
            }

            Spacer(minLength: 4)
        }
        .padding(.horizontal, 12)
        .padding(.top, 20)
        .padding(.bottom, 12)
    }
}

// MARK: - iOS 17 Availability Extensions

extension View {
    func widgetBackground(_ color: Color) -> some View {
        if #available(iOSApplicationExtension 17.0, *) {
            return containerBackground(color, for: .widget)
        } else {
            return background(color)
        }
    }
}

extension WidgetConfiguration {
    func contentMarginsDisabledIfAvailable() -> some WidgetConfiguration {
        if #available(iOSApplicationExtension 17.0, *) {
            return self.contentMarginsDisabled()
        } else {
            return self
        }
    }
}

// MARK: - Color Extension

extension Color {
    init(hex: String) {
        let hex = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
        var int: UInt64 = 0
        Scanner(string: hex).scanHexInt64(&int)
        let a, r, g, b: UInt64
        switch hex.count {
        case 3:
            (a, r, g, b) = (255, (int >> 8) * 17, (int >> 4 & 0xF) * 17, (int & 0xF) * 17)
        case 6:
            (a, r, g, b) = (255, int >> 16, int >> 8 & 0xFF, int & 0xFF)
        case 8:
            (a, r, g, b) = (int >> 24, int >> 16 & 0xFF, int >> 8 & 0xFF, int & 0xFF)
        default:
            (a, r, g, b) = (1, 1, 1, 0)
        }
        self.init(
            .sRGB,
            red: Double(r) / 255,
            green: Double(g) / 255,
            blue: Double(b) / 255,
            opacity: Double(a) / 255
        )
    }
}
