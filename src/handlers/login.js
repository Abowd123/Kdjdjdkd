import { jsonResponse } from '../lib/auth.js';

const SESSION_TTL_SECONDS = 60 * 60 * 24; // صلاحية الجلسة: 24 ساعة

export async function handleLogin(request, env) {
  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400);
  }

  const { password } = body || {};

  if (!env.ADMIN_PASSWORD) {
    return jsonResponse(
      {
        error: 'Server configuration error',
        message: 'ADMIN_PASSWORD غير معرّف في متغيرات البيئة الخاصة بالـ Worker.'
      },
      500
    );
  }

  if (!env.CHAT_KV) {
    return jsonResponse(
      {
        error: 'Server configuration error',
        message: 'لا يوجد KV namespace مربوط باسم CHAT_KV. راجع تعليمات الإعداد في README.'
      },
      500
    );
  }

  if (!password || password !== env.ADMIN_PASSWORD) {
    return jsonResponse({ error: 'Unauthorized', message: 'كلمة المرور غير صحيحة.' }, 401);
  }

  const token = `${crypto.randomUUID()}${crypto.randomUUID()}`.replace(/-/g, '');
  await env.CHAT_KV.put(`session:${token}`, '1', { expirationTtl: SESSION_TTL_SECONDS });

  return jsonResponse({ token, expiresIn: SESSION_TTL_SECONDS });
}
