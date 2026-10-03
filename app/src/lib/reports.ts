import { getSocket } from './socket';
import { showAlert } from './alert';
import { serverError, t } from './i18n';
import { useLangStore } from '../store/langStore';

/** Report someone to the site's moderators; with `messageId`, that message of theirs (the server
 *  keeps what it said). Tells the reporter whether it went. */
export function reportPerson(username: string, reason: string, messageId?: number) {
  const lang = useLangStore.getState().lang;
  const socket = getSocket();
  socket.once('report_result', (reply: { success: boolean; code?: string }) =>
    showAlert(reply.success ? t(lang, 'report-sent') : serverError(lang, reply, 'report-failed')));
  socket.emit('report_user', { reported: username, reason, ...(messageId ? { message_id: messageId } : {}) });
}

/** Ask first, then report one message */
export function confirmReportMessage(msg: { id: number; username: string }) {
  const lang = useLangStore.getState().lang;
  showAlert(t(lang, 'report-message'), t(lang, 'report-message-confirm'), [
    { text: t(lang, 'cancel'), style: 'cancel' },
    { text: t(lang, 'report'), style: 'destructive', onPress: () => reportPerson(msg.username, '', msg.id) },
  ]);
}
