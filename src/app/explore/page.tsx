"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, CalendarDays, Compass, RefreshCw, Users } from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type PublicChallenge = {
  id: string;
  title: string;
  description: string;
  category: string;
  difficulty: "easy" | "medium" | "hard";
  start_date: string;
  end_date: string;
  status: string;
  join_mode: "open" | "approval" | "invite";
  max_members: number;
  member_count: number;
  created_at: string;
};

const difficultyLabel = { easy: "مبتدئ", medium: "متوسط", hard: "متقدم" };
const joinLabel = { open: "انضمام مفتوح", approval: "يتطلب موافقة", invite: "بدعوة" };
const statusLabel: Record<string,string> = {
  open: "مفتوح",
  active: "نشط",
  paused: "متوقف مؤقتاً",
  completed: "مكتمل",
};
const PAGE_SIZE = 20;

export default function ExplorePage() {
  const [items, setItems] = useState<PublicChallenge[]>([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async (targetPage = 0, append = false) => {
    if (append) setLoadingMore(true);
    else setLoading(true);
    setError("");
    try {
      const { data, error: queryError } = await getSupabaseBrowserClient()
        .from("challenges")
        .select("id,title,description,category,difficulty,start_date,end_date,status,join_mode,max_members,member_count,created_at")
        .eq("visibility", "public")
        .in("status", ["open", "active", "paused", "completed"])
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .range(targetPage * PAGE_SIZE, targetPage * PAGE_SIZE + PAGE_SIZE - 1);
      if (queryError) throw queryError;
      const next = (data || []) as PublicChallenge[];
      setItems((current) => append ? [...current, ...next] : next);
      setPage(targetPage);
      setHasMore(next.length === PAGE_SIZE);
    } catch {
      setError("تعذّر تحميل التحديات حالياً. تحقق من الاتصال ثم أعد المحاولة.");
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => { void load(0, false); }, [load]);

  return (
    <main dir="rtl" style={{ minHeight: "100vh", background: "#f5f7fb", color: "#182235", padding: "24px 20px 60px" }}>
      <header style={{ maxWidth: 1080, margin: "0 auto", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <Link href="/" style={{ color: "#182235", textDecoration: "none", fontWeight: 800, fontSize: 20 }}>تحدّي <small style={{ color: "#8993a5", fontSize: 11, letterSpacing: 1 }}>CHALLENGE</small></Link>
        <div style={{ display: "flex", gap: 10 }}>
          <Link href="/login" style={{ padding: "10px 14px", borderRadius: 11, background: "white", border: "1px solid #e3e8f0", color: "#34415a", textDecoration: "none" }}>تسجيل الدخول</Link>
          <Link href="/login" style={{ padding: "10px 14px", borderRadius: 11, background: "#3157d5", color: "white", textDecoration: "none" }}>إنشاء حساب</Link>
        </div>
      </header>
      <section style={{ maxWidth: 1080, margin: "54px auto 28px" }}>
        <span style={{ color: "#3157d5", fontWeight: 700, fontSize: 13 }}>مساحة الاستكشاف</span>
        <h1 style={{ fontSize: "clamp(30px,5vw,44px)", margin: "10px 0", letterSpacing: "-.8px" }}>اكتشف التحدّي المناسب لك</h1>
        <p style={{ color: "#718096", lineHeight: 1.8, margin: 0 }}>استعرض التحديات العامة وتعرّف على أهدافها ومدتها وشروط المشاركة قبل الانضمام.</p>
      </section>
      <section style={{ maxWidth: 1080, margin: "0 auto" }}>
        {loading ? <div style={{ padding: 40, textAlign: "center", color: "#718096" }}>جارٍ تحميل التحديات…</div> :
          error ? <div role="alert" style={{ background: "#fff1f0", color: "#a33b32", padding: 18, borderRadius: 14 }}>
            <p>{error}</p>
            <button onClick={() => void load(0, false)} style={{border:0,borderRadius:9,padding:"10px 14px",background:"#a33b32",color:"white",display:"inline-flex",alignItems:"center",gap:7}}><RefreshCw size={14}/> إعادة المحاولة</button>
          </div> :
          items.length === 0 ? <div style={{ background: "white", border: "1px solid #e7ebf3", borderRadius: 20, padding: "48px 20px", textAlign: "center" }}><Compass size={30} color="#3157d5"/><h2 style={{ margin: "12px 0 6px" }}>لا توجد تحديات عامة منشورة بعد</h2><p style={{ color: "#718096", margin: 0 }}>يمكنك إنشاء حساب لتكون من أوائل منشئي التحديات.</p><Link href="/login" style={{ display: "inline-block", marginTop: 18, padding: "11px 17px", borderRadius: 11, background: "#3157d5", color: "white", textDecoration: "none" }}>إنشاء حساب</Link></div> :
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,300px),1fr))", gap: 16 }}>
            {items.map(item => <article key={item.id} style={{ background: "white", border: "1px solid #e7ebf3", borderRadius: 19, padding: 20, display: "flex", flexDirection: "column", minHeight: 250 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}><span style={{ color: "#3157d5", background: "#eef2ff", borderRadius: 99, padding: "6px 10px", fontSize: 12, fontWeight: 700 }}>{item.category}</span><span style={{ color: "#6c788d", fontSize: 12 }}>{difficultyLabel[item.difficulty]}</span></div>
              <h2 style={{ fontSize: 21, margin: "16px 0 8px" }}>{item.title}</h2>
              <p style={{ color: "#718096", lineHeight: 1.75, fontSize: 14, margin: "0 0 18px", flex: 1 }}>{item.description || "لم يضف منشئ التحدي وصفاً بعد."}</p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 13, color: "#6c788d", fontSize: 12, marginBottom: 17 }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><CalendarDays size={14}/>{item.start_date} — {item.end_date}</span>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><Users size={14}/>{item.member_count}/{item.max_members}</span>
                <span>{joinLabel[item.join_mode]}</span><span>{statusLabel[item.status] || item.status}</span>
              </div>
              <Link href={`/challenges/${item.id}`} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 11, background: "#3157d5", color: "white", textDecoration: "none", padding: "11px 14px", fontWeight: 700 }}>عرض التفاصيل <ArrowLeft size={16}/></Link>
            </article>)}
          </div>}
        {hasMore && !error && <div style={{display:"flex",justifyContent:"center",marginTop:22}}><button disabled={loadingMore} onClick={() => void load(page+1,true)} style={{border:0,borderRadius:11,padding:"12px 22px",background:"#3157d5",color:"white",fontWeight:700,opacity:loadingMore ? 0.65 : 1}}>{loadingMore ? "جارٍ التحميل…" : "عرض تحديات إضافية"}</button></div>}
      </section>
    </main>
  );
}
