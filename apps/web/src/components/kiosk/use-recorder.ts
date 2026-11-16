'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

// Records the child's voice from the kiosk microphone while the talk button
// is held down: stop() is called when it is let go. MAX_MS is a safety limit
// for a button that stays down. The recording stays in the browser's memory
// until it is sent to be turned into text; it is never saved.

const MAX_MS = 15_000;
const SPEECH_LEVEL = 0.06; // loudness (0..1) that counts as talking

export type Recording = { blob: Blob; spoke: boolean };

export function useRecorder() {
  const [recording, setRecording] = useState(false);
  // Microphone loudness 0..1, updated every frame. A ref, not state, so the
  // kiosk is not re-rendered 60 times a second; read it in an animation frame.
  const level = useRef(0);
  const stopRef = useRef<(() => void) | null>(null);
  // stop() came before the microphone was open (a very short press).
  const stopEarly = useRef(false);

  const start = useCallback(async (): Promise<Recording> => {
    stopEarly.current = false;
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
    });
    const type = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'].find((t) => MediaRecorder.isTypeSupported(t));
    const recorder = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);

    const ctx = new AudioContext();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    ctx.createMediaStreamSource(stream).connect(analyser);
    const samples = new Float32Array(analyser.fftSize);

    return new Promise<Recording>((resolve, reject) => {
      let spoke = false;
      const began = performance.now();
      let frame = 0;

      const finish = () => {
        if (recorder.state !== 'inactive') recorder.stop();
      };
      stopRef.current = finish;

      const tick = () => {
        analyser.getFloatTimeDomainData(samples);
        let sum = 0;
        for (const s of samples) sum += s * s;
        const rms = Math.min(1, Math.sqrt(sum / samples.length) * 4);
        level.current = rms;
        if (rms > SPEECH_LEVEL) spoke = true;
        if (performance.now() - began > MAX_MS) finish();
        else frame = requestAnimationFrame(tick);
      };

      recorder.onstop = () => {
        cancelAnimationFrame(frame);
        stream.getTracks().forEach((t) => t.stop());
        void ctx.close();
        stopRef.current = null;
        level.current = 0;
        setRecording(false);
        resolve({ blob: new Blob(chunks, { type: recorder.mimeType || 'audio/webm' }), spoke });
      };
      recorder.onerror = (e) => reject((e as unknown as { error: Error }).error ?? new Error('Recording failed'));

      recorder.start(250);
      setRecording(true);
      frame = requestAnimationFrame(tick);
      if (stopEarly.current) finish();
    });
  }, []);

  const stop = useCallback(() => {
    if (stopRef.current) stopRef.current();
    else stopEarly.current = true;
  }, []);

  useEffect(() => () => stopRef.current?.(), []);

  return { start, stop, recording, level };
}

// The browser's own speech recognition: the fallback when the server has
// no speech-to-text key. Chromium needs to be online for it.
type Recognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
};

export function browserRecognition(): (new () => Recognition) | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}
