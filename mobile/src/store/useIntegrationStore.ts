import { create } from "zustand";

import {
  integrationService,
  type Integration,
  type IntegrationProvider,
} from "../services/integrationService";

type IntegrationState = {
  integrations: Integration[];
  isLoading: boolean;
  isMutating: boolean;
  error: string | null;
  fetchIntegrations: (token: string) => Promise<void>;
  mockConnect: (token: string, provider: IntegrationProvider) => Promise<void>;
  disconnect: (token: string, integrationId: string) => Promise<void>;
};

export const useIntegrationStore = create<IntegrationState>()((set, get) => ({
  integrations: [],
  isLoading: false,
  isMutating: false,
  error: null,

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
      // After deleting the DB row, reset the local entry to disconnected stub
      set((s) => ({
        isMutating: false,
        integrations: s.integrations.map((i) =>
          i.id === integrationId
            ? { ...i, id: null, status: "disconnected", connected_at: null, scopes: [] }
            : i,
        ),
      }));
    } catch (err) {
      set({
        isMutating: false,
        error: err instanceof Error ? err.message : "Failed to disconnect integration.",
      });
    }
  },
}));
