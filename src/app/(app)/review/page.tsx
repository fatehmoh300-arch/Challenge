"use client";

import { useEffect, useMemo, useState } from "react";
import { Award, BookOpen, CalendarCheck, CheckCircle2, Flag, TrendingUp } from "lucide-react";
import { useApp } from "@/components/app-provider";
import { Card, LoadingState, Notice, PageTitle, ProgressBar, StatCard } from "@/components/ui";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { algeriaDate } from "@/lib/date";
import { formatArabicDate, number, percent } from "@/lib/format";
import { isFastingDate, isFullDay, isGoalActiveOnDate, pointsFromCompletions } from "@/lib/scoring.js";
import type { DailyLog, HabitCompletion, ReadingLog } from "@/lib/types";

function enumerateDates(start: string, end: string) {
  const result: string[] = [];
  const cursor = new Date(`${start}T12:00:00Z`);
  const last = new Date(`${end}T12:00:00Z`);
  while (cursor <= last) {
    result.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return result;
}

function addDays(value: string, amount: number) {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

async function fetchPages<T>(createQuery: (from: number, to: number) => any): Promise<T[]> {
  const rows: T[] = [];
  const pageSize = 500;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await createQuery(from, from + pageSize - 1);
    if (error) throw error;
    const page = (data || []) as T[];
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
}

type DayReport = {
  date: string;
  points: number;
  full: boolean;
  requiredCount: number;
  reviewed: boolean;
};

export default function ReviewPage() {
  const { user, challenge, habits } = useApp();
  const [completions, setCompletions] = useState<HabitCompletion[]>([]);
  const [readings, setReadings] = useState<ReadingLog[]>([]);
  const [dailyLogs, setDailyLogs] = useState<DailyLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const today = algeriaDate();

  useEffect(() => {
    if (!user || !challenge) {
      setLoading(false);
      return;
    }
    let live = true;
    const sb = getSupabaseBrowserClient();
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const [completionRows, readingRows, dailyRows] = await Promise.all([
          fetchPages<HabitCompletion>((from, to) =>
            sb.from("habit_completions")
              .select("habit_id,quantity,log_date,points_awarded")
              .eq("challenge_id", challenge.id)
              .eq("user_id", user.id)
              .gte("log_date", challenge.start_date)
              .lte("log_date", challenge.end_date)
              .order("log_date", { ascending: true })
              .range(from, to)),
          fetchPages<ReadingLog>((from, to) =>
            sb.from("reading_logs")
              .select("log_date,pages_read,book_title")
              .eq("challenge_id", challenge.id)
              .eq("user_id", user.id)
              .gte("log_date", challenge.start_date)
              .lte("log_date", challenge.end_date)
              .order("log_date", { ascending: true })
              .range(from, to)),
          fetchPages<DailyLog>((from, to) =>
            sb.from("daily_logs")
              .select("log_date,reviewed_at")
              .eq("challenge_id", challenge.id)
              .eq("user_id", user.id)
              .gte("log_date", challenge.start_date)
              .lte("log_date", challenge.end_date)
              .order("log_date", { ascending: true })
              .range(from, to)),
        ]);
        if (!live) return;
        setCompletions(completionRows);
        setReadings(readingRows);
        setDailyLogs(dailyRows);
      } catch (cause) {
        if (!live) return;
        setError(cause instanceof Error ? cause.message : "تعذّر تحميل مراجعة التحدّي.");
      } finally {
        if (live) setLoading(false);
      }
    };
    void load();
    return () => { live = false; };
  }, [user?.id, challenge?.id, challenge?.start_date, challenge?.end_date]);

  const observedEnd = challenge
    ? (today < challenge.end_date ? today : challenge.end_date)
    : today;
  const days = useMemo(
    () => challenge && observedEnd >= challenge.start_date
      ? enumerateDates(challenge.start_date, observedEnd)
      : [],
    [challenge?.start_date, observedEnd],
  );

  const report = useMemo(() => {
    if (!challenge) return null;
    const completionByDate = new Map<string, HabitCompletion[]>();
    for (const row of completions) {
      const list = completionByDate.get(row.log_date) || [];
      list.push(row);
      completionByDate.set(row.log_date, list);
    }
    const reviewedDates = new Set(
      dailyLogs.filter((row) => Boolean(row.reviewed_at)).map((row) => row.log_date),
    );

    const dayRows: DayReport[] = days.map((date) => {
      const dayCompletions = completionByDate.get(date) || [];
      const activeGoals = habits.filter((goal) => isGoalActiveOnDate(goal, date));
      return {
        date,
        points: pointsFromCompletions(dayCompletions, habits),
        full: isFullDay(dayCompletions, habits, date),
        requiredCount: activeGoals.filter((goal) => goal.is_required).length,
        reviewed: reviewedDates.has(date),
      };
    });

    const eligibleDays = dayRows.filter((day) => day.requiredCount > 0);
    const completedDays = eligibleDays.filter((day) => day.full).length;
    const totalPoints = dayRows.reduce((sum, day) => sum + day.points, 0);
    const pagesRead = readings.reduce((sum, row) => sum + Number(row.pages_read || 0), 0);
    const reviewedIncompleteDays = eligibleDays.filter((day) => day.reviewed && !day.full).length;
    const opportunitiesByGoal = habits.map((goal) => {
      const activeDates = days.filter((date) => isGoalActiveOnDate(goal, date));
      const goalCompletions = completions.filter((row) =>
        row.habit_id === goal.id && activeDates.includes(row.log_date),
      );
      return {
        id: goal.id,
        name: goal.name,
        required: goal.is_required,
        points: goalCompletions.reduce((sum, row) => sum + Number(row.points_awarded || 0), 0),
        done: goalCompletions.length,
        possible: activeDates.length,
        rate: activeDates.length ? goalCompletions.length / activeDates.length * 100 : 0,
        activeFrom: goal.active_from,
        activeUntil: goal.active_until,
      };
    });

    const bestDay = dayRows.reduce<DayReport | null>(
      (best, day) => !best || day.points > best.points ? day : best,
      null,
    );
    const firstSevenEnd = addDays(challenge.start_date, 6);
    const lastSevenStart = addDays(observedEnd, -6);
    const firstWindowPoints = dayRows
      .filter((day) => day.date <= firstSevenEnd)
      .reduce((sum, day) => sum + day.points, 0);
    const lastWindowPoints = dayRows
      .filter((day) => day.date >= (lastSevenStart < challenge.start_date ? challenge.start_date : lastSevenStart))
      .reduce((sum, day) => sum + day.points, 0);
    const reviewedEligibleDays = eligibleDays.filter((day) => reviewedDates.has(day.date)).length;
    const reviewCoverage = eligibleDays.length
      ? reviewedEligibleDays / eligibleDays.length * 100
      : 0;

    return {
      dayRows,
      totalPoints,
      pagesRead,
      eligibleDays: eligibleDays.length,
      completedDays,
      incompleteDays: eligibleDays.length - completedDays,
      reviewedIncompleteDays,
      bestDay,
      goalRows: opportunitiesByGoal,
      firstWindowPoints,
      lastWindowPoints,
      reviewCoverage,
    };
  }, [challenge, completions, readings, dailyLogs, habits, days, observedEnd]);

  if (loading) return <LoadingState label="جارٍ إعداد المراجعة…" />;

  return <div>
    <PageTitle
      title={challenge && today > challenge.end_date ? "التقرير النهائي" : "مراجعة التحدّي"}
      subtitle={challenge ? `من ${formatArabicDate(challenge.start_date)} إلى ${formatArabicDate(challenge.end_date)}` : "لا يوجد تحدٍّ نشط."}
    />
    {error && <Notice tone="error">{error}</Notice>}
    {challenge && today < challenge.start_date && <Notice tone="info">لم يبدأ التحدّي بعد. ستظهر المراجعة بعد تسجيل الأيام الفعلية.</Notice>}
    {challenge && today <= challenge.end_date && <Notice tone="info">هذا تقرير مرحلي حتى اليوم؛ يصبح نهائياً بعد انتهاء التحدّي في {formatArabicDate(challenge.end_date)}.</Notice>}

    {report && <>
      <div className="stats-grid">
        <StatCard label="مجموع النقاط" value={number(report.totalPoints)} hint="النقاط المجمدة في سجلات الإنجاز" icon={<Award/>} tone="blue"/>
        <StatCard label="أيام مكتملة" value={number(report.completedDays)} hint={`من ${number(report.eligibleDays)} يوماً بأهداف إلزامية`} icon={<CheckCircle2/>} tone="green"/>
        <StatCard label="أيام غير مكتملة" value={number(report.incompleteDays)} hint="أيام كانت لها أهداف إلزامية" icon={<CalendarCheck/>} tone="amber"/>
        <StatCard label="صفحات القراءة" value={number(report.pagesRead)} hint="إجمالي التحدّي حتى اليوم" icon={<BookOpen/>} tone="slate"/>
      </div>
      <div className="stats-grid stats-secondary-grid">
        <StatCard label="أيام راجعتها دون اكتمال" value={number(report.reviewedIncompleteDays)} hint="بناءً على حالة المراجعة المحفوظة" icon={<Flag/>} tone="amber"/>
        <StatCard label="تغطية المراجعة" value={percent(report.reviewCoverage)} hint="من الأيام ذات الأهداف الإلزامية" icon={<TrendingUp/>} tone="blue"/>
        <StatCard label="أفضل يوم" value={report.bestDay ? number(report.bestDay.points) : "—"} hint={report.bestDay ? formatArabicDate(report.bestDay.date) : "لا توجد إنجازات"} icon={<Award/>} tone="green"/>
        <StatCard label="نقاط أول/آخر 7 أيام" value={`${number(report.firstWindowPoints)} / ${number(report.lastWindowPoints)}`} hint="مقارنة بداية الفترة بنهايتها" icon={<TrendingUp/>} tone="slate"/>
      </div>

      <Card className="habit-stats-card">
        <div className="section-heading"><div><h3>حصيلة كل هدف</h3><p>تُحسب الفرص من الأيام التي كان فيها الهدف نشطاً، لا من عدد أيام ثابت.</p></div></div>
        {report.goalRows.length ? <div className="habit-stats-list">{report.goalRows.map((goal) =>
          <div className="habit-stat-row" key={goal.id}>
            <div>
              <strong>{goal.name}</strong>
              <span>{number(goal.done)} من {number(goal.possible)} · {goal.required ? "إلزامي" : "اختياري"} · {number(goal.points)} نقطة</span>
              <small>{formatArabicDate(goal.activeFrom)} — {goal.activeUntil ? formatArabicDate(goal.activeUntil) : "مستمر"}</small>
            </div>
            <ProgressBar value={goal.rate}/>
            <small>{percent(goal.rate)}</small>
          </div>
        )}</div> : <p className="muted-line">لا توجد أهداف مضافة إلى التحدّي.</p>}
      </Card>

      <Card className="reading-summary">
        <div><TrendingUp/><div><strong>مؤشر التقدّم</strong><span>الأيام المكتملة تُقاس على الأهداف الإلزامية النشطة في كل تاريخ. الأهداف الاختيارية لا تمنع اكتمال اليوم.</span></div></div>
        <strong>{report.eligibleDays ? percent(report.completedDays / report.eligibleDays * 100) : "—"}</strong>
      </Card>
      <div className="review-footnote"><Flag size={17}/> لا تُمنح نقاط أو أيام مكتملة لأي سجل غير موجود فعلياً في قاعدة البيانات.</div>
    </>}
  </div>;
}
