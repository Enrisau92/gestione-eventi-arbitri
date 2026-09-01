const API_URL = "https://script.google.com/macros/s/AKfycbzhaYuZzBYtMrgE5YCYohTH6Zg_TAY-cIgtah39dvAKj5fN-1lAFonX6_nhM7QSXcfw/exec";
let events = [];
let activeEventId = null;
let tempAvailable = new Set();
let tempAvailability = new Map();
let tempAssigned = new Set();
let tempCustomArbiters = [];

const $ = id => document.getElementById(id);

(function addSmallHomeReportStyle(){
  if(document.getElementById("app-extra-style")) return;
  const s=document.createElement("style");
  s.id="app-extra-style";
  s.textContent=".assigned-home{margin-top:8px;font-size:12px;color:#475467}.assigned-home strong{color:#344054}";
  document.head.appendChild(s);
})();
const fullName = a => `${a.nome} ${a.cognome}`;

function uid(){ return Date.now().toString(36)+Math.random().toString(36).slice(2,7); }

function apiGet(params){
  return new Promise((resolve,reject)=>{
    const callback="cb_"+uid();
    const script=document.createElement("script");
    const query=new URLSearchParams({...params,callback});
    const cleanup=()=>{
      delete window[callback];
      script.remove();
    };
    window[callback]=data=>{
      cleanup();
      if(data && data.ok===false) reject(new Error(data.error||"Errore API"));
      else resolve(data);
    };
    script.onerror=()=>{
      cleanup();
      reject(new Error("Impossibile contattare il database condiviso."));
    };
    script.src=API_URL+"?"+query.toString();
    document.body.appendChild(script);
  });
}

async function loadFromServer(){
  try{
    const data=await apiGet({action:"get"});
    events=Array.isArray(data.events)?data.events:[];
    renderEvents();
  }catch(err){
    console.error(err);
    $("eventsList").innerHTML=`<div class="empty"><strong>Errore di collegamento al database</strong><br>${escapeHtml(err.message)}<br><br>Ricarica la pagina e riprova.</div>`;
  }
}

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
function eventDateTime(e, end=false){
  if(!e?.date) return null;
  const t=end ? (e.endTime || e.startTime || "23:59") : (e.startTime || "00:00");
  const d=new Date(`${e.date}T${t}:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}
function isFutureEvent(e){
  const d=eventDateTime(e,true);
  if(d) return d.getTime() >= Date.now();
  return String(e.date||"") >= new Date().toISOString().slice(0,10);
}
function homeArbiterName(id,e){
  const key=String(id);
  const baseList=Array.isArray(window.ARBITRI)?window.ARBITRI:
    (typeof ARBITRI!=="undefined" && Array.isArray(ARBITRI)?ARBITRI:[]);
  const a=baseList.find(x=>String(x.id)===key);
  if(a) return fullName(a);
  const m=(e.manualArbiters||[]).find(x=>String(x.id)===key);
  return m ? String(m.nome||"").trim() : "";
}
function renderEvents(){
  const q=$("eventSearch").value.trim().toLowerCase();
  const filter=$("statusFilter").value;
  const view=$("viewFilter")?.value||"future";
  const sort=$("sortFilter")?.value||"asc";

  let filtered=events.slice().filter(e=>{
    const text=`${e.name} ${e.type} ${e.place}`.toLowerCase();
    const matchesSearch=!q||text.includes(q);
    const matchesStatus=filter==="all"||statusOf(e)===filter;
    const matchesView=view==="all"||(view==="future"&&isFutureEvent(e))||(view==="past"&&!isFutureEvent(e));
    return matchesSearch&&matchesStatus&&matchesView;
  });

  filtered.sort((a,b)=>{
    if(sort==="name") return String(a.name||"").localeCompare(String(b.name||""),"it");
    const da=eventDateTime(a)?.getTime()??Number.MAX_SAFE_INTEGER;
    const db=eventDateTime(b)?.getTime()??Number.MAX_SAFE_INTEGER;
    return sort==="desc"?db-da:da-db;
  });

  if(!filtered.length){
    $("eventsList").innerHTML=`<div class="empty">Nessun evento presente nella vista selezionata.</div>`;
    return;
  }

  $("eventsList").innerHTML=filtered.map(e=>{
    const av=(e.available||[]).length;
    const as=(e.assigned||[]).length;
    const st=statusOf(e);
    const coverage=Math.min(100,(av/Math.max(1,Number(e.required)))*100);
    const assignedNames=[...new Set((e.assigned||[]).map(String))]
      .map(id=>homeArbiterName(id,e)).filter(Boolean);

    return `<article class="event-card">
      <div class="event-main">
        <div class="eyebrow">${escapeHtml(e.type)}</div>
        <h3>${escapeHtml(e.name)}</h3>
        <div class="muted">${formatDate(e.date)}${e.startTime?" · "+e.startTime:""}${e.endTime?"–"+e.endTime:""}${e.place?" · "+escapeHtml(e.place):""}</div>
        ${assignedNames.length?`<div class="assigned-home"><strong>Designati:</strong> ${assignedNames.map(escapeHtml).join(" · ")}</div>`:""}
      </div>
      <div class="event-stats">
        <div class="metric"><strong>${e.required}</strong><span>richiesti</span></div>
        <div class="metric availability-metric ${av>=Number(e.required)?"covered":"not-covered"}"><strong>${av}/${e.required}</strong><span>disponibili</span>
          <div class="coverage-bar"><div class="coverage-fill" style="width:${coverage}%"></div></div></div>
        <div class="metric"><strong>${as}</strong><span>designati</span></div>
      </div>
      <div class="event-actions"><span class="badge ${st}">${statusLabel(st)}</span>
        <div class="action-row"><button class="small-btn" onclick="openDetail('${e.id}')">Gestisci</button><button class="small-btn" onclick="duplicateEvent('${e.id}')">Duplica</button></div>
      </div>
    </article>`;
  }).join("");
}
function escapeHtml(s){ return String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m])); }

window.duplicateEvent=id=>{
  const original=events.find(x=>x.id===id);
  if(!original) return;
  const copy={
    ...original,
    id:uid(),
    name:original.name,
    available:[],
    assigned:[],
    manualArbiters:[],
  };
  events.push(copy);
  renderEvents();
  openEventForm(copy);
};

function openEventForm(e=null){
  $("modalTitle").textContent=e?"Modifica evento":"Nuovo evento";
  $("eventId").value=e?.id||"";
  $("eventDate").value=e?.date||new Date().toISOString().slice(0,10);
  $("eventStartTime").value=e?.startTime||"";
  $("eventEndTime").value=e?.endTime||"";
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
$("eventForm").onsubmit=async e=>{
  e.preventDefault();
  const id=$("eventId").value||uid();
  const existing=events.find(x=>x.id===id);
  const obj={
    id,
    date:$("eventDate").value,
    startTime:$("eventStartTime").value,
    endTime:$("eventEndTime").value,
    type:$("eventType").value,
    required:Number($("eventRequired").value),
    name:$("eventName").value.trim(),
    place:$("eventPlace").value.trim(),
    notes:$("eventNotes").value.trim(),
    available:existing?.available||[],
    assigned:existing?.assigned||[],
    manualArbiters:existing?.manualArbiters||[]
  };

  const saveBtn=$("eventForm").querySelector('button[type="submit"]');
  saveBtn.disabled=true;
  saveBtn.textContent="Salvataggio…";

  try{
    await apiGet({action:"saveEvent",event:JSON.stringify(obj)});
    if(existing) Object.assign(existing,obj); else events.push(obj);
    closeEventForm();
    renderEvents();
  }catch(err){
    alert("Errore nel salvataggio: "+err.message);
  }finally{
    saveBtn.disabled=false;
    saveBtn.textContent="Salva evento";
  }
};

function openDetail(id){
  activeEventId=id;
  const e=events.find(x=>x.id===id);
  tempAvailable=new Set(e.available||[]);
  tempAvailability=new Map(Object.entries(e.availabilityTimes||{}).map(([id,v])=>[String(id),{mode:v?.mode||"full",start:v?.start||e.startTime||"",end:v?.end||e.endTime||""}]));
  [...tempAvailable].forEach(id=>{if(!tempAvailability.has(String(id))) tempAvailability.set(String(id),{mode:"full",start:e.startTime||"",end:e.endTime||""});});
  tempAssigned=new Set(e.assigned||[]);
  tempCustomArbiters=[...(e.manualArbiters||[])];
  $("detailType").textContent=e.type;
  $("detailTitle").textContent=e.name;
  $("detailMeta").textContent=`${formatDate(e.date)}${e.startTime?" · "+e.startTime:""}${e.endTime?"–"+e.endTime:""}${e.place?" · "+e.place:""}`;
  $("arbiterSearch").value="";
  $("assignmentSearch").value="";
  document.querySelectorAll(".tab").forEach(t=>t.classList.remove("active"));
  document.querySelector('.tab[data-tab="availability"]').classList.add("active");
  $("availabilityView").classList.remove("hidden");
  $("assignmentsView").classList.add("hidden");
  renderDetail();
  $("detailModal").classList.remove("hidden");
}
function renderDetail(){
  const e=events.find(x=>x.id===activeEventId);
  $("detailRequired").textContent=e.required;
  $("detailAvailable").textContent=tempAvailable.size;
  $("detailAssigned").textContent=tempAssigned.size;
  const coverage=Math.min(100,(tempAvailable.size/Math.max(1,Number(e.required)))*100);
  $("detailCoverageFill").style.width=coverage+"%";
  const covered=tempAvailable.size>=Number(e.required);
  $("detailCoverageLabel").textContent=covered
    ? "✓ Numero di disponibili sufficiente"
    : `Mancano ${Number(e.required)-tempAvailable.size} disponibilità`;
  $("availabilityTabCount").textContent=tempAvailable.size;
  $("assignmentTabCount").textContent=tempAssigned.size;
  renderArbiters();
  renderAssigned();
}

function availabilityFor(id){return tempAvailability.get(String(id))||{mode:"full",start:"",end:""};}
function availabilityLabel(id){const a=availabilityFor(id);return a.mode==="partial"&&a.start&&a.end?`${a.start}–${a.end}`:"Tutto l'evento";}
function renderArbiters(){
  const q=$("arbiterSearch").value.trim().toLowerCase();
  const matches=currentArbiters().filter(a=>fullName(a).toLowerCase().includes(q)).slice(0,40);
  $("arbiterResults").innerHTML=matches.map(a=>{
    const selected=tempAvailable.has(a.id), av=availabilityFor(a.id);
    return `<div class="arbiter-item ${selected?"selected":""}">
      <div class="arbiter-main"><span class="arbiter-name">${escapeHtml(fullName(a))}${a.custom?' <span class="hint">(inserito manualmente)</span>':''}</span>
      ${selected?`<div class="availability-controls">
        <select class="availability-mode" onchange="setAvailabilityMode('${a.id}',this.value)">
          <option value="full" ${av.mode==="full"?"selected":""}>Tutto l'evento</option>
          <option value="partial" ${av.mode==="partial"?"selected":""}>Solo fascia oraria</option>
        </select>
        ${av.mode==="partial"?`<div class="time-range">
          <input type="time" value="${escapeHtml(av.start)}" onchange="setAvailabilityTime('${a.id}','start',this.value)">
          <span>→</span>
          <input type="time" value="${escapeHtml(av.end)}" onchange="setAvailabilityTime('${a.id}','end',this.value)">
        </div>`:""}</div>`:""}</div>
      <div class="arbiter-actions"><button class="small-btn ${selected?"on":""}" onclick="toggleAvailable('${a.id}')">${selected?"Disponibile":"Aggiungi"}</button></div>
    </div>`;
  }).join("")||`<div class="empty">Nessun arbitro trovato.</div>`;
}
function renderAssigned(){
  const q=$("assignmentSearch").value.trim().toLowerCase();
  const available=currentArbiters().filter(a=>tempAvailable.has(a.id)&&fullName(a).toLowerCase().includes(q));
  $("assignedList").innerHTML=available.length?available.map(a=>{
    const checked=tempAssigned.has(a.id);
    return `<div class="assigned-item"><label class="assigned-check"><input type="checkbox" ${checked?"checked":""} onchange="toggleAssigned('${a.id}')"><span>${escapeHtml(fullName(a))}</span></label>
      <div class="assigned-meta"><span class="availability-pill">${escapeHtml(availabilityLabel(a.id))}</span><span class="badge ${checked?"complete":"partial"}">${checked?"DESIGNATO":"Disponibile"}</span></div></div>`;
  }).join(""):`<div class="empty">${tempAvailable.size?"Nessun arbitro disponibile corrisponde alla ricerca.":"Seleziona prima almeno un arbitro nella scheda Disponibilità."}</div>`;
}

window.toggleAvailable=id=>{
  const key=String(id);
  if(tempAvailable.has(key)){tempAvailable.delete(key);tempAvailability.delete(key);tempAssigned.delete(key);}
  else{const e=events.find(x=>x.id===activeEventId);tempAvailable.add(key);tempAvailability.set(key,{mode:"full",start:e?.startTime||"",end:e?.endTime||""});}
  renderDetail();
};
window.setAvailabilityMode=(id,mode)=>{
  const key=String(id), e=events.find(x=>x.id===activeEventId), c=availabilityFor(key);
  tempAvailability.set(key,{mode,start:mode==="partial"?(c.start||e?.startTime||""):(e?.startTime||c.start||""),end:mode==="partial"?(c.end||e?.endTime||""):(e?.endTime||c.end||"")});
  renderDetail();
};
window.setAvailabilityTime=(id,field,value)=>{
  const key=String(id), c=availabilityFor(key);
  tempAvailability.set(key,{...c,mode:"partial",[field]:value});
  renderDetail();
};
window.toggleAssigned=id=>{
  if(tempAssigned.has(id)) tempAssigned.delete(id); else tempAssigned.add(id);
  renderDetail();
};
$("arbiterSearch").oninput=renderArbiters;
$("assignmentSearch").oninput=renderAssigned;

document.querySelectorAll(".tab").forEach(tab=>{
  tab.onclick=()=>{
    document.querySelectorAll(".tab").forEach(t=>t.classList.remove("active"));
    tab.classList.add("active");
    const view=tab.dataset.tab;
    $("availabilityView").classList.toggle("hidden",view!=="availability");
    $("assignmentsView").classList.toggle("hidden",view!=="assignments");
    if(view==="assignments") renderAssigned();
  };
});
$("clearAvailabilityBtn").onclick=()=>{ tempAvailable.clear(); tempAvailability.clear(); tempAssigned.clear(); renderDetail(); };
$("closeDetailBtn").onclick=()=>$("detailModal").classList.add("hidden");
$("addManualArbiterBtn").onclick=()=>{
  const name=$("manualArbiterName").value.trim().replace(/\s+/g," ");
  if(!name) return;
  const id="manual_"+uid();
  tempCustomArbiters.push({id,nome:name});
  tempAvailable.add(id);
  $("manualArbiterName").value="";
  renderDetail();
};

$("manualArbiterName").addEventListener("keydown",e=>{
  if(e.key==="Enter"){e.preventDefault();$("addManualArbiterBtn").click();}
});

$("saveDetailBtn").onclick=async ()=>{
  const e=events.find(x=>x.id===activeEventId);
  const btn=$("saveDetailBtn");
  btn.disabled=true;
  btn.textContent="Salvataggio…";

  try{
    await apiGet({
      action:"saveParticipants",
      eventId:e.id,
      available:JSON.stringify([...tempAvailable]),
      assigned:JSON.stringify([...tempAssigned]),
      manual:JSON.stringify(tempCustomArbiters),
      availabilityTimes:JSON.stringify(Object.fromEntries(tempAvailability))
    });

    e.available=[...tempAvailable];
    e.assigned=[...tempAssigned];
    e.manualArbiters=[...tempCustomArbiters];
    e.availabilityTimes=Object.fromEntries(tempAvailability);

    $("detailModal").classList.add("hidden");
    renderEvents();
  }catch(err){
    alert("Errore nel salvataggio delle disponibilità: "+err.message);
  }finally{
    btn.disabled=false;
    btn.textContent="Salva disponibilità e designazioni";
  }
};
$("deleteEventBtn").onclick=async ()=>{
  if(!confirm("Eliminare definitivamente questo evento?")) return;

  try{
    await apiGet({action:"deleteEvent",eventId:activeEventId});
    events=events.filter(x=>x.id!==activeEventId);
    $("detailModal").classList.add("hidden");
    renderEvents();
  }catch(err){
    alert("Errore nell'eliminazione: "+err.message);
  }
};
$("eventSearch").oninput=renderEvents;
$("statusFilter").onchange=renderEvents;


/* =========================================================
   REPORT DESIGNAZIONI
========================================================= */

let reportSelectedEvents=new Set();

function getReportAssignedNames(e){
  return [...new Set((e.assigned||[]).map(String))]
    .map(id=>homeArbiterName(id,e))
    .filter(Boolean);
}

function getReportEvents(){
  const q=$("reportEventSearch")?.value.trim().toLowerCase()||"";
  const only=$("reportOnlyAssigned")?.checked!==false;
  return events.slice().filter(e=>{
    if(only && !(e.assigned||[]).length) return false;
    if(!q) return true;
    return `${e.name||""} ${e.type||""} ${e.place||""} ${e.date||""}`.toLowerCase().includes(q);
  }).sort((a,b)=>(eventDateTime(a)?.getTime()??0)-(eventDateTime(b)?.getTime()??0));
}

function renderReportEvents(){
  const box=$("reportEventsList");
  if(!box) return;
  const list=getReportEvents();
  box.innerHTML=list.length?list.map(e=>{
    const id=String(e.id);
    const names=getReportAssignedNames(e);
    return `<label class="report-event-option">
      <input type="checkbox" data-report-event="${escapeHtml(id)}" ${reportSelectedEvents.has(id)?"checked":""}>
      <span><strong>${escapeHtml(e.name||"")}</strong>
      <small>${formatDate(e.date)}${e.startTime?" · "+e.startTime:""}${e.endTime?"–"+e.endTime:""}${e.place?" · "+escapeHtml(e.place):""} · ${names.length} designati</small></span>
    </label>`;
  }).join(""):`<div class="empty">Nessun evento trovato.</div>`;

  box.querySelectorAll("[data-report-event]").forEach(input=>{
    input.onchange=()=>{
      const id=String(input.dataset.reportEvent);
      if(input.checked) reportSelectedEvents.add(id);
      else reportSelectedEvents.delete(id);
      renderReportPreview();
    };
  });
}

function renderReportPreview(){
  const box=$("reportPreview");
  if(!box) return;

  const selected=events.filter(e=>reportSelectedEvents.has(String(e.id)))
    .sort((a,b)=>(eventDateTime(a)?.getTime()??0)-(eventDateTime(b)?.getTime()??0));

  if(!selected.length){
    box.innerHTML=`<div class="report-empty">Seleziona uno o più eventi per visualizzare l'anteprima.</div>`;
    return;
  }

  box.innerHTML=selected.map(e=>{
    const names=getReportAssignedNames(e);
    return `<section class="report-preview-event">
      <div class="eyebrow">${escapeHtml(e.type||"")}</div>
      <h3>${escapeHtml(e.name||"")}</h3>
      <div class="muted">${formatDate(e.date)}${e.startTime?" · "+e.startTime:""}${e.endTime?"–"+e.endTime:""}${e.place?" · "+escapeHtml(e.place):""}</div>
      <div class="report-assigned-title">Arbitri designati</div>
      <div class="report-assigned-names">${names.length?names.map((n,i)=>`<div>${i+1}. ${escapeHtml(n)}</div>`).join(""):"<div>Nessun arbitro designato.</div>"}</div>
    </section>`;
  }).join("");
}

function openReport(){
  reportSelectedEvents=new Set();
  if(!$("reportModal")) return;
  $("reportModal").classList.remove("hidden");
  if($("reportEventSearch")) $("reportEventSearch").value="";
  if($("reportOnlyAssigned")) $("reportOnlyAssigned").checked=true;
  renderReportEvents();
  renderReportPreview();
}
function closeReport(){ $("reportModal")?.classList.add("hidden"); }

function buildPrintHtml(){
  const selected=events.filter(e=>reportSelectedEvents.has(String(e.id)))
    .sort((a,b)=>(eventDateTime(a)?.getTime()??0)-(eventDateTime(b)?.getTime()??0));

  return `<!doctype html><html lang="it"><head><meta charset="utf-8"><title>Designazioni arbitrali</title>
  <style>
    body{font-family:Arial,Helvetica,sans-serif;color:#172033;margin:40px}
    .header{border-bottom:2px solid #172033;padding-bottom:16px;margin-bottom:28px}
    .eyebrow{font-size:11px;text-transform:uppercase;letter-spacing:.08em;font-weight:700;color:#667085}
    h1{margin:5px 0;font-size:26px}h2{margin:5px 0;font-size:20px}
    .meta{font-size:13px;color:#667085}.event{page-break-inside:avoid;border-bottom:1px solid #ddd;padding-bottom:24px;margin-bottom:24px}
    li{margin:7px 0}@media print{body{margin:20mm}}
  </style></head><body>
  <div class="header"><div class="eyebrow">Commissione Arbitri</div><h1>Designazioni arbitrali</h1></div>
  ${selected.map(e=>{
    const names=getReportAssignedNames(e);
    return `<section class="event"><div class="eyebrow">${escapeHtml(e.type||"")}</div>
      <h2>${escapeHtml(e.name||"")}</h2>
      <div class="meta">${formatDate(e.date)}${e.startTime?" · "+e.startTime:""}${e.endTime?"–"+e.endTime:""}${e.place?" · "+escapeHtml(e.place):""}</div>
      <h3>Arbitri designati</h3><ol>${names.length?names.map(n=>`<li>${escapeHtml(n)}</li>`).join(""):"<li>Nessun arbitro designato</li>"}</ol></section>`;
  }).join("")}</body></html>`;
}

function printReport(){
  if(!reportSelectedEvents.size){alert("Seleziona almeno un evento.");return;}
  const w=window.open("","_blank");
  if(!w){alert("Il browser ha bloccato la finestra di stampa. Consenti i popup.");return;}
  w.document.open();w.document.write(buildPrintHtml());w.document.close();
  setTimeout(()=>{w.focus();w.print();},300);
}

function exportReportExcel(){
  if(!reportSelectedEvents.size){alert("Seleziona almeno un evento.");return;}
  const selected=events.filter(e=>reportSelectedEvents.has(String(e.id)))
    .sort((a,b)=>(eventDateTime(a)?.getTime()??0)-(eventDateTime(b)?.getTime()??0));
  const rows=[["Data","Ora inizio","Ora fine","Evento","Tipologia","Luogo","Arbitro designato"]];
  selected.forEach(e=>{
    const names=getReportAssignedNames(e);
    if(!names.length) rows.push([e.date||"",e.startTime||"",e.endTime||"",e.name||"",e.type||"",e.place||"",""]);
    else names.forEach(n=>rows.push([e.date||"",e.startTime||"",e.endTime||"",e.name||"",e.type||"",e.place||"",n]));
  });
  const csv="\uFEFF"+rows.map(r=>r.map(v=>`"${String(v??"").replace(/"/g,'""')}"`).join(";")).join("\r\n");
  const url=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8;"}));
  const a=document.createElement("a");a.href=url;a.download="designazioni_arbitrali.csv";
  document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);
}

function initReportHandlers(){
  $("reportBtn")?.addEventListener("click",openReport);
  $("closeReportBtn")?.addEventListener("click",closeReport);
  $("cancelReportBtn")?.addEventListener("click",closeReport);
  $("printReportBtn")?.addEventListener("click",printReport);
  $("exportReportBtn")?.addEventListener("click",exportReportExcel);
  $("reportEventSearch")?.addEventListener("input",renderReportEvents);
  $("reportOnlyAssigned")?.addEventListener("change",renderReportEvents);
}

initReportHandlers();

loadFromServer();

