import { getLaunchExperiencePlan } from "../src/components/launchExperienceTiming";

describe("launch experience timing", () => {
  it("keeps the standard wake sequence deliberate without becoming a long intro", () => {
    const plan = getLaunchExperiencePlan(false);

    expect(plan.wakeMs).toBeGreaterThanOrEqual(100);
    expect(plan.wakeMs).toBeLessThanOrEqual(150);
    expect(plan.totalDurationMs).toBeGreaterThanOrEqual(2900);
    expect(plan.totalDurationMs).toBeLessThanOrEqual(3100);
    expect(plan.pulseDelayMs).toBeGreaterThan(plan.identityFadeMs);
    expect(plan.shouldPulse).toBe(true);
    expect(plan.shouldHaptic).toBe(true);
  });

  it("shortens motion and disables pulse haptics when Reduced Motion is enabled", () => {
    const standard = getLaunchExperiencePlan(false);
    const reduced = getLaunchExperiencePlan(true);

    expect(reduced.totalDurationMs).toBeLessThan(standard.totalDurationMs);
    expect(reduced.totalDurationMs).toBeLessThanOrEqual(500);
    expect(reduced.shouldPulse).toBe(false);
    expect(reduced.shouldHaptic).toBe(false);
  });
});
