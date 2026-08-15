"use client";

import { useEffect, useRef, useState } from "react";
import { CaptionsIcon, PauseIcon, PlayIcon, RotateCcwIcon, RotateCwIcon } from "@/components/icons";
import { activeCue, type VideoCue } from "@/lib/video-script";

function formatTime(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}:${rem.toString().padStart(2, "0")}`;
}

/**
 * Vertical video player (LEARN_AI_V1_BUILD_SPEC.md §7): 9:16 stage,
 * bottom-third one-handed controls (44px+ targets), captions on by
 * default. There is no real video file in this sample-data phase — the
 * "playback surface" is a muted, looping gradient and the progress bar
 * advances on a real-time interval, which is enough to exercise every
 * control without a media asset.
 */
export function VerticalVideoPlayer({
  title,
  durationS,
  cues,
}: {
  title: string;
  durationS: number;
  cues: VideoCue[];
}) {
  const [playing, setPlaying] = useState(false);
  const [currentS, setCurrentS] = useState(0);
  const [captionsOn, setCaptionsOn] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!playing) return undefined;
    intervalRef.current = setInterval(() => {
      setCurrentS((s) => (s + 1 >= durationS ? 0 : s + 1));
    }, 1000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [playing, durationS]);

  function seekBy(deltaS: number): void {
    setCurrentS((s) => Math.min(durationS, Math.max(0, s + deltaS)));
  }

  const cue = captionsOn ? activeCue(cues, currentS) : null;

  return (
    <div className="mx-auto w-full max-w-[300px]">
      <div className="relative aspect-[9/16] w-full overflow-hidden rounded-card bg-black">
        <div className={`video-stage-gradient absolute inset-0 ${playing ? "animate-video-drift" : ""}`} aria-hidden="true" />
        <div className="absolute inset-0 bg-black/10" aria-hidden="true" />

        {!playing && (
          <button
            type="button"
            onClick={() => setPlaying(true)}
            aria-label={`Play ${title}`}
            className="absolute inset-0 flex cursor-pointer items-center justify-center"
          >
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-surface/90 text-primary shadow-lg transition-transform duration-200 hover:scale-105">
              <PlayIcon size={28} className="ml-1" />
            </span>
          </button>
        )}

        {cue && (
          <div className="absolute inset-x-3 bottom-24 flex justify-center">
            <p className="rounded-control bg-black/70 px-3 py-1.5 text-center text-sm leading-snug font-medium text-white">
              {cue.text}
            </p>
          </div>
        )}

        {/* Bottom-third one-handed controls */}
        <div className="absolute inset-x-0 bottom-0 bg-linear-to-t from-black/85 via-black/50 to-transparent px-3 pt-10 pb-3">
          <div className="mb-2 flex items-center gap-2">
            <span className="w-9 shrink-0 text-right text-[11px] text-white/80 tabular-nums">
              {formatTime(currentS)}
            </span>
            <input
              type="range"
              min={0}
              max={durationS}
              step={1}
              value={currentS}
              onChange={(event) => setCurrentS(Number(event.target.value))}
              aria-label="Seek"
              className="h-1.5 flex-1 cursor-pointer accent-[var(--accent-fill)]"
            />
            <span className="w-9 shrink-0 text-[11px] text-white/80 tabular-nums">{formatTime(durationS)}</span>
          </div>

          <div className="flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => seekBy(-10)}
              aria-label="Back 10 seconds"
              className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-full text-white transition-colors duration-200 hover:bg-white/10"
            >
              <RotateCcwIcon size={20} />
            </button>
            <button
              type="button"
              onClick={() => setPlaying((p) => !p)}
              aria-label={playing ? "Pause" : "Play"}
              aria-pressed={playing}
              className="flex h-14 w-14 cursor-pointer items-center justify-center rounded-full bg-white text-primary transition-transform duration-200 hover:scale-105"
            >
              {playing ? <PauseIcon size={24} /> : <PlayIcon size={24} className="ml-0.5" />}
            </button>
            <button
              type="button"
              onClick={() => seekBy(10)}
              aria-label="Forward 10 seconds"
              className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-full text-white transition-colors duration-200 hover:bg-white/10"
            >
              <RotateCwIcon size={20} />
            </button>
            <button
              type="button"
              onClick={() => setCaptionsOn((c) => !c)}
              aria-pressed={captionsOn}
              aria-label={captionsOn ? "Turn captions off" : "Turn captions on"}
              className={`flex h-11 w-11 cursor-pointer items-center justify-center rounded-full transition-colors duration-200 ${
                captionsOn ? "bg-white text-primary" : "text-white hover:bg-white/10"
              }`}
            >
              <CaptionsIcon size={18} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
