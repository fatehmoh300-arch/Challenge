# دليل إعداد وتشغيل مشروع CHALLENGE | تحدّي

## 1. المتطلبات الأساسية
- Node.js وnpm (أو العمل مباشرة داخل GitHub Codespaces).
- حساب ومشروع على Supabase (للحصول على رابط المشروع ومفتاح النشر العام).
- حساب على Vercel (اختياري للنشر المستمر).

## 2. إعداد متغيرات البيئة
1. انسخ قالب البيئة: cp .env.example .env.local
2. عدّل القيم داخل .env.local من لوحة تحكم Supabase (Project Settings -> API):
   - NEXT_PUBLIC_SUPABASE_URL
   - NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
- يُمنع وضع أي مفاتيح سرية داخل متغيرات NEXT_PUBLIC_* أو رفع .env.local إلى Git.

## 3. التثبيت والتشغيل والاختبار
- شغّل الأوامر: npm ci ثم npm run build ثم npm start.
- لتشغيل اختبارات Playwright الطرفية، راجع ملف TESTING.md.
