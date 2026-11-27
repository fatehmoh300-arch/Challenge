"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Save, Users, ShieldCheck, Target, Settings2, UserMinus, Check, X } from "lucide-react";
import { useApp } from "@/components/app-provider";
import { Button, Card, Notice, PageTitle, LoadingState } from "@/components/ui";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type MemberRow={user_id:string;display_name:string;avatar_url:string|null;role:"owner"|"moderator"|"assistant"|"member";permissions:string[];joined_at:string};
type JoinRequest={id:string;user_id:string;display_name:string;message:string;status:string;created_at:string};
type GoalDraft={name:string;description:string;points:number;is_required:boolean;is_active:boolean};
const permissions=[["manage_members","إدارة المشاركين"],["manage_rules","تعديل القواعد والأهداف"],["manage_join_requests","مراجعة طلبات الانضمام"],["moderate_posts","إدارة المنشورات والتعليقات"],["publish_posts","نشر الإعلانات"]];
const emptyGoal:GoalDraft={name:"",description:"",points:1,is_required:true,is_active:true};

export default function ManagePage(){
  const {user,challenge,membership,habits,refresh}=useApp();
  const sb=getSupabaseBrowserClient();
  const canRules=membership?.role==="owner"||membership?.permissions.includes("manage_rules");
  const canMembers=membership?.role==="owner"||membership?.permissions.includes("manage_members");
  const canAssign=membership?.role==="owner";
  const canRequests=membership?.role==="owner"||membership?.permissions.includes("manage_join_requests");
  const [members,setMembers]=useState<MemberRow[]>([]);
  const [requests,setRequests]=useState<JoinRequest[]>([]);
  const [memberDrafts,setMemberDrafts]=useState<Record<string,{role:MemberRow["role"];permissions:string[]}>>({});
  const [goalDrafts,setGoalDrafts]=useState<Record<string,GoalDraft>>({});
  const [goal,setGoal]=useState<GoalDraft>(emptyGoal);
  const [title,setTitle]=useState("");
  const [description,setDescription]=useState("");
  const [category,setCategory]=useState("عام");
  const [startDate,setStartDate]=useState("");
  const [endDate,setEndDate]=useState("");
  const [visibility,setVisibility]=useState<"public"|"private">("private");
  const [difficulty,setDifficulty]=useState<"easy"|"medium"|"hard">("medium");
  const [joinMode,setJoinMode]=useState<"open"|"approval"|"invite">("invite");
  const [maxMembers,setMaxMembers]=useState(50);
  const [status,setStatus]=useState("active");
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState("");
  const [message,setMessage]=useState("");
  const [error,setError]=useState("");

  useEffect(()=>{
    if(!challenge)return;
    setTitle(challenge.title);setDescription(challenge.description||"");setCategory(challenge.category||"عام");
    setStartDate(challenge.start_date);setEndDate(challenge.end_date);setVisibility(challenge.visibility);
    setDifficulty(challenge.difficulty);setJoinMode(challenge.join_mode);setMaxMembers(challenge.max_members);setStatus(challenge.status);
  },[challenge]);

  useEffect(()=>{
    if(!challenge)return;
    let live=true;
    const load=async()=>{
      setLoading(true);
      const tasks:Promise<any>[]=[sb.rpc("get_challenge_members",{p_challenge_id:challenge.id})];
      if(canRequests)tasks.push(sb.rpc("get_challenge_join_requests",{p_challenge_id:challenge.id}));
      const results=await Promise.all(tasks);
      if(!live)return;
      const memberRows=(results[0].data||[]) as MemberRow[];
      setMembers(memberRows);
      const drafts:Record<string,{role:MemberRow["role"];permissions:string[]}>={};
      memberRows.forEach(m=>drafts[m.user_id]={role:m.role,permissions:m.permissions||[]});
      setMemberDrafts(drafts);
      setRequests(canRequests?(results[1]?.data||[]) as JoinRequest[]:[]);
      setLoading(false);
    };
    void load();return()=>{live=false;};
  },[challenge?.id,canRequests]);

  useEffect(()=>{
    const drafts:Record<string,GoalDraft>={};
    habits.forEach(h=>drafts[h.id]={name:h.name,description:h.description,points:h.points,is_required:h.is_required,is_active:h.is_active});
    setGoalDrafts(drafts);
  },[habits]);

  const saveChallenge=async()=>{
    if(!challenge)return;setBusy("challenge");setError("");setMessage("");
    try{
      const {error:e}=await sb.rpc("update_challenge_details",{
        p_challenge_id:challenge.id,p_title:title,p_description:description,p_category:category,
        p_start_date:startDate,p_end_date:endDate,p_visibility:visibility,p_difficulty:difficulty,
        p_join_mode:visibility==="private"?"invite":joinMode,p_max_members:maxMembers
      });
      if(e)throw e;await refresh();setMessage("تم حفظ إعدادات التحدّي.");
    }catch(e){setError(e instanceof Error?e.message:"تعذّر حفظ الإعدادات.");}
    finally{setBusy("");}
  };

  const saveStatus=async()=>{
    if(!challenge)return;setBusy("status");setError("");setMessage("");
    try{
      const {error:e}=await sb.rpc("set_challenge_status",{p_challenge_id:challenge.id,p_status:status});
      if(e)throw e;await refresh();setMessage("تم تحديث حالة التحدّي.");
    }catch(e){setError(e instanceof Error?e.message:"تعذّر تغيير حالة التحدّي.");}
    finally{setBusy("");}
  };

  const addGoal=async()=>{
    if(!challenge)return;setBusy("goal");setError("");setMessage("");
    try{
      const {error:e}=await sb.rpc("create_challenge_goal",{
        p_challenge_id:challenge.id,p_name:goal.name,p_description:goal.description,
        p_points:Number(goal.points),p_is_required:goal.is_required
      });
      if(e)throw e;setGoal(emptyGoal);await refresh();setMessage("أُضيف الهدف إلى التحدّي.");
    }catch(e){setError(e instanceof Error?e.message:"تعذّرت إضافة الهدف.");}
    finally{setBusy("");}
  };

  const saveGoal=async(id:string)=>{
    if(!challenge)return;const draft=goalDrafts[id];if(!draft)return;
    setBusy(id);setError("");setMessage("");
    try{
      const {error:e}=await sb.rpc("update_challenge_goal",{
        p_challenge_id:challenge.id,p_goal_id:id,p_name:draft.name,p_description:draft.description,
        p_points:Number(draft.points),p_is_required:draft.is_required,p_is_active:draft.is_active
      });
      if(e)throw e;await refresh();setMessage("تم تحديث الهدف.");
    }catch(e){setError(e instanceof Error?e.message:"تعذّر تحديث الهدف.");}
    finally{setBusy("");}
  };

  const saveMember=async(id:string)=>{
    if(!challenge)return;const draft=memberDrafts[id];if(!draft)return;
    setBusy(id);setError("");setMessage("");
    try{
      const {error:e}=await sb.rpc("set_challenge_member_access",{
        p_challenge_id:challenge.id,p_user_id:id,p_role:draft.role,p_permissions:draft.permissions
      });
      if(e)throw e;
      const {data}=await sb.rpc("get_challenge_members",{p_challenge_id:challenge.id});
      setMembers((data||[]) as MemberRow[]);setMessage("تم تحديث الدور والصلاحيات.");
    }catch(e){setError(e instanceof Error?e.message:"تعذّر تحديث الصلاحيات.");}
    finally{setBusy("");}
  };

  const removeMember=async(id:string)=>{
    if(!challenge||!window.confirm("إزالة هذا المشارك من التحدّي؟"))return;
    setBusy(id);setError("");setMessage("");
    try{const {error:e}=await sb.rpc("remove_challenge_member",{p_challenge_id:challenge.id,p_user_id:id});if(e)throw e;
      const {data}=await sb.rpc("get_challenge_members",{p_challenge_id:challenge.id});setMembers((data||[]) as MemberRow[]);
      await refresh();setMessage("تمت إزالة المشارك.");
    }catch(e){setError(e instanceof Error?e.message:"تعذّرت إزالة المشارك.");}
    finally{setBusy("");}
  };

  const reviewRequest=async(id:string,approve:boolean)=>{
    setBusy(id);setError("");setMessage("");
    try{const {error:e}=await sb.rpc("review_challenge_join_request",{p_request_id:id,p_approve:approve});if(e)throw e;
      setRequests(prev=>prev.filter(r=>r.id!==id));await refresh();setMessage(approve?"تم قبول طلب الانضمام.":"تم رفض طلب الانضمام.");
    }catch(e){setError(e instanceof Error?e.message:"تعذّرت مراجعة الطلب.");}
    finally{setBusy("");}
  };

  const patchGoal=(id:string,patch:Partial<GoalDraft>)=>setGoalDrafts(prev=>({...prev,[id]:{...prev[id],...patch}}));
  const patchMember=(id:string,patch:Partial<{role:MemberRow["role"];permissions:string[]}>)=>setMemberDrafts(prev=>({...prev,[id]:{...prev[id],...patch}}));

  if(!challenge)return <LoadingState label="جارٍ تحميل التحدّي…"/>;
  return <div>
    <PageTitle title="إدارة التحدّي" subtitle="تحكّم في الإعدادات والأهداف والمشاركين والصلاحيات."/>
    {message&&<Notice tone="success">{message}</Notice>}{error&&<Notice tone="error">{error}</Notice>}

    <Card>
      <div className="settings-heading"><Settings2/><div><h3>إعدادات المساحة</h3><p>اسم التحدّي ومدته وخصوصيته وسعته.</p></div></div>
      {!canRules?<Notice tone="warning">لا تملك صلاحية تعديل إعدادات التحدّي.</Notice>:<>
        <div className="settings-grid" style={{gridTemplateColumns:"repeat(auto-fit,minmax(210px,1fr))"}}>
          <label>الاسم<input className="text-input" value={title} onChange={e=>setTitle(e.target.value)} maxLength={80}/></label>
          <label>التصنيف<input className="text-input" value={category} onChange={e=>setCategory(e.target.value)} maxLength={40}/></label>
          <label>البداية<input className="text-input" type="date" value={startDate} onChange={e=>setStartDate(e.target.value)}/></label>
          <label>النهاية<input className="text-input" type="date" value={endDate} onChange={e=>setEndDate(e.target.value)}/></label>
          <label>الخصوصية<select className="text-input" value={visibility} onChange={e=>setVisibility(e.target.value as typeof visibility)}><option value="private">خاص</option><option value="public">عام</option></select></label>
          <label>الصعوبة<select className="text-input" value={difficulty} onChange={e=>setDifficulty(e.target.value as typeof difficulty)}><option value="easy">مبتدئ</option><option value="medium">متوسط</option><option value="hard">متقدم</option></select></label>
          {visibility==="public"&&<label>طريقة الانضمام<select className="text-input" value={joinMode} onChange={e=>setJoinMode(e.target.value as typeof joinMode)}><option value="open">مفتوح</option><option value="approval">بموافقة</option><option value="invite">بدعوة</option></select></label>}
          <label>السعة<select className="text-input" value={maxMembers} onChange={e=>setMaxMembers(Number(e.target.value))}>{[2,10,25,50,100,250,500].map(n=><option key={n} value={n}>{n} مشارك</option>)}</select></label>
          <label>حالة التحدّي<select className="text-input" value={status} onChange={e=>setStatus(e.target.value)}><option value="open" disabled={visibility!=="public"}>مفتوح للانضمام</option><option value="active">نشط</option><option value="paused">متوقف مؤقتاً</option><option value="completed">مكتمل</option><option value="archived">مؤرشف</option></select></label>
        </div>
        <label style={{display:"block",marginTop:12}}>الوصف<textarea className="text-input" rows={3} value={description} maxLength={2000} onChange={e=>setDescription(e.target.value)}/></label>
        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
          <Button onClick={saveChallenge} busy={busy==="challenge"} disabled={!title.trim()||!startDate||!endDate||endDate<startDate}><Save size={16}/> حفظ الإعدادات</Button>
          <Button variant="secondary" onClick={saveStatus} busy={busy==="status"}>حفظ حالة التحدّي</Button>
        </div>
      </>}
    </Card>

    <Card style={{marginTop:14}}>
      <div className="settings-heading"><Target/><div><h3>أهداف التحدّي</h3><p>أضف أهدافاً مخصصة، وحدّد نقاطها وهل هي إلزامية أم اختيارية.</p></div></div>
      {canRules&&<div className="settings-grid" style={{gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))"}}>
        <label>اسم الهدف<input className="text-input" value={goal.name} onChange={e=>setGoal(v=>({...v,name:e.target.value}))} maxLength={80} placeholder="مثلاً: المشي 20 دقيقة"/></label>
        <label>النقاط<input className="text-input" type="number" min="1" max="100" value={goal.points} onChange={e=>setGoal(v=>({...v,points:Number(e.target.value)}))}/></label>
        <label style={{gridColumn:"1/-1"}}>الوصف<textarea className="text-input" rows={2} value={goal.description} onChange={e=>setGoal(v=>({...v,description:e.target.value}))} maxLength={500}/></label>
        <label className="checkbox-label"><input type="checkbox" checked={goal.is_required} onChange={e=>setGoal(v=>({...v,is_required:e.target.checked}))}/> هدف إلزامي لإكمال اليوم والسلسلة</label>
        <div><Button onClick={addGoal} busy={busy==="goal"} disabled={goal.name.trim().length<2}><Plus size={16}/> إضافة هدف</Button></div>
      </div>}
      <div style={{display:"grid",gap:12,marginTop:18}}>
        {habits.length===0?<p className="muted-line">لم تُضف أهدافاً بعد. أنشئ أول هدف من النموذج أعلاه.</p>:habits.map(h=>{
          const d=goalDrafts[h.id]||{name:h.name,description:h.description,points:h.points,is_required:h.is_required,is_active:h.is_active};
          return <div key={h.id} style={{border:"1px solid var(--line)",borderRadius:13,padding:14,opacity:d.is_active?1:.65}}>
            <div className="settings-grid" style={{gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))"}}>
              <label>الاسم<input className="text-input" value={d.name} disabled={!canRules} onChange={e=>patchGoal(h.id,{name:e.target.value})}/></label>
              <label>النقاط<input className="text-input" type="number" min="1" max="100" value={d.points} disabled={!canRules} onChange={e=>patchGoal(h.id,{points:Number(e.target.value)})}/></label>
              <label style={{gridColumn:"1/-1"}}>الوصف<input className="text-input" value={d.description} disabled={!canRules} onChange={e=>patchGoal(h.id,{description:e.target.value})}/></label>
              <label className="checkbox-label"><input type="checkbox" checked={d.is_required} disabled={!canRules} onChange={e=>patchGoal(h.id,{is_required:e.target.checked})}/> إلزامي</label>
              <label className="checkbox-label"><input type="checkbox" checked={d.is_active} disabled={!canRules||!h.is_active} onChange={e=>patchGoal(h.id,{is_active:e.target.checked})}/> مفعّل</label>
            </div>
            {canRules&&<Button variant="secondary" onClick={()=>saveGoal(h.id)} busy={busy===h.id}><Save size={15}/> حفظ الهدف</Button>}
          </div>;
        })}
      </div>
    </Card>

    <Card style={{marginTop:14}}>
      <div className="settings-heading"><Users/><div><h3>المشاركون والصلاحيات</h3><p>تعيين مشرفين ومساعدين وتوزيع الصلاحيات حسب الحاجة.</p></div></div>
      {loading?<LoadingState/>:members.map(m=>{
        const d=memberDrafts[m.user_id]||{role:m.role,permissions:m.permissions||[]};
        const isOwner=m.role==="owner";
        return <div key={m.user_id} style={{borderTop:"1px solid var(--line)",padding:"13px 0",display:"grid",gap:9}}>
          <div style={{display:"flex",justifyContent:"space-between",gap:12,flexWrap:"wrap"}}>
            <div><strong>{m.display_name}</strong><small style={{display:"block",color:"var(--muted)",fontSize:10}}>{isOwner?"مالك التحدّي":m.user_id===user?.id?"أنت":m.role}</small></div>
            {!isOwner&&(canMembers||canAssign)&&<Button variant="ghost" onClick={()=>removeMember(m.user_id)} busy={busy===m.user_id}><UserMinus size={14}/> إزالة</Button>}
          </div>
          {canMembers&&!isOwner&&<>
            <label>الدور<select className="text-input" value={d.role} onChange={e=>patchMember(m.user_id,{role:e.target.value as MemberRow["role"]})}><option value="member">مشارك</option><option value="assistant">مساعد</option><option value="moderator">مشرف</option></select></label>
            <div className="settings-grid" style={{gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))"}}>
              {permissions.map(([key,label])=><label className="checkbox-label" key={key}><input type="checkbox" checked={d.permissions.includes(key)} onChange={e=>patchMember(m.user_id,{permissions:e.target.checked?[...d.permissions,key]:d.permissions.filter(x=>x!==key)})}/>{label}</label>)}
            </div>
            <Button variant="secondary" onClick={()=>saveMember(m.user_id)} busy={busy===m.user_id}><ShieldCheck size={15}/> حفظ الدور والصلاحيات</Button>
          </>}
        </div>;
      })}
      {!canMembers&&<p className="muted-line">عرض الأعضاء متاح، لكن إدارة العضوية تحتاج الصلاحية المخصصة.</p>}{canMembers&&!canAssign&&<p className="muted-line">يمكنك إدارة العضوية وفق صلاحيتك، بينما تعيين الأدوار والصلاحيات يبقى بيد مالك التحدّي.</p>}
    </Card>

    {canRequests&&<Card style={{marginTop:14}}>
      <div className="settings-heading"><Users/><div><h3>طلبات الانضمام</h3><p>مراجعة طلبات الانضمام إلى التحدّي العام.</p></div></div>
      {!requests.length?<p className="muted-line">لا توجد طلبات معلّقة حالياً.</p>:requests.map(r=><div key={r.id} style={{display:"flex",justifyContent:"space-between",gap:10,alignItems:"center",flexWrap:"wrap",borderTop:"1px solid var(--line)",padding:"12px 0"}}>
        <div><strong>{r.display_name}</strong><small style={{display:"block",color:"var(--muted)"}}>{r.message||"لم يكتب رسالة."}</small></div>
        <div style={{display:"flex",gap:7}}><Button onClick={()=>reviewRequest(r.id,true)} busy={busy===r.id}><Check size={14}/> قبول</Button><Button variant="secondary" onClick={()=>reviewRequest(r.id,false)} busy={busy===r.id}><X size={14}/> رفض</Button></div>
      </div>)}
    </Card>}
  </div>;
}
