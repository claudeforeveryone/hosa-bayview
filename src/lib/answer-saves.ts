// Saves a taker's picks on a test, one request at a time per question. A pick made while an earlier save for
// the same question is still in flight is kept, and only the newest one is sent once that save settles, so a
// quick change of mind is never dropped. Every settled save is reported; `latest` says no newer pick was made
// meanwhile, so the screen only applies the answer the taker is still looking at. A save that throws (no
// connection) is reported as a failed save instead of leaving the question stuck.

export type SaveReply = {
  error?: string;
  selected_index?: number | null;
  is_correct?: boolean | null;
  correct_index?: number | null;
  explanation?: string | null;
};

// The reply when a pick never reached the database (no connection, or the server couldn't store it). The
// server action sends this same text, so picking again is worth it. Any other error is the database refusing
// the pick for good ("Time is up", "This attempt is already submitted"), and picking again gets the same answer.
export const SAVE_FAILED =
  "That answer didn't save. Check your connection and tap it again.";

export type Settled = {
  qid: string;
  sent: number;
  reply: SaveReply;
  latest: boolean;
};

export type AnswerSaves = ReturnType<typeof createAnswerSaves>;

export function createAnswerSaves(
  send: (qid: string, selected: number) => Promise<SaveReply>,
  onSettled: (settled: Settled) => void,
) {
  // The newest pick per question that has not been sent yet.
  const wanted = new Map<string, number>();
  // One running drain per question, so saves for a question never overlap.
  const running = new Map<string, Promise<void>>();
  // Questions whose newest pick didn't reach the database. A new pick for the question clears it until that one
  // settles. A refusal isn't kept here: the screen has already put back what the server holds.
  const unsaved = new Set<string>();

  async function drain(qid: string) {
    while (wanted.has(qid)) {
      const sent = wanted.get(qid) as number;
      wanted.delete(qid);
      let reply: SaveReply;
      try {
        // An empty reply counts as a failed save, so the screen never trusts a missing answer.
        reply = (await send(qid, sent)) ?? { error: SAVE_FAILED };
      } catch {
        reply = { error: SAVE_FAILED };
      }
      const latest = !wanted.has(qid);
      if (latest && reply.error === SAVE_FAILED) unsaved.add(qid);
      onSettled({ qid, sent, reply, latest });
    }
  }

  return {
    save(qid: string, selected: number): Promise<void> {
      wanted.set(qid, selected);
      unsaved.delete(qid);
      let p = running.get(qid);
      if (!p) {
        p = drain(qid).finally(() => running.delete(qid));
        running.set(qid, p);
      }
      return p;
    },
    // Resolves once every save in flight has settled, with the questions whose newest pick didn't save, so a
    // submit can wait for the last tap and stop instead of closing the attempt on an answer that was lost.
    // With `within` (ms) it stops waiting after that long and also names the saves still on their way, so a
    // request that hangs can't hold up a submit when time runs out.
    async idle(within?: number): Promise<string[]> {
      const settledAll = (async () => {
        while (running.size) await Promise.all([...running.values()]);
      })();
      if (within === undefined) await settledAll;
      else {
        let timer: ReturnType<typeof setTimeout> | undefined;
        await Promise.race([
          settledAll,
          new Promise<void>((r) => (timer = setTimeout(r, within))),
        ]);
        clearTimeout(timer);
      }
      return [...new Set([...unsaved, ...running.keys()])];
    },
  };
}
