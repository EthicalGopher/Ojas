// Ojas's own alert box. Replaces React Native's Alert.alert everywhere (same call shape, so a call
// reads the same): showAlert(title, message?, buttons?, options?). Alerts queue and show one at a
// time in <AlertHost />, which App mounts once above everything (including other modals).
import type React from 'react';
import { create } from 'zustand';

export type AlertButtonStyle = 'default' | 'cancel' | 'destructive';

export interface AlertButton {
  text?: string;
  style?: AlertButtonStyle;
  onPress?: () => void | Promise<void>;
}

/** Sets the icon and colour of the box. Left out, it is guessed from the title. */
export type AlertTone = 'info' | 'success' | 'warning' | 'danger' | 'energy';

export interface AlertOptions {
  tone?: AlertTone;
  /** Back button / tapping outside closes the box (it presses the cancel button if there is one). */
  cancelable?: boolean;
  /** Extra content under the message (live countdowns, pictures). */
  body?: () => React.ReactNode;
}

export interface AlertRequest {
  id: number;
  title: string;
  message?: string;
  buttons: AlertButton[];
  options: AlertOptions;
}

interface AlertState {
  queue: AlertRequest[];
  push: (req: AlertRequest) => void;
  /** Removes the alert on screen; the next one in the queue shows. */
  dismiss: (id: number) => void;
}

let nextId = 1;

export const useAlertStore = create<AlertState>((set) => ({
  queue: [],
  push: (req) => set((s) => ({ queue: [...s.queue, req] })),
  dismiss: (id) => set((s) => ({ queue: s.queue.filter((a) => a.id !== id) })),
}));

/** Shows an alert box. Without buttons it has one OK button. */
export function showAlert(title: string, message?: string, buttons?: AlertButton[], options: AlertOptions = {}): void {
  const list = buttons && buttons.length > 0 ? buttons.slice(0, 3) : [{ text: 'OK' }];
  useAlertStore.getState().push({ id: nextId++, title, message, buttons: list, options });
}

/** Tone from the title when the caller did not set one. */
export function guessTone(title: string): AlertTone {
  const t = title.toLowerCase();
  if (/(error|fail|denied|invalid|missing|could not|can't|cannot|unavailable|not allowed)/.test(t)) return 'danger';
  if (/(forfeit|leave|remove|delete|disband|kick|sign out|log out|logout|warning|sure\?|unfriend|cancel)/.test(t)) return 'warning';
  if (/(success|sent|saved|updated|done|joined|accepted|victory|welcome|added|unlocked|purchased|created|great)/.test(t)) return 'success';
  if (/energy/.test(t)) return 'energy';
  return 'info';
}
