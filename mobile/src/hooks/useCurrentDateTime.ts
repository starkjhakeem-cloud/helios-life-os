/**
 * useCurrentDateTime
 *
 * Returns a live Date that re-renders the consumer every second while the app
 * is in the foreground. This ensures the displayed minute is never more than
 * one second behind the real device clock.
 *
 * The interval is paused when the app is backgrounded (no UI to update, no
 * battery waste) and resumed — with an immediate tick — the moment the app
 * becomes active again.
 *
 * Usage:
 *   const now = useCurrentDateTime();
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { AppState, type AppStateStatus } from "react-native";
import { useAppStore, type ClockSyncStatus } from "../store";

const TICK_MS = 1_000; // 1 second — accurate to the minute change within 1 s

export type ConnectedClockSource = "server" | "device";

export type ConnectedClock = {
  now: Date;
  deviceNow: Date;
  source: ConnectedClockSource;
  syncStatus: ClockSyncStatus;
  isLive: boolean;
  offsetMs: number;
  latencyMs: number | null;
  lastSyncedAt: Date | null;
};

export function useCurrentDateTime(): Date {
  const [now, setNow] = useState<Date>(() => new Date());
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function tick() {
    setNow(new Date());
  }

  function startInterval() {
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(tick, TICK_MS);
  }

  function stopInterval() {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }

  useEffect(() => {
    // Tick immediately so the display is current the moment the screen mounts.
    tick();
    startInterval();

    const appStateSub = AppState.addEventListener(
      "change",
      (nextState: AppStateStatus) => {
        if (nextState === "active") {
          // Snap to current time immediately; restart the interval from now.
          tick();
          startInterval();
        } else {
          // Pause while backgrounded — no UI updates needed.
          stopInterval();
        }
      },
    );

    return () => {
      stopInterval();
      appStateSub.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return now;
}

export function useConnectedClock(): ConnectedClock {
  const deviceNow = useCurrentDateTime();
  const clockStatus = useAppStore((s) => s.clockStatus);
  const clockOffsetMs = useAppStore((s) => s.clockOffsetMs);
  const clockLatencyMs = useAppStore((s) => s.clockLatencyMs);
  const clockSyncedAtMs = useAppStore((s) => s.clockSyncedAtMs);
  const isLive = clockStatus === "live";

  const now = useMemo(
    () => new Date(deviceNow.getTime() + (isLive ? clockOffsetMs : 0)),
    [clockOffsetMs, deviceNow, isLive],
  );

  const lastSyncedAt = useMemo(
    () => (clockSyncedAtMs ? new Date(clockSyncedAtMs) : null),
    [clockSyncedAtMs],
  );

  return {
    now,
    deviceNow,
    source: isLive ? "server" : "device",
    syncStatus: clockStatus,
    isLive,
    offsetMs: clockOffsetMs,
    latencyMs: clockLatencyMs,
    lastSyncedAt,
  };
}
