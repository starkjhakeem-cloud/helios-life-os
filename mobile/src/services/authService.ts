import { apiClient } from "./apiClient";
import { API_ENDPOINTS } from "../config/api";

type AuthApiResponse = {
  user: { id: string; name: string; email: string; created_at: string };
  access_token: string;
  token_type: string;
  message: string;
};

type MeResponse = {
  id: string;
  name: string;
  email: string;
  created_at: string;
};

export const authService = {
  login: (email: string, password: string) =>
    apiClient.post<AuthApiResponse>(API_ENDPOINTS.auth.login, { email, password }),

  signup: (name: string, email: string, password: string) =>
    apiClient.post<AuthApiResponse>(API_ENDPOINTS.auth.signup, { name, email, password }),

  me: (token: string) =>
    apiClient.get<MeResponse>(API_ENDPOINTS.auth.me, token),

  deleteAccount: (token: string) =>
    apiClient.del(API_ENDPOINTS.auth.account, token),
};
