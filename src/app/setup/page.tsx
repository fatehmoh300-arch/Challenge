"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, CalendarRange, Link2, PlusCircle, Globe2, LockKeyhole } from "lucide-react";
import { useApp } from "@/components/app-provider";
import { Button, Card, Notice, LoadingState } from "@/components/ui";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export default function SetupPage() {
  const { user, refresh, challenge } = useApp();
  const [title, setTitle] = useState("تحدٍّ جديد");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("عام");
  const [startDate, setStartDate] = useState("2026-12-01");
  const [endDate, setEndDate] = useState("2026-12-31");
  const [visibility, setVisibility] = useState<"private" | "public">("private");
  const [difficulty, setDifficulty] = useState<"easy" | "medium" | "hard">("medium");
  const [maxMembers, setMaxMembers] = useState(50);
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
      const { error: rpcError } = await getSupabaseBrowserClient().rpc("create_challenge_v2", {
        p_title: title.trim(),
        p_description: description.trim(),
        p_start_date: startDate,
        p_end_date: endDate,
        p_visibility: visibility,
        p_difficulty: difficulty,
        p_category: category.trim() || "عام",
        p_join_mode: visibility === "public" ? "open" : "invite",
        p_max_members: maxMembers,
      });
      if (rpcError) throw rpcError;
      await refresh();
      router.replace("/dashboard");
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

  return <div className="setup-screen" dir="rtl">
    <div className="setup-header">
      <div className="brand-lockup"><div className="brand-mark">C</div><div><strong>تحدّي</strong><span>CHALLENGE</span></div></div>
      <span className="eyebrow">تهيئة مساحة العمل</span>
      <h1>ابدأ مساحة التحدّي</h1>
      <p>أنشئ تحدّياً عاماً ليستكشفه الآخرون، أو مساحة خاصة لا يدخلها إلا المدعوون.</p>
    </div>
    <div className="setup-grid">
      <Card>
        <div className="setup-icon"><PlusCircle/></div>
        <h2>إنشاء تحدٍّ جديد</h2>
        <p>تُنشأ مساحة مستقلة لك كمنظّم، ويمكنك دعوة المشاركين لاحقاً.</p>
        <label>اسم التحدّي<input className="text-input" value={title} onChange={e=>setTitle(e.target.value)} minLength={3} maxLength={80} placeholder="مثلاً: تحدّي القراءة لمدة 30 يوماً"/></label>
        <label>وصف التحدّي<textarea className="text-input" value={description} onChange={e=>setDescription(e.target.value)} maxLength={2000} rows={3} placeholder="ما الهدف؟ وما المطلوب من المشاركين؟"/></label>
        <label>التصنيف<input className="text-input" value={category} onChange={e=>setCategory(e.target.value)} maxLength={40} placeholder="رياضة، قراءة، تعلّم…"/></label>
        <div className="form-grid-two">
          <label>تاريخ البداية<input className="text-input" type="date" value={startDate} onChange={e=>setStartDate(e.target.value)}/></label>
          <label>تاريخ النهاية<input className="text-input" type="date" value={endDate} onChange={e=>setEndDate(e.target.value)}/></label>
        </div>
        <div className="form-grid-two">
          <label>مستوى الصعوبة<select className="text-input" value={difficulty} onChange={e=>setDifficulty(e.target.value as typeof difficulty)}><option value="easy">مبتدئ</option><option value="medium">متوسط</option><option value="hard">متقدم</option></select></label>
          <label>الحد الأقصى للمشاركين<select className="text-input" value={maxMembers} onChange={e=>setMaxMembers(Number(e.target.value))}><option value={10}>10 مشاركين</option><option value={25}>25 مشاركاً</option><option value={50}>50 مشاركاً</option><option value={100}>100 مشارك</option><option value={250}>250 مشاركاً</option><option value={500}>500 مشارك</option></select></label>
        </div>
        <label>خصوصية التحدّي<select className="text-input" value={visibility} onChange={e=>setVisibility(e.target.value as typeof visibility)}><option value="private">خاص — بالدعوة فقط</option><option value="public">عام — يظهر في الاستكشاف والانضمام مفتوح</option></select></label>
        <div className="date-strip"><CalendarRange size={18}/><span>{visibility === "public" ? <><Globe2 size={14}/> سيظهر التحدّي للزوار ويمكنهم الانضمام بعد تسجيل الدخول.</> : <><LockKeyhole size={14}/> لن تظهر تفاصيله إلا للمصرّح لهم.</>}</span></div>
        <Button onClick={create} busy={busy} disabled={title.trim().length < 3 || !startDate || !endDate || endDate < startDate} className="full-width">إنشاء التحدّي <ArrowLeft size={16}/></Button>
      </Card>
      <Card>
        <div className="setup-icon muted"><Link2/></div>
        <h2>الانضمام بدعوة</h2>
        <p>أدخل رمز الدعوة الذي أرسله لك منظّم التحدّي.</p>
        <label>رمز الدعوة<input className="text-input" value={token} onChange={e=>setToken(e.target.value)} placeholder="الصق رمز الدعوة هنا"/></label>
        <div className="date-strip subtle"><span>لا يمكنك رؤية تفاصيل الإنجازات اليومية للمشاركين الآخرين.</span></div>
        <Button variant="secondary" onClick={join} busy={busy} disabled={!token.trim()} className="full-width">الانضمام إلى التحدّي <ArrowLeft size={16}/></Button>
      </Card>
    </div>
    {error && <Notice tone="error">{error}</Notice>}
    <div className="setup-foot">الحساب الحالي: {user.email}</div>
  </div>;
}
