import { Platform } from 'react-native';

/**
 * Whether the main input is a finger (phones, tablets, the native apps) rather than a mouse.
 * Touch screens get gestures (swipes, double-tap); mouse screens get hover actions instead.
 */
export const isTouchScreen: boolean = Platform.OS !== 'web'
  || (typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: coarse)').matches);
