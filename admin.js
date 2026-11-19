(() => {
  "use strict";
  const CFG = window.MISSA_CONFIG;
  const REQ = CFG.VALIDACIONES_REQUERIDAS || 5;
  const DIAS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
  const $ = (s, el = document) => el.querySelector(s);
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const sb = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_KEY, { auth: { persistSession: false } });
  const ok = ({ data, error }) => { if (error) throw new Error(error.message); return data; };
  const ESTADOS = Object.keys(window.MEXICO || {});

  let CLAVE = "";
  try { CLAVE = sessionStorage.getItem("missa_admin") || ""; } catch {}
  let IGLESIAS = [], PROPS = [];
  let abierta = null; // id de la iglesia que se está editando

  function toast(msg) {
    const t = $("#toast"); t.textContent = msg; t.hidden = false;
    clearTimeout(toast._t); toast._t = setTimeout(() => (t.hidden = true), 3000);
  }
  const rpc = async (fn, args) => ok(await sb.rpc(fn, { p_clave: CLAVE, ...args }));

  async function entrar(clave) {
    CLAVE = clave;
    const valida = await rpc("admin_entrar", {});
    if (!valida) throw new Error("Clave incorrecta");
    try { sessionStorage.setItem("missa_admin", clave); } catch {}
    $("#login").hidden = true; $("#panel").hidden = false;
    await cargar();
  }

  async function cargar() {
    const d = await rpc("admin_datos", {});
    IGLESIAS = d.iglesias; PROPS = d.propuestas;
    render();
  }

  const resumen = items => [...items].sort((a, b) => a.dia - b.dia || a.hora.localeCompare(b.hora))
    .map(i => `${DIAS[i.dia]} ${i.hora}${i.tipo !== "Misa" ? ` (${esc(i.tipo)})` : ""}`).join(" · ");

  function fila(item) {
    const f = $("#tplFila").content.firstElementChild.cloneNode(true);
    if (item) { f.querySelector("[name=dia]").value = item.dia; f.querySelector("[name=hora]").value = item.hora; f.querySelector("[name=tipo]").value = item.tipo || "Misa"; }
    return f;
  }

  function formIglesia(ig) {
    const est = ig?.estado || "";
    return `<div class="grid2">
      <label>Nombre<input name="nombre" value="${esc(ig?.nombre)}" required></label>
      <label>Estado<select name="estado" required><option value="">Elige…</option>${ESTADOS.map(e => `<option ${e === est ? "selected" : ""}>${esc(e)}</option>`).join("")}</select></label>
      <label>Ciudad<input name="ciudad" value="${esc(ig?.ciudad)}" required></label>
      <label>Dirección<input name="direccion" value="${esc(ig?.direccion)}"></label>
    </div>
    <label>Facebook<input name="facebook" value="${esc(ig?.facebook)}"></label>`;
  }

  function editorHorario(items) {
    return `<details ${items ? "" : "open"}><summary>${items ? "Publicar horario verificado" : "Horario"}</summary>
      <div class="filas"></div>
      <button type="button" class="btn sec chico" data-accion="fila">+ Agregar horario</button>
      <label>Nota (solo la administración puede escribirla)<input name="nota" maxlength="300"></label>
      ${items ? `<button type="button" class="btn" data-accion="publicar">Publicar como verificado</button>` : ""}
    </details>`;
  }

  function tarjeta(ig) {
    const props = PROPS.filter(p => p.iglesia_id === ig.id);
    const abiertaAqui = abierta === ig.id;
    const lista = props.map(p => `<div class="prop" style="${p.oculta ? "opacity:.55" : ""}">
        <p class="meta">${new Date(p.creado_en).toLocaleString("es-MX")} · ${p.votos} de ${REQ} confirmaciones
          ${p.aprobada ? '<span class="sello ok">Aprobado por ti</span>' : p.votos >= REQ ? '<span class="sello ok">Validado</span>' : '<span class="sello pend">Pendiente</span>'}
          ${p.oculta ? ' <span class="sello pend">Oculto</span>' : ""}${p.nota ? ` · ${esc(p.nota)}` : ""}</p>
        <div>${resumen(p.items)}</div>
        <div class="botones">
          <button class="btn chico ${p.aprobada ? "sec" : ""}" data-aprobar="${p.id}" data-valor="${!p.aprobada}">${p.aprobada ? "Quitar aprobación" : "Aprobar"}</button>
          <button class="btn sec chico" data-editar-desde="${p.id}">Usar como base</button>
          <button class="btn sec chico ${p.oculta ? "" : "peligro"}" data-ocultar-prop="${p.id}" data-valor="${!p.oculta}">${p.oculta ? "Volver a mostrar" : "Ocultar"}</button>
        </div>
      </div>`).join("");
    return `<article class="admin-card" data-iglesia="${ig.id}">
      <h3>${esc(ig.nombre)}${ig.oculta ? ' <span class="sello pend">Oculta al público</span>' : ""}</h3>
      <p class="meta">${esc(ig.ciudad)}, ${esc(ig.estado || "sin estado")} · ${props.length} horario(s)</p>
      ${abiertaAqui ? `<form data-form="${ig.id}">${formIglesia(ig)}
          <div class="botones"><button class="btn" type="submit">Guardar datos</button>
          <button type="button" class="btn sec ${ig.oculta ? "" : "peligro"}" data-ocultar-iglesia="${ig.id}" data-valor="${!ig.oculta}">${ig.oculta ? "Volver a mostrar iglesia" : "Ocultar iglesia"}</button></div>
          ${editorHorario(true)}
        </form>${lista || '<p class="muted">Sin horarios.</p>'}`
        : `<button class="btn sec chico" data-abrir="${ig.id}">Editar</button>`}
    </article>`;
  }

  function render() {
    const q = $("#q").value.trim().toLowerCase();
    const lista = IGLESIAS.filter(ig => !q || `${ig.nombre} ${ig.ciudad} ${ig.estado}`.toLowerCase().includes(q));
    let html = "";
    if (abierta === "nueva") {
      html += `<article class="admin-card"><h3>Nueva iglesia</h3><form data-form="nueva">${formIglesia(null)}${editorHorario(null)}
        <div class="botones"><button class="btn" type="submit">Guardar y publicar</button>
        <button type="button" class="btn sec" data-cerrar>Cancelar</button></div></form></article>`;
    }
    html += lista.map(tarjeta).join("") || '<p class="muted">No hay iglesias.</p>';
    $("#lista").innerHTML = html;
    // horario inicial en los editores
    for (const cont of document.querySelectorAll(".filas")) if (!cont.children.length) cont.appendChild(fila());
  }

  const leerItems = form => [...form.querySelectorAll(".fila")].map(f => ({
    dia: +f.querySelector("[name=dia]").value, hora: f.querySelector("[name=hora]").value, tipo: f.querySelector("[name=tipo]").value,
  })).filter(i => i.hora);

  async function accion(fn, msg) {
    try { await fn(); toast(msg); await cargar(); } catch (e) { toast(e.message); }
  }

  document.addEventListener("click", e => {
    const b = e.target.closest("button"); if (!b) return;
    const form = b.closest("form");
    if (b.dataset.abrir) { abierta = b.dataset.abrir; render(); }
    else if ("cerrar" in b.dataset) { abierta = null; render(); }
    else if (b.dataset.accion === "fila") form.querySelector(".filas").appendChild(fila());
    else if (b.classList.contains("quitar")) b.closest(".fila").remove();
    else if (b.dataset.accion === "publicar") {
      const items = leerItems(form);
      if (!items.length) return toast("Agrega al menos un horario");
      accion(() => rpc("admin_publicar_horario", { p_iglesia: form.dataset.form, p_items: items, p_nota: form.elements.nota.value }), "Horario publicado como verificado");
    }
    else if (b.dataset.aprobar) accion(() => rpc("admin_aprobar_propuesta", { p_id: b.dataset.aprobar, p_aprobada: b.dataset.valor === "true" }), "Listo");
    else if (b.dataset.ocultarProp) accion(() => rpc("admin_ocultar_propuesta", { p_id: b.dataset.ocultarProp, p_oculta: b.dataset.valor === "true" }), b.dataset.valor === "true" ? "Horario ocultado" : "Horario visible otra vez");
    else if (b.dataset.ocultarIglesia) accion(() => rpc("admin_ocultar_iglesia", { p_id: b.dataset.ocultarIglesia, p_oculta: b.dataset.valor === "true" }), b.dataset.valor === "true" ? "Iglesia ocultada" : "Iglesia visible otra vez");
    else if (b.dataset.editarDesde) {
      const p = PROPS.find(x => x.id === b.dataset.editarDesde);
      const card = b.closest("[data-iglesia]"), cont = card.querySelector(".filas");
      cont.innerHTML = ""; [...p.items].sort((a, c) => a.dia - c.dia || a.hora.localeCompare(c.hora)).forEach(i => cont.appendChild(fila(i)));
      card.querySelector("details").open = true; card.querySelector("details").scrollIntoView({ behavior: "smooth" });
    }
  });

  document.addEventListener("submit", async e => {
    const form = e.target.closest("[data-form]"); if (!form) return;
    e.preventDefault();
    const f = form.elements, id = form.dataset.form === "nueva" ? null : form.dataset.form;
    const datos = { p_id: id, p_nombre: f.nombre.value, p_estado: f.estado.value, p_ciudad: f.ciudad.value, p_direccion: f.direccion.value, p_facebook: f.facebook.value };
    if (!id) {
      const items = leerItems(form);
      if (!items.length) return toast("Agrega al menos un horario");
      await accion(async () => {
        const nuevo = await rpc("admin_guardar_iglesia", datos);
        await rpc("admin_publicar_horario", { p_iglesia: nuevo, p_items: items, p_nota: f.nota.value });
        abierta = nuevo;
      }, "Iglesia agregada");
    } else {
      await accion(() => rpc("admin_guardar_iglesia", datos), "Datos guardados");
    }
  });

  $("#login").addEventListener("submit", async e => {
    e.preventDefault();
    try { await entrar($("#clave").value); } catch (er) { const p = $("#loginError"); p.textContent = er.message; p.hidden = false; }
  });
  $("#formClave").addEventListener("submit", async e => {
    e.preventDefault();
    const nueva = e.target.elements.nueva.value;
    try {
      await rpc("admin_cambiar_clave", { p_nueva: nueva });
      CLAVE = nueva; try { sessionStorage.setItem("missa_admin", nueva); } catch {}
      e.target.reset(); toast("Clave cambiada");
    } catch (er) { toast(er.message); }
  });
  $("#btnNueva").addEventListener("click", () => { abierta = "nueva"; render(); window.scrollTo({ top: 0, behavior: "smooth" }); });
  $("#btnSalir").addEventListener("click", () => { try { sessionStorage.removeItem("missa_admin"); } catch {} location.reload(); });
  let tq; $("#q").addEventListener("input", () => { clearTimeout(tq); tq = setTimeout(render, 150); });

  if (CLAVE) entrar(CLAVE).catch(() => { CLAVE = ""; });
})();
