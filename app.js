/* ============================================================
   app.js — versión robusta mejorada (2025-11-01)
   - Soporta CSV con comillas, saltos de línea, delimitador variable (, ; o tab)
   - Limpieza de celdas y cabeceras (incluye BOM, caracteres raros)
   - Compatible con los CSV de salud.csv y tecnologias.csv
=============================================================== */

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

/* Detecta el delimitador (, ; o tab) */
function detectarDelimitador(texto) {
  const sample = texto.slice(0, 3000);
  let inQuotes = false;
  let count = { ',': 0, ';': 0, '\t': 0 };

  for (let i = 0; i < sample.length; i++) {
    const ch = sample[i];
    if (ch === '"') {
      if (sample[i + 1] === '"') { i++; continue; }
      inQuotes = !inQuotes;
      continue;
    }
    if (!inQuotes && (ch === ',' || ch === ';' || ch === '\t')) {
      count[ch]++;
    }
  }

  const entries = Object.entries(count).sort((a, b) => b[1] - a[1]);
  const best = entries[0];
  return best ? best[0] : ',';
}

/* Parser CSV robusto */
function parseCSVRobusto(texto, delim) {
  texto = texto.replace(/^\uFEFF/, ''); // quitar BOM inicial

  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < texto.length; i++) {
    const ch = texto[i];

    if (ch === '"') {
      if (inQuotes && texto[i + 1] === '"') {
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
      if (ch === '\r' && texto[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      continue;
    }

    cell += ch;
  }

  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  // Limpieza de celdas (BOM, comillas, espacios)
  return rows.map(r =>
    r.map(c =>
      (c || "")
        .replace(/\uFEFF/g, "") // quitar BOM en cualquier posición
        .trim()
        .replace(/^"|"$/g, "")
    )
  );
}

/* Encuentra fila de cabecera */
function indiceCabeceraSegunRegla(rows) {
  let firstNonEmpty = -1;
  for (let i = 0; i < rows.length; i++) {
    const hasContent = rows[i].some(cell => cell && String(cell).trim() !== "");
    if (hasContent) { firstNonEmpty = i; break; }
  }
  if (firstNonEmpty === -1) return 0;
  let headerIndex = firstNonEmpty + 1;
  if (!rows[headerIndex] || rows[headerIndex].every(c => c.trim() === "")) {
    headerIndex = firstNonEmpty;
  }
  return headerIndex;
}

/* Normaliza cabeceras */
function normalizarCabecera(h) {
  if (!h && h !== 0) return "";
  return String(h || '')
    .replace(/\uFEFF/g, '') // eliminar BOM en cualquier posición
    .replace(/^"|"$/g, '')  // quitar comillas
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/* Mapea cabeceras a claves canónicas */
function mapearCabecerasALabels(headerRow) {
  const mapping = {
    titulo: ["titulo", "título", "title"],
    autor: ["autor", "autor a", "autor/a", "autores", "author"],
    editorial: ["editorial", "publisher"],
    edicion: ["edicion", "edición", "edition"],
    ano: ["ano", "año", "year"],
    isbn: ["isbn"],
    titulacion: ["titulacion", "titulación", "degree", "titulacion / tematica"],
    tematicas: [
      "materias tematicas", "materias", "tematicas", "temática",
      "tematica", "temas", "materias/tematicas", "materias / tematicas"
    ],
    signatura: ["signatura topografica", "signatura topográfica", "signatura"],
    resumen: ["resumen", "sinopsis", "abstract", "descripcion", "description"]
  };

  return headerRow.map(h => {
    const norm = normalizarCabecera(h);
    for (const [key, variants] of Object.entries(mapping)) {
      for (const v of variants) {
        if (norm === v || norm.includes(v)) return key;
      }
    }
    return norm || "col";
  });
}

/* Convierte filas en objetos */
function filasAObjetos(rows) {
  if (!rows || rows.length === 0) return [];

  const headerIdx = indiceCabeceraSegunRegla(rows);
  const headerRow = rows[headerIdx] || [];
  const labels = mapearCabecerasALabels(headerRow);

  const books = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i];
    const allEmpty = r.every(c => !c || String(c).trim() === "");
    if (allEmpty) continue;

    const obj = {};
    for (let j = 0; j < labels.length; j++) {
      const key = labels[j] || `col${j}`;
      obj[key] = (r[j] !== undefined && r[j] !== null) ? String(r[j]).trim() : "";
    }

    if (r.length > labels.length) {
      const extra = r.slice(labels.length).join(" ").trim();
      if (obj["resumen"] !== undefined)
        obj["resumen"] = (obj["resumen"] + " " + extra).trim();
      else
        obj["otros"] = extra;
    }

    books.push(obj);
  }

  return books;
}

/* ---------- Lectura robusta ---------- */
async function leerCSVRobusto(ruta) {
  const resp = await fetch(ruta);
  if (!resp.ok) throw new Error(`No se pudo cargar ${ruta} (status ${resp.status})`);
  const textoRaw = await resp.text();

  const texto = textoRaw.replace(/^\uFEFF/, "");
  const delim = detectarDelimitador(texto);

  // Aviso si hay caracteres raros "�"
  if (texto.includes("�")) {
    console.warn(`⚠️ El archivo ${ruta} contiene caracteres “�”. Posible problema de codificación (no UTF-8).`);
  }

  let rows = parseCSVRobusto(texto, delim);
  rows = rows.map(r =>
    r.map(c => c.replace(/\uFEFF/g, '').trim().replace(/^"|"$/g, ''))
  );

  const objects = filasAObjetos(rows);
  return objects;
}

/* ---------- Cargar datos ---------- */
async function cargarDatos() {
  try {
    const [salud, tec] = await Promise.all([
      leerCSVRobusto('salud.csv'),
      leerCSVRobusto('tecnologias.csv')
    ]);

    dataSalud = salud.map(b => ({ ...b, _faculty: 'salud' }));
    dataTecno = tec.map(b => ({ ...b, _faculty: 'tecnologias' }));

    console.log('Datos cargados:', {
      salud: dataSalud.length,
      tecnologias: dataTecno.length
    });

    mostrarResultados([...dataSalud, ...dataTecno]);
  } catch (err) {
    console.error('Error cargando datos:', err);
    const noResults = document.getElementById('noResults');
    if (noResults) {
      noResults.hidden = false;
      noResults.textContent =
        'Error al cargar los catálogos. Revisa los ficheros CSV y su codificación (UTF-8 sin BOM).';
    }
  }
}

/* ---------- Render ---------- */
function mostrarResultados(libros) {
  const cont = document.getElementById('resultsList');
  const noResults = document.getElementById('noResults');
  cont.innerHTML = '';

  if (!libros || libros.length === 0) {
    if (noResults) noResults.hidden = false;
    return;
  }
  if (noResults) noResults.hidden = true;

  libros.sort((a, b) => {
    const ta = normalizarTexto(a.titulo || a.title || '');
    const tb = normalizarTexto(b.titulo || b.title || '');
    return ta.localeCompare(tb, 'es', { sensitivity: 'base' });
  });

  for (const libro of libros) {
    const title = libro.titulo || libro.title || libro.col0 || 'Sin título';
    const autor = libro.autor || libro.col1 || 'Desconocido';
    const editorial = libro.editorial || libro.col2 || '';
    const edicion = libro.edicion || '';
    const ano = libro.ano || libro.year || '';
    const isbn = libro.isbn || '';
    const signatura = libro.signatura || '';
    const resumen = libro.resumen || libro.otros || '';

    let titTem = '';
    if (libro.titulacion && libro.tematicas)
      titTem = `${libro.titulacion} / ${libro.tematicas}`;
    else
      titTem = libro.titulacion || libro.tematicas || '';

    const div = document.createElement('div');
    div.className = 'book';
    div.innerHTML = `
      <h3>${escapeHtml(title)}</h3>
      <small><strong>Autor:</strong> ${escapeHtml(autor)}</small><br>
      <small><strong>Editorial:</strong> ${escapeHtml(editorial)}</small><br>
      <small><strong>Edición:</strong> ${escapeHtml(edicion)}</small><br>
      <small><strong>Año:</strong> ${escapeHtml(ano)}</small><br>
      <small><strong>ISBN:</strong> ${escapeHtml(isbn)}</small><br>
      <small><strong>Titulación / Temática:</strong> ${escapeHtml(titTem)}</small><br>
      <small><strong>Signatura:</strong> ${escapeHtml(signatura)}</small>
      <p>${escapeHtml(resumen)}</p>
    `;
    cont.appendChild(div);
  }
}

/* Escape HTML básico */
function escapeHtml(str) {
  if (!str && str !== 0) return '';
  return String(str)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/* ---------- Búsqueda ---------- */
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

/* Mostrar todos */
function mostrarTodos() {
  const facultad = document.getElementById('facultySelect').value || 'all';
  if (facultad === 'salud') mostrarResultados(dataSalud);
  else if (facultad === 'tecnologias') mostrarResultados(dataTecno);
  else mostrarResultados([...dataSalud, ...dataTecno]);
}

/* ---------- Eventos UI ---------- */
document.getElementById('searchBtn').addEventListener('click', buscarLibros);
document.getElementById('showAllBtn').addEventListener('click', mostrarTodos);
document.getElementById('searchInput').addEventListener('keydown', e => {
  if (e.key === 'Enter') buscarLibros();
});

/* ---------- Inicialización ---------- */
cargarDatos();
