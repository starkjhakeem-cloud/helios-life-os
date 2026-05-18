import { create } from "zustand";

export type User = {
  id: string;
  name: string;
  email: string;
};

type AuthState = {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  signup: (name: string, email: string, password: string) => Promise<void>;
  logout: () => void;
  clearError: () => void;
};

function mockDelay(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 800));
}

export const useAuthStore = create<AuthState>()((set) => ({
  user: null,
  isAuthenticated: false,
  isLoading: false,
  error: null,

  login: async (email, password) => {
    set({ isLoading: true, error: null });
    await mockDelay();
    if (!email.trim() || !password.trim()) {
      set({ error: "Email and password are required.", isLoading: false });
      return;
    }
    set({
      user: { id: "mock-1", name: email.split("@")[0], email },
      isAuthenticated: true,
      isLoading: false,
    });
  },

  signup: async (name, email, password) => {
    set({ isLoading: true, error: null });
    await mockDelay();
    if (!name.trim() || !email.trim() || !password.trim()) {
      set({ error: "All fields are required.", isLoading: false });
      return;
    }
    set({
      user: { id: "mock-1", name, email },
      isAuthenticated: true,
      isLoading: false,
    });
  },

  logout: () => set({ user: null, isAuthenticated: false, error: null }),
  clearError: () => set({ error: null }),
}));
