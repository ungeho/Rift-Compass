import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { index } from "../data/dataset";
import { publicNotes } from "../data/explorePool";
import { KNOWLEDGE_ENTRANCES } from "../data/questionEntrances";
import { QUESTION_ENTRANCES } from "../data/decisions";
import { decisionHref, homeHref, noteHref } from "../router";
import { RelatedNotes } from "./RelatedNotes";
import { SearchPage } from "./SearchPage";

const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ");
const page = (q: string) => renderToStaticMarkup(<SearchPage q={q} filters={{}} />);
const publicIds = new Set(publicNotes.map((n) => n.id));

describe("検索画面の「検索語に一致した知識ノート」", () => {
  it("ノートにしかない語でも、資料とは別枠にノートのカードと詳細へのリンクを出す。資料の件数の表示は変えない", () => {
    const html = page("ヴォイドグラブ");
    const t = text(html);
    expect(t).toContain("検索語に一致した知識ノート");
    expect(html).toContain(`href="${noteHref("kn-diagonal-trade-exceptions")}"`);
    expect(t).toContain("「一致」は候補に含めた理由で、ノートがその質問に正しく答えていることを示しません");
    expect(t).toContain("「ヴォイドグラブ」：主張");
    // 資料の検索は従来どおり、この語を使わない
    expect(t).toContain("資料中に見つからず、検索条件に含めなかった語：ヴォイドグラブ");
  });

  it("画面に出るノートのリンクは公開ノートだけ", () => {
    for (const q of ["Lv2", "レベル2 ミニオン", "攻撃的なビルド", "トレード", "イグナイト"]) {
      for (const m of page(q).matchAll(/href="#\/note\/([^"]+)"/g)) expect(publicIds.has(decodeURIComponent(m[1]))).toBe(true);
    }
  });

  it("旧仕様・未検証・成立条件・例外を表示する", () => {
    const t = text(renderToStaticMarkup(<RelatedNotes q="タワーのプレートは、今も14分で落ちる？" />));
    expect(t).toContain("現行では適用できない（仕様変更）");
    expect(t).toContain("ゲーム内での検証：未実施");
    const cond = text(renderToStaticMarkup(<RelatedNotes q="フラッシュが落ちている相手に仕掛けるべき？" />));
    expect(cond).toContain("成立条件：");
    expect(cond).toContain("フラッシュの使用時刻を把握している");
    const ex = text(renderToStaticMarkup(<RelatedNotes q="AA無効化" />));
    expect(ex).toContain("例外：");
  });

  it("否定の表現があるときは、向きを判定していないことを示す。一部一致は関連候補として閉じて出す", () => {
    expect(text(renderToStaticMarkup(<RelatedNotes q="フリーズしないほうがいいのはどんなとき？" />))).toContain("ノートの主張が検索語と同じ向きかどうかは判定していません");
    const html = renderToStaticMarkup(<RelatedNotes q="フラッシュ CD" />);
    expect(text(html)).toContain("一部の条件だけに一致した関連候補");
    expect(html).toMatch(/<details class="related-notes-partial">/);
  });

  it("有利・不利、使う側・対策側の表現があるときは、ノートの立場・視点を判定していないことを示す", () => {
    expect(text(renderToStaticMarkup(<RelatedNotes q="有利なときのリコールのタイミング" />))).toContain("ノートが前提とする立場（有利な側か不利な側か）が知りたい状況と同じかは判定していません");
    expect(text(renderToStaticMarkup(<RelatedNotes q="ジャックスのEの対策" />))).toContain("使う側・対策する側のどちらの視点で書かれているかは判定していません");
    const plain = text(renderToStaticMarkup(<RelatedNotes q="ジャックスのE" />));
    expect(plain).not.toContain("判定していません。");
    // どの一致にも「一致は回答ではない」の説明が付く
    expect(plain).toContain("「一致」は候補に含めた理由で、ノートがその質問に正しく答えていることを示しません");
  });

  it("一致するノートがなければ何も出さない", () => {
    expect(renderToStaticMarkup(<RelatedNotes q="アタカン" />)).toBe("");
    expect(text(page("how to freeze a lane"))).toContain("検索語に一致した知識ノート");
    expect(index.data.knowledge_notes.length).toBeGreaterThan(publicNotes.length);
  });
});

describe("知りたいことから探す：ウェーブ操作と、そのほかの分野", () => {
  it("トップ画面に、判断材料へ移動する疑問と、検索結果へ移動する疑問の両方を出す", () => {
    const html = page("");
    const t = text(html);
    expect(t).toContain("ウェーブ操作（判断材料に移動）");
    expect(t).toContain("そのほかの分野（検索結果に移動）");
    for (const e of QUESTION_ENTRANCES) expect(html).toContain(`href="${decisionHref(e.unit_id)}"`);
    for (const e of KNOWLEDGE_ENTRANCES) expect(html).toContain(`href="${homeHref(e.question_ja).replace(/&/g, "&amp;")}">${e.question_ja}</a>`);
  });
});
