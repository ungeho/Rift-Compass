// 知識ノートの状態の色（styles.css の status-*）と、チャンピオンクラスの色（class-*）の表示（2026-11-02）
import { readFileSync } from "fs";
import { join } from "path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { index } from "../data/dataset";
import { publicNotes } from "../data/explorePool";
import { noteHeading, STATUS_LABELS } from "../data/labels";
import type { KnowledgeNote } from "../data/types";
import { ChampionDataBody } from "./ChampionData";
import { NoteStatusBadge } from "./common";
import { DecisionIndex } from "./DecisionPages";
import { NoteSummary } from "./ExplorePage";
import { NoteCard } from "./NoteCard";
import { NotePage } from "./NotePage";
import { RelatedNotes } from "./RelatedNotes";
import { notesForTopic, TopicPage } from "./TopicPages";

const css = readFileSync(join(__dirname, "../styles.css"), "utf8");
const byStatus = (s: KnowledgeNote["status"]) => publicNotes.find((n) => n.status === s)!;
/** 公開ノートにある状態（収録データに依存しないよう、あるものだけを確かめる）*/
const presentStatuses = (["source_stated", "derived", "tactical_inference", "empirical", "unverified", "disputed"] as const).filter((s) => publicNotes.some((n) => n.status === s));
/** 状態のバッジ：status-<tone> のクラスと data-note-status、文字のラベルを持つ */
const badges = (html: string) => [...html.matchAll(/<span class="badge status status-(\w+)"[^>]*data-note-status="(\w+)"[^>]*>([^<]*)</g)].map((m) => ({ tone: m[1], status: m[2], label: m[3] }));

describe("知識ノートの状態の色を、どの画面でも同じ規則で示す", () => {
  it("6つの状態それぞれに CSS の色があり、状態ごとのトーンは STATUS_LABELS のもの", () => {
    for (const tone of new Set(Object.values(STATUS_LABELS).map((s) => s.tone))) expect(css).toMatch(new RegExp(`\\.status-${tone}[ ,{]`));
    expect(presentStatuses.length).toBeGreaterThanOrEqual(3);
    for (const s of presentStatuses) {
      const html = renderToStaticMarkup(<NoteStatusBadge note={byStatus(s)} />);
      expect(badges(html)).toEqual([{ tone: STATUS_LABELS[s].tone, status: s, label: noteHeading(byStatus(s)) }]);
    }
  });

  it("色だけに頼らず、文字のラベルと説明（title）を残す。種類（仕様・判断など）は中立色のまま", () => {
    const n = byStatus("tactical_inference");
    const html = renderToStaticMarkup(<NoteSummary note={n} />);
    expect(html).toContain(`title="${STATUS_LABELS.tactical_inference.description}"`);
    expect(html).toContain(">戦術的な推論<");
    // kind のバッジには status のクラスを付けない
    expect(html).toMatch(/<span class="badge">判断<\/span>/);
  });

  it("散策・Topic・検索の NoteSummary と、詳細の NoteCard で、同じノートが同じ色になる", () => {
    expect(presentStatuses.length).toBeGreaterThanOrEqual(3);
    for (const s of presentStatuses) {
      const n = byStatus(s);
      const tone = STATUS_LABELS[s].tone;
      expect(badges(renderToStaticMarkup(<NoteSummary note={n} />))[0].tone).toBe(tone);
      expect(badges(renderToStaticMarkup(<NoteCard note={n} />))[0].tone).toBe(tone);
    }
  });

  it("Topic のページ・検索の関連ノート・ノートの詳細の関係する一覧・資料詳細の根拠のノートにも状態の色が付く", () => {
    // 特定の収録データに依存しないよう、直接のノートが最も多い Topic と、関係の相手の状態が2種類以上あるノートを選ぶ
    const topic = [...index.data.topics].sort((a, b) => notesForTopic(b.id).direct.length - notesForTopic(a.id).direct.length)[0];
    const direct = notesForTopic(topic.id).direct;
    expect(direct.length).toBeGreaterThan(5);
    expect(badges(renderToStaticMarkup(<TopicPage id={topic.id} />)).length).toBeGreaterThanOrEqual(Math.min(direct.length, 20));
    const search = badges(renderToStaticMarkup(<RelatedNotes q={topic.label_ja} />));
    expect(search.length).toBeGreaterThan(0);
    for (const b of search) expect(b.tone).toBe(STATUS_LABELS[b.status as KnowledgeNote["status"]].tone);
    // ノートの詳細：関係する知識ノートの一覧（本人のバッジ＋相手のバッジ）
    const pub = new Set(publicNotes.map((n) => n.id));
    const peers = (id: string) => index.data.relations.filter((r) => r.from === id || r.to === id).map((r) => (r.from === id ? r.to : r.from)).filter((x) => pub.has(x));
    const host = publicNotes.find((n) => new Set(peers(n.id).map((x) => index.noteById.get(x)!.status)).size >= 2)!;
    expect(host).toBeTruthy();
    const related = badges(renderToStaticMarkup(<NotePage id={host.id} />));
    expect(related.length).toBeGreaterThan(2);
    for (const b of related) expect(b.tone).toBe(STATUS_LABELS[b.status as KnowledgeNote["status"]].tone);
    expect(new Set(related.map((b) => b.status)).size).toBeGreaterThanOrEqual(2);
  });

  it("判断材料の比較から参照する正式データのノートにも状態の色が付く", () => {
    const html = renderToStaticMarkup(<DecisionIndex topic="" />);
    const note = index.noteById.get("kn-level2-minion-count")!;
    expect(html).toContain("正式データの知識ノート");
    expect(badges(html).some((b) => b.status === note.status && b.tone === STATUS_LABELS[note.status].tone)).toBe(true);
  });
});

describe("チャンピオンクラスの色", () => {
  const root = join(__dirname, "../..");
  const read = <T,>(p: string): T => JSON.parse(readFileSync(join(root, p), "utf8")) as T;
  const v = read<{ current: { ddragon: string } }>("public/gamedata/manifest.json").current.ddragon;
  const render = (id: string) =>
    renderToStaticMarkup(<ChampionDataBody data={{ version: v, dd: read(`public/gamedata/ddragon/${v}/champions/${id}.json`), wiki: null, prev: null, knownIssues: [], patch: null, abilities: null }} />);
  it("6つのクラスに別々の色があり、明暗の両方のテーマで定義する", () => {
    for (const c of ["assassin", "mage", "marksman", "fighter", "tank", "support"]) {
      expect(css.match(new RegExp(`--class-${c}:`, "g"))?.length).toBe(2);
      expect(css).toContain(`.class-${c} {`);
    }
    // 文字は本文の色（コントラストを保つ）。クラスの色は左の帯と薄い地色だけで、状態のバッジ（文字の色）と形を変える
    expect(css).toMatch(/\.champ-class \{ color: var\(--text\); border-left: 4px solid/);
  });
  it("複数のクラスを持つチャンピオンは、それぞれのラベルを別の色で示す（文字のラベルも残す）", () => {
    const html = render("Akali");
    const classes = [...html.matchAll(/class="badge champ-class class-(\w+)" data-champion-class="(\w+)">([^<]+)</g)].map((m) => [m[1], m[2], m[3]]);
    expect(classes.length).toBeGreaterThanOrEqual(1);
    for (const [cls, tag, label] of classes) {
      expect(cls).toBe(tag.toLowerCase());
      expect(label).toContain(`（${tag}）`);
    }
    const darius = [...render("Darius").matchAll(/data-champion-class="(\w+)"/g)].map((m) => m[1]);
    expect(darius).toEqual(["Fighter", "Tank"]);
    expect(render("Darius")).not.toMatch(/champ-class[^"]*status-/);
  });
});
