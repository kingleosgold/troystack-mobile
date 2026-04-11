/**
 * TroyStack - Tutorial Component
 * Supports both first-launch onboarding and version update tutorials.
 * Swipeable slides with dot pagination.
 *
 * Slide widths are driven by onLayout so the pager works correctly
 * on both iPhone (where container ≈ 90% of screen) and iPad (where
 * maxWidth: 400 constrains the container to be much narrower than
 * the screen).
 */

import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Dimensions,
  Platform,
  ScrollView,
  Linking,
} from 'react-native';
import TroyCoinIcon from './TroyCoinIcon';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const Tutorial = ({ visible, onComplete, slides: customSlides }) => {
  const [currentScreen, setCurrentScreen] = useState(0);
  const scrollRef = useRef(null);
  // Start with a reasonable default; onLayout will correct it immediately
  const [containerWidth, setContainerWidth] = useState(Math.min(SCREEN_WIDTH * 0.9, 400));

  // Default first-launch slides
  const defaultSlides = [
    {
      emoji: '🪙',
      title: 'Track Your Stack',
      description: 'Keep tabs on your precious metals stack. Track gold, silver, and everything in between with precision.',
      highlight: 'Your data is encrypted and synced securely. We never sell your data to third parties.',
    },
    {
      emoji: '📷',
      title: 'Scan Receipts with AI',
      description: 'Just snap a photo of your receipt and let Troy extract all the details automatically.',
      highlight: 'No manual entry. No hassle.',
    },
    {
      emoji: '',
      emojiComponent: <View style={{ marginBottom: 20 }}><TroyCoinIcon size={72} /></View>,
      title: 'Go Gold for More',
      description: 'Free tier: stack tracking, live prices, basic analytics. Gold tier: AI intelligence, Vault Watch, full analytics, and more.',
      highlight: 'Start stacking for free!',
    },
  ];

  const slides = customSlides || defaultSlides;

  const handleNext = () => {
    if (currentScreen < slides.length - 1) {
      const next = currentScreen + 1;
      setCurrentScreen(next);
      scrollRef.current?.scrollTo({ x: next * containerWidth, animated: true });
    } else {
      setCurrentScreen(0);
      onComplete();
    }
  };

  const handleSkip = () => {
    setCurrentScreen(0);
    onComplete();
  };

  const handleScroll = (event) => {
    const offsetX = event.nativeEvent.contentOffset.x;
    const page = Math.round(offsetX / containerWidth);
    if (page >= 0 && page < slides.length && page !== currentScreen) {
      setCurrentScreen(page);
    }
  };

  const handleContainerLayout = (event) => {
    const { width } = event.nativeEvent.layout;
    if (width > 0 && width !== containerWidth) {
      setContainerWidth(width);
    }
  };

  return (
    <Modal visible={visible} animationType="fade" transparent>
      <View style={styles.overlay}>
        <View style={styles.container} onLayout={handleContainerLayout}>
          {/* Skip Button */}
          {currentScreen < slides.length - 1 && (
            <TouchableOpacity
              onPress={handleSkip}
              style={styles.skipButton}
              hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}
            >
              <Text style={styles.skipText}>Skip</Text>
            </TouchableOpacity>
          )}

          {/* Swipeable Content */}
          <ScrollView
            ref={scrollRef}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={handleScroll}
            scrollEventThrottle={16}
            style={styles.scrollView}
            contentContainerStyle={{ width: containerWidth * slides.length }}
          >
            {slides.map((slide, index) => (
              <View key={index} style={[styles.slideContent, { width: containerWidth }]}>
                {slide.emojiComponent ? slide.emojiComponent : <Text style={styles.emoji}>{slide.emoji}</Text>}
                <Text style={styles.title}>{slide.title}</Text>
                <Text style={styles.description}>{slide.description}</Text>
                {slide.highlight && (
                  <View style={styles.highlightBox}>
                    <Text style={styles.highlight}>{slide.highlight}</Text>
                  </View>
                )}
                {slide.button && (
                  <TouchableOpacity
                    style={styles.linkButton}
                    onPress={() => Linking.openURL(slide.button.url)}
                  >
                    <Text style={styles.linkButtonText}>{slide.button.label}</Text>
                  </TouchableOpacity>
                )}
              </View>
            ))}
          </ScrollView>

          {/* Progress Dots */}
          <View style={styles.progressContainer}>
            {slides.map((_, index) => (
              <View
                key={index}
                style={[
                  styles.dot,
                  index === currentScreen && styles.dotActive,
                ]}
              />
            ))}
          </View>

          {/* Next Button */}
          <TouchableOpacity style={styles.nextButton} onPress={handleNext}>
            <Text style={styles.nextButtonText}>
              {currentScreen === slides.length - 1 ? 'Get Started' : 'Next'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.95)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  container: {
    width: SCREEN_WIDTH * 0.9,
    maxWidth: 400,
    backgroundColor: '#1a1a2e',
    borderRadius: 24,
    paddingTop: 60,
    paddingBottom: 32,
    alignItems: 'center',
    overflow: 'hidden',
  },
  skipButton: {
    position: 'absolute',
    top: 20,
    right: 20,
    padding: 8,
    zIndex: 10,
  },
  skipText: {
    color: '#71717a',
    fontSize: 16,
  },
  scrollView: {
    maxHeight: 380,
  },
  slideContent: {
    alignItems: 'center',
    paddingHorizontal: 32,
    justifyContent: 'center',
  },
  emoji: {
    fontSize: 72,
    marginBottom: 20,
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    color: '#fff',
    textAlign: 'center',
    marginBottom: 14,
  },
  description: {
    fontSize: 15,
    color: '#a1a1aa',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 16,
  },
  highlightBox: {
    backgroundColor: 'rgba(251, 191, 36, 0.1)',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(251, 191, 36, 0.3)',
  },
  highlight: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fbbf24',
    textAlign: 'center',
  },
  linkButton: {
    marginTop: 12,
    backgroundColor: 'rgba(251, 191, 36, 0.15)',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderWidth: 1,
    borderColor: 'rgba(251, 191, 36, 0.3)',
  },
  linkButtonText: {
    color: '#fbbf24',
    fontSize: 14,
    fontWeight: '600',
  },
  progressContainer: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 20,
    marginTop: 16,
    paddingHorizontal: 32,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  dotActive: {
    backgroundColor: '#fbbf24',
    width: 24,
  },
  nextButton: {
    backgroundColor: '#fbbf24',
    paddingVertical: 16,
    paddingHorizontal: 48,
    borderRadius: 12,
    marginHorizontal: 32,
    alignSelf: 'stretch',
    marginLeft: 32,
    marginRight: 32,
    alignItems: 'center',
  },
  nextButtonText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1a1a2e',
  },
});

export default Tutorial;
