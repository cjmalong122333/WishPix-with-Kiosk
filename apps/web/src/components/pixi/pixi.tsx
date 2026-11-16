'use client';

import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import type { PixiAnchor, PixiMood, PixiOptions, PixiScene } from './scene';

export type { PixiAnchor, PixiMood } from './scene';

type Props = {
  mood: PixiMood;
  // Microphone loudness 0..1 while listening: a number, or a function read
  // every frame (so a live level doesn't re-render the page).
  level?: number | (() => number);
  // The finished picture, shown on the printed worksheets and in Pixi's crest frame.
  picture?: string | null;
  // What the child asked for (Pixi draws a matching doodle while the picture is made).
  wish?: string | null;
  // Stop drawing while Pixi is hidden or the screen sleeps.
  paused?: boolean;
  // Called if there is no WebGL or the computer is too slow, so the page can
  // show something else instead.
  onUnavailable?: () => void;
  quality?: PixiOptions['quality'];
  className?: string;
  // Things drawn over Pixi that follow its head, like the ThoughtBubble.
  children?: React.ReactNode;
};

type AnchorListener = (anchor: PixiAnchor) => void;
type Overlay = { listeners: Set<AnchorListener>; setHeadroom: (px: number) => void };
const Anchors = createContext<Overlay | null>(null);

// Pixi, the WishPix mascot, as a live 3D animation. three.js is loaded only
// on screens that show Pixi.
export function Pixi({ mood, level = 0, picture = null, wish = null, paused = false, onUnavailable, quality = 'auto', className, children }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const scene = useRef<PixiScene | null>(null);
  const latest = useRef({ mood, level, picture, wish, paused });
  const unavailable = useRef(onUnavailable);
  const headroom = useRef(0);
  const [overlay] = useState<Overlay>(() => ({
    listeners: new Set(),
    setHeadroom: (px) => {
      headroom.current = px;
      scene.current?.setHeadroom(px);
    },
  }));

  useEffect(() => {
    unavailable.current = onUnavailable;
  }, [onUnavailable]);

  useEffect(() => {
    latest.current = { mood, level, picture, wish, paused };
    scene.current?.setWish(wish);
    scene.current?.setMood(mood);
    scene.current?.setLevel(level);
    scene.current?.setPaused(paused);
  }, [mood, level, picture, wish, paused]);

  useEffect(() => {
    scene.current?.setPicture(picture);
  }, [picture]);

  useEffect(() => {
    let cancelled = false;
    let created: PixiScene | null = null;
    void import('./scene').then(({ createPixiScene }) => {
      if (cancelled || !host.current) return;
      try {
        created = createPixiScene(host.current, {
          quality,
          onTooSlow: () => unavailable.current?.(),
          onAnchor: (anchor) => {
            for (const listener of overlay.listeners) listener(anchor);
          },
        });
      } catch (err) {
        console.error('Pixi animation could not start', err);
        unavailable.current?.();
        return;
      }
      const now = latest.current;
      created.setWish(now.wish);
      created.setMood(now.mood);
      created.setLevel(now.level);
      created.setPicture(now.picture);
      created.setPaused(now.paused);
      created.setHeadroom(headroom.current);
      scene.current = created;
    });
    return () => {
      cancelled = true;
      created?.dispose();
      scene.current = null;
    };
  }, [quality, overlay]);

  return (
    <div className={cn('relative', className)}>
      <div ref={host} className="absolute inset-0" aria-hidden />
      <Anchors value={overlay}>{children}</Anchors>
    </div>
  );
}

// Calls `listener` every frame with where Pixi's head is on screen. Only
// works inside <Pixi>. The listener should only move elements (no React
// state), since it runs 60 times a second.
export function usePixiAnchor(listener: AnchorListener) {
  const listeners = useContext(Anchors)?.listeners;
  const latest = useRef(listener);
  useEffect(() => {
    latest.current = listener;
  });
  useEffect(() => {
    if (!listeners) return;
    const call: AnchorListener = (anchor) => latest.current(anchor);
    listeners.add(call);
    return () => {
      listeners.delete(call);
    };
  }, [listeners]);
}

// Asks <Pixi> for `px` CSS pixels of clear space above its crest (0 for
// none); the camera zooms out just enough. Only works inside <Pixi>.
export function usePixiHeadroom(px: number) {
  const overlay = useContext(Anchors);
  useEffect(() => {
    if (!overlay) return;
    overlay.setHeadroom(px);
    return () => overlay.setHeadroom(0);
  }, [overlay, px]);
}
