import { getDatabase } from "../db.ts";

// ---------------------------------------------------------------------------
// Plugin KV storage
// ---------------------------------------------------------------------------

export function pluginStorageGet(pluginId: string, key: string): string | null {
  const db = getDatabase();
  const row = db
    .prepare("SELECT value FROM plugin_storage WHERE plugin_id = ? AND key = ?")
    .get(pluginId, key) as { value: string } | null;
  return row?.value ?? null;
}

export function pluginStorageSet(pluginId: string, key: string, value: string): void {
  const db = getDatabase();
  db.prepare(
    `INSERT INTO plugin_storage (plugin_id, key, value, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(plugin_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
  ).run(pluginId, key, value, Math.floor(Date.now() / 1000));
}

export function pluginStorageDelete(pluginId: string, key: string): void {
  const db = getDatabase();
  db.prepare("DELETE FROM plugin_storage WHERE plugin_id = ? AND key = ?").run(pluginId, key);
}

export function pluginStorageHas(pluginId: string, key: string): boolean {
  const db = getDatabase();
  const row = db
    .prepare("SELECT 1 FROM plugin_storage WHERE plugin_id = ? AND key = ?")
    .get(pluginId, key);
  return row !== null && row !== undefined;
}
