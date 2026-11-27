"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Activity, BarChart3, CalendarDays, CheckSquare, Home, LogOut, Settings, Trophy, ClipboardList, BookOpen, Layers3, Medal, MessageCircle, SlidersHorizontal, MoreHorizontal } from "lucide-react";
import { useApp } from "@/components/app-provider";
import { LoadingState } from "@/components/ui";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { initials } from "@/lib/format";
import { useLeaderboard } from "@/lib/use-leaderboard";

const nav = [
  { href: "/dashboard", label: "الرئيسية", icon: Home },
  { href: "/daily", label: "إنجاز اليوم", icon: CheckSquare },
  { href: "/challenges", label: "تحدياتي", icon: Layers3 },
  { href: "/competition", label: "المنافسة", icon: Trophy },
  { href: "/achievements", label: "الإنجازات", icon: Medal },
  { href: "/community", label: "المجتمع", icon: MessageCircle },
  { href: "/manage", label: "إدارة التحدّي", icon: SlidersHorizontal },
  { href: "/calendar", label: "التقويم", icon: CalendarDays },
  { href: "/stats", label: "الإحصائيات", icon: BarChart3 },
  { href: "/review", label: "المراجعة", icon: ClipboardList },
  { href: "/settings", label: "الإعدادات", icon: Settings },
];

const mobilePrimaryNav = nav.slice(0, 4);
const mobileMoreNav = nav.slice(4);

export function AppShell({ children }: { children: React.ReactNode }) {
  const { configured, loading, error, user, profile, challenge, challenges, selectChallenge, refresh } = useApp();
  const router = useRouter();
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  useLeaderboard(challenge?.id, user?.id, true);

  useEffect(() => {
    if (!loading && !error && configured && !user) router.replace("/login");
    if (!loading && !error && configured && user && !challenge && pathname !== "/setup") router.replace("/setup");
  }, [loading, error, configured, user, challenge, pathname, router]);

  if (!configured) return <div className="config-screen"><div className="brand-lockup"><div className="brand-mark">C</div><div><strong>تحدّي</strong><span>CHALLENGE</span></div></div><h1>اربط المنصة بقاعدة بياناتها</h1><p>لم نعثر على إعدادات Supabase. أضف رابط المشروع والمفتاح العام إلى ملف <code>.env.local</code>، ثم نفّذ ملفات قاعدة البيانات من مجلد <code>supabase/migrations</code>.</p><div className="config-steps"><span>١. أنشئ مشروع Supabase.</span><span>٢. انسخ NEXT_PUBLIC_SUPABASE_URL وNEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.</span><span>٣. نفّذ ملفات migration بالترتيب ثم شغّل التطبيق.</span></div></div>;
  if (error) return <div className="config-screen" dir="rtl"><h1>تعذّر تحميل بيانات التحدّي</h1><p>{error}</p><button className="btn btn-primary" onClick={() => void refresh()}>إعادة المحاولة</button></div>;
  if (loading || !user || !challenge) return <LoadingState label="جارٍ تجهيز مساحة التحدّي…" />;

  const logout = async () => { await getSupabaseBrowserClient().auth.signOut(); router.replace("/login"); };
  return <div className="app-layout" dir="rtl">
    <aside className="sidebar">
      <Link href="/dashboard" className="brand-lockup"><div className="brand-mark">C</div><div><strong>تحدّي</strong><span>CHALLENGE</span></div></Link>
      <div className="sidebar-caption">مساحة التحدّي</div>
      <nav className="side-nav">{nav.map(({ href, label, icon: Icon }) => <Link key={href} href={href} className={pathname === href ? "active" : ""}><Icon size={19} /><span>{label}</span></Link>)}</nav>
      <div className="sidebar-bottom"><div className="profile-mini"><div className="avatar">{initials(profile?.display_name)}</div><div><strong>{profile?.display_name || "مشارك"}</strong><span>عضو في {challenges.length} تحدٍّ</span></div></div><button className="logout-button" onClick={logout} aria-label="تسجيل الخروج"><LogOut size={17} /></button></div>
    </aside>
    <main className="main-area">
      <header className="topbar"><div><span className="eyebrow">المساحة النشطة</span><strong>{challenge.title}</strong></div><div className="topbar-right">{challenges.length > 1 && <select aria-label="تبديل التحدّي" value={challenge.id} onChange={e=>void selectChallenge(e.target.value)} className="text-input" style={{maxWidth:210,padding:"7px 9px",fontSize:11}}>{challenges.map(item=><option key={item.id} value={item.id}>{item.title}</option>)}</select>}<span className="live-dot">متصل</span><div className="avatar small">{initials(profile?.display_name)}</div></div></header>
      <div className="content-wrap">{children}<footer className="app-footer"><span>خطوات صغيرة، أثر كبير.</span><span>توقيت الجزائر · Africa/Algiers</span></footer></div>
    </main>
    <nav className="mobile-nav" aria-label="التنقل الرئيسي">
      {mobilePrimaryNav.map(({ href, label, icon: Icon }) => <Link key={href} href={href} className={pathname === href ? "active" : ""}><Icon size={19} /><span>{label}</span></Link>)}
      <button type="button" className={moreOpen || mobileMoreNav.some(item => pathname === item.href) ? "active" : ""} aria-expanded={moreOpen} aria-controls="mobile-more-menu" onClick={() => setMoreOpen(value => !value)}><MoreHorizontal size={19}/><span>المزيد</span></button>
    </nav>
    {moreOpen && <div className="mobile-more-backdrop" onClick={() => setMoreOpen(false)}>
      <div id="mobile-more-menu" className="mobile-more-menu" role="menu" onClick={event => event.stopPropagation()}>
        <div className="mobile-more-heading"><strong>صفحات إضافية</strong><button type="button" onClick={() => setMoreOpen(false)} aria-label="إغلاق">×</button></div>
        <div className="mobile-more-grid">{mobileMoreNav.map(({href,label,icon:Icon})=><Link role="menuitem" key={href} href={href} className={pathname===href?"active":""} onClick={()=>setMoreOpen(false)}><Icon size={18}/><span>{label}</span></Link>)}</div>
      </div>
    </div>}
  </div>;
}
