const API_URL = "https://script.google.com/macros/s/AKfycbzhaYuZzBYtMrgE5YCYohTH6Zg_TAY-cIgtah39dvAKj5fN-1lAFonX6_nhM7QSXcfw/exec";

let events = [];
let activeEventId = null;

let tempAvailable = new Set();
let tempAvailability = new Map();
let tempAssigned = new Set();
let tempCustomArbiters = [];

const $ = id => document.getElementById(id);

const fullName = a =>
  `${a?.nome || ""} ${a?.cognome || ""}`.trim();

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function apiGet(params) {
  return new Promise((resolve, reject) => {
    const callback = "cb_" + uid();
    const script = document.createElement("script");

    const query = new URLSearchParams({
      ...params,
      callback
    });

    window[callback] = data => {
      delete window[callback];
      script.remove();

      if (data && data.ok === false) {
        reject(new Error(data.error || "Errore API"));
      } else {
        resolve(data);
      }
    };

    script.onerror = () => {
      delete window[callback];
      script.remove();
      reject(new Error("Impossibile contattare il database condiviso."));
    };

    script.src = API_URL + "?" + query.toString();
    document.body.appendChild(script);
  });
}

async function loadFromServer() {
  try {
    const data = await apiGet({
      action: "get"
    });

    events = Array.isArray(data.events)
      ? data.events
      : [];

    renderEvents();

  } catch (err) {
    console.error(err);

    $("eventsList").innerHTML = `
      <div class="empty">
        <strong>Errore di collegamento al database</strong><br>
        ${escapeHtml(err.message)}<br><br>
        Ricarica la pagina e riprova.
      </div>
    `;
  }
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

  return Number.isNaN(d.getTime())
    ? null
    : d;
}

function isFutureEvent(e) {
  const end = eventDateTime(e, true);

  if (end) {
    return end.getTime() >= Date.now();
  }

  return String(e.date || "") >=
    new Date().toISOString().slice(0, 10);
}

function statusOf(e) {
  const assigned = (e.assigned || []).length;
  const required = Number(e.required) || 0;

  if (assigned === 0) return "none";
  if (assigned >= required) return "complete";

  return "partial";
}

function statusLabel(status) {
  if (status === "complete") return "Completo";
  if (status === "partial") return "Da completare";

  return "Nessun designato";
}

function renderEvents() {

  const search =
    $("eventSearch").value
      .trim()
      .toLowerCase();

  const statusFilter =
    $("statusFilter").value;

  const viewFilter =
    $("viewFilter")?.value || "future";

  const sortFilter =
    $("sortFilter")?.value || "asc";

  let list = events.slice();

  if (viewFilter === "future") {
    list = list.filter(isFutureEvent);
  }

  if (viewFilter === "past") {
    list = list.filter(e => !isFutureEvent(e));
  }

  list = list.filter(e => {

    const text =
      `${e.name || ""} ${e.type || ""} ${e.place || ""}`
        .toLowerCase();

    const matchesSearch =
      !search || text.includes(search);

    const matchesStatus =
      statusFilter === "all" ||
      statusOf(e) === statusFilter;

    return matchesSearch && matchesStatus;
  });

  list.sort((a, b) => {

    if (sortFilter === "name") {
      return String(a.name || "")
        .localeCompare(
          String(b.name || ""),
          "it"
        );
    }

    const da =
      eventDateTime(a)?.getTime()
      ?? Number.MAX_SAFE_INTEGER;

    const db =
      eventDateTime(b)?.getTime()
      ?? Number.MAX_SAFE_INTEGER;

    return sortFilter === "desc"
      ? db - da
      : da - db;
  });

  if (!list.length) {

    $("eventsList").innerHTML = `
      <div class="empty">
        Nessun evento nella vista selezionata.
      </div>
    `;

    return;
  }

  $("eventsList").innerHTML =
    list.map(e => {

      const available =
        new Set(
          (e.available || []).map(String)
        ).size;

      const assignedIds =
        [...new Set(
          (e.assigned || []).map(String)
        )];

      const assigned =
        assignedIds.length;

      const required =
        Number(e.required) || 0;

      const status =
        statusOf(e);

      const coverage =
        Math.min(
          100,
          (available /
            Math.max(1, required)) *
            100
        );

      const arbiters =
        getArbitersByIds(
          assignedIds,
          e.manualArbiters || []
        );

      const assignedNames =
        arbiters
          .map(a => fullName(a))
          .filter(Boolean);

      return `
        <article class="event-card">

          <div class="event-main">

            <div class="eyebrow">
              ${escapeHtml(e.type)}
            </div>

            <h3>
              ${escapeHtml(e.name)}
            </h3>

            <div class="muted">
              ${formatDate(e.date)}
              ${e.startTime
                ? " · " + e.startTime
                : ""}
              ${e.endTime
                ? "–" + e.endTime
                : ""}
              ${e.place
                ? " · " + escapeHtml(e.place)
                : ""}
            </div>

            ${
              assignedNames.length
                ? `
                  <div class="assigned-home">
                    <strong>Designati:</strong>
                    ${assignedNames
                      .map(escapeHtml)
                      .join(" · ")}
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

            <div class="metric availability-metric ${
              available >= required
                ? "covered"
                : "not-covered"
            }">

              <strong>
                ${available}/${required}
              </strong>

              <span>disponibili</span>

              <div class="coverage-bar">
                <div
                  class="coverage-fill"
                  style="width:${coverage}%">
                </div>
              </div>

            </div>

            <div class="metric">
              <strong>${assigned}</strong>
              <span>designati</span>
            </div>

          </div>

          <div class="event-actions">

            <span class="badge ${status}">
              ${statusLabel(status)}
            </span>

            <div class="action-row">

              <button
                class="small-btn"
                onclick="openDetail('${escapeHtml(e.id)}')">
                Gestisci
              </button>

              <button
                class="small-btn"
                onclick="duplicateEvent('${escapeHtml(e.id)}')">
                Duplica
              </button>

            </div>

          </div>

        </article>
      `;
    }).join("");
}

function getArbitersByIds(ids, manualArbiters = []) {

  const base =
    Array.isArray(window.ARBITRI)
      ? window.ARBITRI
      : (
          typeof ARBITRI !== "undefined" &&
          Array.isArray(ARBITRI)
        )
          ? ARBITRI
          : [];

  const map = new Map();

  base.forEach(a => {
    map.set(
      String(a.id),
      a
    );
  });

  manualArbiters.forEach(a => {
    map.set(
      String(a.id),
      {
        id: String(a.id),
        nome: a.nome || "",
        cognome: "",
        custom: true
      }
    );
  });

  return ids
    .map(id => map.get(String(id)))
    .filter(Boolean);
}

window.duplicateEvent = id => {

  const original =
    events.find(x => x.id === id);

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

  $("modalTitle").textContent =
    e
      ? "Modifica evento"
      : "Nuovo evento";

  $("eventId").value =
    e?.id || "";

  $("eventDate").value =
    e?.date ||
    new Date()
      .toISOString()
      .slice(0, 10);

  $("eventStartTime").value =
    e?.startTime || "";

  $("eventEndTime").value =
    e?.endTime || "";

  $("eventType").value =
    e?.type ||
    "Torneo non ufficiale";

  $("eventRequired").value =
    e?.required || 2;

  $("eventName").value =
    e?.name || "";

  $("eventPlace").value =
    e?.place || "";

  $("eventNotes").value =
    e?.notes || "";

  $("modal").classList.remove(
    "hidden"
  );
}

function closeEventForm() {
  $("modal").classList.add(
    "hidden"
  );
}

$("newEventBtn").onclick =
  () => openEventForm();

$("closeModalBtn").onclick =
  closeEventForm;

$("cancelBtn").onclick =
  closeEventForm;

$("eventForm").onsubmit =
  async e => {

    e.preventDefault();

    const id =
      $("eventId").value ||
      uid();

    const existing =
      events.find(x => x.id === id);

    const obj = {

      id,

      date:
        $("eventDate").value,

      startTime:
        $("eventStartTime").value,

      endTime:
        $("eventEndTime").value,

      type:
        $("eventType").value,

      required:
        Number(
          $("eventRequired").value
        ),

      name:
        $("eventName")
          .value
          .trim(),

      place:
        $("eventPlace")
          .value
          .trim(),

      notes:
        $("eventNotes")
          .value
          .trim(),

      available:
        existing?.available || [],

      assigned:
        existing?.assigned || [],

      manualArbiters:
        existing?.manualArbiters || [],

      availabilityTimes:
        existing?.availabilityTimes || {}
    };

    const saveBtn =
      $("eventForm")
        .querySelector(
          'button[type="submit"]'
        );

    saveBtn.disabled = true;

    saveBtn.textContent =
      "Salvataggio…";

    try {

      await apiGet({
        action: "saveEvent",
        event: JSON.stringify(obj)
      });

      if (existing) {
        Object.assign(
          existing,
          obj
        );
      } else {
        events.push(obj);
      }

      closeEventForm();

      renderEvents();

    } catch (err) {

      alert(
        "Errore nel salvataggio: " +
        err.message
      );

    } finally {

      saveBtn.disabled = false;

      saveBtn.textContent =
        "Salva evento";
    }
  };
/* =========================================================
   GESTIONE EVENTO
========================================================= */

function openDetail(id) {

  activeEventId = id;

  const e =
    events.find(x => x.id === id);

  if (!e) return;

  tempAvailable =
    new Set(
      (e.available || [])
        .map(String)
    );

  tempAvailability =
    new Map(
      Object.entries(
        e.availabilityTimes || {}
      ).map(
        ([arbiterId, value]) => [

          String(arbiterId),

          {
            mode:
              value?.mode || "full",

            start:
              value?.start ||
              e.startTime ||
              "",

            end:
              value?.end ||
              e.endTime ||
              ""
          }
        ]
      )
    );

  [...tempAvailable].forEach(
    arbiterId => {

      if (
        !tempAvailability.has(
          String(arbiterId)
        )
      ) {

        tempAvailability.set(
          String(arbiterId),
          {
            mode: "full",
            start:
              e.startTime || "",
            end:
              e.endTime || ""
          }
        );
      }
    }
  );

  tempAssigned =
    new Set(
      (e.assigned || [])
        .map(String)
    );

  tempCustomArbiters =
    [...(e.manualArbiters || [])];

  $("detailType").textContent =
    e.type;

  $("detailTitle").textContent =
    e.name;

  $("detailMeta").textContent =
    `${formatDate(e.date)}` +
    `${e.startTime
      ? " · " + e.startTime
      : ""}` +
    `${e.endTime
      ? "–" + e.endTime
      : ""}` +
    `${e.place
      ? " · " + e.place
      : ""}`;

  $("arbiterSearch").value = "";
  $("assignmentSearch").value = "";

  document
    .querySelectorAll(".tab")
    .forEach(
      t =>
        t.classList.remove(
          "active"
        )
    );

  document
    .querySelector(
      '.tab[data-tab="availability"]'
    )
    .classList.add("active");

  $("availabilityView")
    .classList.remove(
      "hidden"
    );

  $("assignmentsView")
    .classList.add(
      "hidden"
    );

  renderDetail();

  $("detailModal")
    .classList.remove(
      "hidden"
    );
}

function renderDetail() {

  const e =
    events.find(
      x => x.id === activeEventId
    );

  if (!e) return;

  $("detailRequired")
    .textContent =
    e.required;

  $("detailAvailable")
    .textContent =
    tempAvailable.size;

  $("detailAssigned")
    .textContent =
    tempAssigned.size;

  const coverage =
    Math.min(
      100,
      (
        tempAvailable.size /
        Math.max(
          1,
          Number(e.required)
        )
      ) * 100
    );

  $("detailCoverageFill")
    .style.width =
    coverage + "%";

  const covered =
    tempAvailable.size >=
    Number(e.required);

  $("detailCoverageLabel")
    .textContent =
    covered
      ? "✓ Numero di disponibili sufficiente"
      : `Mancano ${
          Number(e.required) -
          tempAvailable.size
        } disponibilità`;

  $("availabilityTabCount")
    .textContent =
    tempAvailable.size;

  $("assignmentTabCount")
    .textContent =
    tempAssigned.size;

  renderArbiters();
  renderAssigned();
}

/* =========================================================
   ELENCO ARBITRI
========================================================= */

function currentArbiters() {

  const base =
    Array.isArray(window.ARBITRI)
      ? window.ARBITRI
      : (
          typeof ARBITRI !== "undefined" &&
          Array.isArray(ARBITRI)
        )
          ? ARBITRI
          : [];

  const custom =
    tempCustomArbiters.map(a => ({

      id:
        a.id,

      nome:
        a.nome,

      cognome:
        "",

      custom:
        true

    }));

  return [
    ...base,
    ...custom
  ];
}

function availabilityFor(id) {

  return (
    tempAvailability.get(
      String(id)
    ) || {

      mode:
        "full",

      start:
        "",

      end:
        ""

    }
  );
}

function availabilityLabel(id) {

  const a =
    availabilityFor(id);

  if (
    a.mode === "partial" &&
    a.start &&
    a.end
  ) {

    return `${a.start}–${a.end}`;

  }

  return "Tutto l'evento";
}

/* =========================================================
   DISPONIBILITÀ
========================================================= */

function renderArbiters() {

  const q =
    $("arbiterSearch")
      .value
      .trim()
      .toLowerCase();

  const matches =
    currentArbiters()
      .filter(
        a =>
          fullName(a)
            .toLowerCase()
            .includes(q)
      )
      .slice(0, 40);

  $("arbiterResults")
    .innerHTML =
    matches.map(a => {

      const selected =
        tempAvailable.has(
          String(a.id)
        );

      const av =
        availabilityFor(a.id);

      return `
        <div class="arbiter-item ${
          selected
            ? "selected"
            : ""
        }">

          <div class="arbiter-main">

            <span class="arbiter-name">

              ${escapeHtml(
                fullName(a)
              )}

              ${
                a.custom
                  ? '<span class="hint">(inserito manualmente)</span>'
                  : ""
              }

            </span>

            ${
              selected
                ? `
                  <div class="availability-controls">

                    <select
                      class="availability-mode"
                      onchange="
                        setAvailabilityMode(
                          '${escapeHtml(a.id)}',
                          this.value
                        )
                      ">

                      <option
                        value="full"
                        ${
                          av.mode === "full"
                            ? "selected"
                            : ""
                        }>
                        Tutto l'evento
                      </option>

                      <option
                        value="partial"
                        ${
                          av.mode === "partial"
                            ? "selected"
                            : ""
                        }>
                        Solo fascia oraria
                      </option>

                    </select>

                    ${
                      av.mode === "partial"
                        ? `
                          <div class="time-range">

                            <input
                              type="time"
                              value="${escapeHtml(av.start)}"
                              onchange="
                                setAvailabilityTime(
                                  '${escapeHtml(a.id)}',
                                  'start',
                                  this.value
                                )
                              ">

                            <span>→</span>

                            <input
                              type="time"
                              value="${escapeHtml(av.end)}"
                              onchange="
                                setAvailabilityTime(
                                  '${escapeHtml(a.id)}',
                                  'end',
                                  this.value
                                )
                              ">

                          </div>
                        `
                        : ""
                    }

                  </div>
                `
                : ""
            }

          </div>

          <div class="arbiter-actions">

            <button
              class="small-btn ${
                selected
                  ? "on"
                  : ""
              }"
              onclick="
                toggleAvailable(
                  '${escapeHtml(a.id)}'
                )
              ">

              ${
                selected
                  ? "Disponibile"
                  : "Aggiungi"
              }

            </button>

          </div>

        </div>
      `;
    }).join("")
    ||
    `<div class="empty">
       Nessun arbitro trovato.
     </div>`;
}

function renderAssigned() {

  const q =
    $("assignmentSearch")
      .value
      .trim()
      .toLowerCase();

  const available =
    currentArbiters()
      .filter(
        a =>
          tempAvailable.has(
            String(a.id)
          ) &&
          fullName(a)
            .toLowerCase()
            .includes(q)
      );

  $("assignedList")
    .innerHTML =
    available.length

      ? available.map(a => {

          const id =
            String(a.id);

          const checked =
            tempAssigned.has(id);

          return `
            <div class="assigned-item">

              <label class="assigned-check">

                <input
                  type="checkbox"
                  ${
                    checked
                      ? "checked"
                      : ""
                  }
                  onchange="
                    toggleAssigned(
                      '${escapeHtml(id)}'
                    )
                  ">

                <span>
                  ${escapeHtml(
                    fullName(a)
                  )}
                </span>

              </label>

              <div class="assigned-meta">

                <span class="availability-pill">
                  ${escapeHtml(
                    availabilityLabel(id)
                  )}
                </span>

                <span
                  class="badge ${
                    checked
                      ? "complete"
                      : "partial"
                  }">

                  ${
                    checked
                      ? "DESIGNATO"
                      : "Disponibile"
                  }

                </span>

              </div>

            </div>
          `;

        }).join("")

      : `
        <div class="empty">

          ${
            tempAvailable.size
              ? "Nessun arbitro disponibile corrisponde alla ricerca."
              : "Seleziona prima almeno un arbitro nella scheda Disponibilità."
          }

        </div>
      `;
}

/* =========================================================
   AZIONI
========================================================= */

window.toggleAvailable = id => {

  const key =
    String(id);

  if (
    tempAvailable.has(key)
  ) {

    tempAvailable.delete(key);

    tempAvailability.delete(key);

    tempAssigned.delete(key);

  } else {

    const e =
      events.find(
        x => x.id === activeEventId
      );

    tempAvailable.add(key);

    tempAvailability.set(
      key,
      {

        mode:
          "full",

        start:
          e?.startTime || "",

        end:
          e?.endTime || ""

      }
    );
  }

  renderDetail();
};

window.setAvailabilityMode =
  (id, mode) => {

    const key =
      String(id);

    const e =
      events.find(
        x => x.id === activeEventId
      );

    const current =
      availabilityFor(key);

    tempAvailability.set(
      key,
      {

        mode,

        start:
          mode === "partial"
            ? (
                current.start ||
                e?.startTime ||
                ""
              )
            : (
                e?.startTime ||
                current.start ||
                ""
              ),

        end:
          mode === "partial"
            ? (
                current.end ||
                e?.endTime ||
                ""
              )
            : (
                e?.endTime ||
                current.end ||
                ""
              )

      }
    );

    renderDetail();
  };

window.setAvailabilityTime =
  (id, field, value) => {

    const key =
      String(id);

    const current =
      availabilityFor(key);

    tempAvailability.set(
      key,
      {

        ...current,

        mode:
          "partial",

        [field]:
          value

      }
    );

    renderDetail();
  };

window.toggleAssigned = id => {

  const key =
    String(id);

  if (
    tempAssigned.has(key)
  ) {

    tempAssigned.delete(key);

  } else {

    if (
      tempAvailable.has(key)
    ) {
      tempAssigned.add(key);
    }
  }

  renderDetail();
};

/* =========================================================
   RICERCHE E TAB
========================================================= */

$("arbiterSearch").oninput =
  renderArbiters;

$("assignmentSearch").oninput =
  renderAssigned;

document
  .querySelectorAll(".tab")
  .forEach(tab => {

    tab.onclick = () => {

      document
        .querySelectorAll(".tab")
        .forEach(
          t =>
            t.classList.remove(
              "active"
            )
        );

      tab.classList.add(
        "active"
      );

      const view =
        tab.dataset.tab;

      $("availabilityView")
        .classList.toggle(
          "hidden",
          view !== "availability"
        );

      $("assignmentsView")
        .classList.toggle(
          "hidden",
          view !== "assignments"
        );

      if (
        view === "assignments"
      ) {
        renderAssigned();
      }
    };
  });

$("clearAvailabilityBtn").onclick =
  () => {

    tempAvailable.clear();
    tempAvailability.clear();
    tempAssigned.clear();

    renderDetail();
  };

$("closeDetailBtn").onclick =
  () => {

    $("detailModal")
      .classList.add(
        "hidden"
      );
  };

/* =========================================================
   ARBITRO MANUALE
========================================================= */

$("addManualArbiterBtn").onclick =
  () => {

    const name =
      $("manualArbiterName")
        .value
        .trim()
        .replace(
          /\s+/g,
          " "
        );

    if (!name) return;

    const id =
      "manual_" + uid();

    tempCustomArbiters.push({
      id,
      nome: name
    });

    tempAvailable.add(id);

    const e =
      events.find(
        x => x.id === activeEventId
      );

    tempAvailability.set(
      id,
      {

        mode:
          "full",

        start:
          e?.startTime || "",

        end:
          e?.endTime || ""

      }
    );

    $("manualArbiterName")
      .value = "";

    renderDetail();
  };

$("manualArbiterName")
  .addEventListener(
    "keydown",
    e => {

      if (
        e.key === "Enter"
      ) {

        e.preventDefault();

        $("addManualArbiterBtn")
          .click();
      }
    }
  );

/* =========================================================
   SALVATAGGIO DISPONIBILITÀ / DESIGNAZIONI
========================================================= */

$("saveDetailBtn").onclick =
  async () => {

    const e =
      events.find(
        x => x.id === activeEventId
      );

    if (!e) return;

    const btn =
      $("saveDetailBtn");

    btn.disabled = true;

    btn.textContent =
      "Salvataggio…";

    try {

      const availabilityTimes =
        Object.fromEntries(
          tempAvailability
        );

      await apiGet({

        action:
          "saveParticipants",

        eventId:
          e.id,

        available:
          JSON.stringify(
            [...tempAvailable]
          ),

        assigned:
          JSON.stringify(
            [...tempAssigned]
          ),

        manual:
          JSON.stringify(
            tempCustomArbiters
          ),

        availabilityTimes:
          JSON.stringify(
            availabilityTimes
          )

      });

      e.available =
        [...tempAvailable];

      e.assigned =
        [...tempAssigned];

      e.manualArbiters =
        [...tempCustomArbiters];

      e.availabilityTimes =
        availabilityTimes;

      $("detailModal")
        .classList.add(
          "hidden"
        );

      renderEvents();

    } catch (err) {

      alert(
        "Errore nel salvataggio delle disponibilità: " +
        err.message
      );

    } finally {

      btn.disabled = false;

      btn.textContent =
        "Salva disponibilità e designazioni";
    }
  };

/* =========================================================
   ELIMINAZIONE
========================================================= */

$("deleteEventBtn").onclick =
  async () => {

    if (
      !confirm(
        "Eliminare definitivamente questo evento?"
      )
    ) {
      return;
    }

    try {

      await apiGet({

        action:
          "deleteEvent",

        eventId:
          activeEventId

      });

      events =
        events.filter(
          x =>
            x.id !==
            activeEventId
        );

      $("detailModal")
        .classList.add(
          "hidden"
        );

      renderEvents();

    } catch (err) {

      alert(
        "Errore nell'eliminazione: " +
        err.message
      );
    }
  };
/* =========================================================
   DISPONIBILITÀ TRASVERSALE PER ARBITRO
========================================================= */

let wideActiveArbiterId = null;

function getAllArbitersForWideView() {

  const base =
    Array.isArray(window.ARBITRI)
      ? window.ARBITRI
      : (
          typeof ARBITRI !== "undefined" &&
          Array.isArray(ARBITRI)
        )
          ? ARBITRI
          : [];

  const map = new Map();

  base.forEach(a => {

    map.set(
      String(a.id),
      {
        ...a,
        id: String(a.id)
      }
    );
  });

  events.forEach(e => {

    (e.manualArbiters || [])
      .forEach(a => {

        const id =
          String(a.id);

        if (!map.has(id)) {

          map.set(
            id,
            {
              id,
              nome:
                String(
                  a.nome || ""
                ),
              cognome:
                "",
              custom:
                true
            }
          );
        }
      });
  });

  return [...map.values()];
}

function wideAvailabilityFor(e, id) {

  const saved =
    (e.availabilityTimes || {})[
      String(id)
    ];

  if (saved) {

    return {

      mode:
        saved.mode === "partial"
          ? "partial"
          : "full",

      start:
        saved.start ||
        e.startTime ||
        "",

      end:
        saved.end ||
        e.endTime ||
        ""

    };
  }

  return {

    mode:
      "full",

    start:
      e.startTime || "",

    end:
      e.endTime || ""

  };
}

function openWideAvailability() {

  wideActiveArbiterId =
    null;

  $("wideArbiterSearch")
    .value = "";

  $("wideEventScope")
    .value = "future";

  $("arbiterAvailabilityModal")
    .classList.remove(
      "hidden"
    );

  $("wideSelectedArbiter")
    .classList.add(
      "hidden"
    );

  $("wideEventsList")
    .innerHTML = "";

  renderWideArbiters();

  $("wideArbiterSearch")
    .focus();
}

function closeWideAvailability() {

  $("arbiterAvailabilityModal")
    .classList.add(
      "hidden"
    );
}

function renderWideArbiters() {

  const q =
    $("wideArbiterSearch")
      .value
      .trim()
      .toLowerCase();

  const list =
    getAllArbitersForWideView()
      .filter(
        a =>
          fullName(a)
            .toLowerCase()
            .includes(q)
      )
      .sort(
        (a, b) =>
          fullName(a)
            .localeCompare(
              fullName(b),
              "it"
            )
      )
      .slice(0, 60);

  $("wideArbiterResults")
    .innerHTML =
    list.length

      ? list.map(a => `

          <button
            type="button"
            class="wide-arbiter-result ${
              String(a.id) ===
              String(wideActiveArbiterId)
                ? "active"
                : ""
            }"
            onclick="
              selectWideArbiter(
                '${escapeHtml(
                  String(a.id)
                )}'
              )
            ">

            ${escapeHtml(
              fullName(a)
            )}

          </button>

        `).join("")

      : `

        <div class="empty small-empty">

          ${
            q
              ? "Nessun arbitro trovato."
              : "Inizia a digitare nome o cognome."
          }

        </div>

      `;
}

window.selectWideArbiter =
  id => {

    wideActiveArbiterId =
      String(id);

    const arbiter =
      getAllArbitersForWideView()
        .find(
          a =>
            String(a.id) ===
            String(id)
        );

    if (!arbiter) return;

    $("wideSelectedArbiter")
      .classList.remove(
        "hidden"
      );

    $("wideSelectedArbiter")
      .innerHTML = `

        <strong>
          ${escapeHtml(
            fullName(arbiter)
          )}
        </strong>

        <span>
          Modifica le disponibilità
          degli eventi qui sotto.
        </span>

      `;

    renderWideArbiters();

    renderWideEvents();
  };

function renderWideEvents() {

  if (
    wideActiveArbiterId === null
  ) {

    $("wideEventsList")
      .innerHTML = "";

    return;
  }

  const scope =
    $("wideEventScope").value;

  const list =
    events
      .filter(
        e =>
          scope === "all" ||
          isFutureEvent(e)
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

  $("wideEventsList")
    .innerHTML =
    list.map(e => {

      const id =
        String(e.id);

      const available =
        (e.available || [])
          .map(String)
          .includes(
            String(
              wideActiveArbiterId
            )
          );

      const saved =
        wideAvailabilityFor(
          e,
          wideActiveArbiterId
        );

      return `

        <div
          class="wide-event-row"
          data-wide-event-id="${escapeHtml(id)}">

          <div class="wide-event-info">

            <strong>
              ${escapeHtml(e.name)}
            </strong>

            <span>

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

          </div>

          <div class="wide-event-controls">

            <label class="wide-check">

              <input
                type="checkbox"
                class="wide-available"
                ${
                  available
                    ? "checked"
                    : ""
                }>

              <span>
                Disponibile
              </span>

            </label>

            <select
              class="wide-mode"
              ${
                available
                  ? ""
                  : "disabled"
              }>

              <option
                value="full"
                ${
                  saved.mode === "full"
                    ? "selected"
                    : ""
                }>

                Tutto l'evento

              </option>

              <option
                value="partial"
                ${
                  saved.mode === "partial"
                    ? "selected"
                    : ""
                }>

                Solo fascia

              </option>

            </select>

            <div
              class="wide-times ${
                available &&
                saved.mode === "partial"
                  ? ""
                  : "hidden"
              }">

              <input
                class="wide-start"
                type="time"
                value="${escapeHtml(
                  saved.start
                )}">

              <span>→</span>

              <input
                class="wide-end"
                type="time"
                value="${escapeHtml(
                  saved.end
                )}">

            </div>

          </div>

        </div>

      `;

    }).join("")

    ||

    `
      <div class="empty">
        Nessun evento nella vista selezionata.
      </div>
    `;

  document
    .querySelectorAll(
      ".wide-event-row"
    )
    .forEach(row => {

      const checkbox =
        row.querySelector(
          ".wide-available"
        );

      const mode =
        row.querySelector(
          ".wide-mode"
        );

      const times =
        row.querySelector(
          ".wide-times"
        );

      const sync =
        () => {

          mode.disabled =
            !checkbox.checked;

          times.classList.toggle(
            "hidden",
            !(
              checkbox.checked &&
              mode.value === "partial"
            )
          );
        };

      checkbox.onchange =
        sync;

      mode.onchange =
        sync;
    });
}

async function saveWideAvailability() {

  if (
    wideActiveArbiterId === null
  ) {
    return;
  }

  const btn =
    $("saveWideAvailabilityBtn");

  btn.disabled = true;

  btn.textContent =
    "Salvataggio…";

  try {

    const rows =
      [
        ...document.querySelectorAll(
          ".wide-event-row"
        )
      ];

    for (
      const row of rows
    ) {

      const eventId =
        row.dataset
          .wideEventId;

      const e =
        events.find(
          x =>
            String(x.id) ===
            String(eventId)
        );

      if (!e) continue;

      const checkbox =
        row.querySelector(
          ".wide-available"
        );

      const mode =
        row.querySelector(
          ".wide-mode"
        );

      const start =
        row.querySelector(
          ".wide-start"
        );

      const end =
        row.querySelector(
          ".wide-end"
        );

      const available =
        new Set(
          (e.available || [])
            .map(String)
        );

      const assigned =
        new Set(
          (e.assigned || [])
            .map(String)
        );

      const times = {
        ...(e.availabilityTimes || {})
      };

      const id =
        String(
          wideActiveArbiterId
        );

      if (
        checkbox.checked
      ) {

        available.add(id);

        times[id] = {

          mode:
            mode.value === "partial"
              ? "partial"
              : "full",

          start:
            mode.value === "partial"
              ? (
                  start?.value ||
                  e.startTime ||
                  ""
                )
              : (
                  e.startTime ||
                  ""
                ),

          end:
            mode.value === "partial"
              ? (
                  end?.value ||
                  e.endTime ||
                  ""
                )
              : (
                  e.endTime ||
                  ""
                )
        };

      } else {

        available.delete(id);

        delete times[id];

        assigned.delete(id);
      }

      await apiGet({

        action:
          "saveParticipants",

        eventId:
          e.id,

        available:
          JSON.stringify(
            [...available]
          ),

        assigned:
          JSON.stringify(
            [...assigned]
          ),

        manual:
          JSON.stringify(
            e.manualArbiters || []
          ),

        availabilityTimes:
          JSON.stringify(
            times
          )
      });

      e.available =
        [...available];

      e.assigned =
        [...assigned];

      e.availabilityTimes =
        times;
    }

    closeWideAvailability();

    renderEvents();

  } catch (err) {

    console.error(err);

    alert(
      "Errore nel salvataggio delle disponibilità: " +
      err.message
    );

  } finally {

    btn.disabled = false;

    btn.textContent =
      "Salva disponibilità";
  }
}

/* =========================================================
   REPORT DESIGNAZIONI
========================================================= */

let reportSelectedEvents = new Set();

function getReportEvents() {

  const search =
    $("reportEventSearch")
      ? $("reportEventSearch")
          .value
          .trim()
          .toLowerCase()
      : "";

  const onlyAssigned =
    $("reportOnlyAssigned")
      ? $("reportOnlyAssigned").checked
      : true;

  return events
    .filter(e => {

      if (
        onlyAssigned &&
        !(e.assigned || []).length
      ) {
        return false;
      }

      if (!search) {
        return true;
      }

      const text =
        `${e.name || ""} ${e.type || ""} ${e.place || ""} ${e.date || ""}`
          .toLowerCase();

      return text.includes(search);
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

function getReportAssigned(e) {

  const ids =
    [
      ...new Set(
        (e.assigned || [])
          .map(String)
      )
    ];

  return getArbitersByIds(
    ids,
    e.manualArbiters || []
  );
}

function openReport() {

  reportSelectedEvents =
    new Set();

  if (
    $("reportModal")
  ) {

    $("reportModal")
      .classList.remove(
        "hidden"
      );

    if (
      $("reportEventSearch")
    ) {
      $("reportEventSearch")
        .value = "";
    }

    if (
      $("reportOnlyAssigned")
    ) {
      $("reportOnlyAssigned")
        .checked = true;
    }

    renderReportEvents();
    renderReportPreview();
  }
}

function closeReport() {

  if (
    $("reportModal")
  ) {

    $("reportModal")
      .classList.add(
        "hidden"
      );
  }
}

function renderReportEvents() {

  const list =
    getReportEvents();

  const container =
    $("reportEventsList");

  if (!container) return;

  container.innerHTML =
    list.length

      ? list.map(e => {

          const id =
            String(e.id);

          const checked =
            reportSelectedEvents
              .has(id);

          const assigned =
            getReportAssigned(e);

          return `

            <label
              class="report-event-option">

              <input
                type="checkbox"
                data-report-event="${escapeHtml(id)}"
                ${
                  checked
                    ? "checked"
                    : ""
                }>

              <span>

                <strong>
                  ${escapeHtml(
                    e.name
                  )}
                </strong>

                <small>

                  ${formatDate(e.date)}

                  ${
                    e.startTime
                      ? " · " +
                        e.startTime
                      : ""
                  }

                  ${
                    e.endTime
                      ? "–" +
                        e.endTime
                      : ""
                  }

                  ${
                    e.place
                      ? " · " +
                        escapeHtml(
                          e.place
                        )
                      : ""
                  }

                  · ${
                    assigned.length
                  } designati

                </small>

              </span>

            </label>

          `;

        }).join("")

      : `
        <div class="empty">
          Nessun evento trovato.
        </div>
      `;

  container
    .querySelectorAll(
      "[data-report-event]"
    )
    .forEach(input => {

      input.onchange =
        () => {

          const id =
            String(
              input.dataset
                .reportEvent
            );

          if (
            input.checked
          ) {

            reportSelectedEvents
              .add(id);

          } else {

            reportSelectedEvents
              .delete(id);
          }

          renderReportPreview();
        };
    });
}

function renderReportPreview() {

  const container =
    $("reportPreview");

  if (!container) return;

  const selected =
    events
      .filter(
        e =>
          reportSelectedEvents
            .has(String(e.id))
      )
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

  if (!selected.length) {

    container.innerHTML = `
      <div class="report-empty">
        Seleziona uno o più eventi
        per visualizzare l'anteprima.
      </div>
    `;

    return;
  }

  container.innerHTML =
    selected.map(e => {

      const assigned =
        getReportAssigned(e);

      return `

        <section class="report-preview-event">

          <div class="report-preview-head">

            <div>

              <div class="eyebrow">
                ${escapeHtml(
                  e.type
                )}
              </div>

              <h3>
                ${escapeHtml(
                  e.name
                )}
              </h3>

              <div class="muted">

                ${formatDate(e.date)}

                ${
                  e.startTime
                    ? " · " +
                      e.startTime
                    : ""
                }

                ${
                  e.endTime
                    ? "–" +
                      e.endTime
                    : ""
                }

                ${
                  e.place
                    ? " · " +
                      escapeHtml(
                        e.place
                      )
                    : ""
                }

              </div>

            </div>

          </div>

          <div class="report-assigned-title">
            Arbitri designati
          </div>

          <div class="report-assigned-names">

            ${
              assigned.length

                ? assigned
                    .map(
                      (a, index) =>
                        `<div>
                          ${index + 1}.
                          ${escapeHtml(
                            fullName(a)
                          )}
                        </div>`
                    )
                    .join("")

                : `<div>
                    Nessun arbitro designato.
                   </div>`
            }

          </div>

        </section>

      `;

    }).join("");
}

/* =========================================================
   GENERAZIONE DOCUMENTO PDF
========================================================= */

function buildPrintHtml() {

  const selected =
    events
      .filter(
        e =>
          reportSelectedEvents
            .has(String(e.id))
      )
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

  const sections =
    selected.map(e => {

      const assigned =
        getReportAssigned(e);

      return `

        <section class="print-event">

          <div class="print-type">
            ${escapeHtml(
              e.type
            )}
          </div>

          <h2>
            ${escapeHtml(
              e.name
            )}
          </h2>

          <div class="print-meta">

            ${formatDate(e.date)}

            ${
              e.startTime
                ? " · " +
                  e.startTime
                : ""
            }

            ${
              e.endTime
                ? "–" +
                  e.endTime
                : ""
            }

            ${
              e.place
                ? " · " +
                  escapeHtml(
                    e.place
                  )
                : ""
            }

          </div>

          <h3>
            Arbitri designati
          </h3>

          <ol>

            ${
              assigned.length
                ? assigned
                    .map(
                      a =>
                        `<li>
                          ${escapeHtml(
                            fullName(a)
                          )}
                        </li>`
                    )
                    .join("")
                : `<li>
                    Nessun arbitro designato
                   </li>`
            }

          </ol>

        </section>

      `;
    }).join("");

  return `

    <!doctype html>

    <html lang="it">

    <head>

      <meta charset="utf-8">

      <title>
        Designazioni arbitrali
      </title>

      <style>

        * {
          box-sizing: border-box;
        }

        body {
          margin: 0;
          padding: 40px;
          color: #172033;
          font-family:
            Arial,
            Helvetica,
            sans-serif;
          background: #fff;
        }

        .header {
          border-bottom:
            2px solid #172033;
          padding-bottom: 18px;
          margin-bottom: 30px;
        }

        .eyebrow {
          font-size: 12px;
          text-transform: uppercase;
          letter-spacing: .08em;
          font-weight: 700;
          color: #667085;
        }

        h1 {
          margin: 6px 0 0;
          font-size: 28px;
        }

        .print-event {
          page-break-inside: avoid;
          margin-bottom: 34px;
          padding-bottom: 28px;
          border-bottom:
            1px solid #d8dde7;
        }

        .print-event:last-child {
          border-bottom: 0;
        }

        .print-type {
          font-size: 12px;
          text-transform: uppercase;
          letter-spacing: .06em;
          font-weight: 700;
          color: #667085;
        }

        h2 {
          margin: 5px 0 7px;
          font-size: 21px;
        }

        h3 {
          margin:
            20px 0 8px;
          font-size: 15px;
        }

        .print-meta {
          color: #667085;
          font-size: 13px;
        }

        ol {
          margin:
            8px 0 0 24px;
          padding: 0;
        }

        li {
          margin-bottom: 7px;
          font-size: 15px;
        }

        @media print {

          body {
            padding: 20mm;
          }

        }

      </style>

    </head>

    <body>

      <header class="header">

        <div class="eyebrow">
          Commissione Arbitri
        </div>

        <h1>
          Designazioni arbitrali
        </h1>

      </header>

      ${sections}

    </body>

    </html>
  `;
}

function printReport() {

  if (
    !reportSelectedEvents.size
  ) {

    alert(
      "Seleziona almeno un evento."
    );

    return;
  }

  const html =
    buildPrintHtml();

  const printWindow =
    window.open(
      "",
      "_blank"
    );

  if (!printWindow) {

    alert(
      "Il browser ha bloccato la finestra di stampa. Consenti le finestre popup per questo sito."
    );

    return;
  }

  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();

  printWindow.onload =
    () => {

      printWindow.focus();

      setTimeout(
        () => {
          printWindow.print();
        },
        250
      );
    };
}

/* =========================================================
   ESPORTAZIONE EXCEL
========================================================= */

function exportReportExcel() {

  if (
    !reportSelectedEvents.size
  ) {

    alert(
      "Seleziona almeno un evento."
    );

    return;
  }

  const selected =
    events
      .filter(
        e =>
          reportSelectedEvents
            .has(String(e.id))
      )
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

  const rows = [
    [
      "Data",
      "Ora inizio",
      "Ora fine",
      "Evento",
      "Tipologia",
      "Luogo",
      "Arbitro designato"
    ]
  ];

  selected.forEach(e => {

    const assigned =
      getReportAssigned(e);

    if (!assigned.length) {

      rows.push([
        e.date || "",
        e.startTime || "",
        e.endTime || "",
        e.name || "",
        e.type || "",
        e.place || "",
        ""
      ]);

      return;
    }

    assigned.forEach(a => {

      rows.push([
        e.date || "",
        e.startTime || "",
        e.endTime || "",
        e.name || "",
        e.type || "",
        e.place || "",
        fullName(a)
      ]);
    });
  });

  const escapeCsv =
    value =>
      `"${String(
        value ?? ""
      ).replace(
        /"/g,
        '""'
      )}"`;

  const csv =
    rows
      .map(
        row =>
          row
            .map(escapeCsv)
            .join(";")
      )
      .join("\r\n");

  /*
   * BOM UTF-8 per Excel,
   * soprattutto con nomi italiani.
   */

  const blob =
    new Blob(
      [
        "\uFEFF" +
        csv
      ],
      {
        type:
          "text/csv;charset=utf-8;"
      }
    );

  const url =
    URL.createObjectURL(
      blob
    );

  const link =
    document.createElement(
      "a"
    );

  link.href = url;

  link.download =
    "designazioni_arbitrali.csv";

  document.body.appendChild(
    link
  );

  link.click();

  link.remove();

  URL.revokeObjectURL(
    url
  );
}

/* =========================================================
   EVENTI REPORT
========================================================= */

if (
  $("arbiterAvailabilityBtn")
) {

  $("arbiterAvailabilityBtn")
    .onclick =
    openWideAvailability;
}

if (
  $("closeArbiterAvailabilityBtn")
) {

  $("closeArbiterAvailabilityBtn")
    .onclick =
    closeWideAvailability;
}

if (
  $("cancelWideAvailabilityBtn")
) {

  $("cancelWideAvailabilityBtn")
    .onclick =
    closeWideAvailability;
}

if (
  $("saveWideAvailabilityBtn")
) {

  $("saveWideAvailabilityBtn")
    .onclick =
    saveWideAvailability;
}

if (
  $("wideArbiterSearch")
) {

  $("wideArbiterSearch")
    .oninput =
    renderWideArbiters;
}

if (
  $("wideEventScope")
) {

  $("wideEventScope")
    .onchange =
    renderWideEvents;
}

if (
  $("reportBtn")
) {

  $("reportBtn")
    .onclick =
    openReport;
}

if (
  $("closeReportBtn")
) {

  $("closeReportBtn")
    .onclick =
    closeReport;
}

if (
  $("cancelReportBtn")
) {

  $("cancelReportBtn")
    .onclick =
    closeReport;
}

if (
  $("printReportBtn")
) {

  $("printReportBtn")
    .onclick =
    printReport;
}

if (
  $("exportReportBtn")
) {

  $("exportReportBtn")
    .onclick =
    exportReportExcel;
}

if (
  $("reportEventSearch")
) {

  $("reportEventSearch")
    .oninput =
    renderReportEvents;
}

if (
  $("reportOnlyAssigned")
) {

  $("reportOnlyAssigned")
    .onchange =
    renderReportEvents;
}

/* =========================================================
   FILTRI HOME
========================================================= */

if (
  $("viewFilter")
) {

  $("viewFilter")
    .onchange =
    renderEvents;
}

if (
  $("sortFilter")
) {

  $("sortFilter")
    .onchange =
    renderEvents;
}

$("eventSearch")
  .oninput =
  renderEvents;

$("statusFilter")
  .onchange =
  renderEvents;

/* =========================================================
   AVVIO
========================================================= */

loadFromServer();
