import { createElement, isValidElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BanButtons } from "./ban-buttons";

const noop = () => {};
const props = { pending: false, disabled: false, onArm: noop, onCancel: noop };
const branch = (confirming: boolean) =>
  BanButtons({ ...props, confirming }) as ReactElement;

describe("BanButtons", () => {
  // The bug: both branches were a keyless <div> whose first child is a <button>, so React kept the same DOM button
  // when Ban was clicked and flipped its type to "submit" while the click was still running. The browser then
  // submitted the form: one tap banned with no confirm step.
  it("gives the arm and confirm branches different keys, so the clicked button is never reused as submit", () => {
    const arm = branch(false);
    const confirm = branch(true);
    expect(isValidElement(arm) && isValidElement(confirm)).toBe(true);
    expect(arm.key).not.toBeNull();
    expect(confirm.key).not.toBeNull();
    expect(arm.key).not.toBe(confirm.key);
  });

  it("arming renders no submit button", () => {
    const out = renderToStaticMarkup(createElement(BanButtons, { ...props, confirming: false }));
    expect(out).not.toContain('type="submit"');
    expect(out).toContain('type="button"');
    expect(out).toContain(">Ban<");
  });

  it("confirming renders one submit (Yes, ban) and a Cancel button", () => {
    const out = renderToStaticMarkup(createElement(BanButtons, { ...props, confirming: true }));
    expect(out.match(/type="submit"/g)?.length).toBe(1);
    expect(out).toContain("Yes, ban");
    expect(out).toContain("Cancel");
  });

  it("can't arm or confirm a ban without a valid date", () => {
    const arm = renderToStaticMarkup(createElement(BanButtons, { ...props, confirming: false, disabled: true }));
    const confirm = renderToStaticMarkup(createElement(BanButtons, { ...props, confirming: true, disabled: true }));
    expect(arm).toMatch(/<button[^>]*disabled/);
    expect(confirm).toMatch(/<button[^>]*type="submit"[^>]*disabled|<button[^>]*disabled[^>]*type="submit"/);
  });
});
