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

/** 検索語が League of Legends の話だと分かる語を含むか */
const MENTIONS_LOL = /league\s*of\s*legends|(?<![a-z0-9])lol(?![a-z0-9])|リーグ・?オブ・?レジェンド/i;

/** 利用者が自分で開く外部検索（Google / YouTube）の URL。検索語が空なら null。
 *  Rift Compass からは検索 API を呼ばず、利用者がリンクを開いたときに初めて外部へ検索語が送られる。 */
export function externalSearchUrls(query: string): { google: string; youtube: string } | null {
  const q = query.normalize("NFKC").replace(/\s+/g, " ").trim();
  if (!q) return null;
  const terms = MENTIONS_LOL.test(q) ? q : `${q} League of Legends`;
  const google = new URL("https://www.google.com/search");
  google.searchParams.set("q", terms);
  const youtube = new URL("https://www.youtube.com/results");
  youtube.searchParams.set("search_query", terms);
  return { google: google.toString(), youtube: youtube.toString() };
}

/** 外部リンクの安全な属性 */
export const externalLinkProps = { target: "_blank", rel: "noopener noreferrer" } as const;
