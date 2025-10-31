/* app.js definitivo — cabeceras en fila 2 (índice 1)
   Universidad EUNEIZ — Catálogo (salud.csv / tecnologias.csv)
   - Cabeceras (fila 2): Título, Autor/a, Editorial, Edición, Año, ISBN, Titulación, Materias/Temáticas, Signatura Topográfica, Resumen
   - Búsqueda parcial (sin acentos)
   - Parser robusto CSV (comillas, saltos de línea)
*/

let dataSalud = [];
let dataTecno = [];

/* ---------- Utilidades ---------- */
function normalizarTexto(texto) {
  if (texto === null || texto === undefined) return "";
  return String(texto).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function quitarBOM(s) {
  return s.replace(/^\uFEFF/, "");
}

/* Detecta delimitador (coma o punto y coma) */
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

/* Parser CSV robusto (maneja comillas, comillas escapadas, saltos de línea dentro de campos) */
function parseCSVRobusto(texto, delim) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < texto.length; i++) {
    const ch = texto[i];
    if (ch === '"') {
      // comilla escapada ""
      if (inQuotes && texto[i+1] === '"') {
        cell += '"';
        i++;
        continue;
      }
      inQuotes = !inQuotes;
      continue;
    }
    if (ch === delim && !inQuotes) {
      row.push(cell);
      cell = "";
      continue;
    }
    if ((ch === '\n' || ch === '\r') && !inQuotes) {
      // manejar CRLF
      if (ch === '\r' && texto[i+1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      continue;
    }
    cell += ch;
  }

  // último
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  // limpiar espacios
  return rows.map(r => r.map(c => (c === undefined || c === null) ? "" : String(c).trim()));
}

/* ---------- Cabecera fija en fila 2 (índice 1) ----------
   Si fila 2 no existe o está vacía, buscamos la primera fila con contenido y
   usamos la fila siguiente como cabecera (si existe). */
function obtenerIndiceCabeceraSegunRegla(rows) {
  if (!rows || rows.length === 0) return 0;
  // preferimos FILA 2 (índice 1) si tiene contenido
  if (rows.length > 1) {
    const r1 = rows[1];
    const hasContent = r1 && r1.some(c => (c ?? "").trim() !== "");
    if (hasContent) return 1;
  }
  // fallback: buscar primera fila no vacía, usar la siguiente si existe
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (r && r.some(c => (c ?? "").trim() !== "")) {
      if (i + 1 < rows.length) return i + 1;
      return i; // si no hay siguiente, usarla a ella
    }
  }
  return 0;
}

/* Mapeo explícito de cabeceras esperadas a claves */
function mapearCabeceraAClave(rawHeader) {
  if (!rawHeader && rawHeader !== 0) return "";
  const h = normalizarTexto(rawHeader).replace(/\s+/g, ' ');
  // comparar por fragmentos
  if (h.includes('titul')) return 'titulo';
  if (h.includes('autor')) return 'autor';
  if (h.includes('editorial')) return 'editorial';
  if (h.includes('edicion') || h.includes('edici')) return 'edicion';
  if (h.includes('año') || h.includes('ano') || h.includes('year')) return 'ano';
  if (h.includes('isbn')) return 'isbn';
  if (h.includes('titulacion') || h.includes('titulaci')) return 'titulacion';
  if (h.includes('mater') || h.includes('tema')) return 'tematicas';
  if (h.includes('signatura')) return 'signatura';
  if (h.includes('resumen') || h.includes('sinopsis') || h.includes('abstract')) return 'resumen';
  // fallback: clave a partir del nombre limpio
  return h.replace(/[^a-z0-9]+/g, '_') || 'col';
}

/* Convertir filas a objetos usando cabecera en fila 2 (índice 1) */
function filasAObjetosConCabecera2(rows) {
  if (!rows || rows.length === 0) return [];

  const headerIdx = obtenerIndiceCabeceraSegunRegla(rows);
  const headerRow = rows[headerIdx].map(h => (h === undefined || h === null) ? '' : String(h).trim());

  // Mapear cada columna a clave
  const claves = headerRow.map(h => mapearCabeceraAClave(h));

  // Si detectamos que las cabeceras no contienen 'titulo' intentamos buscar variantes en headerRow
  const hasTitulo = claves.some(c => c === 'titulo');
  if (!hasTitulo) {
    console.warn('Advertencia: no se detectó columna "título" en la fila de cabecera (fila index ' + headerIdx + '). Cabeceras:', headerRow);
  }

  const objetos = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r || r.every(c => (c ?? '').trim() === '')) continue; // fila vacía -> saltar
    const obj = {};
    for (let j = 0; j < claves.length; j++) {
      const k = claves[j] || `col${j}`;
      obj[k] = (r[j] ?? "").trim();
    }
    // si la fila tiene más columnas que cabeceras, concatenar extras en 'resumen' si existe, sino en 'otros'
    if (r.length > claves.length) {
      const extra = r.slice(claves.length).join(' ').trim();
      if (obj['resumen'] !== undefined) obj['resumen'] = ((obj['resumen'] || '') + ' ' + extra).trim();
      else obj['otros'] = extra;
    }
    objetos.push(obj);
  }

  console.log('Cabecera usada (índice):', headerIdx, ' -> ', headerRow);
  console.log('Claves mapeadas:', claves);
  console.log('Filas convertidas:', objetos.length);
  return objetos;
}

/* ---------- Lectura robusta de CSV y conversión ---------- */
async function leerCSVConCabecera2(ruta) {
  const resp = await fetch(ruta);
  if (!resp.ok) throw new Error(`No se pudo cargar ${ruta} (status ${resp.status})`);
  let texto = await resp.text();
  texto = quitarBOM(texto);
  const delim = detectarDelimitador(texto);
  const rows = parseCSVRobusto(texto, delim);
  return filasAObjetosConCabecera2(rows);
}

/* ---------- Cargar ambos ficheros ---------- */
async function cargarDatos() {
  try {
    const [saludObjs, tecObjs] = await Promise.all([
      leerCSVConCabecera2('salud.csv'),
      leerCSVConCabecera2('tecnologias.csv')
    ]);

    dataSalud = saludObjs.map(o => ({ ...o, _tipo: 'salud' }));
    dataTecno = tecObjs.map(o => ({ ...o, _tipo: 'tecnologias' }));

    console.log('Datos cargados: salud=', dataSalud.length, 'tecnologias=', dataTecno.length);
    mostrarResultados([...dataSalud, ...dataTecno]);
  } catch (err) {
    console.error('Error al cargar datos:', err);
    const noResults = document.getElementById('noResults');
    if (noResults) {
      noResults.hidden = false;
      noResults.textContent = 'Error al cargar catálogos. Revisa que los CSV existan en la misma carpeta y estén en UTF-8.';
    }
  }
}

/* ---------- Render y búsqueda ---------- */
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
  const noResults = document.getElementById('noResults');
  cont.innerHTML = '';
  if (!libros || libros.length === 0) {
    if (noResults) { noResults.hidden = false; noResults.textContent = 'No se han encontrado libros.'; }
    return;
  }
  if (noResults) noResults.hidden = true;

  libros.sort((a, b) => normalizarTexto(a.titulo || '').localeCompare(normalizarTexto(b.titulo || '')));

  for (const libro of libros) {
    const facultad = libro._tipo === 'salud' ? 'Ciencias de la Salud' : 'Nuevas Tecnologías Interactivas';
    const html = `
      <div class="book">
        <h3>${escapeHtml(libro.titulo || libro.title || 'Sin título')}</h3>
        <small><strong>Facultad:</strong> ${escapeHtml(facultad)}</small><br>
        <small><strong>Autor:</strong> ${escapeHtml(libro.autor || libro['Autor/a'] || '')}</small><br>
        <small><strong>Editorial:</strong> ${escapeHtml(libro.editorial || '')}</small><br>
        <small><strong>Edición:</strong> ${escapeHtml(libro.edicion || '')}</small><br>
        <small><strong>Año:</strong> ${escapeHtml(libro.ano || '')}</small><br>
        <small><strong>ISBN:</strong> ${escapeHtml(libro.isbn || '')}</small><br>
        ${ libro.titulacion ? `<small><strong>Titulación:</strong> ${escapeHtml(libro.titulacion)}</small><br>` : '' }
        <small><strong>Materias/Temáticas:</strong> ${escapeHtml(libro.tematicas || '')}</small><br>
        <small><strong>Signatura:</strong> ${escapeHtml(libro.signatura || '')}</small>
        ${ libro.resumen ? `<p>${escapeHtml(libro.resumen)}</p>` : '' }
      </div>
    `;
    cont.insertAdjacentHTML('beforeend', html);
  }
}

/* Búsqueda parcial sin acentos */
function buscarLibros() {
  const qraw = document.getElementById('searchInput').value || '';
  const q = normalizarTexto(qraw);
  const facultad = document.getElementById('facultySelect').value || 'all';
  let base;
  if (facultad === 'salud') base = dataSalud;
  else if (facultad === 'tecnologias') base = dataTecno;
  else base = [...dataSalud, ...dataTecno];

  if (!q) { mostrarResultados(base); return; }

  const resultados = base.filter(item => {
    const t = normalizarTexto(item.titulo || item.title || '');
    return t.includes(q);
  });

  mostrarResultados(resultados);
}

function mostrarTodos() {
  const facultad = document.getElementById('facultySelect').value || 'all';
  if (facultad === 'salud') mostrarResultados(dataSalud);
  else if (facultad === 'tecnologias') mostrarResultados(dataTecno);
  else mostrarResultados([...dataSalud, ...dataTecno]);
}

/* ---------- Eventos UI ---------- */
document.getElementById('searchBtn').addEventListener('click', buscarLibros);
document.getElementById('showAllBtn').addEventListener('click', mostrarTodos);
document.getElementById('searchInput').addEventListener('keydown', e => { if (e.key === 'Enter') buscarLibros(); });

/* ---------- Inicio ---------- */
cargarDatos();
