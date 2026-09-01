// إدارة قائمة مفاتيح الـ API المخزّنة في Cloudflare KV
// كل مفتاح: { id, name, baseUrl, apiKey, model, enabled }

const KEYS_STORAGE_KEY = 'api_keys';

export async function getKeys(env) {
  if (!env.CHAT_KV) return [];
  const raw = await env.CHAT_KV.get(KEYS_STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function saveKeys(env, keys) {
  await env.CHAT_KV.put(KEYS_STORAGE_KEY, JSON.stringify(keys));
}

// إخفاء أغلب المفتاح ولا نعرض غير أول وآخر 4 خانات
export function maskKey(key) {
  if (!key || typeof key !== 'string') return '****';
  if (key.length <= 8) return '••••••••';
  return `${key.slice(0, 4)}••••••••${key.slice(-4)}`;
}
