import { Platform } from 'react-native';
import Constants from 'expo-constants';

// Development: the Flask server runs on the same machine as Metro. On a phone,
// reach it through the address Expo is already serving from (no hardcoded LAN IP).
const devHost = Constants.expoConfig?.hostUri?.split(':')[0] ?? 'localhost';
const DEV_URL = Platform.OS === 'web' ? 'http://localhost:5000' : `http://${devHost}:5000`;

// Production: the web build is served by the same server (same origin). Native
// builds get the server address at build time (see `env` in eas.json).
const PROD_URL = Platform.OS === 'web' ? '' : (process.env.EXPO_PUBLIC_SERVER_URL ?? '');

export const SERVER_URL = __DEV__ ? DEV_URL : PROD_URL;
