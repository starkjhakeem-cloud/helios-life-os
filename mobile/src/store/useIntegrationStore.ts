import { create } from "zustand";

import {
  integrationService,
  type GoogleServiceType,
  type Integration,
  type IntegrationProvider,
  type SyncJobOut,
} from "../services/integrationService";

type IntegrationState = {
  integrations: Integration[];
  isLoading: boolean;
  isMutating: boolean;
  error: string | null;
  syncResults: Record<string, SyncJobOut>;
  syncingId: string | null;
  syncError: string | null;
  backendUnavailable: boolean;
  fetchIntegrations: (token: string) => Promise<void>;
  mockConnect: (token: string, provider: IntegrationProvider) => Promise<void>;
  disconnect: (token: string, integrationId: string) => Promise<void>;
  googleDisconnect: (token: string, serviceType: GoogleServiceType) => Promise<void>;
  fetchSyncStatus: (token: string) => Promise<void>;
  triggerSync: (token: string, integrationId: string) => Promise<void>;
  reset: () => void;
};

export const useIntegrationStore = create<IntegrationState>()((set, get) => ({
  integrations: [],
  isLoading: false,
  isMutating: false,
  error: null,
  syncResults: {},
  syncingId: null,
  syncError: null,
  backendUnavailable: false,

  fetchIntegrations: async (token) => {
    set({ isLoading: true, error: null, backendUnavailable: false });
    try {
      const data = await integrationService.list(token);
      set({ integrations: data.integrations, isLoading: false });
    } catch (err) {
      const isNetworkError = err instanceof Error && (err as { status?: number }).status === 0;
      set({
        isLoading: false,
        backendUnavailable: isNetworkError,
        error: err instanceof Error ? err.message : "Failed to load integrations.",
      });
    }
  },

  mockConnect: async (token, provider) => {
    set({ isMutating: true, error: null });
    try {
      const updated = await integrationService.mockConnect(token, provider);
      set((s) => ({
        isMutating: false,
        integrations: s.integrations.map((i) =>
          i.provider === provider ? { ...i, ...updated } : i,
        ),
      }));
    } catch (err) {
      set({
        isMutating: false,
        error: err instanceof Error ? err.message : "Failed to connect integration.",
      });
    }
  },

  disconnect: async (token, integrationId) => {
    set({ isMutating: true, error: null });
    try {
      await integrationService.disconnect(token, integrationId);
      set((s) => {
        const { [integrationId]: _, ...remainingResults } = s.syncResults;
        return {
          isMutating: false,
          syncResults: remainingResults,
          integrations: s.integrations.map((i) =>
            i.id === integrationId
              ? {
                  ...i,
                  id: null,
                  status: "disconnected" as const,
                  connected_at: null,
                  token_expires_at: null,
                  scopes: [],
                  requires_reconnect: false,
                }
              : i,
          ),
        };
      });
    } catch (err) {
      set({
        isMutating: false,
        error: err instanceof Error ? err.message : "Failed to disconnect integration.",
      });
    }
  },

  googleDisconnect: async (token, serviceType) => {
    set({ isMutating: true, error: null });
    try {
      await integrationService.googleDisconnect(token, serviceType);
      // Refresh the full list so the UI reflects the backend's new state
      const data = await integrationService.list(token);
      set({ isMutating: false, integrations: data.integrations });
    } catch (err) {
      set({
        isMutating: false,
        error: err instanceof Error ? err.message : "Failed to disconnect integration.",
      });
    }
  },

  fetchSyncStatus: async (token) => {
    try {
      const data = await integrationService.syncStatus(token);
      const map: Record<string, SyncJobOut> = {};
      for (const job of data.jobs) {
        map[job.integration_id] = job;
      }
      set({ syncResults: map });
    } catch {
      // Non-fatal — sync status is supplementary
    }
  },

  triggerSync: async (token, integrationId) => {
    set({ syncingId: integrationId, syncError: null });
    try {
      const job = await integrationService.triggerSync(token, integrationId);
      set((s) => ({
        syncingId: null,
        syncResults: { ...s.syncResults, [integrationId]: job },
        integrations: s.integrations.map((i) =>
          i.id === integrationId
            ? { ...i, last_sync_at: job.completed_at ?? job.started_at }
            : i,
        ),
      }));
    } catch (err) {
      set({
        syncingId: null,
        syncError: err instanceof Error ? err.message : "Sync failed.",
      });
    }
  },

  reset: () =>
    set({
      integrations: [],
      isLoading: false,
      isMutating: false,
      error: null,
      syncResults: {},
      syncingId: null,
      syncError: null,
      backendUnavailable: false,
    }),
}));
