import { ChoiceRow, Group } from './parts';
import { useT } from '../../hooks/useT';
import { useLangStore } from '../../store/langStore';
import { useThemeStore, type ThemeMode } from '../../store/themeStore';

/** Light or dark (or as the device is), and the app's language. */
export function AppearanceSettings() {
  const t = useT();
  const { mode, setMode } = useThemeStore();
  const { lang, setLang } = useLangStore();
  return (
    <Group>
      <ChoiceRow<ThemeMode> label={t('theme')} hint={mode === 'system' ? t('theme-system-hint') : undefined}
        value={mode} onChange={setMode}
        options={[
          { value: 'system', label: t('theme-system') },
          { value: 'light', label: t('theme-light') },
          { value: 'dark', label: t('theme-dark') },
        ]} />
      <ChoiceRow label={t('language')} value={lang} onChange={setLang}
        options={[{ value: 'zh', label: '中文' }, { value: 'en', label: 'English' }]} />
    </Group>
  );
}
