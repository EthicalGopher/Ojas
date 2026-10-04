// Local daily streak reminders. Nothing is sent from a server: whenever the streak changes we
// cancel our pending reminders and schedule the next few, worded for the streak as it is now.
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { requireOptionalNativeModule } from 'expo';
import type * as NotificationsModule from 'expo-notifications';
import type { StreakInfo } from './gamification';

const CHANNEL_ID = 'streak-reminders';
const ID_PREFIX = 'streak-';
const ENABLED_KEY = 'ojas.streakReminders.enabled';
const ASKED_KEY = 'ojas.streakReminders.asked';

/** Local reminder times (24h). */
const EVENING = { hour: 19, minute: 0 };
const LAST_CALL = { hour: 21, minute: 30 };

type NotificationsApi = typeof NotificationsModule;
let api: NotificationsApi | null | undefined;

/**
 * Loaded on first use: a build without the native module (older APK) gets null instead of a
 * crash at import time, and reminders quietly do nothing.
 */
export function getNotifications(): NotificationsApi | null {
  if (api !== undefined) return api;
  // Check first: in dev, Metro reports a module that throws while loading even if we catch it.
  if (!requireOptionalNativeModule('ExpoPushTokenManager') || !requireOptionalNativeModule('ExpoNotificationScheduler')) {
    api = null;
    return api;
  }
  try {
    api = require('expo-notifications') as NotificationsApi;
    // While the app is open the streak screen already says all of this.
    api.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: false,
        shouldShowList: true,
        shouldPlaySound: false,
        shouldSetBadge: false,
      }),
    });
  } catch {
    api = null;
  }
  return api;
}

export async function areRemindersEnabled(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(ENABLED_KEY)) !== 'false';
  } catch {
    return true;
  }
}

async function ensureChannel(Notifications: NotificationsApi) {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: 'Streak reminders',
    description: 'A nudge in the evening so your daily streak does not go out.',
    importance: Notifications.AndroidImportance.HIGH,
    lightColor: '#E25822',
    vibrationPattern: [0, 180, 120, 180],
  });
}

/** Asks for notification permission (only prompts the system dialog once). */
export async function requestReminderPermission(): Promise<boolean> {
  const Notifications = getNotifications();
  if (!Notifications) return false;
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) return false;
  const next = await Notifications.requestPermissionsAsync();
  return next.granted;
}

/** First time the streak screen is dismissed: ask, so the prompt has context. */
export async function askForRemindersOnce(): Promise<boolean> {
  const Notifications = getNotifications();
  if (!Notifications) return false;
  try {
    if (await AsyncStorage.getItem(ASKED_KEY)) return (await Notifications.getPermissionsAsync()).granted;
    await AsyncStorage.setItem(ASKED_KEY, '1');
  } catch {
    // storage unavailable: still ask
  }
  return requestReminderPermission();
}

export async function cancelStreakReminders() {
  const Notifications = getNotifications();
  if (!Notifications) return;
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    scheduled
      .filter((n) => n.identifier.startsWith(ID_PREFIX))
      .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)),
  );
}

interface Reminder {
  dayOffset: number;
  time: { hour: number; minute: number };
  title: string;
  body: string;
}

const days = (n: number) => `${n}-day`;

/** What to send, given the streak right now. Exported for tests. */
export function planReminders(streak: StreakInfo): Reminder[] {
  const n = streak.current;
  if (streak.activeToday) {
    return [
      { dayOffset: 1, time: EVENING, title: `Keep your ${days(n)} streak burning`, body: `One workout today makes it ${n + 1}. Your flame is waiting.` },
      { dayOffset: 1, time: LAST_CALL, title: `Last call for your ${days(n)} streak`, body: 'It goes out at midnight. A quick session is all it takes.' },
      { dayOffset: 2, time: EVENING, title: 'Your streak went out', body: 'Start again today and light a new flame.' },
    ];
  }
  if (n > 0) {
    return [
      { dayOffset: 0, time: EVENING, title: `Your ${days(n)} streak needs you today`, body: 'Train before midnight to keep the fire alive.' },
      { dayOffset: 0, time: LAST_CALL, title: `Last call for your ${days(n)} streak`, body: 'It goes out at midnight. A quick session is all it takes.' },
      { dayOffset: 1, time: EVENING, title: 'Your streak went out', body: 'Start again today and light a new flame.' },
    ];
  }
  return [
    { dayOffset: 0, time: EVENING, title: 'Light your first flame', body: 'Finish any workout today to start a streak.' },
    { dayOffset: 1, time: EVENING, title: 'Light your first flame', body: 'Finish any workout today to start a streak.' },
  ];
}

/** Replaces our pending reminders with ones that match `streak`. No-op without permission. */
export async function scheduleStreakReminders(streak: StreakInfo) {
  const Notifications = getNotifications();
  if (!Notifications) return;
  if (!(await areRemindersEnabled())) return;
  if (!(await Notifications.getPermissionsAsync()).granted) return;
  await ensureChannel(Notifications);
  await cancelStreakReminders();

  const now = new Date();
  for (const [i, r] of planReminders(streak).entries()) {
    const at = new Date(now);
    at.setDate(now.getDate() + r.dayOffset);
    at.setHours(r.time.hour, r.time.minute, 0, 0);
    if (at.getTime() <= now.getTime() + 60_000) continue; // already past today
    await Notifications.scheduleNotificationAsync({
      identifier: `${ID_PREFIX}${i}`,
      content: { title: r.title, body: r.body, data: { screen: 'workouts' }, color: '#E25822' },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: at, channelId: CHANNEL_ID },
    });
  }
}

export async function setRemindersEnabled(enabled: boolean, streak: StreakInfo): Promise<boolean> {
  try {
    await AsyncStorage.setItem(ENABLED_KEY, enabled ? 'true' : 'false');
  } catch {
    // keep going: the schedule change below still applies for this session
  }
  if (!enabled) {
    await cancelStreakReminders();
    return false;
  }
  const granted = await requestReminderPermission();
  if (granted) await scheduleStreakReminders(streak);
  return granted;
}
