# بنية مشروع CHALLENGE | تحدّي

منصة عربية (RTL) لمتابعة العادات اليومية والقراءة والمنافسة بين المشاركين، مبنية على **Next.js (App Router)** و**TypeScript** و**Supabase** و**Tailwind CSS**.

## 1. المكدس التقني (Tech Stack)
- **الإطار الأمامي:** Next.js (App Router) + React + TypeScript.
- **التنسيق والواجهة:** Tailwind CSS + RTL.
- **قاعدة البيانات والمصادقة:** Supabase (PostgreSQL + Auth + SQL Migrations).
- **الاختبارات والـ CI/CD:** Playwright للاختبارات الطرفية (E2E) + GitHub Actions.
- **النشر والتطوير:** Vercel وGitHub Codespaces.

## 2. هيكلة المشروع الرئيسية
- `src/` — صفحات التطبيق (App Router)، المكونات، ومنطق الواجهة.
- `supabase/migrations/` — ملفات ترحيل قاعدة البيانات والمخطط الأمني (`schema` و`hardening` و`advisor`).
- `e2e/` — اختبارات Playwright (مثل `e2e/smoke.spec.ts`).
- `.github/workflows/` — مسارات التكامل المستمر وتشغيل الاختبارات (`e2e-ci.yml`).
- `.devcontainer/` — إعداد بيئة التطوير في Codespaces.

## 3. قواعد العمل والاعتماد
- التطوير يتم عبر فروع مخصصة (`chore/...`، `docs/...`، `feat/...`) ثم فتح Pull Request نحو `main`.
- يُمنع رفع أي مفاتيح سرية أو بيانات حساسة داخل المستودع.
- يُشترط نجاح فحوصات CI قبل الدمج إلى `main`.
