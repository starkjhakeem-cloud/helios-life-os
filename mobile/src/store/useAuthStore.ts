import { create } from "zustand";

import { ApiError } from "../services/apiClient";
import { authService } from "../services/authService";

export type User = {
  id: string;
  name: string;
  email: string;
};

type AuthState = {
  user: User | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  signup: (name: string, email: string, password: string) => Promise<void>;
  logout: () => void;
  clearError: () => void;
};

export const useAuthStore = create<AuthState>()((set) => ({
  user: null,
  accessToken: null,
  isAuthenticated: false,
  isLoading: false,
  error: null,

  login: async (email, password) => {
    set({ isLoading: true, error: null });
    try {
      const { user, access_token } = await authService.login(email, password);
      set({ user, accessToken: access_token, isAuthenticated: true, isLoading: false });
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : "Login failed. Please try again.";
      set({ error: message, isLoading: false });
    }
  },

  signup: async (name, email, password) => {
    set({ isLoading: true, error: null });
    try {
      const { user, access_token } = await authService.signup(name, email, password);
      set({ user, accessToken: access_token, isAuthenticated: true, isLoading: false });
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : "Signup failed. Please try again.";
      set({ error: message, isLoading: false });
    }
  },

  logout: () => set({ user: null, accessToken: null, isAuthenticated: false, error: null }),
  clearError: () => set({ error: null }),
}));
