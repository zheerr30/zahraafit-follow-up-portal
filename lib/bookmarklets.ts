// Bookmark buttons the coach keeps in Chrome's bookmarks bar. Clicked on a
// generator page, they read the plan the generator already holds and save it
// as a small .json file she uploads next to the PDF. They change nothing in
// the generators, so her daily edits to the generators keep working.

function save(name: string): string {
  return `
  function save(out, name){
    var blob=new Blob([JSON.stringify(out)],{type:"application/json"});
    var a=document.createElement("a");a.href=URL.createObjectURL(blob);
    a.download=(name||"${name}").replace(/[\\\\/:*?"<>|]/g,"")+".json";
    document.body.appendChild(a);a.click();setTimeout(function(){URL.revokeObjectURL(a.href);a.remove();},1500);
  }`;
}

const MEAL = `
(function(){
  ${save("بيانات-الجدول-الغذائي")}
  function num(x){x=Number(x);return isFinite(x)?Math.round(x*10)/10:0;}
  function ings(m){return (m.scaledIng||m.ing||[]).map(function(i){var a=(i.sa!==undefined?i.sa:i.a);return {n:String(i.n||""),a:(typeof a==="number"?num(a):a),u:String(i.u||"")};});}
  function subs(m,L){
    var s=(m.subs&&m.subs.length)?m.subs:null;
    if(s){var present=L.filter(function(i){return (i.a>0)||i.u==="حسب الذوق";}).map(function(i){return i.n.toLowerCase();});
      s=s.filter(function(x){var sn=String(x.i||"").toLowerCase();return present.some(function(n){return n===sn||n.indexOf(sn.split(" ")[0])>-1||sn.indexOf(n.split(" ")[0])>-1;});});
      if(!s.length)s=null;}
    if(!s){try{s=L.filter(function(i){return ALT_INGREDIENTS[i.n]&&i.a>0;}).map(function(i){return {i:i.n,o:ALT_INGREDIENTS[i.n].map(function(alt){var t="";try{t=altAmountText(i.n,i.a,i.u,alt);}catch(e){}return (alt+" "+t).trim();})};});}catch(e){s=[];}}
    return (s||[]).map(function(x){return {for:String(x.i||""),options:(x.o||[]).map(String)};});
  }
  function meal(m){var L=ings(m);return {slot:String(m.slotLabel||m.slot||""),name:String(m.name||""),cal:Math.round(m.cal||0),p:num(m.p),c:num(m.c),f:num(m.f),ingredients:L,prep:String(m.prep||""),subs:subs(m,L),note:String(m.splitNote||m.prepnote||"")};}
  function exp(p){
    var M=p.meta||{};var ex=p.extras||{};
    return {format:"zahraafit-meal-plan",v:1,exportedAt:new Date().toISOString(),planId:p.id||"",name:String(M.name||""),phone:String(M.phone||""),
      target:{cal:Math.round(M.cal||0),p:num(M.prot),c:num(M.carb),f:num(M.fat)},
      days:(p.daysData||[]).map(function(d,i){return {n:i+1,meals:(d.meals||[]).map(meal)};}),
      extras:{snacks:(ex.snacks||[]).map(meal),salads:(ex.salads||[]).map(meal)}};
  }
  var list;
  try{list=PLANS;}catch(e){list=null;}
  if(!list||!list.length){try{list=JSON.parse(localStorage.getItem("zfv5_plans")||"[]");}catch(e){list=[];}}
  if(!list.length){alert("ما لقيت جدول. ولّدي الجدول الغذائي أول، بعدين اضغطي الزر.");return;}
  var recent=list.slice(-8).reverse();
  var old=document.getElementById("zf-export");if(old)old.remove();
  var box=document.createElement("div");box.id="zf-export";box.dir="rtl";
  box.style.cssText="position:fixed;inset:0;z-index:2147483647;background:rgba(10,15,20,.5);display:flex;align-items:center;justify-content:center;font-family:system-ui,sans-serif";
  var card=document.createElement("div");card.style.cssText="background:#fff;color:#22303F;border-radius:18px;padding:20px;width:min(420px,92vw);max-height:80vh;overflow:auto";
  card.innerHTML="<b style='font-size:18px'>أي جدول تبين تصدرينه للتطبيق؟</b><p style='color:#5E6873;font-size:13px;margin:6px 0 12px'>اختاري الجدول، وينزل لك ملف ترفعينه للمشتركة مع الـPDF.</p>";
  recent.forEach(function(p){var M=p.meta||{};var b=document.createElement("button");
    b.style.cssText="display:block;width:100%;text-align:right;padding:12px 14px;margin-bottom:8px;border:1.5px solid #D8D3CD;border-radius:12px;background:#fff;cursor:pointer;font-size:15px";
    b.textContent=(M.name||"بدون اسم")+" · "+(M.cal||"")+" سعرة · "+(p.date||"");
    b.onclick=function(){var out=exp(p);if(!out.days.length){alert("الجدول هذا فاضي.");return;}save(out,"بيانات-غذائي-"+(M.name||"جدول"));box.remove();};
    card.appendChild(b);});
  var c=document.createElement("button");c.textContent="إلغاء";c.style.cssText="padding:10px 16px;border:0;background:#EFECE8;border-radius:99px;cursor:pointer";c.onclick=function(){box.remove();};
  card.appendChild(c);box.appendChild(card);box.onclick=function(e){if(e.target===box)box.remove();};document.body.appendChild(box);
})();`;

const WORKOUT = `
(function(){
  ${save("بيانات-الجدول-الرياضي")}
  var st;try{st=S;}catch(e){st=null;}
  if(!st||!st.plan||!st.plan.length){alert("ما لقيت جدول. ولّدي الجدول الرياضي أول (لين تطلع صفحة الجدول)، بعدين اضغطي الزر.");return;}
  var L={};try{L=loadParams()||{};}catch(e){}
  var vl={};try{vl=videoLinks||{};}catch(e){}
  function alt(e){try{var a=altFor(e);return a?{name:String(a.name||""),video:String(vl[a.id]||a.video||"")}:null;}catch(x){return null;}}
  var c=st.client||{};
  var out={format:"zahraafit-workout-plan",v:1,exportedAt:new Date().toISOString(),name:String(c.name||""),env:String(st.env||""),
    days:st.plan.map(function(d,i){return {n:i+1,title:String(d.title||("اليوم "+(i+1))),exercises:(d.exercises||[]).map(function(e){
      return {id:String(e.id||""),name:String(e.name||""),en:String(e.en||""),muscle:String(e.muscle||""),
        sets:Number(e.sets!=null?e.sets:L.sets)||3,reps:String(e.reps!=null?e.reps:(L.reps||"10-12")),rest:String(e.rest!=null?e.rest:(L.rest||"60-90 ث")),
        tip:String(e.tip||""),video:String(vl[e.id]||e.video||""),alt:alt(e)};})};})};
  save(out,"بيانات-رياضي-"+(c.name||"جدول"));
})();`;

const minify = (s: string) => s.replace(/\n\s*/g, "");

export const MEAL_BOOKMARKLET = "javascript:" + encodeURIComponent(minify(MEAL));
export const WORKOUT_BOOKMARKLET = "javascript:" + encodeURIComponent(minify(WORKOUT));
export const MEAL_BOOKMARKLET_SOURCE = minify(MEAL);
export const WORKOUT_BOOKMARKLET_SOURCE = minify(WORKOUT);
