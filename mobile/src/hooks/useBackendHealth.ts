import { useEffect } from "react";
import { AppState } from "react-native";
import { systemService } from "../services/systemService";
import { useAppStore } from "../store";

const HEALTH_CHECK_INTERVAL_MS = 15000;

export function useBackendHealth(): void {
  const setSystemStatus = useAppStore((s) => s.setSystemStatus);
  const setBackendVersion = useAppStore((s) => s.setBackendVersion);
  const setClockSync = useAppStore((s) => s.setClockSync);
  const setClockOffline = useAppStore((s) => s.setClockOffline);

  useEffect(() => {
    let cancelled = false;
    let interval: ReturnType<typeof setInterval> | null = null;

    async function check(): Promise<void> {
      try {
        const startedAtMs = Date.now();
        const health = await systemService.health();
        const receivedAtMs = Date.now();
        if (cancelled) return;
        setSystemStatus(health.status === "ok" ? "online" : "degraded");
        setClockSync({
          serverTimestamp: health.timestamp,
          receivedAtMs,
          latencyMs: receivedAtMs - startedAtMs,
        });
        systemService.version()
          .then((version) => {
            if (!cancelled) setBackendVersion(version.version);
          })
          .catch(() => {
            if (!cancelled) setBackendVersion(null);
          });
      } catch {
        if (!cancelled) {
          setSystemStatus("offline");
          setBackendVersion(null);
          setClockOffline();
        }
      }
    }

    check();

    interval = setInterval(check, HEALTH_CHECK_INTERVAL_MS);
    const appStateSub = AppState.addEventListener("change", (state) => {
      if (state === "active") check();
    });

    return () => {
      cancelled = true;
      if (interval) clearInterval(interval);
      appStateSub.remove();
    };
  }, [setSystemStatus, setBackendVersion, setClockSync, setClockOffline]);
}
