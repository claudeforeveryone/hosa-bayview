// Single question saves, one at a time, in the order they were made. A save that fails is kept with its reason,
// and every save after it is held (not sent) until the trainer retries or removes the kept ones, so the test's
// question order always matches the order they were typed. Nothing kept is ever overwritten.

export type SaveResult = {
  error?: string;
  fieldErrors?: Record<string, string>;
};
export type Stuck<T> = {
  id: string;
  item: T;
  send: () => Promise<SaveResult>;
  error: string;
};

export const HELD_MESSAGE = "Waiting for the question above to save.";
export const OFFLINE_MESSAGE = "That didn't save. Check your connection.";

export function createSaveQueue<T>(onStuck: (stuck: Stuck<T>[]) => void) {
  let tail: Promise<unknown> = Promise.resolve();
  let blocked = false;
  let stuck: Stuck<T>[] = [];
  const set = (next: Stuck<T>[]) => {
    stuck = next;
    onStuck(stuck);
  };

  // Runs after everything queued before it. Holding and failing are decided here, inside the queue, so the
  // kept list comes out in the order the saves were made.
  function enqueue(
    id: string,
    item: T,
    send: () => Promise<SaveResult>,
  ): Promise<SaveResult> {
    const job = async (): Promise<SaveResult> => {
      if (blocked) {
        set([...stuck, { id, item, send, error: HELD_MESSAGE }]);
        return { error: HELD_MESSAGE };
      }
      let result: SaveResult;
      try {
        result = await send();
      } catch {
        result = { error: OFFLINE_MESSAGE };
      }
      if (result.error || result.fieldErrors) {
        blocked = true;
        set([
          ...stuck,
          {
            id,
            item,
            send,
            error:
              result.error ??
              Object.values(result.fieldErrors ?? {})[0] ??
              OFFLINE_MESSAGE,
          },
        ]);
      }
      return result;
    };
    const p = tail.then(job, job);
    tail = p.catch(() => undefined);
    return p;
  }

  // Anything else that must wait its turn (a paste import) without being held.
  function after<R>(send: () => Promise<R>): Promise<R> {
    const p = tail.then(send, send);
    tail = p.catch(() => undefined);
    return p;
  }

  // Empties the kept list and unblocks; the caller sends them again, in this order.
  function takeForRetry(): Stuck<T>[] {
    const again = stuck;
    blocked = false;
    set([]);
    return again;
  }

  function remove(id: string) {
    const next = stuck.filter((s) => s.id !== id);
    if (!next.length) blocked = false;
    set(next);
  }

  return { enqueue, after, takeForRetry, remove };
}
