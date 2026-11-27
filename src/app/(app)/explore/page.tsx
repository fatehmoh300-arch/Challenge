"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, CalendarDays, CheckCircle2, Globe2, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { useApp } from "@/components/app-provider";
import { Button, Card, EmptyState, LoadingState, Notice, PageTitle } from "@/components/ui";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { formatArabicDate, number } from "@/lib/format";

type PublicChallenge = {
  id: string;
  title: string;
  description: string;
  category: string;
  difficulty: "easy" | "medium" | "hard";
  start_date: string;
  end_date: string;
  status: "open" | "active";
  join_mode: "open" | "approval" | "invite";
  max_members: number;
  member_count: number;
  created_at: string;
};

const PAGE_SIZE = 20;
const difficultyLabel = { easy: "مبتدئ", medium: "متوسط", hard: "متقدم" };
const joinLabel = { open: "انضمام فوري", approval: "يتطلب موافقة", invite: "بالدعوة فقط" };

export default function ExplorePage() {
  const { memberships, selectChallenge, refresh } = useApp();
  const router = useRouter();
  const [rows, setRows] = useState<PublicChallenge[]>([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [busyId, setBusyId] = useState("");
  const [message, setMessage] = useState("");
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
        .in("status", ["open", "active"])
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .range(targetPage * PAGE_SIZE, targetPage * PAGE_SIZE + PAGE_SIZE - 1);

      if (queryError) throw queryError;
      const nextRows = (data || []) as PublicChallenge[];
      setRows((current) => append ? [...current, ...nextRows] : nextRows);
      setPage(targetPage);
      setHasMore(nextRows.length === PAGE_SIZE);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذّر تحميل التحديات العامة.");
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => { void load(0, false); }, [load]);

  const join = async (item: PublicChallenge) => {
    const existing = memberships.find((row) => row.challenge_id === item.id);
    if (existing) {
      await selectChallenge(item.id);
      router.push("/dashboard");
      return;
    }

    setBusyId(item.id);
    setError("");
    setMessage("");
    try {
      const sb = getSupabaseBrowserClient();
      if (item.join_mode === "invite") {
        throw new Error("هذا التحدّي يتطلب رمز دعوة من المنظّم.");
      }

      const rpcName = item.join_mode === "open" ? "join_public_challenge" : "request_join_challenge";
      const args = item.join_mode === "open"
        ? { p_challenge_id: item.id }
        : { p_challenge_id: item.id, p_message: "" };

      const { data, error: rpcError } = await sb.rpc(rpcName, args);
      if (rpcError) throw rpcError;

      if (item.join_mode === "open") {
        await refresh(data as string);
        setMessage(`انضممت إلى «${item.title}». فُتحت مساحة التحدّي الآن.`);
        router.push("/dashboard");
      } else {
        setMessage(`أُرسل طلب انضمامك إلى «${item.title}». سيظهر التحدّي في حسابك بعد موافقة المنظّم.`);
        await load(0, false);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذّر إرسال طلب الانضمام.");
    } finally {
      setBusyId("");
    }
  };

  return <div>
    <PageTitle
      title="استكشاف التحديات"
      subtitle="اكتشف التحديات العامة المتاحة للانضمام. تظهر هنا فقط التحديات التي تسمح إعداداتها بالانضمام."
      action={<span className="privacy-pill"><Globe2 size={15}/> تحديات عامة</span>}
    />
    {message && <Notice tone="success">{message}</Notice>}
    {error && <Notice tone="error">{error}</Notice>}
    {loading ? <LoadingState label="جارٍ البحث عن تحديات متاحة…"/> :
      !rows.length ? <EmptyState title="لا توجد تحديات متاحة حالياً" text="يمكنك إنشاء تحدٍّ خاص بك أو العودة لاحقاً لاستكشاف تحديات عامة جديدة."/> :
      <div style={{display:"grid",gap:12}}>
        {rows.map((item) => {
          const isMember = memberships.some((row) => row.challenge_id === item.id);
          const full = item.member_count >= item.max_members;
          return <Card key={item.id}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:12,flexWrap:"wrap"}}>
              <div style={{minWidth:0,flex:"1 1 240px"}}>
                <div style={{display:"flex",gap:7,flexWrap:"wrap",alignItems:"center"}}>
                  <span className="challenge-tag"><Globe2 size={13}/>{item.category || "عام"}</span>
                  <span className="status-chip done">{difficultyLabel[item.difficulty]}</span>
                  <span className="status-chip pending">{joinLabel[item.join_mode]}</span>
                </div>
                <h3 style={{margin:"12px 0 5px"}}>{item.title}</h3>
                <p style={{margin:0,color:"var(--muted)",fontSize:12,lineHeight:1.8,whiteSpace:"pre-wrap"}}>{item.description || "لم يضف المنظّم وصفاً بعد."}</p>
                <div style={{display:"flex",gap:14,flexWrap:"wrap",marginTop:12,color:"var(--muted)",fontSize:11}}>
                  <span><CalendarDays size={13} style={{verticalAlign:"middle"}}/> {formatArabicDate(item.start_date,{day:"numeric",month:"short",year:"numeric"})} — {formatArabicDate(item.end_date,{day:"numeric",month:"short",year:"numeric"})}</span>
                  <span><Users size={13} style={{verticalAlign:"middle"}}/> {number(item.member_count)} / {number(item.max_members)}</span>
                </div>
              </div>
              <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
                {isMember
                  ? <Button variant="secondary" onClick={() => void join(item)}><CheckCircle2 size={15}/> فتح التحدّي</Button>
                  : <Button busy={busyId===item.id} disabled={full || item.join_mode==="invite"} onClick={() => void join(item)}>
                      {full ? "اكتمل العدد" : item.join_mode==="approval" ? "طلب الانضمام" : "انضم الآن"}
                      <ArrowLeft size={15}/>
                    </Button>}
              </div>
            </div>
          </Card>;
        })}
        {hasMore && <Button variant="secondary" onClick={() => void load(page+1,true)} busy={loadingMore}>تحميل المزيد</Button>}
      </div>}
  </div>;
}
