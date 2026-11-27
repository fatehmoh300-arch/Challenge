"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { Activity, BarChart3, CalendarDays, CheckSquare, Home, LogOut, Settings, Trophy, ClipboardList, BookOpen } from "lucide-react";
import { useApp } from "@/components/app-provider";
import { LoadingState, Notice } from "@/components/ui";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { initials } from "@/lib/format";
import { useLeaderboard } from "@/lib/use-leaderboard";

const nav = [
  { href: "/dashboard", label: "الرئيسية", icon: Home },
  { href: "/daily", label: "إنجاز اليوم", icon: CheckSquare },
  { href: "/calendar", label: "التقويم", icon: CalendarDays },
  { href: "/competition", label: "المنافسة", icon: Trophy },
  { href: "/stats", label: "الإحصائيات", icon: BarChart3 },
  { href: "/review", label: "المراجعة", icon: ClipboardList },
  { href: "/settings", label: "الإعدادات", icon: Settings },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const { configured, loading, user, profile, challenge } = useApp();
  const router = useRouter();
  const pathname = usePathname();
  useLeaderboard(challenge?.id, user?.id, true);

  useEffect(() => {
    if (!loading && configured && !user) router.replace("/login");
    if (!loading && configured && user && !challenge && pathname !== "/setup") router.replace("/setup");
  }, [loading, configured, user, challenge, pathname, router]);

  if (!configured) return <div className="config-screen"><div className="brand-lockup"><div className="brand-mark">C</div><div><strong>تحدّي</strong><span>CHALLENGE</span></div></div><h1>اربط المنصة بقاعدة بياناتها</h1><p>لم نعثر على إعدادات Supabase. أضف رابط المشروع والمفتاح العام إلى ملف <code>.env.local</code>، ثم نفّذ ملف قاعدة البيانات من مجلد <code>supabase/migrations</code>.</p><div className="config-steps"><span>١. أنشئ مشروع Supabase.</span><span>٢. انسخ NEXT_PUBLIC_SUPABASE_URL وNEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.</span><span>٣. نفّذ ملف migration ثم شغّل التطبيق.</span></div></div>;
  if (loading || !user || !challenge) return <LoadingState label="جارٍ تجهيز مساحة التحدّي…" />;

  const logout = async () => { await getSupabaseBrowserClient().auth.signOut(); router.replace("/login"); };
  return <div className="app-layout" dir="rtl">
    <aside className="sidebar">
      <Link href="/dashboard" className="brand-lockup"><div className="brand-mark">C</div><div><strong>تحدّي</strong><span>CHALLENGE</span></div></Link>
      <div className="sidebar-caption">مساحة التحدّي</div>
      <nav className="side-nav">{nav.map(({ href, label, icon: Icon }) => <Link key={href} href={href} className={pathname === href ? "active" : ""}><Icon size={19} /><span>{label}</span></Link>)}</nav>
      <div className="sidebar-bottom"><div className="profile-mini"><div className="avatar">{initials(profile?.display_name)}</div><div><strong>{profile?.display_name || "مشارك"}</strong><span>عضو في التحدّي</span></div></div><button className="logout-button" onClick={logout} aria-label="تسجيل الخروج"><LogOut size={17} /></button></div>
    </aside>
    <main className="main-area">
      <header className="topbar"><div><span className="eyebrow">مساحة العمل</span><strong>{challenge.title}</strong></div><div className="topbar-right"><span className="live-dot">متصل</span><div className="avatar small">{initials(profile?.display_name)}</div></div></header>
      <div className="content-wrap">{children}<footer className="app-footer"><span>خطوات صغيرة، أثر كبير.</span><span>توقيت الجزائر · Africa/Algiers</span></footer></div>
    </main>
    <nav className="mobile-nav">{nav.slice(0, 5).map(({ href, label, icon: Icon }) => <Link key={href} href={href} className={pathname === href ? "active" : ""}><Icon size={19} /><span>{label}</span></Link>)}</nav>
  </div>;
}
