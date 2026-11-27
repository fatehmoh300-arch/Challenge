"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, CalendarRange, Link2, PlusCircle } from "lucide-react";
import { useApp } from "@/components/app-provider";
import { Button, Card, Notice, LoadingState } from "@/components/ui";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export default function SetupPage() {
  const { user, refresh, challenge } = useApp();
  const [title, setTitle] = useState("تحدّي ديسمبر 2026");
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();
  useEffect(() => { if (challenge) router.replace("/dashboard"); }, [challenge, router]);
  if (challenge) return <LoadingState label="جارٍ فتح مساحة التحدّي…" />;
  if (!user) return null;

  const create = async () => {
    setBusy(true); setError("");
    try {
      const { error: rpcError } = await getSupabaseBrowserClient().rpc("create_challenge", { p_title: title.trim(), p_start_date: "2026-12-01", p_end_date: "2026-12-31" });
      if (rpcError) throw rpcError;
      await refresh(); router.replace("/dashboard");
    } catch (e) { setError(e instanceof Error ? e.message : "تعذّر إنشاء التحدّي."); }
    finally { setBusy(false); }
  };
  const join = async () => {
    setBusy(true); setError("");
    try {
      const { error: rpcError } = await getSupabaseBrowserClient().rpc("join_challenge", { p_token: token.trim() });
      if (rpcError) throw rpcError;
      await refresh(); router.replace("/dashboard");
    } catch (e) { setError(e instanceof Error ? e.message : "رمز الدعوة غير صالح أو منتهي."); }
    finally { setBusy(false); }
  };

  return <div className="setup-screen" dir="rtl"><div className="setup-header"><div className="brand-lockup"><div className="brand-mark">C</div><div><strong>تحدّي</strong><span>CHALLENGE</span></div></div><span className="eyebrow">تهيئة مساحة العمل</span><h1>ابدأ مساحة التحدّي</h1><p>أنشئ التحدّي بصفتك المنظّم، أو أدخل رمز الدعوة للانضمام إلى مساحة موجودة.</p></div><div className="setup-grid"><Card><div className="setup-icon"><PlusCircle/></div><h2>إنشاء تحدٍّ جديد</h2><p>سيتم تجهيز تحدّي ديسمبر بالعادات الخمس والصيام يومي الاثنين والخميس.</p><label>اسم التحدّي<input className="text-input" value={title} onChange={e=>setTitle(e.target.value)} maxLength={80}/></label><div className="date-strip"><CalendarRange size={18}/><span>١ ديسمبر ٢٠٢٦ — ٣١ ديسمبر ٢٠٢٦</span></div><Button onClick={create} busy={busy} className="full-width">إنشاء التحدّي <ArrowLeft size={16}/></Button></Card><Card><div className="setup-icon muted"><Link2/></div><h2>الانضمام بدعوة</h2><p>أدخل رمز الدعوة الذي أرسله لك منظم التحدّي.</p><label>رمز الدعوة<input className="text-input" value={token} onChange={e=>setToken(e.target.value)} placeholder="الصق رمز الدعوة هنا" /></label><div className="date-strip subtle"><span>لا يمكنك رؤية تفاصيل الإنجازات اليومية للمشاركين الآخرين.</span></div><Button variant="secondary" onClick={join} busy={busy} disabled={!token.trim()} className="full-width">الانضمام إلى التحدّي <ArrowLeft size={16}/></Button></Card></div>{error && <Notice tone="error">{error}</Notice>}<div className="setup-foot">الحساب الحالي: {user.email}</div></div>;
}
