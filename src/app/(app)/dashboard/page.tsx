"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Activity, ArrowLeft, BookOpen, CalendarDays, CheckCircle2, Flame, Footprints, Sparkles, Target, Trophy } from "lucide-react";
import { Card, EmptyState, LoadingState, PageTitle, ProgressBar, StatCard } from "@/components/ui";
import { useApp } from "@/components/app-provider";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { algeriaDate, daysUntil, isFastingDay } from "@/lib/date";
import { isGoalActiveOnDate } from "@/lib/scoring.js";
import { formatArabicDate, number, percent } from "@/lib/format";
import { useLeaderboard } from "@/lib/use-leaderboard";

export default function DashboardPage() {
  const { user, profile, challenge, habits } = useApp();
  const [done, setDone] = useState<string[]>([]);
  const [earnedPoints, setEarnedPoints] = useState<Record<string, number>>({});
  const [pages, setPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const { entries: board, loading: boardLoading } = useLeaderboard(challenge?.id);
  const today = algeriaDate();
  const start = challenge?.start_date || today;
  const end = challenge?.end_date || today;
  const started = today >= start;
  const activeDay = started && today <= end;
  const remaining = today < start ? daysUntil(today, start) : today <= end ? daysUntil(today, end) : 0;

  useEffect(() => {
    if (!user || !challenge) return;
    let live = true;
    const load = async () => {
      setLoading(true);
      const supabase = getSupabaseBrowserClient();
      const [{ data: completions }, { data: reading }] = await Promise.all([
        supabase.from("habit_completions").select("habit_id,points_awarded").eq("challenge_id", challenge.id).eq("user_id", user.id).eq("log_date", today),
        supabase.from("reading_logs").select("pages_read").eq("challenge_id", challenge.id).eq("user_id", user.id).eq("log_date", today).maybeSingle(),
      ]);
      if (!live) return;
      setDone((completions || []).map((x: {habit_id:string})=>x.habit_id));
      setEarnedPoints(Object.fromEntries((completions || []).map((x: {habit_id:string;points_awarded:number})=>[x.habit_id,Number(x.points_awarded)])));
      setPages(reading?.pages_read || 0);
      setLoading(false);
    };
    void load();
    return () => { live = false; };
  }, [user, challenge, today]);

  const mine = board.find(x=>x.user_id===user?.id);
  const dailyHabits = habits.filter(h=>isGoalActiveOnDate(h,today));
  const dayScore = dailyHabits.reduce((sum,h)=>sum+(done.includes(h.id)?(earnedPoints[h.id]??h.points):0),0);
  const maxToday = dailyHabits.reduce((sum,h)=>sum+h.points,0);
  const scorePct = mine?.adherence_pct || 0;
  const dayPct = maxToday ? Math.round(dayScore / maxToday * 100) : 0;
  const weekStart = useMemo(()=>{ const d=new Date(`${today}T12:00:00Z`); d.setUTCDate(d.getUTCDate()-((d.getUTCDay()+6)%7)); return d.toISOString().slice(0,10); },[today]);

  return <><PageTitle title="لوحة التحدّي" subtitle={`${formatArabicDate(today,{weekday:"long",day:"numeric",month:"long",year:"numeric"})} · ${profile?.display_name || "مشارك"}`} action={<span className="challenge-tag"><Sparkles size={15}/> {challenge?.category||"تحدٍّ نشط"}</span>}/>
    <Card className="hero-card"><div className="hero-copy"><span className="hero-label">{today < start ? "الاستعداد يبدأ الآن" : today <= end ? "كل يوم يصنع فرقاً" : "اكتمل التحدّي"}</span><h2>{challenge?.title}</h2><p>التزام يومي بسيط، ونتيجة تتراكم مع الوقت.</p><div className="hero-meta"><span><CalendarDays size={16}/>{formatArabicDate(start,{day:"numeric",month:"long"})} — {formatArabicDate(end,{day:"numeric",month:"long",year:"numeric"})}</span><span><Target size={16}/>{today < start ? `باقي ${number(remaining)} أيام على البداية` : today <= end ? `باقي ${number(remaining)} أيام` : "انتهى التحدّي"}</span></div></div><div className="hero-ring"><div className="ring-value"><strong>{mine ? percent(scorePct) : "—"}</strong><span>الالتزام</span></div></div><div className="hero-progress"><div><span>التقدّم العام</span><strong>{mine ? `${number(mine.points)} / ${number(mine.possible_points)}` : "لا توجد بيانات بعد"}</strong></div><ProgressBar value={scorePct}/></div></Card>
    <div className="stats-grid"><StatCard label="مجموع نقاطك" value={number(mine?.points || 0)} hint="نقطة مكتسبة" icon={<Trophy size={20}/>} tone="blue"/><StatCard label="أيام مكتملة" value={number(mine?.full_days || 0)} hint="كل العادات المستحقة" icon={<CheckCircle2 size={20}/>} tone="green"/><StatCard label="سلسلة الالتزام" value={`${number(mine?.best_streak || 0)} يوم`} hint="أفضل سلسلة" icon={<Flame size={20}/>} tone="amber"/><StatCard label="صفحات القراءة" value={number(mine?.pages_read || 0)} hint="إجمالي التحدّي" icon={<BookOpen size={20}/>} tone="slate"/></div>
    <div className="dashboard-columns"><Card><div className="section-heading"><div><h3>إنجازات اليوم</h3><p>{activeDay ? `${number(dayScore)} من ${number(maxToday)} نقاط` : today < start ? "كل يوم يصنع فرقاً" : "التحدّي مكتمل"}</p></div><Link href="/daily">فتح المتابعة <ArrowLeft size={15}/></Link></div>{today < start ? <EmptyState title="موعد الانطلاق قريب" text="يمكنك مراجعة تفاصيل التحدّي وتجهيز أهدافك."/> : <><div className="today-progress"><strong>{number(dayScore)} / {number(maxToday)}</strong><span>نقاط اليوم</span><ProgressBar value={dayPct}/></div><div className="habit-mini-list">{dailyHabits.map(h=><div className="habit-mini" key={h.id}><span className={`mini-check ${done.includes(h.id)?"checked":""}`}>{done.includes(h.id)?"✓":""}</span><span>{h.name}</span><small>{done.includes(h.id)?"مكتمل":"لم يسجل"}</small></div>)}</div></>}</Card>
      <Card><div className="section-heading"><div><h3>لوحة المنافسة</h3><p>النتائج الإجمالية للمشاركين</p></div><Link href="/competition">التفاصيل <ArrowLeft size={15}/></Link></div>{boardLoading ? <LoadingState/> : board.length ? <div className="leader-list">{board.slice(0,3).map((entry,index)=><div className={`leader-row ${entry.user_id===user?.id?"mine":""}`} key={entry.user_id}><span className="leader-rank">{entry.competition_rank}</span><div className="avatar">{entry.display_name?.slice(0,1)||"م"}</div><div className="leader-name"><strong>{entry.display_name}{entry.user_id===user?.id?" (أنت)":""}</strong><span>{percent(entry.adherence_pct)} التزام</span></div><strong className="leader-points">{number(entry.points)} <small>نقطة</small></strong></div>)}</div> : <EmptyState title="بانتظار المشاركين" text="ستظهر المقارنة هنا بعد إنشاء التحدّي وانضمام المشاركين."/>}</Card></div>
    <div className="bottom-insight"><div className="insight-icon"><Footprints size={21}/></div><div><strong>الهدف الأسبوعي للقراءة</strong><span>{number(pages)} صفحة اليوم · الهدف {number(challenge?.weekly_reading_goal || 140)} صفحة أسبوعياً</span></div><Link href="/stats">عرض الإحصائيات <ArrowLeft size={15}/></Link></div>
  </>;
}
