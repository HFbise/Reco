import { useEffect } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useColors } from '../../../src/hooks/useColors';
import { useMobileVoice } from '../../../src/context/VoiceContext';
import { ChatPanel, type DmMeta } from '../../../src/components/ChatPanel';

export default function RoomScreen() {
  const { name, password, displayName, otherUsername, avatarColor, avatarExpression } =
    useLocalSearchParams<{
      name: string;
      password?: string;
      displayName?: string;
      otherUsername?: string;
      avatarColor?: string;
      avatarExpression?: string;
    }>();

  const isDm = name.startsWith('dm:');
  const c = useColors();
  const { voice, setRoom, voiceRoom, leaveAndSwitchRoom } = useMobileVoice();

  useEffect(() => {
    if (!isDm) setRoom(name);
  }, [name, isDm]);

  const dmMeta: DmMeta | null = isDm && otherUsername
    ? { screenname: displayName ?? otherUsername, username: otherUsername, avatarExpression, avatarColor }
    : null;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
      <ChatPanel
        name={name}
        password={password}
        showBackBtn
        hideVoiceBar
        externalVoice={isDm ? null : voice}
        dmMeta={dmMeta}
        activeVoiceRoom={isDm ? undefined : voiceRoom || undefined}
        onLeaveAndSwitch={isDm ? undefined : leaveAndSwitchRoom}
      />
    </SafeAreaView>
  );
}
