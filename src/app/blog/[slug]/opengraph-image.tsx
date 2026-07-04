import { ImageResponse } from "next/og";
import { getAllBlogPosts, getBlogPostBySlug } from "@/lib/blog";

export const alt = "株式会社ミチビキ ブログ";
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";

export function generateStaticParams() {
  return getAllBlogPosts().map((p) => ({ slug: p.slug }));
}

async function loadGoogleFont(text: string) {
  const url = `https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@700&text=${encodeURIComponent(text)}`;
  const css = await (await fetch(url)).text();
  const resource = css.match(/src: url\((.+?)\) format\('(opentype|truetype)'\)/);
  if (resource) {
    const res = await fetch(resource[1]);
    if (res.ok) return res.arrayBuffer();
  }
  throw new Error("フォントの取得に失敗しました");
}

export default async function OgImage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = getBlogPostBySlug(slug);
  const title = post?.title ?? "ブログ";
  const category = post?.category ?? "";
  const date = post?.date ?? "";

  const fontText = `${title}${category}${date}株式会社ミチビキMICHIBIKIBLOGmichi-biki.jp0123456789.-`;
  const fontData = await loadGoogleFont(fontText);
  const titleFontSize = title.length > 32 ? 50 : 58;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          backgroundColor: "#f6f4ef",
          padding: 40,
          fontFamily: "Noto Sans JP",
        }}
      >
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            border: "2px solid #c9b58a",
            padding: "44px 56px",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <div
              style={{
                display: "flex",
                fontSize: 26,
                letterSpacing: 10,
                color: "#a17c3f",
              }}
            >
              MICHIBIKI BLOG
            </div>
            {category && (
              <div
                style={{
                  display: "flex",
                  fontSize: 22,
                  letterSpacing: 4,
                  color: "#86672f",
                  border: "1px solid #c9b58a",
                  padding: "8px 20px",
                }}
              >
                {category}
              </div>
            )}
          </div>

          <div
            style={{
              display: "flex",
              fontSize: titleFontSize,
              fontWeight: 700,
              color: "#1c1b18",
              lineHeight: 1.45,
              maxWidth: 1000,
            }}
          >
            {title}
          </div>

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                fontSize: 28,
                color: "#1c1b18",
              }}
            >
              株式会社ミチビキ
              <div
                style={{
                  display: "flex",
                  fontSize: 22,
                  color: "#8b877c",
                  marginLeft: 24,
                }}
              >
                michi-biki.jp
              </div>
            </div>
            {date && (
              <div style={{ display: "flex", fontSize: 24, color: "#8b877c" }}>{date}</div>
            )}
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        {
          name: "Noto Sans JP",
          data: fontData,
          weight: 700,
          style: "normal",
        },
      ],
    }
  );
}
