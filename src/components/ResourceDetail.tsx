import { index, isPublic } from "../data/dataset";
import { BASIS_LABELS, CREATOR_KIND_LABELS, eraLabel, formatSeconds, LANGUAGE_LABELS, LEVEL_LABELS, TYPE_LABELS } from "../data/labels";
import { youtubeAt } from "../lib/links";
import { plainText } from "../lib/plainText";
import { lastListHref, resourceHref } from "../router";
import { ExternalLink, LevelBadge, TopicChips } from "./common";
import { NoteCard } from "./NoteCard";

export function ResourceDetail({ id }: { id: string }) {
  const r = index.resourceById.get(id);
  const back = (
    <p className="back">
      <a href={lastListHref()}>← 検索結果に戻る</a>
    </p>
  );
  if (!r) {
    return (
      <div className="detail">
        {back}
        <h1>資料が見つかりません</h1>
        <p>ID「{id}」の資料は登録されていません。</p>
      </div>
    );
  }

  const level = LEVEL_LABELS[r.verification.level];
  const notes = [...new Set((index.evidenceByResource.get(r.id) ?? []).map((e) => e.note_id))]
    .map((nid) => index.noteById.get(nid))
    .filter((n) => n !== undefined);
  const original = r.derived_from ? index.resourceById.get(r.derived_from) : undefined;
  const translations = index.translationsOf.get(r.id) ?? [];

  return (
    <div className="detail">
      {back}
      {!isPublic(r) && (
        <p className="warning" role="note">
          この資料は未確認の候補です（確認レベル {r.verification.level}、無料アクセス未確認）。通常の一覧・検索には表示していません。
        </p>
      )}
      <header className="detail-header">
        <div className="card-meta">
          <span className="badge">{TYPE_LABELS[r.type] ?? r.type}</span>
          <span className="badge lang">{LANGUAGE_LABELS[r.language] ?? r.language}</span>
          <LevelBadge level={r.verification.level} />
        </div>
        <h1>{r.title ?? "（タイトル未確認）"}</h1>
        <p className="card-creator">
          {r.creator.name}
          <span className="muted">（{CREATOR_KIND_LABELS[r.creator.kind] ?? r.creator.kind}）</span>
        </p>
        <p className="open-original">
          <ExternalLink href={r.url} className="button primary">
            元の資料を開く
          </ExternalLink>
          <span className="muted url">{r.url}</span>
        </p>
      </header>

      <section aria-labelledby="summary-heading">
        <h2 id="summary-heading">紹介</h2>
        <p>{plainText(r.summary_ja)}</p>
        <TopicChips ids={r.topic_ids} />
      </section>

      <section aria-labelledby="info-heading">
        <h2 id="info-heading">資料の情報</h2>
        <dl className="info">
          <dt>公開日</dt>
          <dd>
            {r.published_at ?? "不明"}
            {r.updated_at && `（更新 ${r.updated_at}）`}
            {r.published_at_note && <div className="muted">{plainText(r.published_at_note)}</div>}
          </dd>
          <dt>対象パッチ</dt>
          <dd>{r.patch_context.stated_patch ?? "明記なし"}</dd>
          <dt>対象時期</dt>
          <dd>
            {eraLabel(r.patch_context.era)}
            <span className="muted">（根拠：{BASIS_LABELS[r.patch_context.basis] ?? r.patch_context.basis}）</span>
          </dd>
          {r.duration_sec !== undefined && (
            <>
              <dt>長さ</dt>
              <dd>{formatSeconds(r.duration_sec)}</dd>
            </>
          )}
          <dt>アクセス</dt>
          <dd>
            {r.access.free === true ? "無料" : r.access.free === false ? "有料" : "未確認"}
            {r.access.notes && <span className="muted">（{r.access.notes}）</span>}
          </dd>
          <dt>確認レベル</dt>
          <dd>
            <LevelBadge level={r.verification.level} /> {level.description}
            <div className="muted">
              確認日 {r.verification.checked_at}
              {r.verification.notes && `。${plainText(r.verification.notes)}`}
            </div>
          </dd>
        </dl>
      </section>

      {(original || r.translation || translations.length > 0) && (
        <section aria-labelledby="provenance-heading">
          <h2 id="provenance-heading">翻訳・原典</h2>
          {original && (
            <p>
              原典：<a href={resourceHref(original.id)}>{original.title}</a>（{original.creator.name}、
              {LANGUAGE_LABELS[original.language] ?? original.language}、{original.published_at ?? "公開日不明"}）
            </p>
          )}
          {r.translation && (
            <p>
              翻訳の種類：{r.translation.kind === "fan_subtitle" ? "ファンによる字幕" : r.translation.kind}
              ・原典の発信者との関係：{r.translation.affiliated_with_original ? "あり" : "なし（非公式）"}
              ・翻訳方法（記載）：{r.translation.method_stated}
            </p>
          )}
          {translations.map((t) => (
            <p key={t.id}>
              翻訳版：<a href={resourceHref(t.id)}>{t.title}</a>（{t.creator.name}、{LANGUAGE_LABELS[t.language] ?? t.language}）
            </p>
          ))}
        </section>
      )}

      {r.segments && r.segments.length > 0 && (
        <section aria-labelledby="segments-heading">
          <h2 id="segments-heading">動画の区間</h2>
          {r.verification.level === "L2" && (
            <p className="muted">
              区間名は動画ページのチャプターから転記したものです。本編の内容は確認していません。
            </p>
          )}
          <ol className="segments">
            {r.segments.map((s) => {
              const href = youtubeAt(r.url, s.start_sec);
              return (
                <li key={s.start_sec}>
                  {href ? <ExternalLink href={href}>{formatSeconds(s.start_sec)}</ExternalLink> : <span>{formatSeconds(s.start_sec)}</span>}{" "}
                  {s.label}
                </li>
              );
            })}
          </ol>
        </section>
      )}

      <section aria-labelledby="notes-heading">
        <h2 id="notes-heading">この資料を根拠にした知識ノート</h2>
        {notes.length === 0 ? (
          <p className="muted">この資料に関連付けられた知識ノートはありません。</p>
        ) : (
          <>
            <p className="muted">
              Phase 0 時点で、現行パッチのゲーム内で検証した知識ノートはありません。「資料に記載あり」は、資料にそう書かれていることを確認したという意味です。
            </p>
            {notes.map((n) => (
              <NoteCard key={n.id} note={n} currentResourceId={r.id} />
            ))}
          </>
        )}
      </section>
    </div>
  );
}
