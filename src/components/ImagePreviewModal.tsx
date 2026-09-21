import React from 'react';
import {
  Modal,
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  Platform,
  StatusBar,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface ImagePreviewModalProps {
  visible: boolean;
  imageUrl?: string | null;
  title?: string;
  subtitle?: string;
  onClose: () => void;
}

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

export default function ImagePreviewModal({
  visible,
  imageUrl,
  title,
  subtitle,
  onClose,
}: ImagePreviewModalProps) {
  const insets = useSafeAreaInsets();

  if (!visible) return null;

  const statusBarHeight = StatusBar.currentHeight || 0;
  // Ensure the topBar and close button are placed well clear of status bar icons (signal, wifi, battery)
  const topPadding = Platform.OS === 'android'
    ? Math.max(statusBarHeight, insets.top, 28) + 18
    : Math.max(insets.top, 24) + 16;
  const bottomPadding = Math.max(insets.bottom, 24);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.backdrop}>
        {/* Touch backdrop area to close */}
        <TouchableOpacity
          style={StyleSheet.absoluteFill}
          activeOpacity={1}
          onPress={onClose}
        />

        <View style={styles.container}>
          {/* Top Bar with Title and Close Button positioned cleanly below status bar */}
          <View style={[styles.topBar, { paddingTop: topPadding }]}>
            <View style={styles.titleWrapper}>
              {title ? (
                <Text style={styles.titleText} numberOfLines={1}>
                  {title}
                </Text>
              ) : null}
              {subtitle ? (
                <Text style={styles.subtitleText} numberOfLines={1}>
                  {subtitle}
                </Text>
              ) : null}
            </View>

            <TouchableOpacity
              style={styles.closeBtn}
              onPress={onClose}
              activeOpacity={0.7}
              hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
              accessibilityLabel="Close image preview"
            >
              <Ionicons name="close" size={22} color="#ffffff" />
            </TouchableOpacity>
          </View>

          {/* Main Image Container */}
          <View style={[styles.imageContainer, { paddingBottom: bottomPadding }]}>
            {imageUrl ? (
              <Image
                source={{ uri: imageUrl }}
                style={styles.previewImage}
                resizeMode="contain"
                fadeDuration={0}
              />
            ) : (
              <View style={styles.noImageWrapper}>
                <Ionicons name="image-outline" size={48} color="rgba(255, 255, 255, 0.4)" />
                <Text style={styles.noImageText}>No photo available</Text>
              </View>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.93)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  container: {
    flex: 1,
    width: '100%',
    justifyContent: 'space-between',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 16,
    zIndex: 10,
  },
  titleWrapper: {
    flex: 1,
    marginRight: 16,
  },
  titleText: {
    color: '#ffffff',
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  subtitleText: {
    color: 'rgba(255, 255, 255, 0.65)',
    fontSize: 13,
    fontWeight: '500',
    marginTop: 2,
  },
  closeBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.22)',
  },
  imageContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  previewImage: {
    width: SCREEN_WIDTH * 0.92,
    height: SCREEN_HEIGHT * 0.72,
    borderRadius: 16,
  },
  noImageWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  noImageText: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 15,
    fontWeight: '600',
  },
});
