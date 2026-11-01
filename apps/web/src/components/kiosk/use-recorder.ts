'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

// Records the child's voice from the kiosk microphone. Stops on its own
// after a short silence once the child has spoken, or after MAX_MS. The
// recording stays in the browser's memory until it is sent to be turned into
// text; it is never saved.

const MAX_MS = 10_000;
const SILENCE_MS = 1_600;
const SPEECH_LEVEL = 0.06; // loudness (0..1) that counts as talking

export type Recording = { blob: Blob; spoke: boolean };

export function useRecorder() {
  const [recording, setRecording] = useState(false);
  const [level, setLevel] = useState(0);
  const stopRef = useRef<(() => void) | null>(null);

  const start = useCallback(async (): Promise<Recording> => {
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
      let lastLoud = performance.now();
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
        setLevel(rms);
        const now = performance.now();
        if (rms > SPEECH_LEVEL) {
          spoke = true;
          lastLoud = now;
        }
        if ((spoke && now - lastLoud > SILENCE_MS) || now - began > MAX_MS) finish();
        else frame = requestAnimationFrame(tick);
      };

      recorder.onstop = () => {
        cancelAnimationFrame(frame);
        stream.getTracks().forEach((t) => t.stop());
        void ctx.close();
        stopRef.current = null;
        setRecording(false);
        setLevel(0);
        resolve({ blob: new Blob(chunks, { type: recorder.mimeType || 'audio/webm' }), spoke });
      };
      recorder.onerror = (e) => reject((e as unknown as { error: Error }).error ?? new Error('Recording failed'));

      recorder.start(250);
      setRecording(true);
      frame = requestAnimationFrame(tick);
    });
  }, []);

  const stop = useCallback(() => stopRef.current?.(), []);

  useEffect(() => () => stopRef.current?.(), []);

  return { start, stop, recording, level };
}

// The browser's own speech recognition: the fallback when the server has
// no speech-to-text key. Chromium needs to be online for it.
type Recognition = {
  lang: string;
  interimResults: boolean;
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
