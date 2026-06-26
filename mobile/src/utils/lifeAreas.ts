import type { SFSymbol } from "sf-symbols-typescript";

// ── Types ──────────────────────────────────────────────────────────────────────

export type LifeAreaId =
  | "career"
  | "education"
  | "health"
  | "finance"
  | "creativity"
  | "family"
  | "personal";

export type LifeAreaDef = {
  id: LifeAreaId;
  label: string;
  accent: string;
  icon: SFSymbol;
  keywords: string[];
  description: string;
  starters: string[];
};

// ── Data ───────────────────────────────────────────────────────────────────────

export const LIFE_AREAS: LifeAreaDef[] = [
  {
    id: "career",
    label: "Career",
    accent: "#a855f7",
    icon: "briefcase.fill",
    keywords: ["launch", "work", "job", "career", "business", "startup", "helios", "ship", "build", "company"],
    description: "Professional and entrepreneurial goals — building HELIOS, software engineering career growth, and portfolio development.",
    starters: [
      "Land first software engineering role",
      "Build HELIOS to production launch",
      "Complete a portfolio project",
    ],
  },
  {
    id: "education",
    label: "Education",
    accent: "#3b82f6",
    icon: "book.fill",
    keywords: ["graduate", "wgu", "degree", "learn", "study", "course", "school", "certif", "university"],
    description: "Academic goals — your WGU Software Engineering degree, coursework, and lifelong learning.",
    starters: [
      "Complete WGU Software Engineering degree",
      "Pass the next OA assessment",
      "Study consistently every day",
    ],
  },
  {
    id: "health",
    label: "Health",
    accent: "#22c55e",
    icon: "heart.fill",
    keywords: ["health", "fitness", "weight", "gym", "run", "exercise", "diet", "sleep", "wellb", "body", "mental"],
    description: "Physical and mental wellbeing — fitness consistency, sleep, and sustainable healthy habits that support everything else.",
    starters: [
      "Exercise 3× per week",
      "Improve sleep consistency",
      "Drink enough water daily",
    ],
  },
  {
    id: "finance",
    label: "Finance",
    accent: "#f59e0b",
    icon: "dollarsign.circle.fill",
    keywords: ["money", "invest", "save", "finance", "income", "budget", "debt", "wealth", "fund"],
    description: "Financial stability, savings, and intentional spending — building toward long-term security and the relocation to Gaithersburg.",
    starters: [
      "Build a 3-month emergency fund",
      "Track monthly expenses",
      "Eliminate unnecessary subscriptions",
    ],
  },
  {
    id: "creativity",
    label: "Creativity",
    accent: "#f97316",
    icon: "paintbrush.fill",
    keywords: ["publish", "write", "create", "gravewood", "book", "music", "art", "design", "game", "draw", "photo"],
    description: "Creative projects — writing Gravewood, building a photography portfolio, design, and artistic expression as a lifelong practice.",
    starters: [
      "Write the first chapter of Gravewood",
      "Build a photography portfolio",
      "Create something every week",
    ],
  },
  {
    id: "family",
    label: "Family",
    accent: "#ec4899",
    icon: "house.fill",
    keywords: ["family", "parent", "child", "home", "relationship", "friend", "partner"],
    description: "Family is always the highest priority. These goals protect the relationships and responsibilities that matter most.",
    starters: [
      "Schedule dedicated weekly family time",
      "Be fully present during family moments",
      "Plan the relocation together",
    ],
  },
  {
    id: "personal",
    label: "Personal Growth",
    accent: "#22d3ee",
    icon: "sparkles",
    keywords: [],
    description: "Personal development, identity, habits, and self-improvement that don't fit neatly into another area.",
    starters: [
      "Build a consistent morning routine",
      "Read one book per month",
      "Reflect on weekly progress",
    ],
  },
];

// ── Helpers ────────────────────────────────────────────────────────────────────

export function assignLifeArea(goal: { title: string; description?: string | null }): LifeAreaId {
  const text = `${goal.title} ${goal.description ?? ""}`.toLowerCase();
  for (const area of LIFE_AREAS) {
    if (area.id === "personal") continue;
    if (area.keywords.some((kw) => text.includes(kw))) return area.id;
  }
  return "personal";
}
