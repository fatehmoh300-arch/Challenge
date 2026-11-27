"use client";

import { use, useState } from "react";
import { useRouter } from "next/navigation";
import { Link2, Users } from "lucide-react";
import { useApp } from "@/components/app-provider";
import { Button, Card, Notice } from "@/components/ui";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export default function InvitePage({params}:{params:Promise<{token:string}>}){const {token}=use(params);const {user,refresh}=useApp();const [busy,setBusy]=useState(false);const [error,setError]=useState("");const router=useRouter();const join=async()=>{if(!user){router.push(`/login?next=/invite/${token}`);return;}setBusy(true);setError("");try{const {error:e}=await getSupabaseBrowserClient().rpc("join_challenge",{p_token:token});if(e)throw e;await refresh();router.replace("/dashboard");}catch(e){setError(e instanceof Error?e.message:"تعذّر استخدام رابط الدعوة.");}finally{setBusy(false)}};return <div className="invite-page" dir="rtl"><Card><div className="invite-page-icon"><Users/></div><span className="eyebrow">CHALLENGE INVITATION</span><h1>دعوة للانضمام إلى تحدٍّ</h1><p>عند قبول الدعوة ستنضم إلى مساحة مشتركة، مع بقاء تفاصيل عادات كل مشارك خاصة به.</p>{error&&<Notice tone="error">{error}</Notice>}<Button onClick={join} busy={busy} className="full-width"><Link2 size={17}/> قبول الدعوة والانضمام</Button></Card></div>}
