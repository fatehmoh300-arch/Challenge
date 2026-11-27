"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, CalendarRange, Link2, PlusCircle, Globe2, LockKeyhole } from "lucide-react";
import { useApp } from "@/components/app-provider";
import { Button, Card, Notice, LoadingState } from "@/components/ui";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { algeriaDate } from "@/lib/date";

function addDays(value: string, amount: number) {
  const date = new Date(value + "T12:00:00Z");
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

export default function SetupPage() {
  const { user, refresh, challenge } = useApp();
  const today = algeriaDate();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("عام");
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(addDays(today, 29));
  const [visibility, setVisibility] = useState<"private" | "public">("private");
  const [joinMode, setJoinMode] = useState<"open" | "approval" | "invite">("invite");
  const [difficulty, setDifficulty] = useState<"easy" | "medium" | "hard">("medium");
  const [maxMembers, setMaxMembers] = useState(50);
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  if (challenge) return <LoadingState label="لديك مساحة تحدٍّ بالفعل. افتح صفحة تحدياتي لإضافة مساحة أخرى." />;
  if (!user) return null;

  const create = async () => {
    setBusy(true); setError("");
    try {
      const { data, error: rpcError } = await getSupabaseBrowserClient().rpc("create_challenge_v2", {
        p_title: title.trim(),
        p_description: description.trim(),
        p_start_date: startDate,
        p_end_date: endDate,
        p_visibility: visibility,
        p_difficulty: difficulty,
        p_category: category.trim() || "عام",
        p_join_mode: visibility === "private" ? "invite" : joinMode,
        p_max_members: maxMembers,
      });
      if (rpcError) throw rpcError;
      await refresh(data as string);
      router.replace("/manage");
    } catch (e) { setError(e instanceof Error ? e.message : "تعذّر إنشاء التحدّي."); }
    finally { setBusy(false); }
  };

  const join = async () => {
    setBusy(true); setError("");
    try {
      const { data, error: rpcError } = await getSupabaseBrowserClient().rpc("join_challenge", { p_token: token.trim() });
      if (rpcError) throw rpcError;
      await refresh(data as string);
      router.replace("/dashboard");
    } catch (e) { setError(e instanceof Error ? e.message : "رمز الدعوة غير صالح أو منتهي."); }
    finally { setBusy(false); }
  };

  return <div className="setup-screen" dir="rtl">
    <div className="setup-header">
      <div className="brand-lockup"><div className="brand-mark">C</div><div><strong>تحدّي</strong><span>CHALLENGE</span></div></div>
      <span className="eyebrow">مساحتك الجديدة</span>
      <h1>أنشئ تحدّيك الأول</h1>
      <p>حدّد الهدف والمدة والخصوصية. بعد الإنشاء تستطيع إضافة أهدافك وقواعدك وتعيين المساعدين.</p>
    </div>
    <div className="setup-grid">
      <Card>
        <div className="setup-icon"><PlusCircle/></div>
        <h2>إنشاء تحدٍّ</h2>
        <p>لا توجد أهداف افتراضية أو تواريخ مفروضة؛ أنت تحدد محتوى كل تحدٍّ.</p>
        <label>اسم التحدّي<input className="text-input" value={title} onChange={e=>setTitle(e.target.value)} minLength={3} maxLength={80} placeholder="مثلاً: تحدّي القراءة المنتظمة"/></label>
        <label>وصف التحدّي<textarea className="text-input" value={description} onChange={e=>setDescription(e.target.value)} maxLength={2000} rows={3} placeholder="الهدف والقواعد وما يتوقع من المشاركين"/></label>
        <label>التصنيف<input className="text-input" value={category} onChange={e=>setCategory(e.target.value)} maxLength={40} placeholder="قراءة، رياضة، تعلّم…"/></label>
        <div className="form-grid-two">
          <label>تاريخ البداية<input className="text-input" type="date" value={startDate} onChange={e=>setStartDate(e.target.value)}/></label>
          <label>تاريخ النهاية<input className="text-input" type="date" value={endDate} onChange={e=>setEndDate(e.target.value)}/></label>
        </div>
        <div className="form-grid-two">
          <label>الصعوبة<select className="text-input" value={difficulty} onChange={e=>setDifficulty(e.target.value as typeof difficulty)}><option value="easy">مبتدئ</option><option value="medium">متوسط</option><option value="hard">متقدم</option></select></label>
          <label>الحد الأقصى للمشاركين<select className="text-input" value={maxMembers} onChange={e=>setMaxMembers(Number(e.target.value))}>{[2,10,25,50,100,250,500].map(n=><option key={n} value={n}>{n} مشارك</option>)}</select></label>
        </div>
        <label>الخصوصية<select className="text-input" value={visibility} onChange={e=>setVisibility(e.target.value as typeof visibility)}><option value="private">خاص — بالدعوة</option><option value="public">عام — يظهر في الاستكشاف</option></select></label>
        {visibility==="public" && <label>طريقة الانضمام<select className="text-input" value={joinMode} onChange={e=>setJoinMode(e.target.value as typeof joinMode)}><option value="open">مفتوح للجميع</option><option value="approval">بموافقة المنظّم</option><option value="invite">بالدعوة فقط</option></select></label>}
        <div className="date-strip"><CalendarRange size={18}/><span>{visibility==="public"?<><Globe2 size={14}/> يظهر في قائمة الاستكشاف.</>:<><LockKeyhole size={14}/> لا تظهر تفاصيله إلا للأعضاء.</>}</span></div>
        <Button onClick={create} busy={busy} disabled={title.trim().length<3||!startDate||!endDate||endDate<startDate} className="full-width">إنشاء التحدّي <ArrowLeft size={16}/></Button>
      </Card>
      <Card>
        <div className="setup-icon muted"><Link2/></div>
        <h2>الانضمام بدعوة</h2>
        <p>أدخل رمز الدعوة الذي أرسله منظّم التحدّي.</p>
        <label>رمز الدعوة<input className="text-input" value={token} onChange={e=>setToken(e.target.value)} placeholder="الصق رمز الدعوة هنا"/></label>
        <div className="date-strip subtle"><span>يمكنك الانضمام إلى أكثر من تحدٍّ من الحساب نفسه.</span></div>
        <Button variant="secondary" onClick={join} busy={busy} disabled={!token.trim()} className="full-width">الانضمام إلى التحدّي <ArrowLeft size={16}/></Button>
      </Card>
    </div>
    {error&&<Notice tone="error">{error}</Notice>}
    <div className="setup-foot">الحساب الحالي: {user.email}</div>
  </div>;
}
