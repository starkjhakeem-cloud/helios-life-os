(global as any).__DEV__ = false;
process.env.EXPO_PUBLIC_API_URL = "http://localhost:8000";

jest.mock("expo-device", () => ({
  isDevice: false,
}));
