import { supabase } from '@/lib/supabase';
import { AppState } from 'react-native';

type SettingListener = (value: unknown) => void;
const listeners = new Map<string, Set<SettingListener>>();
const fallbacks = new Map<string, unknown>();
let realtimeStarted = false;

async function refreshSetting(key: string, fallback: unknown) {
  try {
    const { data, error } = await supabase.rpc('app_public_setting', { p_key: key });
    const value = !error && data != null ? data : fallback;
    listeners.get(key)?.forEach((listener) => listener(value));
  } catch {
    listeners.get(key)?.forEach((listener) => listener(fallback));
  }
}

function startLiveSettings() {
  if (realtimeStarted) return;
  realtimeStarted = true;
  supabase
    .channel('public-app-settings')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'admin_app_settings' }, (payload) => {
      const record = payload.new as { setting_key?: string; value?: unknown };
      if (record?.setting_key && record.value !== undefined) {
        listeners.get(record.setting_key)?.forEach((listener) => listener(record.value));
      }
    })
    .subscribe((status) => {
      // Re-fetch after reconnect to catch changes made while the app was offline.
      if (status === 'SUBSCRIBED') {
        listeners.forEach((_, key) => {
          void refreshSetting(key, fallbacks.get(key));
        });
      }
    });

  AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      listeners.forEach((_, key) => {
        void refreshSetting(key, fallbacks.get(key));
      });
    }
  });
}

export async function fetchAppSetting<T>(key: string, fallback: T): Promise<T> {
  try {
    const { data, error } = await supabase.rpc('app_public_setting', { p_key: key });
    if (error || data == null) return fallback;
    return data as T;
  } catch {
    return fallback;
  }
}

/** Loads a public setting and keeps its consumers current after dashboard edits. */
export function watchAppSetting<T>(key: string, fallback: T, listener: (value: T) => void): () => void {
  let callbacks = listeners.get(key);
  if (!callbacks) {
    callbacks = new Set<SettingListener>();
    listeners.set(key, callbacks);
  }
  fallbacks.set(key, fallback);
  const wrapped = listener as SettingListener;
  callbacks.add(wrapped);
  startLiveSettings();
  void refreshSetting(key, fallback);
  return () => {
    callbacks?.delete(wrapped);
    if (callbacks?.size === 0) {
      listeners.delete(key);
      fallbacks.delete(key);
    }
  };
}
