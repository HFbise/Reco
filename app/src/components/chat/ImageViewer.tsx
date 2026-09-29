import { Image, Modal, StyleSheet, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { IconButton } from '../ui/Button';
import { IconClose } from '../Icon';
import { useT } from '../../hooks/useT';
import { fitImage, imageUrl } from '../../lib/images';

/** A photo from the chat, as large as the screen allows. Tap anywhere (or the ×) to close. */
export function ImageViewer({ image, onClose }: { image: { id: string; w: number; h: number } | null; onClose: () => void }) {
  const t = useT();
  const { width, height } = useWindowDimensions();
  if (!image) return null;
  const size = fitImage(image.w, image.h, Math.min(width - 32, height - 120));
  // fitImage caps the long side; also keep the short side on screen
  const scale = Math.min(1, (width - 32) / size.width, (height - 120) / size.height);
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={s.backdrop} activeOpacity={1} onPress={onClose} accessibilityLabel={t('close')}>
        <Image
          source={{ uri: imageUrl(image.id) }}
          style={{ width: size.width * scale, height: size.height * scale, borderRadius: 12 }}
          resizeMode="contain"
          accessibilityLabel={t('photo')}
        />
      </TouchableOpacity>
      <View style={s.close} pointerEvents="box-none">
        <IconButton label={t('close')} onPress={onClose} variant="raised" round size={44}
          icon={(color) => <IconClose size={16} color={color} />} />
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.88)', alignItems: 'center', justifyContent: 'center' },
  close: { position: 'absolute', top: 16, right: 16 },
});
