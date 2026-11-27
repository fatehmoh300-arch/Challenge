"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Layers3, Plus, Settings2, Users, CalendarDays, CheckCircle2 } from "lucide-react";
import { useApp } from "@/components/app-provider";
import { Button, Card, Notice, PageTitle } from "@/components/ui";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { algeriaDate } from "@/lib/date";
import { formatArabicDate, number } from "@/lib/format";

function addDays(value: string, amount: number) {
  const date = new Date(value + "T12:00:00Z");
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

export default function ChallengesPage() {
  const { challenges, memberships, challenge, selectChallenge, refresh } = useApp();
  const router = useRouter();
  const today = algeriaDate();
  const [showForm,setShowForm] = useState(false);
  const [title,setTitle] = useState("");
  const [description,setDescription] = useState("");
  const [category,setCategory] = useState("عام");
  const [startDate,setStartDate] = useState(today);
  const [endDate,setEndDate] = useState(addDays(today,29));
  const [visibility,setVisibility] = useState<"private"|"public">("private");
  const [joinMode,setJoinMode] = useState<"open"|"approval"|"invite">("invite");
  const [difficulty,setDifficulty] = useState<"easy"|"medium"|"hard">("medium");
  const [maxMembers,setMaxMembers] = useState(50);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState("");
  const [message,setMessage] = useState("");

  const create=async()=>{
    setBusy(true);setError("");setMessage("");
    try{
      const {data,error:rpcError}=await getSupabaseBrowserClient().rpc("create_challenge_v2",{
        p_title:title.trim(),p_description:description.trim(),p_start_date:startDate,p_end_date:endDate,
        p_visibility:visibility,p_difficulty:difficulty,p_category:category.trim()||"عام",
        p_join_mode:visibility==="private"?"invite":joinMode,p_max_members:maxMembers
      });
      if(rpcError)throw rpcError;
      await refresh(data as string);
      router.push("/manage");
    }catch(e){setError(e instanceof Error?e.message:"تعذّر إنشاء التحدّي.");}
    finally{setBusy(false);}
  };

  return <div>
    <PageTitle title="تحدياتي" subtitle="أنشئ مساحات مستقلة، وبدّل بينها دون إنشاء حسابات متعددة." action={<div style={{display:"flex",gap:8,flexWrap:"wrap"}}><Link className="btn btn-secondary" href="/explore">استكشاف التحديات</Link><Button onClick={()=>setShowForm(v=>!v)}><Plus size={16}/> تحدٍّ جديد</Button></div>}/>
    {message&&<Notice tone="success">{message}</Notice>}
    {error&&<Notice tone="error">{error}</Notice>}
    <div className="challenge-list" style={{display:"grid",gap:12,marginBottom:22}}>
      {challenges.length===0?<Card><p>لا توجد تحديات مرتبطة بحسابك بعد.</p></Card>:challenges.map(item=>{
        const member=memberships.find(m=>m.challenge_id===item.id);
        const selected=item.id===challenge?.id;
        return <Card key={item.id} style={{border:selected?"1px solid #3b70be":undefined}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:12,flexWrap:"wrap"}}>
            <div style={{minWidth:0,flex:"1 1 220px"}}>
              <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
                <span className="challenge-tag"><Layers3 size={14}/>{item.category||"عام"}</span>
                {selected&&<span className="status-chip done"><CheckCircle2 size={12}/> المساحة النشطة</span>}
                <span className="status-chip pending">{item.visibility==="public"?"عام":"خاص"}</span>
              </div>
              <h3 style={{margin:"12px 0 5px"}}>{item.title}</h3>
              <p style={{color:"var(--muted)",fontSize:12,lineHeight:1.7,margin:0}}>{item.description||"لم يضف المنظّم وصفاً بعد."}</p>
              <div style={{display:"flex",gap:14,flexWrap:"wrap",marginTop:12,color:"var(--muted)",fontSize:11}}>
                <span><CalendarDays size={13} style={{verticalAlign:"middle"}}/> {formatArabicDate(item.start_date,{day:"numeric",month:"short",year:"numeric"})} – {formatArabicDate(item.end_date,{day:"numeric",month:"short",year:"numeric"})}</span>
                <span><Users size={13} style={{verticalAlign:"middle"}}/> {number(item.member_count)} / {number(item.max_members)}</span>
                <span>دورك: {member?.role==="owner"?"المنظّم":member?.role==="moderator"?"مشرف":member?.role==="assistant"?"مساعد":"مشارك"}</span>
              </div>
            </div>
            <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
              {!selected&&<Button variant="secondary" onClick={()=>void selectChallenge(item.id)}>فتح التحدّي</Button>}
              <Link className="btn btn-secondary" href="/manage"><Settings2 size={15}/> الإدارة</Link>
              <Link className="btn btn-ghost" href="/competition">الترتيب</Link>
            </div>
          </div>
        </Card>;
      })}
    </div>
    {showForm&&<Card>
      <h3 style={{marginTop:0}}>إنشاء مساحة تحدٍّ مستقلة</h3>
      <p className="muted-line">لا يوجد قالب ثابت. أضف تفاصيل التحدّي الآن، ثم عرّف أهدافه ونقاطه من صفحة الإدارة.</p>
      <div className="settings-grid" style={{gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))"}}>
        <label>اسم التحدّي<input className="text-input" value={title} onChange={e=>setTitle(e.target.value)} maxLength={80} placeholder="مثلاً: تحدّي تعلّم الإنجليزية"/></label>
        <label>التصنيف<input className="text-input" value={category} onChange={e=>setCategory(e.target.value)} maxLength={40}/></label>
        <label>البداية<input className="text-input" type="date" value={startDate} onChange={e=>setStartDate(e.target.value)}/></label>
        <label>النهاية<input className="text-input" type="date" value={endDate} onChange={e=>setEndDate(e.target.value)}/></label>
        <label>الصعوبة<select className="text-input" value={difficulty} onChange={e=>setDifficulty(e.target.value as typeof difficulty)}><option value="easy">مبتدئ</option><option value="medium">متوسط</option><option value="hard">متقدم</option></select></label>
        <label>السعة القصوى<select className="text-input" value={maxMembers} onChange={e=>setMaxMembers(Number(e.target.value))}>{[2,10,25,50,100,250,500].map(n=><option key={n} value={n}>{n} مشارك</option>)}</select></label>
        <label>الخصوصية<select className="text-input" value={visibility} onChange={e=>setVisibility(e.target.value as typeof visibility)}><option value="private">خاص</option><option value="public">عام</option></select></label>
        {visibility==="public"&&<label>الانضمام<select className="text-input" value={joinMode} onChange={e=>setJoinMode(e.target.value as typeof joinMode)}><option value="open">مفتوح</option><option value="approval">بموافقة المنظّم</option><option value="invite">بالدعوة فقط</option></select></label>}
      </div>
      <label style={{display:"block",marginTop:12}}>الوصف<textarea className="text-input" rows={3} maxLength={2000} value={description} onChange={e=>setDescription(e.target.value)} placeholder="اكتب الهدف وشروط المشاركة."/></label>
      <div style={{display:"flex",gap:9,marginTop:14,flexWrap:"wrap"}}>
        <Button busy={busy} disabled={title.trim().length<3||!startDate||!endDate||endDate<startDate} onClick={create}>إنشاء التحدّي</Button>
        <Button variant="secondary" onClick={()=>setShowForm(false)}>إلغاء</Button>
      </div>
    </Card>}
  </div>;
}
