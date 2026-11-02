// ゲームデータの閲覧（アイテム・ルーン・サモナースペル・モンスターとオブジェクト・ゲームシステムの記事）。
// 日本語は公式の Data Dragon（ja_JP）の名前と説明を使い、英語 Wiki の値・効果の文（CC BY-SA 3.0）は出典つきで別に示す。
// 開いたページのファイルだけを読む（public/gamedata）。取得したデータの表示で、ゲーム内では検証していない。
import { useEffect, useMemo, useState } from "react";
import { showValues, wikiPlain, type ParsedValue } from "../gamedata/wikiAbility";

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
      {section === "articles" && <Articles />}
    </div>
  );
}

const STAT_LABELS: Record<string, string> = {
  ad: "攻撃力", ap: "魔力", armor: "物理防御", mr: "魔法防御", hp: "体力", mana: "マナ", as: "攻撃速度（%）", crit: "クリティカル率（%）", ms: "移動速度（%）", msflat: "移動速度",
  ah: "スキルヘイスト", lethality: "物理防御貫通（固定）", armpen: "物理防御貫通（%）", mpen: "魔法防御貫通（%）", mpenflat: "魔法防御貫通（固定）", hsp: "回復・シールド量（%）",
  hp5: "体力回復（5秒）", hp5flat: "体力回復（5秒・固定）", mp5: "マナ回復（%）", mp5flat: "マナ回復（5秒）", lifesteal: "ライフスティール（%）", omnivamp: "オムニヴァンプ（%）", tenacity: "行動妨害耐性（%）", gp10: "ゴールド（10秒）",
};

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

function HistoryLine({ h }: { h: HistoryEntry | undefined }) {
  if (!h || !h.versions) return <p className="muted">変更履歴：未取得</p>;
  if (!h.versions.length) return <p className="muted">変更履歴：ページに変更履歴の節がない（<a href={h.source.url}>原典</a>）</p>;
  return (
    <details>
      <summary className="muted">
        変更履歴 {h.versions.length}版（最新 {h.latest}）
      </summary>
      <ul>
        {h.versions.slice(0, 12).map((v) => (
          <li key={v.version}>
            {v.version}
            {v.subjects.length > 0 && `：${v.subjects.slice(0, 4).join("、")}`}
            （{v.lines}行）
          </li>
        ))}
      </ul>
      <p className="muted">
        版と変更の行数だけを示します（変更の文は保存していません）。変更の内容は <a href={h.source.url}>原典</a>（英語 Wiki、{LICENSE}）を参照してください。
      </p>
    </details>
  );
}

interface WikiItem { name: string; source: Source; data?: { id?: number; tier?: number; type?: string[]; buy?: number; modes?: Record<string, boolean>; stats?: Record<string, number> }; effect_text?: Record<string, { name: string | null; plain: string; residual: boolean }> }
interface DdItem { id: number; name: Lang; plaintext: Lang; description: Lang; gold: { total: number; sell: number; purchasable: boolean }; maps: Record<string, boolean> }

function Items() {
  const s = useLoad(async () => {
    const m = await get<Manifest>("manifest.json");
    const snap = m.current.wiki_snapshot;
    const [wiki, dd, hist] = await Promise.all([
      snap ? get<{ items: WikiItem[] }>(`wiki/${snap}/items.json`) : Promise.resolve({ items: [] as WikiItem[] }),
      get<{ items: DdItem[]; source: { version: string } }>(`ddragon/${m.current.ddragon}/items.json`),
      snap ? get<{ entries: Record<string, HistoryEntry> }>(`wiki/${snap}/history/items.json`).catch(() => null) : Promise.resolve(null),
    ]);
    return { wiki: wiki.items, dd: new Map(dd.items.map((x) => [x.id, x])), ddVersion: dd.source.version, hist: hist?.entries ?? {} };
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
  return (
    <>
      <Filter q={q} setQ={setQ} scope={scope} setScope={setScope} scopes={[["sr", "サモナーズリフト"], ["mode", "モード専用"], ["all", "すべて"]]} />
      <p className="muted">{list.length}件。日本語の名前・説明は Data Dragon {s.data.ddVersion}（公式）、ステータス・効果は英語 Wiki の Module:ItemData。</p>
      <ul className="data-list">
        {list.map((w) => {
          const dd = s.data.dd.get(w.data?.id ?? -1);
          const stats = Object.entries(w.data?.stats ?? {}).filter(([, v]) => typeof v === "number");
          return (
            <li key={w.name}>
              <details>
                <summary>
                  <strong>{dd?.name.ja ?? w.name}</strong> <span className="muted">{w.name}{dd ? `・${dd.gold.total}ゴールド` : ""}</span>
                </summary>
                {stats.length > 0 && <p>{stats.map(([k, v]) => `${STAT_LABELS[k] ?? k} ${v}`).join("・")}</p>}
                {dd?.description.ja && (
                  <div>
                    <div className="muted">公式の説明（Data Dragon {s.data.ddVersion}・日本語）</div>
                    <p style={{ whiteSpace: "pre-line" }}>{dd.description.ja}</p>
                  </div>
                )}
                {w.effect_text && Object.keys(w.effect_text).length > 0 && (
                  <details>
                    <summary className="muted">Wiki の効果の文（英語の原文・記法を簡略化）</summary>
                    {Object.entries(w.effect_text).map(([k, e]) => (
                      <p key={k}>
                        {e.name && <strong>{e.name}：</strong>}
                        {e.plain.replace(/⟦[^⟧]*⟧/g, "［解析できない記法］")}
                      </p>
                    ))}
                    <p className="muted">
                      出典：<a href={w.source.url}>{w.source.title}</a>（League of Legends Wiki の寄稿者、{LICENSE}）。改変：記法を簡略化（訳はしていない）。
                    </p>
                  </details>
                )}
                <p className="muted">
                  使えるモード（Wiki）：{Object.entries(w.data?.modes ?? {}).filter(([, v]) => v).map(([k]) => k).join("・") || "記載なし"}
                </p>
                <HistoryLine h={s.data.hist[w.name]} />
              </details>
            </li>
          );
        })}
      </ul>
    </>
  );
}

interface WikiRune { name: string; path: string; ddragon_id: number; source: Source; parsed?: Record<string, ParsedValue>; text?: Record<string, { plain: string; residual: boolean }> }
interface DdRune { id: number; path: Lang; slot: number; name: Lang; long: Lang }

function Runes() {
  const s = useLoad(async () => {
    const m = await get<Manifest>("manifest.json");
    const snap = m.current.wiki_snapshot;
    const [wiki, dd, hist] = await Promise.all([
      snap ? get<{ runes: WikiRune[] }>(`wiki/${snap}/runes.json`) : Promise.resolve({ runes: [] as WikiRune[] }),
      get<{ runes: DdRune[]; source: { version: string } }>(`ddragon/${m.current.ddragon}/runes.json`),
      snap ? get<{ entries: Record<string, HistoryEntry> }>(`wiki/${snap}/history/runes.json`).catch(() => null) : Promise.resolve(null),
    ]);
    return { wiki: new Map(wiki.runes.map((x) => [x.ddragon_id, x])), dd: dd.runes, ddVersion: dd.source.version, hist: hist?.entries ?? {} };
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
                      {r.long.ja && (
                        <div>
                          <div className="muted">公式の説明（Data Dragon {s.data.ddVersion}・日本語）</div>
                          <p style={{ whiteSpace: "pre-line" }}>{r.long.ja}</p>
                        </div>
                      )}
                      {parsed.length > 0 && <p>Wiki の値：{parsed.map(([k, v]) => `${k} ${showValues(v)}`).join("・")}</p>}
                      {w?.text?.description && (
                        <details>
                          <summary className="muted">Wiki の説明（英語の原文・記法を簡略化）</summary>
                          <p>{w.text.description.plain.replace(/⟦[^⟧]*⟧/g, "［解析できない記法］")}</p>
                          <p className="muted">
                            出典：<a href={w.source.url}>{w.source.title}</a>（League of Legends Wiki の寄稿者、{LICENSE}）。改変：記法を簡略化（訳はしていない）。
                          </p>
                        </details>
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
const spellValue = (raw: string | undefined) => (!raw ? "—" : /\{\{\s*(Rune data|Data )/i.test(raw) ? "（別のデータを参照・原典を参照）" : wikiPlain(raw));

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
