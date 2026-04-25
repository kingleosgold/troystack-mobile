import React from 'react';
import { View, Text, TextInput, Keyboard, StyleSheet } from 'react-native';

const FloatingInput = ({ label, value, onChangeText, placeholder, keyboardType, prefix, editable = true, colors, isDarkMode, scaledFonts, required, error }) => {
  // Default colors for backwards compatibility
  const labelColor = colors ? colors.muted : '#a1a1aa';
  const inputBg = colors ? (isDarkMode ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.05)') : 'rgba(0,0,0,0.3)';
  const borderColor = error ? '#EF4444' : (colors ? colors.border : 'rgba(255,255,255,0.1)');
  const textColor = colors ? colors.text : '#fff';
  const prefixColor = colors ? colors.muted : '#71717a';
  const disabledBg = colors ? (isDarkMode ? 'rgba(0,0,0,0.5)' : 'rgba(0,0,0,0.1)') : 'rgba(0,0,0,0.5)';

  // Font sizes - use scaledFonts if provided, otherwise defaults
  const labelFontSize = scaledFonts ? scaledFonts.small : 12;
  const inputFontSize = scaledFonts ? scaledFonts.normal : 14;
  const prefixFontSize = scaledFonts ? scaledFonts.normal : 14;

  return (
    <View style={styles.floatingContainer}>
      <Text style={[styles.floatingLabel, { color: labelColor, fontSize: labelFontSize }]}>
        {label}{required && <Text style={{ color: '#EF4444' }}> *</Text>}
      </Text>
      <View style={[styles.inputRow, { backgroundColor: inputBg, borderColor: borderColor }, !editable && { backgroundColor: disabledBg }]}>
        {prefix && <Text style={[styles.inputPrefix, { color: prefixColor, fontSize: prefixFontSize }]}>{prefix}</Text>}
        <TextInput
          style={[styles.floatingInput, { color: textColor, fontSize: inputFontSize }, prefix && { paddingLeft: 4 }]}
          placeholder={placeholder}
          placeholderTextColor={colors ? colors.muted : '#52525b'}
          keyboardType={keyboardType || 'default'}
          value={value}
          onChangeText={onChangeText}
          editable={editable}
          returnKeyType="done"
          onSubmitEditing={Keyboard.dismiss}
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  floatingContainer: { marginBottom: 12 },
  floatingLabel: { color: '#a1a1aa', fontSize: 12, marginBottom: 6, fontWeight: '500' },
  inputRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.3)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', borderRadius: 10, paddingHorizontal: 12 },
  floatingInput: { flex: 1, padding: 12, paddingLeft: 0, color: '#fff', fontSize: 14 },
  inputPrefix: { color: '#71717a', fontSize: 14, marginRight: 2 },
});

export default FloatingInput;
