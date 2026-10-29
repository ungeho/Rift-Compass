// ハッシュルーティング（静的ホスティングでリロード・URL共有しても同じ画面を再表示できる）
//   #/?q=…&lang=…   検索・資料一覧
//   #/r/<id>        資料詳細
//   #/topics        Topic 一覧
//   #/topic/<id>    Topic 詳細
//   #/decisions?topic=…  判断材料（試験）の一覧（Topic で絞り込み。compare=… で資料間の比較を開く）
//   #/decision/<id>      判断材料（試験）の詳細（?example=… で、その具体例の位置へ移動する）
//   #/explore?topic=…&d=…  知識の散策（試験）。d は興味からの距離（0〜100）
import { useSyncExternalStore } from "react";
import { FILTER_KEYS, type Filters } from "./search/search";

export type Route =
  | { name: "home"; q: string; filters: Filters }
  | { name: "resource"; id: string }
  | { name: "topic"; id: string }
  | { name: "topics" }
  | { name: "decisions"; topic: string; compare?: string }
  | { name: "decision"; id: string; example?: string }
  | { name: "explore"; topic: string; distance: number };

/** 散策の距離の既定値（近い寄り）*/
export const DEFAULT_EXPLORE_DISTANCE = 30;
const clampDistance = (v: string | null) => {
  const n = v === null || v === "" ? NaN : Number(v);
  return Number.isFinite(n) ? Math.min(100, Math.max(0, Math.round(n))) : DEFAULT_EXPLORE_DISTANCE;
};

export function parseHash(hash: string): Route {
  const raw = hash.replace(/^#/, "") || "/";
  const [path, queryString = ""] = raw.split("?");
  const seg = path.split("/").filter(Boolean).map(decodeURIComponent);
  if (seg[0] === "r" && seg[1]) return { name: "resource", id: seg[1] };
  if (seg[0] === "topic" && seg[1]) return { name: "topic", id: seg[1] };
  if (seg[0] === "topics") return { name: "topics" };
  const params = new URLSearchParams(queryString);
  if (seg[0] === "decision" && seg[1]) {
    const example = params.get("example");
    return example ? { name: "decision", id: seg[1], example } : { name: "decision", id: seg[1] };
  }
  if (seg[0] === "explore") return { name: "explore", topic: params.get("topic") ?? "", distance: clampDistance(params.get("d")) };
  if (seg[0] === "decisions") {
    const compare = params.get("compare");
    return compare ? { name: "decisions", topic: params.get("topic") ?? "", compare } : { name: "decisions", topic: params.get("topic") ?? "" };
  }
  const filters: Filters = {};
  for (const key of FILTER_KEYS) {
    const v = params.get(key);
    if (v) filters[key] = v;
  }
  return { name: "home", q: params.get("q") ?? "", filters };
}

export function homeHref(q: string, filters: Filters = {}): string {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  for (const key of FILTER_KEYS) {
    const v = filters[key];
    if (v) params.set(key, v);
  }
  const s = params.toString();
  return s ? `#/?${s}` : "#/";
}

export const resourceHref = (id: string) => `#/r/${encodeURIComponent(id)}`;
export const topicHref = (id: string) => `#/topic/${encodeURIComponent(id)}`;
export function decisionsHref(topic = "", compare = ""): string {
  const params = new URLSearchParams();
  if (topic) params.set("topic", topic);
  if (compare) params.set("compare", compare);
  const q = params.toString();
  return q ? `#/decisions?${q}` : "#/decisions";
}
export const decisionHref = (id: string, example?: string) =>
  `#/decision/${encodeURIComponent(id)}${example ? `?example=${encodeURIComponent(example)}` : ""}`;
export function exploreHref(topic = "", distance = DEFAULT_EXPLORE_DISTANCE): string {
  const params = new URLSearchParams();
  if (topic) params.set("topic", topic);
  params.set("d", String(distance));
  return `#/explore?${params.toString()}`;
}

const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("hashchange", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("hashchange", listener);
  };
}

export function useRoute(): Route {
  const hash = useSyncExternalStore(subscribe, () => window.location.hash, () => "");
  return parseHash(hash);
}

/** 入力中の検索語などで履歴を増やさずに URL を更新する */
export function replaceHash(href: string) {
  if (window.location.hash === href) return;
  history.replaceState(null, "", href);
  notify();
}

// 詳細画面から「検索結果に戻る」ための直前の一覧 URL（リロード後も残るよう sessionStorage に保存）
const LAST_LIST_KEY = "rift-compass:last-list";
export function rememberList(href: string) {
  try {
    sessionStorage.setItem(LAST_LIST_KEY, href);
  } catch {
    /* 保存できない環境では既定の一覧に戻る */
  }
}
export function lastListHref(): string {
  try {
    return sessionStorage.getItem(LAST_LIST_KEY) ?? "#/";
  } catch {
    return "#/";
  }
}
