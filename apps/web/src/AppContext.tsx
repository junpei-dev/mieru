/**
 * アプリ全体で共有する状態
 *
 * 地点と予報だけなので、Redux 等は不要。Context で十分。
 * 予報の取得はここで1回だけ行い、全画面で使い回す。
 */

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { defaultSite, findSite } from '@mieru/core';
import type { ObserverSite } from '@mieru/core';
import { loadSettings, saveSettings, type Settings } from './lib/storage.js';
import { useForecast, type ForecastState } from './hooks/useForecast.js';

interface AppContextValue extends ForecastState {
  site: ObserverSite;
  threshold: number;
  setSiteId: (siteId: string) => void;
  setThreshold: (threshold: number) => void;
}

const Context = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(() => loadSettings());

  const site = useMemo(
    () => findSite(settings.siteId) ?? defaultSite(),
    [settings.siteId],
  );

  const forecast = useForecast(site);

  const update = useCallback((patch: Partial<Settings>) => {
    setSettings((previous) => {
      const next = { ...previous, ...patch };
      saveSettings(next);
      return next;
    });
  }, []);

  const value = useMemo<AppContextValue>(
    () => ({
      ...forecast,
      site,
      threshold: settings.threshold,
      setSiteId: (siteId: string) => update({ siteId }),
      setThreshold: (threshold: number) => update({ threshold }),
    }),
    [forecast, site, settings.threshold, update],
  );

  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useApp(): AppContextValue {
  const value = useContext(Context);
  if (!value) throw new Error('AppProvider の外で useApp が呼ばれました');
  return value;
}
