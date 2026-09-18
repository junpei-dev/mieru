/**
 * 衛星カタログの解決テスト
 *
 * ここは「間違っても例外が出ない」種類のバグが出る場所なので、
 * 実際に踏んだ失敗を回帰テストとして固定しておく。
 */

import { describe, expect, it } from 'vitest';
import {
  blueBirdSpec,
  isPayloadName,
  resolveSatelliteSpec,
  ISS,
  ISS_NORAD_ID,
  CSS,
  CSS_NORAD_ID,
  TRACKED_SOURCES,
} from '../src/satellites.js';
import { apparentMagnitude } from '../src/magnitude.js';

describe('isPayloadName', () => {
  it('衛星本体を通す', () => {
    expect(isPayloadName('SPACEMOBILE-013')).toBe(true);
    expect(isPayloadName('ISS (ZARYA)')).toBe(true);
    expect(isPayloadName('CSS (TIANHE)')).toBe(true);
  });

  it('デブリとロケット機体を弾く', () => {
    // 実際に CelesTrak が返してきた名前。
    // これを衛星本体として扱うと、高度450kmの小片を
    // 「0等級で肉眼で見えます」と予報してしまう
    expect(isPayloadName('SPACEMOBILE-001 DEB')).toBe(false);
    expect(isPayloadName('SPACEMOBILE-005 DEB')).toBe(false);
    expect(isPayloadName('FALCON 9 R/B')).toBe(false);
    expect(isPayloadName('CZ-5B DEBRIS')).toBe(false);
  });
});

describe('resolveSatelliteSpec', () => {
  it('ISSと天宮をIDで解決する', () => {
    expect(resolveSatelliteSpec(ISS_NORAD_ID, 'ISS (ZARYA)')).toBe(ISS);
    expect(resolveSatelliteSpec(CSS_NORAD_ID, 'CSS (TIANHE)')).toBe(CSS);
  });

  it('BlueBirdを名前で解決する（IDは打ち上げごとに変わるため）', () => {
    const spec = resolveSatelliteSpec('100240', 'SPACEMOBILE-013');
    expect(spec).not.toBeNull();
    expect(spec?.kind).toBe('bluebird');
    expect(spec?.displayName).toBe('BlueBird 13号機');
  });

  it('デブリは解決せず null を返す', () => {
    expect(resolveSatelliteSpec('62369', 'SPACEMOBILE-001 DEB')).toBeNull();
  });

  it('未知の衛星に ISS の等級を流用しない', () => {
    // 以前はここで ISS を返しており、暗い衛星が
    // 「金星より明るい」と予報される原因になっていた
    const spec = resolveSatelliteSpec('99999', 'SOME UNKNOWN SAT');
    expect(spec).toBeNull();
  });
});

describe('blueBirdSpec', () => {
  it('006号機以降を Block 2（より明るい）として扱う', () => {
    const block1 = blueBirdSpec('61047', 'SPACEMOBILE-001');
    const block2 = blueBirdSpec('100240', 'SPACEMOBILE-013');
    // 等級は小さいほど明るい
    expect(block2.standardMagnitude).toBeLessThan(block1.standardMagnitude);
  });

  it('機番が読めない場合は暗いほう（Block 1）に倒す', () => {
    // 明るく見積もって「見えます」と誤通知するほうが害が大きい
    const unknown = blueBirdSpec('99999', 'SPACEMOBILE');
    const block1 = blueBirdSpec('61047', 'SPACEMOBILE-001');
    expect(unknown.standardMagnitude).toBe(block1.standardMagnitude);
  });

  it('天頂通過時に肉眼等級の範囲に収まる', () => {
    const sunlit = { state: 'sunlit' as const, sunlitFraction: 1 };
    // Block 2 を高度527kmの天頂で、位相角60°（照らされ率0.75）として評価
    const spec = blueBirdSpec('100240', 'SPACEMOBILE-013');
    const mag = apparentMagnitude(
      spec.standardMagnitude,
      527,
      Math.PI / 3,
      sunlit,
    );
    expect(mag).not.toBeNull();
    // 報告されている「郊外の空で肉眼で見える明るさ」と整合する範囲
    expect(mag!).toBeGreaterThan(-2);
    expect(mag!).toBeLessThan(1.5);
  });
});

describe('TRACKED_SOURCES', () => {
  it('ISSだけが必須で、他は欠けても予報を続けられる', () => {
    const required = TRACKED_SOURCES.filter((source) => source.required);
    expect(required).toHaveLength(1);
    expect(required[0]?.id).toBe('iss');
  });

  it('BlueBirdは名前で問い合わせる（IDが増え続けるため）', () => {
    const bluebird = TRACKED_SOURCES.find((source) => source.id === 'bluebird');
    expect(bluebird?.query.type).toBe('name');
  });
});
