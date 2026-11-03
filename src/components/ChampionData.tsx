// チャンピオンの Topic ページに出す基本データ（Data Dragon・Wiki の取り込み結果）。
// 必要なチャンピオンのファイルだけを開いたときに読む（public/gamedata）。取得したデータの表示で、ゲーム内での検証ではない。
import { useEffect, useState } from "react";
import { topicHref } from "../router";
import {
  attackSpeedRow,
  CLASS_LABELS,
  closestForm,
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
import { derivedProperties, fieldLabel, reasonLabel, showRatio, showValues, wikiPlain, type WikiAbilityFile, type WikiAbilityTemplate } from "../gamedata/wikiAbility";
import { INPUT_LABELS, STAGE_LABELS } from "../gamedata/damage";

/** 説明文の日本語訳（public/gamedata/wiki/<取得日>/translations/ja/abilities/<キー>.json）*/
export interface TranslationFile {
  translator: string;
  review: string;
  entries: Record<string, { source_sha1: string; plain_sha1?: string; ja: string; status: string }>;
  withheld: Record<string, { source_sha1: string; plain_sha1?: string; reason: string }>;
}

interface Manifest {
  ddragon: { version: string }[];
  wiki_championdata: { revid: number }[];
  current: { ddragon: string; wiki_championdata?: number; wiki_snapshot?: string };
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
  /** 英語 Wiki のスキルのデータ（取得日ごと）。未取得なら null */
  abilities?: { snapshot: string; file: WikiAbilityFile } | null;
  translations?: TranslationFile | null;
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
  const snapshot = m.current.wiki_snapshot;
  const abilityFile = snapshot ? await getJson<WikiAbilityFile>(`wiki/${snapshot}/abilities/${entry.key}.json`).catch(() => null) : null;
  const translations = snapshot ? await getJson<TranslationFile>(`wiki/${snapshot}/translations/ja/abilities/${entry.key}.json`).catch(() => null) : null;
  return { version, dd, wiki, prev, knownIssues: idx.known_issues ?? [], patch, abilities: abilityFile && snapshot ? { snapshot, file: abilityFile } : null, translations };
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
  const abilities = data.abilities ?? null;
  const wikiFor = (slot: string) => (abilities?.file.templates ?? []).filter((t) => t.slot === slot);
  // 表の外に出す注記（除外・代替値・不一致）。情報は落とさず、表のセルには印だけを置く
  const notes: { n: number; label: string; text: string; link?: string }[] = [];
  for (const r of rows) {
    const parts: string[] = [];
    let link: string | undefined;
    if (r.excluded) {
      parts.push(
        `成長値：Data Dragon の値 ${fmt(r.rawGrowth, 3)} は既知の不具合（${r.excluded.since} 以降・${r.excluded.detected}）のため採用しません。` +
          (r.growthSource === "wiki" && wiki && form ? `Wiki（revid ${wiki.source.revid}・形態「${form.form}」）の値 ${fmt(r.growth, 3)} で計算しています。現行の値かはゲーム内で確認していません。` : "Wiki にも値がないため、Lv2 以降は不明です。"),
      );
      link = r.excluded.reference;
    }
    if (r.conflict) {
      parts.push(
        `Data Dragon と Wiki の値が違います（Data Dragon：基本 ${fmt(r.base, r.digits)}・成長 ${fmt(r.growth, 3)} ／ Wiki：基本 ${fmt(r.wikiBase, r.digits)}・成長 ${fmt(r.wikiGrowth, 3)}` +
          (r.wikiLevels ? `。Wiki の値での Lv${SHOWN_LEVELS.join("・")}：${r.wikiLevels.map((v) => fmt(v, r.digits)).join("・")}` : "") +
          "）。どちらが現行かは確かめていません。",
      );
    }
    if (parts.length) notes.push({ n: notes.length + 1, label: r.label, text: `${r.label}の${parts.join(" ")}`, link });
  }
  const asNote = as.conflict
    ? { n: notes.length + 1, label: "攻撃速度", text: `攻撃速度の値が Data Dragon と Wiki で違います（Data Dragon：基本 ${fmt(as.base, 3)}・成長 ${fmt(as.growthPercent, 2)}% ／ Wiki：基本 ${fmt(as.wikiBase, 3)}・成長 ${fmt(as.wikiGrowthPercent, 2)}%）。表は Data Dragon の成長値で計算しています。` }
    : null;
  if (asNote) notes.push(asNote);
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
          <span key={t} className={`badge champ-class class-${t.toLowerCase()}`} data-champion-class={t}>
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
            {rows.map((r) => {
              const note = notes.find((x) => x.label === r.label);
              return (
                <tr key={r.label}>
                  <th scope="row">
                    {r.label}
                    {note && <sup className="mark">※{note.n}</sup>}
                  </th>
                  <td>{fmt(r.base, r.digits)}</td>
                  <td>
                    {r.excluded ? (r.growth === null ? "不明" : fmt(r.growth, 3)) : r.growth === null && r.wikiGrowth === null ? "—" : fmt(r.growth, 3)}
                    {r.growthSource === "wiki" && <sup className="mark">W</sup>}
                  </td>
                  {r.levels.map((v, i) => (
                    <td key={i}>
                      {v === null && r.excluded ? "不明" : fmt(v, r.digits)}
                      {r.growthSource === "wiki" && i > 0 && <sup className="mark">W</sup>}
                    </td>
                  ))}
                </tr>
              );
            })}
            <tr>
              <th scope="row">
                攻撃速度
                {asNote && <sup className="mark">※{asNote.n}</sup>}
              </th>
              <td>{fmt(as.base, 3)}</td>
              <td>{fmt(as.growthPercent, 2)}%</td>
              {as.levels.map((v, i) => (
                <td key={i}>
                  {v === null ? "—" : fmt(v, 3)}
                  {v !== null && i > 0 && <sup className="mark">R</sup>}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
      <ul className="stat-notes">
        <li>
          <sup className="mark">W</sup>：Wiki（{wiki ? `revid ${wiki.source.revid}` : "未取得"}
          {form ? `・形態「${form.form}」` : ""}）の値で計算。<sup className="mark">R</sup>：攻撃速度の反映率（Wiki の値：{as.ratio === null ? "不明" : fmt(as.ratio, 3)}）で計算。
        </li>
        {notes.map((x) => (
          <li key={x.n}>
            ※{x.n}　{x.text}
            {x.link && (
              <>
                {" "}
                （<a href={x.link}>不具合の報告</a>）
              </>
            )}
          </li>
        ))}
        <li>
          各レベルの値は成長の式（基本値＋成長値×(n−1)×(0.7025＋0.0175×(n−1))）で計算し、アイテム・ルーンなどの増加は含みません。攻撃速度は「基本攻撃速度＋(成長％)×反映率」で、上限（2.5 など）は適用していません。
        </li>
        <li>表の値は取得したデータからの計算で、ゲーム内では検証していません。</li>
      </ul>

      <h3>スキル</h3>
      <p className="muted">
        英語の LoL Wiki のスキルのデータを優先して示します（{abilities ? `取得日 ${abilities.snapshot}、各テンプレートの更新日時と原典へのリンクつき` : "このチャンピオンの Wiki のスキルのデータは未取得"}）。
        数値と英語の説明文は <a href="https://wiki.leagueoflegends.com/en-us/">League of Legends Wiki</a> の寄稿者によるもの（<a href="https://creativecommons.org/licenses/by-sa/3.0/">CC BY-SA 3.0</a>）で、日本語の見出し・注記は Rift Compass が書いたものです。
        Data Dragon の説明文の穴埋め（{"{{ }}"}）は表示しません。Wiki から読み取れなかった値は「未解析」として原文の項目名と理由を示し、推測で埋めません。
        「数値で計算できる」は、その行の式（軽減前の値）を入力から計算できるという意味で、スキル全体のダメージ・コンボ・キルラインの予測ではありません（スタック・形態・対象ごとの上限・防御貫通などは含みません）。
      </p>
      <ul className="spell-list">
        <SkillItem slot="I" title={`パッシブ：${dd.passive.name.ja ?? dd.passive.name.en}`} nameEn={dd.passive.name.en} ddLine={null} ddText={plain(dd.passive.description.ja ?? dd.passive.description.en)} templates={wikiFor("I")} loaded={!!abilities} translations={data.translations ?? null} />
        {dd.spells.map((s) => {
          const marker = s.range.some((x) => x >= RANGE_MARKER);
          const costType = (s.costType.ja ?? "").trim();
          const ddLine = `Data Dragon ${version}：CD ${s.cooldownBurn}秒・コスト ${s.costBurn}${costType && !/\{\{/.test(costType) ? `（${costType}）` : ""}・射程 ${marker ? `${s.rangeBurn}（大きな値。実際の射程とは限らない）` : s.rangeBurn}・最大ランク ${s.maxrank}`;
          return <SkillItem key={s.id} slot={s.slot} title={`${s.slot}：${s.name.ja ?? s.name.en}`} nameEn={s.name.en} ddLine={ddLine} ddText={null} templates={wikiFor(s.slot)} loaded={!!abilities} translations={data.translations ?? null} />;
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

/** スキル1つ：英語 Wiki の値（優先）と Data Dragon の値。Wiki のテンプレートが複数（段階・形態）なら全部を出す */
function SkillItem({ title, nameEn, ddLine, ddText, templates, loaded, translations }: { slot: string; title: string; nameEn: string | null; ddLine: string | null; ddText: string | null; templates: WikiAbilityTemplate[]; loaded: boolean; translations: TranslationFile | null }) {
  return (
    <li>
      <strong>{title}</strong> <span className="muted">{nameEn}</span>
      {ddText && <div>{ddText}</div>}
      {!loaded ? (
        <div className="muted">英語 Wiki のスキルのデータは未取得です。</div>
      ) : templates.length === 0 ? (
        <div className="muted">英語 Wiki のこのスキルのデータは見つかっていません（未取得）。</div>
      ) : (
        templates.map((t) => <WikiTemplate key={t.title} t={t} translations={translations} />)
      )}
      {ddLine && <div className="muted">{ddLine}</div>}
    </li>
  );
}

function WikiTemplate({ t, translations }: { t: WikiAbilityTemplate; translations: TranslationFile | null }) {
  if (t.source.status !== 200) {
    return (
      <div className="wiki-skill">
        <span className="muted">
          Wiki：{t.name}（{t.source.status === 404 ? "ページなし" : `取得できず HTTP ${t.source.status}`}）
        </span>
      </div>
    );
  }
  if (t.redirect_to) {
    return (
      <div className="wiki-skill">
        <span className="muted">
          Wiki：{t.name} は {t.redirect_to.replace(/^Template:Data [^/]+\//, "")} への転送（同じデータ）
        </span>
      </div>
    );
  }
  const parsed = Object.entries(t.parsed ?? {});
  const derived = derivedProperties(t);
  // 説明の項目：取り込み時に読める英語にした text（なければ原文を簡略化）。訳は原文の sha1 が一致するものだけ使う
  const descKeys = Object.keys(t.text ?? {}).filter((k) => /^description/.test(k)).sort((a, b) => a.localeCompare(b, "en", { numeric: true }));
  const desc = descKeys.length
    ? descKeys.map((k) => {
        const src = t.text![k];
        const id = `${t.title}#${k}`;
        const tr = translations?.entries[id];
        // 訳は Wiki の原文（source_sha1）と訳の対象の英文（plain_sha1）の両方が一致するときだけ表示する（解析の修正で英文が変わった訳は古い）
        const ja = tr && tr.source_sha1 === src.source_sha1 && tr.plain_sha1 === src.plain_sha1 ? tr.ja : null;
        // 保留の理由：未解決の記法（毎回の取り込みで判定）か、それ以外（英文の欠けなど。英文が同じ間だけ有効）
        const w = translations?.withheld[id];
        const manual = !src.residual && w && w.reason !== "residual_markup" && w.source_sha1 === src.source_sha1 && w.plain_sha1 === src.plain_sha1;
        const state = ja ? "translated" : src.residual || manual ? "withheld" : tr ? "stale" : "none";
        return { key: k, en: src.plain.replace(/⟦[^⟧]*⟧/g, "［解析できない記法］"), residual: src.residual, ja, state, reason: src.residual ? "residual_markup" : manual ? w!.reason : null };
      })
    : ["description", "description2", "description3", "description4"].map((k) => ({ key: k, en: wikiPlain(t.params?.[k]), residual: false, ja: null as string | null, state: "none", reason: null as string | null })).filter((x) => x.en);
  const anyJa = desc.some((d) => d.ja);
  const updated = t.source.last_modified ? new Date(t.source.last_modified).toISOString().slice(0, 10) : "不明";
  return (
    <div className="wiki-skill">
      <div>
        <a href={t.source.url}>{t.name}</a>
        <span className="muted">
          （Wiki・{t.form !== t.name ? `形態 ${t.form}・` : ""}更新 {updated}）
        </span>
        {t.compare && <span className="badge">{t.compare.same ? "CD は Data Dragon と一致" : "CD が Data Dragon と違う（どちらが現行かは未確認）"}</span>}
      </div>
      {t.rank_note && (
        <div className="muted">
          値の数（{t.rank_note.value_counts.join("・")}）が Data Dragon の最大ランク（{t.rank_note.ddragon_maxrank}）と違います。Wiki の段階（究極スキルのランク・形態など）による値の可能性があります。
        </div>
      )}
      {parsed.length > 0 && (
        <div>
          {parsed.map(([k, v], i) => (
            <span key={k}>
              {i > 0 && "・"}
              {fieldLabel(k)} {showValues(v)}
            </span>
          ))}
        </div>
      )}
      {(t.leveling ?? []).length > 0 && (
        <ul className="wiki-leveling">
          {(t.leveling ?? []).map((l, i) => (
            <li key={i}>
              {wikiPlain(l.label)}：{l.base ? showValues(l.base) : <span className="muted">未解析（{reasonLabel(l.reason)}）</span>} {l.ratios.map((r) => showRatio(r)).join(" ")}
              {l.calc && l.calc.stage !== "formula_parsed" && (
                <span className={`calc-stage calc-${l.calc.stage}`}>
                  {STAGE_LABELS[l.calc.stage]}
                  {l.calc.stage === "computable" && l.calc.inputs?.length ? `（入力：${l.calc.inputs.map((x) => INPUT_LABELS[x]).join("・")}）` : ""}
                  {l.calc.stage === "not_computable" && l.calc.missing?.length ? `（${l.calc.missing.join("・")}）` : ""}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      {derived.length > 0 && (
        <div className="muted">
          式から導ける性質（係数の対象から自動で判定。ゲーム内では未検証、戦術的な結論ではない）：{derived.map((d) => d.label_ja).join("／")}
        </div>
      )}
      {(t.unparsed ?? []).length > 0 && (
        <details>
          <summary className="muted">未解析の項目 {(t.unparsed ?? []).length}件</summary>
          <ul>
            {(t.unparsed ?? []).map((u, i) => (
              <li key={i}>
                {fieldLabel(u.field)}（{reasonLabel(u.reason)}）：<span className="muted">{wikiPlain(t.params?.[u.field] ?? "").slice(0, 160) || "原文を参照"}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
      {desc.length > 0 && (
        <div className="wiki-desc-ja">
          <div className="muted">Wiki の説明（日本語訳）</div>
          {anyJa ? (
            desc.map((d) => (
              <p key={d.key} className={d.ja ? undefined : "muted"}>
                {d.ja ??
                  (d.state === "withheld"
                    ? d.reason === "residual_markup"
                      ? "（この段落は翻訳を保留しています。Wiki の記法に解けない部分があるため、英語の原文を参照してください）"
                      : "（この段落は翻訳を保留しています。英語の原文の取り出しに欠けがあり、推測でしか訳せないため、Wiki の原典を参照してください）"
                    : d.state === "stale"
                      ? "（原文が更新されたため、古い訳は表示しません。英語の原文を参照してください）"
                      : "（この段落はまだ訳していません。英語の原文を参照してください）")}
              </p>
            ))
          ) : (
            <p className="muted">このスキルの説明の日本語訳はまだありません。英語の原文を参照してください。</p>
          )}
          {anyJa && (
            <p className="muted">
              {translations?.translator ?? "AI"} による翻訳（{translations?.review ?? "未レビュー"}）。原文：<a href={t.source.url}>{t.title}</a>（League of Legends Wiki の寄稿者）。翻訳による改変を含み、この訳文も{" "}
              <a href="https://creativecommons.org/licenses/by-sa/3.0/">CC BY-SA 3.0</a> で提供します。訳には原文にない説明を加えていません。
            </p>
          )}
        </div>
      )}
      {desc.length > 0 && (
        <details>
          <summary className="muted">Wiki の説明（英語の原文・記法を簡略化して表示）</summary>
          {desc.map((d) => (
            <p key={d.key}>{d.en}</p>
          ))}
          <p className="muted">
            出典：<a href={t.source.url}>{t.title}</a>（League of Legends Wiki の寄稿者）。ライセンス：<a href="https://creativecommons.org/licenses/by-sa/3.0/">CC BY-SA 3.0</a>。
            改変：Wiki の記法を簡略化して表示しています（訳はしていません）。この改変した文章も CC BY-SA 3.0 で提供します。
          </p>
        </details>
      )}
    </div>
  );
}
