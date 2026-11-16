'use client';

import { useEffect, useRef } from 'react';

// The kiosk has no touchscreen. Children use three physical buttons, which
// reach the browser as keys:
//   yes  (green)  → Enter
//   no   (purple) → Escape
//   talk (held)   → Space
// On the Raspberry Pi the buttons are wired to GPIO pins and turned into
// these keys by the gpio-key overlay (docs/deployment.md, "Kiosk buttons").
// On a laptop, the keyboard does the same.

export type KioskButton = 'yes' | 'no' | 'talk';

// KeyboardEvent.code values for each button. Change them here (and in
// docs/deployment.md) if the buttons send other keys.
export const BUTTON_KEYS: Record<KioskButton, readonly string[]> = {
  yes: ['Enter', 'NumpadEnter'],
  no: ['Escape'],
  talk: ['Space'],
};

export function buttonForKey(code: string): KioskButton | null {
  for (const button of Object.keys(BUTTON_KEYS) as KioskButton[]) {
    if (BUTTON_KEYS[button].includes(code)) return button;
  }
  return null;
}

type Handlers = {
  // A button went down (key repeats while it is held are ignored).
  down: (button: KioskButton) => void;
  // A button came back up (talk ends the recording).
  up: (button: KioskButton) => void;
};

// Calls `down` and `up` for the kiosk buttons. Typing in a text box (the
// teacher's typing fallback) is left alone, except No (Escape) to cancel.
export function useKioskButtons(handlers: Handlers, enabled = true) {
  const latest = useRef(handlers);
  useEffect(() => {
    latest.current = handlers;
  });

  useEffect(() => {
    if (!enabled) return;
    const held = new Set<KioskButton>();
    const typing = (e: KeyboardEvent) => e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;

    const onDown = (e: KeyboardEvent) => {
      const button = buttonForKey(e.code);
      if (!button || (typing(e) && button !== 'no')) return;
      // No page scrolling, and no "click" on whatever button has focus.
      e.preventDefault();
      if (e.repeat || held.has(button)) return;
      held.add(button);
      latest.current.down(button);
    };
    const onUp = (e: KeyboardEvent) => {
      const button = buttonForKey(e.code);
      if (!button || !held.has(button)) return;
      e.preventDefault();
      held.delete(button);
      latest.current.up(button);
    };
    // A key let go while the window was not focused never sends keyup.
    const onBlur = () => {
      for (const button of held) latest.current.up(button);
      held.clear();
    };

    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
      window.removeEventListener('blur', onBlur);
    };
  }, [enabled]);
}
