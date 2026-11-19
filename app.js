const CFG={
  SUPABASE_URL:"https://ovhlchyuzmdtqpfeyngg.supabase.co",
  SUPABASE_KEY:"sb_publishable_ixL06NJ_XsulKFDMvgShAA_HzbVSnWI",
  PAYSTACK_PUBLIC_KEY:"pk_live_14b97bd56ab3ad90001c83c1ce5a0fb7c0a2283e", // Paystack PUBLIC key only (never the secret key)
  AMOUNT_KOBO:200000, // ₦2,000
  DAYS:30
};
const sb=supabase.createClient(CFG.SUPABASE_URL,CFG.SUPABASE_KEY);
const $=id=>document.getElementById(id);
const esc=s=>String(s==null?"":s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const fmt=d=>d?new Date(d).toLocaleDateString(undefined,{year:"numeric",month:"long",day:"numeric"}):"—";
const NAV=[["dashboard","Dashboard","🏠"],["automation","Automation","🤖"],["affiliate","Affiliate","🤝"],["courses","My Courses","🎓"],["sell","Sell a Course","📤"],["earnings","Earnings","💰"],["live","Live Classes","📡"],["profile","Profile","👤"],["pay","Subscription","💳"]];
const money=k=>"₦"+(Number(k||0)/100).toLocaleString();
const fmtDT=d=>d?new Date(d).toLocaleString():"—";
const coverUrl=p=>p?sb.storage.from("course-covers").getPublicUrl(p).data.publicUrl:"";
const cardImg=x=>x.cover_path?`<img src="${esc(coverUrl(x.cover_path))}" alt="" loading="lazy">`:'<div class="ph">🎓</div>';
const safeName=n=>String(n).replace(/[^\w.\-]+/g,"_").slice(-80);
async function uploadTo(bucket,uid,file){
  const path=uid+"/"+Date.now()+"_"+safeName(file.name);
  const {error}=await sb.storage.from(bucket).upload(path,file,{upsert:false,contentType:file.type||undefined});
  if(error)throw error;return path;}
// Shared by admin.html and sell.html: uploads the cover + file, then saves the course. Returns an error or null.
async function saveCourse({id,row,cover,file,uid}){
  try{
    if(cover&&(!cover.type.startsWith("image/")||cover.size>5*1048576))return {message:"The picture must be an image under 5 MB."};
    if(file&&file.size>50*1048576)return {message:"The course file must be under 50 MB."};
    if(!id&&!file)return {message:"Please choose the course file to upload."};
    if(!id&&!cover)return {message:"Please choose a cover picture."};
    if(cover)row.cover_path=await uploadTo("course-covers",uid,cover);
    if(file){row.file_path=await uploadTo("course-files",uid,file);row.file_name=file.name;}
    const {error}=id?await sb.from("courses").update(row).eq("id",id):await sb.from("courses").insert(row);
    return error||null;
  }catch(e){return e;}}
async function downloadCourse(x){
  const {data,error}=await sb.storage.from("course-files").createSignedUrl(x.file_path,120,{download:x.file_name||true});
  if(error)return alert(error.message);location.href=data.signedUrl;}
const safeUrl=u=>/^https?:\/\//i.test(u||"")?u:"#";
async function getSettings(){const {data}=await sb.from("site_settings").select("key,value");const o={};(data||[]).forEach(r=>o[r.key]=r.value);return o;};

// Every page asks the database whether THIS user has paid and is not expired
async function checkPaid(user){
  const {data:sub}=await sb.from("subscriptions").select("expires_at").eq("user_id",user.id).maybeSingle();
  const exp=sub?new Date(sub.expires_at):null;
  return {exp,active:!!exp&&exp>new Date()};
}
async function boot(opt){
  const {data:{session}}=await sb.auth.getSession();
  if(!session){location.replace("auth.html?next="+encodeURIComponent(location.pathname.split("/").pop()+location.search));return;}
  const user=session.user, meta=user.user_metadata||{};
  const {exp,active:paid}=await checkPaid(user);
  const adm=(await sb.rpc("is_admin")).data===true, active=paid||adm;
  if(!adm){const {data:sp}=await sb.from("suspended_users").select("user_id").eq("user_id",user.id).maybeSingle();
    if(sp){await sb.auth.signOut();location.replace("auth.html?suspended");return;}}
  if(opt.admin&&!adm){location.replace("dashboard.html");return;}
  const settings=await getSettings();
  if(opt.paid&&!active){location.replace("pay.html"+(exp?"?expired":"?new"));return;}
  const name=meta.full_name||user.email.split("@")[0];
  const days=paid?Math.ceil((exp-new Date())/864e5):0;
  const nav=(adm?NAV.concat([["admin","Admin","⚙️"]]):NAV).map(n=>`<a href="${n[0]}.html" class="${n[0]===opt.page?"on":""}"><span>${n[2]}</span>${n[1]}</a>`).join("");
  document.body.insertAdjacentHTML("afterbegin",
   `<header class="top"><a class="logo" href="index.html"><i>▶</i>Creator<b>Launch</b></a>
    <div class="me"><span>${esc(name)}</span>
    <button class="btn ghost" id="out" type="button">Log out</button></div></header>
    <div class="shell"><aside class="side">${nav}</aside><main id="main"></main></div>`);
  const v=$("view"); $("main").appendChild(v); v.hidden=false; $("load").remove();
  if(settings.announcement&&settings.announcement.show&&settings.announcement.text)
    v.insertAdjacentHTML("afterbegin",`<div class="msg ok">📢 ${esc(settings.announcement.text)}</div>`);
  if(paid&&days<=3&&opt.page!=="pay")
    v.insertAdjacentHTML("afterbegin",`<div class="msg warn">⚠️ Your access ends in <b>${days} day${days===1?"":"s"}</b> (${fmt(exp)}). <a href="pay.html" style="text-decoration:underline;font-weight:600">Renew now</a></div>`);
  $("out").onclick=async()=>{await sb.auth.signOut();location.replace("auth.html");};
  sb.auth.onAuthStateChange(ev=>{if(ev==="SIGNED_OUT")location.replace("auth.html");});
  if(opt.paid){ // re-check payment when the tab is reopened and every 5 minutes
    const recheck=async()=>{const r=await checkPaid(user);if(!r.active&&!adm)location.replace("pay.html?expired");};
    document.addEventListener("visibilitychange",()=>{if(!document.hidden)recheck();});
    setInterval(recheck,300000);
  }
  if(paid&&!adm) setTimeout(()=>location.reload(),Math.min(exp-new Date()+1000,2147483647)); // re-check when plan expires
  return {user,name,exp,active,paid,adm,days,settings};
}
