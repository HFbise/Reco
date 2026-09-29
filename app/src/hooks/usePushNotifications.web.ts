// Web does not support Expo push tokens — no-op stubs
// Metro resolves this file instead of usePushNotifications.ts on web; it must export the same
// names (src/lib/__tests__/platformFiles.test.ts checks), or callers fail only at runtime.
export function unregisterPushToken() {}

export function usePushNotifications(_onNotificationTap?: (roomName: string) => void) {}
