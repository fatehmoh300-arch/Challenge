import Link from "next/link";
import { ArrowLeft, Compass, ShieldCheck, Trophy, Users } from "lucide-react";

export default function Home() {
  return (
    <main dir="rtl" style={{ minHeight: "100vh", background: "#f5f7fb", color: "#182235", padding: "28px 20px", display: "flex", flexDirection: "column" }}>
      <header style={{ width: "100%", maxWidth: 1120, margin: "0 auto", display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <Link href="/" style={{ display: "flex", alignItems: "center", gap: 10, color: "inherit", textDecoration: "none" }}>
          <span style={{ width: 42, height: 42, borderRadius: 14, background: "#3157d5", color: "white", display: "grid", placeItems: "center", fontWeight: 800, fontSize: 22 }}>C</span>
          <span><strong style={{ display: "block", fontSize: 19 }}>تحدّي</strong><small style={{ color: "#718096", letterSpacing: 2 }}>CHALLENGE</small></span>
        </Link>
        <nav style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Link href="/explore" style={{ padding: "10px 14px", color: "#3157d5", textDecoration: "none", fontWeight: 700 }}>استكشف التحديات</Link>
          <Link href="/login" style={{ padding: "10px 17px", background: "#3157d5", color: "white", borderRadius: 12, textDecoration: "none", fontWeight: 700 }}>دخول / حساب جديد</Link>
        </nav>
      </header>

      <section style={{ width: "100%", maxWidth: 1120, margin: "auto", padding: "80px 0 64px", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 320px), 1fr))", gap: 42, alignItems: "center" }}>
        <div>
          <span style={{ display: "inline-flex", padding: "8px 13px", background: "#e8edff", color: "#3157d5", borderRadius: 99, fontSize: 13, fontWeight: 700 }}>منصة التحديات والإنجاز المشترك</span>
          <h1 style={{ fontSize: "clamp(36px, 6vw, 64px)", lineHeight: 1.22, letterSpacing: "-1.5px", margin: "22px 0 18px", maxWidth: 680 }}>حوّل أهدافك إلى تحدٍّ. واجعل التقدّم مرئياً.</h1>
          <p style={{ color: "#637087", fontSize: 18, lineHeight: 1.9, maxWidth: 620, margin: 0 }}>أنشئ تحدياً، ادعُ أصدقاءك، سجّل إنجازاتك، وتابع المنافسة في مساحة واحدة منظمة.</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 30 }}>
            <Link href="/explore" style={{ display: "inline-flex", alignItems: "center", gap: 9, padding: "14px 20px", background: "#3157d5", color: "white", borderRadius: 13, textDecoration: "none", fontWeight: 700 }}>استكشف التحديات <ArrowLeft size={18}/></Link>
            <Link href="/login" style={{ padding: "14px 20px", background: "white", color: "#26334b", border: "1px solid #e2e8f0", borderRadius: 13, textDecoration: "none", fontWeight: 700 }}>ابدأ تحدّيك</Link>
          </div>
        </div>
        <div style={{ background: "white", border: "1px solid #e7ebf3", borderRadius: 26, padding: 26, boxShadow: "0 18px 55px rgba(27,48,95,.07)" }}>
          <div style={{ display: "grid", gap: 18 }}>
            {[
              [Compass, "اكتشف التحديات", "تصفّح التحديات العامة قبل إنشاء حساب."],
              [Users, "تقدّم مع الآخرين", "شارك الأصدقاء أو انضم إلى مجتمع يناسب هدفك."],
              [Trophy, "نافس بعدل", "إنجازات ونقاط وترتيب واضح لكل مشارك."],
              [ShieldCheck, "خصوصية وصلاحيات", "التحديات الخاصة تبقى للمصرّح لهم فقط."]
            ].map(([Icon, title, desc], i) => {
              const I = Icon as typeof Compass;
              return <div key={i} style={{ display: "flex", gap: 14, alignItems: "flex-start" }}><span style={{ width: 42, height: 42, borderRadius: 13, background: "#eef2ff", color: "#3157d5", display: "grid", placeItems: "center", flexShrink: 0 }}><I size={20}/></span><span><strong style={{ display: "block", marginBottom: 5 }}>{title as string}</strong><small style={{ color: "#718096", lineHeight: 1.7 }}>{desc as string}</small></span></div>;
            })}
          </div>
        </div>
      </section>
      <footer style={{ width: "100%", maxWidth: 1120, margin: "0 auto", borderTop: "1px solid #e3e8f0", paddingTop: 18, color: "#8993a5", fontSize: 13 }}>CHALLENGE · خطوات صغيرة، أثر كبير.</footer>
    </main>
  );
}
