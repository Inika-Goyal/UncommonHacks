"use client";

import { useEffect, useRef } from "react";

const VIDEO_SRC =
  "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260429_114316_1c7889ad-2885-410e-b493-98119fee0ddb.mp4";

// Frames where we flip direction. Snapping a few frames in from each end
// avoids the freeze-then-decode hitch that produces the jitter on restart.
const EDGE_TRIM = 0.12;
const REVERSE_FPS = 30;
const REVERSE_STEP = 1 / REVERSE_FPS;

export function VideoBackground() {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    let direction: "forward" | "reverse" = "forward";
    let rafId = 0;
    let lastFrameTime = 0;
    let detachListeners = () => {};

    const startForward = () => {
      direction = "forward";
      video.playbackRate = 1;
      const playPromise = video.play();
      if (playPromise && typeof playPromise.catch === "function") {
        playPromise.catch(() => {
          // Autoplay can be rejected before user gesture; harmless here — we keep
          // the canvas covered by gradients and the next gesture resumes it.
        });
      }
    };

    const startReverse = () => {
      direction = "reverse";
      video.pause();
      lastFrameTime = performance.now();
      rafId = requestAnimationFrame(stepReverse);
    };

    // Reverse playback isn't reliable across browsers via negative playbackRate
    // (Safari ignores it). Manually scrubbing currentTime backwards at a fixed
    // frame cadence gives a smooth ping-pong with no decode hitch.
    const stepReverse = (now: number) => {
      if (direction !== "reverse") return;
      const elapsed = now - lastFrameTime;
      if (elapsed >= 1000 / REVERSE_FPS) {
        lastFrameTime = now;
        const next = video.currentTime - REVERSE_STEP;
        if (next <= EDGE_TRIM) {
          video.currentTime = EDGE_TRIM;
          startForward();
          return;
        }
        video.currentTime = next;
      }
      rafId = requestAnimationFrame(stepReverse);
    };

    const handleTimeUpdate = () => {
      if (direction !== "forward") return;
      const duration = Number.isFinite(video.duration) ? video.duration : 0;
      if (duration > 0 && video.currentTime >= duration - EDGE_TRIM) {
        startReverse();
      }
    };

    const handleEnded = () => {
      if (direction === "forward") startReverse();
    };

    const handleLoaded = () => {
      startForward();
    };

    video.addEventListener("timeupdate", handleTimeUpdate);
    video.addEventListener("ended", handleEnded);
    video.addEventListener("loadedmetadata", handleLoaded);

    if (video.readyState >= 1) {
      startForward();
    }

    detachListeners = () => {
      video.removeEventListener("timeupdate", handleTimeUpdate);
      video.removeEventListener("ended", handleEnded);
      video.removeEventListener("loadedmetadata", handleLoaded);
    };

    return () => {
      cancelAnimationFrame(rafId);
      detachListeners();
    };
  }, []);

  return (
    <div className="fixed inset-0 z-0 overflow-hidden">
      <video
        ref={videoRef}
        src={VIDEO_SRC}
        autoPlay
        muted
        playsInline
        preload="auto"
        className="absolute inset-0 w-full h-full object-cover"
        style={{ filter: "hue-rotate(200deg) saturate(1.4) brightness(0.7)" }}
      />
      <div
        className="absolute inset-0"
        style={{
          zIndex: 1,
          background:
            "linear-gradient(to bottom, rgba(5, 10, 30, 0.5) 0%, rgba(180, 80, 40, 0.15) 50%, rgba(5, 10, 30, 0.7) 100%)",
        }}
      />
      <div
        className="absolute inset-0"
        style={{
          zIndex: 2,
          background: "rgba(10, 15, 40, 0.25)",
          mixBlendMode: "multiply",
        }}
      />
    </div>
  );
}
