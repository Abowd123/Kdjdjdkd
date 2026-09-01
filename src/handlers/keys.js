import { requireAdmin, jsonResponse } from '../lib/auth.js';
import { getKeys, saveKeys, maskKey } from '../lib/store.js';

export async function handleKeys(request, env) {
  if (!(await requireAdmin(request, env))) return jsonResponse({ error: 'Unauthorized' }, 401);

  switch (request.method) {
    case 'GET':
      return listKeys(env);
    case 'POST':
      return addKey(request, env);
    case 'PATCH':
      return patchKey(request, env);
    case 'DELETE':
      return deleteKey(request, env);
    default:
      return jsonResponse({ error: 'Method not allowed' }, 405);
  }
}

async function listKeys(env) {
  const keys = await getKeys(env);
  const masked = keys.map((k) => ({
    id: k.id,
    name: k.name,
    baseUrl: k.baseUrl,
    model: k.model,
    enabled: k.enabled !== false,
    apiKeyMasked: maskKey(k.apiKey)
  }));
  return jsonResponse({ keys: masked });
}

async function addKey(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400);
  }

  const { name, baseUrl, apiKey, model, enabled } = body || {};

  if (!name || !baseUrl || !apiKey) {
    return jsonResponse(
      { error: 'Invalid request', message: 'الاسم، رابط الـ API، والمفتاح كلها حقول مطلوبة.' },
      400
    );
  }

  const keys = await getKeys(env);
  const newKey = {
    id: crypto.randomUUID(),
    name: String(name).trim(),
    baseUrl: String(baseUrl).trim(),
    apiKey: String(apiKey).trim(),
    model: model ? String(model).trim() : 'claude-opus-5-thinking',
    enabled: enabled !== false
  };

  keys.push(newKey);
  await saveKeys(env, keys);

  return jsonResponse({ success: true, id: newKey.id });
}

async function patchKey(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400);
  }

  const { id, enabled } = body || {};
  if (!id) return jsonResponse({ error: 'Missing id' }, 400);

  const keys = await getKeys(env);
  const key = keys.find((k) => k.id === id);
  if (!key) return jsonResponse({ error: 'Not found' }, 404);

  key.enabled = !!enabled;
  await saveKeys(env, keys);

  return jsonResponse({ success: true });
}

async function deleteKey(request, env) {
  const url = new URL(request.url);
  const id = url.searchParams.get('id');
  if (!id) return jsonResponse({ error: 'Missing id' }, 400);

  let keys = await getKeys(env);
  const before = keys.length;
  keys = keys.filter((k) => k.id !== id);

  if (keys.length === before) return jsonResponse({ error: 'Not found' }, 404);

  await saveKeys(env, keys);
  return jsonResponse({ success: true });
}
