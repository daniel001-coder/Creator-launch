const CFG={
  SUPABASE_URL:"https://ovhlchyuzmdtqpfeyngg.supabase.co",
  SUPABASE_KEY:"sb_publishable_ixL06NJ_XsulKFDMvgShAA_HzbVSnWI",
  PAYSTACK_PUBLIC_KEY:"pk_test_REPLACE_WITH_YOUR_PUBLIC_KEY", // Paystack PUBLIC key only (never the secret key)
  AMOUNT_KOBO:200000, // ₦2,000
  DAYS:30
};
const sb=supabase.createClient(CFG.SUPABASE_URL,CFG.SUPABASE_KEY);
const $=id=>document.getElementById(id);
const esc=s=>String(s==null?"":s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const fmt=d=>d?new Date(d).toLocaleDateString(undefined,{year:"numeric",month:"long",day:"numeric"}):"—";
const NAV=[["dashboard","Dashboard","🏠"],["courses","Courses","🎓"],["live","Live Classes","📡"],["affiliate","Affiliate","🤝"],["profile","Profile","👤"],["pay","Subscription","💳"]];

// Every page asks the database whether THIS user has paid and is not expired
async function checkPaid(user){
  const {data:sub}=await sb.from("subscriptions").select("expires_at").eq("user_id",user.id).maybeSingle();
  const exp=sub?new Date(sub.expires_at):null;
  return {exp,active:!!exp&&exp>new Date()};
}
async function boot(opt){
  const {data:{session}}=await sb.auth.getSession();
  if(!session){location.replace("auth.html");return;}
  const user=session.user, meta=user.user_metadata||{};
  const {exp,active}=await checkPaid(user);
  if(opt.paid&&!active){location.replace("pay.html"+(exp?"?expired":"?new"));return;}
  const name=meta.full_name||user.email.split("@")[0];
  const days=active?Math.ceil((exp-new Date())/864e5):0;
  const nav=NAV.map(n=>`<a href="${n[0]}.html" class="${n[0]===opt.page?"on":""}"><span>${n[2]}</span>${n[1]}</a>`).join("");
  document.body.insertAdjacentHTML("afterbegin",
   `<header class="top"><a class="logo" href="index.html"><i>▶</i>Creator<b>Launch</b></a>
    <div class="me"><span>${esc(name)}</span>
    <button class="btn ghost" id="out" type="button">Log out</button></div></header>
    <div class="shell"><aside class="side">${nav}</aside><main id="main"></main></div>`);
  const v=$("view"); $("main").appendChild(v); v.hidden=false; $("load").remove();
  if(active&&days<=3&&opt.page!=="pay")
    v.insertAdjacentHTML("afterbegin",`<div class="msg warn">⚠️ Your access ends in <b>${days} day${days===1?"":"s"}</b> (${fmt(exp)}). <a href="pay.html" style="text-decoration:underline;font-weight:600">Renew now</a></div>`);
  $("out").onclick=async()=>{await sb.auth.signOut();location.replace("auth.html");};
  sb.auth.onAuthStateChange(ev=>{if(ev==="SIGNED_OUT")location.replace("auth.html");});
  if(opt.paid){ // re-check payment when the tab is reopened and every 5 minutes
    const recheck=async()=>{const r=await checkPaid(user);if(!r.active)location.replace("pay.html?expired");};
    document.addEventListener("visibilitychange",()=>{if(!document.hidden)recheck();});
    setInterval(recheck,300000);
  }
  if(active) setTimeout(()=>location.reload(),Math.min(exp-new Date()+1000,2147483647)); // re-check when plan expires
  return {user,name,exp,active,days};
}
