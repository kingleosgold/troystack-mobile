/**
 * TroyCoinIcon — realistic gold coin with radial gradient, reeded edge, and embossed T.
 * Used as Troy's icon everywhere: FAB (size=56), section headers (size=20), chat (size=24).
 *
 * Layer order (bottom to top):
 *   1. Main circle with radial gradient (#F5D780 → #A07C28)
 *   2. Dark ridge channel — solid stroke for tick contrast (#6B4E1B)
 *   3. Reeded edge — radial tick marks (#9A7B2D)
 *   4. Outer rim stroke (#8B6914)
 *   5. Embossed T with shadow
 *
 * Color spec is unified across mobile (react-native-svg) and web (inline SVG).
 */

import React from 'react';
import { View, Text, Platform } from 'react-native';
import Svg, { Circle, Path, Defs, RadialGradient, Stop } from 'react-native-svg';

const TroyCoinIcon = ({ size = 20 }) => {
  const half = size / 2;
  const fontSize = size * 0.6;
  const rimWidth = 1.5;
  // Radii scaled relative to size
  const bodyR = half - rimWidth;         // gradient fill
  const rimR = half - rimWidth / 2;      // outer rim stroke
  const reedR = half - rimWidth * 1.5;   // center radius of reeded edge
  const tickLen = rimWidth * 0.9;        // radial length of each ridge tick

  // Build reeded edge as explicit radial tick marks — no seam issues
  const tickCount = Math.max(24, Math.round(2 * Math.PI * reedR / 2));
  let reedPath = '';
  for (let i = 0; i < tickCount; i++) {
    const angle = (i / tickCount) * 2 * Math.PI;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const x1 = half + (reedR - tickLen / 2) * cos;
    const y1 = half + (reedR - tickLen / 2) * sin;
    const x2 = half + (reedR + tickLen / 2) * cos;
    const y2 = half + (reedR + tickLen / 2) * sin;
    reedPath += `M${x1.toFixed(2)},${y1.toFixed(2)}L${x2.toFixed(2)},${y2.toFixed(2)}`;
  }

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <Defs>
          <RadialGradient id={`troyCoinGrad_${size}`} cx="45%" cy="40%" rx="50%" ry="50%">
            <Stop offset="0" stopColor="#F5D780" />
            <Stop offset="1" stopColor="#A07C28" />
          </RadialGradient>
        </Defs>
        {/* 1. Coin body — radial gradient fill */}
        <Circle cx={half} cy={half} r={bodyR} fill={`url(#troyCoinGrad_${size})`} />
        {/* 2. Dark ridge channel — gives reeded ticks contrast against gradient */}
        <Circle cx={half} cy={half} r={reedR} fill="none" stroke="#6B4E1B" strokeWidth={3} />
        {/* 3. Reeded edge — radial ticks on top of dark channel */}
        <Path d={reedPath} stroke="#9A7B2D" strokeWidth={0.8} strokeLinecap="butt" />
        {/* 4. Outer rim stroke */}
        <Circle cx={half} cy={half} r={rimR} fill="none" stroke="#8B6914" strokeWidth={rimWidth} />
      </Svg>
      {/* 4. Embossed T with shadow */}
      <Text style={{
        position: 'absolute',
        paddingLeft: size * 0.04,
        fontSize,
        fontWeight: '700',
        fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
        color: '#7A5C1F',
        textShadowColor: 'rgba(255, 224, 160, 0.5)',
        textShadowOffset: { width: 0, height: 0.5 },
        textShadowRadius: 0,
        includeFontPadding: false,
        textAlignVertical: 'center',
      }}>T</Text>
    </View>
  );
};

export default TroyCoinIcon;
