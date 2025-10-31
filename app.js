/* app.js - versión final y robusta
   - Detecta cabecera (busca columna tipo "título")
   - Soporta distintas órdenes de columnas entre salud y tecnologias
   - Parser CSV robusto (comillas, saltos de línea, delimitador , o ;)
   - Búsqueda parcial sin acentos
*/

let dataSalud = [];
let dataTecno = [];

/* ---------------- utilidades ---------------- */
function normalizarTexto(texto) {
  if (texto === null || texto === undefined) return "";
  return String(texto)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function limpiarHeaderParaClave(h) {
  return normalizarTexto(String(h))
    .replace(/[^a-z0-9]+/g, ' ') // quitar símbolos
    .trim();
}

/* ---------------- detectar delimitador ---------------- */
function detectarDelimitador(texto) {
  const sample = texto.slice(0, 2000);
  let inQuotes = false, commas = 0, semis = 0;
  for (let i = 0; i < sample.length; i++) {
    const ch = sample[i];
    if (ch === '"') {
      if (sample[i+1] === '"') { i++; continue; }
      inQuotes = !inQuotes;
    } else if (!inQuotes) {
      if (ch === ',') commas++;
      else if (ch === ';') semis++;
    }
  }
  return semis > commas ? ';' : ',';
}

/* ---------------- parser CSV robusto ---------------- */
function parseCSVRobusto(texto, delim) {
  const rows = [];
  let row = [];
  let cell = '';
  let inQuotes = false;
  for (let i = 0; i < texto.length; i++) {
    const ch = texto[i];
    if (ch === '"') {
      if (inQuotes && texto[i+1] === '"') { cell += '"'; i++; continue; }
      inQuotes = !inQuotes;
      continue;
    }
    if (ch === delim && !inQuotes) {
      row.push(cell);
      cell = '';
      continue;
    }
    if ((ch === '\n' || ch === '\r') && !inQuotes) {
      if (ch === '\r' && texto[i+1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      continue;
    }
    cell += ch;
  }
  // añadir último
  if (cell !== '' || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  // limpiar celdas
  return rows.map(r => r.map(c => (c ?? '').trim()));
}

/* ---------------- encontrar fila de cabecera ----------------
   Busca en las primeras N filas una fila que contenga una celda con "titul" (título).
   Si no encuentra, usa la primera fila no vacía como cabecera.
*/
function encontrarIndiceCabecera(rows, maxBuscar = 6) {
  const top = Math.min(rows.length, maxBuscar);
  for (let i = 0; i < top; i++) {
    const row = rows[i];
    if (!row) continue;
    for (const cell of row) {
      if (!cell) continue;
      const n = normalizarTexto(cell);
      if (n.includes('titul') || n.includes('titulo') || n.includes('title')) {
        return i;
      }
    }
  }
  // fallback: primera fila con contenido
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (row && row.some(c => (c ?? '').trim() !== '')) return i;
  }
  return 0;
}

/* ---------------- heurística mapeo columna -> clave ----------------
   Para cada cabecera normalizada, asignamos la clave interna:
   - contiene 'titul' -> 'titulo'
   - contiene 'autor' -> 'autor'
   - 'editorial' -> 'editorial'
   - 'edicion' o 'edición' -> 'edicion'
   - 'ano' o 'año' -> 'ano'
   - 'isbn' -> 'isbn'
   - 'titul' -> 'titulacion' (si aplica)
   - 'mater' -> 'tematicas'
   - 'signatur' -> 'signatura'
   - 'resum' -> 'resumen'
   Si no encaja, usamos la propia cabecera simplificada.
*/
function mapClaveDesdeHeader(header) {
  const h = limpiarHeaderParaClave(header);
  if (!h) return '';
  if (h.includes('titul')) return 'titulo';
  if (h.includes('autor')) return 'autor';
  if (h.includes('editorial')) return 'editorial';
  if (h.includes('edicion') || h.includes('edición')) return 'edicion';
  if (h.includes('ano') || h.includes('año') || h.includes('year')) return 'ano';
  if (h.includes('isbn')) return 'isbn';
  if (h.includes('titulacion') || h.includes('titulaci')) return 'titulacion';
  if (h.includes('mater')) return 'tematicas';
  if (h.includes('tematic') || h.includes('temática')) return 'tematicas';
  if (h.includes('signatur')) return 'signatura';
  if (h.includes('resum')) return 'resumen';
  // fallback: la propia cabecera limpia (sin espacios)
  return h.replace(/\s+/g, '_');
}

/* ---------------- convertir filas a objetos ---------------- */
function filasAObjetosConCabecera(rows) {
  if (!rows || rows.length === 0) return [];
  const idxHeader = encontrarIndiceCabecera(rows, 8);
  const headerRow = rows[idxHeader].map(h => (h ?? '').trim());
  const headerKeys = headerRow.map(h => mapClaveDesdeHeader(h));
  // merge siguientes filas
  const objects = [];
  for (let i = idxHeader + 1; i < rows.length; i++) {
    const r = rows[i];
    // saltar fila vacía
    if (!r || r.every(c => (c ?? '').trim() === '')) continue;
    const obj = {};
    for (let j = 0; j < headerKeys.length; j++) {
      const key = headerKeys[j] || `col${j}`;
      obj[key] = (r[j] ?? '').trim();
    }
    // si la fila tiene más columnas que header, añadimos al resumen (si existe) o a 'otros'
    if (r.length > headerKeys.length) {
      const extra = r.slice(headerKeys.length).join(' ').trim();
      if (obj['resumen'] !== undefined) obj['resumen'] = (obj['resumen'] + ' ' + extra).trim();
      else obj['otros'] = extra;
    }
    objects.push(obj);
  }
  console.log('Cabecera escogida (index):', idxHeader, headerRow);
  console.log('Claves mapeadas:', headerKeys);
  return objects;
}

/* ---------------- leer CSV robusto y convertir ---------------- */
async function leerCSVAuto(ruta) {
  const res = await fetch(ruta);
  if (!res.ok) throw new Error(`No se pudo cargar ${ruta} (status ${res.status})`);
  let text = await res.text();
  // eliminar BOM
  text = text.replace(/^\uFEFF/, '');
  const delim = detectarDelimitador(text);
  const rows = parseCSVRobusto(text, delim);
  const objects = filasAObjetosConCabecera(rows);
  return objects;
}

/* ---------------- carga de ambos ficheros ---------------- */
async function cargarDatos() {
  try {
    const [saludRows, tecRows] = await Promise.all([
      leerCSVAuto('salud.csv'),
      leerCSVAuto('tecnologias.csv')
    ]);
    // asignar _tipo para distinguir
    dataSalud = saludRows.map(r => ({ ...r, _tipo: 'salud' }));
    dataTecno = tecRows.map(r => ({ ...r, _tipo: 'tecnologias' }));
    console.log('Libros salud:', dataSalud.length, 'Libros tec:', dataTecno.length);
    mostrarResultados([...dataSalud, ...dataTecno]);
  } catch (err) {
    console.error('Error en cargarDatos:', err);
    const noRes = document.getElementById('noResults');
    if (noRes) { noRes.hidden = false; noRes.textContent = 'Error cargando archivos CSV (revisa rutas y codificación UTF-8).'; }
  }
}

/* ---------------- render y búsqueda ---------------- */
function escapeHtml(s) {
  if (s === null || s === undefined) return '';
  return String(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function mostrarResultados(libros) {
  const cont = document.getElementById('resultsList');
  const noRes = document.getElementById('noResults');
  cont.innerHTML = '';
  if (!libros || libros.length === 0) {
    if (noRes) { noRes.hidden = false; noRes.textContent = 'No se han encontrado libros.'; }
    return;
  }
  if (noRes) noRes.hidden = true;

  // ordenar por título si existe
  libros.sort((a,b) => normalizarTexto(a.titulo || '').localeCompare(normalizarTexto(b.titulo || '')) );

  for (const libro of libros) {
    const facultad = libro._tipo === 'salud' ? 'Ciencias de la Salud' : 'Nuevas Tecnologías Interactivas';
    const html = `
      <div class="book">
        <h3>${escapeHtml(libro.titulo || libro.title || 'Sin título')}</h3>
        <small><strong>Facultad:</strong> ${escapeHtml(facultad)}</small><br>
        <small><strong>Autor:</strong> ${escapeHtml(libro.autor || '')}</small><br>
        <small><strong>Editorial:</strong> ${escapeHtml(libro.editorial || '')}</small><br>
        <small><strong>Edición:</strong> ${escapeHtml(libro.edicion || '')}</small><br>
        <small><strong>Año:</strong> ${escapeHtml(libro.ano || '')}</small><br>
        <small><strong>ISBN:</strong> ${escapeHtml(libro.isbn || '')}</small><br>
        ${ (libro.titulacion) ? `<small><strong>Titulación:</strong> ${escapeHtml(libro.titulacion)}</small><br>` : '' }
        <small><strong>Materias/Temáticas:</strong> ${escapeHtml(libro.tematicas || '')}</small><br>
        <small><strong>Signatura:</strong> ${escapeHtml(libro.signatura || '')}</small>
        ${ (libro.resumen) ? `<p>${escapeHtml(libro.resumen)}</p>` : '' }
      </div>
    `;
    cont.insertAdjacentHTML('beforeend', html);
  }
}

function buscarLibros() {
  const qraw = document.getElementById('searchInput').value || '';
  const q = normalizarTexto(qraw);
  const facultad = document.getElementById('facultySelect').value || 'all';
  let base = facultad === 'salud' ? dataSalud : facultad === 'tecnologias' ? dataTecno : [...dataSalud, ...dataTecno];
  if (!q) { mostrarResultados(base); return; }
  const res = base.filter(item => normalizarTexto(item.titulo || '').includes(q));
  mostrarResultados(res);
}

function mostrarTodos() {
  const facultad = document.getElementById('facultySelect').value || 'all';
  if (facultad === 'salud') mostrarResultados(dataSalud);
  else if (facultad === 'tecnologias') mostrarResultados(dataTecno);
  else mostrarResultados([...dataSalud, ...dataTecno]);
}

/* eventos UI */
document.getElementById('searchBtn').addEventListener('click', buscarLibros);
document.getElementById('showAllBtn').addEventListener('click', mostrarTodos);
document.getElementById('searchInput').addEventListener('keydown', e => { if (e.key === 'Enter') buscarLibros(); });

/* iniciar carga */
cargarDatos();
