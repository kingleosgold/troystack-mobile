import React from 'react';
import { View, Text } from 'react-native';
import Svg, { Path, Circle } from 'react-native-svg';

const PieChart = ({ data, size = 150, cardBgColor, textColor, mutedColor }) => {
  const total = data.reduce((sum, item) => sum + item.value, 0);
  if (total === 0) return null;

  // Filter out 0-value segments and calculate percentages
  const nonZeroSegments = data.filter((item) => item.value > 0);

  // Calculate percentages for legend (all items)
  const allSegments = data.map((item) => ({
    ...item,
    percentage: total > 0 ? item.value / total : 0,
  }));

  const cx = size / 2;
  const cy = size / 2;
  const outerR = size / 2;
  const innerR = size * 0.3; // donut hole

  // Build SVG arc paths for each segment
  const polarToCartesian = (centerX, centerY, radius, angleDeg) => {
    const angleRad = ((angleDeg - 90) * Math.PI) / 180;
    return {
      x: centerX + radius * Math.cos(angleRad),
      y: centerY + radius * Math.sin(angleRad),
    };
  };

  const arcPath = (startAngle, endAngle) => {
    const outerStart = polarToCartesian(cx, cy, outerR, endAngle);
    const outerEnd = polarToCartesian(cx, cy, outerR, startAngle);
    const innerStart = polarToCartesian(cx, cy, innerR, endAngle);
    const innerEnd = polarToCartesian(cx, cy, innerR, startAngle);
    const largeArc = endAngle - startAngle > 180 ? 1 : 0;
    return [
      `M ${outerStart.x} ${outerStart.y}`,
      `A ${outerR} ${outerR} 0 ${largeArc} 0 ${outerEnd.x} ${outerEnd.y}`,
      `L ${innerEnd.x} ${innerEnd.y}`,
      `A ${innerR} ${innerR} 0 ${largeArc} 1 ${innerStart.x} ${innerStart.y}`,
      'Z',
    ].join(' ');
  };

  let currentAngle = 0;
  const segments = nonZeroSegments.map((item) => {
    const sweep = (item.value / total) * 360;
    const startAngle = currentAngle;
    currentAngle += sweep;
    return { ...item, startAngle, sweep };
  });

  return (
    <View style={{ alignItems: 'center' }}>
      <View style={{ width: size, height: size }}>
        <Svg width={size} height={size}>
          {segments.length === 1 ? (
            <>
              <Circle cx={cx} cy={cy} r={outerR} fill={segments[0].color} />
              <Circle cx={cx} cy={cy} r={innerR} fill={cardBgColor || '#1a1a2e'} />
            </>
          ) : (
            segments.map((seg, i) => (
              <Path key={i} d={arcPath(seg.startAngle, seg.startAngle + seg.sweep)} fill={seg.color} />
            ))
          )}
        </Svg>
        <View style={{
          position: 'absolute',
          top: 0, left: 0, right: 0, bottom: 0,
          justifyContent: 'center',
          alignItems: 'center',
        }}>
          <Text style={{ color: textColor || '#fff', fontWeight: '700', fontSize: 14 }}>
            ${(total / 1000).toFixed(1)}k
          </Text>
        </View>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', marginTop: 12, gap: 16 }}>
        {allSegments.map((seg, index) => (
          <View key={index} style={{ flexDirection: 'row', alignItems: 'center' }}>
            <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: seg.color, marginRight: 6 }} />
            <Text style={{ color: mutedColor || '#a1a1aa', fontSize: 12 }}>{seg.label} {(seg.percentage * 100).toFixed(0)}%</Text>
          </View>
        ))}
      </View>
    </View>
  );
};

export default PieChart;
