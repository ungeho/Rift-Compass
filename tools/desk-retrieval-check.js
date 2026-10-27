// Phase 0 の机上検索照合（ランキングではなく、検索語が各方式のフィールドに現れるかの到達可否チェック）
// 使い方: node tools/desk-retrieval-check.js [data/sample-resources.json]
// 方式・質問・限界は docs/retrieval-evaluation.md を参照。依存パッケージなし。
const path = require("path");
const d=require(path.resolve(process.argv[2] || path.join(__dirname, "..", "data", "sample-resources.json")));
const T=Object.fromEntries(d.topics.map(t=>[t.id,t]));
const lc=s=>(s||"").toLowerCase();
// topic text by level
const topicA=t=>[t.label_ja,t.label_en].join(" ");
const topicB=t=>[topicA(t),...t.aliases_ja,...t.aliases_en].join(" ");
const notesByRes={};
d.evidence.forEach(e=>{const n=d.knowledge_notes.find(n=>n.id===e.note_id);(notesByRes[e.resource_id]=notesByRes[e.resource_id]||[]).push(n.statement_ja+" "+(e.locator&&e.locator.label||""))});
const fieldsA=r=>[r.title,r.creator.name,...r.topic_ids.map(i=>topicA(T[i]))].join(" ");
const fieldsB=r=>[fieldsA(r),r.summary_ja,...r.topic_ids.map(i=>topicB(T[i]))].join(" ");
const fieldsC=r=>[fieldsB(r),...(r.segments||[]).map(s=>s.label),...(notesByRes[r.id]||[])].join(" ");
// q: [id, question, keyword groups (all groups must match; any term within a group), expected resource ids]
const Q=[
["Q01","敵のスキルを避けた後に仕掛ける理由を知りたい",[["仕掛け","トレード","trade"],["CD","クールダウン","cooldown","スキルが落ち"]],["res-metabot-trading-2026","res-wiki-cooldown"]],
["Q02","Lv2先行が有利になる条件は？",[["Lv2","レベル2","level 2"]],["res-wiki-experience","res-metabot-trading-2026"]],
["Q03","level 2 how many minions bot lane",[["level 2","lv2","レベル2"],["minion","ミニオン"]],["res-wiki-experience"]],
["Q04","Dopaの古いウェーブ管理を学びたい",[["dopa"],["wave","ウェーブ"]],[]],
["Q05","VeigarV2のリコール解説はどこ？",[["veigar v2","veigarv2"],["recall","リコール"]],["res-yt-veigarv2-recall-timer","res-yt-veigarv2-coaching-ruu"]],
["Q06","昔の視界管理の知識は今も利用できる？",[["視界","ワード","ward","vision"],["昔","歴史","season","2014","旧"]],["res-engadget-wards-2014","res-wiki-v3-14","res-wiki-sight-ward"]],
["Q07","特定チャンピオンの対面別ビルドを知りたい（ベイガー）",[["veigar","ベイガー"],["build","ビルド","matchup"]],["res-yt-veigarv2-veigar-guide-s16"]],
["Q08","ジャックスのEに通常攻撃が当たらないときどうする？",[["jax","ジャックス"],["回避","通常攻撃","dodge","aa"]],["res-wiki-jax"]],
["Q09","AA無効化されたらスキルで殴るべき？",[["AA無効","回避","ブラインド","blind","dodge"]],["res-wiki-cc-types","res-wiki-jax"]],
["Q10","how to freeze a lane",[["freeze","フリーズ"]],["res-dignitas-freeze-advanced","res-dignitas-wave-2019","res-loltheory-wave-2026","res-wiki-minion"]],
["Q11","ミニオンのタゲの仕組み",[["タゲ","アグロ","aggro"]],["res-wiki-minion","res-yt-veigarv2-minion-aggro"]],
["Q12","イグナイトとバリアどっちが生存しやすい？",[["イグナイト","ignite","バリア","barrier","サモスペ"]],["res-wiki-summoner-spell"]],
["Q13","プロのビルドを真似していい？",[["プロ","pro"],["ビルド","build","item","アイテム"]],["res-yt-veigarv2-pro-items"]],
["Q14","フラッシュのCDは昔と同じ？",[["フラッシュ","flash"]],["res-wiki-flash","res-wiki-summoner-spell"]],
["Q15","トリンケットはいつ導入された？",[["トリンケット","trinket"]],["res-wiki-trinket","res-wiki-v3-14"]],
["Q16","ミッドレーナーとしてインベードを防ぎたい",[["インベード","invade"]],["res-yt-dopaenglish-teacher-2"]],
["Q17","snowball after winning lane",[["snowball","スノーボール"]],["res-yt-dopaenglish-teacher-1"]],
["Q18","パッチノートの読み方",[["パッチノート","patch notes"]],["res-yt-veigarv2-patch-notes","res-riot-patch-notes-ja"]],
["Q19","ヘイストでCDはどれくらい短くなる？",[["ヘイスト","haste","CDR"]],["res-wiki-haste"]],
["Q20","ジャングラーとして敵のサモスペを追跡する方法",[["サモスペ","summoner"],["ジャングル","jungle","ジャングラー"]],["res-yt-veigarv2-jungle-decisions"]],
["Q21","Faker wave control",[["faker"],["wave","ウェーブ"]],["res-yt-veigarv2-faker-waves"]],
["Q22","スロープッシュとファストプッシュの違い",[["スロープッシュ","slow push"]],["res-loltheory-wave-2026","res-dignitas-wave-2019"]],
["Q23","日本語でLoLの基本を知りたい",[["基本","基礎","basics"]],["res-riot-how-to-play-ja","res-gamewatch-soraka-2"]],
["Q24","Dopa TF 解説 日本語",[["dopa"],["tf","フェイト","twisted"]],["res-yt-alliyan-dopa-tf-2019"]],
];
const has=(txt,groups)=>groups.every(g=>g.some(k=>lc(txt).includes(lc(k))));
const rows=[];const fieldsT=r=>r.title||"";
for(const [id,q,g,exp] of Q){
  const hit=f=>d.resources.filter(r=>has(f(r),g)).map(r=>r.id);
  const T0=hit(fieldsT),A=hit(fieldsA),B=hit(fieldsB),C=hit(fieldsC);
  const rec=(h)=>exp.length?exp.filter(e=>h.includes(e)).length+"/"+exp.length:"-";
  rows.push({id,title:rec(T0)+" ("+T0.length+")",A:rec(A)+" ("+A.length+")",B:rec(B)+" ("+B.length+")",C:rec(C)+" ("+C.length+")"});
}
console.table(rows);
