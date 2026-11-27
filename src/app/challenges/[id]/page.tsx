"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowRight, CalendarDays, Users, ShieldCheck } from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { useApp } from "@/components/app-provider";

type ChallengeDetails = {
  id: string; title: string; description: string; category: string; difficulty: string;
  start_date: string; end_date: string; status: string; join_mode: string;
  max_members: number; member_count: number;
};

export default function ChallengeDetailsPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { user, refresh, memberships } = useApp();
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState("");
  const [joinMessage, setJoinMessage] = useState("");
  const [item, setItem] = useState<ChallengeDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    let active = true;
    const load = async () => {
      const { data, error } = await getSupabaseBrowserClient()
        .from("challenges")
        .select("id,title,description,category,difficulty,start_date,end_date,status,join_mode,max_members,member_count")
        .eq("id", params.id)
        .eq("visibility", "public")
        .maybeSingle();
      if (!active) return;
      if (error) setLoadError("تعذّر تحميل تفاصيل التحدّي. تحقق من الاتصال ثم أعد المحاولة.");
      else if (!data) setNotFound(true);
      else setItem(data as ChallengeDetails);
      setLoading(false);
    };
    if (params.id) void load();
    return () => { active = false; };
  }, [params.id]);

  const join = async () => {
    if (!item || !["open","active"].includes(item.status)) {
      setJoinError("هذا التحدّي متوقف أو مكتمل ولا يستقبل مشاركين حالياً.");
      return;
    }
    if (item.member_count >= item.max_members) {
      setJoinError("اكتمل العدد المسموح للمشاركين في هذا التحدّي.");
      return;
    }
    if (!user) {
      router.push(`/login?next=${encodeURIComponent(`/challenges/${params.id}`)}`);
      return;
    }
    setJoinMessage("");
    if (memberships.some(member => member.challenge_id === item?.id)) {
      await refresh(item?.id);
      router.replace("/dashboard");
      return;
    }
    setJoining(true);
    setJoinError("");
    try {
      const { error } = await getSupabaseBrowserClient().rpc("request_join_challenge", { p_challenge_id: item?.id, p_message: "" });
      if (error) throw error;
      if (item?.join_mode === "approval") {
        setJoinMessage("تم إرسال طلب الانضمام. سيظهر التحدّي في حسابك بعد موافقة المنظّم.");
        return;
      }
      await refresh(item?.id);
      router.replace("/dashboard");
    } catch (e) {
      setJoinError(e instanceof Error ? e.message : "تعذّر الانضمام إلى التحدّي.");
    } finally {
      setJoining(false);
    }
  };

  if (loading) return <main dir="rtl" style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#f5f7fb", color: "#718096" }}>جارٍ تحميل تفاصيل التحدّي…</main>;
  if (loadError) return <main dir="rtl" style={{ minHeight: "100vh", padding: 24, display: "grid", placeItems: "center", background: "#f5f7fb" }}><div role="alert" style={{ background: "white", padding: 30, borderRadius: 18, textAlign: "center" }}><h1>تعذّر تحميل التحدّي</h1><p style={{ color: "#718096" }}>{loadError}</p><button onClick={() => window.location.reload()} style={{border:0,borderRadius:9,padding:"10px 16px",background:"#3157d5",color:"white"}}>إعادة المحاولة</button></div></main>;
  if (notFound || !item) return <main dir="rtl" style={{ minHeight: "100vh", padding: 24, display: "grid", placeItems: "center", background: "#f5f7fb" }}><div style={{ background: "white", padding: 30, borderRadius: 18, textAlign: "center" }}><h1>التحدّي غير متاح</h1><p style={{ color: "#718096" }}>قد يكون خاصاً أو غير منشور أو لم يعد متاحاً.</p><Link href="/explore" style={{ color: "#3157d5" }}>العودة إلى الاستكشاف</Link></div></main>;

  return <main dir="rtl" style={{ minHeight: "100vh", background: "#f5f7fb", color: "#182235", padding: "24px 20px 60px" }}>
    <header style={{ maxWidth: 850, margin: "0 auto" }}><Link href="/explore" style={{ color: "#3157d5", display: "inline-flex", alignItems: "center", gap: 8, textDecoration: "none" }}><ArrowRight size={17}/> العودة إلى التحديات</Link></header>
    <article style={{ maxWidth: 850, margin: "28px auto", background: "white", border: "1px solid #e7ebf3", borderRadius: 22, padding: "clamp(22px,5vw,42px)" }}>
      <span style={{ color: "#3157d5", background: "#eef2ff", padding: "7px 12px", borderRadius: 99, fontSize: 13, fontWeight: 700 }}>{item.category}</span>
      <h1 style={{ fontSize: "clamp(30px,5vw,46px)", margin: "20px 0 12px" }}>{item.title}</h1>
      <p style={{ color: "#66738a", lineHeight: 1.9, whiteSpace: "pre-wrap" }}>{item.description || "لم يضف منشئ التحدي وصفاً بعد."}</p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 18, padding: "20px 0", borderTop: "1px solid #edf0f5", borderBottom: "1px solid #edf0f5", color: "#59667d", fontSize: 14 }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}><CalendarDays size={17}/>{item.start_date} — {item.end_date}</span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}><Users size={17}/>{item.member_count} من {item.max_members} مشارك</span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}><ShieldCheck size={17}/>تحدٍّ عام</span>
      </div>
      <div style={{ background: "#f7f8fc", borderRadius: 14, padding: 17, marginTop: 22, color: "#66738a", lineHeight: 1.8, fontSize: 14 }}>
        {item.status === "paused" ? "التحدّي متوقف مؤقتاً ولا يقبل مشاركين حالياً." : item.status === "completed" ? "انتهى هذا التحدّي وأُغلقت المشاركة." : item.member_count >= item.max_members ? "اكتمل العدد الأقصى للمشاركين." : item.join_mode === "open" ? "هذا التحدّي يسمح بالانضمام الفوري." : item.join_mode === "approval" ? "يتطلب الانضمام موافقة مدير التحدّي." : "الانضمام إلى هذا التحدّي يتطلب دعوة."}
      </div>
      {item.join_mode !== "invite" && <button onClick={join} disabled={joining || !["open","active"].includes(item.status) || item.member_count >= item.max_members} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", marginTop: 24, background: "#3157d5", color: "white", border: 0, borderRadius: 12, padding: 14, fontWeight: 700, cursor: "pointer", opacity: joining || !["open","active"].includes(item.status) || item.member_count >= item.max_members ? 0.55 : 1 }}>{joining ? "جارٍ إرسال الطلب…" : !["open","active"].includes(item.status) ? "المشاركة مغلقة" : item.member_count >= item.max_members ? "اكتمل العدد" : !user ? "سجّل الدخول للانضمام" : item.join_mode === "approval" ? "طلب الانضمام" : "انضم إلى التحدّي"}</button>}
      {item.join_mode === "invite" && <p style={{ color: "#718096", marginTop: 22, fontSize: 14 }}>الانضمام متاح عبر دعوة من منشئ التحدّي.</p>}
      {joinMessage && <p role="status" style={{ color: "#246b45", background: "#eaf7ef", padding: 12, borderRadius: 10, marginTop: 12 }}>{joinMessage}</p>}
      {joinError && <p role="alert" style={{ color: "#a33b32", background: "#fff1f0", padding: 12, borderRadius: 10, marginTop: 12 }}>{joinError}</p>}
    </article>
  </main>;
}
