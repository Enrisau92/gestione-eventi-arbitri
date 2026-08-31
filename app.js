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

/* =========================================================
   API
========================================================= */

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

      reject(
        new Error("Impossibile contattare il database condiviso.")
      );
    };

    script.src = API_URL + "?" + query.toString();

    document.body.appendChild(script);
  });
}

/* =========================================================
   CARICAMENTO DATABASE
========================================================= */

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
        <strong>Errore di collegamento al database</strong>
        <br>
        ${escapeHtml(err.message)}
        <br><br>
        Ricarica la pagina e riprova.
      </div>
    `;
  }
}

/* =========================================================
   UTILITY
========================================================= */

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

  if (assigned === 0) {
    return "none";
  }

  if (assigned >= required) {
    return "complete";
  }

  return "partial";
}

function statusLabel(status) {
  if (status === "complete") {
    return "Completo";
  }

  if (status === "partial") {
    return "Da completare";
  }

  return "Nessun designato";
}

/* =========================================================
   LISTA EVENTI
========================================================= */

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

  /*
   * Vista standard:
   * solo eventi futuri.
   */

  if (viewFilter === "future") {
    list = list.filter(isFutureEvent);
  }

  if (viewFilter === "past") {
    list = list.filter(e => !isFutureEvent(e));
  }

  /*
   * Ricerca.
   */

  list = list.filter(e => {

    const text =
      `${e.name || ""} ${e.type || ""} ${e.place || ""}`
        .toLowerCase();

    const matchesSearch =
      !search ||
      text.includes(search);

    const matchesStatus =
      statusFilter === "all" ||
      statusOf(e) === statusFilter;

    return matchesSearch && matchesStatus;
  });

  /*
   * Ordinamento.
   */

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

    if (sortFilter === "desc") {
      return db - da;
    }

    return da - db;
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

      const assigned =
        new Set(
          (e.assigned || []).map(String)
        ).size;

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

          </div>

          <div class="event-stats">

            <div class="metric">
              <strong>
                ${required}
              </strong>
              <span>
                richiesti
              </span>
            </div>

            <div class="metric availability-metric ${
              available >= required
                ? "covered"
                : "not-covered"
            }">

              <strong>
                ${available}/${required}
              </strong>

              <span>
                disponibili
              </span>

              <div class="coverage-bar">
                <div
                  class="coverage-fill"
                  style="width:${coverage}%">
                </div>
              </div>

            </div>

            <div class="metric">
              <strong>
                ${assigned}
              </strong>
              <span>
                designati
              </span>
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

/* =========================================================
   DUPLICAZIONE EVENTO
========================================================= */

window.duplicateEvent = id => {

  const original =
    events.find(x => x.id === id);

  if (!original) return;

  const copy = {
    ...original,

    id: uid(),

    /*
     * Una duplicazione serve normalmente
     * per un'altra data/evento.
     *
     * Non copiamo disponibilità/designazioni.
     */

    available: [],
    assigned: [],
    manualArbiters: [],
    availabilityTimes: {}
  };

  events.push(copy);

  openEventForm(copy);
};

/* =========================================================
   FORM EVENTO
========================================================= */

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
   GESTISCI EVENTO
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

  /*
   * Compatibilità con disponibilità
   * precedenti che non avevano
   * availabilityTimes.
   */

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

  $("arbiterSearch").value =
    "";

  $("assignmentSearch").value =
    "";

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
   DISPONIBILITÀ EVENTO
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
   AZIONI DISPONIBILITÀ / DESIGNAZIONI
========================================================= */

window.toggleAvailable = id => {

  const key =
    String(id);

  if (
    tempAvailable.has(key)
  ) {

    tempAvailable.delete(key);

    tempAvailability.delete(key);

    /*
     * Un arbitro non disponibile
     * non può rimanere designato.
     */

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

    /*
     * È possibile designare
     * solamente un arbitro disponibile.
     */

    if (
      tempAvailable.has(key)
    ) {
      tempAssigned.add(key);
    }
  }

  renderDetail();
};

/* =========================================================
   RICERCA ARBITRI
========================================================= */

$("arbiterSearch").oninput =
  renderArbiters;

$("assignmentSearch").oninput =
  renderAssigned;

/* =========================================================
   TAB
========================================================= */

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

/* =========================================================
   AZZERA DISPONIBILITÀ
========================================================= */

$("clearAvailabilityBtn").onclick =
  () => {

    tempAvailable.clear();
    tempAvailability.clear();
    tempAssigned.clear();

    renderDetail();
  };

/* =========================================================
   CHIUSURA DETTAGLIO
========================================================= */

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
   SALVATAGGIO DETTAGLIO
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
   ELIMINAZIONE EVENTO
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
   GESTIONE TRASVERSALE DISPONIBILITÀ
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

  const map =
    new Map();

  /*
   * Partiamo dall'elenco ufficiale.
   */

  base.forEach(a => {

    map.set(
      String(a.id),
      {
        ...a,
        id: String(a.id)
      }
    );
  });

  /*
   * Aggiungiamo eventuali arbitri
   * manuali già presenti negli eventi.
   */

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

function wideAvailabilityFor(
  e,
  id
) {

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

  /*
   * Compatibilità con gli eventi
   * che hanno solo available[].
   */

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

  /*
   * Gestione interattiva dei controlli.
   */

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

        /*
         * Se tolgo la disponibilità,
         * tolgo anche l'eventuale
         * designazione.
         */

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
   NUOVA VISTA DISPONIBILITÀ
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

/* =========================================================
   FILTRI EVENTI
========================================================= */

if ($("viewFilter")) {

  $("viewFilter").onchange =
    renderEvents;
}

if ($("sortFilter")) {

  $("sortFilter").onchange =
    renderEvents;
}

$("eventSearch").oninput =
  renderEvents;

$("statusFilter").onchange =
  renderEvents;

/* =========================================================
   AVVIO
========================================================= */

loadFromServer();
