// 表示の検査。追加の依存を使わず、react-dom/server で HTML を生成して確認する。
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { index } from "../data/dataset";
import { STATUS_LABELS, LEVEL_LABELS } from "../data/labels";
import { ResourceDetail } from "./ResourceDetail";
import { SearchPage } from "./SearchPage";
import { TopicIndex, TopicPage } from "./TopicPages";

const detail = (id: string) => renderToStaticMarkup(<ResourceDetail id={id} />);
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ");
// 「未検証」「検証は行っていません」は良いが、「検証済み」と単独で言い切る表示は禁止
const OVERCLAIM = /(?<!未)検証済み(?!として扱わない)|(?<!未)確認済みの仕様|仕様として確認済み|ゲーム内で検証済み/;

describe("6. Evidence のない Resource も詳細を表示できる", () => {
  const noEvidence = index.publicResources.filter((r) => !index.evidenceByResource.has(r.id));

  it("該当する資料がある（前提）", () => {
    expect(noEvidence.length).toBeGreaterThan(10);
  });

  it.each(noEvidence.map((r) => [r.id]))("%s", (id) => {
    const html = text(detail(id));
    expect(html).toContain(text(index.resourceById.get(id)!.title!).trim());
    expect(html).toContain("この資料に関連付けられた知識ノートはありません");
    expect(html).toContain("元の資料を開く");
  });

  it("存在しない ID でも落ちない", () => {
    expect(text(detail("res-does-not-exist"))).toContain("資料が見つかりません");
  });
});

describe("8. source_stated や unverified を過大評価しない", () => {
  it("ラベル定義に過大な表現がない", () => {
    for (const s of Object.values(STATUS_LABELS)) expect(`${s.label} ${s.description}`).not.toMatch(OVERCLAIM);
    for (const l of Object.values(LEVEL_LABELS)) expect(`${l.short} ${l.description}`).not.toMatch(OVERCLAIM);
    expect(LEVEL_LABELS.L3.description).toContain("ゲーム内での検証ではありません");
  });

  it.each(index.resources.map((r) => [r.id]))("%s の詳細に過大な表現がない", (id) => {
    expect(text(detail(id))).not.toMatch(OVERCLAIM);
  });

  it("source_stated のノートは「資料に記載あり」と「ゲーム内では未検証」を併記する", () => {
    const html = text(detail("res-wiki-jax"));
    expect(html).toContain("資料に記載あり");
    expect(html).toContain("ゲーム内では未検証");
    expect(html).toContain("ゲーム内での検証：未実施");
  });

  it("未検証の仮説は「未検証の仮説」と表示する", () => {
    expect(text(detail("res-yt-veigarv2-recall-timer"))).toContain("未検証の仮説");
  });

  it("導出・推論・経験則を区別して表示する", () => {
    expect(text(detail("res-riot-patch-26-1-en"))).toContain("導出（計算・論理）");
    expect(text(detail("res-wiki-jax"))).toContain("戦術的な推論");
    expect(text(detail("res-metabot-trading-2026"))).toContain("経験則・解説者の主張");
  });

  it("L2 の動画区間は本編未確認と明記する", () => {
    expect(text(detail("res-yt-veigarv2-recall-timer"))).toContain("本編の内容は確認していません");
  });
});

describe("9. 昔の資料を現行パッチで検証済みと誤表示しない", () => {
  const current = index.data.research_context.current_patch_at_research;

  it.each(["res-engadget-wards-2014", "res-wiki-v3-14", "res-wiki-sight-ward", "res-wiki-season-one"])("%s", (id) => {
    const html = text(detail(id));
    expect(html).not.toMatch(OVERCLAIM);
    expect(html).not.toContain(`パッチ ${current} で検証`);
  });

  it("2014年の主張は対象時期と「未確認」の適用可能性を表示する", () => {
    const html = text(detail("res-engadget-wards-2014"));
    expect(html).toContain("主張の対象時期： シーズン4（この時期のみ）");
    expect(html).toContain("現行環境への適用可能性：未確認");
  });

  it("V3.14 の仕様は終了時期が未確認であることを示し、現在も有効とは表示しない", () => {
    const html = text(detail("res-wiki-v3-14"));
    expect(html).toContain("V3.14〜（終了時期は未確認）");
    expect(html).toContain("現行環境への適用可能性：未確認");
    expect(html).not.toContain("現行環境でも確認済み");
  });
});

describe("画面全体の描画", () => {
  it("トップ画面：検索欄・質問例・Topic 入口・件数", () => {
    const html = text(renderToStaticMarkup(<SearchPage q="" filters={{}} />));
    expect(html).toContain("何を知りたいですか？");
    expect(html).toContain("質問の例");
    expect(html).toContain("Topic から探す");
    expect(html).toContain("資料一覧 36件");
  });

  it("0件のとき、言い換えと絞り込み解除を案内する", () => {
    const html = text(renderToStaticMarkup(<SearchPage q="qwertyuiop" filters={{ lang: "ja" }} />));
    expect(html).toContain("この検索条件では、Rift Compass に登録された公開資料から一致する資料が見つかりませんでした");
    expect(html).toContain("その話題を扱う資料が存在しないという意味ではありません");
    expect(html).toContain("絞り込みを解除する");
  });

  it("一部一致のときは、条件に一致した資料と関連候補を分け、候補を条件ごとにまとめる", () => {
    for (const q of ["Dopaの古いウェーブ管理を学びたい", "Dopa ウェーブ管理"]) {
      const html = text(renderToStaticMarkup(<SearchPage q={q} filters={{}} />));
      expect(html, q).toContain("条件に一致：0件・認識できた条件に一致：0件・関連候補：12件");
      expect(html, q).toContain("すべての条件に一致する資料はありません");
      expect(html, q).toContain("発信者「Official dopa / Dopa English」 にだけ一致");
      expect(html, q).toContain("Topic「ウェーブ管理」 にだけ一致");
      expect(html, q).toContain("一部の条件に一致");
      expect(html, q).not.toContain("認識できた条件に一致 "); // カードのバッジ（認識できた条件に一致）は出ない
    }
  });

  it("Phase 2B：主題に一致し、抽出した語だけが未一致の候補は、そのことを案内する（判定は変えない）", () => {
    const cases: [string, string, string[]][] = [
      ["レーンをフリーズしたいとき、なぜタワーの手前でミニオンを止めるの？", "主題（Topic「フリーズ」）に一致する資料は", ["「レーン」", "「ミニオン」"]],
      ["VeigarV2がリコールするタイミングを説明している動画を見たい。", "主題（発信者「Veigar v2」・Topic「リコール」）に一致する資料は", ["「説明」"]],
    ];
    for (const [q, subject, terms] of cases) {
      const html = text(renderToStaticMarkup(<SearchPage q={q} filters={{}} />));
      expect(html, q).toContain("条件に一致：0件"); // 検索エンジンの判定（full 0件）はそのまま
      expect(html, q).toContain(subject);
      for (const t of terms) expect(html, q).toContain(t);
      expect(html, q).toContain("「条件に一致」には数えていません");
      expect(html, q).not.toContain("すべての条件に一致する資料はありません");
      expect(html, q).toContain("一致しなかった条件：");
    }
  });

  describe("Phase 3A：外部探索の導線", () => {
    const externalAnchors = (markup: string) =>
      [...markup.matchAll(/<a [^>]*href="(https:\/\/www\.(?:google|youtube)\.com\/[^"]*)"[^>]*>/g)].map((m) => ({ tag: m[0], href: m[1].replace(/&amp;/g, "&") }));

    it("検索語が空なら表示しない", () => {
      const markup = renderToStaticMarkup(<SearchPage q="" filters={{}} />);
      expect(markup).not.toContain("Rift Compass の外で探す");
      expect(externalAnchors(markup)).toHaveLength(0);
    });

    it.each([
      ["0件", "ザヤとラカンのシナジー"],
      ["関連候補のみ", "Dopa ウェーブ管理"],
      ["条件に一致あり", "VeigarV2 リコール"],
    ])("%s（%s）でも外部検索でき、リンクは新しいタブ・noopener noreferrer", (_label, q) => {
      const markup = renderToStaticMarkup(<SearchPage q={q} filters={{}} />);
      const html = text(markup);
      expect(html).toContain("Rift Compass の外で探す");
      expect(html).toContain("入力した検索語が Google または YouTube に送られ");
      expect(html).toContain("答えが見つかるとは限りません");
      const anchors = externalAnchors(markup);
      expect(anchors.map((a) => new URL(a.href).hostname)).toEqual(["www.google.com", "www.youtube.com"]);
      for (const a of anchors) {
        expect(a.tag).toContain('target="_blank"');
        expect(a.tag).toContain('rel="noopener noreferrer"');
      }
      expect(new URL(anchors[0].href).searchParams.get("q")).toBe(`${q} League of Legends`);
    });

    it("外部の情報を検証済みとは表示しない", () => {
      const html = text(renderToStaticMarkup(<SearchPage q="VeigarV2 リコール" filters={{}} />));
      expect(html).toContain("Rift Compass では確認しておらず");
      expect(html).toContain("検索語に一致した資料が、質問に直接答えているとは限りません");
      expect(html).not.toMatch(OVERCLAIM);
    });
  });

  it("未知語があるときは、条件に含めなかったことを明示する", () => {
    const html = text(renderToStaticMarkup(<SearchPage q="VeigarV2 ダメージ計算" filters={{}} />));
    expect(html).toContain("「ダメージ計算」は資料中に見つからなかったため、検索条件に含めていません");
    expect(html).toContain("扱っているとは限りません");
  });

  it("認識できた条件だけに一致した資料を、完全一致の件数に数えない（VeigarV2 ダメージ計算）", () => {
    const markup = renderToStaticMarkup(<SearchPage q="VeigarV2 ダメージ計算" filters={{}} />);
    const html = text(markup);
    expect(html).toContain("条件に一致：0件・認識できた条件に一致：8件・関連候補：0件");
    expect(html).not.toMatch(/(?<!できた)条件に一致：8件/);
    // 主一覧の8件すべてのカードに「認識できた条件に一致」のバッジが付く
    expect(markup.match(/<span class="badge partial">認識できた条件に一致<\/span>/g) ?? []).toHaveLength(8);
    expect(html).not.toContain("一部の条件だけに関連する候補");
  });

  it("通常の完全一致検索は従来どおり（VeigarV2 リコール）", () => {
    const markup = renderToStaticMarkup(<SearchPage q="VeigarV2 リコール" filters={{}} />);
    const html = text(markup);
    expect(html).toContain("条件に一致：2件・認識できた条件に一致：0件・関連候補：");
    expect(html).not.toContain("検索条件に含めていません");
    expect(html).not.toContain("すべての条件に一致する資料はありません");
    expect(markup).not.toContain(">認識できた条件に一致</span>");
    // 完全一致の2件が主一覧の先頭に並ぶ
    const titles = [...markup.matchAll(/<h3 class="card-title"><a href="#\/r\/([^"]+)"/g)].map((m) => m[1]);
    expect(titles.slice(0, 2)).toEqual(["res-yt-veigarv2-recall-timer", "res-yt-veigarv2-coaching-ruu"]);
  });

  it("データ由来の内部用語（valid_until・Note・資料ID）をそのまま表示しない", () => {
    for (const id of index.resources.map((r) => r.id)) {
      const html = text(detail(id));
      const m = html.match(/.{0,30}(valid_until|valid_from|\bNote\b|\bEvidence\b|\b(res|kn|ev)-[a-z0-9]).{0,30}/);
      expect(m?.[0], id).toBeUndefined();
    }
    expect(text(detail("res-wiki-v3-14"))).toContain("終了時期は空欄");
  });

  it("外部リンクは安全な属性で開く", () => {
    const html = detail("res-yt-veigarv2-recall-timer");
    const anchors = html.match(/<a [^>]*target="_blank"[^>]*>/g) ?? [];
    expect(anchors.length).toBeGreaterThan(0);
    for (const a of anchors) expect(a).toContain('rel="noopener noreferrer"');
  });

  it("Topic 一覧は複数の親を持つ Topic を各分類の下に表示し、循環しない", () => {
    const html = renderToStaticMarkup(<TopicIndex />);
    const count = (html.match(/href="#\/topic\/minion-aggro"/g) ?? []).length;
    expect(count).toBeGreaterThanOrEqual(2); // ウェーブ管理の下と、ゲームの基本仕様の下
  });

  it("Topic 詳細は下位 Topic の資料も表示する", () => {
    // MetaBot の記事は level-2（experience の下位）だけが付いている
    const html = text(renderToStaticMarkup(<TopicPage id="experience" />));
    expect(html).toContain("下位の Topic の資料");
    expect(html).toContain("Laning Phase Fundamentals");
  });
});
