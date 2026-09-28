import { Text, type TextProps } from 'react-native';
import { Fonts } from '../../theme';

/**
 * Text in the display face (Fredoka): titles, the wordmark, big buttons.
 * On the web the app's body font is set by a global rule that outranks a
 * component's own fontFamily, so this also tags the element (data-font) for
 * the matching display rule in public/index.html.
 */
export function DisplayText({ style, ...rest }: TextProps) {
  const web = { dataSet: { font: 'display' } } as object;
  return <Text {...rest} {...web} style={[{ fontFamily: Fonts.display, fontWeight: '600' }, style]} />;
}
