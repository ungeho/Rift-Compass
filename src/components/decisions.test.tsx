// Phase 5D：判断材料（試験）の閲覧画面の検査。react-dom/server で HTML を生成して確認する。
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import raw from "../../data/experiments/decision-units.json";
import rawCriteria from "../../data/experiments/decision-criteria.json";
import { index } from "../data/dataset";
import { NONE_PARTIAL, SHOWCASE_IDS, showcaseDecisions, sourceById, type DecisionUnit } from "../data/decisions";
import { parseHash, decisionHref, decisionsHref } from "../router";
import { DecisionDetail, DecisionIndex } from "./DecisionPages";
import { ResourceDetail } from "./ResourceDetail";

const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ");
const list = (topic = "") => renderToStaticMarkup(<DecisionIndex topic={topic} />);
const detail = (id: string) => renderToStaticMarkup(<DecisionDetail id={id} />);
// Phase 5B（29件）と Phase 5E の判断材料を合わせたもの
const units = [...(raw as unknown as { units: DecisionUnit[] }).units, ...(rawCriteria as unknown as { units: DecisionUnit[] }).units];
const OVERCLAIM = /(?<!未)検証済み|(?<!未)確認済みの仕様|仕様として確認済み|ゲーム内で検証済み|おすすめ|推奨します|すべきです/;

describe("表示している主張は実験データと一致する", () => {
  it("試験表示は実験データの19件（Phase 5D の9件＋Phase 5E の5件＋Phase 6A の5件）で、内容を書き換えていない", () => {
    expect(SHOWCASE_IDS).toHaveLength(19);
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
      const withSec = u.evidence.filter((e) => typeof e.locator === "object" && e.locator.start_sec !== undefined).length;
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

describe("Phase 5E：具体的な目安と資料間の比較", () => {
  const crit = rawCriteria as unknown as {
    criteria: { id: string; unit_id: string | null; value_ja: string; target_ja: string; observe_ja: string; context_ja: string; locator: string }[];
    comparisons: { id: string; items: string[]; verdict: string; undetermined_ja: string[] }[];
  };
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
    const pages = [list(), ...["cmp-freeze-minion-count", "cmp-recall-criteria", "cmp-lv2-minion-count"].map(compareList), ...SHOWCASE_IDS.map(detail)];
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
