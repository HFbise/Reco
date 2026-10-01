import { useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';
import { Button } from '../ui/Button';
import { Group, Row, ToggleRow } from './parts';
import { useT } from '../../hooks/useT';
import type { useAccountSettings } from '../../hooks/useAccountSettings';
import { disablePush, enablePush, pushStatus, type PushStatus } from '../../lib/webPush';
import { useSoundStore } from '../../store/soundStore';

type Account = ReturnType<typeof useAccountSettings>;

/** Push on this browser, which kinds of notification you get (every device), and sounds. */
export function NotificationSettings({ account }: { account: Account }) {
  const t = useT();
  const { settings, change } = account;
  const { soundEnabled, toggle: toggleSound } = useSoundStore();
  const [push, setPush] = useState<PushStatus>('unsupported');
  const [busy, setBusy] = useState(false);
  useEffect(() => { pushStatus().then(setPush); }, []);

  async function togglePush() {
    setBusy(true);
    if (push === 'on') {
      await disablePush();
      setPush('off');
    } else {
      setPush(await enablePush());
    }
    setBusy(false);
  }
  const pushText: Partial<Record<PushStatus, string>> = {
    on: t('push-device-on'), off: t('push-status-off'), denied: t('push-status-denied'), 'needs-install': t('push-status-install'),
  };

  return (
    <>
      {pushText[push] && (
        // The web only: the phone apps ask the system for permission themselves
        <Group title={t('settings-this-browser')}>
          <Row label={t('notifications')} hint={pushText[push]}>
            {(push === 'on' || push === 'off') && (
              <Button label={push === 'on' ? t('push-turn-off') : t('push-turn-on')} variant="quiet" onPress={togglePush}
                busy={busy} style={s.button} accessibilityLabel={`${push === 'on' ? t('push-turn-off') : t('push-turn-on')} ${t('notifications')}`} />
            )}
          </Row>
        </Group>
      )}
      <Group title={t('settings-notify-me')} note={t('settings-notify-note')}>
        <ToggleRow label={t('settings-push-dms')} hint={t('settings-push-dms-hint')} value={settings?.push_dms ?? true}
          disabled={!settings} onChange={(v) => change({ push_dms: v })} />
        <ToggleRow label={t('settings-push-matches')} hint={t('settings-push-matches-hint')} value={settings?.push_matches ?? true}
          disabled={!settings} onChange={(v) => change({ push_matches: v })} />
      </Group>
      <Group>
        <ToggleRow label={t('settings-sounds')} hint={t('settings-sounds-hint')} value={soundEnabled} onChange={toggleSound} />
      </Group>
    </>
  );
}

const s = StyleSheet.create({
  button: { minHeight: 36, paddingHorizontal: 14 },
});
