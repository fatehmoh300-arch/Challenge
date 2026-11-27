"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { useApp } from "@/components/app-provider";
import { Card, LoadingState, Notice, PageTitle } from "@/components/ui";
import { algeriaDate } from "@/lib/date";
import { formatArabicDate, number } from "@/lib/format";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { isFastingDate, isFullDay, isGoalActiveOnDate, maxPointsForDate } from "@/lib/scoring.js";
import type { HabitCompletion } from "@/lib/types";

type DailyRow = { log_date: string; reviewed_at: string | null };

function shiftMonth(value: string, amount: number) {
  const [year, month] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1 + amount, 1, 12));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function getMonthDays(month: string): (string | null)[] {
  const [year, monthNumber] = month.split("-").map(Number);
  const first = new Date(Date.UTC(year, monthNumber - 1, 1, 12));
  const count = new Date(Date.UTC(year, monthNumber, 0, 12)).getUTCDate();
  const offset = (first.getUTCDay() + 6) % 7;
  return [
    ...Array.from({ length: offset }, () => null),
    ...Array.from({ length: count }, (_, index) =>
      `${month}-${String(index + 1).padStart(2, "0")}`,
    ),
  ];
}

export default function CalendarPage() {
  const { user, challenge, habits } = useApp();
  const [month, setMonth] = useState("");
  const [logs, setLogs] = useState<DailyRow[]>([]);
  const [completions, setCompletions] = useState<HabitCompletion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const today = algeriaDate();

  useEffect(() => {
    if (challenge?.start_date) setMonth(challenge.start_date.slice(0, 7));
  }, [challenge?.id, challenge?.start_date]);

  useEffect(() => {
    if (!user || !challenge) {
      setLoading(false);
      return;
    }
    let live = true;
    const load = async () => {
      setLoading(true);
      setError("");
      const sb = getSupabaseBrowserClient();
      const [logResult, completionResult] = await Promise.all([
        sb.from("daily_logs")
          .select("log_date,reviewed_at")
          .eq("challenge_id", challenge.id)
          .eq("user_id", user.id)
          .gte("log_date", challenge.start_date)
          .lte("log_date", challenge.end_date),
        sb.from("habit_completions")
          .select("habit_id,quantity,points_awarded,log_date")
          .eq("challenge_id", challenge.id)
          .eq("user_id", user.id)
          .gte("log_date", challenge.start_date)
          .lte("log_date", challenge.end_date),
      ]);
      if (!live) return;
      if (logResult.error) {
        setError(logResult.error.message);
        setLoading(false);
        return;
      }
      if (completionResult.error) {
        setError(completionResult.error.message);
        setLoading(false);
        return;
      }
      setLogs((logResult.data || []) as DailyRow[]);
      setCompletions((completionResult.data || []) as HabitCompletion[]);
      setLoading(false);
    };
    void load();
    return () => { live = false; };
  }, [user?.id, challenge?.id, challenge?.start_date, challenge?.end_date]);

  const days = useMemo(() => month ? getMonthDays(month) : [], [month]);
  const logByDate = useMemo(
    () => new Map(logs.map((row) => [row.log_date, row])),
    [logs],
  );
  const completionByDate = useMemo(() => {
    const map = new Map<string, HabitCompletion[]>();
    for (const row of completions) {
      const list = map.get(row.log_date) || [];
      list.push(row);
      map.set(row.log_date, list);
    }
    return map;
  }, [completions]);

  const minMonth = challenge?.start_date.slice(0, 7) || "";
  const maxMonth = challenge?.end_date.slice(0, 7) || "";
  const canPrevious = Boolean(month && minMonth && month > minMonth);
  const canNext = Boolean(month && maxMonth && month < maxMonth);
  const monthTitle = month
    ? new Intl.DateTimeFormat("ar-DZ", { month: "long", year: "numeric", timeZone: "UTC" })
        .format(new Date(`${month}-01T12:00:00Z`))
    : "تقويم التحدّي";
  const totalDays = challenge
    ? Math.floor((Date.parse(`${challenge.end_date}T12:00:00Z`) - Date.parse(`${challenge.start_date}T12:00:00Z`)) / 86_400_000) + 1
    : 0;

  if (loading) return <LoadingState label="جارٍ تحميل سجلّ التقويم…" />;

  return <div>
    <PageTitle
      title="تقويم التحدّي"
      subtitle={challenge ? `${formatArabicDate(challenge.start_date)} — ${formatArabicDate(challenge.end_date)}` : "لا يوجد تحدٍّ نشط."}
      action={<span className="month-tag"><CalendarDays size={15}/>{number(totalDays)} يوماً</span>}
    />
    {error && <Notice tone="error">{error}</Notice>}
    {challenge && month && <>
      <Card className="calendar-card">
        <div className="calendar-month-toolbar">
          <button type="button" aria-label="الشهر السابق" disabled={!canPrevious} onClick={() => setMonth(value => shiftMonth(value, -1))}><ChevronRight size={18}/></button>
          <strong>{monthTitle}</strong>
          <button type="button" aria-label="الشهر التالي" disabled={!canNext} onClick={() => setMonth(value => shiftMonth(value, 1))}><ChevronLeft size={18}/></button>
        </div>
        <div className="calendar-weekdays">
          {["الاثنين","الثلاثاء","الأربعاء","الخميس","الجمعة","السبت","الأحد"].map((label) => <span key={label}>{label}</span>)}
        </div>
        <div className="calendar-grid">
          {days.map((date, index) => {
            if (!date) return <div key={`blank-${index}`} className="calendar-empty" />;
            const inRange = date >= challenge.start_date && date <= challenge.end_date;
            if (!inRange) return <div key={date} className="calendar-day outside"><span>{Number(date.slice(-2))}</span></div>;

            const dayCompletions = completionByDate.get(date) || [];
            const dayGoals = habits.filter((goal) => isGoalActiveOnDate(goal, date));
            const requiredCount = dayGoals.filter((goal) => goal.is_required).length;
            const points = dayCompletions.reduce((sum, row) => sum + Number(row.points_awarded || 0), 0);
            const maximum = maxPointsForDate(date, habits);
            const full = isFullDay(dayCompletions, habits, date);
            const reviewed = Boolean(logByDate.get(date)?.reviewed_at);
            const isFuture = date > today;
            const status = isFuture
              ? "future"
              : requiredCount === 0
                ? "no-goals"
                : full
                  ? "complete"
                  : points > 0
                    ? "partial"
                    : reviewed
                      ? "missed"
                      : "unrecorded";
            const cell = <div className={`calendar-day ${status} ${date === today ? "today" : ""}`} title={`${date} · ${number(points)} / ${number(maximum)} نقطة`}>
              <span>{Number(date.slice(-2))}</span>
              <strong>{number(points)}<small>/{number(maximum)}</small></strong>
              <i/>
            </div>;
            return isFuture
              ? <div key={date}>{cell}</div>
              : <Link key={date} href={`/daily?date=${date}`}>{cell}</Link>;
          })}
        </div>
        <div className="calendar-legend">
          <span><i className="complete"/>يوم مكتمل</span>
          <span><i className="partial"/>إنجاز جزئي</span>
          <span><i className="missed"/>مراجَع وغير مكتمل</span>
          <span><i className="unrecorded"/>لم يُراجع</span>
          <span><i className="future"/>مستقبلي</span>
        </div>
      </Card>
      <div className="calendar-hint">
        <CalendarDays size={17}/>
        <span>تُحسب النقاط من قيمة الإنجازات المحفوظة، ويُعدّ اليوم مكتملاً عند إنجاز جميع الأهداف الإلزامية النشطة في ذلك التاريخ. الأيام التي لا تتضمن أهدافاً إلزامية لا تُحسب يوماً مكتملاً.</span>
      </div>
    </>}
  </div>;
}
