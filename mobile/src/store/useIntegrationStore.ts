import { create } from "zustand";

import {
  integrationService,
  type Integration,
  type IntegrationProvider,
  type SyncJobOut,
} from "../services/integrationService";

type IntegrationState = {
  integrations: Integration[];
  isLoading: boolean;
  isMutating: boolean;
  error: string | null;
  // Sync state — keyed by integration_id
  syncResults: Record<string, SyncJobOut>;
  syncingId: string | null;   // which integration is currently syncing
  syncError: string | null;
  fetchIntegrations: (token: string) => Promise<void>;
  mockConnect: (token: string, provider: IntegrationProvider) => Promise<void>;
  disconnect: (token: string, integrationId: string) => Promise<void>;
  fetchSyncStatus: (token: string) => Promise<void>;
  triggerSync: (token: string, integrationId: string) => Promise<void>;
};

export const useIntegrationStore = create<IntegrationState>()((set, get) => ({
  integrations: [],
  isLoading: false,
  isMutating: false,
  error: null,
  syncResults: {},
  syncingId: null,
  syncError: null,

  fetchIntegrations: async (token) => {
    set({ isLoading: true, error: null });
    try {
      const data = await integrationService.list(token);
      set({ integrations: data.integrations, isLoading: false });
    } catch (err) {
      set({
        isLoading: false,
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
          i.provider === provider ? updated : i,
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
      // Reset local entry to disconnected stub and clear any cached sync result
      set((s) => {
        const { [integrationId]: _, ...remainingResults } = s.syncResults;
        return {
          isMutating: false,
          syncResults: remainingResults,
          integrations: s.integrations.map((i) =>
            i.id === integrationId
              ? { ...i, id: null, status: "disconnected", connected_at: null, scopes: [] }
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

  fetchSyncStatus: async (token) => {
    try {
      const data = await integrationService.syncStatus(token);
      const map: Record<string, SyncJobOut> = {};
      for (const job of data.jobs) {
        map[job.integration_id] = job;
      }
      set({ syncResults: map });
    } catch {
      // Non-fatal — sync status is supplementary; don't surface an error
    }
  },

  triggerSync: async (token, integrationId) => {
    set({ syncingId: integrationId, syncError: null });
    try {
      const job = await integrationService.triggerSync(token, integrationId);
      set((s) => ({
        syncingId: null,
        syncResults: { ...s.syncResults, [integrationId]: job },
        // Update last_sync_at on the matching integration entry
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
}));
