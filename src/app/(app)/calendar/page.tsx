"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, CalendarDays, CheckCircle2, CircleDashed } from "lucide-react";
import { useApp } from "@/components/app-provider";
import { Card, LoadingState, PageTitle } from "@/components/ui";
import { algeriaDate, isFastingDay } from "@/lib/date";
import { number } from "@/lib/format";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

const MONTH_START="2026-12-01";
export default function CalendarPage(){
 const {user,challenge}=useApp();const [rows,setRows]=useState<{log_date:string,reviewed_at:string|null}[]>([]);const [scores,setScores]=useState<Record<string,number>>({});const [loading,setLoading]=useState(true);
 useEffect(()=>{if(!user||!challenge)return;let live=true;const load=async()=>{const sb=getSupabaseBrowserClient();const [{data:logs},{data:comps}]=await Promise.all([sb.from("daily_logs").select("log_date,reviewed_at").eq("challenge_id",challenge.id).eq("user_id",user.id).gte("log_date",challenge.start_date).lte("log_date",challenge.end_date),sb.from("habit_completions").select("log_date").eq("challenge_id",challenge.id).eq("user_id",user.id).gte("log_date",challenge.start_date).lte("log_date",challenge.end_date)]);if(!live)return;setRows(logs||[]);const map:Record<string,number>={};(comps||[]).forEach((r:{log_date:string})=>map[r.log_date]=(map[r.log_date]||0)+1);setScores(map);setLoading(false);};void load();return()=>{live=false};},[user,challenge]);
 const days=useMemo(()=>{const first=new Date(`${MONTH_START}T12:00:00Z`);const offset=(first.getUTCDay()+6)%7;return [...Array(offset).fill(null),...Array.from({length:31},(_,i)=>`2026-12-${String(i+1).padStart(2,"0")}`)];},[]);
 const byDate=Object.fromEntries(rows.map(r=>[r.log_date,r]));const today=algeriaDate();
 if(loading)return <LoadingState/>;
 return <><PageTitle title="تقويم ديسمبر 2026" subtitle="اختر أي يوم لعرض إنجازاته أو تعديل سجلّك." action={<span className="month-tag"><CalendarDays size={15}/> ٣١ يوماً</span>}/><Card className="calendar-card"><div className="calendar-weekdays">{["الاثنين","الثلاثاء","الأربعاء","الخميس","الجمعة","السبت","الأحد"].map(x=><span key={x}>{x}</span>)}</div><div className="calendar-grid">{days.map((date,index)=>{if(!date)return <div key={`blank-${index}`} className="calendar-empty"/>;const count=scores[date]||0;const row=byDate[date];const max=5+(isFastingDay(date)?1:0);let status="unrecorded";if(count===max)status="complete";else if(row?.reviewed_at&&count===0)status="missed";else if(count>0)status="partial";else if(row)status="unrecorded";return <Link key={date} href={`/daily?date=${date}`} className={`calendar-day ${status} ${date===today?"today":""}`}><span>{Number(date.slice(-2))}</span><strong>{number(count)}<small>/{max}</small></strong><i/></Link>})}</div><div className="calendar-legend"><span><i className="complete"/>إنجاز كامل</span><span><i className="partial"/>إنجاز جزئي</span><span><i className="missed"/>تمت المراجعة دون إنجاز</span><span><i className="unrecorded"/>لم تتم المراجعة</span></div></Card><div className="calendar-hint"><CircleDashed size={17}/><span>الرمادي لا يعني الفشل؛ بل يعني أن اليوم لم تتم مراجعته أو تسجيله بعد.</span></div></>;
}
