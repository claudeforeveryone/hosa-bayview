// The rules for a taker's answers on a test page, kept pure so they can be tested without a browser.
// settleAnswer: what one settled save does to the screen. submitBlock: whether a Submit/Finish waits.
import type { Settled } from "@/lib/answer-saves";

export type Answer = {
  selected: number;
  // Null while the answer is saving, and when the trainer has answers off (no verdict to show).
  is_correct: boolean | null;
  correct_index: number | null;
  explanation: string | null;
  // True once the server has stored the pick (rows from the page always are).
  saved: boolean;
};

export type SettleOutcome = {
  // The last answer the server confirmed per question: where a later failed save goes back to.
  confirmed: Record<string, Answer>;
  // What the question shows now: an answer, null to clear it, or undefined to leave the screen alone.
  show?: Answer | null;
  error?: string;
  // A practice verdict to reveal (with its sound) on the question still on screen.
  verdict?: boolean;
};

// Only the newest pick for a question changes the screen; an older reply just records what the server stored,
// so a slow reply never puts back an answer the taker has already changed. A failed newest pick goes back to
// the last answer the server confirmed (or to blank), and says why.
export function settleAnswer(
  confirmed: Record<string, Answer>,
  { qid, sent, reply, latest }: Settled,
  { practice, onScreen }: { practice: boolean; onScreen: string | undefined },
): SettleOutcome {
  if (reply.error) {
    if (!latest) return { confirmed };
    return { confirmed, show: confirmed[qid] ?? null, error: reply.error };
  }
  const got: Answer = {
    // The server's stored pick wins (a stale second tab can't change a locked practice answer).
    selected: reply.selected_index ?? sent,
    is_correct: reply.is_correct ?? null,
    correct_index: reply.correct_index ?? null,
    explanation: reply.explanation ?? null,
    saved: true,
  };
  const next = { ...confirmed, [qid]: got };
  if (!latest) return { confirmed: next };
  // A verdict that lands after you moved on is just stored, and shows quietly, without the reveal, when you go back.
  const verdict =
    practice && typeof reply.is_correct === "boolean" && onScreen === qid
      ? reply.is_correct
      : undefined;
  return verdict === undefined
    ? { confirmed: next, show: got }
    : { confirmed: next, show: got, verdict };
}

// Applies a settled save's `show` to the answers on screen, leaving the other questions alone.
export function showAnswer(
  answers: Record<string, Answer>,
  qid: string,
  show: Answer | null,
): Record<string, Answer> {
  const next = { ...answers };
  if (show) next[qid] = show;
  else delete next[qid];
  return next;
}

// A tapped Submit/Finish waits once when a pick never reached the server, so the taker can pick it again.
// It never waits when time is up or when the timer submits (the attempt closes with what the server has),
// and a second tap for the same questions goes through, so a connection that keeps failing can't trap anyone.
// Picks the server refused ("Time is up") aren't in `unsaved`: the screen already shows what it holds.
export function submitBlock({
  unsaved,
  byTap,
  deadlinePassed,
  warned,
  rows,
  practice,
}: {
  unsaved: string[];
  byTap: boolean;
  deadlinePassed: boolean;
  // The key of the last warning shown, or null.
  warned: string | null;
  rows: { question_id: string }[];
  practice: boolean;
}): { key: string; message: string } | null {
  if (!byTap || deadlinePassed || !unsaved.length) return null;
  // In paper order, so the same questions always make the same key.
  const hit = rows.flatMap((r, i) =>
    unsaved.includes(r.question_id) ? [{ id: r.question_id, n: i + 1 }] : [],
  );
  const key = hit.map((h) => h.id).join(",");
  if (!hit.length || key === warned) return null;
  const numbers = hit.map((h) => h.n);
  const verb = practice ? "Finish" : "Submit";
  const list =
    numbers.length === 1
      ? `Question ${numbers[0]}`
      : `Questions ${numbers.slice(0, -1).join(", ")} and ${numbers.at(-1)}`;
  const them = numbers.length === 1 ? "it" : "them";
  return {
    key,
    message: `${list} didn't save. Pick ${them} again, or tap ${verb} again to hand in what's saved.`,
  };
}
