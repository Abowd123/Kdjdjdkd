// نقطة الدخول الرئيسية للـ Worker
// الملفات الثابتة (public/) بيتم تقديمها تلقائيًا عبر الـ assets binding
// من غير ما تمر على الكود ده أصلاً، ما عدا أي مسار مش موجود كملف (زي /api/*)

import { handleChat } from './handlers/chat.js';
import { handleLogin } from './handlers/login.js';
import { handleKeys } from './handlers/keys.js';
import { handleTest } from './handlers/test.js';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    try {
      if (path === '/api/chat') return await handleChat(request, env);
      if (path === '/api/admin/login') return await handleLogin(request, env);
      if (path === '/api/admin/keys') return await handleKeys(request, env);
      if (path === '/api/admin/test') return await handleTest(request, env);
    } catch (err) {
      return new Response(
        JSON.stringify({ error: 'Internal error', message: err.message }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // أي مسار تاني (ملفات ثابتة لم يتم إيجادها، أو 404 عام)
    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return new Response('Not found', { status: 404 });
  }
};
