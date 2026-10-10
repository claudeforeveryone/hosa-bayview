import { describe, expect, it } from "vitest";
import {
  STORAGE_LIMIT_BYTES,
  storageMeter,
  usedOfLimit,
} from "./format-bytes";

describe("usedOfLimit", () => {
  it("reads as used of the 1 GB limit", () => {
    expect(usedOfLimit(0)).toBe("0 B of 1 GB");
    expect(usedOfLimit(2516582)).toBe("2.4 MB of 1 GB");
    expect(usedOfLimit(STORAGE_LIMIT_BYTES)).toBe("1 GB of 1 GB");
  });
});

describe("storageMeter", () => {
  it("is 1 GB and warns from 80%", () => {
    expect(STORAGE_LIMIT_BYTES).toBe(1073741824);
    expect(storageMeter(0)).toEqual({ percent: 0, warn: false, valueText: "0 B of 1 GB" });
    expect(storageMeter(STORAGE_LIMIT_BYTES * 0.79).warn).toBe(false);
    expect(storageMeter(STORAGE_LIMIT_BYTES * 0.8).warn).toBe(true);
    expect(storageMeter(STORAGE_LIMIT_BYTES * 0.8).percent).toBe(80);
  });

  it("caps the bar at 100% and treats bad numbers as empty", () => {
    expect(storageMeter(STORAGE_LIMIT_BYTES * 2)).toEqual({
      percent: 100,
      warn: true,
      valueText: "2 GB of 1 GB",
    });
    expect(storageMeter(-1)).toEqual({ percent: 0, warn: false, valueText: "0 B of 1 GB" });
    expect(storageMeter(Number.NaN)).toEqual({ percent: 0, warn: false, valueText: "0 B of 1 GB" });
  });

  it("warns on the same rounded percent the bar shows (79.5% shows 80% and warns)", () => {
    const m = storageMeter(STORAGE_LIMIT_BYTES * 0.795);
    expect(m).toMatchObject({ percent: 80, warn: true });
    expect(storageMeter(STORAGE_LIMIT_BYTES * 0.794)).toMatchObject({ percent: 79, warn: false });
  });

  it("speaks the bar as X of 1 GB", () => {
    expect(storageMeter(2516582).valueText).toBe("2.4 MB of 1 GB");
  });
});
