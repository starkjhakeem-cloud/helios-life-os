import { Platform } from "react-native";
import * as Notifications from "expo-notifications";

// Configure how notifications appear when the app is in the foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export type PermissionStatus = "granted" | "denied" | "undetermined";

/**
 * Request notification permissions from the OS.
 * Safe to call multiple times — re-uses an existing grant if present.
 */
export async function requestPermissions(): Promise<PermissionStatus> {
  // Android 13+ needs explicit runtime permission; earlier versions grant automatically.
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("helios-reminders", {
      name: "HELIOS Reminders",
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
    });
  }

  const { status } = await Notifications.requestPermissionsAsync({
    ios: {
      allowAlert: true,
      allowBadge: true,
      allowSound: true,
    },
  });

  return status as PermissionStatus;
}

/**
 * Check the current permission status without prompting the user.
 */
export async function getPermissionStatus(): Promise<PermissionStatus> {
  const { status } = await Notifications.getPermissionsAsync();
  return status as PermissionStatus;
}

/**
 * Schedule a local notification for a specific ISO 8601 datetime.
 * Returns the local notification identifier (used to cancel later),
 * or null if the date is in the past or scheduling fails.
 */
export async function scheduleReminder(
  title: string,
  body: string | null,
  remindAt: string,
): Promise<string | null> {
  const date = new Date(remindAt);
  if (isNaN(date.getTime()) || date <= new Date()) {
    return null;
  }

  try {
    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body: body ?? undefined,
        sound: true,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date,
      },
    });
    return id;
  } catch {
    return null;
  }
}

/**
 * Cancel a previously scheduled local notification by its local identifier.
 */
export async function cancelReminder(localId: string): Promise<void> {
  try {
    await Notifications.cancelScheduledNotificationAsync(localId);
  } catch {
    // Ignore — notification may have already fired or been cancelled
  }
}

/**
 * Cancel all scheduled local notifications. Used during sync to start fresh.
 */
export async function cancelAllReminders(): Promise<void> {
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
  } catch {
    // Ignore
  }
}
