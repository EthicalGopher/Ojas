import React, { useState, useEffect } from 'react';
import {
  Image,
  ImageStyle,
  StyleProp,
  StyleSheet,
  Text,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native';
import { SvgXml } from 'react-native-svg';

import { CHILD_POSE_SVG_XML } from '../assets/svg/childPoseSvg';

export interface ExerciseIconProps {
  imageUrl?: string;
  icon?: string;
  size?: number;
  fontSize?: number;
  containerStyle?: StyleProp<ViewStyle>;
  imageStyle?: StyleProp<ImageStyle>;
  textStyle?: StyleProp<TextStyle>;
}

// In-memory cache for remote SVG text to prevent redundant re-fetching
const CHILD_POSE_URL = 'https://locsjrjekkyjbeapgreu.supabase.co/storage/v1/object/public/Images/Excercise/a-guy-doing-child_pose.svg';

function ensureSvgViewBox(svgText: string): string {
  if (!svgText) return svgText;
  if (!svgText.includes('viewBox') && !svgText.includes('viewbox')) {
    const widthMatch = svgText.match(/width=["']([0-9.]+)["']/i);
    const heightMatch = svgText.match(/height=["']([0-9.]+)["']/i);
    if (widthMatch && heightMatch) {
      const w = widthMatch[1];
      const h = heightMatch[1];
      return svgText.replace(/<svg\b([^>]*)>/i, `<svg$1 viewBox="0 0 ${w} ${h}">`);
    } else {
      return svgText.replace(/<svg\b([^>]*)>/i, `<svg$1 viewBox="0 0 500 500">`);
    }
  }
  return svgText;
}

const svgCache: Record<string, string> = {
  [CHILD_POSE_URL]: CHILD_POSE_SVG_XML,
};

export const ExerciseIcon: React.FC<ExerciseIconProps> = ({
  imageUrl,
  icon = '🏋️',
  size = 40,
  fontSize,
  containerStyle,
  imageStyle,
  textStyle,
}) => {
  let targetUrl = imageUrl?.trim() || '';
  const isChild = targetUrl.toLowerCase().includes('child') || (icon && icon.toLowerCase().includes('child'));
  if (isChild || targetUrl.includes('child_pose.png') || targetUrl.includes('child-pose.png')) {
    targetUrl = CHILD_POSE_URL;
  }

  const cleanUrl = targetUrl;
  const isSvg = isChild || (!!cleanUrl && (cleanUrl.toLowerCase().includes('.svg') || cleanUrl.toLowerCase().includes('svg+xml')));

  const [svgContent, setSvgContent] = useState<string | null>(() => {
    if (isChild) {
      return CHILD_POSE_SVG_XML;
    }
    if (cleanUrl && isSvg && svgCache[cleanUrl]) {
      return svgCache[cleanUrl];
    }
    return null;
  });
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    let isMounted = true;
    setLoadError(false);

    if (isChild) {
      setSvgContent(CHILD_POSE_SVG_XML);
      return;
    }

    if (!cleanUrl) {
      setSvgContent(null);
      return;
    }

    if (isSvg) {
      if (svgCache[cleanUrl]) {
        setSvgContent(svgCache[cleanUrl]);
        return;
      }

      fetch(cleanUrl)
        .then((res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.text();
        })
        .then((xml) => {
          if (isMounted) {
            if (xml.includes('<svg')) {
              const processed = ensureSvgViewBox(xml);
              svgCache[cleanUrl] = processed;
              setSvgContent(processed);
            } else {
              setLoadError(true);
            }
          }
        })
        .catch((err) => {
          console.warn('[ExerciseIcon] Failed to load SVG URL:', cleanUrl, err);
          if (isMounted) {
            setLoadError(true);
          }
        });
    }

    return () => {
      isMounted = false;
    };
  }, [cleanUrl, isSvg, isChild]);

  const calculatedFontSize = fontSize ?? Math.round(size * 0.7);

  if (isChild) {
    return (
      <View style={[styles.container, { width: size, height: size }, containerStyle]}>
        <SvgXml
          xml={svgContent || CHILD_POSE_SVG_XML}
          width={size}
          height={size}
          style={[styles.image, imageStyle]}
        />
      </View>
    );
  }

  if (cleanUrl && !loadError) {
    if (isSvg) {
      if (svgContent) {
        return (
          <View style={[styles.container, { width: size, height: size }, containerStyle]}>
            <SvgXml
              xml={svgContent}
              width={size}
              height={size}
              style={[styles.image, imageStyle]}
            />
          </View>
        );
      }
    } else {
      // Standard bitmap image (PNG, JPG, WebP)
      return (
        <View style={[styles.container, { width: size, height: size }, containerStyle]}>
          <Image
            source={{ uri: cleanUrl }}
            style={[styles.image, { width: size, height: size }, imageStyle]}
            resizeMode="contain"
            onError={() => setLoadError(true)}
          />
        </View>
      );
    }
  }

  // Fallback to emoji icon
  return (
    <View style={[styles.container, { width: size, height: size }, containerStyle]}>
      <Text style={[styles.emojiText, { fontSize: calculatedFontSize }, textStyle]}>
        {icon}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
    overflow: 'hidden',
  },
  image: {
    width: '100%',
    height: '100%',
    backgroundColor: 'transparent',
  },
  emojiText: {
    textAlign: 'center',
    includeFontPadding: false,
    backgroundColor: 'transparent',
  },
});
