import { describe, expect, it } from "vitest";
import { channelHref, channelLabel, inChannel, parseChannel, postChannels } from "./announcement-channels";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const C = "33333333-3333-4333-8333-333333333333";
const rooms = [
  { id: A, name: "Medical Terminology", can_manage: true },
  { id: B, name: "Pathophysiology", can_manage: false },
];

describe("parseChannel", () => {
  it("reads chapter, your rooms, and everything else as all", () => {
    expect(parseChannel("chapter", rooms)).toBe("chapter");
    expect(parseChannel(A, rooms)).toBe(A);
    expect(parseChannel([B], rooms)).toBe(B);
    expect(parseChannel(C, rooms)).toBe("all");
    expect(parseChannel(undefined, rooms)).toBe("all");
  });
});

describe("inChannel", () => {
  it("keeps the chapter and your rooms in all, and drops rooms you're not in", () => {
    expect(inChannel(null, "all", rooms)).toBe(true);
    expect(inChannel(A, "all", rooms)).toBe(true);
    expect(inChannel(C, "all", rooms)).toBe(false);
  });
  it("narrows to one channel", () => {
    expect(inChannel(null, "chapter", rooms)).toBe(true);
    expect(inChannel(A, "chapter", rooms)).toBe(false);
    expect(inChannel(A, A, rooms)).toBe(true);
    expect(inChannel(B, A, rooms)).toBe(false);
    expect(inChannel(null, A, rooms)).toBe(false);
  });
});

describe("postChannels", () => {
  it("gives an executive the chapter and the rooms they manage", () => {
    expect(postChannels(true, rooms, "all").map((o) => o.value)).toEqual(["chapter", A]);
  });
  it("gives a trainer only the rooms they manage", () => {
    expect(postChannels(false, rooms, "all").map((o) => o.value)).toEqual([A]);
    expect(postChannels(false, [rooms[1]], "all")).toEqual([]);
  });
  it("starts on the channel you're looking at", () => {
    expect(postChannels(true, rooms, A).map((o) => o.value)).toEqual([A, "chapter"]);
    expect(postChannels(true, rooms, B).map((o) => o.value)).toEqual(["chapter", A]);
  });
});

describe("labels and links", () => {
  it("names the channel", () => {
    expect(channelLabel(null, rooms)).toBe("Chapter");
    expect(channelLabel(A, rooms)).toBe("Medical Terminology");
    expect(channelLabel(C, rooms)).toBe("Event room");
  });
  it("links each channel", () => {
    expect(channelHref("all")).toBe("/announcements");
    expect(channelHref("chapter")).toBe("/announcements?channel=chapter");
    expect(channelHref(A)).toBe(`/announcements?channel=${A}`);
  });
});
