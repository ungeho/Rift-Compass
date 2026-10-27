/** YouTube の動画 URL に開始秒（t=秒s）を付ける。既存のクエリ（v= など）は保持し、既存の t は置き換える。
 *  YouTube 以外の URL や解釈できない URL には null を返す。 */
export function youtubeAt(url: string, seconds: number): string | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^www\.|^m\./, "");
  if (host !== "youtube.com" && host !== "youtu.be") return null;
  u.searchParams.set("t", `${Math.max(0, Math.floor(seconds))}s`);
  return u.toString();
}

/** 外部リンクの安全な属性 */
export const externalLinkProps = { target: "_blank", rel: "noopener noreferrer" } as const;
