import { ImageResponse } from "next/og";

export const alt = "Trackr: your job search, tracked for you";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const STAGES = [
  { label: "Applied", color: "#8b9bb4" },
  { label: "Assessment", color: "#f59e0b" },
  { label: "Interview", color: "#3b82f6" },
  { label: "Offer", color: "#10b981" },
];

/** The preview shown when a Trackr link is shared. */
export default function OpenGraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: 80,
        background: "#0b0b0d",
        color: "#fafafa",
        fontFamily: "sans-serif",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
        <svg width="64" height="64" viewBox="0 0 24 24">
          <rect width="24" height="24" rx="6" fill="#155dfc" />
          <path
            d="M6.5 15.5 10 12l2.75 2.75L17.5 10"
            fill="none"
            stroke="#fff"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <span style={{ fontSize: 44, fontWeight: 600 }}>Trackr</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <span style={{ fontSize: 72, fontWeight: 600, letterSpacing: -2 }}>
          Your job search, tracked for you.
        </span>
        <span style={{ fontSize: 32, color: "#a1a1aa" }}>
          Applications captured as you apply and kept current from your inbox.
        </span>
      </div>
      <div style={{ display: "flex", gap: 16 }}>
        {STAGES.map((stage) => (
          <div
            key={stage.label}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "12px 20px",
              borderRadius: 12,
              border: "1px solid #27272a",
              background: "#141417",
              fontSize: 26,
            }}
          >
            <div
              style={{
                width: 14,
                height: 14,
                borderRadius: 7,
                background: stage.color,
              }}
            />
            {stage.label}
          </div>
        ))}
      </div>
    </div>,
    size,
  );
}
