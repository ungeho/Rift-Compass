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
    // 対策を求める検索：対象と結び付いた対策の記述は並び順の参考にするが、視点・正しさは判定しない
    expect(text(renderToStaticMarkup(<RelatedNotes q="ジャックスのEの対策" />))).toContain("ノートの視点や答えの正しさを判定するものではありません");
    // 対策を求めない検索（使い方・Topic の名前だけ）：並び順にも使っていないと示す
    for (const q of ["カイトの使い方", "対面対策"]) {
      const t = text(renderToStaticMarkup(<RelatedNotes q={q} />));
      expect(t, q).toContain("ノートが使う側・対策する側のどちらの視点で書かれているかは判定していません（並び順にも使っていません）");
      expect(t, q).not.toContain("並び順の参考にします");
    }
    const plain = text(renderToStaticMarkup(<RelatedNotes q="ジャックスのE" />));
    expect(plain).not.toContain("判定していません。");
    // どの一致にも「一致は回答ではない」の説明が付く
    expect(plain).toContain("「一致」は候補に含めた理由で、ノートがその質問に正しく答えていることを示しません");
  });

  it("ノートの種類による一致は、Topic の一致と区別して「ノートの種類「仕様」」と示す（2026-11-09）", () => {
    const html = renderToStaticMarkup(<RelatedNotes q="スマイトの仕様" />);
    const t = text(html);
    expect(html).toContain(`href="${noteHref("kn-smite-damage-261")}"`);
    expect(t).toContain("一致：「仕様」：ノートの種類「仕様」 ／ 「スマイト」：主張");
    // 基本仕様の下の Topic で一致したノートは、Topic の一致として示す
    expect(t).toContain("「仕様」：Topic「ゲームの基本仕様」›「ロールクエスト」");
    expect(t).toContain("種類はノートの分類で、ゲーム内での検証ではありません");
    expect(t).toContain("「一致」は候補に含めた理由で、ノートがその質問に正しく答えていることを示しません");
  });

  it("対策を求める検索の並び順を説明し、視点の注意と、正答を保証しない注意を出す（2026-11-09）", () => {
    const t = text(renderToStaticMarkup(<RelatedNotes q="カイトへの対抗策" />));
    expect(t).toContain("検索の対象と結び付いた対策の記述（例：「カイトされる側」）がノートの主張・成立条件にあるときは、同じ一致の区分の中でそのノートを先に並べることがあります（立場や内容が正しいかは判定していません）");
    expect(t).toContain("検索の対象と結び付いた明示的な対策の記述は並び順の参考にしますが、ノートの視点や答えの正しさを判定するものではありません");
    expect(t).toContain("「一致」は候補に含めた理由で、ノートがその質問に正しく答えていることを示しません");
    expect(t).not.toContain("知識ノートに見つからず、ノートの照合に使わなかった語：対抗策");
  });

  it("照合・並び順の詳しい説明は最初は閉じた欄に置き、正答を保証しない注意は最初から見せる（2026-11-09）", () => {
    const html = renderToStaticMarkup(<RelatedNotes q="カイトへの対抗策" />);
    // 閉じた details（open 属性なし）の中に詳しい説明がある
    const help = html.match(/<details class="related-notes-help">([\s\S]*?)<\/details>/);
    expect(help).not.toBeNull();
    const h = text(help![1]);
    expect(h).toContain("検索条件・並び順の説明");
    for (const s of ["根拠のある公開の知識ノートの主張・成立条件・例外・Topic の名前と、根拠の要約を検索語で照合します", "一部の条件だけに一致したノートは「関連候補」", "旧仕様の）ノートは、同じ区分の中で後ろに並べます", "主張・成立条件に検索語があるノートを", "「カイト」「カイティング」「kiting」は同じ意味の語", "種類はノートの分類で、ゲーム内での検証ではありません", "同じ一致の区分の中でそのノートを先に並べることがあります"]) expect(h, s).toContain(s);
    // 詳しい説明の外（最初から見える部分）に、正答を保証しない注意がある
    const visible = text(html.replace(/<details class="related-notes-help">[\s\S]*?<\/details>/, ""));
    expect(visible).toContain("「一致」は候補に含めた理由で、ノートがその質問に正しく答えていることを示しません");
    expect(visible).toContain("並び順も答えの正しさを示しません");
    expect(visible).not.toContain("「カイト」「カイティング」「kiting」は同じ意味の語");
  });

  it("照合用の同義の表記による一致を、表記どおりの一致と区別して示す。説明は閉じた欄に置く（2026-11-10）", () => {
    const html = renderToStaticMarkup(<RelatedNotes q="フラッシュのクールダウン" />);
    const t = text(html);
    expect(html).toContain(`href="${noteHref("kn-flash-cd")}"`);
    expect(t).toContain("一致：「クールダウン」：主張（同義の表記「CD」）・根拠の要約（同義の表記「CD」） ／ 「フラッシュ」：Topic「サモナースペル」・主張");
    // 表記どおりの検索では、同義の表記とは示さない
    expect(text(renderToStaticMarkup(<RelatedNotes q="フラッシュのCD" />))).not.toContain("同義の表記「");
    // 説明は閉じた欄の中だけ。最初から見える部分は従来の2文のまま
    const help = text(html.match(/<details class="related-notes-help">([\s\S]*?)<\/details>/)![1]);
    expect(help).toContain("「CD」と「クールダウン」は、検索の対象（例：「フラッシュ」。「相手」「スキル」は除く）も主張・成立条件にあるノートでだけ同じ語として照合し、「同義の表記」と示します");
    expect(help).toContain("「カイト」「カイティング」「kiting」は同じ意味の語");
    const visible = text(html.replace(/<details class="related-notes-help">[\s\S]*?<\/details>/, ""));
    expect(visible).not.toContain("「CD」と「クールダウン」は");
    expect(visible).toContain("「一致」は候補に含めた理由で、ノートがその質問に正しく答えていることを示しません");
  });

  it("Topic の正式な名前だけの検索の並び順を、閉じた説明の欄で説明する。順位は検証状態を示さない（2026-11-10）", () => {
    const html = renderToStaticMarkup(<RelatedNotes q="クールダウン" />);
    const help = text(html.match(/<details class="related-notes-help">([\s\S]*?)<\/details>/)![1]);
    const rule = "ただし、検索語が Topic の正式な名前だけ（例：「サモナースペル」「クールダウン」）のときは、その Topic（下位の Topic を含む）が付いたノートを、名前に触れているだけのノートより先に並べます。別名（例：「フラッシュ」「CD」「カイト」）や、ほかの語を含む検索では、主張・成立条件への一致を優先します。Topic が付いていることは、内容の正しさやゲーム内での検証を示しません。";
    expect(help).toContain(rule);
    // 通常の規則（主張・成立条件を先）の直後に、例外として置く
    expect(help.indexOf("主張・成立条件に検索語があるノートを、Topic・補足などだけで一致したノートより先に並べます。")).toBeLessThan(help.indexOf(rule));
    // 最初から見える部分は従来の2文のまま
    const visible = text(html.replace(/<details class="related-notes-help">[\s\S]*?<\/details>/, ""));
    expect(visible).not.toContain("Topic の正式な名前だけ");
    expect(visible).toContain("「一致」は候補に含めた理由で、ノートがその質問に正しく答えていることを示しません。並び順も答えの正しさを示しません。");
    // 「クールダウン」で3位に上がる未検証の仮説のノートは、カードに種類と検証状態を出す
    const cards = html.split('<li class="note-match">').slice(1);
    const third = cards[2];
    expect(third).toContain(`href="${noteHref("kn-trade-window-6-8s")}"`);
    expect(text(third)).toContain("仮説");
    expect(text(third)).toContain("未検証の仮説");
    expect(text(third)).toContain("ゲーム内での検証：未実施");
    expect(text(third)).toContain("「クールダウン」：Topic「クールダウン」");
  });

  it("具体例の語の検索で、上位の Topic との関係だけの関連候補を、一部の条件だけに一致した候補と区別して示す（2026-11-10）", () => {
    const html = renderToStaticMarkup(<RelatedNotes q="イグナイト" />);
    const t = text(html);
    // 件数：全条件一致2件、ほかは「一部一致」ではなく「関連候補」
    expect(t).toContain("検索語に一致した知識ノート 知識ノート ：2件（ほかに関連候補 6件）");
    expect(t).not.toContain("一部一致の関連候補");
    // 関連候補は従来どおり閉じた欄に、理由を区別した見出しで出す
    const part = html.match(/<details class="related-notes-partial">([\s\S]*)<\/details>/);
    expect(part).not.toBeNull();
    expect(text(part![1])).toContain("上位の Topic との関係だけの関連候補：6件");
    expect(text(part![1])).not.toContain("一部の条件だけに一致");
    expect(text(part![1])).toContain("上位の Topic との関係だけ（関連候補）");
    expect(text(part![1])).toContain("「イグナイト」：上位の Topic「サモナースペル」が付いているだけ（記述に「イグナイト」はありません）");
    expect(part![1]).toContain(`href="${noteHref("kn-flash-cd")}"`);
    // 全条件一致のノートは、記述での一致を示す
    expect(t).toContain("「イグナイト」：Topic「サモナースペル」・主張");
    // 同じ具体例の別の表記による一致は、表記どおりの一致・照合用の同義の表記と区別して示す
    const kiting = text(renderToStaticMarkup(<RelatedNotes q="カイティング" />));
    expect(kiting).toContain("（同じものの別の表記「カイト」）");
    expect(text(renderToStaticMarkup(<RelatedNotes q="barrier" />))).toContain("主張（同じものの別の表記「バリア」）");
    // 複数条件の検索で、一部の条件に一致しなかった候補だけのときは従来の表示のまま
    expect(text(renderToStaticMarkup(<RelatedNotes q="フラッシュ CD" />))).toContain("一部の条件だけに一致した関連候補");
    // 未分類の別名・表示名の検索は従来どおり（関連候補へ移さない）
    for (const q of ["サモスペ", "サモナースペル", "CD"]) {
      const outsideHelp = text(renderToStaticMarkup(<RelatedNotes q={q} />).replace(/<details class="related-notes-help">[\s\S]*?<\/details>/, ""));
      expect(outsideHelp, q).not.toContain("上位の Topic との関係だけ");
      expect(outsideHelp, q).not.toContain("関連候補");
    }
    // 説明は閉じた欄の中に置く。最初から見える説明は従来の2文のまま
    const help = text(html.match(/<details class="related-notes-help">([\s\S]*?)<\/details>/)![1]);
    expect(help).toContain("広い Topic（サモナースペル・操作技術）の具体例として確かめた語で検索したときは、その語か同じものの別の表記（例：「カイト」と「カイティング」）が記述にあるノートだけを、その条件に一致したものとします。上位の Topic が付いているだけのノートは、1語の検索でも「上位の Topic との関係だけ」の関連候補として後ろの閉じた欄に出します。");
    const visible = text(html.replace(/<details class="related-notes-help">[\s\S]*?<\/details>/, ""));
    expect(visible).toContain("「一致」は候補に含めた理由で、ノートがその質問に正しく答えていることを示しません。並び順も答えの正しさを示しません。");
  });

  it("スキルドッジの専用のノートは「同じことを表す記述」として示し、別名の表記違い・上位の Topic だけとは区別する（2026-11-10）", () => {
    const html = renderToStaticMarkup(<RelatedNotes q="スキルドッジ" />);
    const t = text(html);
    expect(t).toContain("検索語に一致した知識ノート 知識ノート ：2件（ほかに関連候補 39件）");
    expect(t).toContain("「スキルドッジ」：Topic「操作技術・フィジカル」・主張（同じことを表す記述「スキルショットを避ける」）");
    expect(t).not.toContain("同じものの別の表記「スキルショットを避ける」");
    const part = html.match(/<details class="related-notes-partial">([\s\S]*)<\/details>/)![1];
    expect(text(part)).toContain("上位の Topic との関係だけの関連候補：39件");
    expect(part).not.toContain(`href="${noteHref("kn-skill-dodge-perpendicular")}"`);
    const help = text(html.match(/<details class="related-notes-help">([\s\S]*?)<\/details>/)![1]);
    expect(help).toContain("「スキルドッジ」は、確かめた記述の言い換え「スキルショットを避ける」も同じことを表すものとして扱い、「同じことを表す記述」と示します（別名の表記違いとは区別します）。");
    const visible = text(html.replace(/<details class="related-notes-help">[\s\S]*?<\/details>/, ""));
    expect(visible).not.toContain("確かめた記述の言い換え");
  });

  it("関連候補が多いときも、閉じた欄の中で「さらに表示」から全件に届く（2026-11-10）", () => {
    // カイト：全条件一致9件、関連候補32件（20件ずつ表示）
    const html = renderToStaticMarkup(<RelatedNotes q="カイト" />);
    const part = html.match(/<details class="related-notes-partial">([\s\S]*)<\/details>/)![1];
    expect(text(part)).toContain("上位の Topic との関係だけの関連候補：32件");
    expect(part.split('<li class="note-match">').length - 1).toBe(20);
    expect(text(part)).toContain("知識ノートをさらに12件表示する（残り 12件）");
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
    expect(t).toContain("ウェーブ操作の質問");
    expect(t).toContain("そのほかの分野の質問");
    for (const e of QUESTION_ENTRANCES) expect(html).toContain(`href="${decisionHref(e.unit_id)}"`);
    for (const e of KNOWLEDGE_ENTRANCES) {
      const anchor = [...html.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)].find(m => m[1] === homeHref(e.question_ja).replace(/&/g, "&amp;"));
      expect(anchor).toBeDefined();
      expect(text(anchor![2])).toContain(e.question_ja);
    }
  });
});
