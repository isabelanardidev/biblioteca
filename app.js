/* app.js (versión robusta para CSV con comillas, saltos de línea y delimitador variable)
   - Asume que los ficheros son salud.csv y tecnologias.csv
   - Cabeceras reales en la "fila 2" (segunda fila válida)
   - Normaliza cabeceras y permite búsqueda parcial por título (sin acentos)
*/

let dataSalud = [];
let dataTecno = [];

/* ---------- Utilidades ---------- */
function normalizarTexto(texto) {
  if (!texto && texto !== 0) return "";
  return String(texto)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/* Detecta el delimitador (',' o ';') analizando las primeras líneas fuera de comillas */
function detectarDelimitador(texto) {
  // Miramos las primeras 2000 chars para decidir
  const sample = texto.slice(0, 2000);
  let inQuotes = false, commas = 0, semis = 0;
  for (let i = 0; i < sample.length; i++) {
    const ch = sample[i];
    if (ch === '"') {
      // si hay doble comilla, se considera escape, avanzamos uno (se queda inQuotes igual)
      if (sample[i + 1] === '"') { i++; continue; }
      inQuotes = !inQuotes;
    } else if (!inQuotes) {
      if (ch === ',') commas++;
      else if (ch === ';') semis++;
    }
  }
  // Si hay más ; que , presumimos ; como delimitador
  return semis > commas ? ';' : ',';
}

/* Parser CSV robusto (maneja comillas dobles, comillas escapadas, y saltos de línea dentro de campos) */
function parseCSVRobusto(texto, delim) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < texto.length; i++) {
    const ch = texto[i];

    // Manejo de comillas
    if (ch === '"') {
      // Si estamos dentro de comillas y la siguiente también es comilla -> comilla escapada
      if (inQuotes && texto[i + 1] === '"') {
        cell += '"';
        i++; // saltar la comilla escapada
        continue;
      }
      // Alterna el estado de inQuotes
      inQuotes = !inQuotes;
      continue;
    }

    // Si es delimitador y no estamos dentro de comillas => fin de celda
    if (ch === delim && !inQuotes) {
      row.push(cell);
      cell = "";
      continue;
    }

    // Si es salto de línea (LF) y no estamos dentro de comillas => fin de fila
    // También manejamos CRLF: si hay \r\n, lo detectamos por el \n; si solo \r, lo aceptamos
    if ((ch === '\n' || ch === '\r') && !inQuotes) {
      // Si es \r\n saltamos el \n adicional
      if (ch === '\r' && texto[i + 1] === '\n') { /* consume \r y \n en dos pasos */ }
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";

      // Si es \r\n avanzar un paso extra para saltar el \n
      if (ch === '\r' && texto[i + 1] === '\n') i++;
      continue;
    }

    // Caracter normal -> añadir a la celda
    cell += ch;
  }

  // Añadir última celda/row si hay datos
  if (inQuotes) {
    // Quedan comillas sin cerrar: aún así intentamos cerrar con lo que hay
    // (no lanzamos excepción para ser tolerantes)
    // console.warn("CSV: campo entrecomillado sin cerrar");
  }
  // Si hay contenido en cell o row incompleta, añadir
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  // Trim de cada celda y normalización ligera (quitar espacios redundantes)
  return rows.map(r => r.map(c => (c === undefined || c === null) ? "" : c.trim()));
}

/* Encuentra la primera fila no vacía y devuelve el índice de la cabecera según la regla: cabecera = primeraNoVacia + 1 (fila 2) */
function indiceCabeceraSegunRegla(rows) {
  let firstNonEmpty = -1;
  for (let i = 0; i < rows.length; i++) {
    const hasContent = rows[i].some(cell => cell !== null && String(cell).trim() !== "");
    if (hasContent) { firstNonEmpty = i; break; }
  }
  if (firstNonEmpty === -1) return 0;
  // Intentamos colocar cabecera en la siguiente fila
  let headerIndex = firstNonEmpty + 1;
  // si no existe esa fila o está vacía, fallback a firstNonEmpty
  if (!rows[headerIndex] || rows[headerIndex].every(c => c.trim() === "")) {
    headerIndex = firstNonEmpty;
  }
  return headerIndex;
}

/* Normaliza un nombre de cabecera para mapear a claves canónicas */
function normalizarCabecera(h) {
  if (!h && h !== 0) return "";
  return String(h)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // quitar acentos
    .replace(/[^a-z0-9]+/g, " ")     // quitar caracteres extra
    .trim();
}

/* Dada una fila de cabeceras, devuelve un array de claves canónicas por columna */
function mapearCabecerasALabels(headerRow) {
  // Definimos posibles variantes y la clave final que usaremos internamente
  const mapping = {
    titulo: ["titulo", "título", "title"],
    autor: ["autor", "autor a", "autor/a", "autores", "author"],
    editorial: ["editorial", "publisher"],
    edicion: ["edicion", "edición", "edition"],
    ano: ["ano", "año", "year"],
    isbn: ["isbn"],
    titulacion: ["titulacion", "titulación"],
    tematicas: ["materias tematicas", "materias", "tematicas", "temática", "tematica", "materias tematicas", "temas", "tematicas"],
    signatura: ["signatura topografica", "signatura topografica", "signatura", "signatura topográfica"],
    resumen: ["resumen", "sinopsis", "abstract"]
  };

  // Crear array labels por posición
  const labels = headerRow.map(h => {
    const norm = normalizarCabecera(h);
    for (const [key, variants] of Object.entries(mapping)) {
      for (const v of variants) {
        if (norm === v || norm.includes(v)) return key;
      }
    }
    // si no coincide con nada conocido -> usar el propio nombre normalizado como fallback
    return norm || "col";
  });

  return labels;
}

/* Convierte filas en objetos usando la cabecera detectada (fila 2 según regla) */
function filasAObjetos(rows) {
  if (!rows || rows.length === 0) return [];

  const headerIdx = indiceCabeceraSegunRegla(rows);
  const headerRow = rows[headerIdx] || [];

  const labels = mapearCabecerasALabels(headerRow);

  const books = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i];
    // saltar filas totalmente vacías
    const allEmpty = r.every(c => c === null || c === undefined || String(c).trim() === "");
    if (allEmpty) continue;

    const obj = {};
    for (let j = 0; j < labels.length; j++) {
      const key = labels[j] || (`col${j}`);
      obj[key] = (r[j] !== undefined && r[j] !== null) ? String(r[j]).trim() : "";
    }

    // en caso de que la fila tenga más columnas que la cabecera, concatenarlas en la última columna 'resumen' si existe
    if (r.length > labels.length) {
      const extra = r.slice(labels.length).join(" ").trim();
      if (obj["resumen"] !== undefined) obj["resumen"] = (obj["resumen"] + " " + extra).trim();
      else obj["otros"] = extra;
    }

    // Agregamos campo 'tituloDisplay' para buscar con la clave original si existe
    // (muchas plantillas usan "Título" con mayúscula; nosotros ya mapeamos a 'titulo')
    books.push(obj);
  }

  return books;
}

/* ---------- Lectura de CSV con todas las garantías ---------- */
async function leerCSVRobusto(ruta) {
  const resp = await fetch(ruta);
  if (!resp.ok) throw new Error(`No se pudo cargar ${ruta} (status ${resp.status})`);
  const textoRaw = await resp.text();

  // Eliminar BOM si existe
  const texto = textoRaw.replace(/^\uFEFF/, "");

  // Detectar delimitador
  const delim = detectarDelimitador(texto);

  // Parse robusto
  const rows = parseCSVRobusto(texto, delim);

  // Convertir a objetos
  const objects = filasAObjetos(rows);
  return objects;
}

/* ---------- Cargar datos (salud + tecnologias) ---------- */
async function cargarDatos() {
  try {
    const [salud, tec] = await Promise.all([
      leerCSVRobusto('salud.csv'),
      leerCSVRobusto('tecnologias.csv')
    ]);
    dataSalud = salud.map(b => ({ ...b, _faculty: 'salud' }));
    dataTecno = tec.map(b => ({ ...b, _faculty: 'tecnologias' }));

    console.log('Datos cargados: salud:', dataSalud.length, 'tecnologias:', dataTecno.length);
    mostrarResultados([...dataSalud, ...dataTecno]);
  } catch (err) {
    console.error('Error cargando datos:', err);
    const noResults = document.getElementById('noResults');
    if (noResults) {
      noResults.hidden = false;
      noResults.textContent = 'Error al cargar los catálogos. Revisa los ficheros CSV y su codificación (UTF-8).';
    }
  }
}

/* ---------- Render y búsqueda (búsqueda parcial, sin acentos) ---------- */
function mostrarResultados(libros) {
  const cont = document.getElementById('resultsList');
  const noResults = document.getElementById('noResults');
  cont.innerHTML = '';

  if (!libros || libros.length === 0) {
    if (noResults) noResults.hidden = false;
    return;
  }
  if (noResults) noResults.hidden = true;

  // ordenar por título si existe
  libros.sort((a, b) => {
    const ta = normalizarTexto(a.titulo || a.title || '');
    const tb = normalizarTexto(b.titulo || b.title || '');
    return ta.localeCompare(tb, 'es', { sensitivity: 'base' });
  });

  for (const libro of libros) {
    const title = libro.titulo || libro.title || libro.col0 || 'Sin título';
    const autor = libro.autor || libro.col1 || 'Desconocido';
    const editorial = libro.editorial || libro.col2 || '';
    const edicion = libro.edicion || libro.edicion || '';
    const ano = libro.ano || libro.year || '';
    const isbn = libro.isbn || '';
    const titulacion = libro.titulacion || '';
    const tematica = libro.tematicas || libro.tematica || '';
    const signatura = libro.signatura || '';
    const resumen = libro.resumen || libro.otros || '';

    const div = document.createElement('div');
    div.className = 'book';
    div.innerHTML = `
      <h3>${escapeHtml(title)}</h3>
      <small><strong>Autor:</strong> ${escapeHtml(autor)}</small><br>
      <small><strong>Editorial:</strong> ${escapeHtml(editorial)}</small><br>
      <small><strong>Edición:</strong> ${escapeHtml(edicion)}</small><br>
      <small><strong>Año:</strong> ${escapeHtml(ano)}</small><br>
      <small><strong>ISBN:</strong> ${escapeHtml(isbn)}</small><br>
      <small><strong>Titulación / Temática:</strong> ${escapeHtml(titulacion)} / ${escapeHtml(tematica)}</small><br>
      <small><strong>Signatura:</strong> ${escapeHtml(signatura)}</small>
      <p>${escapeHtml(resumen)}</p>
    `;
    cont.appendChild(div);
  }
}

/* Escape básico para evitar inyecciones (aunque estamos en cliente) */
function escapeHtml(str) {
  if (!str && str !== 0) return '';
  return String(str)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/* Búsqueda parcial por título (sin acentos) */
function buscarLibros() {
  const q = normalizarTexto(document.getElementById('searchInput').value || '');
  const facultad = document.getElementById('facultySelect').value || 'all';
  let base = [];
  if (facultad === 'salud') base = dataSalud;
  else if (facultad === 'tecnologias') base = dataTecno;
  else base = [...dataSalud, ...dataTecno];

  if (!q) {
    mostrarResultados(base);
    return;
  }

  const resultados = base.filter(item => {
    const title = normalizarTexto(item.titulo || item.title || '');
    return title.includes(q);
  });

  mostrarResultados(resultados);
}

/* Mostrar todos (según facultad) */
function mostrarTodos() {
  const facultad = document.getElementById('facultySelect').value || 'all';
  if (facultad === 'salud') mostrarResultados(dataSalud);
  else if (facultad === 'tecnologias') mostrarResultados(dataTecno);
  else mostrarResultados([...dataSalud, ...dataTecno]);
}

/* Eventos UI */
document.getElementById('searchBtn').addEventListener('click', buscarLibros);
document.getElementById('showAllBtn').addEventListener('click', mostrarTodos);
document.getElementById('searchInput').addEventListener('keydown', e => {
  if (e.key === 'Enter') buscarLibros();
});

/* Inicialización */
cargarDatos();
