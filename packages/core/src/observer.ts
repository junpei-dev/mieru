/**
 * 観測地点の座標変換
 *
 * satellite.js は緯度経度をラジアン、高度をkmで受け取るので、
 * ObserverSite（度・メートル）との変換をここに集約する。
 */

import { degreesToRadians, geodeticToEcf, ecfToEci } from 'satellite.js';
import type { GeodeticLocation, GMSTime } from 'satellite.js';
import type { ObserverSite, Vec3 } from './types.js';

/** ObserverSite を satellite.js の GeodeticLocation（ラジアン・km）に変換する */
export function siteToGeodetic(site: ObserverSite): GeodeticLocation {
  return {
    longitude: degreesToRadians(site.longitudeDeg),
    latitude: degreesToRadians(site.latitudeDeg),
    height: site.altitudeM / 1000, // m → km
  };
}

/**
 * 観測地点の ECI 座標[km]を返す。
 *
 * 位相角（衛星から見て太陽と観測者がどれだけ離れているか）を求めるのに必要。
 * 地球は自転しているので、同じ地点でも時刻によって ECI 座標は変わる。
 * そのため GMST を引数に取る。
 */
export function siteToEci(site: ObserverSite, gmst: GMSTime): Vec3 {
  const ecf = geodeticToEcf(siteToGeodetic(site));
  return ecfToEci(ecf, gmst);
}
