import { describe, expect, it } from "vitest";
import { beatsBest, formatMatchTime, matchNote, standardRound } from "./match-times";

describe("formatMatchTime", () => {
  it("shows under a minute in seconds with one decimal", () => {
    expect(formatMatchTime(12345)).toBe("12.3 s");
    expect(formatMatchTime(900)).toBe("0.9 s");
    expect(formatMatchTime(0)).toBe("0.0 s");
  });

  it("rounds to the nearest tenth", () => {
    expect(formatMatchTime(12340)).toBe("12.3 s");
    expect(formatMatchTime(12360)).toBe("12.4 s");
  });

  it("shows a minute or more as minutes, seconds and tenths", () => {
    expect(formatMatchTime(60000)).toBe("1:00.0");
    expect(formatMatchTime(65300)).toBe("1:05.3");
    expect(formatMatchTime(754400)).toBe("12:34.4");
  });

  it("does not show 60.0 s when the time rounds up to a minute", () => {
    expect(formatMatchTime(59960)).toBe("1:00.0");
  });
});

describe("beatsBest", () => {
  it("makes the first full-deck match a new best", () => {
    expect(beatsBest(null, 9000, true)).toBe(true);
  });

  it("needs a strictly faster time to beat the previous best", () => {
    expect(beatsBest(5000, 4000, true)).toBe(true);
    expect(beatsBest(5000, 5000, true)).toBe(false);
    expect(beatsBest(5000, 6000, true)).toBe(false);
  });

  it("never makes a partial round a new best", () => {
    expect(beatsBest(null, 1000, false)).toBe(false);
    expect(beatsBest(5000, 1000, false)).toBe(false);
  });
});

describe("matchNote", () => {
  it("says new best when the match beat the previous best", () => {
    expect(matchNote({ isFullDeck: true, isNewBest: true, previousBestMs: 5000 })).toBe("New best");
    expect(matchNote({ isFullDeck: true, isNewBest: true, previousBestMs: null })).toBe("New best");
  });

  it("shows the previous best when the match did not beat it", () => {
    expect(matchNote({ isFullDeck: true, isNewBest: false, previousBestMs: 5000 })).toBe("Best 5.0 s");
  });

  it("shows the previous best for a partial round too", () => {
    expect(matchNote({ isFullDeck: false, isNewBest: false, previousBestMs: 5000 })).toBe("Best 5.0 s");
  });

  it("says a partial round is not counted when there is no best yet", () => {
    expect(matchNote({ isFullDeck: false, isNewBest: false, previousBestMs: null })).toBe(
      "Not a full round, so not counted",
    );
  });
});

describe("standardRound", () => {
  it("is 10 cards, or the whole deck when it is smaller", () => {
    expect(standardRound(25)).toBe(10);
    expect(standardRound(10)).toBe(10);
    expect(standardRound(3)).toBe(3);
    expect(standardRound(1)).toBe(1);
  });
});
