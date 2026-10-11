// Browser install state, shared by the install card and the Settings section. Client-only.
// beforeinstallprompt is captured as soon as this module loads, so a card that mounts a moment later still gets it.

type BeforeInstallPrompt = Event & {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

let deferred: BeforeInstallPrompt | null = null;
let installed = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    // Hold the browser's own mini-infobar back; the app shows its own card and button instead.
    event.preventDefault();
    deferred = event as BeforeInstallPrompt;
    emit();
  });
  window.addEventListener("appinstalled", () => {
    installed = true;
    deferred = null;
    emit();
  });
}

export function subscribeInstall(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export const canPromptInstall = () => deferred !== null;
export const wasJustInstalled = () => installed;

// Runs the browser's install dialog. A prompt can be used once; the next one arrives with a later visit.
export async function promptInstall(): Promise<
  "accepted" | "dismissed" | "unavailable"
> {
  const event = deferred;
  if (!event) return "unavailable";
  deferred = null;
  emit();
  try {
    await event.prompt();
    const choice = await event.userChoice;
    return choice.outcome;
  } catch {
    // A prompt can only be shown once; a stale one throws.
    return "unavailable";
  }
}
