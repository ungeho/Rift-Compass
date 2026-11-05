import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { comparisons, criteriaForUnit, decisionsForTopic, examplesForUnit, NONE_FULL, NONE_PARTIAL, showcaseDecisions, showcaseTopicIds, sourceById } from "../data/decisions";
import { decisionHref, decisionsHref, parseHash } from "../router";
import { decisionQuestions, previewDecisionQuestions, DecisionQuestionEntrance, DECISION_PAGE_SIZE, DECISION_TOPIC_PREVIEW, DecisionTopicNavigation, DecisionDetail, DecisionIndex, filterDecisionList } from "./DecisionPages";

const plain = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
const detail = (id: string, example?: string) => renderToStaticMarkup(<DecisionDetail id={id} example={example} />);

describe("判断材料の一覧内の絞り込み", () => {
  it("空条件では全件と順序を維持する。初期表示以降は残り件数を明示する", () => {
    expect(filterDecisionList(showcaseDecisions, "", "", "")).toEqual(showcaseDecisions);
    const html = renderToStaticMarkup(<DecisionIndex topic="" />);
    const ids = [...html.matchAll(/<h3 class="card-title"><a href="#\/decision\/([^"]+)"/g)].map((m) => m[1]);
    expect(ids).toEqual(showcaseDecisions.slice(0, DECISION_PAGE_SIZE).map((u) => u.id));
    expect(plain(html)).toContain(`残り ${showcaseDecisions.length - DECISION_PAGE_SIZE}件`);
    expect(html).toContain('class="decision-entrances decision-question-preview"');
    expect(html).toContain('aria-label="判断材料一覧の移動先"');
    expect(html.indexOf('id="decision-results-heading"')).toBeLessThan(html.indexOf('id="comparisons-heading"'));
  });
  it("複数語をANDで照合し、チャンピオン・Topicの記述も再利用する", () => {
    const found = filterDecisionList(showcaseDecisions, "ツイステッド フェイト", "", "");
    expect(found.length).toBeGreaterThan(0);
    expect(found.map((u) => u.id)).toContain("du-dopa-tf-fizz-pull-wave");
    expect(filterDecisionList(found, "フリーズ", "", "").every((u) => found.includes(u))).toBe(true);
    expect(filterDecisionList(showcaseDecisions, "存在しない検索語123", "", "")).toEqual([]);
  });
  it("ロールは共通を含めることを明示し、種類とTopicの条件を重ねても順序を変えない", () => {
    const list = decisionsForTopic("wave-management");
    const found = filterDecisionList(list, "", "mid", "principle");
    expect(found.length).toBeGreaterThan(0);
    expect(found).toEqual(list.filter((u) => u.kind === "principle" && (u.scope.roles.includes("mid") || u.scope.roles.includes("all"))));
    const common = filterDecisionList(showcaseDecisions, "", "all", "");
    expect(common.length).toBeGreaterThan(0);
    expect(common.every((u) => u.scope.roles.includes("all"))).toBe(true);
  });
  it("既存のTopic・比較URLと、無効・未収録Topicの区別を維持する", () => {
    const cmp = comparisons[0];
    expect(parseHash(decisionsHref("recall", cmp.id))).toEqual({ name: "decisions", topic: "recall", compare: cmp.id });
    const html = renderToStaticMarkup(<DecisionIndex topic="recall" compare={cmp.id} />);
    expect(html).toContain('open=""');
    expect(html.indexOf('id="comparisons-heading"')).toBeLessThan(html.indexOf('id="decision-results-heading"'));
    expect(plain(renderToStaticMarkup(<DecisionIndex topic="no-such-topic" />))).toContain("登録されていません");
    expect(plain(renderToStaticMarkup(<DecisionIndex topic="champ-jax" />))).toContain("このTopicには、試験表示の判断材料はありません");
  });
});

describe("判断に必要な情報と補足の分離", () => {
  it.each(showcaseDecisions.map((u) => [u.id, u] as const))("%s：条件・例外・代替案・未確認事項をタブより前に、意味を変えず表示", (id, u) => {
    const html = detail(id);
    const firstTab = html.indexOf('role="tablist"');
    const core = plain(html.slice(0, firstTab));
    for (const s of [u.problem_ja, u.goal_ja, u.action_ja, ...u.conditions_ja, ...u.exceptions_ja, ...u.alternatives_ja, ...u.costs_ja, u.patch_dependency_ja, ...u.unknowns_ja]) expect(core).toContain(s);
    expect(html.indexOf('id="conditions-heading"')).toBeLessThan(html.indexOf('id="reasons-heading"'));
    for (const c of criteriaForUnit(id)) {
      for (const s of [c.value_ja, c.target_ja, c.context_ja, c.locator]) expect(core).toContain(s);
      expect(core).toContain(sourceById.get(c.source)!.author);
    }
    expect(html).toMatch(/id="[^"]+-tab-reasons"[^>]+aria-selected="true"/);
    expect(html).toMatch(/id="[^"]+-panel-sources"[^>]+hidden=""/);
    expect(plain(html)).toContain("人による確認や、ゲーム内での検証ではありません");
    for (const e of u.evidence) expect(html).toContain(sourceById.get(e.source)!.url.replace(/&/g, "&amp;"));
  });
  it("具体例URLは該当タブを最初から表示し、不正な具体例は通常表示にする", () => {
    const u = showcaseDecisions.find((u) => examplesForUnit(u.id).length > 0)!;
    const x = examplesForUnit(u.id)[0];
    const html = detail(u.id, x.id);
    expect(html).toMatch(/id="[^"]+-tab-examples"[^>]+aria-selected="true"/);
    expect(html).toMatch(/id="[^"]+-panel-examples"[^>]*tabindex="0"/);
    expect(html).toContain(`id="example-${x.id}"`);
    expect(plain(html)).toContain(x.source_ja);
    expect(plain(html)).toContain(x.ai_ja);
    expect(plain(html)).toContain("具体例の出典が裏付けるのは、その具体例だけです");
    expect(parseHash(decisionHref(u.id, x.id))).toEqual({ name: "decision", id: u.id, example: x.id });
    expect(detail(u.id, "missing-example")).toMatch(/id="[^"]+-tab-reasons"[^>]+aria-selected="true"/);
  });
  it("記載なしの2種類、未収録の具体例、空の項目・根拠の不明を区別する", () => {
    const u = showcaseDecisions[0];
    const old = { exceptions_ja: u.exceptions_ja, alternatives_ja: u.alternatives_ja, costs_ja: u.costs_ja, evidence: u.evidence };
    try {
      u.exceptions_ja = [NONE_FULL]; u.alternatives_ja = [NONE_PARTIAL]; u.costs_ja = []; u.evidence = [];
      const html = plain(detail(u.id));
      expect(html).toContain(NONE_FULL);
      expect(html).toContain(NONE_PARTIAL);
      expect(html).toContain("読んでいない範囲に書かれている可能性があります");
      expect(html).toContain("この項目の記録はありません。存在しないと確認したものではありません");
      expect(html).toContain("出典の記録はありません。確認範囲は不明です");
      expect(html).not.toContain("出典の全体を確認");
      u.evidence = [{ ...old.evidence[0], source: "unknown-source" }];
      expect(plain(detail(u.id))).toContain("出典の記録が見つかりません（unknown-source）");
      expect(plain(detail(u.id))).toContain("出典の記録不足・確認範囲は不明");
    } finally { Object.assign(u, old); }
    const sparse = showcaseDecisions.find((u) => !examplesForUnit(u.id).length)!;
    expect(plain(detail(sparse.id))).toContain("具体例は未収録です。実例が存在しないという意味ではありません");
  });
});


describe("判断材料の入口とTopicの段階表示", () => {
 it("質問を選べる説明と開閉表示・検索への復帰を保つ", () => {
  const html = renderToStaticMarkup(<DecisionIndex topic="" />);
  for (const text of ["状況に近い質問を選んで", "ほかの質問を表示", "質問の入口から探す"]) expect(html).toContain(text);
  expect(html).toContain('id="decision-question-options"');
 });
 it("既存順の先頭だけを示し、残り件数と全件への操作を明示する", () => {
  const ids = showcaseTopicIds();
  const html = renderToStaticMarkup(<DecisionTopicNavigation topic="" />);
  const links = [...html.matchAll(/href="#\/decisions\?topic=([^"&]+)/g)].map(m => decodeURIComponent(m[1]));
  expect(links).toEqual(ids.slice(0, DECISION_TOPIC_PREVIEW));
  expect(html).toContain(`残り${ids.length - DECISION_TOPIC_PREVIEW}分類を表示（全${ids.length}分類）`);
  expect(html).toContain('aria-expanded="false" aria-controls="decision-topic-links"');
  expect(html).toContain('href="#/decisions" aria-current="page"');
 });
 it("初期範囲外の選択中Topicを件数・既存URLとともに表示する", () => {
  const ids = showcaseTopicIds();
  const selected = ids[DECISION_TOPIC_PREVIEW + 1];
  const html = renderToStaticMarkup(<DecisionTopicNavigation topic={selected} />);
  expect(html).toContain(`href="${decisionsHref(selected)}" aria-current="page"`);
  expect(html).toContain(`（${decisionsForTopic(selected).length}）`);
  expect(html).toContain(`残り${ids.length - DECISION_TOPIC_PREVIEW - 1}分類を表示`);
  expect(html).toContain("選択中：");
 });
});


describe("質問入口の初期プレビュー", () => {
 it("既存の異なる分野の先頭3件を、元のリンクで最初から表示する", () => {
  const all = decisionQuestions(); const chosen = previewDecisionQuestions(all);
  expect(chosen).toHaveLength(3); expect(new Set(chosen.map(q => q.area)).size).toBe(3);
  const html = renderToStaticMarkup(<DecisionQuestionEntrance />);
  for (const q of chosen) { expect(all).toContain(q); expect(html).toContain(q.question); expect(html).toContain(q.href.replace(/&/g, "&amp;")); }
  expect((html.match(/<li>/g) ?? [])).toHaveLength(3);
  expect(html).toContain(`ほかの質問を表示（残り${all.length - 3}件）`);
  expect(html).toContain('aria-expanded="false" aria-controls="decision-question-options"');
 });
 it("0～3件では全件を表示し、不要な開閉操作を出さない。同じ分野でも順序から補う", () => {
  const all = decisionQuestions().slice(0, 3);
  expect(previewDecisionQuestions(all)).toEqual(all);
  for (let n = 0; n <= 3; n++) {
   const html = renderToStaticMarkup(<DecisionQuestionEntrance questions={all.slice(0,n)} />);
   expect((html.match(/<li>/g) ?? [])).toHaveLength(n); expect(html).not.toContain("aria-expanded");
  }
 });
});
