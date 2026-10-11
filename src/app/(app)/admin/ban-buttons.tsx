import { Button } from "@/components/form";

// The two steps of a ban: "Ban" arms it, "Yes, ban" submits the form. Each step has its own key so React swaps in
// new buttons instead of reusing the one just clicked. Without the keys, React kept the clicked "Ban" button and
// set its type to "submit" while the click was still being handled, so the browser submitted the form: one tap
// banned the member with no confirm step.
export function BanButtons({
  confirming,
  pending,
  disabled,
  onArm,
  onCancel,
}: {
  confirming: boolean;
  pending: boolean;
  /** No valid end date yet. */
  disabled: boolean;
  onArm: () => void;
  onCancel: () => void;
}) {
  return confirming ? (
    <div key="confirm" className="flex flex-wrap items-center gap-3">
      <Button type="submit" disabled={pending || disabled}>
        {pending ? "Banning" : "Yes, ban"}
      </Button>
      <Button variant="line" type="button" onClick={onCancel} disabled={pending}>
        Cancel
      </Button>
    </div>
  ) : (
    <div key="arm">
      <Button variant="line" type="button" onClick={onArm} disabled={disabled}>
        Ban
      </Button>
    </div>
  );
}
