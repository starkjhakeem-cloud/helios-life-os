import { useEffect } from "react";
import { AppState } from "react-native";
import { systemService } from "../services/systemService";
import { useAppStore } from "../store";

const HEALTH_CHECK_INTERVAL_MS = 15000;

export function useBackendHealth(): void {
  const setSystemStatus = useAppStore((s) => s.setSystemStatus);
  const setBackendVersion = useAppStore((s) => s.setBackendVersion);

  useEffect(() => {
    let cancelled = false;
    let interval: ReturnType<typeof setInterval> | null = null;

    async function check(): Promise<void> {
      try {
        const health = await systemService.health();
        if (cancelled) return;
        setSystemStatus(health.status === "ok" ? "online" : "degraded");
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
  }, [setSystemStatus, setBackendVersion]);
}
