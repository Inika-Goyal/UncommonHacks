"use client";

const VIDEO_SRC =
  "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260429_114316_1c7889ad-2885-410e-b493-98119fee0ddb.mp4";

export function VideoBackground() {
  return (
    <div className="fixed inset-0 z-0 overflow-hidden">
      <video
        src={VIDEO_SRC}
        autoPlay
        loop
        muted
        playsInline
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
