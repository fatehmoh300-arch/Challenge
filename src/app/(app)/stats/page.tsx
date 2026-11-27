"use client";

import { useEffect, useMemo, useState } from "react";
import { Award, BarChart3, BookOpen, CalendarDays, CheckCircle2, Flame, Target, TrendingUp } from "lucide-react";
import {
  Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer,
  Tooltip, XAxis, YAxis,
} from "recharts";
import { useApp } from "@/components/app-provider";
import { Card, LoadingState, Notice, PageTitle, ProgressBar, StatCard } from "@/components/ui";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { algeriaDate } from "@/lib/date";
import { formatArabicDate, number, percent } from "@/lib/format";
import { isFastingDate, isFullDay, maxPointsForDate, pointsFromCompletions } from "@/lib/scoring.js";
import type { HabitCompletion, MyProgress, ReadingLog } from "@/lib/types";
import { useLeaderboard } from "@/lib/use-leaderboard";

type DaySummary = {
  date: string;
  points: number;
  pages: number;
  full: boolean;
  requiredGoals: number;
  completions: number;
  possiblePoints: number;
};

const LEVELS = [
  { min: 0, name: "مبتدئ" },
  { min: 100, name: "ملتزم" },
  { min: 300, name: "منضبط" },
  { min: 700, name: "متقدم" },
  { min: 1500, name: "محترف" },
  { min: 3000, name: "أسطوري" },
];

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

function paginateQuery<T>(createQuery: (from: number, to: number) => any): Promise<T[]> {
  return (async () => {
    const all: T[] = [];
    const pageSize = 500;
    for (let from = 0; ; from += pageSize) {
      const { data, error } = await createQuery(from, from + pageSize - 1);
      if (error) throw error;
      const rows = (data || []) as T[];
      all.push(...rows);
      if (rows.length < pageSize) break;
    }
    return all;
  })();
}

export default function StatsPage() {
  const { user, challenge, habits } = useApp();
  const [completions, setCompletions] = useState<HabitCompletion[]>([]);
  const [readings, setReadings] = useState<ReadingLog[]>([]);
  const [progress, setProgress] = useState<MyProgress | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const { entries: board, error: boardError } = useLeaderboard(challenge?.id);
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
        const [completionRows, readingRows, progressResult] = await Promise.all([
          paginateQuery<HabitCompletion>((from, to) =>
            sb.from("habit_completions")
              .select("habit_id,quantity,log_date,points_awarded")
              .eq("challenge_id", challenge.id)
              .eq("user_id", user.id)
              .gte("log_date", challenge.start_date)
              .lte("log_date", challenge.end_date)
              .order("log_date", { ascending: true })
              .range(from, to)),
          paginateQuery<ReadingLog>((from, to) =>
            sb.from("reading_logs")
              .select("log_date,pages_read,book_title")
              .eq("challenge_id", challenge.id)
              .eq("user_id", user.id)
              .gte("log_date", challenge.start_date)
              .lte("log_date", challenge.end_date)
              .order("log_date", { ascending: true })
              .range(from, to)),
          sb.rpc("get_my_progress"),
        ]);
        if (progressResult.error) throw progressResult.error;
        if (!live) return;
        setCompletions(completionRows);
        setReadings(readingRows);
        setProgress(((progressResult.data || []) as MyProgress[])[0] || null);
      } catch (cause) {
        if (!live) return;
        setError(cause instanceof Error ? cause.message : "تعذّر تحميل الإحصائيات.");
      } finally {
        if (live) setLoading(false);
      }
    };
    void load();
    return () => { live = false; };
  }, [user?.id, challenge?.id, challenge?.start_date, challenge?.end_date]);

  const summaries = useMemo<DaySummary[]>(() => {
    if (!challenge) return [];
    const dates = enumerateDates(challenge.start_date, challenge.end_date)
      .filter((date) => date <= today);
    const completionsByDate = new Map<string, HabitCompletion[]>();
    const readingsByDate = new Map<string, number>();
    for (const row of completions) {
      const list = completionsByDate.get(row.log_date) || [];
      list.push(row);
      completionsByDate.set(row.log_date, list);
    }
    for (const row of readings) {
      readingsByDate.set(
        row.log_date,
        (readingsByDate.get(row.log_date) || 0) + Number(row.pages_read || 0),
      );
    }

    return dates.map((date) => {
      const dayRows = completionsByDate.get(date) || [];
      const activeGoals = habits.filter((goal) =>
        goal.is_active &&
        goal.active_from <= date &&
        (!goal.active_until || goal.active_until >= date) &&
        (!goal.is_fasting || isFastingDate(date)),
      );
      return {
        date,
        points: pointsFromCompletions(dayRows, habits),
        pages: readingsByDate.get(date) || 0,
        full: isFullDay(dayRows, habits, date),
        requiredGoals: activeGoals.filter((goal) => goal.is_required).length,
        completions: dayRows.filter((row) => activeGoals.some((goal) => goal.id === row.habit_id)).length,
        possiblePoints: maxPointsForDate(date, habits),
      };
    });
  }, [challenge, completions, readings, habits, today]);

  const metrics = useMemo(() => {
    const points = summaries.reduce((sum, day) => sum + day.points, 0);
    const possiblePoints = summaries.reduce((sum, day) => sum + day.possiblePoints, 0);
    const opportunities = summaries.reduce((sum, day) => {
      const [year, month, date] = day.date.split("-").map(Number);
      const value = `${year}-${String(month).padStart(2, "0")}-${String(date).padStart(2, "0")}`;
      const active = habits.filter((goal) =>
        goal.is_active &&
        goal.active_from <= value &&
        (!goal.active_until || goal.active_until >= value) &&
        (!goal.is_fasting || isFastingDate(value)),
      );
      return sum + active.length;
    }, 0);
    const completedOpportunities = summaries.reduce((sum, day) => sum + day.completions, 0);
    const eligibleDays = summaries.filter((day) => day.requiredGoals > 0);
    const completedDays = eligibleDays.filter((day) => day.full).length;
    const incompleteDays = eligibleDays.length - completedDays;

    let longestStreak = 0;
    let run = 0;
    for (const day of summaries) {
      if (day.requiredGoals > 0 && day.full) {
        run += 1;
        longestStreak = Math.max(longestStreak, run);
      } else {
        run = 0;
      }
    }
    let currentStreak = 0;
    let cursor = summaries.length - 1;
    if (cursor >= 0 && summaries[cursor].date === today && summaries[cursor].requiredGoals > 0 && !summaries[cursor].full) cursor -= 1;
    for (; cursor >= 0; cursor -= 1) {
      const day = summaries[cursor];
      if (day.requiredGoals > 0 && day.full) currentStreak += 1;
      else break;
    }

    const bestDay = summaries.reduce<DaySummary | null>(
      (best, day) => !best || day.points > best.points ? day : best,
      null,
    );
    const totalPages = summaries.reduce((sum, day) => sum + day.pages, 0);

    return {
      points,
      possiblePoints,
      pointRate: possiblePoints ? points / possiblePoints * 100 : 0,
      completionRate: opportunities ? completedOpportunities / opportunities * 100 : 0,
      opportunities,
      completedOpportunities,
      completedDays,
      incompleteDays,
      currentStreak,
      longestStreak,
      bestDay,
      totalPages,
    };
  }, [summaries, habits, today]);

  const perGoal = useMemo(() => {
    return habits.map((goal) => {
      const opportunities = summaries.filter((day) => {
        const date = day.date;
        return goal.is_active &&
          goal.active_from <= date &&
          (!goal.active_until || goal.active_until >= date) &&
          (!goal.is_fasting || isFastingDate(date));
      }).length;
      const done = completions.filter((row) =>
        row.habit_id === goal.id &&
        summaries.some((day) => day.date === row.log_date),
      ).length;
      const points = completions
        .filter((row) => row.habit_id === goal.id)
        .reduce((sum, row) => sum + Number(row.points_awarded || 0), 0);
      return {
        id: goal.id,
        name: goal.name,
        required: goal.is_required,
        done,
        opportunities,
        rate: opportunities ? done / opportunities * 100 : 0,
        points,
      };
    });
  }, [habits, summaries, completions]);

  const chartRows = useMemo(() => {
    const windowed = summaries.length > 60 ? summaries.slice(-60) : summaries;
    return windowed.map((day) => ({
      label: new Intl.DateTimeFormat("ar-DZ", { day: "numeric", month: "short", timeZone: "UTC" })
        .format(new Date(`${day.date}T12:00:00Z`)),
      points: day.points,
      pages: day.pages,
    }));
  }, [summaries]);

  const level = [...LEVELS].reverse().find((item) => item.min <= (progress?.xp || 0)) || LEVELS[0];

  if (loading) return <LoadingState label="جارٍ حساب مؤشرات التحدّي…" />;

  return <div>
    <PageTitle title="الإحصائيات" subtitle={challenge ? `بيانات فعلية من ${formatArabicDate(challenge.start_date)} إلى ${formatArabicDate(challenge.end_date)}` : "لا يوجد تحدٍّ نشط."}/>
    {error && <Notice tone="error">{error}</Notice>}
    <div className="stats-grid">
      <StatCard label="مجموع النقاط" value={number(metrics.points)} hint="النقاط المجمدة للإنجازات" icon={<Award/>} tone="blue"/>
      <StatCard label="عدد الإنجازات" value={number(completions.length)} hint="سجلات إنجاز فعلية" icon={<CheckCircle2/>} tone="green"/>
      <StatCard label="إكمال الأهداف" value={percent(metrics.completionRate)} hint={`${number(metrics.completedOpportunities)} من ${number(metrics.opportunities)} فرصة هدف`} icon={<Target/>} tone="amber"/>
      <StatCard label="الأيام المكتملة" value={number(metrics.completedDays)} hint={`${number(metrics.incompleteDays)} يوم غير مكتمل`} icon={<CalendarDays/>} tone="slate"/>
      <StatCard label="السلسلة الحالية" value={`${number(metrics.currentStreak)} يوم`} hint="الأيام الإلزامية المتتالية" icon={<Flame/>} tone="amber"/>
      <StatCard label="أطول سلسلة" value={`${number(metrics.longestStreak)} يوم`} hint="أفضل تسلسل مكتمل" icon={<TrendingUp/>} tone="green"/>
    </div>
    <div className="stats-grid stats-secondary-grid">
      <StatCard label="نسبة النقاط" value={percent(metrics.pointRate)} hint={`${number(metrics.points)} / ${number(metrics.possiblePoints)} نقطة ممكنة`} icon={<BarChart3/>} tone="blue"/>
      <StatCard label="صفحات القراءة" value={number(metrics.totalPages)} hint="خلال هذا التحدّي" icon={<BookOpen/>} tone="slate"/>
      <StatCard label="أفضل يوم" value={metrics.bestDay ? number(metrics.bestDay.points) : "—"} hint={metrics.bestDay ? formatArabicDate(metrics.bestDay.date) : "لا توجد إنجازات"} icon={<Award/>} tone="amber"/>
      <StatCard label="مستواك العام" value={level.name} hint={`${number(progress?.xp || 0)} XP تراكمية · ${number(progress?.achievements?.length || 0)} شارة`} icon={<TrendingUp/>} tone="green"/>
    </div>

    {chartRows.length > 0 && <div className="chart-grid">
      <Card className="chart-card">
        <div className="section-heading"><div><h3>تطور النقاط</h3><p>{summaries.length > 60 ? "آخر 60 يوماً من فترة التحدّي" : "النقاط الفعلية المسجلة لكل يوم"}</p></div></div>
        <div className="chart-wrap"><ResponsiveContainer width="100%" height="100%"><LineChart data={chartRows}><CartesianGrid strokeDasharray="3 3" vertical={false}/><XAxis dataKey="label" tickLine={false}/><YAxis allowDecimals={false} width={34}/><Tooltip/><Line type="monotone" dataKey="points" name="النقاط" stroke="#3478d4" strokeWidth={2.5} dot={false}/></LineChart></ResponsiveContainer></div>
      </Card>
      <Card className="chart-card">
        <div className="section-heading"><div><h3>القراءة اليومية</h3><p>عدد الصفحات المسجلة خلال الفترة المعروضة</p></div></div>
        <div className="chart-wrap"><ResponsiveContainer width="100%" height="100%"><BarChart data={chartRows}><CartesianGrid strokeDasharray="3 3" vertical={false}/><XAxis dataKey="label" tickLine={false}/><YAxis allowDecimals={false} width={34}/><Tooltip/><Bar dataKey="pages" name="صفحات" fill="#70a4e8" radius={[5,5,0,0]}/></BarChart></ResponsiveContainer></div>
      </Card>
    </div>}

    <Card className="habit-stats-card">
      <div className="section-heading"><div><h3>توزيع الإنجازات حسب الهدف</h3><p>كل هدف محسوب ضمن فترة نشاطه الفعلية، مع فصل الإلزامي عن الاختياري.</p></div></div>
      {perGoal.length ? <div className="habit-stats-list">{perGoal.map((goal) =>
        <div className="habit-stat-row" key={goal.id}>
          <div><strong>{goal.name}</strong><span>{number(goal.done)} / {number(goal.opportunities)} · {goal.required ? "إلزامي" : "اختياري"} · {number(goal.points)} نقطة</span></div>
          <ProgressBar value={goal.rate}/>
          <small>{percent(goal.rate)}</small>
        </div>
      )}</div> : <p className="muted-line">لم تُضف أهداف إلى هذا التحدّي بعد.</p>}
    </Card>

    <Card className="participant-compare">
      <div className="section-heading"><div><h3>مقارنة المشاركين</h3><p>المؤشرات عامة ومجمّعة، ولا تعرض سجلات العادات اليومية للآخرين.</p></div></div>
      {boardError ? <Notice tone="error">{boardError}</Notice> : board.length ? <div className="compare-rows">{board.map((entry) =>
        <div className="compare-row" key={entry.user_id}>
          <span className="compare-rank">{number(entry.competition_rank)}</span>
          <strong>{entry.display_name}{entry.user_id === user?.id ? " · أنت" : ""}</strong>
          <span>{number(entry.points)} نقطة</span>
          <span>{percent(entry.adherence_pct)} التزام</span>
          <span>{number(entry.habits_done)} إنجاز</span>
        </div>
      )}</div> : <p className="muted-line">لا توجد بيانات منافسة بعد.</p>}
    </Card>
  </div>;
}

