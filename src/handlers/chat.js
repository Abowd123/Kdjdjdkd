import { getKeys } from '../lib/store.js';

function jsonResponse(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

async function buildProviderList(env) {
  const stored = await getKeys(env);
  const enabled = stored.filter((k) => k.enabled !== false);
  if (enabled.length > 0) return enabled;

  // توافق مع الإعداد القديم: لو مفيش مفاتيح متخزنة بعد، استخدم متغير البيئة القديم كخيار احتياطي
  if (env.GOROUTER_API_KEY) {
    return [
      {
        id: 'default',
        name: 'الافتراضي (GOROUTER_API_KEY)',
        baseUrl: 'https://gorouter.app/v1/chat/completions',
        apiKey: env.GOROUTER_API_KEY,
        model: null
      }
    ];
  }

  return [];
}

export async function handleChat(request, env) {
  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400);
  }

  const { messages, model, providerId } = body || {};

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return jsonResponse(
      {
        error: 'Invalid request',
        message: 'The "messages" field is required and must be a non-empty array.'
      },
      400
    );
  }

  const providers = await buildProviderList(env);

  if (providers.length === 0) {
    return jsonResponse(
      {
        error: 'Server configuration error',
        message: 'لا توجد أي مفاتيح API مُعدّة بعد. أضف مفتاحًا واحدًا على الأقل من صفحة الإعدادات (⚙️) داخل الموقع.'
      },
      500
    );
  }

  // تحديد قائمة المرشحين: مفتاح واحد محدد يدويًا، أو كل المفاتيح المفعّلة بالترتيب (auto/failover)
  let candidates;
  if (providerId && providerId !== 'auto') {
    const chosen = providers.find((p) => p.id === providerId);
    if (!chosen) {
      return jsonResponse(
        { error: 'Invalid provider', message: 'الـ API المحدد غير موجود أو غير مفعل حاليًا.' },
        400
      );
    }
    candidates = [chosen];
  } else {
    candidates = providers;
  }

  const fallbackModel = model || 'claude-opus-5-thinking';

  let upstream = null;
  let lastError = null;

  for (const provider of candidates) {
    try {
      const res = await fetch(provider.baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${provider.apiKey}`
        },
        body: JSON.stringify({
          model: provider.model || fallbackModel,
          messages,
          stream: true
        })
      });

      if (res.ok) {
        upstream = res;
        break;
      }

      let errData;
      try {
        errData = await res.json();
      } catch {
        errData = { message: await res.text() };
      }
      lastError = { status: res.status, data: errData, providerName: provider.name };
    } catch (err) {
      lastError = { status: 502, data: { message: err.message }, providerName: provider.name };
    }
  }

  // كل المرشحين فشلوا
  if (!upstream) {
    const status = lastError?.status || 502;
    const errorData = lastError?.data || {};
    const providerName = lastError?.providerName || 'غير معروف';

    let message;
    switch (status) {
      case 401:
        message = `مفتاح API غير صالح (${providerName}).`;
        break;
      case 429:
        message = `تم تجاوز الحد المسموح من الطلبات (${providerName}).`;
        break;
      default:
        message =
          errorData.error?.message ||
          errorData.message ||
          `فشل الاتصال بكل مزودي الـ API المتاحين (آخر محاولة: ${providerName}).`;
    }

    return jsonResponse({ error: 'API error', message, details: errorData }, status);
  }

  // تحويل الـ stream القادم من المزود الناجح إلى صيغة SSE موحّدة للفرونت إند
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = '';

  const transformedStream = new ReadableStream({
    async start(controller) {
      const reader = upstream.body.getReader();

      const closeWithDone = () => {
        try {
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        } catch {
          /* already closed */
        }
      };

      try {
        while (true) {
          const { done, value } = await reader.read();

          if (done) {
            closeWithDone();
            break;
          }

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || !trimmed.startsWith('data: ')) continue;

            const dataStr = trimmed.slice(6);

            if (dataStr === '[DONE]') {
              closeWithDone();
              return;
            }

            try {
              const parsed = JSON.parse(dataStr);

              let content = null;
              let finishReason = null;

              if (parsed.choices?.[0]?.delta?.content !== undefined) {
                content = parsed.choices[0].delta.content;
                finishReason = parsed.choices[0].finish_reason;
              } else if (parsed.choices?.[0]?.text !== undefined) {
                content = parsed.choices[0].text;
                finishReason = parsed.choices[0].finish_reason;
              } else if (parsed.choices?.[0]?.message?.content !== undefined) {
                content = parsed.choices[0].message.content;
                finishReason = parsed.choices[0].finish_reason;
              }

              const chunk = { content: content || '', finish_reason: finishReason || null };
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));
            } catch {
              // تجاهل أي سطر لا يمكن تحليله والاستمرار
            }
          }
        }
      } catch (streamErr) {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ error: 'stream_error', message: streamErr.message })}\n\n`)
        );
        closeWithDone();
      }
    }
  });

  return new Response(transformedStream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive'
    }
  });
}
