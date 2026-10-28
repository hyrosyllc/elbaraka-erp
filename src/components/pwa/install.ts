'use client';

import { useSyncExternalStore } from 'react';

export type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> };

export const OPEN_INSTALL_EVENT = 'elbaraka:open-install';

type State = { event: InstallEvent | null; installed: boolean };
let state: State = { event: null, installed: false };
const listeners = new Set<() => void>();
const set = (next: State) => { state = next; listeners.forEach((fn) => fn()); };

if (typeof window !== 'undefined') {
  // Captured at module load so late-mounted UI (the sidebar) still gets the event.
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    set({ ...state, event: event as InstallEvent });
  });
  window.addEventListener('appinstalled', () => set({ event: null, installed: true }));
}

export function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

export async function promptInstall() {
  const event = state.event;
  if (!event) return false;
  await event.prompt();
  const choice = await event.userChoice;
  set({ ...state, event: null });
  return choice.outcome === 'accepted';
}

const subscribe = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };

export function useInstallApp() {
  const current = useSyncExternalStore(subscribe, () => state, () => state);
  const standalone = useSyncExternalStore(() => () => undefined, () => (typeof window === 'undefined' ? false : isStandalone()), () => false);
  return { event: current.event, installed: current.installed || standalone };
}

export const requestInstallUi = () => window.dispatchEvent(new Event(OPEN_INSTALL_EVENT));
