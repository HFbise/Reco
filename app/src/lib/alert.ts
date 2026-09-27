import { Alert, type AlertButton } from 'react-native';

/** Native: the platform dialog. (react-native-web's Alert.alert is a no-op, see alert.web.ts.) */
export function showAlert(title: string, message?: string, buttons?: AlertButton[]) {
  Alert.alert(title, message, buttons);
}
