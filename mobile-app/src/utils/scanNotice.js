/**
 * TroyStack - Where a receipt photo goes, said before it's sent
 *
 * Every receipt scan picker shows this line before the camera or library
 * opens. The troystack://scan link opens the camera straight from the
 * widget and doesn't show it yet.
 */

export const SCAN_AI_NOTE = "Your photo is read by a third-party AI service. TroyStack doesn't keep it.";

// Message for the "Scan Receipt" source picker.
export const SCAN_SOURCE_MESSAGE = `Choose a source.\n\n${SCAN_AI_NOTE}`;
