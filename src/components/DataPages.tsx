// ゲームデータの閲覧（アイテム・ルーン・サモナースペル・モンスターとオブジェクト・ゲームシステムの記事）。
// 日本語は公式の Data Dragon（ja_JP）の名前と説明を使い、英語 Wiki の値・効果の文（CC BY-SA 3.0）は出典つきで別に示す。
// 開いたページのファイルだけを読む（public/gamedata）。取得したデータの表示で、ゲーム内では検証していない。
import { useEffect, useMemo, useState } from "react";
import { showValues, wikiPlain, type ParsedValue } from "../gamedata/wikiAbility";
import { effectKind, groupStats, limitGroupJa, priceRows, splitPlaceholderZeros, uniqueInfo, type DdGold, type NamedEffect, type PriceRow, type UniqueInfo, type UniqueStatus } from "../gamedata/itemRules";

const BASE = `${import.meta.env.BASE_URL}gamedata/`;
const get = async <T,>(p: string): Promise<T> => {
  const r = await fetch(BASE + p);
  if (!r.ok) throw new Error(`${p}：HTTP ${r.status}`);
  return r.json() as Promise<T>;
};
type Lang = { en: string | null; ja: string | null };
interface Manifest { current: { ddragon: string; wiki_snapshot?: string } }
interface Source { title: string; url: string; status: number; last_modified: string | null }
interface HistoryEntry { name: string; source: Source; latest?: string; versions?: { version: string; subjects: string[]; lines: number }[] }

const LICENSE = (
  <a href="https://creativecommons.org/licenses/by-sa/3.0/">CC BY-SA 3.0</a>
);

export const SECTIONS: { id: string; label: string; note: string }[] = [
  { id: "items", label: "アイテム", note: "ステータス・効果・値段・変更履歴" },
  { id: "runes", label: "ルーン", note: "パス・スロット・効果・変更履歴" },
  { id: "summoners", label: "サモナースペル", note: "サモナーズリフト用とモード専用を分けて表示" },
  { id: "units", label: "モンスター・オブジェクト・建物", note: "体力・ゴールド・経験値など（Wiki の Infobox）" },
  { id: "terms", label: "ゲームシステムの用語", note: "行動妨害・ステルス・視界・ダメージの種類などの定義（中断・効果時間の短縮・無効・解除）" },
  { id: "articles", label: "ゲームシステムの記事", note: "通常攻撃・CC・視界・ダメージなどの英語 Wiki の記事への案内" },
];

function useLoad<T>(loader: () => Promise<T>, deps: unknown[]) {
  const [s, setS] = useState<{ status: "loading" } | { status: "error"; message: string } | { status: "ok"; data: T }>({ status: "loading" });
  useEffect(() => {
    let alive = true;
    setS({ status: "loading" });
    loader()
      .then((data) => alive && setS({ status: "ok", data }))
      .catch((e: Error) => alive && setS({ status: "error", message: e.message }));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return s;
}

export function DataPage({ section }: { section: string }) {
  const s = SECTIONS.find((x) => x.id === section);
  return (
    <div className="detail">
      <p className="back">{section ? <a href="#/data">← ゲームデータ</a> : <a href="#/">← 検索</a>}</p>
      <h1>{s ? s.label : "ゲームデータ"}</h1>
      <p className="muted">
        公式の Data Dragon（日本語の名前・説明）と、英語の League of Legends Wiki（値・効果の文、寄稿者による {LICENSE}）から取り込んだデータです。
        取得した時点のデータの表示で、ゲーム内では検証していません。サモナーズリフト用とモード専用、現行と過去の変更を分けて示します。
      </p>
      {!s && (
        <ul className="data-list">
          {SECTIONS.map((x) => (
            <li key={x.id}>
              <a href={`#/data/${x.id}`}>{x.label}</a> <span className="muted">{x.note}</span>
            </li>
          ))}
        </ul>
      )}
      {section === "items" && <Items />}
      {section === "runes" && <Runes />}
      {section === "summoners" && <Summoners />}
      {section === "units" && <Units />}
      {section === "terms" && <Terms />}
      {section === "articles" && <Articles />}
    </div>
  );
}

function Filter({ q, setQ, scope, setScope, scopes }: { q: string; setQ: (v: string) => void; scope: string; setScope: (v: string) => void; scopes: [string, string][] }) {
  return (
    <div className="data-filter">
      <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="名前で絞り込む（日本語・英語）" aria-label="名前で絞り込む" />
      {scopes.map(([id, label]) => (
        <label key={id}>
          <input type="radio" name="scope" checked={scope === id} onChange={() => setScope(id)} /> {label}
        </label>
      ))}
    </div>
  );
}

const matchName = (q: string, ...names: (string | null | undefined)[]) => !q || names.some((n) => (n ?? "").toLowerCase().includes(q.toLowerCase()));

export function HistoryLine({ h }: { h: HistoryEntry | undefined }) {
  if (!h || !h.versions) return <p className="muted">変更履歴：未取得</p>;
  if (!h.versions.length) return <p className="muted">変更履歴：ページに変更履歴の節がない（<a href={h.source.url}>原典</a>）</p>;
  // 同じパッチの別履歴も、内容まで同じ履歴も残す。無関係な行の挿入ではキーを変えない。
  const occurrences = new Map<string, number>();
  return (
    <details>
      <summary className="muted">
        変更履歴 {h.versions.length}版（最新 {h.latest}）
      </summary>
      <ul>
        {h.versions.slice(0, 12).map((v) => {
          const identity = JSON.stringify(v);
          const occurrence = occurrences.get(identity) ?? 0;
          occurrences.set(identity, occurrence + 1);
          return (
            <li key={`${identity}:${occurrence}`}>
              {v.version}
              {v.subjects.length > 0 && `：${v.subjects.slice(0, 4).join("、")}`}
              （{v.lines}行）
            </li>
          );
        })}
      </ul>
      <p className="muted">
        版と変更の行数だけを示します（変更の文は保存していません）。変更の内容は <a href={h.source.url}>原典</a>（英語 Wiki、{LICENSE}）を参照してください。
      </p>
    </details>
  );
}

// Wiki の説明の文（英語の原文・記法を簡略化）。source_sha1・plain_sha1 は訳の有効の判定に使う
interface WikiText { plain: string; residual: boolean; source_sha1?: string; plain_sha1?: string; level_notes?: LevelNote[] }
/** チャンピオンのレベルに応じた値が、レベル18を超える部分（取り込み時に記録。tools/gamedata/pp.js の levelNote） */
interface LevelNote { kind: "shown_beyond_18" | "hidden_beyond_18"; first: string; at_level_18: string; max_level: number; at_max_level: string; shown_last_level: number }

/**
 * レベル18を超える値の注記。サモナーズリフトの通常の最大レベルは18で、トップレーンのロールクエストを達成すると20（Experience (champion) の記事）。
 * Wiki の表示の範囲がレベル20の値で終わるとき、レベル18の値を別に示す（原典の値は削らない）
 */
function LevelNoteLine({ n }: { n: LevelNote }) {
  return (
    <p className="muted">
      {n.kind === "shown_beyond_18"
        ? `レベルに応じた値（${n.first}～）：レベル18では ${n.at_level_18}。表示の範囲の最後（${n.at_max_level}）はレベル${n.max_level}の値（通常の最大レベルは18。トップレーンのロールクエストで20、モードによって異なる）。`
        : `レベルに応じた値：原典の値はレベル${n.max_level}まであり、レベル${n.max_level}では ${n.at_max_level}（表示はレベル18の ${n.at_level_18} まで）。`}
    </p>
  );
}
// 取り込み時に作った日本語訳（translations/ja/items.json・runes.json）。閲覧のたびには訳さない
interface TrEntry { source_sha1: string; plain_sha1: string; ja: string; status: string }
interface TrFile { translator?: string; entries: Record<string, TrEntry> }

/**
 * Wiki の詳しい説明：日本語訳（AI・未レビュー）→ 英語の原文 → 出典・ライセンス の順に分けて示す。
 * 訳は原文と英文の sha1 が両方一致するときだけ表示し、解けない記法が残る段落・古い訳は訳を出さない
 */
function WikiTextBlock({ rows, tr, source, title }: { rows: { id: string; label?: string | null; text: WikiText }[]; tr: TrFile | null; source: Source; title: string }) {
  if (!rows.length) return null;
  const ja = rows.map((r) => {
    const e = tr?.entries[r.id];
    const ok = e && !r.text.residual && e.source_sha1 === r.text.source_sha1 && e.plain_sha1 === r.text.plain_sha1;
    return ok ? e.ja : null;
  });
  const anyJa = ja.some(Boolean);
  return (
    <details>
      <summary className="muted">{title}（{anyJa ? "日本語訳と英語の原文" : "英語の原文"}）</summary>
      {anyJa && (
        <div>
          <div className="muted">日本語訳（{tr?.translator ?? "AI"}・未レビュー。数・用語・否定・記法は機械で検査済み、人による確認はしていない）</div>
          {rows.map((r, i) => (
            <p key={r.id} className={ja[i] ? undefined : "muted"} style={{ whiteSpace: "pre-line" }}>
              {r.label && <strong>{r.label}：</strong>}
              {ja[i] ?? `（${translationNotice(tr, r.id, r.text)}）`}
            </p>
          ))}
        </div>
      )}
      {rows.flatMap((r) => r.text.level_notes ?? []).map((n, i) => <LevelNoteLine key={i} n={n} />)}
      {!anyJa && rows.map((r) => <p key={r.id} className="muted">{r.label && `${r.label}：`}{translationNotice(tr, r.id, r.text)}</p>)}
      <div className="muted">英語の原文（記法を簡略化）</div>
      {rows.map((r) => (
        <p key={r.id} lang="en" style={{ whiteSpace: "pre-line" }}>
          {r.label && <strong>{r.label}：</strong>}
          {r.text.plain.replace(/⟦[^⟧]*⟧/g, "［解析できない記法］")}
        </p>
      ))}
      <p className="muted">
        出典：<a href={source.url}>{source.title}</a>（League of Legends Wiki の寄稿者、{LICENSE}）。改変：記法を簡略化{anyJa ? "し、日本語に翻訳した（AI・未レビュー）" : "（訳はしていない）"}。
      </p>
    </details>
  );
}

interface ItemEffectText extends WikiText {
  name: string | null;
  /** 効果の構造（Module:ItemData の effects の項目を読める文にしたもの） */
  meta?: { unique?: boolean; cd?: string; recharge?: string; charges?: string; range?: string; radius?: string };
  /** 別のアイテムの同じ効果を参照する（"=>アイテム名"） */
  ref?: string;
  /** description2 以降：親の効果のキー */
  part_of?: string;
}
interface WikiItem {
  name: string;
  source: Source;
  data?: { id?: number; tier?: number; type?: string[]; buy?: unknown; sell?: unknown; sellratio?: unknown; modes?: Record<string, boolean>; stats?: Record<string, unknown> };
  effect_text?: Record<string, ItemEffectText>;
  limit_text?: WikiText;
  limit_groups?: { group: string; rule: string }[];
}
interface DdItem { id: number; name: Lang; plaintext: Lang; description: Lang; gold: DdGold; maps: Record<string, boolean>; from?: string[] }
interface ItemRulesFile { sources: Record<string, Source>; named_effects_outdated_if_new_patch: string | null; named_effects: NamedEffect[] }

/** 訳が有効か（原文と英文の sha1 が両方一致し、解けない記法が残っていない）。有効なら訳の文 */
const validJa = (tr: TrFile | null, id: string, t: WikiText) => {
  const e = tr?.entries[id];
  return e && !t.residual && e.source_sha1 === t.source_sha1 && e.plain_sha1 === t.plain_sha1 ? e.ja : null;
};

function translationNotice(tr: TrFile | null, id: string, text: WikiText): string {
  if (text.residual) return "この段落は Wiki の記法に解けない部分があるため翻訳を保留しています。英語の原文と出典を参照してください";
  if (tr?.entries[id]) return "原文または解析後の英文が更新されたため、古い訳は表示しません。英語の原文を参照してください";
  return "この段落の日本語訳はまだありません。英語の原文を参照してください";
}

/** 公式の説明（Data Dragon）。値の欠けの可能性がある「0」に印を付ける（文は変えない） */
function OfficialText({ text, version }: { text: string; version: string }) {
  const parts = splitPlaceholderZeros(text);
  const any = parts.some((p) => p.zero);
  return (
    <div>
      <div className="muted">公式の説明（Data Dragon {version}・日本語）</div>
      <p style={{ whiteSpace: "pre-line" }}>
        {parts.map((p, i) => (p.zero ? <mark key={i} title="Data Dragon で値が埋め込まれていない箇所の可能性">0</mark> : <span key={i}>{p.text}</span>))}
      </p>
      {any && <p className="muted">印の「0」は、公式のデータで値が埋め込まれていない箇所の可能性があります（英語の説明では空欄）。実際の値は下の Wiki の効果の文を参照してください。</p>}
    </div>
  );
}

function PriceTable({ rows }: { rows: PriceRow[] }) {
  return (
    <dl className="data-price">
      {rows.map((r) => (
        <div key={r.label}>
          <dt>{r.label}</dt>
          <dd>
            {r.value}
            {r.note && <span className="muted">（{r.note}）</span>}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function StatTable({ stats }: { stats: Record<string, unknown> | undefined }) {
  const groups = groupStats(stats, wikiPlain);
  if (!groups.length) return null;
  const anyZero = groups.some((g) => g.lines.some((l) => l.zero));
  return (
    <div>
      <div className="muted">ステータス（英語 Wiki の Module:ItemData。% は割合、ほかは固定値）</div>
      <dl className="data-stats">
        {groups.map((g) => (
          <div key={g.group}>
            <dt>{g.label}</dt>
            <dd>{g.lines.map((l) => `${l.label} ${l.value}${l.zero ? "（0）" : ""}`).join("・")}</dd>
          </div>
        ))}
      </dl>
      {anyZero && <p className="muted">「（0）」は Wiki のデータの値が0のもの。効果で決まる値や、データで決まっていない値の可能性があり、実際の値は効果の文・公式の説明を参照してください。</p>}
    </div>
  );
}

const UNIQUE_TEXT: Record<UniqueStatus, string> = {
  shared_listed: "Wiki の表では「共有」の固有効果（同じ名前の効果は、持っているアイテム全体で一度だけ得られる、という分類）",
  isolated_listed: "Wiki の表では「単独」の固有効果（同じアイテムを複数持っても一度だけ得られる、という分類）",
  listed_other_items: "未確認：表に同じ名前の効果があるが、このアイテムは表に載っていない",
  unlisted: "未確認：Named item effect の表に名前がない",
};

export function EffectCard({ item, k, e, tr, info, outdated }: { item: string; k: string; e: ItemEffectText & { __parts?: Record<string, ItemEffectText> }; tr: TrFile | null; info: UniqueInfo | null; outdated: string | null }) {
  const parts = Object.entries(e.__parts ?? {});
  const rows: [string, ItemEffectText][] = [[k, e], ...parts];
  const ja = rows.map(([kk, t]) => validJa(tr, `${item}#${kk}`, t));
  const m = e.meta ?? {};
  const facts = [m.cd && `クールダウン ${m.cd}秒`, m.recharge && `再チャージ ${m.recharge}秒`, m.charges && `チャージ ${m.charges}`, m.range && `射程 ${m.range}`, m.radius && `範囲 ${m.radius}`].filter(Boolean);
  return (
    <div className="data-effect">
      <div>
        <strong>{effectKind(k)}</strong>
        {m.unique && <span>・固有（Unique）</span>}
        {e.name && <span>・{e.name}</span>}
      </div>
      {facts.length > 0 && <div className="muted">{facts.join("・")}（Wiki のデータの項目）</div>}
      {rows.map(([kk, text], i) => (
        <p key={kk} style={{ whiteSpace: "pre-line" }} className={ja[i] ? undefined : "muted"}>
          {ja[i] ?? `（${translationNotice(tr, `${item}#${kk}`, text)}）`}
        </p>
      ))}
      {rows.flatMap(([, t]) => t.level_notes ?? []).map((n, i) => <LevelNoteLine key={i} n={n} />)}
      {info && e.name && (
        <div className="muted">
          効果の重複（Rift Compass の整理。同時に持てる数の制限・クールダウンとは別のルール）：{UNIQUE_TEXT[info.status]}
          {info.table?.group && `。互いに関係する効果：${info.table.group}`}
          {info.status === "shared_listed" && info.table && `。表のアイテム：${info.table.items.filter((x) => x !== item).join("、") || "なし"}${info.table.runes ? `（ルーン：${info.table.runes.join("、")}）` : ""}`}
          {info.status !== "shared_listed" && info.status !== "isolated_listed" && info.sameNameItems.length > 0 && `。データ上、同じ名前の効果を持つほかのアイテム：${info.sameNameItems.join("、")}（名前が同じでも重複のルールが同じとは限らない）`}
          {info.cooldownRuleUnconfirmed && "。クールダウンの共有：未確認（Item の記事の一般則は、同じ名前の効果を持つアイテムを同時に複数持てる場合のもの。同時に持てる数の制限があれば当てはまらない）"}
          。出典：Named item effect の表{outdated ? `。この表には Wiki で「パッチ ${outdated} 以降は古い可能性」の印があり、現在のパッチでも同じかは未確認` : ""}
        </div>
      )}
      <details>
        <summary className="muted">英語の原文</summary>
        {rows.map(([kk, t]) => (
          <p key={kk} lang="en" style={{ whiteSpace: "pre-line" }}>
            {t.plain.replace(/⟦[^⟧]*⟧/g, "［解析できない記法］")}
          </p>
        ))}
      </details>
    </div>
  );
}

function Items() {
  const s = useLoad(async () => {
    const m = await get<Manifest>("manifest.json");
    const snap = m.current.wiki_snapshot;
    const [wiki, dd, hist, tr, rules] = await Promise.all([
      snap ? get<{ items: WikiItem[] }>(`wiki/${snap}/items.json`) : Promise.resolve({ items: [] as WikiItem[] }),
      get<{ items: DdItem[]; source: { version: string } }>(`ddragon/${m.current.ddragon}/items.json`),
      snap ? get<{ entries: Record<string, HistoryEntry> }>(`wiki/${snap}/history/items.json`).catch(() => null) : Promise.resolve(null),
      snap ? get<TrFile>(`wiki/${snap}/translations/ja/items.json`).catch(() => null) : Promise.resolve(null),
      snap ? get<ItemRulesFile>(`wiki/${snap}/item_rules.json`).catch(() => null) : Promise.resolve(null),
    ]);
    const byName = new Map(wiki.items.map((x) => [x.name, x]));
    const effectNames = new Map(wiki.items.map((x) => [x.name, Object.values(x.effect_text ?? {}).map((e) => e.name).filter((n): n is string => !!n)]));
    return { wiki: wiki.items, byName, effectNames, dd: new Map(dd.items.map((x) => [x.id, x])), ddVersion: dd.source.version, hist: hist?.entries ?? {}, tr, rules };
  }, []);
  const [q, setQ] = useState("");
  const [scope, setScope] = useState("sr");
  const list = useMemo(() => {
    if (s.status !== "ok") return [];
    return s.data.wiki
      .filter((w) => w.data)
      .filter((w) => (scope === "all" ? true : scope === "sr" ? !!w.data?.modes?.["classic sr 5v5"] : !w.data?.modes?.["classic sr 5v5"]))
      .filter((w) => matchName(q, w.name, s.data.dd.get(w.data?.id ?? -1)?.name.ja));
  }, [s, q, scope]);
  if (s.status !== "ok") return <p className="muted">{s.status === "loading" ? "読み込んでいます…" : `読み込めませんでした（${s.message}）`}</p>;
  const { rules, tr, byName, effectNames, ddVersion } = s.data;
  /** 効果の文：参照（=>）を解き、description2 以降を親の効果にまとめる */
  const effectsOf = (w: WikiItem) => {
    const out: { item: string; k: string; e: ItemEffectText & { __parts?: Record<string, ItemEffectText> }; refFrom?: string }[] = [];
    for (const [k, e] of Object.entries(w.effect_text ?? {})) {
      if (e.part_of) continue;
      let owner = w, eff = e;
      if (e.ref) {
        const r = byName.get(e.ref);
        if (r?.effect_text?.[k]) { owner = r; eff = r.effect_text[k]; }
      }
      const parts = Object.fromEntries(Object.entries(owner.effect_text ?? {}).filter(([, p]) => p.part_of === k));
      if (!eff.plain && !Object.keys(parts).length) continue;
      out.push({ item: owner.name, k, e: { ...eff, __parts: parts }, refFrom: e.ref && owner !== w ? owner.name : undefined });
    }
    return out;
  };
  return (
    <>
      <Filter q={q} setQ={setQ} scope={scope} setScope={setScope} scopes={[["sr", "サモナーズリフト"], ["mode", "モード専用"], ["all", "すべて"]]} />
      <p className="muted">{list.length}件。日本語の名前・説明・値段は Data Dragon {ddVersion}（公式）、ステータス・効果の構造と文は英語 Wiki の Module:ItemData。</p>
      <ul className="data-list">
        {list.map((w) => {
          const dd = s.data.dd.get(w.data?.id ?? -1);
          const effects = effectsOf(w);
          const limitJa = w.limit_text ? validJa(tr, `${w.name}#limit`, w.limit_text) : null;
          return (
            <li key={w.name}>
              <details>
                <summary>
                  <strong>{dd?.name.ja ?? w.name}</strong>{" "}
                  <span className="muted">
                    {w.name}
                    {dd ? (!dd.gold.purchasable ? "・購入できない" : dd.gold.total === 0 ? "・無料" : `・${dd.gold.total}ゴールド`) : ""}
                  </span>
                </summary>
                <PriceTable rows={priceRows(dd, w.data, ddVersion, w.limit_text?.plain)} />
                <StatTable stats={w.data?.stats} />
                {dd?.description.ja && <OfficialText text={dd.description.ja} version={ddVersion} />}
                {effects.length > 0 && (
                  <div>
                    <div className="muted">効果（英語 Wiki の文の日本語訳：AI・未レビュー。種類・固有・CD などの項目は Wiki のデータ、重複のルールは Rift Compass の整理）</div>
                    {effects.map((x) => (
                      <div key={x.k}>
                        {x.refFrom && <div className="muted">Wiki のデータでは {x.refFrom} の同じ効果を参照</div>}
                        <EffectCard
                          item={x.item}
                          k={x.k}
                          e={x.e}
                          tr={tr}
                          outdated={rules?.named_effects_outdated_if_new_patch ?? null}
                          info={x.e.name && rules ? uniqueInfo(x.item, x.e.name, !!x.e.meta?.cd, rules.named_effects, effectNames) : null}
                        />
                      </div>
                    ))}
                  </div>
                )}
                {((w.limit_groups ?? []).length > 0 || w.limit_text) && (
                  <div>
                    <div className="muted">制限（同時に持てる数・入手の条件）</div>
                    <ul>
                      {(w.limit_groups ?? []).map((g) => {
                        const others = g.group === "legendary" ? [] : s.data.wiki.filter((x) => x.name !== w.name && x.limit_groups?.some((y) => y.group === g.group)).map((x) => x.name);
                        return (
                          <li key={g.group}>
                            {limitGroupJa(g.group)}
                            {others.length > 0 && <span className="muted">（同じグループ：{others.join("、")}）</span>} <span className="muted" lang="en">{g.rule}</span>
                          </li>
                        );
                      })}
                      {w.limit_text && (
                        <li>
                          {limitJa ?? <span className="muted">（訳はありません）</span>} <span className="muted" lang="en">{w.limit_text.plain}</span>
                        </li>
                      )}
                    </ul>
                    {(w.limit_groups ?? []).length > 0 && (
                      <p className="muted">グループの制限は Module:ItemData/getter と Template:Item limit による。素材からの合成や変化で手に入る場合は制限を受けない（Item の記事）。</p>
                    )}
                  </div>
                )}
                <p className="muted">
                  出典：<a href={w.source.url}>{w.source.title}</a>
                  {rules && (
                    <>
                      、<a href={rules.sources["Named item effect"]?.url}>Named item effect</a>、<a href={rules.sources["Item"]?.url}>Item</a>、<a href={rules.sources["Template:Item limit"]?.url}>Template:Item limit</a>
                    </>
                  )}
                  （League of Legends Wiki の寄稿者、{LICENSE}）。改変：記法を簡略化し、日本語に翻訳した（AI・未レビュー）。
                </p>
                <p className="muted">使えるモード（Wiki）：{Object.entries(w.data?.modes ?? {}).filter(([, v]) => v).map(([k]) => k).join("・") || "記載なし"}</p>
                <HistoryLine h={s.data.hist[w.name]} />
              </details>
            </li>
          );
        })}
      </ul>
    </>
  );
}

/** Template:Rune data の値の項目名 */
const RUNE_FIELD_JA: Record<string, string> = { cooldown: "クールダウン", range: "射程" };
interface WikiRune { name: string; path: string; ddragon_id: number; source: Source; parsed?: Record<string, ParsedValue>; text?: Record<string, WikiText> }
interface DdRune { id: number; path: Lang; slot: number; name: Lang; long: Lang }

function Runes() {
  const s = useLoad(async () => {
    const m = await get<Manifest>("manifest.json");
    const snap = m.current.wiki_snapshot;
    const [wiki, dd, hist, tr] = await Promise.all([
      snap ? get<{ runes: WikiRune[] }>(`wiki/${snap}/runes.json`) : Promise.resolve({ runes: [] as WikiRune[] }),
      get<{ runes: DdRune[]; source: { version: string } }>(`ddragon/${m.current.ddragon}/runes.json`),
      snap ? get<{ entries: Record<string, HistoryEntry> }>(`wiki/${snap}/history/runes.json`).catch(() => null) : Promise.resolve(null),
      snap ? get<TrFile>(`wiki/${snap}/translations/ja/runes.json`).catch(() => null) : Promise.resolve(null),
    ]);
    return { wiki: new Map(wiki.runes.map((x) => [x.ddragon_id, x])), dd: dd.runes, ddVersion: dd.source.version, hist: hist?.entries ?? {}, tr };
  }, []);
  const [q, setQ] = useState("");
  if (s.status !== "ok") return <p className="muted">{s.status === "loading" ? "読み込んでいます…" : `読み込めませんでした（${s.message}）`}</p>;
  const list = s.data.dd.filter((r) => matchName(q, r.name.en, r.name.ja));
  const paths = [...new Set(list.map((r) => r.path.ja ?? r.path.en ?? ""))];
  return (
    <>
      <Filter q={q} setQ={setQ} scope="" setScope={() => {}} scopes={[]} />
      <p className="muted">{list.length}件。日本語の名前・説明は Data Dragon {s.data.ddVersion}（公式）、値は英語 Wiki の Template:Rune data。</p>
      {paths.map((p) => (
        <section key={p}>
          <h2>{p}</h2>
          <ul className="data-list">
            {list
              .filter((r) => (r.path.ja ?? r.path.en) === p)
              .map((r) => {
                const w = s.data.wiki.get(r.id);
                const parsed = Object.entries(w?.parsed ?? {});
                return (
                  <li key={r.id}>
                    <details>
                      <summary>
                        <strong>{r.name.ja ?? r.name.en}</strong> <span className="muted">{r.name.en}・{r.slot === 0 ? "キーストーン" : `スロット${r.slot}`}</span>
                      </summary>
                      {r.long.ja && <OfficialText text={r.long.ja} version={s.data.ddVersion} />}
                      {parsed.length > 0 && <p>Wiki のデータの値：{parsed.map(([k, v]) => `${RUNE_FIELD_JA[k] ?? k} ${showValues(v)}${k === "cooldown" ? "秒" : ""}`).join("・")}</p>}
                      {w?.text && (
                        <WikiTextBlock
                          title="Wiki の詳しい説明（発動条件・効果・スタック・クールダウン・レベルに応じた値・例外）"
                          rows={Object.entries(w.text)
                            .filter(([k, t]) => /^description\d*$/.test(k) && t.plain)
                            .sort(([a], [b]) => a.localeCompare(b, "en", { numeric: true }))
                            .map(([k, t]) => ({ id: `${w.name}#${k}`, text: t }))}
                          tr={s.data.tr}
                          source={w.source}
                        />
                      )}
                      <HistoryLine h={s.data.hist[r.name.en ?? ""]} />
                    </details>
                  </li>
                );
              })}
          </ul>
        </section>
      ))}
    </>
  );
}

interface WikiSpell { link?: string; cooldown?: string; range?: string; effect?: string; maps?: Record<string, boolean>; notes?: string }
interface DdSpell { id: string; name: Lang; description: Lang; cooldown: number[]; modes: string[] }

/** SpellData の CD・射程：記法を簡略化。ほかのデータ（Rune data など）を参照する値は値を推測せず、参照であることを示す */
const spellValue = (raw: string | undefined) => (!raw ? "記載なし" : /\{\{\s*(Rune data|Data )/i.test(raw) ? "（別のデータを参照・原典を参照）" : wikiPlain(raw));

function Summoners() {
  const s = useLoad(async () => {
    const m = await get<Manifest>("manifest.json");
    const snap = m.current.wiki_snapshot;
    const [wiki, dd, hist] = await Promise.all([
      snap ? get<{ data: Record<string, WikiSpell>; source: Source }>(`wiki/${snap}/modules/summoner_spells.json`) : Promise.resolve({ data: {} as Record<string, WikiSpell>, source: null as unknown as Source }),
      get<{ spells: DdSpell[]; source: { version: string } }>(`ddragon/${m.current.ddragon}/summoners.json`),
      snap ? get<{ entries: Record<string, HistoryEntry> }>(`wiki/${snap}/history/summoners.json`).catch(() => null) : Promise.resolve(null),
    ]);
    return { wiki: wiki.data, wikiSource: wiki.source, dd: new Map(dd.spells.map((x) => [x.name.en ?? "", x])), ddVersion: dd.source.version, hist: hist?.entries ?? {} };
  }, []);
  const [q, setQ] = useState("");
  const [scope, setScope] = useState("sr");
  if (s.status !== "ok") return <p className="muted">{s.status === "loading" ? "読み込んでいます…" : `読み込めませんでした（${s.message}）`}</p>;
  const entries = Object.entries(s.data.wiki)
    .filter(([, w]) => (scope === "sr" ? w.maps?.sr : scope === "mode" ? !w.maps?.sr : true))
    .filter(([name]) => matchName(q, name, s.data.dd.get(name)?.name.ja));
  return (
    <>
      <Filter q={q} setQ={setQ} scope={scope} setScope={setScope} scopes={[["sr", "サモナーズリフト"], ["mode", "モード専用"], ["all", "すべて"]]} />
      <p className="muted">
        {entries.length}件。英語 Wiki の Module:SpellData（maps.sr でサモナーズリフトを区別）と、Data Dragon {s.data.ddVersion} の公式の日本語。モード専用のスペルの値は、サモナーズリフトの値と混同しないでください。
      </p>
      <ul className="data-list">
        {entries.map(([name, w]) => {
          const dd = s.data.dd.get(name);
          return (
            <li key={name}>
              <details>
                <summary>
                  <strong>{dd?.name.ja ?? name}</strong> <span className="muted">{name}{w.maps?.sr ? "" : "・モード専用"}</span>
                </summary>
                <p>
                  CD {spellValue(w.cooldown)}・射程 {spellValue(w.range)}
                  {w.maps && <span className="muted">（マップ：{Object.entries(w.maps).filter(([, v]) => v).map(([k]) => k).join("・")}）</span>}
                </p>
                {dd?.description.ja && (
                  <div>
                    <div className="muted">公式の説明（Data Dragon {s.data.ddVersion}・日本語）</div>
                    <p>{dd.description.ja}</p>
                  </div>
                )}
                {w.effect && (
                  <details>
                    <summary className="muted">Wiki の効果の文（英語の原文・記法を簡略化）</summary>
                    <p>{wikiPlain(w.effect)}</p>
                    <p className="muted">
                      出典：<a href={s.data.wikiSource?.url}>Module:SpellData/data</a>（League of Legends Wiki の寄稿者、{LICENSE}）。改変：記法を簡略化（訳はしていない）。
                    </p>
                  </details>
                )}
                <HistoryLine h={s.data.hist[name]} />
              </details>
            </li>
          );
        })}
      </ul>
    </>
  );
}

interface WikiUnit { name: string; source: Source; parsed?: Record<string, ParsedValue>; unparsed?: { field: string; reason: string }[]; infobox?: Record<string, string>; headings?: { title: string }[] }

function Units() {
  const s = useLoad(async () => {
    const m = await get<Manifest>("manifest.json");
    return get<{ units: WikiUnit[] }>(`wiki/${m.current.wiki_snapshot}/units.json`);
  }, []);
  if (s.status !== "ok") return <p className="muted">{s.status === "loading" ? "読み込んでいます…" : `読み込めませんでした（${s.message}）`}</p>;
  return (
    <>
      <p className="muted">英語 Wiki の記事の Infobox（{LICENSE}）。Infobox のない記事（一覧・まとめのページ）は見出しだけを示します。値は記事の版の時点のものです。</p>
      <ul className="data-list">
        {s.data.units.map((u) => (
          <li key={u.name}>
            <details>
              <summary>
                <strong>{u.name}</strong> {u.source.status !== 200 && <span className="muted">（取得できず）</span>}
              </summary>
              {Object.entries(u.parsed ?? {}).length > 0 && <p>{Object.entries(u.parsed ?? {}).map(([k, v]) => `${k} ${showValues(v)}`).join("・")}</p>}
              {(u.unparsed ?? []).length > 0 && (
                <p className="muted">
                  未解析：{(u.unparsed ?? []).map((x) => `${x.field}（${wikiPlain(u.infobox?.[x.field] ?? "").slice(0, 60)}）`).join("・")}
                </p>
              )}
              {u.headings && <p className="muted">見出し：{u.headings.slice(0, 10).map((h) => h.title).join("・")}</p>}
              <p className="muted">
                出典：<a href={u.source.url}>{u.source.title}</a>（League of Legends Wiki の寄稿者、{LICENSE}）
              </p>
            </details>
          </li>
        ))}
      </ul>
    </>
  );
}

interface Article { name: string; source: Source; redirect_to?: string; headings?: { level: number; title: string }[] }

// ゲームシステムの用語（Template:Tip data/<用語>）。日本語の呼び名は用語集（src/gamedata/glossary.json）と同じもの
interface WikiTip { name: string; type: string | null; source: Source; text: Record<string, WikiText> }
const TERM_JA: Record<string, string> = {
  Airborne: "ノックアップ", Blind: "ブラインド", Charm: "チャーム", Cripple: "攻撃速度低下", Disarm: "通常攻撃の封印", Flee: "フィアー", Ground: "グラウンド",
  Nearsight: "ニアサイト", Polymorph: "ポリモーフ", Root: "スネア", Silence: "サイレンス", Sleep: "スリープ", Slow: "スロウ", Stasis: "固有時停止", Stun: "スタン",
  Suppression: "サプレッション", Suspension: "サスペンション", Taunt: "タウント", Knockdown: "ノックダウン", Drowsy: "眠気", "Forced action": "強制行動",
  Immobilize: "移動不能", Untargetable: "対象指定不可", Invulnerability: "無敵", "Spell shield": "スペルシールド", Cleanse: "浄化", Tenacity: "行動妨害耐性",
  Camouflage: "カモフラージュ", Invisibility: "インビジブル", Stealth: "ステルス", "True sight": "真の視界", Sight: "視界", Ghosted: "ゴースト状態",
  "Grievous wounds": "重傷", Dash: "ダッシュ", Blink: "ブリンク", "Critical strike": "クリティカル", "True damage": "確定ダメージ", "Magic damage": "魔法ダメージ",
  "Physical damage": "物理ダメージ", "On-hit": "攻撃時効果", Heal: "回復", Shield: "シールド", Channel: "詠唱", Execute: "処刑", Omnivamp: "オムニヴァンプ",
  "Cc-immune": "行動妨害の無効", "Slow resist": "スロウ耐性", "Basic attack": "通常攻撃", Lockout: "行動不能", "Cast-inhibiting crowd control": "スキルの使用を妨げる行動妨害",
  Projectile: "飛翔物", "Unit-targeted": "対象指定", Vanish: "消失", Interrupt: "中断", Resurrection: "蘇生", "Control ward": "コントロール ワード", "Stealth ward": "ステルス ワード",
};
// Wiki の分類の表記ゆれ（大文字・単複）をまとめる
const tipGroup = (t: { type: string | null }) => { const x = (t.type ?? "その他").trim(); return /^crowd control$/i.test(x) ? "Crowd control" : /^champion attributes?$/i.test(x) ? "Champion attributes" : x; };
/** 用語の定義と、ほかの Wiki の記事で値が一致しないもの。どちらが現行か確かめられるまで両方を示す */
const TERM_CONFLICTS: Record<string, string> = {
  Tenacity: "行動妨害耐性で短くなった効果時間の下限は、この定義（2026-09-10 版）では0.5秒、Tenacity の記事（2026-05-22 版）と Champion statistic の記事（2026-09-29 版）では0.3秒。同じ下限についての記述で、パッチによる変更の記録は見つからず、どちらが現行かは未確認（記事の0.3秒には、tick の処理で実際の効果時間はやや長くなるという注がある）。",
};
const TIP_FIELD_LABELS: Record<string, string> = { description: "説明", description2: "補足", description3: "補足", description4: "補足", interrupts: "中断するもの", reduction: "効果時間の短縮（行動妨害耐性）", resist: "無効にするもの", removal: "解除" };

function Terms() {
  const s = useLoad(async () => {
    const m = await get<Manifest>("manifest.json");
    const snap = m.current.wiki_snapshot;
    const [tips, tr] = await Promise.all([
      snap ? get<{ tips: WikiTip[] }>(`wiki/${snap}/tips.json`) : Promise.resolve({ tips: [] as WikiTip[] }),
      snap ? get<TrFile>(`wiki/${snap}/translations/ja/tips.json`).catch(() => null) : Promise.resolve(null),
    ]);
    return { tips: tips.tips, tr };
  }, []);
  const [q, setQ] = useState("");
  const [inText, setInText] = useState(false);
  if (s.status !== "ok") return <p className="muted">{s.status === "loading" ? "読み込んでいます…" : `読み込めませんでした（${s.message}）`}</p>;
  const textOf = (t: WikiTip) => Object.entries(t.text).map(([k, v]) => `${s.data.tr?.entries[`${t.name}#${k}`]?.ja ?? ""} ${v.plain}`).join(" ");
  const list = s.data.tips.filter((t) => matchName(q, t.name, TERM_JA[t.name], inText ? textOf(t) : null));
  // 行動妨害を先に、それ以外は Wiki の分類ごと
  const groups = [...new Set(list.map(tipGroup))].sort((a, b) => (a === "Crowd control" ? -1 : b === "Crowd control" ? 1 : a.localeCompare(b)));
  return (
    <>
      <Filter q={q} setQ={setQ} scope="" setScope={() => {}} scopes={[]} />
      <label className="muted">
        <input type="checkbox" checked={inText} onChange={(e) => setInText(e.target.checked)} /> 定義の文（日本語訳・英語）も検索する（例：「スロウ」「cleanse」）
      </label>
      <p className="muted">
        {list.length}件。英語 Wiki の用語の定義（Template:Tip data）。行動妨害は「中断するもの・効果時間の短縮・無効にするもの・解除」に分かれています。
        記事の本文は取り込まず、定義の文だけを日本語訳（AI・未レビュー）と英語の原文で示します。定義は Wiki の記述の時点のもので、ゲーム内では検証していません。
      </p>
      {groups.map((g) => (
        <section key={g}>
          <h2>{g === "Crowd control" ? "行動妨害（Crowd control）" : g}</h2>
          <ul className="data-list">
            {list
              .filter((t) => tipGroup(t) === g)
              .map((t) => (
                <li key={t.name}>
                  <strong>{TERM_JA[t.name] ?? t.name}</strong> <span className="muted">{t.name}</span>
                  {TERM_CONFLICTS[t.name] && <p className="muted">原典の間の不一致（Rift Compass の注記）：{TERM_CONFLICTS[t.name]}</p>}
                  <WikiTextBlock
                    title="定義"
                    rows={Object.keys(TIP_FIELD_LABELS)
                      .filter((k) => t.text[k])
                      .map((k) => ({ id: `${t.name}#${k}`, label: TIP_FIELD_LABELS[k], text: t.text[k] }))}
                    tr={s.data.tr}
                    source={t.source}
                  />
                </li>
              ))}
          </ul>
        </section>
      ))}
    </>
  );
}

function Articles() {
  const s = useLoad(async () => {
    const m = await get<Manifest>("manifest.json");
    return get<{ articles: Article[] }>(`wiki/${m.current.wiki_snapshot}/articles.json`);
  }, []);
  if (s.status !== "ok") return <p className="muted">{s.status === "loading" ? "読み込んでいます…" : `読み込めませんでした（${s.message}）`}</p>;
  const ok = s.data.articles.filter((a) => a.source.status === 200);
  return (
    <>
      <p className="muted">
        英語 Wiki のゲームシステムの記事（{ok.length}件）。本文は取り込まず、見出しと原典へのリンクだけを示します（{LICENSE}）。
      </p>
      <ul className="data-list">
        {ok.map((a) => (
          <li key={a.name}>
            <a href={a.source.url}>{a.name}</a>
            {a.redirect_to && <span className="muted">（→ {a.redirect_to}）</span>}
            {a.headings && a.headings.length > 0 && <div className="muted">{a.headings.filter((h) => h.level === 2).map((h) => h.title).join("・")}</div>}
          </li>
        ))}
      </ul>
    </>
  );
}
