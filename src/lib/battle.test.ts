import { describe, expect, it } from "vitest";
import {
  accuracy,
  battlePhase,
  battlePoints,
  msLeft,
  normalizeBattleCode,
  parseBattleState,
  roundTeamPoints,
  startCheck,
  teamCap,
  topPlayer,
  type BattlePlayer,
  type BattleState,
} from "./battle";

const p = (over: Partial<BattlePlayer>): BattlePlayer => ({
  user_id: "u",
  name: "Member",
  team: 1,
  active: true,
  points: 0,
  correct: 0,
  answered: 0,
  in_round: false,
  ...over,
});

const base: BattleState = {
  id: "b",
  code: "AB2C",
  format: "1v1",
  status: "lobby",
  round: 0,
  total: 10,
  host_id: "u1",
  me: "u1",
  classroom_id: "c",
  classroom_name: "Nutrition",
  source_title: null,
  winner: null,
  rematch_id: null,
  now: "2026-10-10T12:00:00.000Z",
  players: [p({ user_id: "u1", name: "Ana" })],
  teams: [0, 0],
  current: null,
};

describe("battlePoints", () => {
  it("pays nothing for a wrong answer, however fast", () => {
    expect(battlePoints(false, 20_000)).toBe(0);
  });
  it("pays 150 for a right answer with the full 20 s left", () => {
    expect(battlePoints(true, 20_000)).toBe(150);
  });
  it("pays 100 for a right answer at the buzzer", () => {
    expect(battlePoints(true, 0)).toBe(100);
  });
  it("scales the bonus linearly with time left", () => {
    expect(battlePoints(true, 10_000)).toBe(125);
    expect(battlePoints(true, 5_000)).toBe(113); // 12.5 rounds up, like Postgres round()
    expect(battlePoints(true, 15_000)).toBe(138);
  });
  it("clamps time outside the 20 s window", () => {
    expect(battlePoints(true, -500)).toBe(100);
    expect(battlePoints(true, 45_000)).toBe(150);
  });
});

describe("normalizeBattleCode", () => {
  it("accepts 4 characters, any case, spaces ignored", () => {
    expect(normalizeBattleCode(" ab 2c ")).toBe("AB2C");
  });
  it("rejects look-alike characters and wrong lengths", () => {
    expect(normalizeBattleCode("AB0C")).toBeNull();
    expect(normalizeBattleCode("ABIC")).toBeNull();
    expect(normalizeBattleCode("ABC")).toBeNull();
    expect(normalizeBattleCode("ABCDE")).toBeNull();
  });
});

describe("parseBattleState", () => {
  it("reads a state from the server", () => {
    expect(parseBattleState(base)?.code).toBe("AB2C");
  });
  it("refuses a malformed one", () => {
    expect(parseBattleState({ ...base, format: "4v4" })).toBeNull();
    expect(parseBattleState(null)).toBeNull();
  });
});

describe("battlePhase", () => {
  const round = {
    no: 1,
    prompt: "Q",
    options: ["a", "b"],
    started_at: base.now,
    ends_at: base.now,
    closed_at: null,
    answered: 0,
    my_choice: null,
    correct_index: null,
    results: null,
  };
  it("follows the server's status and round close", () => {
    expect(battlePhase(base)).toBe("lobby");
    expect(battlePhase({ ...base, status: "playing", current: round })).toBe(
      "question",
    );
    expect(
      battlePhase({
        ...base,
        status: "playing",
        current: { ...round, closed_at: base.now },
      }),
    ).toBe("reveal");
    expect(battlePhase({ ...base, status: "done" })).toBe("results");
  });
});

describe("startCheck", () => {
  it("needs full teams for fixed formats", () => {
    expect(startCheck(base)).toEqual({
      ok: false,
      reason: "Needs 1 on each team",
    });
    const two = {
      ...base,
      players: [p({ user_id: "a" }), p({ user_id: "b", team: 2 })],
    };
    expect(startCheck(two)).toEqual({ ok: true });
  });
  it("ignores players who left", () => {
    const left = {
      ...base,
      players: [
        p({ user_id: "a" }),
        p({ user_id: "b", team: 2, active: false }),
      ],
    };
    expect(startCheck(left).ok).toBe(false);
  });
  it("needs one a side for Teams", () => {
    const s = {
      ...base,
      format: "teams" as const,
      players: [p({}), p({ user_id: "b" })],
    };
    expect(startCheck(s)).toEqual({
      ok: false,
      reason: "Needs a player on each team",
    });
    expect(teamCap("teams")).toBe(20);
  });
});

describe("results helpers", () => {
  it("top player is the highest scorer, ties broken by right answers", () => {
    const a = p({ user_id: "a", name: "Ana", points: 250, correct: 2 });
    const b = p({ user_id: "b", name: "Ben", points: 250, correct: 3 });
    expect(topPlayer([a, b])?.user_id).toBe("b");
  });
  it("no top player when nobody scored", () => {
    expect(topPlayer([p({}), p({ user_id: "b" })])).toBeNull();
  });
  it("accuracy is right out of played, as a whole percent", () => {
    expect(accuracy(7, 10)).toBe(70);
    expect(accuracy(2, 3)).toBe(67);
    expect(accuracy(0, 0)).toBe(0);
  });
  it("round team points add up each side's picks", () => {
    const s: BattleState = {
      ...base,
      players: [
        p({ user_id: "a" }),
        p({ user_id: "b", team: 2 }),
        p({ user_id: "c", team: 2 }),
      ],
      current: {
        no: 1,
        prompt: "Q",
        options: ["a", "b"],
        started_at: base.now,
        ends_at: base.now,
        closed_at: base.now,
        answered: 3,
        my_choice: 0,
        correct_index: 0,
        results: [
          { user_id: "a", choice: 0, points: 140, is_correct: true },
          { user_id: "b", choice: 1, points: 0, is_correct: false },
          { user_id: "c", choice: 0, points: 110, is_correct: true },
        ],
      },
    };
    expect(roundTeamPoints(s)).toEqual([140, 110]);
  });
  it("msLeft counts down on the server clock and stops at zero", () => {
    const end = "2026-10-10T12:00:20.000Z";
    expect(msLeft(end, Date.parse("2026-10-10T12:00:05.000Z"))).toBe(15_000);
    expect(msLeft(end, Date.parse("2026-10-10T12:00:25.000Z"))).toBe(0);
    expect(msLeft(null, 0)).toBe(0);
  });
});
