const API_URL = "https://script.google.com/macros/s/AKfycbzhaYuZzBYtMrgE5YCYohTH6Zg_TAY-cIgtah39dvAKj5fN-1lAFonX6_nhM7QSXcfw/exec";

let events = [];
let activeEventId = null;
let tempAvailable = new Set();
let tempAvailability = new Map();
let tempAssigned = new Set();
let tempCustomArbiters = [];

const $ = id => document.getElementById(id);
const fullName = a => `${a?.nome || ""} ${a?.cognome || ""}`.trim();

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function apiGet(params) {
  return new Promise((resolve, reject) => {
    const callback = "cb_" + uid();
    const script = document.createElement("script");
    const query = new URLSearchParams({ ...params, callback });

    const cleanup = () => {
      delete window[callback];
      script.remove();
    };

    window[callback] = data => {
      cleanup();
      if (data && data.ok === false) reject(new Error(data.error || "Errore API"));
      else resolve(data);
    };

    script.onerror = () => {
      cleanup();
      reject(new Error("Impossibile contattare il database condiviso."));
    };

    script.src = API_URL + "?" + query.toString();
    document.body.appendChild(script);
  });
}

async function loadFromServer() {
  try {
    const data = await apiGet({ action: "get" });
    events = Array.isArray(data.events) ? data.events : [];
    renderEvents();
  } catch (err) {
    console.error(err);
    $("eventsList").innerHTML =
      `<div class="empty"><strong>Errore di collegamento al database</strong><br>${escapeHtml(err.message)}<br><br>Ricarica la pagina e riprova.</div>`;
  }
}

function statusOf(e) {
  const n = (e.assigned || []).length;
  const r = Number(e.required) || 0;
  if (n === 0) return "none";
  if (n >= r) return "complete";
  return "partial";
}

function statusLabel(s) {
  return s === "complete" ? "Completo" :
         s === "partial" ? "Da completare" :
         "Nessun designato";
}

function formatDate(d) {
  if (!d) return "";
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
}

function eventDateTime(e, useEnd = false) {
  if (!e?.date) return null;
  const time = useEnd
    ? (e.endTime || e.startTime || "23:59")
    : (e.startTime || "00:00");

  const d = new Date(`${e.date}T${time}:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function isFutureEvent(e) {
  const end = eventDateTime(e, true);
  if (end) return end.getTime() >= Date.now();
  return String(e.date || "") >= new Date().toISOString().slice(0, 10);
}

function getArbiterDisplayName(id, event = null) {
  const key = String(id);

  if (event) {
    const manual = (event.manualArbiters || [])
      .find(a => String(a.id) === key);

    if (manual && manual.nome) {
      return String(manual.nome);
    }
  }

  const list =
    Array.isArray(window.ARBITRI)
      ? window.ARBITRI
      : (
          typeof ARBITRI !== "undefined" &&
          Array.isArray(ARBITRI)
        )
          ? ARBITRI
          : [];

  const arbiter = list.find(a => String(a.id) === key);

  if (arbiter) {
    return fullName(arbiter);
  }

  return key;
}

function getAssignedNames(e) {
  return [...new Set((e.assigned || []).map(String))]
    .map(id => getArbiterDisplayName(id, e))
    .filter(Boolean);
}

function renderEvents() {
  const search = $("eventSearch").value.trim().toLowerCase();
  const statusFilter = $("statusFilter").value;
  const viewFilter = $("viewFilter")?.value || "future";
  const sortFilter = $("sortFilter")?.value || "asc";

  let list = events.slice();

  if (viewFilter === "future") {
    list = list.filter(isFutureEvent);
  } else if (viewFilter === "past") {
    list = list.filter(e => !isFutureEvent(e));
  }

  list = list.filter(e => {
    const text = `${e.name || ""} ${e.type || ""} ${e.place || ""}`.toLowerCase();
    return (!search || text.includes(search)) &&
           (statusFilter === "all" || statusOf(e) === statusFilter);
  });

  list.sort((a, b) => {
    if (sortFilter === "name") {
      return String(a.name || "").localeCompare(String(b.name || ""), "it");
    }

    const da = eventDateTime(a)?.getTime() ?? Number.MAX_SAFE_INTEGER;
    const db = eventDateTime(b)?.getTime() ?? Number.MAX_SAFE_INTEGER;

    return sortFilter === "desc" ? db - da : da - db;
  });

  if (!list.length) {
    $("eventsList").innerHTML =
      `<div class="empty">Nessun evento nella vista selezionata.</div>`;
    return;
  }

  $("eventsList").innerHTML = list.map(e => {
    const available = new Set((e.available || []).map(String)).size;
    const assigned = new Set((e.assigned || []).map(String)).size;
    const required = Number(e.required) || 0;
    const status = statusOf(e);
    const coverage = Math.min(100, (available / Math.max(1, required)) * 100);
    const assignedNames = getAssignedNames(e);

    return `
      <article class="event-card">
        <div class="event-main">
          <div class="eyebrow">${escapeHtml(e.type)}</div>
          <h3>${escapeHtml(e.name)}</h3>
          <div class="muted">
            ${formatDate(e.date)}
            ${e.startTime ? " · " + e.startTime : ""}
            ${e.endTime ? "–" + e.endTime : ""}
            ${e.place ? " · " + escapeHtml(e.place) : ""}
          </div>

          ${
            assignedNames.length
              ? `
                <div style="margin-top:9px;font-size:13px;color:#344054;line-height:1.5">
                  <strong>Designati:</strong>
                  ${assignedNames.map(escapeHtml).join(" · ")}
                </div>
              `
              : ""
          }
        </div>

        <div class="event-stats">
          <div class="metric">
            <strong>${required}</strong>
            <span>richiesti</span>
          </div>

          <div class="metric availability-metric ${available >= required ? "covered" : "not-covered"}">
            <strong>${available}/${required}</strong>
            <span>disponibili</span>
            <div class="coverage-bar">
              <div class="coverage-fill" style="width:${coverage}%"></div>
            </div>
          </div>

          <div class="metric">
            <strong>${assigned}</strong>
            <span>designati</span>
          </div>
        </div>

        <div class="event-actions">
          <span class="badge ${status}">${statusLabel(status)}</span>
          <div class="action-row">
            <button class="small-btn" onclick="openDetail('${escapeHtml(e.id)}')">Gestisci</button>
            <button class="small-btn" onclick="duplicateEvent('${escapeHtml(e.id)}')">Duplica</button>
          </div>
        </div>
      </article>`;
  }).join("");
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, m => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  }[m]));
}

/* =========================================================
   EVENTI
========================================================= */

window.duplicateEvent = id => {
  const original = events.find(x => x.id === id);
  if (!original) return;

  const copy = {
    ...original,
    id: uid(),
    available: [],
    assigned: [],
    manualArbiters: [],
    availabilityTimes: {}
  };

  events.push(copy);
  openEventForm(copy);
};

function openEventForm(e = null) {
  $("modalTitle").textContent = e ? "Modifica evento" : "Nuovo evento";
  $("eventId").value = e?.id || "";
  $("eventDate").value = e?.date || new Date().toISOString().slice(0, 10);
  $("eventStartTime").value = e?.startTime || "";
  $("eventEndTime").value = e?.endTime || "";
  $("eventType").value = e?.type || "Torneo non ufficiale";
  $("eventRequired").value = e?.required || 2;
  $("eventName").value = e?.name || "";
  $("eventPlace").value = e?.place || "";
  $("eventNotes").value = e?.notes || "";
  $("modal").classList.remove("hidden");
}

function closeEventForm() {
  $("modal").classList.add("hidden");
}

$("newEventBtn").onclick = () => openEventForm();
$("closeModalBtn").onclick = closeEventForm;
$("cancelBtn").onclick = closeEventForm;

$("eventForm").onsubmit = async e => {
  e.preventDefault();

  const id = $("eventId").value || uid();
  const existing = events.find(x => x.id === id);

  const obj = {
    id,
    date: $("eventDate").value,
    startTime: $("eventStartTime").value,
    endTime: $("eventEndTime").value,
    type: $("eventType").value,
    required: Number($("eventRequired").value),
    name: $("eventName").value.trim(),
    place: $("eventPlace").value.trim(),
    notes: $("eventNotes").value.trim(),
    available: existing?.available || [],
    assigned: existing?.assigned || [],
    manualArbiters: existing?.manualArbiters || [],
    availabilityTimes: existing?.availabilityTimes || {}
  };

  const saveBtn = $("eventForm").querySelector('button[type="submit"]');
  saveBtn.disabled = true;
  saveBtn.textContent = "Salvataggio…";

  try {
    await apiGet({
      action: "saveEvent",
      event: JSON.stringify(obj)
    });

    if (existing) {
      Object.assign(existing, obj);
    } else {
      events.push(obj);
    }

    closeEventForm();
    renderEvents();
  } catch (err) {
    alert("Errore nel salvataggio: " + err.message);
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = "Salva evento";
  }
};

/* =========================================================
   GESTIONE EVENTO
   Questa parte mantiene la logica già funzionante.
========================================================= */

function openDetail(id) {
  activeEventId = id;

  const e = events.find(x => x.id === id);
  if (!e) return;

  tempAvailable = new Set((e.available || []).map(String));

  tempAvailability = new Map(
    Object.entries(e.availabilityTimes || {}).map(([arbiterId, value]) => [
      String(arbiterId),
      {
        mode: value?.mode || "full",
        start: value?.start || e.startTime || "",
        end: value?.end || e.endTime || ""
      }
    ])
  );

  [...tempAvailable].forEach(arbiterId => {
    if (!tempAvailability.has(String(arbiterId))) {
      tempAvailability.set(String(arbiterId), {
        mode: "full",
        start: e.startTime || "",
        end: e.endTime || ""
      });
    }
  });

  tempAssigned = new Set((e.assigned || []).map(String));
  tempCustomArbiters = [...(e.manualArbiters || [])];

  $("detailType").textContent = e.type;
  $("detailTitle").textContent = e.name;

  $("detailMeta").textContent =
    `${formatDate(e.date)}` +
    `${e.startTime ? " · " + e.startTime : ""}` +
    `${e.endTime ? "–" + e.endTime : ""}` +
    `${e.place ? " · " + e.place : ""}`;

  $("arbiterSearch").value = "";
  $("assignmentSearch").value = "";

  document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
  document.querySelector('.tab[data-tab="availability"]').classList.add("active");

  $("availabilityView").classList.remove("hidden");
  $("assignmentsView").classList.add("hidden");

  renderDetail();
  $("detailModal").classList.remove("hidden");
}

function renderDetail() {
  const e = events.find(x => x.id === activeEventId);
  if (!e) return;

  $("detailRequired").textContent = e.required;
  $("detailAvailable").textContent = tempAvailable.size;
  $("detailAssigned").textContent = tempAssigned.size;

  const coverage = Math.min(
    100,
    (tempAvailable.size / Math.max(1, Number(e.required))) * 100
  );

  $("detailCoverageFill").style.width = coverage + "%";

  const covered = tempAvailable.size >= Number(e.required);

  $("detailCoverageLabel").textContent = covered
    ? "✓ Numero di disponibili sufficiente"
    : `Mancano ${Number(e.required) - tempAvailable.size} disponibilità`;

  $("availabilityTabCount").textContent = tempAvailable.size;
  $("assignmentTabCount").textContent = tempAssigned.size;

  renderArbiters();
  renderAssigned();
}

function currentArbiters() {
  const base =
    Array.isArray(window.ARBITRI)
      ? window.ARBITRI
      : (typeof ARBITRI !== "undefined" && Array.isArray(ARBITRI) ? ARBITRI : []);

  const custom = tempCustomArbiters.map(a => ({
    id: a.id,
    nome: a.nome,
    cognome: "",
    custom: true
  }));

  return [...base, ...custom];
}

function availabilityFor(id) {
  return tempAvailability.get(String(id)) || {
    mode: "full",
    start: "",
    end: ""
  };
}

function availabilityLabel(id) {
  const a = availabilityFor(id);

  return a.mode === "partial" && a.start && a.end
    ? `${a.start}–${a.end}`
    : "Tutto l'evento";
}

function renderArbiters() {
  const q = $("arbiterSearch").value.trim().toLowerCase();

  const matches = currentArbiters()
    .filter(a => fullName(a).toLowerCase().includes(q))
    .slice(0, 40);

  $("arbiterResults").innerHTML = matches.map(a => {
    const selected = tempAvailable.has(String(a.id));
    const av = availabilityFor(a.id);

    return `
      <div class="arbiter-item ${selected ? "selected" : ""}">
        <div class="arbiter-main">
          <span class="arbiter-name">
            ${escapeHtml(fullName(a))}
            ${a.custom ? '<span class="hint">(inserito manualmente)</span>' : ""}
          </span>

          ${selected ? `
            <div class="availability-controls">
              <select class="availability-mode"
                onchange="setAvailabilityMode('${escapeHtml(a.id)}',this.value)">
                <option value="full" ${av.mode === "full" ? "selected" : ""}>
                  Tutto l'evento
                </option>
                <option value="partial" ${av.mode === "partial" ? "selected" : ""}>
                  Solo fascia oraria
                </option>
              </select>

              ${av.mode === "partial" ? `
                <div class="time-range">
                  <input type="time"
                    value="${escapeHtml(av.start)}"
                    onchange="setAvailabilityTime('${escapeHtml(a.id)}','start',this.value)">
                  <span>→</span>
                  <input type="time"
                    value="${escapeHtml(av.end)}"
                    onchange="setAvailabilityTime('${escapeHtml(a.id)}','end',this.value)">
                </div>
              ` : ""}
            </div>
          ` : ""}
        </div>

        <div class="arbiter-actions">
          <button class="small-btn ${selected ? "on" : ""}"
            onclick="toggleAvailable('${escapeHtml(a.id)}')">
            ${selected ? "Disponibile" : "Aggiungi"}
          </button>
        </div>
      </div>`;
  }).join("") || `<div class="empty">Nessun arbitro trovato.</div>`;
}

function renderAssigned() {
  const q = $("assignmentSearch").value.trim().toLowerCase();

  const available = currentArbiters().filter(
    a => tempAvailable.has(String(a.id)) &&
         fullName(a).toLowerCase().includes(q)
  );

  $("assignedList").innerHTML = available.length
    ? available.map(a => {
        const id = String(a.id);
        const checked = tempAssigned.has(id);

        return `
          <div class="assigned-item">
            <label class="assigned-check">
              <input type="checkbox"
                ${checked ? "checked" : ""}
                onchange="toggleAssigned('${escapeHtml(id)}')">
              <span>${escapeHtml(fullName(a))}</span>
            </label>

            <div class="assigned-meta">
              <span class="availability-pill">
                ${escapeHtml(availabilityLabel(id))}
              </span>
              <span class="badge ${checked ? "complete" : "partial"}">
                ${checked ? "DESIGNATO" : "Disponibile"}
              </span>
            </div>
          </div>`;
      }).join("")
    : `<div class="empty">
         ${tempAvailable.size
           ? "Nessun arbitro disponibile corrisponde alla ricerca."
           : "Seleziona prima almeno un arbitro nella scheda Disponibilità."}
       </div>`;
}

window.toggleAvailable = id => {
  const key = String(id);

  if (tempAvailable.has(key)) {
    tempAvailable.delete(key);
    tempAvailability.delete(key);
    tempAssigned.delete(key);
  } else {
    const e = events.find(x => x.id === activeEventId);

    tempAvailable.add(key);
    tempAvailability.set(key, {
      mode: "full",
      start: e?.startTime || "",
      end: e?.endTime || ""
    });
  }

  renderDetail();
};

window.setAvailabilityMode = (id, mode) => {
  const key = String(id);
  const e = events.find(x => x.id === activeEventId);
  const current = availabilityFor(key);

  tempAvailability.set(key, {
    mode,
    start: mode === "partial"
      ? (current.start || e?.startTime || "")
      : (e?.startTime || current.start || ""),
    end: mode === "partial"
      ? (current.end || e?.endTime || "")
      : (e?.endTime || current.end || "")
  });

  renderDetail();
};

window.setAvailabilityTime = (id, field, value) => {
  const key = String(id);
  const current = availabilityFor(key);

  tempAvailability.set(key, {
    ...current,
    mode: "partial",
    [field]: value
  });

  renderDetail();
};

window.toggleAssigned = id => {
  const key = String(id);

  if (tempAssigned.has(key)) {
    tempAssigned.delete(key);
  } else {
    tempAssigned.add(key);
  }

  renderDetail();
};

$("arbiterSearch").oninput = renderArbiters;
$("assignmentSearch").oninput = renderAssigned;

document.querySelectorAll(".tab").forEach(tab => {
  tab.onclick = () => {
    document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
    tab.classList.add("active");

    const view = tab.dataset.tab;

    $("availabilityView").classList.toggle(
      "hidden",
      view !== "availability"
    );

    $("assignmentsView").classList.toggle(
      "hidden",
      view !== "assignments"
    );

    if (view === "assignments") {
      renderAssigned();
    }
  };
});

$("clearAvailabilityBtn").onclick = () => {
  tempAvailable.clear();
  tempAvailability.clear();
  tempAssigned.clear();
  renderDetail();
};

$("closeDetailBtn").onclick = () => {
  $("detailModal").classList.add("hidden");
};

$("addManualArbiterBtn").onclick = () => {
  const name = $("manualArbiterName")
    .value
    .trim()
    .replace(/\s+/g, " ");

  if (!name) return;

  const id = "manual_" + uid();

  tempCustomArbiters.push({
    id,
    nome: name
  });

  tempAvailable.add(id);

  const e = events.find(x => x.id === activeEventId);

  tempAvailability.set(id, {
    mode: "full",
    start: e?.startTime || "",
    end: e?.endTime || ""
  });

  $("manualArbiterName").value = "";

  renderDetail();
};

$("manualArbiterName").addEventListener("keydown", e => {
  if (e.key === "Enter") {
    e.preventDefault();
    $("addManualArbiterBtn").click();
  }
});

$("saveDetailBtn").onclick = async () => {
  const e = events.find(x => x.id === activeEventId);
  if (!e) return;

  const btn = $("saveDetailBtn");

  btn.disabled = true;
  btn.textContent = "Salvataggio…";

  try {
    const availabilityTimes =
      Object.fromEntries(tempAvailability);

    await apiGet({
      action: "saveParticipants",
      eventId: e.id,
      available: JSON.stringify([...tempAvailable]),
      assigned: JSON.stringify([...tempAssigned]),
      manual: JSON.stringify(tempCustomArbiters),
      availabilityTimes: JSON.stringify(availabilityTimes)
    });

    e.available = [...tempAvailable];
    e.assigned = [...tempAssigned];
    e.manualArbiters = [...tempCustomArbiters];
    e.availabilityTimes = availabilityTimes;

    $("detailModal").classList.add("hidden");
    renderEvents();
  } catch (err) {
    alert("Errore nel salvataggio delle disponibilità: " + err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = "Salva disponibilità e designazioni";
  }
};

$("deleteEventBtn").onclick = async () => {
  if (!confirm("Eliminare definitivamente questo evento?")) return;

  try {
    await apiGet({
      action: "deleteEvent",
      eventId: activeEventId
    });

    events = events.filter(x => x.id !== activeEventId);

    $("detailModal").classList.add("hidden");
    renderEvents();
  } catch (err) {
    alert("Errore nell'eliminazione: " + err.message);
  }
};

/* =========================================================
   DISPONIBILITÀ ARBITRO - VISTA TRASVERSALE
========================================================= */

let wideActiveArbiterId = null;

function getAllArbitersForWideView() {
  const base =
    Array.isArray(window.ARBITRI)
      ? window.ARBITRI
      : (typeof ARBITRI !== "undefined" && Array.isArray(ARBITRI) ? ARBITRI : []);

  const map = new Map();

  base.forEach(a => {
    map.set(String(a.id), {
      ...a,
      id: String(a.id)
    });
  });

  events.forEach(e => {
    (e.manualArbiters || []).forEach(a => {
      const id = String(a.id);

      if (!map.has(id)) {
        map.set(id, {
          id,
          nome: String(a.nome || ""),
          cognome: "",
          custom: true
        });
      }
    });
  });

  return [...map.values()];
}

function wideAvailabilityFor(e, id) {
  const saved = (e.availabilityTimes || {})[String(id)];

  if (saved) {
    return {
      mode: saved.mode === "partial" ? "partial" : "full",
      start: saved.start || e.startTime || "",
      end: saved.end || e.endTime || ""
    };
  }

  return {
    mode: "full",
    start: e.startTime || "",
    end: e.endTime || ""
  };
}

function openWideAvailability() {
  wideActiveArbiterId = null;

  $("wideArbiterSearch").value = "";
  $("wideEventScope").value = "future";

  $("arbiterAvailabilityModal").classList.remove("hidden");
  $("wideSelectedArbiter").classList.add("hidden");
  $("wideEventsList").innerHTML = "";

  renderWideArbiters();
  $("wideArbiterSearch").focus();
}

function closeWideAvailability() {
  $("arbiterAvailabilityModal").classList.add("hidden");
}

function renderWideArbiters() {
  const q = $("wideArbiterSearch").value.trim().toLowerCase();

  const list = getAllArbitersForWideView()
    .filter(a => fullName(a).toLowerCase().includes(q))
    .sort((a, b) => fullName(a).localeCompare(fullName(b), "it"))
    .slice(0, 60);

  $("wideArbiterResults").innerHTML = list.length
    ? list.map(a => `
        <button type="button"
          class="wide-arbiter-result ${String(a.id) === String(wideActiveArbiterId) ? "active" : ""}"
          onclick="selectWideArbiter('${escapeHtml(String(a.id))}')">
          ${escapeHtml(fullName(a))}
        </button>
      `).join("")
    : `<div class="empty small-empty">
         ${q ? "Nessun arbitro trovato." : "Inizia a digitare nome o cognome."}
       </div>`;
}

window.selectWideArbiter = id => {
  wideActiveArbiterId = String(id);

  const arbiter = getAllArbitersForWideView()
    .find(a => String(a.id) === String(id));

  $("wideSelectedArbiter").classList.remove("hidden");

  $("wideSelectedArbiter").innerHTML = `
    <strong>${escapeHtml(fullName(arbiter))}</strong>
    <span>Modifica le disponibilità degli eventi qui sotto.</span>
  `;

  renderWideArbiters();
  renderWideEvents();
};

function renderWideEvents() {
  if (wideActiveArbiterId === null) {
    $("wideEventsList").innerHTML = "";
    return;
  }

  const scope = $("wideEventScope").value;

  const list = events
    .filter(e => scope === "all" || isFutureEvent(e))
    .slice()
    .sort((a, b) => {
      const da = eventDateTime(a)?.getTime() ?? Number.MAX_SAFE_INTEGER;
      const db = eventDateTime(b)?.getTime() ?? Number.MAX_SAFE_INTEGER;
      return da - db;
    });

  $("wideEventsList").innerHTML = list.map(e => {
    const id = String(e.id);

    const available = (e.available || [])
      .map(String)
      .includes(String(wideActiveArbiterId));

    const saved = wideAvailabilityFor(e, wideActiveArbiterId);

    return `
      <div class="wide-event-row"
        data-wide-event-id="${escapeHtml(id)}">

        <div class="wide-event-info">
          <strong>${escapeHtml(e.name)}</strong>
          <span>
            ${formatDate(e.date)}
            ${e.startTime ? " · " + e.startTime : ""}
            ${e.endTime ? "–" + e.endTime : ""}
            ${e.place ? " · " + escapeHtml(e.place) : ""}
          </span>
        </div>

        <div class="wide-event-controls">
          <label class="wide-check">
            <input type="checkbox"
              class="wide-available"
              ${available ? "checked" : ""}>
            <span>Disponibile</span>
          </label>

          <select class="wide-mode" ${available ? "" : "disabled"}>
            <option value="full" ${saved.mode === "full" ? "selected" : ""}>
              Tutto l'evento
            </option>
            <option value="partial" ${saved.mode === "partial" ? "selected" : ""}>
              Solo fascia
            </option>
          </select>

          <div class="wide-times ${
            available && saved.mode === "partial" ? "" : "hidden"
          }">
            <input class="wide-start"
              type="time"
              value="${escapeHtml(saved.start)}">
            <span>→</span>
            <input class="wide-end"
              type="time"
              value="${escapeHtml(saved.end)}">
          </div>
        </div>
      </div>`;
  }).join("") ||
  `<div class="empty">Nessun evento nella vista selezionata.</div>`;

  document.querySelectorAll(".wide-event-row").forEach(row => {
    const checkbox = row.querySelector(".wide-available");
    const mode = row.querySelector(".wide-mode");
    const times = row.querySelector(".wide-times");

    const sync = () => {
      mode.disabled = !checkbox.checked;

      times.classList.toggle(
        "hidden",
        !(checkbox.checked && mode.value === "partial")
      );
    };

    checkbox.onchange = sync;
    mode.onchange = sync;
  });
}

async function saveWideAvailability() {
  if (wideActiveArbiterId === null) return;

  const btn = $("saveWideAvailabilityBtn");

  btn.disabled = true;
  btn.textContent = "Salvataggio…";

  try {
    const rows = [
      ...document.querySelectorAll(".wide-event-row")
    ];

    for (const row of rows) {
      const eventId = row.dataset.wideEventId;
      const e = events.find(x => String(x.id) === String(eventId));

      if (!e) continue;

      const checkbox = row.querySelector(".wide-available");
      const mode = row.querySelector(".wide-mode");
      const start = row.querySelector(".wide-start");
      const end = row.querySelector(".wide-end");

      const available = new Set(
        (e.available || []).map(String)
      );

      const assigned = new Set(
        (e.assigned || []).map(String)
      );

      const times = {
        ...(e.availabilityTimes || {})
      };

      const id = String(wideActiveArbiterId);

      if (checkbox.checked) {
        available.add(id);

        times[id] = {
          mode: mode.value === "partial" ? "partial" : "full",
          start: mode.value === "partial"
            ? (start?.value || e.startTime || "")
            : (e.startTime || ""),
          end: mode.value === "partial"
            ? (end?.value || e.endTime || "")
            : (e.endTime || "")
        };
      } else {
        available.delete(id);
        delete times[id];
        assigned.delete(id);
      }

      await apiGet({
        action: "saveParticipants",
        eventId: e.id,
        available: JSON.stringify([...available]),
        assigned: JSON.stringify([...assigned]),
        manual: JSON.stringify(e.manualArbiters || []),
        availabilityTimes: JSON.stringify(times)
      });

      e.available = [...available];
      e.assigned = [...assigned];
      e.availabilityTimes = times;
    }

    closeWideAvailability();
    renderEvents();
  } catch (err) {
    console.error(err);
    alert("Errore nel salvataggio delle disponibilità: " + err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = "Salva disponibilità";
  }
}

/* =========================================================
   REPORT DESIGNAZIONI
   Tutto il report viene creato qui, senza modificare index.html.
========================================================= */

let reportSelectedIds = new Set();

function ensureReportUI() {
  if ($("reportDesignazioniBtn")) return;

  const topbar = document.querySelector(".topbar");
  const newEventBtn = $("newEventBtn");

  if (topbar && newEventBtn) {
    const wrap = document.createElement("div");
    wrap.style.cssText =
      "display:flex;gap:8px;align-items:center;flex-wrap:wrap;";

    newEventBtn.parentNode.insertBefore(wrap, newEventBtn);
    wrap.appendChild(newEventBtn);

    const reportBtn = document.createElement("button");
    reportBtn.id = "reportDesignazioniBtn";
    reportBtn.className = "ghost";
    reportBtn.type = "button";
    reportBtn.textContent = "📄 Report designazioni";
    reportBtn.onclick = openReportModal;

    wrap.appendChild(reportBtn);
  }

  const modal = document.createElement("div");
  modal.id = "reportModal";
  modal.className = "modal hidden";

  modal.innerHTML = `
    <div class="modal-card large">

      <div class="modal-head">
        <div>
          <div class="eyebrow">Commissione Arbitri</div>
          <h2>Report designazioni</h2>
          <div class="muted">
            Seleziona uno o più eventi da comunicare alla società.
          </div>
        </div>

        <button
          class="icon"
          id="closeReportModalBtn"
          aria-label="Chiudi">
          ×
        </button>
      </div>

      <div style="
        display:flex;
        gap:10px;
        flex-wrap:wrap;
        margin-bottom:12px;
      ">

        <input
          id="reportSearch"
          type="search"
          placeholder="🔍 Cerca evento, luogo o tipologia…"
          style="
            flex:1;
            min-width:220px;
            background:#fff;
            border:1px solid #d8dde7;
            border-radius:10px;
            padding:11px 12px;
            font-size:14px;
          ">

        <select
          id="reportScope"
          style="
            background:#fff;
            border:1px solid #d8dde7;
            border-radius:10px;
            padding:11px 12px;
            font-size:14px;
          ">
          <option value="future">Solo eventi futuri</option>
          <option value="all">Tutti gli eventi</option>
        </select>

        <label style="
          display:flex;
          align-items:center;
          gap:7px;
          margin:0;
          padding:0 4px;
          font-weight:600;
          font-size:13px;
        ">
          <input id="reportOnlyAssigned" type="checkbox" checked>
          Solo eventi con designazioni
        </label>

      </div>

      <div style="
        display:flex;
        justify-content:space-between;
        align-items:center;
        gap:10px;
        margin:10px 0;
        flex-wrap:wrap;
      ">

        <strong id="reportSelectionLabel">
          0 eventi selezionati
        </strong>

        <div style="display:flex;gap:7px;">
          <button
            type="button"
            class="ghost"
            id="reportSelectAllBtn">
            Seleziona tutti
          </button>

          <button
            type="button"
            class="ghost"
            id="reportClearBtn">
            Azzera
          </button>
        </div>

      </div>

      <div
        id="reportEventsList"
        style="
          display:grid;
          gap:7px;
          max-height:45vh;
          overflow:auto;
          border:1px solid #e4e7ec;
          border-radius:12px;
          padding:8px;
        ">
      </div>

      <div
        id="reportPreview"
        style="
          margin-top:16px;
          display:none;
          border-top:1px solid #e4e7ec;
          padding-top:16px;
        ">
      </div>

      <div class="form-actions">

        <button
          type="button"
          class="ghost"
          id="reportPreviewBtn">
          Anteprima
        </button>

        <button
          type="button"
          class="ghost"
          id="reportExcelBtn">
          Esporta Excel
        </button>

        <button
          type="button"
          class="primary"
          id="reportPdfBtn">
          Stampa / PDF
        </button>

      </div>

    </div>
  `;

  document.body.appendChild(modal);

  $("closeReportModalBtn").onclick =
    closeReportModal;

  $("reportSearch").oninput =
    renderReportEvents;

  $("reportScope").onchange =
    renderReportEvents;

  $("reportOnlyAssigned").onchange =
    renderReportEvents;

  $("reportSelectAllBtn").onclick =
    selectAllReportEvents;

  $("reportClearBtn").onclick =
    () => {
      reportSelectedIds.clear();
      renderReportEvents();
      renderReportPreview();
    };

  $("reportPreviewBtn").onclick =
    renderReportPreview;

  $("reportPdfBtn").onclick =
    printReportPdf;

  $("reportExcelBtn").onclick =
    exportReportExcel;
}

function getReportEvents() {

  const search =
    $("reportSearch")
      .value
      .trim()
      .toLowerCase();

  const scope =
    $("reportScope").value;

  const onlyAssigned =
    $("reportOnlyAssigned").checked;

  return events
    .filter(e => {

      if (
        scope === "future" &&
        !isFutureEvent(e)
      ) {
        return false;
      }

      if (
        onlyAssigned &&
        !(e.assigned || []).length
      ) {
        return false;
      }

      const text =
        `${e.name || ""} ${e.type || ""} ${e.place || ""}`
          .toLowerCase();

      return !search ||
        text.includes(search);
    })
    .slice()
    .sort(
      (a, b) => {

        const da =
          eventDateTime(a)
            ?.getTime()
          ?? Number.MAX_SAFE_INTEGER;

        const db =
          eventDateTime(b)
            ?.getTime()
          ?? Number.MAX_SAFE_INTEGER;

        return da - db;
      }
    );
}

function openReportModal() {

  ensureReportUI();

  reportSelectedIds =
    new Set(
      [...reportSelectedIds]
        .filter(id =>
          events.some(
            e =>
              String(e.id) ===
              String(id)
          )
        )
    );

  $("reportModal")
    .classList.remove(
      "hidden"
    );

  renderReportEvents();
  renderReportPreview();
}

function closeReportModal() {

  $("reportModal")
    .classList.add(
      "hidden"
    );
}

function renderReportEvents() {

  const list =
    getReportEvents();

  const selected =
    [...reportSelectedIds];

  $("reportSelectionLabel")
    .textContent =
    `${selected.length} ${
      selected.length === 1
        ? "evento selezionato"
        : "eventi selezionati"
    }`;

  if (!list.length) {

    $("reportEventsList")
      .innerHTML = `
        <div class="empty">
          Nessun evento corrisponde ai filtri.
        </div>
      `;

    return;
  }

  $("reportEventsList")
    .innerHTML =
    list.map(e => {

      const id =
        String(e.id);

      const checked =
        reportSelectedIds.has(id);

      const names =
        getAssignedNames(e);

      return `
        <label
          style="
            display:flex;
            align-items:flex-start;
            gap:10px;
            margin:0;
            padding:10px;
            border:1px solid ${
              checked
                ? "#8b85ef"
                : "#e4e7ec"
            };
            border-radius:10px;
            background:${
              checked
                ? "#f7f6ff"
                : "#fff"
            };
            cursor:pointer;
          ">

          <input
            type="checkbox"
            class="report-event-check"
            data-event-id="${escapeHtml(id)}"
            ${
              checked
                ? "checked"
                : ""
            }
            style="margin-top:3px;">

          <span style="flex:1;min-width:0;">

            <strong>
              ${escapeHtml(e.name)}
            </strong>

            <span
              style="
                display:block;
                color:#667085;
                font-size:12px;
                margin-top:3px;
              ">

              ${formatDate(e.date)}
              ${
                e.startTime
                  ? " · " + e.startTime
                  : ""
              }
              ${
                e.endTime
                  ? "–" + e.endTime
                  : ""
              }
              ${
                e.place
                  ? " · " +
                    escapeHtml(e.place)
                  : ""
              }

            </span>

            ${
              names.length
                ? `
                  <span
                    style="
                      display:block;
                      color:#344054;
                      font-size:12px;
                      margin-top:4px;
                    ">
                    <strong>Designati:</strong>
                    ${
                      names
                        .map(escapeHtml)
                        .join(" · ")
                    }
                  </span>
                `
                : ""
            }

          </span>

        </label>
      `;

    }).join("");

  document
    .querySelectorAll(
      ".report-event-check"
    )
    .forEach(input => {

      input.onchange = () => {

        const id =
          String(
            input.dataset.eventId
          );

        if (
          input.checked
        ) {
          reportSelectedIds.add(id);
        } else {
          reportSelectedIds.delete(id);
        }

        renderReportEvents();
        renderReportPreview();
      };
    });
}

function selectAllReportEvents() {

  getReportEvents()
    .forEach(
      e =>
        reportSelectedIds.add(
          String(e.id)
        )
    );

  renderReportEvents();
  renderReportPreview();
}

function getSelectedReportEvents() {

  const selected =
    new Set(
      [...reportSelectedIds]
        .map(String)
    );

  return events
    .filter(
      e =>
        selected.has(
          String(e.id)
        )
    )
    .slice()
    .sort(
      (a, b) => {

        const da =
          eventDateTime(a)
            ?.getTime()
          ?? Number.MAX_SAFE_INTEGER;

        const db =
          eventDateTime(b)
            ?.getTime()
          ?? Number.MAX_SAFE_INTEGER;

        return da - db;
      }
    );
}

function reportDocumentHtml(selectedEvents) {

  const rows =
    selectedEvents.map(e => {

      const names =
        getAssignedNames(e);

      return `
        <section
          style="
            margin-bottom:28px;
            page-break-inside:avoid;
          ">

          <h2
            style="
              margin:0 0 5px;
              font-size:18px;
            ">
            ${escapeHtml(e.name)}
          </h2>

          <div
            style="
              color:#555;
              font-size:13px;
              margin-bottom:10px;
            ">

            ${formatDate(e.date)}
            ${
              e.startTime
                ? " · " + e.startTime
                : ""
            }
            ${
              e.endTime
                ? "–" + e.endTime
                : ""
            }
            ${
              e.place
                ? " · " +
                  escapeHtml(e.place)
                : ""
            }

          </div>

          <div
            style="
              font-weight:700;
              margin-bottom:5px;
            ">
            Arbitri designati
          </div>

          ${
            names.length
              ? `
                <ol
                  style="
                    margin:0;
                    padding-left:24px;
                  ">
                  ${
                    names
                      .map(
                        n =>
                          `<li style="margin:3px 0;">
                             ${escapeHtml(n)}
                           </li>`
                      )
                      .join("")
                  }
                </ol>
              `
              : `
                <div
                  style="
                    color:#b42318;
                    font-style:italic;
                  ">
                  Nessun arbitro designato.
                </div>
              `
          }

        </section>
      `;
    }).join("");

  return `
    <div
      style="
        max-width:800px;
        margin:0 auto;
        font-family:Arial,Helvetica,sans-serif;
        color:#172033;
      ">

      <div
        style="
          border-bottom:2px solid #172033;
          padding-bottom:12px;
          margin-bottom:24px;
        ">

        <div
          style="
            font-size:12px;
            text-transform:uppercase;
            letter-spacing:.08em;
            font-weight:700;
            color:#667085;
          ">
          Commissione Arbitri
        </div>

        <h1
          style="
            margin:5px 0 0;
            font-size:25px;
          ">
          Designazioni arbitrali
        </h1>

      </div>

      ${rows}

    </div>
  `;
}

function renderReportPreview() {

  const selected =
    getSelectedReportEvents();

  const preview =
    $("reportPreview");

  if (!selected.length) {

    preview.style.display =
      "none";

    preview.innerHTML =
      "";

    return;
  }

  preview.style.display =
    "block";

  preview.innerHTML = `
    <div
      style="
        font-size:12px;
        text-transform:uppercase;
        letter-spacing:.06em;
        color:#667085;
        font-weight:700;
        margin-bottom:10px;
      ">
      Anteprima
    </div>

    ${reportDocumentHtml(
      selected
    )}
  `;
}

function printReportPdf() {

  const selected =
    getSelectedReportEvents();

  if (!selected.length) {

    alert(
      "Seleziona almeno un evento."
    );

    return;
  }

  const printWindow =
    window.open(
      "",
      "_blank"
    );

  if (!printWindow) {

    alert(
      "Il browser ha bloccato la finestra di stampa. Consenti i popup per questo sito."
    );

    return;
  }

  printWindow.document.open();

  printWindow.document.write(`
    <!doctype html>
    <html lang="it">
      <head>

        <meta charset="utf-8">

        <title>
          Designazioni arbitrali
        </title>

        <style>

          @page {
            margin: 18mm;
          }

          body {
            margin:0;
            background:#fff;
            color:#172033;
            font-family:Arial,Helvetica,sans-serif;
          }

          @media print {
            body {
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }
          }

        </style>

      </head>

      <body>

        ${reportDocumentHtml(
          selected
        )}

      </body>
    </html>
  `);

  printWindow.document.close();

  printWindow.focus();

  setTimeout(
    () => {
      printWindow.print();
    },
    250
  );
}

/*
 * Excel:
 * generiamo un file .xls HTML compatibile con Excel.
 * Non servono librerie esterne.
 */

function exportReportExcel() {

  const selected =
    getSelectedReportEvents();

  if (!selected.length) {

    alert(
      "Seleziona almeno un evento."
    );

    return;
  }

  const rows =
    selected.map(e => {

      const names =
        getAssignedNames(e);

      return {

        evento:
          e.name || "",

        data:
          formatDate(e.date),

        ora:
          `${e.startTime || ""}${
            e.endTime
              ? "–" + e.endTime
              : ""
          }`,

        luogo:
          e.place || "",

        arbitri:
          names.join(", ")

      };
    });

  const tableRows =
    rows.map(r => `
      <tr>
        <td>${escapeHtml(r.evento)}</td>
        <td>${escapeHtml(r.data)}</td>
        <td>${escapeHtml(r.ora)}</td>
        <td>${escapeHtml(r.luogo)}</td>
        <td>${escapeHtml(r.arbitri)}</td>
      </tr>
    `).join("");

  const html = `
    <html xmlns:o="urn:schemas-microsoft-com:office:office"
          xmlns:x="urn:schemas-microsoft-com:office:excel"
          xmlns="http://www.w3.org/TR/REC-html40">

      <head>

        <meta charset="UTF-8">

        <style>

          table {
            border-collapse:collapse;
          }

          th, td {
            border:1px solid #999;
            padding:7px;
            vertical-align:top;
          }

          th {
            font-weight:bold;
          }

        </style>

      </head>

      <body>

        <h2>Designazioni arbitrali</h2>

        <table>

          <thead>
            <tr>
              <th>Evento</th>
              <th>Data</th>
              <th>Orario</th>
              <th>Luogo</th>
              <th>Arbitri designati</th>
            </tr>
          </thead>

          <tbody>
            ${tableRows}
          </tbody>

        </table>

      </body>

    </html>
  `;

  const blob =
    new Blob(
      [html],
      {
        type:
          "application/vnd.ms-excel;charset=utf-8"
      }
    );

  const url =
    URL.createObjectURL(blob);

  const a =
    document.createElement("a");

  a.href =
    url;

  a.download =
    "designazioni-arbitrali.xls";

  document.body.appendChild(a);

  a.click();

  a.remove();

  setTimeout(
    () =>
      URL.revokeObjectURL(url),
    1000
  );
}

/* =========================================================
   LISTENER
========================================================= */

if ($("arbiterAvailabilityBtn")) {
  $("arbiterAvailabilityBtn").onclick = openWideAvailability;
}

if ($("closeArbiterAvailabilityBtn")) {
  $("closeArbiterAvailabilityBtn").onclick = closeWideAvailability;
}

if ($("cancelWideAvailabilityBtn")) {
  $("cancelWideAvailabilityBtn").onclick = closeWideAvailability;
}

if ($("saveWideAvailabilityBtn")) {
  $("saveWideAvailabilityBtn").onclick = saveWideAvailability;
}

if ($("wideArbiterSearch")) {
  $("wideArbiterSearch").oninput = renderWideArbiters;
}

if ($("wideEventScope")) {
  $("wideEventScope").onchange = renderWideEvents;
}

if ($("viewFilter")) {
  $("viewFilter").onchange = renderEvents;
}

if ($("sortFilter")) {
  $("sortFilter").onchange = renderEvents;
}

$("eventSearch").oninput = renderEvents;
$("statusFilter").onchange = renderEvents;

ensureReportUI();
loadFromServer();
