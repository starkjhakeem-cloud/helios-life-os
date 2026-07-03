import { PermissionsAndroid, Platform } from "react-native";

export type VoiceInputStatus =
  | "idle"
  | "requesting_permission"
  | "listening"
  | "processing"
  | "unavailable"
  | "error";

export type VoicePermissionState =
  | "not_requested"
  | "granted"
  | "denied"
  | "restricted";

export type VoiceInputResult = {
  transcript: string;
  confidence?: number;
  durationMs?: number;
};

export type VoiceInputErrorCode =
  | "permission_denied"
  | "permission_restricted"
  | "speech_unavailable"
  | "empty_transcript"
  | "unknown";

export class VoiceInputError extends Error {
  constructor(
    public readonly code: VoiceInputErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "VoiceInputError";
  }
}

export interface VoiceInputService {
  requestPermissions(): Promise<boolean>;
  startListening(): Promise<void>;
  stopListening(): Promise<VoiceInputResult | null>;
  cancelListening(): Promise<void>;
  getTranscript(): string;
  getPermissionState(): VoicePermissionState;
  isSpeechRecognitionAvailable(): boolean;
}

let permissionState: VoicePermissionState = "not_requested";
let transcript = "";

function isAndroidPermissionDenied(result: string): boolean {
  return result === PermissionsAndroid.RESULTS.DENIED
    || result === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN;
}

async function requestAndroidMicrophonePermission(): Promise<boolean> {
  const permission = PermissionsAndroid.PERMISSIONS.RECORD_AUDIO;
  const alreadyGranted = await PermissionsAndroid.check(permission);
  if (alreadyGranted) {
    permissionState = "granted";
    return true;
  }

  const result = await PermissionsAndroid.request(permission, {
    title: "Use voice with HELIOS",
    message: "Voice is used only to process your request after you tap voice input.",
    buttonPositive: "Allow",
    buttonNegative: "Not Now",
  });

  if (result === PermissionsAndroid.RESULTS.GRANTED) {
    permissionState = "granted";
    return true;
  }

  permissionState = isAndroidPermissionDenied(result) ? "denied" : "restricted";
  return false;
}

export const voiceInputService: VoiceInputService = {
  async requestPermissions() {
    if (Platform.OS === "android") {
      try {
        return await requestAndroidMicrophonePermission();
      } catch {
        permissionState = "restricted";
        return false;
      }
    }

    // iOS microphone/speech prompts are owned by the future native speech provider.
    // Keep the foundation safe until that provider is installed.
    permissionState = "granted";
    return true;
  },

  async startListening() {
    if (permissionState !== "granted") {
      throw new VoiceInputError(
        permissionState === "denied" ? "permission_denied" : "permission_restricted",
        "Microphone access is required to use voice input.",
      );
    }

    if (!this.isSpeechRecognitionAvailable()) {
      throw new VoiceInputError(
        "speech_unavailable",
        "Speech recognition is not configured in this build.",
      );
    }
  },

  async stopListening() {
    if (!this.isSpeechRecognitionAvailable()) {
      throw new VoiceInputError(
        "speech_unavailable",
        "Speech recognition is not configured in this build.",
      );
    }

    const cleanTranscript = transcript.trim();
    transcript = "";
    if (!cleanTranscript) return null;
    return { transcript: cleanTranscript };
  },

  async cancelListening() {
    transcript = "";
  },

  getTranscript() {
    return transcript;
  },

  getPermissionState() {
    return permissionState;
  },

  isSpeechRecognitionAvailable() {
    return false;
  },
};
