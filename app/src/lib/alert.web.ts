import type { AlertButton } from 'react-native';

/**
 * react-native-web implements Alert.alert as an empty function, so on the web
 * every alert and confirmation silently did nothing. Use the browser's dialogs:
 * a plain notice becomes window.alert, a choice becomes window.confirm
 * (OK runs the first non-cancel button).
 */
export function showAlert(title: string, message?: string, buttons?: AlertButton[]) {
  const text = message ? `${title}\n\n${message}` : title;
  const actions = (buttons ?? []).filter((b) => b.style !== 'cancel');
  const cancel = (buttons ?? []).find((b) => b.style === 'cancel');
  if (actions.length === 0 || !buttons || buttons.length < 2) {
    window.alert(text);
    actions[0]?.onPress?.();
    return;
  }
  if (window.confirm(text)) actions[0].onPress?.();
  else cancel?.onPress?.();
}
