import { create } from "zustand";
import { colors } from "../theme/theme";

export type SystemStatus = "checking" | "online" | "offline" | "degraded";

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
  setUserName: (name: string) => void;
  setSystemStatus: (status: SystemStatus) => void;
  setBackendVersion: (version: string | null) => void;
};

export const useAppStore = create<AppState>()((set) => ({
  userName: "Aegis",
  systemStatus: "checking",
  backendVersion: null,
  setUserName: (userName) => set({ userName }),
  setSystemStatus: (systemStatus) => set({ systemStatus }),
  setBackendVersion: (backendVersion) => set({ backendVersion }),
}));
