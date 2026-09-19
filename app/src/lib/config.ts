import { Platform } from 'react-native';

// web 端用 localhost，手机/模拟器用局域网 IP
const DEV_URL = Platform.OS === 'web'
  ? 'http://localhost:5000'
  : 'http://192.168.86.27:5000';

const PROD_URL = Platform.OS === 'web' ? '' : 'https://chat-5wg8.onrender.com';

export const SERVER_URL = __DEV__ ? DEV_URL : PROD_URL;
