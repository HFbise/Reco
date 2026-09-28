import { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { getSocket } from '../lib/socket';
import { useT } from '../hooks/useT';
import { useColors } from '../hooks/useColors';
import { Fonts } from '../theme';

/** Connection problems: the server waking up (first connect is slow), lost, or back. */
export function ConnectionBanner() {
  const t = useT();
  const c = useColors();
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

  // Soft tinted strips, not alarm-bright bars: green when back, blue while waking, red when lost
  const look = status === 'back' ? { bg: c.successBg, fg: c.success }
    : status === 'waking' ? { bg: c.accentBg, fg: c.accentText }
    : { bg: c.dangerBg, fg: c.danger };
  return (
    <View style={[s.banner, { backgroundColor: look.bg }]} accessibilityRole="alert">
      <View style={[s.dot, { backgroundColor: look.fg }]} />
      <Text style={[s.text, { color: look.fg }]}>
        {status === 'back' ? t('reconnected') : status === 'waking' ? t('server-waking') : t('reconnecting')}
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  banner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 7, paddingHorizontal: 14 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  text: { flexShrink: 1, fontSize: 13, fontWeight: String(Fonts.bold) as any, textAlign: 'center' },
});
