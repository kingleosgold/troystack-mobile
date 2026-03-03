/**
 * StackSignalIcon — sharp angular lightning bolt.
 * Used for Signal tab icon, Stack Signal section headers, and teasers.
 *
 * Props: size (default 24), color (default '#D4A843')
 */

import React from 'react';
import Svg, { Path } from 'react-native-svg';

const StackSignalIcon = ({ size = 24, color = '#D4A843' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path
      d="M13 2L4.5 12.5H11L10 22L19.5 11.5H13L13 2Z"
      fill={color}
    />
  </Svg>
);

export default StackSignalIcon;
