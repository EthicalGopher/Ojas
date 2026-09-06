import { Platform } from 'react-native';

export interface DeviceInfo {
  modelName: string;
  totalMemoryGb: number;
}

export const getDeviceInfo = (): DeviceInfo => {
  let modelName = Platform.OS === 'android' ? 'Android Device' : Platform.OS === 'ios' ? 'iOS Device' : 'Mobile Device';
  let totalMemoryGb = 4.0;

  try {
    if (typeof navigator !== 'undefined' && (navigator as any).deviceMemory) {
      totalMemoryGb = Number((navigator as any).deviceMemory) || 4.0;
    }
  } catch (e) {}

  try {
    if (Platform.OS === 'android') {
      modelName = `Android v${Platform.Version}`;
    } else if (Platform.OS === 'ios') {
      modelName = `iOS v${Platform.Version}`;
    }
  } catch (e) {}

  return { modelName, totalMemoryGb };
};

export type ModelComplexity = 'light' | 'medium' | 'high';

export const getRecommendedModel = (ramGb?: number): ModelComplexity => {
  return 'medium';
};
