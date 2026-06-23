import {
  formatActiveGoalsSubtitle,
  formatSafeDashboardMetricValue,
  formatSafeMetricNumber,
  formatSafeMetricPercent,
  formatHeroDate,
  formatHeroTimeLocation,
  getTimeBasedGreeting,
  isActiveGoalStatus,
} from "../homeFormatting";

function localDate(hour: number, minute = 0): Date {
  return new Date(2026, 5, 22, hour, minute);
}

describe("getTimeBasedGreeting", () => {
  it.each([
    [8, "Good morning,"],
    [14, "Good afternoon,"],
    [18, "Good evening,"],
    [23, "Good night,"],
  ])("formats hour %i", (hour, expected) => {
    expect(getTimeBasedGreeting(localDate(hour))).toBe(expected);
  });

  it("uses the exact requested boundaries", () => {
    expect(getTimeBasedGreeting(localDate(4, 59))).toBe("Good night,");
    expect(getTimeBasedGreeting(localDate(5))).toBe("Good morning,");
    expect(getTimeBasedGreeting(localDate(12))).toBe("Good afternoon,");
    expect(getTimeBasedGreeting(localDate(17))).toBe("Good evening,");
    expect(getTimeBasedGreeting(localDate(22))).toBe("Good night,");
  });
});

describe("formatActiveGoalsSubtitle", () => {
  it("handles empty, singular, and plural states", () => {
    expect(formatActiveGoalsSubtitle(0)).toBe("No active goals");
    expect(formatActiveGoalsSubtitle(1)).toBe("Currently active");
    expect(formatActiveGoalsSubtitle(3)).toBe("Currently active");
  });
});

describe("isActiveGoalStatus", () => {
  it("counts active and in-progress goal statuses only", () => {
    expect(isActiveGoalStatus("active")).toBe(true);
    expect(isActiveGoalStatus("Active")).toBe(true);
    expect(isActiveGoalStatus("in_progress")).toBe(true);
    expect(isActiveGoalStatus("In Progress")).toBe(true);
    expect(isActiveGoalStatus("completed")).toBe(false);
    expect(isActiveGoalStatus("archived")).toBe(false);
    expect(isActiveGoalStatus("deleted")).toBe(false);
    expect(isActiveGoalStatus("cancelled")).toBe(false);
  });
});

describe("formatSafeMetricNumber", () => {
  it("always returns a numeric display string", () => {
    expect(formatSafeMetricNumber(0)).toBe("0");
    expect(formatSafeMetricNumber(3)).toBe("3");
    expect(formatSafeMetricNumber(Number.NaN)).toBe("0");
    expect(formatSafeMetricNumber(Number.POSITIVE_INFINITY)).toBe("0");
    expect(formatSafeMetricNumber(-1)).toBe("0");
  });
});

describe("formatSafeMetricPercent", () => {
  it("always returns a percentage display string", () => {
    expect(formatSafeMetricPercent(0)).toBe("0%");
    expect(formatSafeMetricPercent(68)).toBe("68%");
    expect(formatSafeMetricPercent(Number.NaN)).toBe("0%");
  });
});

describe("formatSafeDashboardMetricValue", () => {
  it("prevents punctuation or nullish values from reaching count metrics", () => {
    expect(formatSafeDashboardMetricValue("Active Goals", ".")).toBe("0");
    expect(formatSafeDashboardMetricValue("Active Goals", "-")).toBe("0");
    expect(formatSafeDashboardMetricValue("Active Goals", "—")).toBe("0");
    expect(formatSafeDashboardMetricValue("Active Goals", undefined)).toBe("0");
    expect(formatSafeDashboardMetricValue("Active Goals", null)).toBe("0");
    expect(formatSafeDashboardMetricValue("Active Goals", "")).toBe("0");
    expect(formatSafeDashboardMetricValue("Active Goals", 1)).toBe("1");
    expect(formatSafeDashboardMetricValue("Open Tasks", "3")).toBe("3");
  });

  it("prevents malformed values from reaching percentage metrics", () => {
    expect(formatSafeDashboardMetricValue("Completion Rate", ".")).toBe("0%");
    expect(formatSafeDashboardMetricValue("Completion Rate", undefined)).toBe("0%");
    expect(formatSafeDashboardMetricValue("Completion Rate", "67%")).toBe("67%");
  });
});

describe("Home hero date formatting", () => {
  it("formats the local calendar date", () => {
    expect(formatHeroDate(localDate(18, 5))).toBe("Monday, June 22");
  });

  it("formats local time with the provided location", () => {
    expect(formatHeroTimeLocation(localDate(18, 5), "New York")).toBe(
      "6:05 PM • New York",
    );
  });

  it("defaults safely to New York", () => {
    expect(formatHeroTimeLocation(localDate(18, 5), "")).toBe(
      "6:05 PM • New York",
    );
  });
});
