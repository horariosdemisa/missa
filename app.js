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
      async agregarIglesia(d, items) {
        const args = {
          p_nombre: d.nombre, p_estado: d.estado, p_ciudad: d.ciudad, p_direccion: d.direccion,
          p_facebook: d.facebook, p_items: items, p_autor: DISPOSITIVO,
        };
        if (d.lat != null) { args.p_lat = d.lat; args.p_lng = d.lng; }
        return ok(await sb.rpc("agregar_iglesia", args));
      },
      async actualizar(iglesiaId, items) {
        return ok(await sb.rpc("actualizar_horario", {
          p_iglesia: iglesiaId, p_items: items, p_autor: DISPOSITIVO,
        }));
      },
      async validar(propuestaId) {
        return ok(await sb.rpc("validar_horario", { p_propuesta: propuestaId, p_votante: DISPOSITIVO }));
      },
      async foto(iglesiaId) {
        const r = ok(await sb.from("iglesia_fotos").select("foto").eq("iglesia_id", iglesiaId).maybeSingle());
        return r?.foto || null;
      },
    };
  }

  // Modo demostración: datos de ejemplo guardados solo en este navegador
  function apiDemo() {
    const KEY = "missa_demo_v3";
    let db = store.get(KEY);
    if (!db) {
      const hace = d => new Date(Date.now() - d * 864e5).toISOString();
      const i1 = uuid(), i2 = uuid(), i3 = uuid();
      const m = (dia, hora, tipo = "Misa") => ({ dia, hora, tipo });
      db = {
        iglesias: [
          { id: i1, nombre: "Parroquia San José", estado: "Jalisco", ciudad: "Guadalajara", direccion: "Calle 10 #5-20", facebook: "", lat: 20.6767, lng: -103.3475 },
          { id: i2, nombre: "Catedral Nuestra Señora del Rosario", estado: "Jalisco", ciudad: "Zapopan", direccion: "Plaza principal", facebook: "", lat: 20.7214, lng: -103.3918, telefono: "33 3614 5504" },
          { id: i3, nombre: "Capilla Santa Teresita", estado: "Puebla", ciudad: "Puebla", direccion: "", facebook: "" },
        ],
        propuestas: [
          { id: uuid(), iglesia_id: i1, creado_en: hace(20), nota: "", votos: 7,
            items: [m(0,"07:00"), m(0,"09:00"), m(0,"12:00"), m(0,"18:00"), m(1,"18:30"), m(2,"18:30"), m(3,"18:30"), m(4,"18:30"), m(5,"18:30"), m(6,"17:00"), { dia: 6, hora: "16:00", fin: "17:30", tipo: "Confesiones" }, { dia: 3, hora: "17:00", fin: "18:30", tipo: "Confesiones" }] },
          { id: uuid(), iglesia_id: i1, creado_en: hace(1), nota: "Horario de diciembre", votos: 2,
            items: [m(0,"07:00"), m(0,"09:00"), m(0,"12:00"), m(0,"19:00"), m(1,"19:00"), m(2,"19:00"), m(3,"19:00"), m(4,"19:00"), m(5,"19:00"), m(6,"17:00")] },
          { id: uuid(), iglesia_id: i2, creado_en: hace(3), nota: "", votos: 5,
            items: [m(0,"08:00"), m(0,"11:00"), m(0,"19:00"), m(1,"07:00"), m(3,"07:00"), m(5,"07:00"), m(4,"20:00","Adoración"), ...[1,2,3,4,5].map(d => ({ dia: d, hora: "10:00", fin: "14:00", tipo: "Oficina" }))] },
          { id: uuid(), iglesia_id: i3, creado_en: hace(2), nota: "Tomado de su Facebook", votos: 1,
            items: [m(0,"10:00"), m(6,"18:00")] },
        ],
      };
      store.set(KEY, db);
    }
    const save = () => store.set(KEY, db);
    const nuevaProp = (iglesia_id, items) => {
      const p = { id: uuid(), iglesia_id, items, nota: "", votos: 1, creado_en: new Date().toISOString() };
      db.propuestas.unshift(p); guardarVoto(p.id); save(); return p.id;
    };
    return {
      async cargar() { return JSON.parse(JSON.stringify(db)); },
      async agregarIglesia(d, items) {
        const id = uuid(); db.iglesias.push({ id, ...d }); nuevaProp(id, items); return id;
      },
      async actualizar(iglesiaId, items) { return nuevaProp(iglesiaId, items); },
      async foto() { return null; },
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
      const vigente = props.find(validada) || null;   // última validada
      const ultima = props[0] || null;
      // Una propuesta más nueva que la validada queda "pendiente"
      const pendiente = ultima && (!vigente || ultima.creado_en > vigente.creado_en) ? ultima : null;
      return { ...ig, vigente, pendiente };
    });
  }

  const validada = p => p.aprobada || p.votos >= REQ;
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

  const esConf = i => i.tipo === "Confesiones";
  // Otros servicios con su propia sección
  const SERVICIOS = { "Adoración": "🙏 Adoración al Santísimo", "Oficina": "🏢 Oficina parroquial" };
  const esServ = i => Object.hasOwn(SERVICIOS, i.tipo);
  const esMisa = i => !esConf(i) && !esServ(i);
  const rango = i => i.fin ? `${hora12(i.hora)} a ${hora12(i.fin)}` : hora12(i.hora);

  // ---------- Próxima misa / confesión (con la hora de este dispositivo) ----------
  const minutos = h => { const [a, b] = h.split(":"); return +a * 60 + +b; };
  function proxima(items) {
    if (!items.length) return null;
    const ahora = new Date(), hoy = ahora.getDay(), m = ahora.getHours() * 60 + ahora.getMinutes();
    for (let k = 0; k < 8; k++) {
      const d = (hoy + k) % 7;
      const del = items.filter(i => +i.dia === d).sort((a, b) => a.hora.localeCompare(b.hora));
      for (const i of del) {
        if (k === 0 && i.fin && minutos(i.hora) <= m && m < minutos(i.fin)) return { i, ahora: true };
        if (k > 0 || minutos(i.hora) > m) {
          const falta = k * 1440 + minutos(i.hora) - m;
          return { i, k, falta };
        }
      }
    }
    return null;
  }
  function textoProxima(p) {
    if (!p) return "";
    if (p.ahora) return `<b>ahora</b>, hasta las ${hora12(p.i.fin)}`;
    const cuando = p.k === 0 ? "hoy" : p.k === 1 ? "mañana" : `el ${DIAS[+p.i.dia].toLowerCase()}`;
    const pronto = p.falta <= 90 ? ` <span class="pronto">en ${p.falta < 60 ? `${p.falta} min` : `1 h ${p.falta - 60 ? `${p.falta - 60} min` : ""}`.trim()}</span>` : "";
    return `<b>${cuando} ${hora12(p.i.hora)}</b>${pronto}`;
  }
  function lineaProxima(items) {
    const misa = proxima(items.filter(i => (i.tipo || "Misa") === "Misa"));
    const conf = proxima(items.filter(esConf));
    const partes = [];
    if (misa) partes.push(`<span>⏰ Próxima misa: ${textoProxima(misa)}</span>`);
    if (conf) partes.push(`<span>🕊️ Confesiones: ${textoProxima(conf)}</span>`);
    return partes.length ? `<p class="proxima">${partes.join("")}</p>` : "";
  }

  // ---------- Distancia y mapas ----------
  let POS = null; // { lat, lng } de la persona, solo si toca "Cerca de mí"
  const tieneUbic = ig => Number.isFinite(ig.lat) && Number.isFinite(ig.lng);
  function km(a, b) {
    const r = x => x * Math.PI / 180, R = 6371;
    const dLat = r(b.lat - a.lat), dLng = r(b.lng - a.lng);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }
  const textoKm = d => d < 1 ? `a ${Math.max(50, Math.round(d * 20) * 50)} m` : `a ${d < 10 ? d.toFixed(1) : Math.round(d)} km`;
  function urlMapa(ig) {
    const destino = tieneUbic(ig) ? `${ig.lat},${ig.lng}`
      : [ig.nombre, ig.direccion, ig.ciudad, ig.estado, "México"].filter(Boolean).join(", ");
    return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destino)}`;
  }

  // ---------- Compartir por WhatsApp ----------
  const URL_SITIO = `${location.origin}${location.pathname.replace(/index\.html$/, "")}`;
  const sinHtml = t => t.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
  function textoWhatsApp(ig) {
    const p = ig.vigente || ig.pendiente;
    const lineas = [`⛪ *${ig.nombre}* (${ig.ciudad})`];
    if (p) {
      const misa = proxima(p.items.filter(i => (i.tipo || "Misa") === "Misa"));
      const conf = proxima(p.items.filter(esConf));
      if (misa) lineas.push(`⏰ Próxima misa: ${sinHtml(textoProxima(misa))}`);
      if (conf) lineas.push(`🕊️ Confesiones: ${sinHtml(textoProxima(conf))}`);
    }
    lineas.push(`Todos los horarios: ${URL_SITIO}#iglesia-${ig.id}`);
    return lineas.join("\n");
  }
  const urlWhatsApp = ig => `https://wa.me/?text=${encodeURIComponent(textoWhatsApp(ig))}`;

  const CORTO = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
  // Opciones de varios días en el formulario
  const GRUPOS_DIAS = { todos: [0, 1, 2, 3, 4, 5, 6], ls: [1, 2, 3, 4, 5, 6], lv: [1, 2, 3, 4, 5] };
  const mismo = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

  // "Todos los días", "Lun a Sáb", "Dom, Mié"...
  function nombreDias(ds) {
    if (ds.length === 7) return "Todos los días";
    if (ds.length === 1) return DIAS[ds[0]];
    const tramos = [];
    for (const d of ds) {
      const t = tramos[tramos.length - 1];
      if (t && d === t[t.length - 1] + 1) t.push(d); else tramos.push([d]);
    }
    return tramos.map(t => t.length >= 3 ? `${CORTO[t[0]]} a ${CORTO[t[t.length - 1]]}` : t.map(d => CORTO[d]).join(", ")).join(", ");
  }

  // Junta los días que tienen exactamente los mismos horarios y los muestra en fila
  function filasHorario(items, soloHoy, conTipo) {
    const hoy = new Date().getDay();
    const dias = soloHoy ? [hoy] : ORDEN_DIAS;
    const grupos = [];
    for (const d of dias) {
      const del = items.filter(i => +i.dia === d).sort((a, b) => a.hora.localeCompare(b.hora));
      if (!del.length) continue;
      const chips = del.map(i =>
        `<span class="chip">${esc(rango(i))}${conTipo && i.tipo && i.tipo !== "Misa" ? ` <small>${esc(i.tipo)}</small>` : ""}</span>`).join("");
      const g = grupos.find(g => g.chips === chips);
      if (g) g.dias.push(d); else grupos.push({ dias: [d], chips });
    }
    return grupos.map(g => {
      const esHoy = g.dias.includes(hoy);
      return `<div class="grupo${esHoy ? " hoy" : ""}"><div class="dia">${esc(nombreDias(g.dias))}${esHoy ? " <small>(hoy)</small>" : ""}</div><div>${g.chips}</div></div>`;
    }).join("");
  }

  // Misas (y otras celebraciones) arriba; confesiones en su propia sección
  function tablaHorario(items, soloHoy) {
    const misas = filasHorario(items.filter(esMisa), soloHoy, true);
    const conf = filasHorario(items.filter(esConf), soloHoy, false);
    let html = misas ? `<h4 class="seccion">⛪ Misas</h4><div class="horario">${misas}</div>` : "";
    if (conf) html += `<h4 class="seccion">🕊️ Confesiones</h4><div class="horario conf">${conf}</div>`;
    for (const [tipo, titulo] of Object.entries(SERVICIOS)) {
      const f = filasHorario(items.filter(i => i.tipo === tipo), soloHoy, false);
      if (f) html += `<h4 class="seccion">${titulo}</h4><div class="horario serv">${f}</div>`;
    }
    return html || `<p class="muted">Sin horarios registrados${soloHoy ? " para hoy" : ""}.</p>`;
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
      cuerpo += lineaProxima(principal.items);
      cuerpo += tablaHorario(principal.items, soloHoy);
      if (vigente) {
        cuerpo += `<p class="meta">${vigente.aprobada ? "Verificado por la administración" : `Confirmado por ${vigente.votos} personas`} · actualizado ${fechaRel(vigente.creado_en)}${vigente.nota ? ` · ${esc(vigente.nota)}` : ""}</p>`;
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
    botones.push(`<a class="btn sec chico wa" href="${esc(urlWhatsApp(ig))}" target="_blank" rel="noopener">💬 WhatsApp</a>`);
    botones.push(`<button class="btn sec chico" data-compartir="${ig.id}">Compartir</button>`);

    const foto = ig.foto_actualizada
      ? `<div class="foto"><img data-foto="${ig.id}" alt="Foto de ${esc(ig.nombre)}" hidden></div>` : "";
    return `<article class="card" id="iglesia-${ig.id}">
      ${foto}
      <div class="cab"><h3>${esc(ig.nombre)}</h3>${sello}</div>
      <p class="lugar">${esc(ig.ciudad)}${ig.estado && ig.estado !== ig.ciudad ? `, ${esc(ig.estado)}` : ""}${ig.direccion ? ` · ${esc(ig.direccion)}` : ""}${fb}</p>
      <p class="lugar"><a class="mapa" href="${esc(urlMapa(ig))}" target="_blank" rel="noopener">📍 Cómo llegar</a>${ig.telefono ? ` · <a class="mapa" href="tel:${esc(ig.telefono.replace(/[^\d+]/g, ""))}">📞 ${esc(ig.telefono)}</a>` : ""}${POS && tieneUbic(ig) ? ` · <b>${textoKm(km(POS, ig))}</b>` : ""}</p>
      ${cuerpo}
      <div class="botones">${botones.join("")}</div>
    </article>`;
  }

  function render() {
    const q = sinAcentos($("#q").value.trim());
    const estado = $("#estado").value;
    const ciudad = $("#ciudad").value;
    const soloHoy = $("#soloHoy").checked;
    const hoy = new Date().getDay();
    let lista = IGLESIAS.filter(ig =>
      (!estado || ig.estado === estado) &&
      (!ciudad || ig.ciudad === ciudad) &&
      (!q || sinAcentos(`${ig.nombre} ${ig.ciudad} ${ig.estado} ${ig.direccion}`).includes(q)));
    if (soloHoy) lista = lista.filter(ig => (ig.vigente || ig.pendiente)?.items.some(i => +i.dia === hoy));
    if ($("#soloConf").checked) lista = lista.filter(ig => (ig.vigente || ig.pendiente)?.items.some(esConf));
    // Validadas primero, luego por nombre
    lista.sort((a, b) => (!!b.vigente - !!a.vigente) || a.nombre.localeCompare(b.nombre, "es"));
    // "Cerca de mí": primero las que tienen ubicación, de la más cercana a la más lejana
    if (POS) {
      const dist = ig => tieneUbic(ig) ? km(POS, ig) : Infinity;
      lista.sort((a, b) => (dist(a) - dist(b)) || 0);
    }

    $("#conteo").textContent = `${lista.length} ${lista.length === 1 ? "iglesia" : "iglesias"}`;
    $("#lista").innerHTML = lista.length
      ? lista.map(ig => tarjeta(ig, soloHoy)).join("")
      : `<div class="vacio">${IGLESIAS.length
          ? "No encontramos iglesias con esa búsqueda."
          : "Todavía no hay iglesias registradas."}<br><br>
          <button class="btn" data-agregar>+ Agregar una iglesia</button></div>`;
    cargarFotos();
  }

  // Fotos: se descargan solo cuando la tarjeta aparece en pantalla
  const FOTOS = new Map();
  const verFoto = async img => {
    const id = img.dataset.foto;
    try {
      if (!FOTOS.has(id)) FOTOS.set(id, api.foto(id));
      const src = await FOTOS.get(id);
      if (src) { img.src = src; img.hidden = false; } else img.parentElement.remove();
    } catch { FOTOS.delete(id); }
  };
  const obs = "IntersectionObserver" in window
    ? new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { obs.unobserve(e.target); verFoto(e.target); } }), { rootMargin: "300px" })
    : null;
  function cargarFotos() {
    for (const img of document.querySelectorAll("img[data-foto]")) obs ? obs.observe(img) : verFoto(img);
  }

  const ESTADOS = Object.keys(window.MEXICO || {});
  const opciones = (lista, actual) => lista.map(c => `<option ${c === actual ? "selected" : ""}>${esc(c)}</option>`).join("");
  const ordenar = arr => [...new Set(arr)].filter(Boolean).sort((a, b) => a.localeCompare(b, "es"));

  // Filtros: estados y ciudades donde ya hay iglesias registradas
  function llenarFiltros() {
    const selE = $("#estado"), selC = $("#ciudad");
    const conIglesias = ordenar(IGLESIAS.map(i => i.estado));
    selE.innerHTML = `<option value="">Todo México</option>` + opciones(conIglesias, selE.value);
    const ciudades = ordenar(IGLESIAS.filter(i => !selE.value || i.estado === selE.value).map(i => i.ciudad));
    if (!ciudades.includes(selC.value)) selC.value = "";
    selC.innerHTML = `<option value="">Todas las ciudades</option>` + opciones(ciudades, selC.value);
  }

  // Formulario: ciudades sugeridas según el estado elegido
  function sugerirCiudades() {
    const est = form.elements.estado.value;
    const lista = ordenar([...(window.MEXICO?.[est] || []), ...IGLESIAS.filter(i => i.estado === est).map(i => i.ciudad)]);
    $("#ciudadesList").innerHTML = lista.map(c => `<option value="${esc(c)}">`).join("");
  }

  async function recargar() {
    try {
      IGLESIAS = armar(await api.cargar());
      llenarFiltros();
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

  // Para editar: convierte el horario guardado en filas, juntando "Todos los días", "Lun a Vie"...
  function filasParaForm(items) {
    const porHora = new Map();
    for (const i of items) {
      const k = `${i.hora}|${i.fin || ""}|${i.tipo || "Misa"}`;
      if (!porHora.has(k)) porHora.set(k, { ...i, dias: [] });
      porHora.get(k).dias.push(+i.dia);
    }
    const filas = [];
    for (const g of porHora.values()) {
      const ds = [...new Set(g.dias)].sort((a, b) => a - b);
      const grupo = Object.keys(GRUPOS_DIAS).find(n => mismo(GRUPOS_DIAS[n], ds));
      if (grupo) filas.push({ ...g, dia: grupo });
      else ds.forEach(d => filas.push({ ...g, dia: String(d) }));
    }
    const ordenDia = d => d in GRUPOS_DIAS ? -1 : +d;
    return filas.sort((a, b) => ordenDia(a.dia) - ordenDia(b.dia) || a.hora.localeCompare(b.hora));
  }

  function agregarFila(item) {
    const f = $("#tplFila").content.firstElementChild.cloneNode(true);
    if (item) { f.querySelector("[name=dia]").value = item.dia; f.querySelector("[name=hora]").value = item.hora; f.querySelector("[name=tipo]").value = item.tipo || "Misa"; }
    else { f.querySelector("[name=dia]").value = "0"; }
    $("#filas").appendChild(f);
  }

  function agregarFilaConf(item) {
    const f = $("#tplFilaConf").content.firstElementChild.cloneNode(true);
    f.querySelector("[name=dia]").value = item ? item.dia : "todos";
    if (item) { f.querySelector("[name=hora]").value = item.hora; f.querySelector("[name=fin]").value = item.fin || ""; }
    $("#filasConf").appendChild(f);
  }

  function agregarFilaServ(item) {
    const f = $("#tplFilaServ").content.firstElementChild.cloneNode(true);
    f.querySelector("[name=dia]").value = item ? item.dia : "lv";
    if (item) { f.querySelector("[name=tipo]").value = item.tipo; f.querySelector("[name=hora]").value = item.hora; f.querySelector("[name=fin]").value = item.fin || ""; }
    $("#filasServ").appendChild(f);
  }

  function abrirForm(m) {
    modo = m;
    form.reset(); $("#filas").innerHTML = ""; $("#filasConf").innerHTML = ""; $("#filasServ").innerHTML = ""; $("#formError").hidden = true;
    const nueva = m.tipo === "nueva";
    form.elements.estado.innerHTML = `<option value="">Elige el estado…</option>` + opciones(ESTADOS, $("#estado").value);
    sugerirCiudades();
    $("#formTitulo").textContent = nueva ? "Agregar iglesia" : "Actualizar horarios";
    $("#formIglesia").textContent = nueva ? "Escribe los datos, el horario de misa y, si lo sabes, el de confesiones." : `${m.iglesia.nombre} · ${m.iglesia.ciudad}. Corrige el horario y envíalo; quedará pendiente hasta que ${REQ} personas lo confirmen.`;
    $("#camposIglesia").hidden = !nueva;
    for (const el of $("#camposIglesia").querySelectorAll("input")) el.required = ["nombre", "ciudad"].includes(el.name) && nueva;
    form.elements.estado.required = nueva;
    const base = !nueva && (m.iglesia.pendiente || m.iglesia.vigente);
    const actuales = base ? base.items : [];
    const misas = filasParaForm(actuales.filter(esMisa)), conf = filasParaForm(actuales.filter(esConf));
    filasParaForm(actuales.filter(esServ)).forEach(agregarFilaServ);
    misas.length ? misas.forEach(agregarFila) : agregarFila();
    conf.forEach(agregarFilaConf);
    dlg.showModal();
  }

  // Una fila con "Todos los días" o "Lunes a viernes" se guarda como un horario por cada día
  const diasDe = v => GRUPOS_DIAS[v] || [+v];

  function leerItems() {
    const misas = [...$("#filas").children].flatMap(f => diasDe(f.querySelector("[name=dia]").value).map(dia => ({
      dia,
      hora: f.querySelector("[name=hora]").value,
      tipo: f.querySelector("[name=tipo]").value,
    })));
    const conf = [...$("#filasConf").children, ...$("#filasServ").children].flatMap(f => {
      const hora = f.querySelector("[name=hora]").value, fin = f.querySelector("[name=fin]").value;
      const tipo = f.querySelector("[name=tipo]")?.value || "Confesiones";
      return diasDe(f.querySelector("[name=dia]").value).map(dia => {
        const i = { dia, hora, tipo };
        if (fin && fin > hora) i.fin = fin;
        return i;
      });
    });
    const items = [...misas, ...conf].filter(i => i.hora);
    const vistos = new Set();
    return items.filter(i => { const k = `${i.dia}|${i.hora}|${i.tipo}`; if (vistos.has(k)) return false; vistos.add(k); return true; });
  }

  form.addEventListener("submit", async ev => {
    ev.preventDefault();
    const items = leerItems();
    const err = $("#formError");
    if (!items.length) { err.textContent = "Agrega al menos un horario."; err.hidden = false; return; }
    if (items.length > 80) { err.textContent = "Son demasiados horarios. Junta los que se repiten con “Todos los días” o “Lunes a viernes”."; err.hidden = false; return; }
    const fd = new FormData(form);
    const btn = $("#btnEnviar"); btn.disabled = true; btn.textContent = "Enviando…";
    try {
      let id;
      if (modo.tipo === "nueva") {
        const d = { nombre: fd.get("nombre").trim(), estado: fd.get("estado"), ciudad: fd.get("ciudad").trim(), direccion: fd.get("direccion").trim(), facebook: fd.get("facebook").trim() };
        if (d.nombre.length < 3 || d.ciudad.length < 2 || !d.estado) throw new Error("Escribe el nombre, el estado y la ciudad.");
        if (!window.textoLimpio(`${d.nombre} ${d.ciudad} ${d.direccion}`)) throw new Error("Por favor escribe solo los datos de la iglesia, sin palabras ofensivas.");
        if (form.elements.aqui?.checked) {
          btn.textContent = "Obteniendo ubicación…";
          try { Object.assign(d, await miUbicacion()); } catch (e) { throw new Error(`${e.message} O desmarca “Estoy en la iglesia”.`); }
          btn.textContent = "Enviando…";
        }
        if (d.facebook && !/^https?:\/\/([a-z0-9-]+\.)*(facebook\.com|fb\.com|fb\.me)\//i.test(d.facebook)) throw new Error("El enlace debe ser de Facebook (https://facebook.com/…).");
        id = await api.agregarIglesia(d, items);
      } else {
        const pid = await api.actualizar(modo.iglesia.id, items);
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
  $("#btnFilaConf").addEventListener("click", () => agregarFilaConf());
  $("#btnFilaServ").addEventListener("click", () => agregarFilaServ());
  $("#btnCancelar").addEventListener("click", () => dlg.close());
  form.addEventListener("click", e => {
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
  $("#estado").addEventListener("change", () => { llenarFiltros(); render(); });
  $("#ciudad").addEventListener("change", render);
  form.elements.estado.addEventListener("change", sugerirCiudades);
  $("#soloHoy").addEventListener("change", render);
  $("#soloConf").addEventListener("change", render);

  const miUbicacion = () => new Promise((ok, mal) => {
    if (!navigator.geolocation) return mal(new Error("Tu navegador no permite usar la ubicación."));
    navigator.geolocation.getCurrentPosition(
      p => ok({ lat: p.coords.latitude, lng: p.coords.longitude }),
      e => mal(new Error(e.code === 1 ? "Para ver las iglesias cercanas, permite usar tu ubicación." : "No pudimos obtener tu ubicación. Intenta de nuevo.")),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 120000 });
  });

  $("#btnCerca").addEventListener("click", async () => {
    const b = $("#btnCerca");
    if (POS) { POS = null; b.classList.remove("activo"); b.textContent = "📍 Cerca de mí"; render(); return; }
    b.disabled = true; b.textContent = "Buscando tu ubicación…";
    try {
      POS = await miUbicacion();
      // quitar filtros de lugar para ver todas las cercanas
      $("#estado").value = ""; $("#estado").dispatchEvent(new Event("change"));
      $("#q").value = "";
      b.classList.add("activo"); b.textContent = "📍 Cerca de mí ✕";
      render();
      const n = IGLESIAS.filter(tieneUbic).length;
      toast(n ? "Las iglesias más cercanas aparecen primero." : "Todavía ninguna iglesia tiene ubicación guardada. Pronto aparecerán por distancia.");
      $("#lista").scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (e) {
      b.textContent = "📍 Cerca de mí"; toast(e.message);
    } finally { b.disabled = false; }
  });

  // Mantener "Próxima misa" al día si la página queda abierta
  setInterval(() => { if (!dlg.open) render(); }, 5 * 60 * 1000);

  // ---------- Instalar como app ----------
  if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(() => {});
  const instalada = matchMedia("(display-mode: standalone)").matches || navigator.standalone;
  const esIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
  let avisoInstalar = null;
  window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); avisoInstalar = e; $("#btnInstalar").hidden = false; });
  window.addEventListener("appinstalled", () => { $("#btnInstalar").hidden = true; toast("¡Listo! Ya tienes Misa en tu celular."); });
  if (esIos && !instalada) $("#btnInstalar").hidden = false;
  $("#btnInstalar").addEventListener("click", async () => {
    if (avisoInstalar) { avisoInstalar.prompt(); await avisoInstalar.userChoice; avisoInstalar = null; $("#btnInstalar").hidden = true; }
    else if (esIos) $("#dlgIos").showModal();
  });
  $("#btnWaPagina").addEventListener("click", () => {
    const t = `⛪ Horarios de misa y confesiones en México, confirmados por la comunidad. Gratis para todos:\n${URL_SITIO}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(t)}`, "_blank", "noopener");
  });

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
