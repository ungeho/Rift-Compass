import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { index } from "../data/dataset";
import { publicEvidenceOf, publicNotes } from "../data/explorePool";
import { noteHref, topicHref } from "../router";
import { matchesTopicNote, notesForTopic, TopicPage, TOPIC_NOTE_PAGE_SIZE } from "./TopicPages";

const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ");
const publicIds = new Set(publicNotes.map((n) => n.id));

describe("Topic のページから知識ノートへ", () => {
  it("直接付いたノートと下位の Topic のノートは重ならず、どちらも公開ノートだけ", () => {
    for (const t of index.data.topics) {
      const { direct, via } = notesForTopic(t.id);
      const d = new Set(direct.map((n) => n.id));
      for (const { note, through } of via) {
        expect(d.has(note.id), `${t.id} ${note.id}`).toBe(false);
        expect(through.length).toBeGreaterThan(0);
        for (const x of through) expect(index.descendants(t.id).has(x)).toBe(true);
      }
      for (const n of [...direct, ...via.map((v) => v.note)]) expect(publicIds.has(n.id)).toBe(true);
      expect(new Set(via.map((v) => v.note.id)).size).toBe(via.length);
    }
  });

  it("すべての公開ノートが、付いている Topic のページに直接のノートとして出る。非公開のノートはどのページにも出ない", () => {
    for (const n of publicNotes) {
      const topics = n.topic_ids.filter((t) => index.topicById.has(t));
      expect(topics.length, n.id).toBeGreaterThan(0);
      for (const t of topics) expect(notesForTopic(t).direct.map((x) => x.id)).toContain(n.id);
    }
    const hidden = index.data.knowledge_notes.filter((n) => !publicIds.has(n.id)).map((n) => n.id);
    expect(hidden.length).toBeGreaterThan(0);
    for (const t of index.data.topics) {
      const html = renderToStaticMarkup(<TopicPage id={t.id} />);
      for (const id of hidden) expect(html).not.toContain(`href="${noteHref(id)}"`);
    }
  });

  it("画面：ゼドの Topic にノートの欄と詳細へのリンクが出て、既存の資料一覧も残る", () => {
    const html = renderToStaticMarkup(<TopicPage id="champ-zed" />);
    const t = text(html);
    expect(t).toContain("この Topic の知識ノート 4件");
    expect(html).toContain(`href="${noteHref("kn-zed-r-zhonya-timing")}"`);
    expect(t).toContain("ゲーム内での検証：未実施");
    expect(t).toContain("この Topic の資料");
    expect(html).toContain('href="#/r/res-wiki-zed"');
  });

  it("画面：下位の Topic のノートは、経由した Topic を示す。旧仕様のノートは後ろに並ぶ", () => {
    const { direct, via } = notesForTopic("cat-champions");
    expect(direct).toHaveLength(0);
    expect(via.length).toBeGreaterThan(0);
    const html = renderToStaticMarkup(<TopicPage id="cat-champions" />);
    expect(text(html)).toContain("下位の Topic の知識ノート");
    expect(html).toContain(`href="${topicHref("champ-mordekaiser")}">モルデカイザー</a>`);
    const ids = notesForTopic("champ-mordekaiser").direct.map((n) => n.id);
    expect(ids[ids.length - 1]).toBe("kn-mordekaiser-r-cleanse-pre-148");
    expect(text(renderToStaticMarkup(<TopicPage id="champ-mordekaiser" />))).toContain("現行では適用できない");
  });

  it("件数が段階表示の1回分を超える Topic は、最初の分だけ出し、残りの件数を示す（上限で切らない）", () => {
    const big = index.data.topics.find((t) => notesForTopic(t.id).via.length > TOPIC_NOTE_PAGE_SIZE || notesForTopic(t.id).direct.length > TOPIC_NOTE_PAGE_SIZE)!;
    expect(big).toBeDefined();
    const { direct, via } = notesForTopic(big.id);
    const html = renderToStaticMarkup(<TopicPage id={big.id} />);
    const shown = (html.match(/class="note-summary"/g) ?? []).length;
    expect(shown).toBe(Math.min(direct.length, TOPIC_NOTE_PAGE_SIZE) + Math.min(via.length, TOPIC_NOTE_PAGE_SIZE));
    expect(text(html)).toMatch(/さらに\d+件表示する（残り \d+件）/);
  });

  it("ノートのない Topic では欄を出さない", () => {
    const empty = index.data.topics.find((t) => notesForTopic(t.id).direct.length === 0 && notesForTopic(t.id).via.length === 0);
    if (empty) expect(text(renderToStaticMarkup(<TopicPage id={empty.id} />))).not.toContain("この Topic の知識ノート");
  });
});

describe("Topic のノートの絞り込み：公開対象でない資料の根拠の要約では一致しない（P1）", () => {
  const level2 = () => notesForTopic("level-2").direct;
  const hits = (q: string) => level2().filter((n) => matchesTopicNote(q, n)).map((n) => n.id).sort();

  it("ev-009・ev-011（公開対象でない資料）の要約にだけある語では、どのノートも一致しない", () => {
    // 前提：語は非公開の根拠の要約にあり、ノート自身の記述と公開の根拠の要約にはない
    const hidden = index.data.evidence.filter((e) => e.id === "ev-009" || e.id === "ev-011").map((e) => e.summary_ja).join(" ");
    for (const q of ["403", "26.4"]) {
      expect(hidden).toContain(q);
      for (const n of level2()) {
        const own = [n.statement_ja, ...(n.conditions_ja ?? []), ...(n.exceptions_ja ?? []), ...(n.falsifiers_ja ?? []), n.notes_ja ?? "", ...publicEvidenceOf(n.id).map((e) => e.summary_ja)].join(" ");
        expect(own, `${n.id} ${q}`).not.toContain(q);
      }
      expect(hits(q), q).toEqual([]);
    }
  });

  it("公開の根拠の要約・ノート自身の記述での一致は残る（同じ語が非公開の根拠にあっても妨げない）", () => {
    // 公開の根拠の要約（ev-030「…必要体数を計算」）
    expect(hits("必要体数")).toEqual(["kn-level2-minion-count"]);
    // ノート自身の記述（本文の「Lv2」は非公開の ev-011 の要約にもある）
    expect(hits("Lv2")).toEqual(expect.arrayContaining(["kn-level2-advantage", "kn-level2-minion-count", "kn-level2-xp"]));
    // 補足欄の未確認の参考情報（ノート自身の記述）
    expect(hits("流通する")).toEqual(["kn-level2-minion-count"]);
  });

  it("Topic のページに、公開対象でない資料の根拠の要約・資料の名前・発信者を出さず、ノートの件数・遷移は保つ", () => {
    const html = renderToStaticMarkup(<TopicPage id="level-2" />);
    const t = text(html);
    for (const s of ["HTTP 403", "パッチ26.4", "Mobalytics", "Sheep Esports", "mobalytics.gg", "sheepesports"]) expect(t + html, s).not.toContain(s);
    expect(level2().map((n) => n.id).sort()).toEqual(["kn-level2-advantage", "kn-level2-minion-count", "kn-level2-xp"]);
    for (const id of ["kn-level2-advantage", "kn-level2-minion-count", "kn-level2-xp"]) expect(html).toContain(`href="${noteHref(id)}"`);
  });
});
