export type LaunchExperiencePlan = {
  wakeMs: number;
  pointFadeMs: number;
  identityFadeMs: number;
  coreFadeMs: number;
  glowBuildMs: number;
  pulseDelayMs: number;
  pulseMs: number;
  revealDelayMs: number;
  revealMs: number;
  totalDurationMs: number;
  shouldPulse: boolean;
  shouldHaptic: boolean;
};

export const STANDARD_LAUNCH_EXPERIENCE: LaunchExperiencePlan = {
  wakeMs: 150,
  pointFadeMs: 215,
  identityFadeMs: 315,
  coreFadeMs: 440,
  glowBuildMs: 600,
  pulseDelayMs: 1220,
  pulseMs: 620,
  revealDelayMs: 1460,
  revealMs: 500,
  totalDurationMs: 1960,
  shouldPulse: true,
  shouldHaptic: true,
};

export const REDUCED_MOTION_LAUNCH_EXPERIENCE: LaunchExperiencePlan = {
  wakeMs: 100,
  pointFadeMs: 80,
  identityFadeMs: 120,
  coreFadeMs: 0,
  glowBuildMs: 0,
  pulseDelayMs: 0,
  pulseMs: 0,
  revealDelayMs: 160,
  revealMs: 220,
  totalDurationMs: 380,
  shouldPulse: false,
  shouldHaptic: false,
};

export function getLaunchExperiencePlan(reducedMotion: boolean): LaunchExperiencePlan {
  return reducedMotion ? REDUCED_MOTION_LAUNCH_EXPERIENCE : STANDARD_LAUNCH_EXPERIENCE;
}
