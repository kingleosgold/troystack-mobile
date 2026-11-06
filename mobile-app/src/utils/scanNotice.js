/**
 * TroyStack - Where a receipt photo goes, said before it's sent
 *
 * Every receipt scan picker shows this line before the camera or library
 * opens, the widget's troystack://scan link included.
 */

export const SCAN_AI_NOTE = "Your photo is read by a third-party AI service. TroyStack doesn't keep it.";

// Message for the "Scan Receipt" source picker.
export const SCAN_SOURCE_MESSAGE = `Choose a source.\n\n${SCAN_AI_NOTE}`;

// The buttons every Scan Receipt picker shows, main action first: Take
// Photo, Choose from Library and Cancel. onScan gets 'camera' or 'gallery'
// on a tap, so nothing scans until one. Pass the result through
// fitAlertButtons for Android's slots.
export const scanPickerButtons = (onScan) => [
  { text: 'Take Photo', onPress: () => onScan('camera') },
  { text: 'Choose from Library', onPress: () => onScan('gallery') },
  { text: 'Cancel', style: 'cancel' },
];
