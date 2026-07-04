import { ImageResponse } from "next/og";

export const runtime = "edge";

export const alt = "株式会社ミチビキ｜SEO・AXO/LLMOコンサルティング";
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
          backgroundColor: "#14130f",
          color: "#f6f4ef",
          fontFamily: "serif",
        }}
      >
        <div
          style={{
            display: "flex",
            fontSize: 30,
            letterSpacing: 14,
            color: "#a17c3f",
            marginBottom: 32,
          }}
        >
          MICHIBIKI INC.
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 92,
            fontWeight: 700,
            marginBottom: 36,
          }}
        >
          株式会社ミチビキ
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 40,
            fontWeight: 500,
            color: "#d8d4c8",
          }}
        >
          検索にも、AIにも、選ばれる。
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 48,
            fontSize: 24,
            letterSpacing: 6,
            color: "#8b877c",
          }}
        >
          SEO / AXO / LLMO / CVR / DATA
        </div>
      </div>
    ),
    {
      ...size,
    }
  );
}
