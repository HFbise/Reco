import { useEffect, useState } from 'react';
import { ModalFrame } from '../account/ModalFrame';
import { TextField } from '../ui/TextField';
import { connectSocket } from '../../lib/socket';
import { request } from '../../lib/account';
import { showAlert } from '../../lib/alert';
import { useT } from '../../hooks/useT';

// Getting into a room: create one, find one by its code, or give a protected room's password.
// Each dialog asks the server itself and hands back only a room that's ready to open.

export interface FoundRoom { name: string; hasPassword: boolean; needsPassword: boolean }

/** Clear the fields each time a dialog opens. */
function useFreshFields(visible: boolean, reset: () => void) {
  useEffect(() => {
    if (visible) reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);
}

export function CreateRoomDialog({ visible, onClose, onCreated }: {
  visible: boolean; onClose: () => void;
  /** The new room, and the password it was given (the creator opens it with that) */
  onCreated: (room: FoundRoom, password: string) => void;
}) {
  const t = useT();
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useFreshFields(visible, () => { setName(''); setPassword(''); setError(''); });

  async function create() {
    if (busy) return;
    if (!name.trim()) { setError(t('err-room-name-required')); return; }
    setError('');
    setBusy(true);
    connectSocket();
    const reply = await request<any>('create_room', { room: name.trim(), password: password.trim() }, 'create_room_result');
    setBusy(false);
    if (!reply.success) { setError(t.server(reply, 'err-create-failed')); return; }
    onClose();
    if (reply.code) showAlert(t('create-room'), `${t('room-code')}: ${reply.code}`);
    onCreated({ name: reply.room, hasPassword: !!reply.has_password, needsPassword: false }, password.trim());
  }

  return (
    <ModalFrame visible={visible} title={t('create-room')} onClose={onClose} error={error}
      confirmLabel={t('create-room')} onConfirm={create} busy={busy}>
      <TextField placeholder={t('ph-room-name')} value={name} onChangeText={setName} autoFocus onSubmitEditing={create} />
      <TextField placeholder={t('ph-room-password')} value={password} onChangeText={setPassword} secureTextEntry
        autoComplete="new-password" textContentType="newPassword" onSubmitEditing={create} />
    </ModalFrame>
  );
}

export function FindRoomDialog({ visible, onClose, onFound }: {
  visible: boolean; onClose: () => void; onFound: (room: FoundRoom) => void;
}) {
  const t = useT();
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useFreshFields(visible, () => { setCode(''); setError(''); });

  async function find() {
    if (busy || !code.trim()) return;
    setError('');
    setBusy(true);
    const reply = await request<any>('find_room', { code: code.trim() }, 'find_room_result');
    setBusy(false);
    if (!reply.success) { setError(t.server(reply, 'err-find-failed')); return; }
    onClose();
    onFound({ name: reply.room, hasPassword: !!reply.has_password, needsPassword: !!reply.needs_password });
  }

  return (
    <ModalFrame visible={visible} title={t('find-room')} onClose={onClose} error={error}
      confirmLabel={t('find-room')} onConfirm={find} busy={busy}>
      <TextField placeholder={t('ph-find-code')} value={code} onChangeText={setCode} keyboardType="number-pad"
        autoFocus onSubmitEditing={find} />
    </ModalFrame>
  );
}

/** A protected room you're not a member of yet: the password goes along with the join. */
export function RoomPasswordDialog({ room, onClose, onSubmit }: {
  room: FoundRoom | null; onClose: () => void; onSubmit: (room: FoundRoom, password: string) => void;
}) {
  const t = useT();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  useFreshFields(!!room, () => { setPassword(''); setError(''); });

  function submit() {
    if (!room) return;
    if (!password.trim()) { setError(t('err-fill-required')); return; }
    onClose();
    onSubmit(room, password.trim());
  }

  return (
    <ModalFrame visible={!!room} title={t('enter-room-pw')} onClose={onClose} error={error}
      confirmLabel={t('ok')} onConfirm={submit}>
      <TextField placeholder={t('ph-password')} value={password} onChangeText={setPassword} secureTextEntry
        autoComplete="current-password" textContentType="password" autoFocus onSubmitEditing={submit} />
    </ModalFrame>
  );
}
