import { requireAdmin, jsonResponse } from '../lib/auth.js';
import { getKeys } from '../lib/store.js';

const TEST_TIMEOUT_MS = 15000;

async function testOneKey(key) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TEST_TIMEOUT_MS);

  try {
    const res = await fetch(key.baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key.apiKey}`
      },
      body: JSON.stringify({
        model: key.model || 'claude-opus-5-thinking',
        messages: [{ role: 'user', content: 'ping' }],
        stream: false,
        max_tokens: 5
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (res.ok) {
      return { id: key.id, name: key.name, ok: true, message: 'يعمل بنجاح' };
    }

    let errData;
    try {
      errData = await res.json();
    } catch {
      errData = { message: await res.text() };
    }

    const msg = errData?.error?.message || errData?.message || `فشل بكود HTTP ${res.status}`;
    return { id: key.id, name: key.name, ok: false, message: msg };
  } catch (err) {
    clearTimeout(timeoutId);
    const msg = err.name === 'AbortError' ? 'انتهت مهلة الاتصال (Timeout)' : err.message;
    return { id: key.id, name: key.name, ok: false, message: msg };
  }
}

export async function handleTest(request, env) {
  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }
  if (!(await requireAdmin(request, env))) return jsonResponse({ error: 'Unauthorized' }, 401);

  const keys = await getKeys(env);
  if (keys.length === 0) return jsonResponse({ results: [] });

  const results = await Promise.all(keys.map(testOneKey));
  return jsonResponse({ results });
}
