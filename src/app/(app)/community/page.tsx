"use client";

import { useCallback, useEffect, useState } from "react";
import { MessageCircle, Send, Trash2, Users } from "lucide-react";
import { useApp } from "@/components/app-provider";
import { Button, Card, Notice, PageTitle, LoadingState, EmptyState } from "@/components/ui";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { initials } from "@/lib/format";

type CommentRow={id:string;post_id:string;challenge_id:string;author_id:string;content:string;created_at:string;author_name?:string};
type PostRow={id:string;challenge_id:string;author_id:string;content:string;created_at:string;is_announcement:boolean;author_name?:string;comments:CommentRow[]};
const PAGE_SIZE=25;
const COMMENT_BATCH_LIMIT=500;

export default function CommunityPage(){
  const {user,challenge,membership}=useApp();
  const sb=getSupabaseBrowserClient();
  const [posts,setPosts]=useState<PostRow[]>([]);
  const [content,setContent]=useState("");
  const [isAnnouncement,setIsAnnouncement]=useState(false);
  const [commentDrafts,setCommentDrafts]=useState<Record<string,string>>({});
  const [page,setPage]=useState(0);
  const [hasMore,setHasMore]=useState(false);
  const [loading,setLoading]=useState(true);
  const [loadingMore,setLoadingMore]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [message,setMessage]=useState("");
  const canModerate=membership?.role==="owner"||membership?.permissions.includes("moderate_posts");
  const canPublishAnnouncement=membership?.role==="owner"||membership?.permissions.includes("publish_posts");

  const load=useCallback(async(targetPage=0,append=false)=>{
    if(!challenge)return;
    if(append)setLoadingMore(true);else setLoading(true);
    setError("");
    try{
      const {data:postData,error:postError}=await sb.from("challenge_posts")
        .select("id,challenge_id,author_id,content,created_at,is_announcement")
        .eq("challenge_id",challenge.id)
        .order("created_at",{ascending:false})
        .order("id",{ascending:false})
        .range(targetPage*PAGE_SIZE,targetPage*PAGE_SIZE+PAGE_SIZE-1);
      if(postError)throw postError;
      const rawPosts=(postData||[]) as Omit<PostRow,"comments"|"author_name">[];
      const ids=rawPosts.map(p=>p.id);
      let comments:CommentRow[]=[];
      if(ids.length){
        const {data:commentData,error:commentError}=await sb.from("challenge_comments")
          .select("id,post_id,challenge_id,author_id,content,created_at")
          .in("post_id",ids)
          .order("created_at",{ascending:false})
          .order("id",{ascending:false})
          .limit(COMMENT_BATCH_LIMIT);
        if(commentError)throw commentError;
        comments=((commentData||[]) as CommentRow[]).reverse();
      }
      const userIds=[...new Set([...rawPosts.map(p=>p.author_id),...comments.map(c=>c.author_id)])];
      let profileMap=new Map<string,string>();
      if(userIds.length){
        const {data:profileData,error:profileError}=await sb.from("profiles")
          .select("id,display_name").in("id",userIds);
        if(profileError)throw profileError;
        profileMap=new Map((profileData||[]).map((p:{id:string;display_name:string})=>[p.id,p.display_name]));
      }
      const nextPosts=rawPosts.map(p=>({
        ...p,
        author_name:profileMap.get(p.author_id)||"مشارك",
        comments:comments.filter(c=>c.post_id===p.id).map(c=>({...c,author_name:profileMap.get(c.author_id)||"مشارك"})),
      }));
      setPosts(previous=>append?[...previous,...nextPosts]:nextPosts);
      setPage(targetPage);
      setHasMore(rawPosts.length===PAGE_SIZE);
    }catch(cause){
      setError(cause instanceof Error?cause.message:"تعذّر تحميل مساحة المجتمع.");
    }finally{
      setLoading(false);
      setLoadingMore(false);
    }
  },[challenge?.id]);

  useEffect(()=>{void load(0,false);},[load]);

  const publish=async()=>{
    if(!user||!challenge||!content.trim())return;
    setBusy(true);setError("");setMessage("");
    try{
      const {error:e}=await sb.from("challenge_posts").insert({
        challenge_id:challenge.id,
        author_id:user.id,
        content:content.trim(),
        is_announcement:canPublishAnnouncement&&isAnnouncement,
      });
      if(e)throw e;
      setContent("");setIsAnnouncement(false);
      await load(0,false);
      setMessage("تم نشر رسالتك.");
    }catch(cause){setError(cause instanceof Error?cause.message:"تعذّر نشر الرسالة.");}
    finally{setBusy(false);}
  };

  const comment=async(postId:string)=>{
    if(!user||!challenge)return;
    const text=commentDrafts[postId]?.trim();
    if(!text)return;
    setBusy(true);setError("");setMessage("");
    try{
      const {error:e}=await sb.from("challenge_comments").insert({
        post_id:postId,challenge_id:challenge.id,author_id:user.id,content:text,
      });
      if(e)throw e;
      setCommentDrafts(v=>({...v,[postId]:""}));
      await load(0,false);
    }catch(cause){setError(cause instanceof Error?cause.message:"تعذّر إضافة التعليق.");}
    finally{setBusy(false);}
  };

  const removePost=async(id:string)=>{
    if(!window.confirm("حذف هذا المنشور؟"))return;
    const {error:e}=await sb.from("challenge_posts").delete().eq("id",id);
    if(e)setError(e.message);
    else{await load(0,false);setMessage("تم حذف المنشور.");}
  };
  const removeComment=async(id:string)=>{
    const {error:e}=await sb.from("challenge_comments").delete().eq("id",id);
    if(e)setError(e.message);else await load(0,false);
  };

  return <div>
    <PageTitle title="مجتمع التحدّي" subtitle="تواصل مع المشاركين، شارك تقدّمك، وناقش ما يساعد على الاستمرار." action={<span className="privacy-pill"><Users size={15}/> أعضاء التحدّي فقط</span>}/>
    {message&&<Notice tone="success">{message}</Notice>}{error&&<Notice tone="error">{error}</Notice>}
    <Card>
      <label>اكتب مشاركة أو تحديثاً للمشاركين<textarea className="text-input" rows={3} maxLength={3000} value={content} onChange={e=>setContent(e.target.value)} placeholder="شارك إنجازاً أو فكرة أو سؤالاً…"/></label>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:10,flexWrap:"wrap",marginTop:10}}>
        {canPublishAnnouncement?<label className="checkbox-label"><input type="checkbox" checked={isAnnouncement} onChange={e=>setIsAnnouncement(e.target.checked)}/> نشر كإعلان رسمي</label>:<small className="muted-line">يمكنك نشر مشاركة عادية. الإعلانات الرسمية للمفوّضين فقط.</small>}
        <Button onClick={publish} busy={busy} disabled={!content.trim()}><Send size={15}/> نشر</Button>
      </div>
    </Card>
    {loading?<LoadingState label="جارٍ تحميل المنشورات…"/>:!posts.length?<EmptyState title="لا توجد مشاركات بعد" text="ابدأ بنشر أول تحديث لأعضاء التحدّي."/>:
      <div style={{display:"grid",gap:13,marginTop:14}}>
        {posts.map(post=><Card key={post.id}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <div className="avatar">{initials(post.author_name)}</div>
            <div style={{flex:1}}><strong>{post.author_name}</strong>{post.is_announcement&&<span className="status-chip done" style={{marginInlineStart:8}}>إعلان رسمي</span>}<small style={{display:"block",color:"var(--muted)",fontSize:10}}>{new Date(post.created_at).toLocaleString("ar-DZ")}</small></div>
            {(post.author_id===user?.id||canModerate)&&<button className="logout-button" aria-label="حذف المنشور" onClick={()=>void removePost(post.id)}><Trash2 size={15}/></button>}
          </div>
          <p style={{whiteSpace:"pre-wrap",lineHeight:1.9,fontSize:13,margin:"14px 0"}}>{post.content}</p>
          <div style={{borderTop:"1px solid var(--line)",paddingTop:11}}>
            {post.comments.map(c=><div key={c.id} style={{display:"flex",gap:8,alignItems:"flex-start",padding:"7px 0"}}>
              <div className="avatar small">{initials(c.author_name)}</div>
              <div style={{flex:1,background:"#f5f7fa",borderRadius:10,padding:"8px 10px"}}><strong style={{fontSize:11}}>{c.author_name}</strong><p style={{fontSize:11,lineHeight:1.7,margin:"3px 0 0",whiteSpace:"pre-wrap"}}>{c.content}</p></div>
              {(c.author_id===user?.id||canModerate)&&<button className="logout-button" aria-label="حذف التعليق" onClick={()=>void removeComment(c.id)}><Trash2 size={13}/></button>}
            </div>)}
            {post.comments.length===COMMENT_BATCH_LIMIT&&<small className="muted-line">عُرضت أحدث {COMMENT_BATCH_LIMIT} تعليقات في دفعة المنشورات الحالية.</small>}
            <div style={{display:"flex",gap:8,marginTop:8}}>
              <input className="text-input" value={commentDrafts[post.id]||""} onChange={e=>setCommentDrafts(v=>({...v,[post.id]:e.target.value}))} maxLength={1200} placeholder="أضف تعليقاً…"/>
              <Button variant="secondary" onClick={()=>void comment(post.id)} busy={busy} disabled={!(commentDrafts[post.id]||"").trim()}><MessageCircle size={15}/></Button>
            </div>
          </div>
        </Card>)}
        {hasMore&&<Button variant="secondary" onClick={()=>void load(page+1,true)} busy={loadingMore}>تحميل منشورات أقدم</Button>}
      </div>}
  </div>;
}
