import React, { useEffect, useRef } from 'react';
import { StyleProp, View, ViewStyle } from 'react-native';
import { useTourStore } from './tourStore';

/** Marks a view the app tour can spotlight. Layout-neutral: a plain wrapper around the child. */
export const TourTarget: React.FC<{ id: string; style?: StyleProp<ViewStyle>; children: React.ReactNode }> = ({
  id,
  style,
  children,
}) => {
  const ref = useRef<View>(null);
  useEffect(() => {
    const view = ref.current;
    useTourStore.getState().register(id, view);
    return () => useTourStore.getState().unregister(id, view);
  }, [id]);
  return (
    <View ref={ref} collapsable={false} style={style}>
      {children}
    </View>
  );
};
