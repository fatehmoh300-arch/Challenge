"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, KeyRound, Mail, UserRound } from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { Button, Notice } from "@/components/ui";

export default function LoginPage() {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();
  const requestedNext = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("next") || "/dashboard" : "/dashboard";
  const nextPath = requestedNext.startsWith("/") && !requestedNext.startsWith("//") ? requestedNext : "/dashboard";

  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setError(""); setMessage("");
    try {
      const supabase = getSupabaseBrowserClient();
      if (mode === "signup") {
        const { data, error: authError } = await supabase.auth.signUp({ email, password, options: { data: { display_name: name.trim() }, emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(nextPath)}` } });
        if (authError) throw authError;
        if (!data.session) setMessage("تم إنشاء الطلب. افتح بريدك الإلكتروني واضغط رابط التأكيد، ثم عُد إلى تسجيل الدخول.");
        else router.replace(nextPath);
      } else {
        const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
        if (authError) throw authError;
        router.replace(nextPath);
      }
    } catch (e) { setError(e instanceof Error ? e.message : "تعذّر إتمام العملية."); }
    finally { setBusy(false); }
  };

  return <div className="auth-screen" dir="rtl"><div className="auth-panel"><div className="brand-lockup"><div className="brand-mark">C</div><div><strong>تحدّي</strong><span>CHALLENGE</span></div></div><div className="auth-heading"><span className="eyebrow">خطوات صغيرة، أثر كبير</span><h1>{mode === "login" ? "مرحباً بعودتك" : "أنشئ حسابك"}</h1><p>{mode === "login" ? "سجّل الدخول لمتابعة تقدّمك في التحدّي." : "أنشئ حساباً مستقلاً، ثم أنشئ التحدّي أو انضم برمز دعوة."}</p></div>
    <form className="form-stack" onSubmit={submit}>{mode === "signup" && <label>الاسم الظاهر<div className="input-wrap"><UserRound size={18}/><input required value={name} onChange={e=>setName(e.target.value)} minLength={2} maxLength={40} placeholder="اسمك" /></div></label>}<label>البريد الإلكتروني<div className="input-wrap"><Mail size={18}/><input type="email" required value={email} onChange={e=>setEmail(e.target.value)} autoComplete="email" placeholder="name@example.com" /></div></label><label>كلمة المرور<div className="input-wrap"><KeyRound size={18}/><input type="password" required minLength={8} value={password} onChange={e=>setPassword(e.target.value)} autoComplete={mode === "login" ? "current-password" : "new-password"} placeholder="٨ أحرف على الأقل" /></div></label>{error && <Notice tone="error">{error}</Notice>}{message && <Notice tone="success">{message}</Notice>}<Button type="submit" busy={busy} className="full-width">{mode === "login" ? "تسجيل الدخول" : "إنشاء الحساب"}<ArrowLeft size={17}/></Button></form>
    <div className="auth-switch">{mode === "login" ? <>ليس لديك حساب؟ <button onClick={()=>setMode("signup")}>أنشئ حساباً</button></> : <>لديك حساب بالفعل؟ <button onClick={()=>setMode("login")}>سجّل الدخول</button></>}</div><div className="auth-bottom"><span>بياناتك الشخصية محمية بصلاحيات قاعدة البيانات.</span><Link href="/">الصفحة الرئيسية</Link></div></div><div className="auth-aside"><div className="aside-orbit orbit-one"/><div className="aside-orbit orbit-two"/><div className="aside-content"><span className="aside-chip">DECEMBER · 2026</span><h2>الاستمرارية<br/>تصنع الفارق.</h2><p>راقب عاداتك. افهم تقدّمك. ونافس بعدل.</p><div className="aside-score"><strong>31</strong><span>يوماً من العمل المتراكم</span></div></div></div></div>;
}
