"use client";

import { useEffect, useState } from "react";
import { Award, BookOpen, Flame, Medal, Target, Trophy, Star } from "lucide-react";
import { useApp } from "@/components/app-provider";
import { Card, LoadingState, PageTitle, ProgressBar, StatCard } from "@/components/ui";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { number } from "@/lib/format";
import type { MyProgress, MyAward } from "@/lib/types";

const levels=[
  {name:"مبتدئ",min:0},
  {name:"ملتزم",min:100},
  {name:"منضبط",min:300},
  {name:"متقدم",min:700},
  {name:"محترف",min:1500},
  {name:"أسطوري",min:3000},
];
const catalog=[
  {key:"first_step",title:"الخطوة الأولى",description:"تسجيل أول إنجاز في أحد التحديات.",icon:Star},
  {key:"streak_7",title:"أسبوع من الانضباط",description:"تسجيل إنجازات في سبعة أيام متتالية.",icon:Flame},
  {key:"streak_30",title:"ثلاثون يوماً من الثبات",description:"الاستمرار ثلاثين يوماً متتالياً.",icon:Trophy},
  {key:"tasks_100",title:"مئة إنجاز",description:"تسجيل مئة هدف مكتمل.",icon:Target},
  {key:"pages_100",title:"قارئ نشط",description:"قراءة مئة صفحة على الأقل.",icon:BookOpen},
  {key:"xp_500",title:"خمسمئة خبرة",description:"جمع 500 نقطة خبرة من الإنجازات.",icon:Medal},
];

export default function AchievementsPage(){
  const {user}=useApp();
  const [progress,setProgress]=useState<MyProgress|null>(null);
  const [awards,setAwards]=useState<MyAward[]>([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  useEffect(()=>{
    if(!user)return;
    let live=true;
    const load=async()=>{
      setLoading(true);
      const sb=getSupabaseBrowserClient();
      const [{data,error:e},{data:awardData,error:awardError}]=await Promise.all([
        sb.rpc("get_my_progress"),
        sb.rpc("get_my_awards"),
      ]);
      if(!live)return;
      if(e)setError(e.message);
      else if(data?.[0])setProgress(data[0] as MyProgress);
      if(awardError)setError(awardError.message);
      else setAwards((awardData||[]) as MyAward[]);
      setLoading(false);
    };
    void load();return()=>{live=false;};
  },[user]);
  if(loading)return <LoadingState label="جارٍ حساب التقدّم والإنجازات…"/>;
  const xp=progress?.xp||0;
  const current=[...levels].reverse().find(item=>xp>=item.min)||levels[0];
  const index=levels.findIndex(x=>x.name===current.name);
  const next=levels[index+1];
  const pct=next?Math.min(100,Math.round((xp-current.min)/(next.min-current.min)*100)):100;
  const unlocked=new Map((progress?.achievements||[]).map(a=>[a.key,a.earned_at]));
  return <div>
    <PageTitle title="الإنجازات والترقيات" subtitle="مستواك يتقدم مع الإنجازات الحقيقية المسجّلة عبر جميع تحدياتك."/>
    {error&&<Card>{error}</Card>}
    <Card className="hero-card" style={{display:"block",marginBottom:15}}>
      <div style={{display:"flex",justifyContent:"space-between",gap:20,alignItems:"center",flexWrap:"wrap"}}>
        <div><span className="hero-label">مستواك الحالي</span><h2 style={{margin:"8px 0"}}>{current.name}</h2><p style={{margin:0,color:"var(--muted)"}}>{number(xp)} نقطة خبرة تراكمية</p></div>
        <div style={{width:82,height:82,borderRadius:"50%",border:"6px solid #dbe8f8",display:"grid",placeItems:"center",fontWeight:800,fontSize:25,color:"#2869b6"}}>{index+1}<small style={{fontSize:10,color:"var(--muted)"}}>/ 6</small></div>
      </div>
      <div style={{marginTop:18}}><div style={{display:"flex",justifyContent:"space-between",fontSize:12,marginBottom:8}}><span>{next?"التقدّم نحو "+next.name:"وصلت إلى أعلى مستوى"}</span><strong>{next?number(xp)+" / "+number(next.min)+" XP":"المستوى الأعلى"}</strong></div><ProgressBar value={pct}/><small className="muted-line">{next?"تحتاج إلى "+number(Math.max(0,next.min-xp))+" نقطة خبرة للترقية التالية.":"حافظ على إنجازاتك وواصل التحدّي."}</small></div>
    </Card>
    <div className="stats-grid">
      <StatCard label="المهام المنجزة" value={number(progress?.completed_tasks||0)} hint="عبر كل التحديات" icon={<Target size={20}/>} tone="blue"/>
      <StatCard label="أيام النشاط" value={number(progress?.active_days||0)} hint="أيام سُجل فيها إنجاز" icon={<Flame size={20}/>} tone="green"/>
      <StatCard label="أفضل سلسلة" value={number(progress?.best_streak||0)} hint="أيام متتالية" icon={<Trophy size={20}/>} tone="amber"/>
      <StatCard label="صفحات القراءة" value={number(progress?.pages_read||0)} hint="إجمالي الصفحات" icon={<BookOpen size={20}/>} tone="slate"/>
    </div>
    <Card style={{marginTop:15}}>
      <div className="section-heading"><div><h3>سُلّم الترقيات</h3><p>يُحتسب المستوى من مجموع نقاط الخبرة.</p></div><Award size={22}/></div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))",gap:10}}>
        {levels.map((level,i)=><div key={level.name} style={{padding:14,borderRadius:12,border:current.name===level.name?"1px solid #4684c7":"1px solid var(--line)",background:current.name===level.name?"#f0f6ff":"transparent"}}>
          <strong style={{display:"block"}}>{i+1}. {level.name}</strong><small style={{color:"var(--muted)"}}>{number(level.min)} XP</small>
          {xp>=level.min&&<span className="status-chip done" style={{display:"inline-flex",marginTop:8}}>مفتوح</span>}
        </div>)}
      </div>
    </Card>
    <Card style={{marginTop:15}}>
      <div className="section-heading"><div><h3>الشارات والجوائز</h3><p>تُمنح تلقائياً عند استيفاء شروط الإنجاز.</p></div><Medal size={22}/></div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:11}}>
        {catalog.map(item=>{
          const earned=unlocked.has(item.key);const Icon=item.icon;
          return <div key={item.key} style={{border:"1px solid var(--line)",borderRadius:13,padding:14,opacity:earned?1:.58,display:"flex",gap:12,alignItems:"flex-start"}}>
            <div className="habit-icon"><Icon size={20}/></div>
            <div><strong>{item.title}</strong><p style={{fontSize:11,color:"var(--muted)",lineHeight:1.6,margin:"5px 0"}}>{item.description}</p><small className="muted-line">{earned?"تم فتح الشارة":"لم تُفتح بعد"}</small></div>
          </div>;
        })}
      </div>
    </Card>
    <Card style={{marginTop:15}}>
      <div className="section-heading"><div><h3>جوائز المراكز الأولى</h3><p>يُمنح ترتيب المراكز الثلاثة الأولى تلقائياً عند إكمال منظّم التحدّي للمسابقة.</p></div><Trophy size={22}/></div>
      {!awards.length?<p className="muted-line">لم تحصل على جائزة منافسة بعد. تظهر الجائزة بعد إغلاق تحدٍّ كنت مشاركاً فيه وحققت نقاطاً.</p>:
        <div style={{display:"grid",gap:10}}>
          {awards.map(award=><div key={award.challenge_id} style={{display:"flex",alignItems:"center",gap:12,border:"1px solid var(--line)",borderRadius:12,padding:13}}>
            <div className="habit-icon"><Trophy size={20}/></div>
            <div style={{flex:1}}><strong>{award.challenge_title}</strong><small style={{display:"block",color:"var(--muted)",marginTop:4}}>{award.place===1?"المركز الأول 🥇":award.place===2?"المركز الثاني 🥈":"المركز الثالث 🥉"} · {number(award.points)} نقطة</small></div>
            <small className="muted-line">{new Date(award.awarded_at).toLocaleDateString("ar-DZ")}</small>
          </div>)}
        </div>}
    </Card>
  </div>;
}
