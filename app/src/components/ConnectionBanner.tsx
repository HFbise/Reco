import { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { getSocket } from '../lib/socket';

export function ConnectionBanner() {
  const [status, setStatus] = useState<'ok' | 'down' | 'back'>('ok');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wasDownRef = useRef(false);

  useEffect(() => {
    const socket = getSocket();

    const onDisconnect = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      wasDownRef.current = true;
      setStatus('down');
    };
    const onConnect = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (!wasDownRef.current) return; // 首次连接不提示
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
    <View style={[s.banner, { backgroundColor: status === 'back' ? '#3ba55c' : '#ed4245' }]}>
      <Text style={s.text}>
        {status === 'back' ? '已重新连接' : '连接已断开，正在重连…'}
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  banner: { paddingVertical: 5, alignItems: 'center' },
  text: { color: '#fff', fontSize: 13, fontWeight: '600' as any },
});
