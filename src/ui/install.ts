/**
 * Installing the game as an app. Chrome, Edge and Android offer a real install prompt
 * (`beforeinstallprompt`); Safari on iPhone and iPad has none, so there we explain
 * "Share → Add to Home Screen". Once installed (running standalone), the button goes away.
 */

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: InstallPromptEvent | null = null;
let installed = false;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((f) => f());

/** Call once, as early as possible: the prompt event fires soon after load. */
export function watchInstall(): void {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // keep it for our own button
    deferred = e as InstallPromptEvent;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    installed = true;
    deferred = null;
    notify();
  });
}

export function onInstallChange(f: () => void): void {
  listeners.add(f);
}

function standalone(): boolean {
  return (
    installed ||
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function ios(): boolean {
  const ua = navigator.userAgent;
  return /iphone|ipad|ipod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

export type InstallWay = 'installed' | 'prompt' | 'ios' | 'manual';

export function installWay(): InstallWay {
  if (standalone()) return 'installed';
  if (deferred) return 'prompt';
  return ios() ? 'ios' : 'manual';
}

/** Show the browser's prompt. Resolves true if the player accepted. */
export async function promptInstall(): Promise<boolean> {
  const e = deferred;
  if (!e) return false;
  deferred = null;
  await e.prompt();
  const { outcome } = await e.userChoice;
  if (outcome === 'accepted') installed = true;
  notify();
  return outcome === 'accepted';
}

/** Steps for browsers without a prompt. */
export const INSTALL_STEPS: Record<'ios' | 'manual', string[]> = {
  ios: ['Tap the <b>Share</b> button in Safari (the square with an arrow).', 'Choose <b>Add to Home Screen</b>.', 'Tap <b>Add</b>. The game opens full screen from your home screen and plays offline.'],
  manual: [
    'Open your browser menu (⋮ or ⋯).',
    'Choose <b>Install app</b> or <b>Add to Home screen</b>.',
    'The game then opens in its own window and plays offline.',
  ],
};
