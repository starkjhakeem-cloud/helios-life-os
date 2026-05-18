import { useEffect } from "react";
import { systemService } from "../services/systemService";
import { useAppStore } from "../store";

export function useBackendHealth(): void {
  const setSystemStatus = useAppStore((s) => s.setSystemStatus);
  const setBackendVersion = useAppStore((s) => s.setBackendVersion);

  useEffect(() => {
    let cancelled = false;

    async function check(): Promise<void> {
      try {
        const [health, version] = await Promise.all([
          systemService.health(),
          systemService.version(),
        ]);
        if (cancelled) return;
        setSystemStatus(health.status === "ok" ? "online" : "degraded");
        setBackendVersion(version.version);
      } catch {
        if (!cancelled) {
          setSystemStatus("offline");
          setBackendVersion(null);
        }
      }
    }

    check();
    return () => { cancelled = true; };
  }, [setSystemStatus, setBackendVersion]);
}
