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
  pointFadeMs: 330,
  identityFadeMs: 480,
  coreFadeMs: 650,
  glowBuildMs: 900,
  pulseDelayMs: 1800,
  pulseMs: 900,
  revealDelayMs: 2200,
  revealMs: 800,
  totalDurationMs: 3000,
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
