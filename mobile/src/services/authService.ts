import { apiClient } from "./apiClient";
import { API_ENDPOINTS } from "../config/api";

type AuthApiResponse = {
  user: { id: string; name: string; email: string };
  message: string;
};

export const authService = {
  login: (email: string, password: string) =>
    apiClient.post<AuthApiResponse>(API_ENDPOINTS.auth.login, { email, password }),

  signup: (name: string, email: string, password: string) =>
    apiClient.post<AuthApiResponse>(API_ENDPOINTS.auth.signup, { name, email, password }),
};
