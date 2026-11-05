/** Individually arranged from saved official descriptions, not current-game verification.
 * Exact version and both source texts guard against reusing stale summaries. */
const reviewed = [
  {
    "id": 8010,
    "en": "Basic attacks or spells that deal damage to an enemy champion grant 2 stacks of Conqueror for 5s, gaining 1.8-4 Adaptive Force per stack. Stacks up to 12 times. Ranged champions gain only 1 stack per basic attack.\nWhen fully stacked, heal for 8% of the damage you deal to champions (5% for ranged champions).",
    "ja": "敵チャンピオンにダメージを与える通常攻撃またはスキルで5秒間、「征服者」のスタックを2つ獲得する。スタック1つごとに1.8 - 4のアダプティブフォースを獲得する。最大12スタック。遠隔攻撃チャンピオンは通常攻撃1回につき1スタックのみ獲得する。\n最大スタック時にチャンピオンに与えたダメージの8%(遠隔攻撃チャンピオンは5%)の体力を回復する。",
    "facts": [
      [
        "スタック獲得",
        "敵チャンピオンにダメージを与える通常攻撃またはスキル"
      ],
      [
        "獲得数",
        "2スタック／遠隔の通常攻撃は1スタック"
      ],
      [
        "持続・上限",
        "5秒間／最大12スタック"
      ],
      [
        "スタック効果",
        "1スタックごとに1.8～4アダプティブフォース"
      ],
      [
        "最大スタック時",
        "対チャンピオンの与ダメージの8%を回復（遠隔：5%）"
      ]
    ]
  },
  {
    "id": 8345,
    "en": "Biscuit Delivery: Gain a Total Biscuit of Everlasting Will every 2 mins, until 6 min.\nBiscuits restore 20 + 2% of your maximum health, increased by up to 100% based on missing Health. Consuming or selling a Biscuit permanently increases your max health by 30.",
    "ja": "ビスケットデリバリー: 6分間、2分ごとに英気満点ビスケットを獲得する。\nビスケットは最大体力の20 + 2%を回復する。効果は自身の減少体力に応じて最大100%まで増加する。ビスケットを消費するか売却すると、恒久的に最大体力が30増加する。",
    "facts": [
      [
        "獲得タイミング",
        "6分経過まで2分ごとにビスケットを獲得"
      ],
      [
        "回復",
        "20 + 最大体力の2%（公式英語）"
      ],
      [
        "回復の増加",
        "自身の減少体力に応じて最大100%増加"
      ],
      [
        "消費・売却時",
        "最大体力が恒久的に30増加"
      ]
    ]
  },
  {
    "id": 8369,
    "en": "Attacks or abilities against an enemy champion within 0.25s of entering champion combat grant 10 gold and First Strike for 3 seconds, causing you to deal 7% extra  damage against champions, and granting 50% (35% for ranged champions) of bonus damage dealt as gold.\nCooldown: 25 - 15s",
    "ja": "チャンピオンと戦闘状態になってから、0.25秒以内に敵チャンピオンに通常攻撃またはスキルを命中させると10ゴールドを獲得する。さらに3秒間、「ファーストストライク」を獲得して、チャンピオンに7%の追加ダメージを与えるようになり、与えた追加ダメージの50%(遠隔攻撃チャンピオンは35%)にあたるゴールドを獲得する。\nクールダウン: 25 - 15秒",
    "facts": [
      [
        "発動条件",
        "チャンピオンとの戦闘開始から0.25秒以内に通常攻撃かスキルを命中"
      ],
      [
        "獲得・持続",
        "10ゴールド／効果は3秒間"
      ],
      [
        "追加ダメージ",
        "チャンピオンに7%"
      ],
      [
        "追加ゴールド",
        "追加ダメージの50%（遠隔：35%）"
      ],
      [
        "クールダウン",
        "25～15秒"
      ]
    ]
  },
  {
    "id": 9923,
    "en": "Gain 90% (60% for ranged champions) Attack Speed and bonus true damage when you attack an enemy champion for up to 3 attacks.\nNo more than 3s can elapse between attacks or this effect will end.\nCooldown: 10s.\nOn-Hit Damage: 2 - 20 (+0.12 bonus AD, +0.1 AP) damage.\nAttack resets increase the attack limit by 1.\nAllows you to temporarily exceed the Attack Speed limit.",
    "ja": "敵チャンピオンに通常攻撃する際、最大3回の通常攻撃の攻撃速度が90%(遠距離チャンピオンは60%)増加し、追加確定ダメージを獲得する。\n通常攻撃の間隔が3秒以上開くとこの効果は終了する。\nクールダウン: 10秒\n通常攻撃時のダメージ: 2 - 20 (+増加攻撃力0.12、+魔力0.1)のダメージ\n攻撃のモーションをキャンセルした場合、回数制限が1増加する。\nこの効果は一時的に攻撃速度の上限を超えられる。",
    "facts": [
      [
        "発動条件",
        "敵チャンピオンに通常攻撃"
      ],
      [
        "攻撃速度",
        "近接：+90%／遠隔：+60%（自分の攻撃タイプ）"
      ],
      [
        "攻撃回数",
        "発動する攻撃を含め最大3回"
      ],
      [
        "終了条件",
        "公式日本語：攻撃間隔が3秒以上開くと終了"
      ],
      [
        "クールダウン",
        "10秒"
      ],
      [
        "追加効果",
        "通常攻撃に追加確定ダメージ／一時的に攻撃速度上限を超えられる"
      ]
    ]
  }
] as const;
export function runeHighlights(id: number, version: string, text: { en: string | null; ja: string | null }) {
  if (version !== "16.21.1") return null;
  return reviewed.find(r => r.id === id && r.en === text.en && r.ja === text.ja) ?? null;
}
