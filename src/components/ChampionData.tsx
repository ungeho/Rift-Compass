// チャンピオンの Topic ページに出す基本データ（Data Dragon・Wiki の取り込み結果）。
// 必要なチャンピオンのファイルだけを開いたときに読む（public/gamedata）。取得したデータの表示で、ゲーム内での検証ではない。
import { useEffect, useState } from "react";
import { topicHref } from "../router";
import {
  attackSpeedRow,
  CLASS_LABELS,
  closestForm,
  placeholders,
  POSITION_TOPICS,
  RANGE_MARKER,
  SHOWN_LEVELS,
  statChanges,
  statRows,
  type DDragonChampion,
  type DDragonIndexEntry,
  type KnownIssue,
  type WikiByKey,
} from "../gamedata/champion";

interface Manifest {
  ddragon: { version: string }[];
  wiki_championdata: { revid: number }[];
  current: { ddragon: string; wiki_championdata?: number };
}

interface Loaded {
  version: string;
  dd: DDragonChampion;
  wiki: WikiByKey | null;
  prev: { version: string; dd: DDragonChampion } | null;
  /** その版の Data Dragon の既知の不具合（採用しない項目）*/
  knownIssues: KnownIssue[];
  /** Data Dragon の版とゲームのパッチの対応（public/gamedata/versions.json。照合による推定）*/
  patch: { game_patch: string; status: string } | null;
}

const BASE = `${import.meta.env.BASE_URL}gamedata/`;
const getJson = async <T,>(p: string): Promise<T> => {
  const r = await fetch(BASE + p);
  if (!r.ok) throw new Error(`${p}：HTTP ${r.status}`);
  return r.json() as Promise<T>;
};

async function load(topicId: string): Promise<Loaded | null> {
  const m = await getJson<Manifest>("manifest.json");
  const version = m.current.ddragon;
  const idx = await getJson<{ champions: DDragonIndexEntry[]; known_issues?: KnownIssue[] }>(`ddragon/${version}/index.json`);
  const entry = idx.champions.find((c) => c.topic_id === topicId);
  if (!entry) return null;
  const dd = await getJson<DDragonChampion>(`ddragon/${version}/champions/${entry.id}.json`);
  const wiki = m.current.wiki_championdata ? await getJson<WikiByKey>(`wiki-championdata/${m.current.wiki_championdata}/by-key/${entry.key}.json`).catch(() => null) : null;
  const prevVersion = m.ddragon.map((x) => x.version).find((v) => v !== version) ?? null;
  const prev = prevVersion ? await getJson<DDragonChampion>(`ddragon/${prevVersion}/champions/${entry.id}.json`).then((d) => ({ version: prevVersion, dd: d })).catch(() => null) : null;
  const versions = await getJson<{ ddragon: { ddragon: string; game_patch: string; status: string }[] }>("versions.json").catch(() => null);
  const patch = versions?.ddragon.find((x) => x.ddragon === version) ?? null;
  return { version, dd, wiki, prev, knownIssues: idx.known_issues ?? [], patch };
}

/** Data Dragon の説明文のタグ（<br> <magicDamage> など）を表示用に除く（元の文はファイルにそのまま残す）*/
const plain = (html: string | null) => (html ?? "").replace(/<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();

const fmt = (v: number | null, digits: number) => (v === null ? "—" : Number(v.toFixed(digits)).toString());

export function ChampionData({ topicId }: { topicId: string }) {
  const [state, setState] = useState<{ status: "loading" } | { status: "none" } | { status: "error"; message: string } | { status: "ok"; data: Loaded }>({ status: "loading" });
  useEffect(() => {
    let alive = true;
    setState({ status: "loading" });
    load(topicId)
      .then((data) => alive && setState(data ? { status: "ok", data } : { status: "none" }))
      .catch((e: Error) => alive && setState({ status: "error", message: e.message }));
    return () => {
      alive = false;
    };
  }, [topicId]);

  if (state.status === "none") return null;
  return (
    <section aria-labelledby="champion-data-heading" className="champion-data">
      <h2 id="champion-data-heading">基本データ（公式 Data Dragon）</h2>
      {state.status === "loading" && <p className="muted">読み込んでいます…</p>}
      {state.status === "error" && <p className="notice">基本データを読み込めませんでした（{state.message}）。</p>}
      {state.status === "ok" && <ChampionDataBody data={state.data} />}
    </section>
  );
}

export function ChampionDataBody({ data }: { data: Loaded }) {
  const { dd, wiki, version, prev, knownIssues, patch } = data;
  const forms = wiki?.forms ?? [];
  const form = closestForm(dd, forms, knownIssues);
  const rows = statRows(dd, form, knownIssues);
  const as = attackSpeedRow(dd, form);
  const changes = prev ? statChanges(prev.dd, dd) : [];
  return (
    <>
      <p className="muted">
        Riot Data Dragon {version}（{dd.source.fetched_at} 取得）{wiki && <>と LoL Wiki の Module:ChampionData（revid {wiki.source.revid}）</>}の値です。
        取得したデータの表示で、ゲーム内では検証していません。Data Dragon には未反映の変更や誤りがありうるため、現行のゲームの仕様と同じとは限りません。
      </p>
      <p className="muted">
        {patch ? `ゲームのパッチ ${patch.game_patch} に対応（${patch.status}。Data Dragon の版とパッチ番号は別の番号です）。` : "ゲームのパッチとの対応は確認していません。"}
        {wiki && " Wiki の revid はページの版で、ゲームのパッチではありません。"}
      </p>

      <h3>チャンピオンクラス</h3>
      <p>
        {dd.tags.map((t) => (
          <span key={t} className="badge">
            {CLASS_LABELS[t] ?? t}（{t}）
          </span>
        ))}{" "}
        <span className="muted">Riot の分類（Data Dragon {version} の tags）。担当するポジションとは別です。</span>
      </p>
      {form && (
        <>
          {(form.role?.length ?? 0) > 0 && (
            <p className="muted">
              Wiki の細分類：{form.role!.join("・")}
              {form.rangetype && `（${form.rangetype === "Melee" ? "近接" : form.rangetype === "Ranged" ? "遠隔" : form.rangetype}）`}
              {form.changes && `。Wiki がこの項目を最後に変更したパッチの記録：${form.changes}`}
            </p>
          )}
          <h3>ポジション</h3>
          <p>
            Riot クライアントの推奨（Wiki の記載）：
            {(form.client_positions ?? []).map((p, i) => (
              <span key={p}>
                {i > 0 && "、"}
                {POSITION_TOPICS[p] ? <a href={topicHref(POSITION_TOPICS[p].topic)}>{POSITION_TOPICS[p].label}</a> : p}
              </span>
            ))}
            {(form.external_positions?.length ?? 0) > 0 && (
              <span className="muted">　統計サイトなどでの使用（Wiki の記載）：{form.external_positions!.map((p) => POSITION_TOPICS[p]?.label ?? p).join("、")}</span>
            )}
          </p>
          <p className="muted">ポジションは Topic の親子にしていません（このチャンピオンがそのロールの知識に含まれる、とは扱いません）。</p>
        </>
      )}

      <h3>基本ステータスと成長</h3>
      {forms.length > 1 && (
        <p className="notice">
          Wiki では形態ごとに値が分かれています（{forms.map((f) => f.form).join("・")}）。Data Dragon は1組の値だけなので、違いの最も少ない「{form?.form}」と比べています。
        </p>
      )}
      <div className="table-scroll">
        <table className="stat-table">
          <thead>
            <tr>
              <th scope="col">項目</th>
              <th scope="col">基本値</th>
              <th scope="col">成長値</th>
              {SHOWN_LEVELS.map((n) => (
                <th key={n} scope="col">
                  Lv{n}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label}>
                <th scope="row">
                  {r.label}
                  {r.conflict && <span className="badge partial">Wiki と不一致</span>}
                  {r.excluded && <span className="badge partial">Data Dragon の成長値を除外</span>}
                </th>
                <td>
                  {fmt(r.base, r.digits)}
                  {r.conflict && r.wikiBase !== r.base && <div className="muted">Wiki：{fmt(r.wikiBase, r.digits)}</div>}
                </td>
                <td>
                  {r.excluded ? (
                    <>
                      {r.growth === null ? "不明" : fmt(r.growth, 3)}
                      <div className="muted">
                        {r.growthSource === "wiki" && wiki && form ? `Wiki（revid ${wiki.source.revid}・形態「${form.form}」）の値。現行の値かはゲーム内で確認していません` : "Wiki にも値がないため不明"}
                      </div>
                      <div className="muted">
                        Data Dragon の値 {fmt(r.rawGrowth, 3)} は既知の不具合（{r.excluded.since} 以降・{r.excluded.detected}）のため採用しません（<a href={r.excluded.reference}>報告</a>）
                      </div>
                    </>
                  ) : (
                    <>
                      {r.growth === null && r.wikiGrowth === null ? "—" : fmt(r.growth, 3)}
                      {r.conflict && r.wikiGrowth !== r.growth && <div className="muted">Wiki：{fmt(r.wikiGrowth, 3)}</div>}
                    </>
                  )}
                </td>
                {r.levels.map((v, i) => (
                  <td key={i}>
                    {fmt(v, r.digits)}
                    {r.wikiLevels && <div className="muted">Wiki：{fmt(r.wikiLevels[i], r.digits)}</div>}
                  </td>
                ))}
              </tr>
            ))}
            <tr>
              <th scope="row">
                攻撃速度
                {as.conflict && <span className="badge partial">Wiki と不一致</span>}
              </th>
              <td>
                {fmt(as.base, 3)}
                <div className="muted">反映率：{as.ratio === null ? "不明" : fmt(as.ratio, 3)}</div>
              </td>
              <td>
                {fmt(as.growthPercent, 2)}%{as.conflict && <div className="muted">Wiki：{fmt(as.wikiGrowthPercent, 2)}%</div>}
              </td>
              {as.levels.map((v, i) => (
                <td key={i}>{fmt(v, 3)}</td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
      <p className="muted">
        各レベルの値は、成長の式（基本値＋成長値×(n−1)×(0.7025＋0.0175×(n−1))）で Data Dragon の値から計算し、アイテム・ルーンなどの増加は含みません。
        攻撃速度は「基本攻撃速度＋(成長％)×反映率」で計算します（反映率は Wiki の値。Data Dragon にはありません）。上限（2.5 など）は適用していません。
        Wiki と値が違う項目は、Wiki の値での計算も示します。どちらが現行の値かは確かめていません。
        Data Dragon の既知の不具合で除外した成長値は、Wiki の値（なければ不明）で計算します。
      </p>

      <h3>スキル</h3>
      <p className="muted">
        Data Dragon の説明文の数値は穴埋め（{"{{ }}"}）のままのことが多く、ダメージ・スケーリングは取得できていません。クールダウン・コスト・射程は Data Dragon の値をそのまま示します。
      </p>
      <ul className="spell-list">
        <li>
          <strong>パッシブ：{dd.passive.name.ja ?? dd.passive.name.en}</strong> <span className="muted">{dd.passive.name.en}</span>
          {(dd.passive.description.ja ?? dd.passive.description.en) && <div>{plain(dd.passive.description.ja ?? dd.passive.description.en)}</div>}
        </li>
        {dd.spells.map((s) => {
          const ph = placeholders(s.tooltip.en);
          const marker = s.range.some((x) => x >= RANGE_MARKER);
          return (
            <li key={s.id}>
              <strong>
                {s.slot}：{s.name.ja ?? s.name.en}
              </strong>{" "}
              <span className="muted">{s.name.en}</span>
              <div>
                CD {s.cooldownBurn}秒・コスト {s.costBurn}
                {s.costType.ja ? `（${s.costType.ja.trim()}）` : ""}・射程 {s.rangeBurn}
                {marker && <span className="muted">（{RANGE_MARKER}以上は Data Dragon の大きな値。実際の射程とは限りません）</span>}・最大ランク {s.maxrank}
              </div>
              {ph.length > 0 && <div className="muted">説明文の未解決の穴埋め：{ph.length}件</div>}
            </li>
          );
        })}
      </ul>

      {prev && (
        <>
          <h3>前の版（{prev.version}）からの変化</h3>
          {changes.length === 0 ? (
            <p className="muted">基本ステータス・スキルの CD・コスト・射程・最大ランク・説明文に変化はありません（Data Dragon の値の比較）。</p>
          ) : (
            <ul>
              {changes.map((c) => (
                <li key={c.field}>
                  {c.field}：{String(c.from)} → {String(c.to)}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </>
  );
}
