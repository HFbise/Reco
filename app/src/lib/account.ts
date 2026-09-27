import { endSession, getSocket } from './socket';
import { useAuthStore } from '../store/authStore';
import { unregisterPushToken } from '../hooks/usePushNotifications';

/** Emit `event` and resolve with the next `resultEvent` reply (or a timeout failure). */
export function request<T = any>(event: string, payload: object, resultEvent: string, timeoutMs = 15000): Promise<T> {
  const socket = getSocket();
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      socket.off(resultEvent, onReply);
      resolve({ success: false, code: 'server_error' } as T);
    }, timeoutMs);
    function onReply(data: T) {
      clearTimeout(timer);
      resolve(data);
    }
    socket.once(resultEvent, onReply);
    socket.emit(event, payload);
  });
}

export async function logout() {
  unregisterPushToken();
  getSocket().emit('user_offline', {});
  await endSession();
}

export async function changePassword(oldPassword: string, newPassword: string) {
  const reply = await request('change_password', { old_password: oldPassword, new_password: newPassword }, 'change_password_result');
  // The change invalidates every old session token; keep this device signed in with the new one
  if (reply.success && reply.token) {
    const { currentUser, setUser } = useAuthStore.getState();
    if (currentUser) await setUser({ ...currentUser, token: reply.token });
  }
  return reply;
}

export async function updateProfile(profile: { screenname: string; bio: string; expression: string; color: string }) {
  const avatar = await request('save_avatar', { expression: profile.expression, color: profile.color }, 'save_avatar_result');
  if (!avatar.success) return avatar;
  const reply = await request('update_profile', { screenname: profile.screenname, bio: profile.bio }, 'update_profile_result');
  if (reply.success) {
    const { currentUser, setUser } = useAuthStore.getState();
    if (currentUser) {
      await setUser({
        ...currentUser,
        screenname: profile.screenname,
        bio: profile.bio,
        avatar_expression: profile.expression,
        avatar_color: profile.color,
      });
    }
  }
  return reply;
}

export function submitFeedback(text: string) {
  return request('submit_feedback', { text }, 'feedback_result');
}

export async function deleteAccount(password: string) {
  const reply = await request('delete_account', { password }, 'delete_account_result');
  if (reply.success) await endSession();
  return reply;
}
