(() => {
  "use strict";

  const CFG = window.MISSA_CONFIG || {};
  const REQ = CFG.VALIDACIONES_REQUERIDAS || 5;
  const DIAS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
  const ORDEN_DIAS = [0, 1, 2, 3, 4, 5, 6];
  const $ = (s, el = document) => el.querySelector(s);

  // ---------- Almacenamiento local seguro ----------
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  };
  const uuid = () => (crypto.randomUUID ? crypto.randomUUID()
    : "10000000-1000-4000-8000-100000000000".replace(/[018]/g, c =>
        (c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))).toString(16)));

  // Identificador anónimo de este dispositivo (un voto por dispositivo)
  let DISPOSITIVO = store.get("missa_dispositivo");
  if (!DISPOSITIVO) { DISPOSITIVO = uuid(); store.set("missa_dispositivo", DISPOSITIVO); }
  const misVotos = new Set(store.get("missa_votos", []));
  const guardarVoto = id => { misVotos.add(id); store.set("missa_votos", [...misVotos]); };

  // ---------- Capa de datos ----------
  const usarSupabase = !!(CFG.SUPABASE_URL && CFG.SUPABASE_KEY && window.supabase);
  const api = usarSupabase ? apiSupabase() : apiDemo();

  function apiSupabase() {
    const sb = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_KEY, {
      auth: { persistSession: false },
    });
    const ok = ({ data, error }) => { if (error) throw new Error(error.message); return data; };
    return {
      async cargar() {
        const [iglesias, propuestas] = await Promise.all([
          sb.from("iglesias").select("*").order("nombre").limit(5000).then(ok),
          sb.from("propuestas_con_votos").select("*").order("creado_en", { ascending: false }).limit(20000).then(ok),
        ]);
        return { iglesias, propuestas };
      },
      async agregarIglesia(d, items, nota) {
        return ok(await sb.rpc("agregar_iglesia", {
          p_nombre: d.nombre, p_ciudad: d.ciudad, p_direccion: d.direccion, p_facebook: d.facebook,
          p_items: items, p_nota: nota, p_autor: DISPOSITIVO,
        }));
      },
      async actualizar(iglesiaId, items, nota) {
        return ok(await sb.rpc("actualizar_horario", {
          p_iglesia: iglesiaId, p_items: items, p_nota: nota, p_autor: DISPOSITIVO,
        }));
      },
      async validar(propuestaId) {
        return ok(await sb.rpc("validar_horario", { p_propuesta: propuestaId, p_votante: DISPOSITIVO }));
      },
    };
  }

  // Modo demostración: datos de ejemplo guardados solo en este navegador
  function apiDemo() {
    const KEY = "missa_demo_v1";
    let db = store.get(KEY);
    if (!db) {
      const hace = d => new Date(Date.now() - d * 864e5).toISOString();
      const i1 = uuid(), i2 = uuid(), i3 = uuid();
      const m = (dia, hora, tipo = "Misa") => ({ dia, hora, tipo });
      db = {
        iglesias: [
          { id: i1, nombre: "Parroquia San José", ciudad: "Ciudad de ejemplo", direccion: "Calle 10 #5-20", facebook: "" },
          { id: i2, nombre: "Catedral Nuestra Señora del Rosario", ciudad: "Ciudad de ejemplo", direccion: "Plaza principal", facebook: "" },
          { id: i3, nombre: "Capilla Santa Teresita", ciudad: "Otra ciudad", direccion: "", facebook: "" },
        ],
        propuestas: [
          { id: uuid(), iglesia_id: i1, creado_en: hace(20), nota: "", votos: 7,
            items: [m(0,"07:00"), m(0,"09:00"), m(0,"12:00"), m(0,"18:00"), m(1,"18:30"), m(2,"18:30"), m(3,"18:30"), m(4,"18:30"), m(5,"18:30"), m(6,"17:00"), m(6,"16:00","Confesiones")] },
          { id: uuid(), iglesia_id: i1, creado_en: hace(1), nota: "Horario de diciembre", votos: 2,
            items: [m(0,"07:00"), m(0,"09:00"), m(0,"12:00"), m(0,"19:00"), m(1,"19:00"), m(2,"19:00"), m(3,"19:00"), m(4,"19:00"), m(5,"19:00"), m(6,"17:00")] },
          { id: uuid(), iglesia_id: i2, creado_en: hace(3), nota: "", votos: 5,
            items: [m(0,"08:00"), m(0,"11:00"), m(0,"19:00"), m(1,"07:00"), m(3,"07:00"), m(5,"07:00"), m(4,"20:00","Adoración")] },
          { id: uuid(), iglesia_id: i3, creado_en: hace(2), nota: "Tomado de su Facebook", votos: 1,
            items: [m(0,"10:00"), m(6,"18:00")] },
        ],
      };
      store.set(KEY, db);
    }
    const save = () => store.set(KEY, db);
    const nuevaProp = (iglesia_id, items, nota) => {
      const p = { id: uuid(), iglesia_id, items, nota, votos: 1, creado_en: new Date().toISOString() };
      db.propuestas.unshift(p); guardarVoto(p.id); save(); return p.id;
    };
    return {
      async cargar() { return JSON.parse(JSON.stringify(db)); },
      async agregarIglesia(d, items, nota) {
        const id = uuid(); db.iglesias.push({ id, ...d }); nuevaProp(id, items, nota); return id;
      },
      async actualizar(iglesiaId, items, nota) { return nuevaProp(iglesiaId, items, nota); },
      async validar(pid) {
        const p = db.propuestas.find(x => x.id === pid);
        if (p && !misVotos.has(pid)) { p.votos++; save(); }
        return p ? p.votos : 0;
      },
    };
  }

  // ---------- Estado y lógica ----------
  let IGLESIAS = [];

  function armar({ iglesias, propuestas }) {
    const porIglesia = new Map();
    for (const p of propuestas) {
      if (!porIglesia.has(p.iglesia_id)) porIglesia.set(p.iglesia_id, []);
      porIglesia.get(p.iglesia_id).push(p);
    }
    return iglesias.map(ig => {
      const props = (porIglesia.get(ig.id) || []).sort((a, b) => b.creado_en.localeCompare(a.creado_en));
      const vigente = props.find(p => p.votos >= REQ) || null;   // última validada
      const ultima = props[0] || null;
      // Una propuesta más nueva que la validada queda "pendiente"
      const pendiente = ultima && (!vigente || ultima.creado_en > vigente.creado_en) ? ultima : null;
      return { ...ig, vigente, pendiente };
    });
  }

  const sinAcentos = s => (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

  // ---------- Render ----------
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  function hora12(h) {
    const [H, M] = h.split(":").map(Number);
    const s = H >= 12 ? "p. m." : "a. m.";
    return `${((H + 11) % 12) + 1}:${String(M).padStart(2, "0")} ${s}`;
  }

  function fechaRel(iso) {
    const d = (Date.now() - new Date(iso)) / 864e5;
    if (d < 1) return "hoy";
    if (d < 2) return "ayer";
    if (d < 30) return `hace ${Math.floor(d)} días`;
    return new Date(iso).toLocaleDateString("es", { day: "numeric", month: "short", year: "numeric" });
  }

  function tablaHorario(items, soloHoy) {
    const hoy = new Date().getDay();
    const dias = soloHoy ? [hoy] : ORDEN_DIAS;
    const filas = dias.map(d => {
      const del = items.filter(i => +i.dia === d).sort((a, b) => a.hora.localeCompare(b.hora));
      if (!del.length) return "";
      const chips = del.map(i =>
        `<span class="chip">${esc(hora12(i.hora))}${i.tipo && i.tipo !== "Misa" ? ` <small>${esc(i.tipo)}</small>` : ""}</span>`).join("");
      return `<tr class="${d === hoy ? "hoy" : ""}"><th>${DIAS[d]}${d === hoy ? " (hoy)" : ""}</th><td>${chips}</td></tr>`;
    }).join("");
    return filas ? `<table class="horario">${filas}</table>` : `<p class="muted">Sin horarios registrados${soloHoy ? " para hoy" : ""}.</p>`;
  }

  function progreso(p) {
    const n = Math.min(p.votos, REQ);
    return `<div class="progreso"><div class="barrita"><span style="width:${(n / REQ) * 100}%"></span></div>
      ${p.votos} de ${REQ} confirmaciones</div>`;
  }

  function botonConfirmar(p) {
    const ya = misVotos.has(p.id);
    return `<button class="btn ${ya ? "hecho" : ""}" data-validar="${p.id}" ${ya ? "disabled" : ""}>
      ${ya ? "✓ Ya confirmaste" : "Confirmar horario"}</button>`;
  }

  function tarjeta(ig, soloHoy) {
    const { vigente, pendiente } = ig;
    const principal = vigente || pendiente;
    const sello = vigente
      ? `<span class="sello ok">✓ Validado</span>`
      : `<span class="sello pend">Pendiente por validación</span>`;
    const fb = ig.facebook && /^https?:\/\//i.test(ig.facebook)
      ? ` · <a href="${esc(ig.facebook)}" target="_blank" rel="noopener nofollow">Facebook</a>` : "";

    let cuerpo = "";
    if (principal) {
      cuerpo += tablaHorario(principal.items, soloHoy);
      if (vigente) {
        cuerpo += `<p class="meta">Confirmado por ${vigente.votos} personas · actualizado ${fechaRel(vigente.creado_en)}${vigente.nota ? ` · ${esc(vigente.nota)}` : ""}</p>`;
      } else {
        cuerpo += progreso(pendiente);
        cuerpo += `<p class="meta">Enviado ${fechaRel(pendiente.creado_en)}${pendiente.nota ? ` · ${esc(pendiente.nota)}` : ""}. ¿Es correcto? Confírmalo.</p>`;
      }
    }
    if (vigente && pendiente) {
      cuerpo += `<div class="pendiente-nueva">
        <h4>Nuevo horario propuesto <span class="sello pend">Pendiente por validación</span></h4>
        ${tablaHorario(pendiente.items, soloHoy)}
        ${progreso(pendiente)}
        <p class="meta">Enviado ${fechaRel(pendiente.creado_en)}${pendiente.nota ? ` · ${esc(pendiente.nota)}` : ""}</p>
        <div class="botones">${botonConfirmar(pendiente)}</div>
      </div>`;
    }
    const botones = [];
    if (!vigente && pendiente) botones.push(botonConfirmar(pendiente));
    botones.push(`<button class="btn sec" data-actualizar="${ig.id}">Actualizar horarios</button>`);
    botones.push(`<button class="btn sec chico" data-compartir="${ig.id}">Compartir</button>`);

    return `<article class="card" id="iglesia-${ig.id}">
      <div class="cab"><h3>${esc(ig.nombre)}</h3>${sello}</div>
      <p class="lugar">${esc(ig.ciudad)}${ig.direccion ? ` · ${esc(ig.direccion)}` : ""}${fb}</p>
      ${cuerpo}
      <div class="botones">${botones.join("")}</div>
    </article>`;
  }

  function render() {
    const q = sinAcentos($("#q").value.trim());
    const ciudad = $("#ciudad").value;
    const soloHoy = $("#soloHoy").checked;
    const hoy = new Date().getDay();
    let lista = IGLESIAS.filter(ig =>
      (!ciudad || ig.ciudad === ciudad) &&
      (!q || sinAcentos(`${ig.nombre} ${ig.ciudad} ${ig.direccion}`).includes(q)));
    if (soloHoy) lista = lista.filter(ig => (ig.vigente || ig.pendiente)?.items.some(i => +i.dia === hoy));
    // Validadas primero, luego por nombre
    lista.sort((a, b) => (!!b.vigente - !!a.vigente) || a.nombre.localeCompare(b.nombre, "es"));

    $("#conteo").textContent = `${lista.length} ${lista.length === 1 ? "iglesia" : "iglesias"}`;
    $("#lista").innerHTML = lista.length
      ? lista.map(ig => tarjeta(ig, soloHoy)).join("")
      : `<div class="vacio">${IGLESIAS.length
          ? "No encontramos iglesias con esa búsqueda."
          : "Todavía no hay iglesias registradas."}<br><br>
          <button class="btn" data-agregar>+ Agregar una iglesia</button></div>`;
  }

  function llenarCiudades() {
    const ciudades = [...new Set(IGLESIAS.map(i => i.ciudad))].sort((a, b) => a.localeCompare(b, "es"));
    const sel = $("#ciudad"), actual = sel.value;
    sel.innerHTML = `<option value="">Todas las ciudades</option>` +
      ciudades.map(c => `<option ${c === actual ? "selected" : ""}>${esc(c)}</option>`).join("");
    $("#ciudadesList").innerHTML = ciudades.map(c => `<option value="${esc(c)}">`).join("");
  }

  async function recargar() {
    try {
      IGLESIAS = armar(await api.cargar());
      llenarCiudades();
      render();
    } catch (e) {
      console.error(e);
      $("#lista").innerHTML = `<div class="vacio">No pudimos cargar los horarios. Revisa tu conexión e intenta de nuevo.</div>`;
    }
  }

  function toast(msg) {
    const t = $("#toast"); t.textContent = msg; t.hidden = false;
    clearTimeout(toast._t); toast._t = setTimeout(() => (t.hidden = true), 3200);
  }

  // ---------- Formulario ----------
  const dlg = $("#dlgForm"), form = $("#form");
  let modo = null; // { tipo: "nueva" } | { tipo: "actualizar", iglesia }

  function agregarFila(item) {
    const f = $("#tplFila").content.firstElementChild.cloneNode(true);
    if (item) { f.querySelector("[name=dia]").value = item.dia; f.querySelector("[name=hora]").value = item.hora; f.querySelector("[name=tipo]").value = item.tipo || "Misa"; }
    else { f.querySelector("[name=dia]").value = "0"; }
    $("#filas").appendChild(f);
  }

  function abrirForm(m) {
    modo = m;
    form.reset(); $("#filas").innerHTML = ""; $("#formError").hidden = true;
    const nueva = m.tipo === "nueva";
    $("#formTitulo").textContent = nueva ? "Agregar iglesia" : "Actualizar horarios";
    $("#formIglesia").textContent = nueva ? "Escribe los datos y el horario de misa." : `${m.iglesia.nombre} · ${m.iglesia.ciudad}. Corrige el horario y envíalo; quedará pendiente hasta que ${REQ} personas lo confirmen.`;
    $("#camposIglesia").hidden = !nueva;
    for (const el of $("#camposIglesia").querySelectorAll("input")) el.required = ["nombre", "ciudad"].includes(el.name) && nueva;
    const base = !nueva && (m.iglesia.pendiente || m.iglesia.vigente);
    if (base) [...base.items].sort((a, b) => a.dia - b.dia || a.hora.localeCompare(b.hora)).forEach(agregarFila);
    else agregarFila();
    dlg.showModal();
  }

  function leerItems() {
    const items = [...$("#filas").children].map(f => ({
      dia: +f.querySelector("[name=dia]").value,
      hora: f.querySelector("[name=hora]").value,
      tipo: f.querySelector("[name=tipo]").value,
    })).filter(i => i.hora);
    const vistos = new Set();
    return items.filter(i => { const k = `${i.dia}|${i.hora}|${i.tipo}`; if (vistos.has(k)) return false; vistos.add(k); return true; });
  }

  form.addEventListener("submit", async ev => {
    ev.preventDefault();
    const items = leerItems();
    const err = $("#formError");
    if (!items.length) { err.textContent = "Agrega al menos un horario."; err.hidden = false; return; }
    const fd = new FormData(form);
    const btn = $("#btnEnviar"); btn.disabled = true; btn.textContent = "Enviando…";
    try {
      let id;
      if (modo.tipo === "nueva") {
        const d = { nombre: fd.get("nombre").trim(), ciudad: fd.get("ciudad").trim(), direccion: fd.get("direccion").trim(), facebook: fd.get("facebook").trim() };
        if (d.nombre.length < 3 || d.ciudad.length < 2) throw new Error("Escribe el nombre y la ciudad.");
        id = await api.agregarIglesia(d, items, fd.get("nota"));
      } else {
        const pid = await api.actualizar(modo.iglesia.id, items, fd.get("nota"));
        if (pid) guardarVoto(pid);
        id = modo.iglesia.id;
      }
      dlg.close();
      await recargar();
      if (modo.tipo === "nueva") {
        // marcar como votada la propuesta inicial
        const ig = IGLESIAS.find(i => i.id === id);
        if (ig?.pendiente) guardarVoto(ig.pendiente.id);
        render();
      }
      toast("¡Gracias! El horario quedó pendiente por validación.");
      document.getElementById(`iglesia-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (e) {
      err.textContent = e.message || "No se pudo enviar. Intenta de nuevo."; err.hidden = false;
    } finally {
      btn.disabled = false; btn.textContent = "Enviar";
    }
  });

  $("#btnFila").addEventListener("click", () => agregarFila());
  $("#btnCancelar").addEventListener("click", () => dlg.close());
  $("#filas").addEventListener("click", e => {
    if (e.target.closest(".quitar")) e.target.closest(".fila").remove();
  });

  // ---------- Eventos de la lista ----------
  document.addEventListener("click", async e => {
    const b = e.target.closest("button");
    if (!b) return;
    if (b.dataset.validar) {
      const id = b.dataset.validar;
      b.disabled = true;
      try {
        const votos = await api.validar(id);
        guardarVoto(id);
        toast(votos >= REQ ? "¡Gracias! Este horario ya está validado ✓" : `¡Gracias por confirmar! (${votos} de ${REQ})`);
        await recargar();
      } catch (er) { b.disabled = false; toast("No se pudo confirmar. Intenta de nuevo."); }
    } else if (b.dataset.actualizar) {
      const ig = IGLESIAS.find(i => i.id === b.dataset.actualizar);
      if (ig) abrirForm({ tipo: "actualizar", iglesia: ig });
    } else if (b.dataset.compartir) {
      const ig = IGLESIAS.find(i => i.id === b.dataset.compartir);
      const url = `${location.origin}${location.pathname}#iglesia-${ig.id}`;
      const data = { title: `Horarios de misa · ${ig.nombre}`, text: `Horarios de misa de ${ig.nombre} (${ig.ciudad})`, url };
      try {
        if (navigator.share) await navigator.share(data);
        else { await navigator.clipboard.writeText(url); toast("Enlace copiado"); }
      } catch {}
    } else if (b.id === "btnAgregar" || "agregar" in b.dataset) {
      abrirForm({ tipo: "nueva" });
    }
  });

  let tq;
  $("#q").addEventListener("input", () => { clearTimeout(tq); tq = setTimeout(render, 120); });
  $("#ciudad").addEventListener("change", render);
  $("#soloHoy").addEventListener("change", render);

  // ---------- Inicio ----------
  $("#nReq").textContent = REQ;
  if (!usarSupabase) {
    const a = $("#aviso"); a.hidden = false;
    a.textContent = "Modo demostración: los datos son de ejemplo y se guardan solo en este dispositivo.";
  }
  if (CFG.REPO_URL) $("#repoLink").href = CFG.REPO_URL;
  $("#lista").innerHTML = `<div class="vacio">Cargando horarios…</div>`;
  recargar().then(() => {
    if (location.hash.startsWith("#iglesia-")) {
      const el = document.getElementById(location.hash.slice(1));
      if (el) { el.scrollIntoView({ block: "start" }); el.style.outline = "2px solid var(--oro)"; }
    }
  });
})();
