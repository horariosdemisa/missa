# Horarios de Misa

Página web gratuita para consultar horarios de misa, validados por la comunidad.

- Cualquiera puede buscar su parroquia o ciudad.
- Cada horario necesita **5 confirmaciones** para aparecer como **✓ Validado**; con menos se muestra **Pendiente por validación**.
- El botón **Actualizar horarios** permite proponer un horario nuevo, que queda pendiente hasta que la comunidad lo confirme.

## Tecnología

- Página estática (HTML, CSS y JavaScript) publicada con GitHub Pages.
- Base de datos gratuita en [Supabase](https://supabase.com). El esquema está en `supabase/schema.sql`.
- La configuración pública va en `config.js`. Si está vacía, la página funciona en modo demostración.

Hecho con amor para la gloria de Dios.

## Administración

`admin.html` es el panel privado (no aparece en buscadores). Se entra con una clave que se guarda cifrada en la base de datos.
Desde ahí se pueden editar iglesias, publicar horarios verificados, aprobar propuestas y ocultar contenido (nada se borra, se puede volver a mostrar).

## Moderación

El formulario público solo acepta horarios y datos de la iglesia (sin comentarios libres) y rechaza groserías,
tanto en la página (`filtro.js`) como en la base de datos (`_texto_limpio`).
