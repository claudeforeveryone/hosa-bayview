// What the owner_* functions (migration 0232) return. Types only, so client components and the fixture gallery
// can import them without the server client. `Count` is null when it was a small count (1 to 4) about people.
import type { ReportReason } from "./flag-reasons";
import type {
  FeedbackCategory,
  FeedbackPriority,
  FeedbackStatus,
} from "./owner-metrics";

export type Count = number | null;

export type OwnerOverview = {
  today: string;
  members: Count;
  new_7d: Count;
  new_30d: Count;
  dau: Count;
  wau: Count;
  wau_prev: Count;
  mau: Count;
  returning_7d: Count;
  first_week_7d: Count;
};

export type GrowthBucket = {
  start: string;
  end: string;
  new: Count;
  active: Count;
};

export type GrowthData = {
  step: "day" | "week";
  from: string;
  to: string;
  new_total: Count;
  active_total: Count;
  // False when any bucket had 1 to 4 new members: then every bucket's `new` is null (they'd add up to new_total).
  new_by_bucket: boolean;
  buckets: GrowthBucket[];
};

export const FEATURE_IDS = [
  "account_created",
  "event_selected",
  "practice_started",
  "practice_completed",
  "exam_completed",
  "vocab_round",
  "vocab_match",
  "card_reviews",
  "resource_opened",
  "feedback_submitted",
  "question_reported",
  "install_prompt_shown",
  "app_installed",
  "push_enabled",
] as const;
export type FeatureId = (typeof FEATURE_IDS)[number];

export type FeatureRow = {
  id: FeatureId;
  event: string | null;
  source: "table" | "tracked";
  count: Count;
  people: Count;
  tracked_since: string | null;
};

export type Funnel = { started: Count; completed: Count; people: Count };

export type DuelFigures =
  | { available: false }
  | {
      available: true;
      started: Count;
      completed: Count;
      // People in any battle started in the range, and people in one that finished.
      people: Count;
      completed_people: Count;
    };

// Rooms with 5 or more runs, busiest first. A ranking only: no run counts (they'd add up against the funnels).
export type BusyEvent = {
  // The room's id: two rooms can share a name and an event.
  id: string;
  name: string;
  event: string;
  people: Count;
};

export type EngagementData = {
  from: string;
  practice: Funnel;
  exams: Funnel;
  duels: DuelFigures;
  features: FeatureRow[];
  events: BusyEvent[];
};

// Content is about the material, not about people, so these counts are exact.
export type ContentEventRow = {
  id: string;
  name: string;
  event: string;
  kind: "class" | "competition";
  tests: number;
  questions: number;
  missing_explanations: number;
  repeated: number;
  open_reports: number;
};

export type ReportedQuestion = {
  question_id: string;
  test_id: string;
  classroom_id: string;
  test_title: string;
  room: string;
  pos: number;
  // The question's wording, or null for a viewer who isn't an executive (0232): they get the count and the link.
  prompt: string | null;
  reasons: ReportReason[];
  reports: number;
  last_at: string;
};

export type DuplicateStem = {
  // Lower case, spacing and end punctuation stripped: the key the copies share, not something to show.
  // Null, like example, for a viewer who isn't an executive (0232).
  stem: string | null;
  // One copy's wording as written, and where that copy lives.
  example: string | null;
  test_id: string;
  classroom_id: string;
  copies: number;
  tests: number;
  rooms: string[];
};

export type ContentData = {
  questions: number;
  tests: number;
  published_tests: number;
  missing_explanations: number;
  open_reports: number;
  open_asks: number;
  duplicate_groups: number;
  per_event: ContentEventRow[];
  reported: ReportedQuestion[];
  duplicates: DuplicateStem[];
};

// Feedback rows are records for triage, not aggregates, so nothing in them is hidden.
export type FeedbackRow = {
  id: string;
  category: FeedbackCategory;
  body: string;
  build: string | null;
  status: FeedbackStatus;
  priority: FeedbackPriority;
  resolution: string;
  created_at: string;
  updated_at: string;
  triaged_at: string | null;
  sent_by: string;
};

export type FeedbackQueue = {
  counts: Record<FeedbackStatus, number>;
  rows: FeedbackRow[];
};

export type AuditRow = {
  id: number;
  created_at: string;
  actor_name: string;
  action: string;
  target_name: string;
  detail: string;
};

// One page of the audit log, and whether an older page has rows.
export type AuditPage = { rows: AuditRow[]; hasMore: boolean };

export type SystemData = {
  db_time: string;
  features: {
    battles: boolean;
    chapter_code: boolean;
    push: boolean;
    analytics: boolean;
    feedback: boolean;
  };
  migrations: { count: number; latest: string[] } | null;
  // Whether any usage event is stored, and the oldest. No row count (it would add up against hidden counts).
  analytics: { stored: boolean; oldest: string | null };
};

// What the page knows about the deployment, from Vercel's own variables. No secrets.
export type Deployment = {
  commit: string | null;
  branch: string | null;
  environment: string | null;
  repo: string | null;
};

export type SystemInfo = {
  deployment: Deployment;
  // "missing": the database answered, but the owner functions (0232) aren't on it yet. "error": it answered with an
  // error. There is no "down": if the database can't be reached, the page's own gate fails first and nothing renders.
  db: "up" | "missing" | "error";
  latencyMs: number | null;
  data: SystemData | null;
};
