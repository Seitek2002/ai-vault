import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 7,
          background: "linear-gradient(135deg, #5B9DFF, #A78BFA)",
        }}
      >
        <svg
          width="21"
          height="21"
          viewBox="0 0 24 24"
          fill="none"
          stroke="white"
          strokeWidth="2.3"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect width="18" height="18" x="3" y="3" rx="4" />
          <circle cx="7.5" cy="7.5" r="0.5" fill="white" stroke="none" />
          <path d="m7.9 7.9 2.7 2.7" />
          <circle cx="16.5" cy="7.5" r="0.5" fill="white" stroke="none" />
          <path d="m13.4 10.6 2.7-2.7" />
          <circle cx="7.5" cy="16.5" r="0.5" fill="white" stroke="none" />
          <path d="m7.9 16.1 2.7-2.7" />
          <circle cx="16.5" cy="16.5" r="0.5" fill="white" stroke="none" />
          <path d="m13.4 13.4 2.7 2.7" />
          <circle cx="12" cy="12" r="2" />
        </svg>
      </div>
    ),
    { ...size },
  );
}
