import { ImageResponse } from "next/og";

export const runtime = "edge";

export const alt = "株式会社ミチビキ｜人とペットの豊かな未来へ";
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#1e3a8a",
          backgroundImage:
            "linear-gradient(135deg, #1e3a8a 0%, #2563eb 55%, #3b82f6 100%)",
          color: "#ffffff",
          fontFamily: "sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            fontSize: 40,
            letterSpacing: 8,
            color: "#bfdbfe",
            marginBottom: 24,
          }}
        >
          MICHIBIKI
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 88,
            fontWeight: 700,
            marginBottom: 32,
          }}
        >
          株式会社ミチビキ
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 44,
            fontWeight: 500,
            color: "#e0ecff",
          }}
        >
          人とペットの豊かな未来へ
        </div>
      </div>
    ),
    {
      ...size,
    }
  );
}
