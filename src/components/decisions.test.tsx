// Phase 5D：判断材料（試験）の閲覧画面の検査。react-dom/server で HTML を生成して確認する。
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import raw from "../../data/experiments/decision-units.json";
import rawCriteria from "../../data/experiments/decision-criteria.json";
import rawSideWave from "../../data/experiments/side-wave-decisions.json";
import rawWaveTechnique from "../../data/experiments/wave-technique-decisions.json";
import rawExamples from "../../data/experiments/decision-examples.json";
import { index } from "../data/dataset";
import { readFileSync } from "node:fs";
import { DIAGRAMS, exampleOf, examplesForQuery, examplesForResource, examplesForUnit, NONE_PARTIAL, QUESTION_ENTRANCES, SHOWCASE_IDS, showcaseDecisions, sourceById, type DecisionUnit } from "../data/decisions";
import { parseHash, decisionHref, decisionsHref } from "../router";
import { DecisionDetail, DecisionIndex } from "./DecisionPages";
import { SearchPage } from "./SearchPage";
import { EVAL_QUERIES } from "../search/evaluationQueries";
import { search } from "../search/search";
import { ResourceDetail } from "./ResourceDetail";

const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ");
const list = (topic = "") => renderToStaticMarkup(<DecisionIndex topic={topic} />);
const detail = (id: string) => renderToStaticMarkup(<DecisionDetail id={id} />);
// Phase 5B（29件）と Phase 5E・6B・発見性レビューの判断材料を合わせたもの
const units = [...(raw as unknown as { units: DecisionUnit[] }).units, ...(rawCriteria as unknown as { units: DecisionUnit[] }).units, ...(rawSideWave as unknown as { units: DecisionUnit[] }).units, ...(rawWaveTechnique as unknown as { units: DecisionUnit[] }).units];
const OVERCLAIM = /(?<!未)検証済み|(?<!未)確認済みの仕様|仕様として確認済み|ゲーム内で検証済み|おすすめ|推奨します|すべきです/;

describe("表示している主張は実験データと一致する", () => {
  it("試験表示は実験データの25件（Phase 5D の9件＋Phase 5E の5件＋Phase 6A の5件＋Phase 6B の4件＋発見性レビューの2件）で、内容を書き換えていない", () => {
    expect(SHOWCASE_IDS).toHaveLength(25);
    expect(new Set(SHOWCASE_IDS).size).toBe(SHOWCASE_IDS.length);
    for (const u of showcaseDecisions) expect(u).toBe(units.find((x) => x.id === u.id));
  });

  it("一覧に9件の要旨と状況が出る", () => {
    const html = text(list());
    for (const u of showcaseDecisions) {
      expect(html).toContain(u.statement_ja);
      expect(html).toContain(u.problem_ja);
    }
  });

  it.each(SHOWCASE_IDS.map((id) => [id]))("%s：詳細に要旨・行動・理由・条件・未確認事項が出る", (id) => {
    const u = units.find((x) => x.id === id)!;
    const html = text(detail(id));
    for (const s of [u.statement_ja, u.action_ja, u.goal_ja, u.patch_dependency_ja, ...u.reasons.map((r) => r.text), ...u.conditions_ja, ...u.unknowns_ja]) {
      expect(html).toContain(s);
    }
  });
});

describe("原典の主張と AI の解釈を区別する", () => {
  it.each(SHOWCASE_IDS.map((id) => [id]))("%s", (id) => {
    const u = units.find((x) => x.id === id)!;
    const markup = detail(id);
    for (const r of u.reasons) {
      const li = markup.match(new RegExp(`<li class="reason reason-(source|ai)">(.*?)</li>`, "g"))!.find((m) => text(m).includes(r.text))!;
      expect(li).toBeDefined();
      expect(text(li)).toContain(r.basis === "source" ? "原典の主張" : "AI の解釈");
      expect(li).toContain(`reason-${r.basis}`);
    }
  });

  it("AI の解釈を含む判断材料が試験表示にある（前提）", () => {
    expect(showcaseDecisions.some((u) => u.reasons.some((r) => r.basis === "ai"))).toBe(true);
  });
});

describe("出典・確認範囲・未確認事項", () => {
  it.each(SHOWCASE_IDS.map((id) => [id]))("%s：原典の URL と確認範囲が出る", (id) => {
    const u = units.find((x) => x.id === id)!;
    const markup = detail(id);
    const html = text(markup);
    for (const e of u.evidence) {
      const s = sourceById.get(e.source)!;
      expect(markup).toContain(`href="${s.url.replace(/&/g, "&amp;")}"`);
      expect(html).toContain(s.coverage.status === "full" ? "全体を確認" : "一部だけを確認");
      if (s.coverage.unread_ja) expect(html).toContain(s.coverage.unread_ja);
      if (s.resource_id) expect(markup).toContain(`href="#/r/${s.resource_id}"`);
    }
  });

  it("動画の開始秒は、実験データに記録がある確認箇所だけリンクにする", () => {
    for (const u of showcaseDecisions) {
      // 判断材料の出典と、具体例の出典（既存の判断材料に付けた実戦例）を合わせて数える
      const evidence = [...u.evidence, ...examplesForUnit(u.id).map((x) => x.evidence)];
      const withSec = evidence.filter((e) => typeof e.locator === "object" && e.locator.start_sec !== undefined).length;
      const links = (detail(u.id).match(/(?:\?|&amp;)t=\d+s/g) ?? []).length; // HTML では & が &amp; になる
      expect(links).toBe(withSec);
    }
    expect(detail("du-dopa-tf-fizz-pull-wave")).toContain("t=77s");
  });

  it("未読の範囲がある「記載なし」は、書かれている可能性を添えて表示する", () => {
    const u = showcaseDecisions.find((x) => [...x.costs_ja, ...x.exceptions_ja].includes(NONE_PARTIAL))!;
    expect(text(detail(u.id))).toContain("読んでいない範囲に書かれている可能性があります");
  });

  it("過去のパッチの判断材料は、パッチの前提を表示する", () => {
    expect(text(detail("du-mid-recall-4th-wave"))).toContain("パッチ10.14（2020年）");
  });

  it("関係の数を根拠の数として表示しない", () => {
    const html = text(detail("du-vlad-keystone-by-matchup"));
    expect(html).toContain("関係の数は、根拠の数ではありません");
    expect(html).toContain("同じ著者の再説明（独立した根拠ではない）");
  });
});

describe("推奨・自動回答に見せない", () => {
  it("一覧と詳細に、検索欄も推奨の表現もない", () => {
    for (const markup of [list(), list("roaming"), ...SHOWCASE_IDS.map(detail)]) {
      expect(markup).not.toMatch(/<input|<textarea/);
      expect(text(markup)).not.toMatch(OVERCLAIM);
      expect(text(markup)).toContain("自動で選んだ答えや推奨ではありません");
      expect(text(markup)).toContain("ゲーム内では検証していません");
    }
  });

  it("ローム（Q11 の取り違え）：ロームされる側の判断材料は、その状況を表示して並べる", () => {
    const html = text(list("roaming"));
    const roam = units.find((x) => x.id === "du-roam-do-not-chase")!;
    expect(html).toContain(`状況： ${roam.problem_ja}`);
    expect(roam.problem_ja).toContain("対面がロームしたとき");
  });

  it("有利・不利で逆になるフリーズの判断材料は、どちらも状況（有利／不利）を表示する", () => {
    const html = text(list("freeze"));
    expect(html).toContain("勝っているレーンで、いつフリーズをやめるか");
    expect(html).toContain("不利な対面で差を縮めたい");
  });
});

describe("判断材料がない場合に作り出さない", () => {
  it("判断材料のない Topic では、その旨を表示して何も出さない", () => {
    const html = text(list("champ-jax"));
    expect(html).toContain("このTopicには、試験表示の判断材料はありません");
    expect(html).toContain("Topic「ジャックス」の判断材料：0件");
  });

  it("存在しない Topic・試験表示の対象外の判断材料", () => {
    expect(text(list("no-such-topic"))).toContain("登録されていません");
    expect(text(detail("du-roam-signs"))).toContain("試験表示の対象にありません");
    expect(text(detail("du-does-not-exist"))).toContain("試験表示の対象にありません");
  });
});

describe("資料詳細との接続・URL", () => {
  it("判断材料の出典となった資料には案内を出し、ない資料には出さない", () => {
    const kjumg = text(renderToStaticMarkup(<ResourceDetail id="res-lg-kjumg" />));
    expect(kjumg).toContain("この資料から抽出した判断材料（試験）");
    expect(kjumg).toContain(units.find((x) => x.id === "du-behind-keep-wave-own-side")!.statement_ja);
    expect(text(renderToStaticMarkup(<ResourceDetail id="res-wiki-jax" />))).not.toContain("判断材料（試験）");
  });

  it("一覧・詳細の URL を往復できる", () => {
    expect(parseHash(decisionsHref())).toEqual({ name: "decisions", topic: "" });
    expect(parseHash(decisionsHref("roaming"))).toEqual({ name: "decisions", topic: "roaming" });
    expect(parseHash(decisionHref("du-trade-checklist"))).toEqual({ name: "decision", id: "du-trade-checklist" });
  });

  it("正式資料のデータは75件のまま", () => {
    expect(index.resources).toHaveLength(75);
  });
});

describe("Phase 5E・6B・発見性レビュー：具体的な目安と資料間の比較", () => {
  type CritFile = {
    criteria: { id: string; unit_id: string | null; value_ja: string; target_ja: string; observe_ja: string; context_ja: string; locator: string }[];
    comparisons: { id: string; items: string[]; verdict: string; undetermined_ja: string[] }[];
  };
  // Phase 5E と 6B の目安・比較を合わせて検査する
  const files = [rawCriteria, rawSideWave, rawWaveTechnique] as unknown as CritFile[];
  const crit: CritFile = { criteria: files.flatMap((f) => f.criteria), comparisons: files.flatMap((f) => f.comparisons) };
  const compareList = (id: string) => renderToStaticMarkup(<DecisionIndex topic="" compare={id} />);

  it("目安は、数値と対象・見る方法・前提・確認箇所を同じ項目の中で表示する", () => {
    for (const c of crit.criteria.filter((x) => x.unit_id && SHOWCASE_IDS.includes(x.unit_id as (typeof SHOWCASE_IDS)[number]))) {
      const li = detail(c.unit_id!).match(/<li class="criterion">.*?<\/li>/gs)!.find((m) => text(m).includes(c.value_ja));
      expect(li, c.id).toBeDefined();
      for (const s of [c.target_ja, c.observe_ja, c.context_ja, c.locator]) expect(text(li!), c.id).toContain(s);
    }
  });

  it("トレードの「2〜3つ」は、目的（体力の有利でキルではない）と「通常は」の前提とともに出る", () => {
    const html = text(detail("du-trade-checklist"));
    expect(html).toContain("5つの有利のうち2〜3つ");
    expect(html).toContain("キルの基準ではない");
    expect(html).toContain("必ずではない");
  });

  it("比較は、各資料の数値をそのまま並べ、判定・判断できない点・AI の整理であることを表示する", () => {
    for (const m of crit.comparisons) {
      const markup = compareList(m.id);
      const opened = markup.match(new RegExp(`<details class="comparison-details" open="">.*?</details>`, "s"))![0];
      for (const id of m.items) expect(text(opened)).toContain(crit.criteria.find((c) => c.id === id)!.value_ja);
      for (const s of m.undetermined_ja) expect(text(opened)).toContain(s);
      expect(text(opened)).toContain("この判定は AI の整理です");
    }
    expect(text(compareList("cmp-freeze-minion-count"))).toContain("条件や数え方が違い、直接は比較できない（同じ条件で矛盾しないかは未確認）");
    expect(text(compareList("cmp-lv2-minion-count"))).toContain("矛盾かどうか判断できない");
  });

  it("比較から判断材料へのリンクは、試験表示の対象にだけ作る", () => {
    // Phase 6A で du-lv2-duo-minion-count を試験表示に加えたので、Lv2 の比較からはリンクする
    const lv2 = compareList("cmp-lv2-minion-count");
    expect(lv2).toContain('href="#/decision/du-lv2-duo-minion-count"');
    expect(text(lv2)).toContain("最初のウェーブ6体＋次のウェーブの前衛3体");
    // どの比較・一覧・詳細でも、リンク先は試験表示の対象だけ
    const shown = new Set<string>(SHOWCASE_IDS);
    const pages = [list(), ...crit.comparisons.map((m) => compareList(m.id)), ...SHOWCASE_IDS.map(detail)];
    for (const markup of pages) {
      for (const m of markup.matchAll(/href="#\/decision\/([^"]+)"/g)) expect(shown.has(m[1])).toBe(true);
    }
  });

  it("試験表示の対象外の判断材料との関係は、内容を出さずに対象外と表示する", () => {
    // du-roam-counter-action は du-jungler-hovering-trap（対象外）と関係を持つ
    const html = text(detail("du-roam-counter-action"));
    expect(html).toContain("試験表示の対象外の判断材料");
    expect(html).not.toContain(units.find((x) => x.id === "du-jungler-hovering-trap")!.statement_ja);
  });

  it("Lv2 の比較は、正式データの知識ノート（導出）を併記する", () => {
    expect(text(compareList("cmp-lv2-minion-count"))).toContain("ソロは1ウェーブ目6体");
  });

  it("詳細から、その目安を含む比較へ移動できる。存在しない比較は登録されていないと表示する", () => {
    expect(detail("du-freeze-extra-casters-loltheory")).toContain('href="#/decisions?compare=cmp-freeze-minion-count"');
    expect(text(compareList("cmp-no-such"))).toContain("登録されていません");
    expect(parseHash(decisionsHref("", "cmp-recall-criteria"))).toEqual({ name: "decisions", topic: "", compare: "cmp-recall-criteria" });
  });
});

describe("Phase 5E 最終確認：原典の文脈の訂正と表現", () => {
  const compareList = (id: string) => renderToStaticMarkup(<DecisionIndex topic="" compare={id} />);

  it("不利時のフリーズの判断材料は、帰る前に止める場面の「2〜3体」を手順として表示しない", () => {
    const u = units.find((x) => x.id === "du-freeze-when-behind-dignitas")!;
    expect(u.action_ja).not.toContain("2〜3体残して");
    const html = text(detail(u.id));
    expect(html).toContain("When to Freeze, Why you Freeze Waves and How to Break Them");
    expect(html).not.toContain("When to Recall／");
    expect(html).not.toContain("キャスターミニオン2〜3体を残す"); // 帰る前の目安は、この判断材料には付けない
    expect(html).toContain("帰る前にウェーブを止める場面の記述");
  });

  it("帰る前の「2〜3体」は、比較の中で本来の場面（押し切るのが間に合わないとき）とともに出る", () => {
    const html = text(compareList("cmp-freeze-minion-count"));
    expect(html).toContain("キャスターミニオン2〜3体を残す");
    expect(html).toContain("押し切るのが間に合わないとき");
  });

  it("比較は「矛盾ではない」と断定せず、各目安に資料の公開日を出す", () => {
    for (const id of ["cmp-freeze-minion-count", "cmp-recall-criteria", "cmp-lv2-minion-count"]) {
      const html = text(compareList(id));
      expect(html).not.toContain("矛盾ではなく");
      expect(html).toContain("現行パッチでは確認しておらず");
    }
    const freeze = text(compareList("cmp-freeze-minion-count"));
    expect(freeze).toContain("公開日：2019-07-14");
    expect(freeze).toContain("公開日：2026-02-25");
  });
});

describe("Phase 6B：サイドウェーブの方向とミニマップ", () => {
  const compareList = (id: string) => renderToStaticMarkup(<DecisionIndex topic="" compare={id} />);

  it("ミニマップの判断材料は、原典の「同じ位置」と、AI が整理した例外・未確認の資料を区別して出す", () => {
    const html = text(detail("du-minimap-next-enemy-wave"));
    expect(html).toContain("原典は「自分たちのウェーブと同じ位置」とする");
    expect(html).toContain("AI の整理（原典には書かれていない）");
    expect(html).toContain("HTTP 403 になり、確認していない");
    // 「必ず同じ位置にある」とは表示しない
    expect(html).not.toMatch(/必ず(同じ位置|存在)/);
  });

  it("位置で要る数が変わる目安は、何の差か・場面（スロープッシュ）とともに出る", () => {
    const html = text(detail("du-slow-push-advantage-by-position"));
    expect(html).toContain("自陣側でぶつかる：多くて2〜3体／敵陣側でぶつかる：4〜5体");
    expect(html).toContain("自分のウェーブが相手のウェーブより多いミニオンの数");
    expect(html).toContain("フリーズの数ではない");
    // 原典に理由がない推論は AI の解釈として出す
    expect(detail("du-slow-push-advantage-by-position")).toMatch(/AI の解釈<\/span>\s*敵陣側では敵の援軍が先に着く/);
  });

  it("比較の判定：放置したウェーブは「判断できない」、位置と数の有利は「直接は比較できない」", () => {
    expect(text(compareList("cmp-unattended-even-wave"))).toContain("矛盾かどうか判断できない");
    expect(text(compareList("cmp-advantage-by-position"))).toContain("条件や数え方が違い、直接は比較できない（同じ条件で矛盾しないかは未確認）");
  });

  it("試験表示しない du-advantage-type-melee-vs-caster は、比較に目安だけを出し、リンクも詳細も出さない", () => {
    const markup = compareList("cmp-advantage-by-position");
    expect(text(markup)).toContain("その種類（キャスターか近接）で3体の有利");
    expect(markup).not.toContain('href="#/decision/du-advantage-type-melee-vs-caster"');
    expect(text(detail("du-advantage-type-melee-vs-caster"))).toContain("試験表示の対象にありません");
  });
});

describe("Phase 6C：ウェーブの模式図", () => {
  const DRIFT = "du-wave-drift-by-meeting-point";

  it("模式図は du-wave-drift-by-meeting-point の詳細だけに、代替テキスト・前提・注意書き・出典とともに出る", () => {
    expect(DIAGRAMS.map((d) => d.unit_id)).toEqual([DRIFT]);
    const d = DIAGRAMS[0];
    const markup = detail(DRIFT);
    expect(markup).toContain(`alt="${d.alt}"`);
    const html = text(markup);
    expect(html).toContain("図解（模式図）");
    expect(html).toContain(d.compares_ja);
    for (const p of d.premises_ja) expect(html).toContain(p);
    expect(html).toContain("原典の画像ではありません");
    expect(html).toContain("実際のゲーム内で同じ結果になることを保証しません");
    for (const id of d.sources) expect(markup).toContain(`href="${sourceById.get(id)!.url}"`);
    // 図の出典は判断材料の出典に含まれる
    const u = showcaseDecisions.find((x) => x.id === DRIFT)!;
    for (const id of d.sources) expect(u.evidence.map((e) => e.source)).toContain(id);
    // 他の判断材料には出ない
    for (const id of SHOWCASE_IDS.filter((x) => x !== DRIFT)) expect(text(detail(id))).not.toContain("図解（模式図）");
  });

  it("図の前提・向きは判断材料と一致し、数値別の結果やミニマップは描かない", () => {
    const svg = readFileSync(new URL("../../docs/experiments/side-wave-diagram.svg", import.meta.url), "utf8");
    const u = showcaseDecisions.find((x) => x.id === DRIFT)!;
    expect(u.conditions_ja).toContain("両軍のミニオンの数・体力が同じ（lol-guide の前提）");
    expect(svg).toContain("前提：両軍のミニオンの数・体力が同じ");
    expect(svg).toMatch(/自陣タワー寄りでぶつかる[\s\S]*相手側へ押し始める[\s\S]*敵タワー寄りでぶつかる[\s\S]*自分側へ押し返される/);
    expect(svg).toContain("結果を保証しない");
    expect(svg).toContain("<title");
    expect(svg).toContain("<desc");
    expect(svg).not.toMatch(/ミニマップ|\+\d|必ず/);
    expect(svg).not.toMatch(/<image|href=/);
  });
});

describe("知りたいことから探す（発見性レビュー）", () => {
  const home = () => renderToStaticMarkup(<SearchPage q="" filters={{}} />);
  const PRIORITY: [string, string][] = [
    ["放置したウェーブはどちらへ進む？", "du-wave-drift-by-meeting-point"],
    ["スロープッシュには何体多く必要？", "du-slow-push-advantage-by-position"],
    ["敵の次のウェーブは、ミニマップのどこにいる？", "du-minimap-next-enemy-wave"],
  ];

  it("優先の3件を含む疑問が、トップ画面と判断材料の一覧の両方から、試験表示の詳細へ1クリックでつながる", () => {
    for (const [q, id] of PRIORITY) expect(QUESTION_ENTRANCES).toContainEqual({ question_ja: q, unit_id: id });
    for (const markup of [home(), list()]) {
      expect(text(markup)).toContain("知りたいことから探す");
      for (const e of QUESTION_ENTRANCES) {
        expect(SHOWCASE_IDS).toContain(e.unit_id);
        expect(markup).toContain(`href="${decisionHref(e.unit_id)}">${e.question_ja}</a>`);
        expect(text(detail(e.unit_id))).not.toContain("試験表示の対象にありません");
      }
    }
    expect(new Set(QUESTION_ENTRANCES.map((e) => e.unit_id)).size).toBe(QUESTION_ENTRANCES.length);
  });

  it("検索語を入れたとき・Topic で絞ったときは、入口を出さない（検索結果と絞り込みを変えない）", () => {
    expect(text(renderToStaticMarkup(<SearchPage q="how to freeze a lane" filters={{}} />))).not.toContain("知りたいことから探す");
    expect(text(list("slow-push"))).not.toContain("知りたいことから探す");
  });

  it("現行での成立を確認できない du-first-wave-aggro-release は、歴史的な説明として記録し、試験表示・入口に出さない", () => {
    const aggro = units.find((u) => u.id === "du-first-wave-aggro-release")!;
    expect(aggro.statement_ja).toMatch(/^【2019年の歴史的な説明・現行での成立は未確認】/);
    expect(aggro.proposed_status).toBe("unverified");
    expect(aggro.patch_dependency_ja).toContain("パッチ26.10");
    expect(SHOWCASE_IDS).not.toContain("du-first-wave-aggro-release");
    expect(QUESTION_ENTRANCES.map((e) => e.unit_id)).not.toContain("du-first-wave-aggro-release");
    expect(text(detail("du-first-wave-aggro-release"))).toContain("試験表示の対象にありません");
    for (const markup of [home(), list()]) expect(markup).not.toContain('href="#/decision/du-first-wave-aggro-release"');
  });

  it("表示する追加の2件は、原典の時期・未検証を表示し、「必ず」「確定」と言い切らない", () => {
    const big = text(detail("du-slow-push-big-wave-trade"));
    expect(big).toContain("大きなウェーブで戦いやすいことと、ガンクに安全なことは別");
    expect(text(detail("du-lvl1-contest-or-concede"))).toContain("相手のウェーブが自分より少し大きい。たいてい3体ほど多い");
    for (const id of ["du-lvl1-contest-or-concede", "du-slow-push-big-wave-trade"]) {
      // 判断材料のデータ自体に、言い切りの表現を使わない（画面共通の説明文は対象外）
      expect(JSON.stringify(units.find((u) => u.id === id))).not.toMatch(/必ず|確定/);
      expect(text(detail(id))).toContain("ゲーム内では検証していない");
    }
  });
});

describe("既存の判断材料の具体例（Evi 選手のムンド対ジャックス）", () => {
  const ID = "du-trade-checklist";
  const ex = (rawExamples as unknown as { examples: { id: string; unit_id: string; source_ja: string; spec_ja: string; ai_ja: string; scope_ja: string; unverified_ja: string[] }[] }).examples;

  it("du-trade-checklist の詳細に、具体例・原典の主張・仕様・AI の整理・未確認事項・範囲が分かれて出て、動画の5:30へのリンクがある", () => {
    const markup = detail(ID);
    const html = text(markup);
    expect(html).toContain("具体例（別の出典）");
    expect(html).toContain("ムンド対ジャックス（トップ）");
    expect(html).toContain(ex[0].source_ja);
    expect(html).toContain(ex[0].spec_ja);
    expect(markup).toMatch(/AI の整理<\/span>\s*反撃される可能性があると/);
    for (const s of ex[0].unverified_ja) expect(html).toContain(s);
    expect(html).toContain("上のチェックリスト全体の出典ではない");
    expect(markup).toContain('href="https://www.youtube.com/watch?v=1ZYEnr2BTe4&amp;t=330s"');
    expect(html).toContain("5:30から");
    // 既存の出典（MetaBot.GG）へのリンクも残る
    expect(markup).toContain('href="https://metabot.gg/en/league/guides/laning-phase-trading-fundamentals"');
  });

  it("具体例の出典は、判断材料全体の出典として出さない（evidence・見出しの出典・一覧のカードに Evi が入らない）", () => {
    const u = showcaseDecisions.find((x) => x.id === ID)!;
    expect(u.evidence.map((e) => e.source)).toEqual(["src-metabot"]);
    const header = detail(ID).match(/<p class="card-creator">.*?<\/p>/s)![0];
    expect(text(header)).not.toContain("Evi");
    // 一覧には具体例を出さない（一覧のカードの出典は判断材料の出典だけ）
    expect(text(list())).not.toContain("Evi");
    // 具体例の欄は、具体例が付いた判断材料にだけ出る
    for (const id of SHOWCASE_IDS.filter((x) => examplesForUnit(x).length === 0)) expect(text(detail(id))).not.toContain("具体例（別の出典）");
  });

  it("動画の5:30へのリンクは「原典の主張」のすぐ横に1つだけ出し、具体例の出典カードでは重ねて出さない", () => {
    const markup = detail(ID);
    const example = markup.slice(markup.indexOf('id="examples-heading"'), markup.indexOf('id="patch-heading"'));
    const claim = example.match(/<li class="reason reason-source"><span class="badge">原典の主張<\/span>.*?<\/li>/s)![0];
    expect(claim).toContain('href="https://www.youtube.com/watch?v=1ZYEnr2BTe4&amp;t=330s"');
    expect(text(claim)).toContain("動画の5:30から見る");
    expect(example.match(/t=330s/g)).toHaveLength(1);
    const card = example.slice(example.indexOf('class="decision-source"'));
    expect(card).not.toContain("t=330s");
    expect(text(card)).toContain("5:30〜5:56（ナレーションとテロップ）");
    expect(text(card)).not.toContain("該当時間へのリンクは");
    // 確認箇所・確認の範囲・確認レベル・公開日は出典カードに残す
    expect(text(card)).toContain("確認の範囲");
    expect(text(card)).toContain("確認レベル");
    expect(text(card)).toContain("2026-09-03（太平洋時間）");
  });

  it("ほかの判断材料の出典カードでは、時刻リンクの場所を変えない", () => {
    expect(detail("du-dopa-tf-fizz-pull-wave")).toMatch(/<dt>確認箇所<\/dt><dd>[^]*?t=77s/);
  });

  it("言い切らず、5:57 の大砲ミニオンの話は未確認事項にだけ置き、26.10 で削除された条件と混同しない", () => {
    const x = ex[0];
    expect(JSON.stringify(x)).not.toMatch(/必ず|確定/);
    expect([x.source_ja, x.spec_ja, x.ai_ja].join("")).not.toContain("大砲");
    expect(x.unverified_ja.some((s) => s.includes("5:57") && s.includes("大砲"))).toBe(true);
    expect(x.spec_ja).toContain("味方チャンピオンを攻撃している敵チャンピオン");
    expect(x.spec_ja).toContain("パッチ26.10 で削除されたのは「敵チャンピオンが味方ミニオンを攻撃したとき」の条件で、これとは別");
    expect(x.ai_ja).toContain("相手の意図は動画では確認していない");
  });
});

describe("検索画面から具体例へ（Evi・えび・えびんも）", () => {
  const EX = "ex-evi-mundo-jax-minion-retaliation";
  const page = (q: string) => renderToStaticMarkup(<SearchPage q={q} filters={{}} />);

  it("解説者名の検索語で、具体例が見つかる（大文字・カタカナの違いを問わない）", () => {
    for (const q of ["Evi", "EVI", "evi 解説", "えび", "えびんも", "えびンモTV"]) expect(examplesForQuery(q).map((x) => x.id), q).toEqual([EX]);
  });

  it("関係のない語では出さない（英数字は単語の途中で一致させない）", () => {
    for (const q of ["", "evidence", "review", "revive", "ダメトレ", "トレード"]) expect(examplesForQuery(q), q).toEqual([]);
    // 既存の評価用の質問では、具体例を案内しない
    for (const e of EVAL_QUERIES) expect(examplesForQuery(e.query), e.query).toEqual([]);
  });

  it("検索画面では、教材とは別の種類のデータとして案内し、du-trade-checklist へ移動できる。教材の件数は変えない", () => {
    for (const q of ["Evi", "えび", "えびんも"]) {
      const markup = page(q);
      const html = text(markup);
      expect(html).toContain("関連する判断材料の具体例");
      expect(html).toContain("教材ではなく、判断材料に付けた、別の出典の具体例です。上の件数には含みません。");
      expect(html).toContain("この出典が裏付けるのは、この具体例だけです");
      expect(markup).toContain(`href="${decisionHref("du-trade-checklist")}"`);
      const r = search(q, {});
      const full = r.hits.filter((h) => h.match === "full").length;
      expect(html).toContain(`条件に一致：${full}件`);
    }
    expect(text(page("ダメトレ"))).not.toContain("関連する判断材料の具体例");
  });
});

describe("ウェーブ模式図の「なぜそうなるか」", () => {
  it("原典の説明と AI の整理を分けて、模式図の近くに出す", () => {
    const d = DIAGRAMS[0];
    const markup = detail(d.unit_id);
    expect(text(markup)).toContain("なぜそうなるか");
    for (const r of d.why) {
      expect(text(markup)).toContain(r.text);
      const badge = r.basis === "source" ? "原典の説明" : "AI の整理";
      expect(markup).toContain(`${badge}</span> ${r.text}`);
    }
    expect(d.why.some((r) => r.basis === "source")).toBe(true);
    expect(d.why.some((r) => r.basis === "ai")).toBe(true);
    // 中央での差は AI の整理で、未検証と書く
    const mid = d.why.find((r) => r.text.startsWith("中央付近"))!;
    expect(mid.basis).toBe("ai");
    expect(mid.text).toContain("ゲーム内では検証していない");
    expect(JSON.stringify(d.why)).not.toMatch(/必ず|確定/);
  });
});

describe("具体例の2件目（lol-guide：相手にフラッシュがないとき）", () => {
  const ID = "du-trade-checklist";
  const ex = (rawExamples as unknown as { examples: { id: string; source_ja: string; ai_ja: string; scope_ja: string; unverified_ja: string[] }[] }).examples.find((e) => e.id === "ex-lg-qyxqb-enemy-no-flash")!;

  it("記事の主張（反対の条件を含む）・AI の整理・未確認事項・範囲を分けて、du-trade-checklist の具体例として出す", () => {
    const markup = detail(ID);
    const html = text(markup);
    expect(html).toContain("サモナースペルの確認：相手にフラッシュがないとき（ミッド向けの記事）");
    expect(html).toContain(ex.source_ja);
    // 照合で直した点：「ことがある」「相手が弱気になっているなら」、両方にフラッシュがないときの反対の条件
    expect(ex.source_ja).toContain("レーンを下げることがあり");
    expect(ex.source_ja).toContain("相手が弱気になっているなら");
    expect(ex.source_ja).toContain("両方にフラッシュがないときは、お互いに慎重になることがある");
    expect(markup).toMatch(/AI の整理<\/span>\s*上のチェックリストの「サモナースペル」の項目を/);
    for (const u of ex.unverified_ja) expect(html).toContain(u);
    expect(html).toContain("上のチェックリスト全体（5つの確認項目、2〜3個が有利なら仕掛けるという基準）の出典ではない");
    expect(markup).toContain('href="https://www.lol-guide.com/articles/qyxqb"');
    expect(JSON.stringify(ex)).not.toMatch(/必ず|確定/);
  });

  it("判断材料全体の出典には加えない（見出しの出典は MetaBot.GG のまま）", () => {
    const u = showcaseDecisions.find((x) => x.id === ID)!;
    expect(u.evidence.map((e) => e.source)).toEqual(["src-metabot"]);
    const header = detail(ID).match(/<p class="card-creator">.*?<\/p>/s)![0];
    expect(text(header)).not.toContain("がりある");
    expect(examplesForUnit(ID).map((x) => x.id)).toEqual(["ex-evi-mundo-jax-minion-retaliation", "ex-lg-qyxqb-enemy-no-flash"]);
  });
});

describe("原典の資料から具体例への逆引き（案B）", () => {
  const LG = "ex-lg-qyxqb-enemy-no-flash";
  const resourcePage = (id: string) => renderToStaticMarkup(<ResourceDetail id={id} />);

  it("具体例の主たる出典（evidence.source）の resource_id だけで結びつけ、仕様の補足や resource_id のない出典は使わない", () => {
    // 既知の具体例は、それぞれの原典の資料から到達できる（期待する対応は、データから写さずにここに書く）
    const KNOWN: Record<string, string> = {
      [LG]: "res-lg-qyxqb",
      "ex-lg-uhrvk-harass-when-enemy-pushes": "res-lg-uhrvk",
      "ex-garen-support-roam-timing": "res-garen-support-roam",
      "ex-lg-ltnak-turn-length": "res-lg-ltnak",
    };
    for (const [ex, rid] of Object.entries(KNOWN)) expect(examplesForResource(rid).map((x) => x.id), rid).toContain(ex);
    // Evi の具体例の仕様の補足（spec_source：Wiki Minion）は逆引きに使わない。resource_id のない動画の出典は、どの資料にも結びつけない
    expect(examplesForResource("res-wiki-minion")).toEqual([]);
    // 判断材料本体の出典（MetaBot）の資料にも、具体例は出さない
    expect(examplesForResource("res-metabot-trading-2026")).toEqual([]);
    for (const r of index.resources) {
      const list = examplesForResource(r.id);
      // どの資料に出る具体例も、その資料を主たる出典とするもので、試験表示の判断材料に付いたもの。同じ具体例は重複しない
      for (const x of list) {
        expect(sourceById.get(x.evidence.source)?.resource_id, x.id).toBe(r.id);
        expect(SHOWCASE_IDS).toContain(x.unit_id);
      }
      expect(new Set(list.map((x) => x.id)).size).toBe(list.length);
      expect(list.map((x) => x.id)).not.toContain("ex-evi-mundo-jax-minion-retaliation");
    }
  });

  it("資料の詳細に「この資料に基づく具体例（試験）」の欄を、紹介の後・判断材料の欄とは別に出す。具体例がない資料には出さない", () => {
    const markup = resourcePage("res-lg-qyxqb");
    const html = text(markup);
    expect(html).toContain("この資料に基づく具体例（試験）");
    expect(html).toContain("この資料が裏付けるのは具体例だけで、判断材料全体の出典ではありません");
    expect(markup).toContain(`href="${decisionHref("du-trade-checklist", LG)}"`);
    expect(html).toContain("サモナースペルの確認：相手にフラッシュがないとき（ミッド向けの記事）");
    expect(html).toContain("付いている判断材料：トレードの前に");
    expect(markup.indexOf("この資料に基づく具体例（試験）")).toBeGreaterThan(markup.indexOf("紹介"));
    // 判断材料本体の出典ではないので、「この資料から抽出した判断材料」の欄には出さない
    expect(html).not.toContain("この資料から抽出した判断材料");
    for (const id of ["res-metabot-trading-2026", "res-wiki-minion", "res-lg-dauwk"]) expect(text(resourcePage(id))).not.toContain("この資料に基づく具体例");
    // 既存の「この資料から抽出した判断材料」の欄はそのまま
    expect(text(resourcePage("res-metabot-trading-2026"))).toContain("この資料から抽出した判断材料（試験）");
  });

  it("移動先の具体例に id と焦点を受けられる属性があり、別の判断材料の具体例や存在しない id は対象にしない", () => {
    const markup = detail("du-trade-checklist");
    expect(markup).toContain(`id="example-${LG}" tabindex="-1"`);
    expect(markup).toContain('id="example-ex-evi-mundo-jax-minion-retaliation" tabindex="-1"');
    expect(exampleOf("du-trade-checklist", LG)?.id).toBe(LG);
    expect(exampleOf("du-wave-drift-by-meeting-point", LG)).toBeUndefined();
    expect(exampleOf("du-trade-checklist", "no-such-example")).toBeUndefined();
  });
});

describe("具体例の3件目（lol-guide uhrvk）：収録するだけで原典の資料から到達できる", () => {
  const EX = "ex-lg-uhrvk-harass-when-enemy-pushes";
  const UNIT = "du-behind-keep-wave-own-side";

  it("原典の資料 res-lg-uhrvk の詳細に、具体例への直接リンクが自動で出る（データの追加だけで、画面の変更なし）", () => {
    expect(examplesForResource("res-lg-uhrvk").map((x) => x.id)).toEqual([EX]);
    const markup = renderToStaticMarkup(<ResourceDetail id="res-lg-uhrvk" />);
    expect(text(markup)).toContain("この資料に基づく具体例（試験）");
    expect(markup).toContain(`href="${decisionHref(UNIT, EX)}"`);
  });

  it("判断材料の詳細に、照合で直した表現・反対の条件・例外・同じ著者であることを出し、判断材料の出典は変えない", () => {
    const markup = detail(UNIT);
    const html = text(markup);
    expect(markup).toContain(`id="example-${EX}" tabindex="-1"`);
    expect(html).toContain("のはあまりよくない"); // 原典の「あまりよくありません」に合わせた（「しない」と言い切らない）
    expect(html).toContain("ほかのレーンに主導権があるなら、無理に取り返す必要はない");
    expect(html).toContain("ここで勝負しなければ負けるというタイミングもある");
    expect(html).toContain("同じ著者（がりある）の別の記事なので、独立した裏付けにはならない");
    // 判断材料の要旨（ウェーブを自陣側に保つ）まで、この記事が裏付けているように見せない
    expect(html).toContain("上の判断材料の要旨（スキルでウェーブを処理せず、ウェーブを自陣側に保つ）の出典ではない");
    expect(html).toContain("記事は、ウェーブを自陣側に保つことについては述べていない");
    const u = showcaseDecisions.find((x) => x.id === UNIT)!;
    expect(u.evidence.map((e) => e.source)).toEqual(["src-kjumg"]);
    expect(exampleOf(UNIT, EX)?.id).toBe(EX);
  });
});

describe("具体例を追加したときの共通の検査（件数に依存しない）", () => {
  const all = (rawExamples as unknown as { examples: { id: string; unit_id: string; evidence: { source: string } }[] }).examples;

  it("id が重複せず、既知の3件（Evi・フラッシュ差・主導権）がそろっている", () => {
    const ids = all.map((x) => x.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ["ex-evi-mundo-jax-minion-retaliation", "ex-lg-qyxqb-enemy-no-flash", "ex-lg-uhrvk-harass-when-enemy-pushes"]) expect(ids).toContain(id);
  });

  it("主たる出典が資料に結びつく具体例は、試験表示の判断材料に付いていれば、その資料の詳細から直接リンクされる", () => {
    for (const x of all) {
      const rid = sourceById.get(x.evidence.source)?.resource_id;
      if (!rid || !SHOWCASE_IDS.includes(x.unit_id as (typeof SHOWCASE_IDS)[number])) continue;
      expect(renderToStaticMarkup(<ResourceDetail id={rid} />), x.id).toContain(`href="${decisionHref(x.unit_id, x.id)}"`);
    }
  });
});

describe("連続収録の試験で加えた具体例（LoLGaren のサポートのローム、lol-guide のターン）", () => {
  const CASES = [
    {
      ex: "ex-garen-support-roam-timing",
      unit: "du-bounce-after-crash",
      resource: "res-garen-support-roam",
      unitSources: ["src-yzwsh", "src-dig2020", "src-loltheory"],
      // 照合で直した点：「しないほうがいい場面」（言い切らない）、スロープッシュの条件、大きく負けている場合の例外
      phrases: ["ロームしないほうがいい場面もあり", "スロープッシュ（2ウェーブくらいのビッグウェーブ）", "大きく負けている場合はローム自体が難しい", "いつも跳ね返るとは限らない"],
    },
    {
      ex: "ex-lg-ltnak-turn-length",
      unit: "du-plates-vs-clean-recall",
      resource: "res-lg-ltnak",
      unitSources: ["src-loltheory"],
      // 照合で直した点：優位なときしかターンは来ない、リコールで相手にターンが渡る、相手がいつも対応できないとは書かれていない
      phrases: ["ターンは、レーン戦で優位な状態でしか回ってこない", "相手にターンが渡る可能性がある", "相手がいつも対応できないとは書かれていない", "上の判断材料の要旨（タワープレートのために、時機の良いリコールを犠牲にしない）の出典ではない"],
    },
  ];
  it.each(CASES)("$ex：原典の資料から直接リンクされ、照合で直した表現と範囲が出る。判断材料の出典は変えない", ({ ex, unit, resource, unitSources, phrases }) => {
    expect(renderToStaticMarkup(<ResourceDetail id={resource} />)).toContain(`href="${decisionHref(unit, ex)}"`);
    const markup = detail(unit);
    expect(markup).toContain(`id="example-${ex}" tabindex="-1"`);
    for (const ph of phrases) expect(text(markup)).toContain(ph);
    const u = showcaseDecisions.find((x) => x.id === unit)!;
    expect([...new Set(u.evidence.map((e) => e.source))]).toEqual(unitSources);
  });
});
