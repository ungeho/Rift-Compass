// ステルス・視界・看破の正式登録（2026-11-02）：仕様・旧仕様・未確認・戦術的推論の区別と、検索での到達
import { describe, expect, it } from "vitest";
import { index } from "./dataset";
import { publicNotes } from "./explorePool";
import { noteMatchesForQuery } from "./noteSearch";
import { search } from "../search/search";

const note = (id: string) => {
  const n = index.noteById.get(id);
  if (!n) throw new Error(`note ${id} がない`);
  return n;
};
const evidenceOf = (id: string) => index.data.evidence.filter((e) => e.note_id === id);

describe("ステルスの分類と、見える・位置が分かる・対象にできるの区別", () => {
  it("カモフラージュとインビジブルとステルス状態の罠を別のノートにし、インビジブルは真の視界でだけ見える", () => {
    expect(note("kn-stealth-three-types").status).toBe("source_stated");
    expect(note("kn-camouflage-reveal-conditions").statement_ja).toContain("コントロールワード");
    expect(note("kn-invisibility-true-sight-only").statement_ja).toContain("真の視界の効果を受けたときだけ");
    expect(note("kn-stealthed-traps-reveal").statement_ja).toContain("対象指定不可");
  });
  it("コントロールワードがインビジブルを見せないことは、仕様の2つのノートからの導出（derived）として、前提の関係を持つ", () => {
    const n = note("kn-control-ward-not-invisible");
    expect(n.status).toBe("derived");
    const premises = index.data.relations.filter((r) => r.to === n.id && r.type === "reason_for").map((r) => r.from);
    expect(premises).toEqual(expect.arrayContaining(["kn-invisibility-true-sight-only", "kn-ward-item-true-sight-wards-only"]));
  });
  it("真の視界は無条件ではない：ニアサイトを越えず、範囲のアイテムの真の視界はワードと罠だけ、vanish はステルスではない", () => {
    expect(note("kn-true-sight-definition").statement_ja).toContain("ニアサイトは越えられない");
    expect(note("kn-ward-item-true-sight-wards-only").statement_ja).toContain("ワードと罠にだけ");
    expect(note("kn-vanish-not-stealth").statement_ja).toContain("ステルスではない");
  });
  it("情報の段階（存在・おおよその位置・正確な位置・姿・対象指定・非対象指定の命中）を分けて書く", () => {
    const s = note("kn-detection-levels").statement_ja;
    for (const w of ["存在だけ", "おおよその位置", "正確な位置", "姿が見える", "対象指定できる", "見えていなくても当たる"]) expect(s).toContain(w);
  });
});

describe("シャコとツイステッド・フェイト：旧仕様・パッチ・未確認の区別", () => {
  it("シャコ Q の霧越しの煙は、11.15〜11.16 の旧仕様（superseded）と、11.16 以降の仕様を分ける", () => {
    const old = note("kn-hist-shaco-q-smoke-1115");
    expect(old.historical).toMatchObject({ valid_from: "11.15", valid_until: "11.16", current_applicability: "superseded" });
    const cur = note("kn-shaco-q-smoke-fog-1116");
    expect(cur.historical?.valid_from).toBe("11.16");
    expect(cur.notes_ja).toContain("視界の中で使ったときのエフェクトの見え方は、今回の原典では確認していない");
    expect(evidenceOf(cur.id).map((e) => e.resource_id)).toContain("res-riot-patch-11-16-en");
    // 戦術的な推論は旧仕様を察知手段にしない
    expect(note("kn-tactic-shaco-q-no-fog-smoke").status).toBe("tactical_inference");
  });
  it("シャコの本体（インビジブル）と W の箱（ステルス状態の罠）を別に扱う", () => {
    expect(note("kn-shaco-q-invisibility").statement_ja).toContain("インビジブル");
    expect(note("kn-shaco-w-box-reveal").statement_ja).toContain("看破されると、見えている間は対象にでき");
    expect(note("kn-hist-shaco-box-triggered-by-reveal").historical?.current_applicability).toBe("superseded");
  });
  it("TF R：26.21 の変更（対象指定不可も可視化）、パラノイアとの優先、スペルシールドは分類だけで詳細は未確認", () => {
    expect(evidenceOf("kn-tf-r-untargetable-2621").map((e) => e.resource_id)).toEqual(expect.arrayContaining(["res-riot-patch-26-21-en", "res-wiki-twisted-fate"]));
    expect(note("kn-tf-r-untargetable-2621").notes_ja).toContain("記述が食い違う");
    expect(note("kn-tf-r-paranoia").statement_ja).toContain("どちらを先に使っても");
    const ss = note("kn-tf-r-spell-shield");
    expect(ss.statement_ja).toContain("書かれていない");
    expect(ss.statement_ja).not.toMatch(/防げる。|消費される。/);
  });
});

describe("戦術的な推論は仕様と分け、条件と例外を持つ", () => {
  it("コントロールワードでカモフラージュの接近を見つける推論は、条件・例外（インビジブル・定期確認）と前提の仕様のノートを持つ", () => {
    const n = note("kn-tactic-control-ward-camouflage-path");
    expect(n.status).toBe("tactical_inference");
    expect(n.conditions_ja?.length).toBeGreaterThan(1);
    expect(n.exceptions_ja?.join(" ")).toContain("インビジブル");
    const from = index.data.relations.filter((r) => r.to === n.id).map((r) => r.from);
    expect(from).toEqual(expect.arrayContaining(["kn-camouflage-reveal-conditions", "kn-control-ward-reveals", "kn-control-ward-not-invisible"]));
  });
  it("新しいノートはすべて公開され、根拠の資料に到達できる（ゲーム内での検証は主張しない）", () => {
    const ids = index.data.knowledge_notes.filter((n) => n.topic_ids.includes("stealth")).map((n) => n.id);
    expect(ids.length).toBeGreaterThanOrEqual(45);
    const pub = new Set(publicNotes.map((n) => n.id));
    for (const id of ids) {
      expect(pub.has(id), id).toBe(true);
      expect(evidenceOf(id).length, id).toBeGreaterThan(0);
      for (const e of evidenceOf(id)) expect(index.resourceById.get(e.resource_id), e.id).toBeTruthy();
      expect(note(id).last_checked_patch).toBeNull();
    }
  });
});

describe("検索での到達", () => {
  it("「ピンクワードでステルスは見える？」で、コントロールワードの資料とノートに届く", () => {
    expect(search("ピンクワードでステルスは見える？").hits[0].resource.id).toBe("res-wiki-control-ward");
    const notes = noteMatchesForQuery("ピンクワードでステルスは見える？").matches.map((m) => m.note.id);
    expect(notes).toEqual(expect.arrayContaining(["kn-control-ward-reveals", "kn-control-ward-not-invisible"]));
  });
  it("「シャコ Q 煙」で、11.15・11.16 のパッチノートとシャコの資料に届く", () => {
    expect(search("シャコ Q 煙").hits.map((h) => h.resource.id)).toEqual(expect.arrayContaining(["res-riot-patch-11-15-en", "res-riot-patch-11-16-en", "res-wiki-shaco"]));
  });
  it("「TF R スペルシールド」で、未確認を明記したノートに届く", () => {
    expect(noteMatchesForQuery("TF R スペルシールド").matches.filter((m) => m.tier === "full").map((m) => m.note.id)).toContain("kn-tf-r-spell-shield");
  });
});
