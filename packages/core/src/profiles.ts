/**
 * 衛星の背景情報
 *
 * 「空の光る点」を「意味のあるもの」に変えるための文章。
 *
 * 見えること自体は面白いが、それが何のために飛んでいるかを知ると
 * 見え方が変わる。ISSなら「あの光の中に人がいる」、
 * BlueBirdなら「スマホが直接つながる基地局で、だから巨大で、だから明るい」。
 *
 * 内容は事実に基づくこと。推測や誇張を混ぜると、
 * 授業や家族への説明にそのまま使われてしまう。
 */

import type { SatelliteKind } from './types.js';

export interface SatelliteProfile {
  /** 一言での説明。カードの見出しに使う */
  headline: string;
  operator: string;
  /** 運用開始の時期 */
  since: string;
  size: string;
  orbit: string;
  /** 何のために飛んでいるか */
  purpose: string[];
  /** 見上げるときに知っていると面白い話 */
  trivia: string;
  /**
   * 考える余地のある論点。
   * 「便利さと引き換えに何を失うか」は、情報科の教材としてそのまま使える。
   */
  discussion?: string;
}

const ISS_PROFILE: SatelliteProfile = {
  headline: '人が住んでいる、地球をまわる実験施設',
  operator: 'アメリカ・ロシア・日本・欧州・カナダの共同運用',
  since: '1998年に組み立て開始、2000年から人が住み続けている',
  size: '約109m × 73m（サッカー場ほど）／約420トン',
  orbit: '高度約400km・約90分で地球を1周（1日に約16周）',
  purpose: [
    '重力がほとんど効かない環境でしかできない実験をする（新薬の結晶づくり、新しい材料の開発、生物が重力をどう感じているかの研究）',
    '人が宇宙で長く暮らすための技術を確かめる。月や火星へ行くための準備でもある',
    '地球を継続的に観測し、災害や気候の変化を記録する',
  ],
  trivia:
    '日本の実験棟「きぼう」がつながっています。いま見えているあの光の中に、常に数人が滞在しています。',
  discussion:
    '2030年ごろに運用を終える予定です。そのあとは制御しながら大気圏に落とされます。',
};

const CSS_PROFILE: SatelliteProfile = {
  headline: '中国が単独で建てた宇宙ステーション',
  operator: '中国（中国載人航天工程弁公室）',
  since: '2021年に中核モジュール「天和」を打ち上げ、2022年に完成',
  size: '約55m・約100トン（ISSのおよそ4分の1）',
  orbit: '高度約390〜450km・軌道傾斜角41.5°（日本全域の上空を通る）',
  purpose: [
    '無重力環境での科学実験。ISSとは別に、独自の実験設備を持っている',
    '宇宙飛行士3人が交代で長期滞在し、宇宙での生活技術を蓄積する',
    '大型の宇宙望遠鏡を併走させ、天文観測の拠点にする計画がある',
  ],
  trivia:
    'ISSに次いで明るい有人施設です。ISSほどではありませんが木星くらいの明るさになり、肉眼ではっきり見えます。',
};

const BLUEBIRD_PROFILE: SatelliteProfile = {
  headline: '普通のスマホと直接つながる、空に浮かぶ携帯基地局',
  operator: 'AST SpaceMobile（アメリカ）',
  since: '2022年に試験機、2024年から実用機の打ち上げを開始',
  size: 'アンテナ面積 約64〜223m²（テニスコートほどの平面）',
  orbit: '高度約500〜530km・軌道傾斜角53°',
  purpose: [
    '専用の機器を使わず、手持ちのスマートフォンがそのまま衛星とつながるようにする',
    '電波塔を建てられない山間部・離島・海上でも通信できるようにする',
    '災害で地上の基地局が壊れたときの通信手段として使う',
  ],
  trivia:
    '明るい理由がそのまま用途の説明になっています。スマホの弱い電波を拾うために巨大な平面アンテナが必要で、その平面が鏡のように太陽光を反射するため、人工衛星としては異例の明るさになります。',
  discussion:
    '明るすぎることが問題にもなっています。天文学者からは「望遠鏡の観測に筋状の光が写り込み、夜空の観測を妨げる」として懸念が示されています。通信の便利さと、夜空という共有物をどう両立させるか。答えの出ていない論点です。',
};

const STARLINK_TRAIN_PROFILE: SatelliteProfile = {
  headline: '打ち上げ直後だけ見られる、数珠つなぎの衛星の列',
  operator: 'SpaceX（アメリカ）',
  since: '2019年から打ち上げが続いている',
  size: '1機あたり数百kg。1回の打ち上げで数十機をまとめて放出する',
  orbit: '放出直後は高度約300km。その後それぞれが約550kmまで自力で上がっていく',
  purpose: [
    '地上に光ファイバーを引けない場所へインターネットを届ける',
    '船舶・航空機・被災地など、移動する場所や臨時の場所への通信',
  ],
  trivia:
    '「トレイン」と呼ばれる数珠つなぎの行列が見えるのは、放出直後でまだ間隔が開いていない、打ち上げから数日〜2週間ほどの間だけです。それを過ぎると散らばり、高度も上がって暗くなります。',
  discussion:
    '運用高度に達した衛星には遮光対策が施されており、肉眼ではほとんど見えません。このアプリが通知するのもトレイン期だけです。',
};

const PROFILES: Record<SatelliteKind, SatelliteProfile> = {
  iss: ISS_PROFILE,
  css: CSS_PROFILE,
  bluebird: BLUEBIRD_PROFILE,
  'starlink-train': STARLINK_TRAIN_PROFILE,
  'starlink-operational': STARLINK_TRAIN_PROFILE,
};

export function satelliteProfile(kind: SatelliteKind): SatelliteProfile {
  return PROFILES[kind];
}

/**
 * 表示名から種別を推定する。
 *
 * 予報JSONには表示名しか残らない（種別まで持たせるとJSONが膨らむ）ため、
 * 読み出し側ではここで引き直す。
 */
export function kindFromDisplayName(displayName: string): SatelliteKind | null {
  if (displayName.includes('国際宇宙ステーション')) return 'iss';
  if (displayName.includes('天宮')) return 'css';
  if (displayName.startsWith('BlueBird')) return 'bluebird';
  if (displayName.includes('Starlink')) return 'starlink-train';
  return null;
}

/** 表示名から背景情報を引く。未知の衛星は null */
export function profileForDisplayName(
  displayName: string,
): SatelliteProfile | null {
  const kind = kindFromDisplayName(displayName);
  return kind ? satelliteProfile(kind) : null;
}
