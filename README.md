# AI Chat App — نسخة Cloudflare Workers (الطريقة الحديثة الموصى بها)

نسخة معدّلة عشان تتوافق مع فورم "Set up your application" اللي بيظهر دلوقتي في لوحة Cloudflare (اللي بيستخدم `npx wrangler deploy`). المشروع كله — الواجهة + الـ API + إدارة المفاتيح — بقى **Worker واحد** بيقدّم الملفات الثابتة وبيشغّل الـ API مع بعض، وده بالظبط الاتجاه اللي Cloudflare بتنصح بيه دلوقتي بدل Pages.

## بنية المشروع

```
ai-chat-worker/
├── wrangler.jsonc         ← إعدادات الـ Worker (اسم المشروع، مجلد الملفات الثابتة، الخ)
├── package.json
├── src/
│   ├── worker.js          ← نقطة الدخول: بيوجّه /api/* ويسيب الباقي للملفات الثابتة
│   ├── lib/
│   │   ├── auth.js
│   │   └── store.js
│   └── handlers/
│       ├── chat.js        ← /api/chat (يدعم عدة مفاتيح + Failover)
│       ├── login.js       ← /api/admin/login
│       ├── keys.js        ← /api/admin/keys
│       └── test.js        ← /api/admin/test
└── public/                  ← الواجهة (نفسها بدون أي تغيير)
    ├── index.html
    ├── css/style.css
    └── js/ (app.js, settings.js)
```

---

## خطوات النشر

### 1. ارفع المشروع على GitHub
- أنشئ ريبو جديد فاضي على https://github.com
- ارفع **كل محتويات مجلد `ai-chat-worker`** بنفس البنية (الملفات في الجذر، مش داخل مجلد فرعي زيادة)

### 2. من لوحة Cloudflare
- **Workers & Pages** → **Create application** → **Import a repository** (أو الفورم اللي ظهرلك بالفعل بعنوان "Set up your application")
- اختار الريبو
- **Project name**: اسم من اختيارك
- **Build command**: اتركه فاضي
- **Deploy command**: `npx wrangler deploy` (المفروض يكون معبّى تلقائيًا زي ما ظهرلك بالظبط)
- اضغط **Deploy**

أول نشر هيفشل أو يشتغل بدون الـ API إذا لسه مفيش KV مربوط — طبيعي، كمّل الخطوات الجاية.

### 3. إنشاء KV Namespace
- من نفس اللوحة: **Workers & Pages** → **KV** → **Create a namespace** → سمّها `CHAT_KV`

### 4. ربط الـ KV بالـ Worker
- ادخل على مشروعك (الـ Worker اللي أنشأته في خطوة 2)
- **Settings** → **Bindings** → **Add binding** → **KV Namespace**
  - Variable name: `CHAT_KV` (لازم يكون بالظبط بهذا الاسم)
  - KV namespace: اختر `CHAT_KV`

### 5. تعيين كلمة مرور الإدارة
- **Settings** → **Variables and Secrets** → **Add**
  - Name: `ADMIN_PASSWORD`
  - Value: كلمة مرور قوية من اختيارك
  - نوعها: **Secret** (مش نص عادي، عشان تتشفّر)

### 6. (اختياري) مفتاح احتياطي قديم
لو حابب تحتفظ بمفتاح `GOROUTER_API_KEY` كخيار مبدئي قبل ما تضيف مفاتيح من الموقع نفسه، ضيفه بنفس طريقة خطوة 5.

### 7. إعادة النشر
بعد إضافة الـ Bindings والمتغيرات، لازم تعمل **Retry deployment** (أو `git push` تاني لو معدّلت حاجة) عشان يتفعّلوا.

---

## استخدام صفحة الإعدادات

1. افتح رابط الـ Worker (زي `https://ai-chat-app.your-subdomain.workers.dev`)
2. اضغط **⚙️ إعدادات مفاتيح API** من القائمة الجانبية
3. أدخل كلمة مرور الإدارة (`ADMIN_PASSWORD`)
4. أضف مفتاح API أو أكتر (اسم + رابط + المفتاح + الموديل)
5. اضغط **"اختبار جميع المفاتيح"** للتأكد إن كل واحد شغال فعليًا
6. اختر وضع التشغيل: **تلقائي (Failover)** أو مفتاح محدد يدويًا

## اختبار سريع بعد النشر

```bash
curl -X POST https://your-worker.workers.dev/api/chat \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"مرحباً"}]}'
```

## ملاحظات مهمة
- مفتاح الـ API لا يظهر أبدًا في كود الفرونت إند، فقط داخل الـ Worker على السيرفر.
- Cloudflare Workers مجاني بشكل دائم لهذا الحجم من الاستخدام، بدون "Sleep" أو توقف بعد فترة خمول.
- أي تعديل لاحق: عدّل الملفات في GitHub وادفعها (push)، وCloudflare هينشر تلقائيًا.
