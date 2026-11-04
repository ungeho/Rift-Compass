// SK-1: 保存原典を個別に整理した3例。自動抽出・現行仕様の認定ではない。
import type { WikiAbilityTemplate } from './wikiAbility';

interface BehaviorSource { raw: string; plain?: string; source_sha1?: string; plain_sha1?: string }
export interface SkillBehavior {
  champion: string; title: string; slot: string; snapshot: string; checked: string; sourceUrl: string; sourceModified: string | null;
  sources: Record<string, BehaviorSource>;
  rows: { label: string; condition: string; event: string; result: string; constraint: string; refs: string[] }[];
}

export const SKILL_BEHAVIORS: SkillBehavior[] = [
  {
    "champion": "Annie",
    "title": "Template:Data Annie/Pyromania",
    "slot": "I",
    "snapshot": "2026-11-02",
    "checked": "2026-11-04",
    "sourceUrl": "https://wiki.leagueoflegends.com/en-us/Template:Data_Annie/Pyromania",
    "sourceModified": "Fri, 18 Jul 2025 21:06:25 GMT",
    "sources": {
      "description": {
        "raw": "{{sbc|Innate - Pyromania:}} '''Annie''' generates a {{tip|stack}} of ''Pyromania'' whenever she hits an enemy with ''{{ai|Disintegrate|Annie}}'' or casts her other {{tip|abilities}}, stacking up to 4 times, at which she gains ''Energized''.",
        "plain": "Innate - Pyromania: Annie generates a stack of Pyromania whenever she hits an enemy with Disintegrate or casts her other abilities, stacking up to 4 times, at which she gains Energized.",
        "source_sha1": "4f554aad283280874c574a32f78cf159dfe0cd07",
        "plain_sha1": "3dfefa0e6121443976a8ce93baaf1b04fcfac89e"
      },
      "description2": {
        "raw": "{{sbc|Energized:}} '''Annie''' empowers her next cast of ''{{ai|Disintegrate|Annie}}'', ''{{ai|Incinerate|Annie}}'', or ''{{ai|Summon: Tibbers|Annie}}'' to consume all ''Pyromania'' stacks to {{tip|stun}} enemies hit for {{pp|1.25;1.5;1.75|1;6;11}} seconds.",
        "plain": "Energized: Annie empowers her next cast of Disintegrate, Incinerate, or Summon: Tibbers to consume all Pyromania stacks to stun enemies hit for 1.25 / 1.5 / 1.75 (based on level) seconds.",
        "source_sha1": "13605c2691a0208b57ffa13a411746a2d77a8bf8",
        "plain_sha1": "42ad59e7dd96ad346ee15e5da283dd08b2b95c49"
      },
      "tips": {
        "raw": "* The stun applies to the first ability that lands when the stun is available. If you cast {{ai|Disintegrate|Annie}} followed by {{ai|Incinerate|Annie}} while the stun is available and ''Incinerate'' lands first, the stun will be applied through ''Incinerate''.\n<!-- Blurb -->"
      },
      "description3": {
        "raw": "'''Annie''' gains maximum stacks of ''Pyromania'' when the game starts and upon [[death|respawning]]. She will lose ''Energized'' and all ''Pyromania'' stacks upon [[death]].",
        "plain": "Annie gains maximum stacks of Pyromania when the game starts and upon respawning. She will lose Energized and all Pyromania stacks upon death.",
        "source_sha1": "8d1fd3f3d58d9786f1884a74c04f2e0155b97182",
        "plain_sha1": "722abb3c0b7371ba9c88bc2dd7399186309ccbc5"
      },
      "notes": {
        "raw": "* '''Annie''' does not lose any stacks upon entering or exiting {{tip|resurrection}}.\n* Stacks are gained even if the ability is blocked by {{tip|spell shield}}.\n* ''Pyromania's'' current stacks are represented by a counter under '''Annie's''' [[health bar]], visible to all players. It lights up when the empowered effect is available."
      }
    },
    "rows": [
      {
        "label": "Qと他スキルの獲得条件",
        "condition": "敵へのQ（Disintegrate）と、その他のスキルを区別。",
        "event": "Qが敵に命中／その他のスキルを使用。",
        "result": "Pyromaniaを1スタック獲得。4スタックでEnergizedになる。",
        "constraint": "Qは使用だけではなく命中が条件。その他は使用が条件と記載。",
        "refs": [
          "description"
        ]
      },
      {
        "label": "強化状態からの消費",
        "condition": "Energizedを獲得している。",
        "event": "次のQ・W（Incinerate）・R（Summon: Tibbers）の使用。",
        "result": "全スタックを消費し、命中した敵をスタンさせる。",
        "constraint": "Eは消費対象の列挙に含まれない。スタン時間のレベル別数値は元の説明を参照。",
        "refs": [
          "description2"
        ]
      },
      {
        "label": "使用順と命中順",
        "condition": "スタンが利用可能な状態でQの後にWを使い、Wが先に命中する例。",
        "event": "先にWが命中。",
        "result": "tipsではWからスタンが適用されると記載。",
        "constraint": "本文の「次の使用」とtipsの「先に命中」を同じイベントに統合しない。複数スキルが飛んでいる場合の処理全体はゲーム内未検証。",
        "refs": [
          "tips"
        ]
      },
      {
        "label": "開始・死亡・復活",
        "condition": "ゲーム開始、死亡、リスポーン、resurrection（蘇生）を区別。",
        "event": "開始／リスポーン時、死亡時、蘇生への出入り。",
        "result": "開始・リスポーンで最大スタック。死亡で全スタックとEnergizedを失う。notesでは蘇生への出入りでは失わない。",
        "constraint": "死亡と蘇生の記述を同一視しない。",
        "refs": [
          "description3",
          "notes"
        ]
      },
      {
        "label": "スペルシールド",
        "condition": "獲得条件を満たすスキルがスペルシールドで防がれた場合。",
        "event": "スキルが防がれる。",
        "result": "notesではスタックは獲得すると記載。",
        "constraint": "これは獲得についての記述。防がれた敵にスタンが通るという意味ではない。",
        "refs": [
          "notes"
        ]
      }
    ]
  },
  {
    "champion": "Veigar",
    "title": "Template:Data Veigar/Phenomenal Evil Power",
    "slot": "I",
    "snapshot": "2026-11-02",
    "checked": "2026-11-04",
    "sourceUrl": "https://wiki.leagueoflegends.com/en-us/Template:Data_Veigar/Phenomenal_Evil_Power",
    "sourceModified": "Sat, 19 Jul 2025 01:59:15 GMT",
    "sources": {
      "description": {
        "raw": "{{sbc|Innate:}} '''Veigar''' generates a {{tip|stack}} of ''Phenomenal Evil'' for each enemy {{tip|champion}} hit by his {{tip|abilities}}, and 5 stacks whenever he scores an enemy champion {{tip|takedown}}.",
        "plain": "Innate: Veigar generates a stack of Phenomenal Evil for each enemy champion hit by his abilities, and 5 stacks whenever he scores an enemy champion takedown.",
        "source_sha1": "048d52ae122346185124980c76a51428f47e19e6",
        "plain_sha1": "1693e9f48844f98f4f07a5f3e19cd56343a85a4d"
      },
      "description2": {
        "raw": "{{sbc|Phenomenal Evil:}} For each stack, '''Veigar''' gains {{sti|AP|{{as|1 ability power}}}}.",
        "plain": "Phenomenal Evil: For each stack, Veigar gains 1 ability power.",
        "source_sha1": "1878ca4eb602b46fa0ab8cc45b835f1070760796",
        "plain_sha1": "fee79326048b81577f827a922d6e382e8c9a193a"
      },
      "notes": {
        "raw": "* The two effects stack, granting 6 stacks for each enemy champion taken down by an ability, 7 with {{ai|Baleful Strike|Veigar}}.\n* '''Veigar's''' abilities do not have to deal damage nor affect their targets to grant a stack."
      }
    },
    "rows": [
      {
        "label": "命中による獲得",
        "condition": "対象は敵チャンピオン。",
        "event": "スキルが命中する。",
        "result": "命中した敵チャンピオンごとに1スタック獲得。",
        "constraint": "使用だけで獲得するとは記載されていない。この条件をミニオン・モンスターへ拡張しない。",
        "refs": [
          "description"
        ]
      },
      {
        "label": "テイクダウンによる獲得",
        "condition": "敵チャンピオンのテイクダウン（キル／アシスト）。",
        "event": "テイクダウンを獲得。",
        "result": "5スタック獲得。",
        "constraint": "命中による獲得とは別の条件。Q固有の撃破スタックはこのパッシブだけから推測しない。",
        "refs": [
          "description"
        ]
      },
      {
        "label": "獲得したスタックの結果",
        "condition": "Phenomenal Evilのスタックを保有。",
        "event": "スタックを獲得。",
        "result": "1スタックにつき魔力1を獲得。",
        "constraint": "notesではダメージを与えたり対象に効果を及ぼしたりする必要はないと記載。命中条件を「使用するだけ」へ置き換えるものではない。",
        "refs": [
          "description2",
          "notes"
        ]
      }
    ]
  },
  {
    "champion": "Riven",
    "title": "Template:Data Riven/Runic Blade",
    "slot": "I",
    "snapshot": "2026-11-02",
    "checked": "2026-11-04",
    "sourceUrl": "https://wiki.leagueoflegends.com/en-us/Template:Data_Riven/Runic_Blade",
    "sourceModified": "Fri, 30 Oct 2026 14:54:09 GMT",
    "sources": {
      "description": {
        "raw": "{{sbc|Innate:}} '''Riven's''' {{tip|ability}} casts generate a {{tip|stack}} of ''Charge'' for 6 seconds, refreshing on subsequent casts and stacking up to 3 times. '''Riven's''' {{tip|basic attacks}} {{tip|on-attack}} are empowered to each consume a stack {{tip|on-hit}} to deal {{as|'''bonus''' physical damage}} equal to {{as|{{pp|key=%|30 + (45-30)/17*(x-1) for 20}} AD}}, reduced to{{ft|50%|{{as|{{pp|key=%|(30 + (45-30)/17*(x-1))*0.5 for 20|formula=50% of non-structure damage}} AD}}}}against {{tip|structures}}. Against {{tip|monsters}}, it also deals {{as|50 '''additional bonus''' physical damage|physical damage}}.",
        "plain": "Innate: Riven's ability casts generate a stack of Charge for 6 seconds, refreshing on subsequent casts and stacking up to 3 times. Riven's basic attacks on-attack are empowered to each consume a stack on-hit to deal bonus physical damage equal to 30% – 46.76% (based on level) AD, reduced to 50% against structures. Against monsters, it also deals 50 additional bonus physical damage.",
        "source_sha1": "68968f4cea113264ee7757d61a03843ff856f613",
        "plain_sha1": "a1dd5446b20d876a169395fd958447e08003fc15"
      },
      "notes": {
        "raw": "* ''Runic Blade's'' duration also refreshes when '''Riven''' consumes a stack.\n* The empowered attack will not trigger against {{tip|wards}}.\n* The number of empowered attacks available is represented by a counter under her [[health bar]], only visible to the player.\n* The bonus damage to monsters also benefits from critical strike modifiers. The full formula is shown below.\n** <code>({{fd|1.0}} AD{{times}}(1 + AD ratio) + monster damage){{times}}(100%{{times}}critical damage)</code>"
      },
      "description2": {
        "raw": "The '''bonus''' damage is affected by {{tip|critical strike}} modifiers and {{tip|applies lifesteal|applies}} {{as|{{sti|life steal}}}} at 100% effectiveness.",
        "plain": "The bonus damage is affected by critical strike modifiers and applies life steal at 100% effectiveness.",
        "source_sha1": "608bd04fc91c71ba4e71b86286ecd771c7582083",
        "plain_sha1": "4c343a87d94f362b8875879053b1ed3f93003a70"
      }
    },
    "rows": [
      {
        "label": "使用による獲得",
        "condition": "スキルの使用。",
        "event": "スキルを使用する。",
        "result": "Chargeを1スタック獲得。上限3、持続6秒。",
        "constraint": "命中ではなく使用が条件。追加の使用で持続時間が更新される。",
        "refs": [
          "description"
        ]
      },
      {
        "label": "通常攻撃での消費",
        "condition": "Chargeを保有して通常攻撃する。",
        "event": "攻撃開始時に強化され、命中時に1スタックを消費。",
        "result": "追加物理ダメージを与える。",
        "constraint": "notesでは消費でも持続時間が更新される。攻撃開始と命中時の消費を区別する。",
        "refs": [
          "description",
          "notes"
        ]
      },
      {
        "label": "対象ごとの差",
        "condition": "建造物・モンスター・ワードを区別。",
        "event": "強化通常攻撃を対象へ行う。",
        "result": "建造物への追加ダメージは50%に減少。モンスターには追加分がある。",
        "constraint": "notesではワードに強化攻撃は発動しない。数値の詳細は元の説明を参照。",
        "refs": [
          "description",
          "notes"
        ]
      },
      {
        "label": "追加ダメージの扱い",
        "condition": "追加ダメージが発生する場合。",
        "event": "強化攻撃が命中。",
        "result": "クリティカル補正の影響を受け、ライフスティールを100%の効率で適用。",
        "constraint": "これは保存説明の記載。通常攻撃全体や他の効果の仕様まで確定するものではない。",
        "refs": [
          "description2"
        ]
      }
    ]
  }
];

export function skillBehaviorFor(t: WikiAbilityTemplate) {
  const record = SKILL_BEHAVIORS.find(r => r.title === t.title);
  if (!record) return null;
  const matches = t.source.status === 200 && !t.redirect_to && t.slot === record.slot && t.source.url === record.sourceUrl && t.source.last_modified === record.sourceModified && Object.entries(record.sources).every(([key, src]) =>
    t.params?.[key] === src.raw && (src.plain === undefined || (t.text?.[key]?.plain === src.plain && !t.text[key].residual && t.text[key].source_sha1 === src.source_sha1 && t.text[key].plain_sha1 === src.plain_sha1)));
  return { record, matches };
}
