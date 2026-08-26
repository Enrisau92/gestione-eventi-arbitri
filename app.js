const STORAGE_KEY = "gestione_eventi_arbitri_v1";
let events = loadEvents();
let activeEventId = null;
let tempAvailable = new Set();
let tempAssigned = new Set();

const $ = id => document.getElementById(id);
const fullName = a => `${a.nome} ${a.cognome}`;

function loadEvents(){
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; }
  catch(e){ return []; }
}
function saveEvents(){ localStorage.setItem(STORAGE_KEY, JSON.stringify(events)); }
function uid(){ return Date.now().toString(36)+Math.random().toString(36).slice(2,7); }
function statusOf(e){
  const n = (e.assigned||[]).length, r = Number(e.required)||0;
  if(n===0) return "none";
  if(n>=r) return "complete";
  return "partial";
}
function statusLabel(s){ return s==="complete"?"Completo":s==="partial"?"Da completare":"Nessun designato"; }
function formatDate(d){
  if(!d) return "";
  const [y,m,day]=d.split("-");
  return `${day}/${m}/${y}`;
}
function renderEvents(){
  const q = $("eventSearch").value.trim().toLowerCase();
  const filter = $("statusFilter").value;
  const list = events.slice().sort((a,b)=>(a.date||"").localeCompare(b.date||""));
  const filtered = list.filter(e=>{
    const text = `${e.name} ${e.type} ${e.place}`.toLowerCase();
    const okQ = !q || text.includes(q);
    const okS = filter==="all" || statusOf(e)===filter;
    return okQ && okS;
  });
  const box = $("eventsList");
  if(!filtered.length){ box.innerHTML = `<div class="empty">Nessun evento presente.<br>Premi <strong>+ Nuovo evento</strong> per iniziare.</div>`; return; }
  box.innerHTML = filtered.map(e=>{
    const av=(e.available||[]).length, as=(e.assigned||[]).length, st=statusOf(e);
    return `<article class="event-card">
      <div class="event-main"><div class="eyebrow">${e.type}</div><h3>${escapeHtml(e.name)}</h3><div class="muted">${formatDate(e.date)}${e.time?" · "+e.time:""}${e.place?" · "+escapeHtml(e.place):""}</div></div>
      <div class="metric"><strong>${e.required}</strong><span>richiesti</span></div>
      <div class="metric"><strong>${av}</strong><span>disponibili</span></div>
      <div class="metric"><strong>${as}</strong><span>designati</span></div>
      <div><span class="badge ${st}">${statusLabel(st)}</span><br><button class="small-btn" style="margin-top:8px" onclick="openDetail('${e.id}')">Gestisci</button></div>
    </article>`;
  }).join("");
}
function escapeHtml(s){ return String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m])); }

function openEventForm(e=null){
  $("modalTitle").textContent=e?"Modifica evento":"Nuovo evento";
  $("eventId").value=e?.id||"";
  $("eventDate").value=e?.date||new Date().toISOString().slice(0,10);
  $("eventTime").value=e?.time||"";
  $("eventType").value=e?.type||"Torneo non ufficiale";
  $("eventRequired").value=e?.required||2;
  $("eventName").value=e?.name||"";
  $("eventPlace").value=e?.place||"";
  $("eventNotes").value=e?.notes||"";
  $("modal").classList.remove("hidden");
}
function closeEventForm(){ $("modal").classList.add("hidden"); }

$("newEventBtn").onclick=()=>openEventForm();
$("closeModalBtn").onclick=closeEventForm;
$("cancelBtn").onclick=closeEventForm;
$("eventForm").onsubmit=e=>{
  e.preventDefault();
  const id=$("eventId").value||uid();
  const existing=events.find(x=>x.id===id);
  const obj={id,date:$("eventDate").value,time:$("eventTime").value,type:$("eventType").value,required:Number($("eventRequired").value),name:$("eventName").value.trim(),place:$("eventPlace").value.trim(),notes:$("eventNotes").value.trim(),available:existing?.available||[],assigned:existing?.assigned||[]};
  if(existing) Object.assign(existing,obj); else events.push(obj);
  saveEvents(); closeEventForm(); renderEvents();
};

function openDetail(id){
  activeEventId=id;
  const e=events.find(x=>x.id===id);
  tempAvailable=new Set(e.available||[]);
  tempAssigned=new Set(e.assigned||[]);
  $("detailType").textContent=e.type;
  $("detailTitle").textContent=e.name;
  $("detailMeta").textContent=`${formatDate(e.date)}${e.time?" · "+e.time:""}${e.place?" · "+e.place:""}`;
  $("arbiterSearch").value="";
  renderDetail();
  $("detailModal").classList.remove("hidden");
}
function renderDetail(){
  const e=events.find(x=>x.id===activeEventId);
  $("detailRequired").textContent=e.required;
  $("detailAvailable").textContent=tempAvailable.size;
  $("detailAssigned").textContent=tempAssigned.size;
  renderArbiters();
  renderAssigned();
}
function renderArbiters(){
  const q=$("arbiterSearch").value.trim().toLowerCase();
  const matches=ARBITRI.filter(a=>fullName(a).toLowerCase().includes(q)).slice(0,40);
  $("arbiterResults").innerHTML=matches.map(a=>{
    const selected=tempAvailable.has(a.id);
    return `<div class="arbiter-item ${selected?"selected":""}">
      <span class="arbiter-name">${escapeHtml(fullName(a))}</span>
      <div class="arbiter-actions"><button class="small-btn ${selected?"on":""}" onclick="toggleAvailable('${a.id}')">${selected?"Disponibile":"Aggiungi"}</button></div>
    </div>`;
  }).join("") || `<div class="empty">Nessun arbitro trovato.</div>`;
}
function renderAssigned(){
  const available=ARBITRI.filter(a=>tempAvailable.has(a.id));
  $("assignedList").innerHTML=available.length ? available.map(a=>{
    const checked=tempAssigned.has(a.id);
    return `<div class="assigned-item"><label><input type="checkbox" ${checked?"checked":""} onchange="toggleAssigned('${a.id}')">${escapeHtml(fullName(a))}</label><span class="badge ${checked?"complete":"partial"}">${checked?"DESIGNATO":"Disponibile"}</span></div>`;
  }).join("") : `<div class="empty">Seleziona prima almeno un arbitro disponibile.</div>`;
}
window.toggleAvailable=id=>{
  if(tempAvailable.has(id)){ tempAvailable.delete(id); tempAssigned.delete(id); }
  else tempAvailable.add(id);
  renderDetail();
};
window.toggleAssigned=id=>{
  if(tempAssigned.has(id)) tempAssigned.delete(id); else tempAssigned.add(id);
  renderDetail();
};
$("arbiterSearch").oninput=renderArbiters;
$("clearAvailabilityBtn").onclick=()=>{ tempAvailable.clear(); tempAssigned.clear(); renderDetail(); };
$("closeDetailBtn").onclick=()=>$("detailModal").classList.add("hidden");
$("saveDetailBtn").onclick=()=>{
  const e=events.find(x=>x.id===activeEventId);
  e.available=[...tempAvailable]; e.assigned=[...tempAssigned];
  saveEvents(); $("detailModal").classList.add("hidden"); renderEvents();
};
$("deleteEventBtn").onclick=()=>{
  if(confirm("Eliminare definitivamente questo evento?")){
    events=events.filter(x=>x.id!==activeEventId); saveEvents(); $("detailModal").classList.add("hidden"); renderEvents();
  }
};
$("eventSearch").oninput=renderEvents;
$("statusFilter").onchange=renderEvents;

renderEvents();
