import { describe, expect, it } from "vitest";
import { HELD_MESSAGE, createSaveQueue, type Stuck } from "./save-queue";

type R = { error?: string };
// A send that resolves when told to, recording when it actually ran.
function gate(log: string[], name: string, result: R | Error) {
  let open!: () => void;
  const opened = new Promise<void>((r) => (open = r));
  const send = async () => {
    log.push(`sent ${name}`);
    await opened;
    if (result instanceof Error) throw result;
    return result;
  };
  return { send, open };
}
const flush = () => new Promise((r) => setTimeout(r, 0));

describe("createSaveQueue", () => {
  it("sends one at a time, in order", async () => {
    const log: string[] = [];
    const q = createSaveQueue<string>(() => {});
    const a = gate(log, "A", {});
    const b = gate(log, "B", {});
    const pa = q.enqueue("a", "A", a.send);
    const pb = q.enqueue("b", "B", b.send);
    await flush();
    expect(log).toEqual(["sent A"]);
    a.open();
    await pa;
    await flush();
    expect(log).toEqual(["sent A", "sent B"]);
    b.open();
    expect(await pb).toEqual({});
  });

  it("keeps a failed save and holds everything after it, in typing order, never overwriting", async () => {
    const log: string[] = [];
    let stuck: Stuck<string>[] = [];
    const q = createSaveQueue<string>((s) => (stuck = s));
    const a = gate(log, "A", { error: "Network down" });
    const b = gate(log, "B", {});
    const pa = q.enqueue("a", "A", a.send);
    const pb = q.enqueue("b", "B", b.send);
    a.open();
    expect(await pa).toEqual({ error: "Network down" });
    expect(await pb).toEqual({ error: HELD_MESSAGE });
    // Added after the failure, while blocked.
    const pc = q.enqueue("c", "C", gate(log, "C", {}).send);
    expect(await pc).toEqual({ error: HELD_MESSAGE });
    expect(log).toEqual(["sent A"]);
    expect(stuck.map((s) => [s.item, s.error])).toEqual([
      ["A", "Network down"],
      ["B", HELD_MESSAGE],
      ["C", HELD_MESSAGE],
    ]);
  });

  it("treats a thrown send as a failure with a connection message", async () => {
    let stuck: Stuck<string>[] = [];
    const q = createSaveQueue<string>((s) => (stuck = s));
    const a = gate([], "A", new Error("fetch failed"));
    const p = q.enqueue("a", "A", a.send);
    a.open();
    expect((await p).error).toMatch(/connection/);
    expect(stuck).toHaveLength(1);
  });

  it("retry sends the kept saves again in their original order", async () => {
    const log: string[] = [];
    let stuck: Stuck<string>[] = [];
    const q = createSaveQueue<string>((s) => (stuck = s));
    let fail = true;
    const send = (name: string) => async () => {
      log.push(name);
      return fail && name === "A" ? { error: "down" } : {};
    };
    await q.enqueue("a", "A", send("A"));
    await q.enqueue("b", "B", send("B"));
    await q.enqueue("c", "C", send("C"));
    expect(stuck.map((s) => s.item)).toEqual(["A", "B", "C"]);
    fail = false;
    const again = q.takeForRetry();
    expect(stuck).toEqual([]);
    await Promise.all(again.map((s) => q.enqueue(s.id, s.item, s.send)));
    expect(log).toEqual(["A", "A", "B", "C"]);
    expect(stuck).toEqual([]);
  });

  it("removing the last kept save unblocks the queue", async () => {
    let stuck: Stuck<string>[] = [];
    const q = createSaveQueue<string>((s) => (stuck = s));
    await q.enqueue("a", "A", async () => ({ error: "down" }));
    q.remove("a");
    expect(stuck).toEqual([]);
    expect(await q.enqueue("b", "B", async () => ({}))).toEqual({});
  });
});
