import { create } from "zustand";
import { colors } from "../theme/theme";

export type SystemStatus = "online" | "offline" | "degraded";

export const statusLabel: Record<SystemStatus, string> = {
  online:   "ALL SYSTEMS NOMINAL",
  offline:  "SYSTEM OFFLINE",
  degraded: "DEGRADED PERFORMANCE",
};

export const statusColor: Record<SystemStatus, string> = {
  online:   colors.accentCyan,
  offline:  "#ef4444",
  degraded: "#f59e0b",
};

type AppState = {
  userName: string;
  systemStatus: SystemStatus;
  setUserName: (name: string) => void;
  setSystemStatus: (status: SystemStatus) => void;
};

export const useAppStore = create<AppState>()((set) => ({
  userName: "Aegis",
  systemStatus: "online",
  setUserName: (userName) => set({ userName }),
  setSystemStatus: (systemStatus) => set({ systemStatus }),
}));
