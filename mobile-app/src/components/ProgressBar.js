import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

const ProgressBar = ({ value, max, color, label }) => {
  const percentage = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.percentage}>{percentage.toFixed(0)}%</Text>
      </View>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${percentage}%`, backgroundColor: color }]} />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { marginBottom: 12 },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  label: { color: '#a1a1aa', fontSize: 12 },
  percentage: { color: '#fff', fontSize: 12, fontWeight: '600' },
  track: { height: 8, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 4 },
  fill: { height: 8, borderRadius: 4 },
});

export default ProgressBar;
