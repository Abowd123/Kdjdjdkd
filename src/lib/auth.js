// دالة مساعدة مشتركة للتحقق من صلاحية جلسة الأدمن قبل السماح بإدارة مفاتيح API

export async function requireAdmin(request, env) {
  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;

  if (!token) return false;
  if (!env.CHAT_KV) return false; // لو الـ KV مش مربوط بعد

  const valid = await env.CHAT_KV.get(`session:${token}`);
  return valid === '1';
}

export function jsonResponse(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}
