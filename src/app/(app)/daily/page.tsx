"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Activity, BookOpen, Check, CheckCircle2, Clock3, Dumbbell, Footprints, Save, Sunrise, Trophy } from "lucide-react";
import { useApp } from "@/components/app-provider";
import { Button, Card, Notice, PageTitle, ProgressBar } from "@/components/ui";
import { algeriaDate, isFastingDay, isWithin } from "@/lib/date";
import { formatArabicDate, number } from "@/lib/format";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { isGoalActiveOnDate } from "@/lib/scoring.js";
import { refreshLeaderboard } from "@/lib/use-leaderboard";
import type { DailyLog, HabitCompletion, ReadingLog } from "@/lib/types";

const icons: Record<string, React.ReactNode> = { fajr:<Sunrise/>, exercise:<Footprints/>, chess:<Trophy/>, project:<Activity/>, reading:<BookOpen/>, fasting:<CheckCircle2/> };

function DailyPageContent() {
  const { user, challenge, habits } = useApp();
  const params = useSearchParams();
  const today = algeriaDate();
  const [date,setDate] = useState(params.get("date") || today);
  const [completions,setCompletions] = useState<HabitCompletion[]>([]);
  const [dayLog,setDayLog] = useState<DailyLog | null>(null);
  const [reading,setReading] = useState<ReadingLog | null>(null);
  const [pages,setPages] = useState("0");
  const [chessGames,setChessGames] = useState(2);
  const [busyId,setBusyId] = useState("");
  const [savingReading,setSavingReading] = useState(false);
  const [message,setMessage] = useState("");
  const [error,setError] = useState("");
  const [loading,setLoading] = useState(true);
  const eligible = Boolean(challenge && isWithin(date,challenge.start_date,challenge.end_date) && date<=today);
  const canEdit = Boolean(eligible && challenge && (challenge.status==="open" || challenge.status==="active"));
  const fastingToday = isFastingDay(date);
  const visibleHabits = habits.filter(h=>isGoalActiveOnDate(h,date));
  const score = visibleHabits.reduce((sum,h)=>{const completion=completions.find(x=>x.habit_id===h.id);return sum+(completion?Number(completion.points_awarded??0):0);},0);
  const maxPoints = visibleHabits.reduce((sum,h)=>sum+h.points,0);
  const requiredCount = visibleHabits.filter(h=>h.is_required).length;
  const requiredDone = visibleHabits.filter(h=>h.is_required && completions.some(x=>x.habit_id===h.id)).length;

  useEffect(()=>{ if(params.get("date") && params.get("date")!==date) setDate(params.get("date")!); },[params]);
  useEffect(()=>{
    if(!user||!challenge||!eligible){setLoading(false);return;}
    let live=true;
    const load=async()=>{
      setLoading(true);setError("");
      const sb=getSupabaseBrowserClient();
      const [completionResult,logResult,readingResult]=await Promise.all([
        sb.from("habit_completions").select("habit_id,quantity,log_date,points_awarded").eq("challenge_id",challenge.id).eq("user_id",user.id).eq("log_date",date),
        sb.from("daily_logs").select("log_date,reviewed_at").eq("challenge_id",challenge.id).eq("user_id",user.id).eq("log_date",date).maybeSingle(),
        sb.from("reading_logs").select("log_date,pages_read,book_title").eq("challenge_id",challenge.id).eq("user_id",user.id).eq("log_date",date).maybeSingle(),
      ]);
      if(!live)return;
      if(completionResult.error)throw completionResult.error;
      if(logResult.error)throw logResult.error;
      if(readingResult.error)throw readingResult.error;
      setCompletions((completionResult.data||[]) as HabitCompletion[]);
      setDayLog(logResult.data as DailyLog|null);
      setReading(readingResult.data as ReadingLog|null);
      setPages(String(readingResult.data?.pages_read??0));
      setLoading(false);
    };
    void load().catch((cause)=>{
      if(!live)return;
      setError(cause instanceof Error?cause.message:"تعذّر تحميل سجلات هذا اليوم.");
      setLoading(false);
    });
    return()=>{live=false;};
  },[user?.id,challenge?.id,date,eligible]);

  const toggle = async (habitId:string, habitKey:string, points:number) => {
    if(!user||!challenge||!canEdit)return;
    setBusyId(habitId);setError("");setMessage("");
    try{
      const sb=getSupabaseBrowserClient();
      const existing=completions.find(x=>x.habit_id===habitId);
      if(existing){
        const {error:e}=await sb.from("habit_completions").delete().eq("challenge_id",challenge.id).eq("user_id",user.id).eq("habit_id",habitId).eq("log_date",date);
        if(e)throw e;
        setCompletions(prev=>prev.filter(x=>x.habit_id!==habitId));
      }else{
        const {error:logError}=await sb.from("daily_logs").upsert({challenge_id:challenge.id,user_id:user.id,log_date:date},{onConflict:"challenge_id,user_id,log_date",ignoreDuplicates:true});
        if(logError)throw logError;
        const {error:e}=await sb.from("habit_completions").insert({challenge_id:challenge.id,user_id:user.id,habit_id:habitId,log_date:date,quantity:habitKey==="chess"?chessGames:1});
        if(e)throw e;
        setCompletions(prev=>[...prev,{habit_id:habitId,quantity:habitKey==="chess"?chessGames:1,points_awarded:points,log_date:date}]);
        setDayLog(prev=>prev||{log_date:date,reviewed_at:null});
      }
      void refreshLeaderboard(challenge.id);
      setMessage("تم حفظ التغيير.");
    }catch(e){setError(e instanceof Error?e.message:"تعذّر حفظ الإنجاز.");}
    finally{setBusyId("");}
  };

  const saveReading=async(e:React.FormEvent)=>{
    e.preventDefault();if(!user||!challenge||!canEdit)return;
    const count=Number(pages);if(!Number.isInteger(count)||count<0||count>2000){setError("أدخل عدداً صحيحاً بين 0 و2000 صفحة.");return;}
    setSavingReading(true);setError("");setMessage("");
    try{
      const sb=getSupabaseBrowserClient();const {error:dayError}=await sb.from("daily_logs").upsert({challenge_id:challenge.id,user_id:user.id,log_date:date},{onConflict:"challenge_id,user_id,log_date",ignoreDuplicates:true});if(dayError)throw dayError;const {error:e}=await sb.from("reading_logs").upsert({challenge_id:challenge.id,user_id:user.id,log_date:date,pages_read:count,book_title:challenge.reading_book},{onConflict:"challenge_id,user_id,log_date"});
      if(e)throw e;setDayLog(prev=>prev||{log_date:date,reviewed_at:null});setReading({log_date:date,pages_read:count,book_title:challenge.reading_book});setMessage("تم حفظ سجل القراءة.");
    }catch(err){setError(err instanceof Error?err.message:"تعذّر حفظ القراءة.");}
    finally{setSavingReading(false);}
  };

  const reviewDay=async()=>{
    if(!user||!challenge||!eligible)return;
    setSavingReading(true);setError("");
    try{
      const sb=getSupabaseBrowserClient();
      const {error:e}=await sb.from("daily_logs").upsert({challenge_id:challenge.id,user_id:user.id,log_date:date,reviewed_at:new Date().toISOString()},{onConflict:"challenge_id,user_id,log_date"});
      if(e)throw e;setDayLog({log_date:date,reviewed_at:new Date().toISOString()});setMessage("تم إغلاق سجل هذا اليوم.");
    }catch(err){setError(err instanceof Error?err.message:"تعذّر إنهاء اليوم.");}
    finally{setSavingReading(false);}
  };

  const pageDateLabel=useMemo(()=>formatArabicDate(date,{weekday:"long",day:"numeric",month:"long",year:"numeric"}),[date]);
  return <><PageTitle title="الإنجاز اليومي" subtitle="سجّل ما أنجزته فعلياً، ويمكنك التراجع عن أي تسجيل بالضغط عليه مرة أخرى." action={<span className="date-pill"><Clock3 size={15}/>{pageDateLabel}</span>}/>
    <div className="daily-toolbar"><label>تاريخ المتابعة<input type="date" className="text-input date-input" value={date} max={today} min={challenge?.start_date} onChange={e=>setDate(e.target.value)}/></label><div className="daily-score"><span>نقاط اليوم</span><strong>{number(score)} <small>/ {number(maxPoints)}</small></strong></div></div>
    {!eligible ? <Notice tone="warning">لا يمكن عرض التسجيل لهذا التاريخ. اختر يوماً ضمن فترة التحدّي، على ألا يكون في المستقبل.</Notice> : <>
      {!canEdit&&<Notice tone="warning">التحدّي متوقف أو مكتمل؛ يمكنك مراجعة سجلاتك السابقة، لكن لا يمكن تعديلها الآن.</Notice>}
      <Card className="daily-progress-card"><div><span>تقدّم اليوم</span><strong>{number(score)} من {number(maxPoints)} نقاط</strong></div><ProgressBar value={maxPoints>0?score/maxPoints*100:0}/><small>{maxPoints===0?"لم تُضف أهداف لهذا التاريخ بعد.":requiredCount>0&&requiredDone===requiredCount?"اكتملت جميع الأهداف الإلزامية لهذا اليوم.":"تُحتسب النقاط حسب وزن كل هدف."}</small></Card>
      {visibleHabits.length===0&&<Notice tone="warning">لا توجد أهداف مفعّلة لهذا التاريخ. يمكن لمنظّم التحدّي إضافتها من صفحة إدارة التحدّي.</Notice>}<div className="habit-grid">{visibleHabits.map(h=>{const checked=completions.some(c=>c.habit_id===h.id);return <Card className={`habit-card ${checked?"completed":""}`} key={h.id}><div className="habit-card-top"><div className={`habit-icon ${checked?"done":""}`}>{icons[h.habit_key]||<Check/>}</div><span className={`status-chip ${checked?"done":"pending"}`}>{checked?"تم الإنجاز":"بانتظار التسجيل"}</span></div><h3>{h.name}</h3><p>{h.description}</p><small className="muted-line">{number(h.points)} نقاط · {h.is_required?"إلزامي":"اختياري"}</small>{h.habit_key==="chess"&&!checked&&<label className="mini-field">عدد المباريات<select value={chessGames} onChange={e=>setChessGames(Number(e.target.value))}><option value={1}>مباراة واحدة</option><option value={2}>مباراتان</option></select></label>}<Button variant={checked?"secondary":"primary"} busy={busyId===h.id} className="full-width" onClick={()=>toggle(h.id,h.habit_key,h.points)} disabled={!canEdit}>{checked?"إلغاء التسجيل":"تسجيل الإنجاز"}{checked?<CheckCircle2 size={16}/>:<Check size={16}/>}</Button></Card>})}</div>
      {fastingToday&&visibleHabits.some(h=>h.is_fasting)&&<div className="fasting-note"><CheckCircle2 size={17}/><span>اليوم مخصّص للصيام (الاثنين أو الخميس). تسجيله يمنح نقطة إضافية.</span></div>}
      <Card className="reading-entry"><div className="reading-header"><div className="habit-icon"><BookOpen/></div><div><h3>سجل القراءة</h3><p>تسجيل عدد الصفحات مستقل عن إنجاز عادة القراءة أعلاه.</p></div></div><form onSubmit={saveReading} className="reading-form"><label>عدد الصفحات المقروءة<input className="text-input" type="number" min="0" max="2000" step="1" value={pages} onChange={e=>setPages(e.target.value)}/></label><Button type="submit" busy={savingReading} disabled={!canEdit}><Save size={16}/> حفظ الصفحات</Button></form><small className="muted-line">الكتاب الحالي: {challenge?.reading_book||"لم يُحدّد بعد"} · المسجّل لهذا اليوم: {number(reading?.pages_read||0)} صفحة</small></Card>
      <div className="day-finish"><div><strong>{dayLog?.reviewed_at?"تمت مراجعة هذا اليوم":"هل انتهيت من تسجيل إنجازاتك؟"}</strong><span>{dayLog?.reviewed_at?"تم إغلاق السجل ويمكنك تعديل العادات أو القراءة ضمن قيود التاريخ.":"إنهاء اليوم يميّز اليوم الذي راجعته عن الأيام التي لم تسجّل بياناتها."}</span></div><Button variant="secondary" onClick={reviewDay} busy={savingReading} disabled={!canEdit||Boolean(dayLog?.reviewed_at)}>إنهاء اليوم</Button></div>
    </>}
    {message&&<Notice tone="success">{message}</Notice>}{error&&<Notice tone="error">{error}</Notice>}
  </>;
}

export default function DailyPage() { return <Suspense fallback={<div className="loading-state">جارٍ تحميل سجل اليوم…</div>}><DailyPageContent/></Suspense>; }
