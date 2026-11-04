import { useId, useState } from "react";
import { displayItemName, itemIconUrl, relationNodes, treePrice, type TreeItem } from "../gamedata/itemTree";
import type { ItemDataMatch } from "../gamedata/itemRules";
import { itemHref } from "../router";

function ItemIcon({ url }: { url: string | null }) {
  const [failed, setFailed] = useState(false);
  // 名称は同じリンク内のテキストで伝える。画像・代替枠は装飾として重複読み上げを避ける。
  return <span className="item-icon-frame" aria-hidden="true">{url && !failed
    ? <img src={url} alt="" width={40} height={40} loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailed(true)} />
    : <span className="item-icon-placeholder" title="アイコン未取得・対応未確認。アイテム情報がないという意味ではありません。">画像なし</span>}</span>;
}

export function ItemTree({ current, all, version, matches }: { current?: TreeItem; all: readonly TreeItem[]; version: string; matches: ReadonlyMap<string, ItemDataMatch> }) {
  const heading = useId();
  const targetFor = (d: TreeItem) => {
    const wiki = [...matches].filter(([, r]) => r.status === "matched" && r.official?.id === d.id);
    return wiki.length === 1 ? `wiki:${wiki[0][0]}` : `dd:${d.id}`;
  };
  const node = (d: TreeItem) => {
    const url = itemIconUrl(version, d, all);
    return <><a className="item-tree-link" href={itemHref(targetFor(d))}><ItemIcon key={url ?? `unavailable:${version}:${d.id}`} url={url} /><span>{displayItemName(d.name.ja ?? d.name.en)}</span></a><span className="muted">ID {d.id}・{treePrice(d)}<br />SR：{d.maps["11"] === true ? "対応" : d.maps["11"] === false ? "非対応" : "不明"}／他モード：{Object.entries(d.maps).filter(([id, on]) => id !== "11" && on).map(([id]) => id).join("・") || "記録なし"}{!d.gold.purchasable && <><br />購入以外の取得・変化の条件は詳細を確認</>}{d.gold.base === 0 && !!d.from?.length && <><br />合成費用欄0：通常合成か特殊アップグレードかは未確認</>}</span></>;
  };
  const branch = (direction: "from" | "into") => {
    if (!current) return null;
    const nodes = relationNodes(current, direction, all);
    return nodes === null ? <p>この方向の合成情報は未収録です。</p> : nodes.length === 0 ? <p>Data Dragonに{direction === "from" ? "素材" : "上位合成先"}の登録はありません。特殊な変化も含めた全経路が存在しないという確認ではありません。</p> : <ul>{nodes.map((n) => <li key={n.id}>{n.target ? node(n.target) : <><a className="item-tree-link" href={itemHref(`dd:${n.id}`)}><ItemIcon url={null} /><span>ID {n.id}</span></a><span className="notice">{n.status === "missing" ? "参照先未収録" : "同じIDが複数あり対応未確認"}</span></>}{n.count > 1 && <strong>×{n.count}個</strong>}{n.cyclic && <span className="notice">循環・自己参照の記録あり。再帰展開しません。</span>}</li>)}</ul>;
  };
  return <section className="item-tree" aria-labelledby={heading}><h3 id={heading}>合成関係（Data Dragon {version}）</h3>
    <p className="muted">保存されたfrom／intoの1段を全件表示します。ノードを選ぶと、そのアイテムの詳細で続きを確認できます。記載のない逆引きやWiki旧レシピからは補完しません。矢印は取得データの関係で、通常購入の合成と条件付きの変化の区別は未確認です。</p>
    <p className="muted">アイコンは同じ版のRiot公式CDNから遅延読み込みします。画像を取得できない場合も、名前・価格・詳細リンクは利用できます。</p>
    {current ? <div className="item-tree-columns"><div><h4>素材（下位） →</h4>{branch("from")}</div><div><h4>選択中</h4><div className="item-tree-current">{node(current)}</div></div><div><h4>→ 上位候補</h4>{branch("into")}</div></div> : <p className="notice">公式データとの対応を安全に特定できないため、合成関係は確認待ちです。別アイテムの関係やWikiの旧レシピを流用しません。</p>}
  </section>;
}
