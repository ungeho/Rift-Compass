// ポジション（TOP・JG・MID・BOT・SUP）の Topic ページに出す、チャンピオン・判断材料・資料・関連 Topic への導線。
// チャンピオンはロールの子にしない（Topic の親子は変えない）。所属は Wiki の Module:ChampionData の記載だけを使い、推測で加えない。
import { useEffect, useState } from "react";
import { index } from "../data/dataset";
import { decisionsForRole, ROLE_TOPICS } from "../data/decisions";
import { decisionHref, resourceHref, topicHref } from "../router";
import { containsTerm, normalize } from "../search/search";
import { revealTopicItems } from "./TopicTabs";

type Lang = { en: string | null; ja: string | null };
interface PositionEntry {
  topic_id: string;
  id: string;
  key: string;
  name: Lang;
}
interface PositionsFile {
  source: { revid: number; timestamp: string; url: string };
  ddragon: string;
  roles: Record<string, { client: PositionEntry[]; external: PositionEntry[] }>;
}

/** ロールごとに関係の深い Topic（編集上の案内。資料による所属ではない）*/
export const ROLE_GUIDE_TOPICS: Record<string, string[]> = {
  "role-top": ["matchup", "trading", "wave-management", "freeze", "tower-dive", "lane-priority", "playing-from-behind"],
  "role-jungle": ["jungle-invade", "jungle-tracking", "vision", "snowball", "roaming", "lane-priority"],
  "role-mid": ["roaming", "wave-management", "lane-priority", "trading", "vision", "mage"],
  "role-bot": ["level-2", "trading", "wave-management", "minion-aggro", "recall", "mechanics"],
  "role-support": ["vision", "roaming", "level-2", "trading", "lane-priority"],
};

const BASE = `${import.meta.env.BASE_URL}gamedata/`;

async function loadPositions(): Promise<PositionsFile> {
  const m = (await (await fetch(BASE + "manifest.json")).json()) as { current: { wiki_championdata: number } };
  const r = await fetch(`${BASE}wiki-championdata/${m.current.wiki_championdata}/positions.json`);
  if (!r.ok) throw new Error(`positions.json：HTTP ${r.status}`);
  return r.json() as Promise<PositionsFile>;
}

/** 題名・紹介文にロールの名前（表示名・別名）がある公開資料（語の一致で、ロールの解説とは限らない）*/
export function resourcesMentioningRole(topicId: string) {
  const t = index.topicById.get(topicId);
  if (!t) return [];
  const terms = [t.label_ja, t.label_en, ...t.aliases_ja, ...t.aliases_en].map(normalize).filter((x) => [...x].length >= 2);
  return index.publicResources.filter((r) => {
    const text = normalize(`${r.title ?? ""} ${r.summary_ja}`);
    return terms.some((term) => containsTerm(text, term));
  });
}

export function RoleSection({ topicId }: { topicId: string }) {
  const [pos, setPos] = useState<{ status: "loading" } | { status: "error"; message: string } | { status: "ok"; data: PositionsFile }>({ status: "loading" });
  useEffect(() => {
    let alive = true;
    loadPositions()
      .then((data) => alive && setPos({ status: "ok", data }))
      .catch((e: Error) => alive && setPos({ status: "error", message: e.message }));
    return () => {
      alive = false;
    };
  }, [topicId]);
  if (!ROLE_TOPICS[topicId]) return null;
  const decisions = decisionsForRole(topicId);
  const resources = resourcesMentioningRole(topicId);
  const guide = (ROLE_GUIDE_TOPICS[topicId] ?? []).map((id) => index.topicById.get(id)).filter((x) => x !== undefined);
  return (
    <>
      <section aria-labelledby="role-champions-heading">
        <h2 id="role-champions-heading">このポジションのチャンピオン</h2>
        {pos.status === "loading" && <p className="muted">読み込んでいます…</p>}
        {pos.status === "error" && <p className="notice">チャンピオンの一覧を読み込めませんでした（{pos.message}）。</p>}
        {pos.status === "ok" && <RoleChampions topicId={topicId} data={pos.data} />}
      </section>

      {guide.length > 0 && (
        <section aria-labelledby="role-guide-heading">
          <h2 id="role-guide-heading">このポジションで重要な Topic</h2>
          <p className="muted">編集上の案内です（資料の分類による所属ではありません）。</p>
          <ul className="chips">
            {guide.map((g) => (
              <li key={g.id}>
                <a className="chip" href={topicHref(g.id)}>
                  {g.label_ja}
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      {decisions.length > 0 && (
        <section aria-labelledby="role-decisions-heading">
          <h2 id="role-decisions-heading">
            このポジション向けの判断材料（試験） <span className="result-count">{decisions.length}件</span>
          </h2>
          <p className="muted">判断材料の対象ロールにこのポジションが書かれているもの（ロール共通は含めません）。</p>
          <ul>
            {decisions.map((u) => (
              <li key={u.id}>
                <a href={decisionHref(u.id)}>{u.statement_ja}</a>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="role-resources-heading">
        <details className="topic-auxiliary">
        <summary id="role-resources-heading">
          ポジション名を含む資料 <span className="result-count">{resources.length}件</span>
        </summary>
        <p className="muted">題名・紹介文にポジションの名前（別名を含む）がある公開資料です。語の一致で、そのポジションの解説とは限りません。</p>
        {resources.length === 0 ? (
          <p className="muted">該当する資料はありません。</p>
        ) : (
          <ul>
            {resources.map((r) => (
              <li key={r.id}>
                <a href={resourceHref(r.id)}>{r.title}</a> <span className="muted">{r.creator.name}</span>
              </li>
            ))}
          </ul>
        )}
        </details>
      </section>
    </>
  );
}

export function RoleChampions({ topicId, data }: { topicId: string; data: PositionsFile }) {
  const [q, setQ] = useState("");
  const [shown, setShown] = useState(20);
  const r = data.roles[topicId];
  if (!r) return <p className="muted">このポジションの記載はありません。</p>;
  const clientIds = new Set(r.client.map((c) => c.id));
  const externalOnly = r.external.filter((c) => !clientIds.has(c.id));
  const match = (c: PositionEntry) => normalize(`${c.name.ja ?? ""} ${c.name.en ?? ""}`).includes(normalize(q));
  const client = r.client.filter(match), external = externalOnly.filter(match);
  // 少量の名前リンクは保持したまま段階表示し、非表示のリンクをフォーカス対象から外す。
  const chips = (list: PositionEntry[], label: string, visible = Infinity) => (
    <ul className="chips" aria-label={label}>
      {list.map((c, i) => (
        <li key={c.id} hidden={i >= visible}>
          <a className="chip" href={topicHref(c.topic_id)}>
            {c.name.ja ?? c.name.en}
          </a>
        </li>
      ))}
    </ul>
  );
  return (
    <>
      <p className="muted">
        LoL Wiki の Module:ChampionData（revid {data.source.revid}）の記載です。複数のポジションで使われるチャンピオンは、それぞれのポジションに表示します。ゲーム内・統計では確かめていません。
      </p>
      <h3>
        Riot クライアントの推奨 <span className="result-count">{r.client.length}体</span>
      </h3>
      <label className="topic-filter">このポジションのチャンピオンを検索<input type="search" value={q} onChange={(e) => { setQ(e.target.value); setShown(20); }} /></label>
      {q && <p role="status">推奨 {client.length}体 ・ 推奨以外 {external.length}体が一致</p>}
      {chips(client, "推奨チャンピオン一覧", shown)}
      {shown < client.length && <button className="button" onClick={(e) => revealTopicItems(e.currentTarget, shown, () => setShown(shown + 20))}>推奨チャンピオンをさらに{Math.min(20, client.length - shown)}体表示する（残り {client.length - shown}体）</button>}
      {q && !client.length && !external.length && <p>一致するチャンピオンはありません。日本語・英語の名前でも探せます。</p>}
      {externalOnly.length > 0 && (
        <details className="topic-auxiliary" open={q.trim() ? true : undefined}>
          <summary>
            統計サイトなどでの使用（推奨には含まれない） <span className="result-count">{externalOnly.length}体</span>
          </summary>
          {chips(external, "推奨以外のチャンピオン一覧")}
        </details>
      )}
      <p className="muted">
        全チャンピオンは <a href={topicHref("cat-champions")}>チャンピオン別</a> からもたどれます。
      </p>
    </>
  );
}
