import { create } from "zustand";
import { colors } from "../theme/theme";

export type SystemStatus = "checking" | "online" | "offline" | "degraded";
export type ClockSyncStatus = "checking" | "live" | "offline";

export const statusLabel: Record<SystemStatus, string> = {
  checking:  "CONNECTING...",
  online:    "ALL SYSTEMS NOMINAL",
  offline:   "SYSTEM OFFLINE",
  degraded:  "DEGRADED PERFORMANCE",
};

export const statusColor: Record<SystemStatus, string> = {
  checking:  colors.textMuted,
  online:    colors.accentCyan,
  offline:   "#ef4444",
  degraded:  "#f59e0b",
};

type AppState = {
  userName: string;
  systemStatus: SystemStatus;
  backendVersion: string | null;
  clockStatus: ClockSyncStatus;
  clockOffsetMs: number;
  clockLatencyMs: number | null;
  clockSyncedAtMs: number | null;
  clockServerTimestamp: string | null;
  setUserName: (name: string) => void;
  setSystemStatus: (status: SystemStatus) => void;
  setBackendVersion: (version: string | null) => void;
  setClockSync: (sync: {
    serverTimestamp: string;
    receivedAtMs: number;
    latencyMs: number;
  }) => void;
  setClockOffline: () => void;
};

export const useAppStore = create<AppState>()((set) => ({
  userName: "Aegis",
  systemStatus: "checking",
  backendVersion: null,
  clockStatus: "checking",
  clockOffsetMs: 0,
  clockLatencyMs: null,
  clockSyncedAtMs: null,
  clockServerTimestamp: null,
  setUserName: (userName) => set({ userName }),
  setSystemStatus: (systemStatus) => set({ systemStatus }),
  setBackendVersion: (backendVersion) => set({ backendVersion }),
  setClockSync: ({ serverTimestamp, receivedAtMs, latencyMs }) => {
    const serverMs = Date.parse(serverTimestamp);

    if (Number.isNaN(serverMs)) {
      set({ clockStatus: "offline", clockLatencyMs: null });
      return;
    }

    set({
      clockStatus: "live",
      clockOffsetMs: Math.round(serverMs + Math.max(0, latencyMs) / 2 - receivedAtMs),
      clockLatencyMs: Math.max(0, Math.round(latencyMs)),
      clockSyncedAtMs: receivedAtMs,
      clockServerTimestamp: serverTimestamp,
    });
  },
  setClockOffline: () => set({ clockStatus: "offline" }),
}));
