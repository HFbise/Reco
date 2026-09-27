import { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { getSocket } from '../lib/socket';
import { useT } from '../hooks/useT';

/** Connection problems: the server waking up (first connect is slow), lost, or back. */
export function ConnectionBanner() {
  const t = useT();
  const [status, setStatus] = useState<'ok' | 'waking' | 'down' | 'back'>('ok');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wasDownRef = useRef(false);

  useEffect(() => {
    const socket = getSocket();
    // A sleeping free-tier server can take a minute to answer: say so instead of just spinning
    if (!socket.connected) timerRef.current = setTimeout(() => setStatus('waking'), 3000);

    const onDisconnect = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      wasDownRef.current = true;
      setStatus('down');
    };
    const onConnect = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (!wasDownRef.current) { setStatus('ok'); return; } // first connection: nothing to report
      setStatus('back');
      timerRef.current = setTimeout(() => setStatus('ok'), 2000);
    };

    socket.on('disconnect', onDisconnect);
    socket.on('connect', onConnect);
    return () => {
      socket.off('disconnect', onDisconnect);
      socket.off('connect', onConnect);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  if (status === 'ok') return null;

  return (
    <View style={[s.banner, { backgroundColor: status === 'back' ? '#3ba55c' : status === 'waking' ? '#4f8ef7' : '#ed4245' }]}>
      <Text style={s.text}>
        {status === 'back' ? t('reconnected') : status === 'waking' ? t('server-waking') : t('reconnecting')}
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  banner: { paddingVertical: 5, paddingHorizontal: 12, alignItems: 'center' },
  text: { color: '#fff', fontSize: 13, fontWeight: '600' as any, textAlign: 'center' },
});
