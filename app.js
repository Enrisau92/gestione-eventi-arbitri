const API_URL = "https://script.google.com/macros/s/AKfycbzhaYuZzBYtMrgE5YCYohTH6Zg_TAY-cIgtah39dvAKj5fN-1lAFonX6_nhM7QSXcfw/exec";
let events = [];
let activeEventId = null;
let tempAvailable = new Set();
let tempAssigned = new Set();
let tempCustomArbiters = [];

const $ = id => document.getElementById(id);
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

async function migrateLegacyDataIfNeeded(){
  const LEGACY_KEY="gestione_eventi_arbitri_v1";
  const raw=localStorage.getItem(LEGACY_KEY);
  if(!raw) return;

  let legacy;
  try{
    legacy=JSON.parse(raw);
  }catch(err){
    console.warn("Dati locali precedenti non leggibili.",err);
    return;
  }

  if(!Array.isArray(legacy) || legacy.length===0) return;

  // Il database è vuoto: proponiamo una migrazione sicura dei dati
  // presenti nel browser usato finora.
  if(events.length>0){
    alert(
      `Ho trovato ${legacy.length} eventi salvati nella vecchia versione, `+
      `ma il database condiviso contiene già ${events.length} eventi. `+
      `Per evitare duplicati non li importo automaticamente.`
    );
    return;
  }

  const ok=confirm(
    `Ho trovato ${legacy.length} eventi inseriti nella versione precedente.\\n\\n`+
    `Vuoi importarli nel nuovo database condiviso?\\n\\n`+
    `Le disponibilità e le designazioni verranno mantenute.`
  );

  if(!ok) return;

  const originalText=$("eventsList").innerHTML;
  $("eventsList").innerHTML=
    `<div class="empty"><strong>Importazione in corso…</strong><br>`+
    `Sto trasferendo gli eventi nel database condiviso.</div>`;

  try{
    for(const event of legacy){
      const migrated={
        ...event,
        id:event.id || uid(),
        available:Array.isArray(event.available)?event.available:[],
        assigned:Array.isArray(event.assigned)?event.assigned:[],
        manualArbiters:Array.isArray(event.manualArbiters)?event.manualArbiters:[]
      };

      await apiGet({
        action:"saveEvent",
        event:JSON.stringify(migrated)
      });

      const records = [];
      const ids=[...new Set([
        ...migrated.available,
        ...migrated.assigned,
        ...migrated.manualArbiters.map(a=>a.id)
      ])];

      const manualMap={};
      migrated.manualArbiters.forEach(a=>{
        manualMap[String(a.id)]=String(a.nome||"");
      });

      ids.forEach(id=>{
        records.push({
          id:String(id),
          name:manualMap[String(id)]||"",
          available:migrated.available.includes(id),
          assigned:migrated.assigned.includes(id),
          manual:Object.prototype.hasOwnProperty.call(manualMap,String(id))
        });
      });

      await apiGet({
        action:"saveParticipants",
        eventId:migrated.id,
        available:JSON.stringify(migrated.available),
        assigned:JSON.stringify(migrated.assigned),
        manual:JSON.stringify(migrated.manualArbiters)
      });
    }

    localStorage.removeItem(LEGACY_KEY);

    const data=await apiGet({action:"get"});
    events=Array.isArray(data.events)?data.events:[];
    renderEvents();

    alert(`Importazione completata: ${events.length} eventi ora sono nel database condiviso.`);
  }catch(err){
    console.error(err);
    $("eventsList").innerHTML=originalText;
    alert("Importazione non completata: "+err.message);
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
      <div class="event-main"><div class="eyebrow">${e.type}</div><h3>${escapeHtml(e.name)}</h3><div class="muted">${formatDate(e.date)}${e.startTime?" · "+e.startTime:""}${e.endTime?"–"+e.endTime:""}${e.place?" · "+escapeHtml(e.place):""}</div></div>
      <div class="metric"><strong>${e.required}</strong><span>richiesti</span></div>
      <div class="metric availability-metric ${av>=Number(e.required)?"covered":"not-covered"}">
        <strong>${av}/${e.required}</strong><span>disponibilità</span>
        <div class="coverage-bar"><div class="coverage-fill" style="width:${Math.min(100, (av/Math.max(1,Number(e.required)))*100)}%"></div></div>
      </div>
      <div class="metric"><strong>${as}</strong><span>designati</span></div>
      <div><span class="badge ${st}">${statusLabel(st)}</span><br>
      <button class="small-btn" style="margin-top:8px" onclick="openDetail('${e.id}')">Gestisci</button>
      <button class="small-btn" style="margin-top:8px" onclick="duplicateEvent('${e.id}')">Duplica</button>
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

function currentArbiters(){
  const custom=tempCustomArbiters.map(a=>({id:a.id,nome:a.nome,cognome:"",custom:true}));
  return [...ARBITRI,...custom];
}
function renderArbiters(){
  const q=$("arbiterSearch").value.trim().toLowerCase();
  const matches=currentArbiters().filter(a=>fullName(a).toLowerCase().includes(q)).slice(0,40);
  $("arbiterResults").innerHTML=matches.map(a=>{
    const selected=tempAvailable.has(a.id);
    return `<div class="arbiter-item ${selected?"selected":""}">
      <span class="arbiter-name">${escapeHtml(fullName(a))}${a.custom?' <span class="hint">(inserito manualmente)</span>':''}</span>
      <div class="arbiter-actions"><button class="small-btn ${selected?"on":""}" onclick="toggleAvailable('${a.id}')">${selected?"Disponibile":"Aggiungi"}</button></div>
    </div>`;
  }).join("") || `<div class="empty">Nessun arbitro trovato.</div>`;
}

function renderAssigned(){
  const q=$("assignmentSearch").value.trim().toLowerCase();
  const available=currentArbiters().filter(a=>tempAvailable.has(a.id) && fullName(a).toLowerCase().includes(q));
  $("assignedList").innerHTML=available.length ? available.map(a=>{
    const checked=tempAssigned.has(a.id);
    return `<div class="assigned-item"><label><input type="checkbox" ${checked?"checked":""} onchange="toggleAssigned('${a.id}')">${escapeHtml(fullName(a))}</label><span class="badge ${checked?"complete":"partial"}">${checked?"DESIGNATO":"Disponibile"}</span></div>`;
  }).join("") : `<div class="empty">${tempAvailable.size ? "Nessun arbitro disponibile corrisponde alla ricerca." : "Seleziona prima almeno un arbitro nella scheda Disponibilità."}</div>`;
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
$("clearAvailabilityBtn").onclick=()=>{ tempAvailable.clear(); tempAssigned.clear(); renderDetail(); };
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
      manual:JSON.stringify(tempCustomArbiters)
    });

    e.available=[...tempAvailable];
    e.assigned=[...tempAssigned];
    e.manualArbiters=[...tempCustomArbiters];

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

renderEvents();
loadFromServer().then(()=>migrateLegacyDataIfNeeded());

