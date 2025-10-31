/* app.js
   Catálogo Biblioteca Euneiz
   - Busca los ficheros 'salud' y 'tecnologias' con varias extensiones (.csv, .xlsx, .xls, .ods)
   - Interpreta que las cabeceras están en la fila 2 (índice 1) y los libros empiezan en la fila 3 (índice 2).
   - Normaliza texto (sin acentos, minúsculas) para búsquedas.
*/

/* ---------- Configuración ---------- */
const FACULTIES = {
  salud: { key: 'salud', label: 'Ciencias de la Salud', tagClass: 'tag-salud' },
  tecnologias: { key: 'tecnologias', label: 'Nuevas Tecnologías Interactivas', tagClass: 'tag-tec' }
};
// Nombres base de archivo (sin extensión)
const FILE_BASES = {
  salud: 'salud',
  tecnologias: 'tecnologias'
};
// Extensiones a probar (ordenadas por preferencia)
const TRY_EXTS = ['.csv', '.xlsx', '.xls', '.ods'];

/* ---------- DOM ---------- */
const facultySelect = document.getElementById('facultySelect');
const searchInput = document.getElementById('searchInput');
const searchBtn = document.getElementById('searchBtn');
const showAllBtn = document.getElementById('showAllBtn');
const resultsList = document.getElementById('resultsList');
const noResults = document.getElementById('noResults');
const formatsInfo = document.getElementById('formatsInfo');

let DATABASE = {
  salud: [],
  tecnologias: []
};
let detectedFormats = {}; // { salud: '.csv', tecnologias: '.ods' }

/* ---------- Utilidades ---------- */
function normalizarTexto(texto) {
  if (texto === null || texto === undefined) return '';
  return String(texto)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/* Intenta fetch con varias extensiones y devuelve la primera que funcione.
   Retorna { ok: true, url, ext, response } o { ok:false, errors } */
async function tryFetchWithExts(baseName) {
  const errors = [];
  for (const ext of TRY_EXTS) {
    const url = `${baseName}${ext}`;
    try {
      // Para csv usaremos text(); para binarios arrayBuffer
      const resp = await fetch(url);
      if (!resp.ok) {
        errors.push({ url, status: resp.status });
        continue;
      }
      // Leer como arrayBuffer para compatibilidad con XLSX; para csv también sirve
      const arrayBuffer = await resp.arrayBuffer();
      return { ok: true, url, ext, arrayBuffer };
    } catch (err) {
      errors.push({ url, err: String(err) });
      continue;
    }
  }
  return { ok: false, errors };
}

/* Parsea un archivo que ya tenemos en arrayBuffer, usando XLSX para binarios
   Detecta si es CSV o libro por la extensión (o por contenido). Retorna filas (matriz). */
function parseArrayBufferToRows(arrayBuffer, ext) {
  // Si ext es .csv tratamos como texto intentando utf-8
  if (ext === '.csv') {
    // convertir arrayBuffer -> texto
    const decoder = new TextDecoder('utf-8');
    const text = decoder.decode(arrayBuffer);
    // Separar líneas cuidando CRLF/CR
    const lines = text.split(/\r\n|\n|\r/);
    // Mapear cada línea en campos CSV (simple split por coma respetando " quotes" sería frágil,
    // pero XLSX.utils.sheet_to_json para CSV funciona mejor; aprovechamos XLSX.read con type 'string')
    // Para usar XLSX.read como CSV, pasamos el texto
    const workbook = XLSX.read(text, { type: 'string', raw: false });
    // Convertir primera (o única) hoja en filas
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
    return rows;
  } else {
    // Para xlsx/xls/ods: usar XLSX.read con type 'array'
    const wb = XLSX.read(arrayBuffer, { type: 'array' });
    const sheetName = wb.SheetNames[0];
    const ws = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
    return rows;
  }
}

/* Convierte filas en objetos de libro basándonos en cabecera (fila 2 -> index 1) */
function rowsToBooks(rows, facultyKey) {
  // Si hay menos de 2 filas no hay cabecera en fila 2
  if (!rows || rows.length < 2) return [];

  // Según tus indicaciones: los títulos de las columnas están en la fila 2 (index 1)
  const headerRow = rows[1].map(h => String(h || '').trim());
  // Normalizar nombres de cabeceras para mapear
  const headerIndex = {};
  headerRow.forEach((h, idx) => {
    const key = normalizarTexto(h);
    headerIndex[key] = idx;
  });

  // Los nombres esperados (en español) según tu mensaje:
  const expected = {
    titulo: 'Título',
    autor: 'Autor',
    editorial: 'Editorial',
    edicion: 'Edición',
    ano: 'Año',
    isbn: 'ISBN',
    titulacion: 'Titulación',
    tematica: 'Temática',
    signatura_topografica: 'Signatura Topográfica',
    resumen: 'Resumen'
  };

  // Para cada fila a partir de la fila 3 (index 2) crear objeto
  const books = [];
  for (let i = 2; i < rows.length; i++) {
    const row = rows[i];
    // Saltar filas vacías
    const allEmpty = row.every(cell => cell === '' || cell === null || typeof cell === 'undefined');
    if (allEmpty) continue;

    // Extraer por nombre de cabecera (buscar coincidencias caseless)
    const getByHeaderName = (possibleNames) => {
      for (const pname of possibleNames) {
        const key = normalizarTexto(pname);
        if (key in headerIndex) return String(row[headerIndex[key]] ?? '').trim();
      }
      return '';
    };

    // Como las cabeceras pueden variar ligeramente, intentamos mapear por la clave normalizada
    const titulo = getByHeaderName(['Título', 'Titulo', 'title']);
    const autor = getByHeaderName(['Autor', 'Autores', 'Author']);
    const editorial = getByHeaderName(['Editorial', 'editorial', 'Publisher']);
    const edicion = getByHeaderName(['Edición', 'Edicion', 'Edition']);
    const ano = getByHeaderName(['Año', 'Ano', 'Year']);
    const isbn = getByHeaderName(['ISBN', 'Isbn']);
    const titulacion = getByHeaderName(['Titulación', 'Titulacion', 'Titulación/Grado']);
    const tematica = getByHeaderName(['Temática', 'Tematica', 'Tema', 'Temas']);
    const signatura = getByHeaderName(['Signatura Topográfica', 'Signatura', 'Signatura topografica']);
    const resumen = getByHeaderName(['Resumen', 'Sinopsis', 'Resumen/Abstract']);

    books.push({
      titulo, autor, editorial, edicion, ano, isbn, titulacion, tematica, signatura, resumen,
      faculty: facultyKey
    });
  }
  return books;
}

/* Carga ambos ficheros (salud y tecnologias) intentando detectar extensión */
async function cargarTodasBases() {
  formatsInfo.textContent = 'Detectando archivos...';
  const promises = Object.entries(FILE_BASES).map(async ([key, base]) => {
    const tryResp = await tryFetchWithExts(base);
    if (!tryResp.ok) {
      detectedFormats[key] = null;
      return { key, ok: false, errors: tryResp.errors };
    }
    const { ext, arrayBuffer, url } = tryResp;
    detectedFormats[key] = ext;
    const rows = parseArrayBufferToRows(arrayBuffer, ext);
    const books = rowsToBooks(rows, key);
    DATABASE[key] = books;
    return { key, ok: true, ext, url, count: books.length };
  });

  const results = await Promise.all(promises);

  // Mostrar info de formatos detectados
  const infoParts = results.map(r => {
    if (r.ok) return `${r.key}: ${r.ext} (${r.count} libros)`;
    else return `${r.key}: no encontrado (se buscó ${TRY_EXTS.join(',')})`;
  });
  formatsInfo.innerText = infoParts.join(' | ');
}

/* Buscar en la base de datos por título (y opcionalmente filtrar por facultad) */
function buscarLibros(query, facultyFilter = 'all') {
  const qnorm = normalizarTexto(query);
  const results = [];

  const checkAndPush = (book) => {
    const titleNorm = normalizarTexto(book.titulo);
    if (titleNorm.includes(qnorm)) {
      results.push(book);
    }
  };

  if (facultyFilter === 'all') {
    for (const f of Object.keys(DATABASE)) {
      DATABASE[f].forEach(b => { if (!qnorm || normalizarTexto(b.titulo).includes(qnorm)) results.push(b); });
    }
  } else {
    DATABASE[facultyFilter].forEach(b => { if (!qnorm || normalizarTexto(b.titulo).includes(qnorm)) results.push(b); });
  }

  return results;
}

/* Render resultados (lista) */
function renderResults(books) {
  resultsList.innerHTML = '';
  if (!books || books.length === 0) {
    noResults.hidden = false;
    return;
  }
  noResults.hidden = true;

  // Ordenar por título
  books.sort((a,b) => a.titulo.localeCompare(b.titulo, 'es', { sensitivity: 'base' }));

  for (const b of books) {
    const item = document.createElement('div');
    item.className = 'item';

    const header = document.createElement('div');
    header.className = 'rowmeta';

    const title = document.createElement('div');
    title.className = 'title';
    title.textContent = b.titulo || '(Título no disponible)';

    const tag = document.createElement('div');
    tag.className = 'faculty-tag ' + (b.faculty === 'salud' ? 'tag-salud' : 'tag-tec');
    tag.textContent = FACULTIES[b.faculty].label;

    header.appendChild(title);
    header.appendChild(tag);

    const meta = document.createElement('div');
    meta.className = 'meta';
    meta.innerHTML = `<strong>Autor:</strong> ${b.autor || '-'} — <strong>Año:</strong> ${b.ano || '-'} — <strong>ISBN:</strong> ${b.isbn || '-'}`;

    const more = document.createElement('div');
    more.className = 'summary';
    const shortResumen = (b.resumen && b.resumen.length > 350) ? b.resumen.slice(0, 350) + '…' : (b.resumen || 'Sin resumen.');
    more.innerHTML = `<strong>Titulación/Temática:</strong> ${b.titulacion || '-'} / ${b.tematica || '-'}<br/><br/>${shortResumen}`;

    const footer = document.createElement('div');
    footer.className = 'rowmeta';
    footer.style.marginTop = '8px';
    footer.innerHTML = `<small class="meta"><strong>Editorial:</strong> ${b.editorial || '-'} — <strong>Edición:</strong> ${b.edicion || '-' } — <strong>Signatura:</strong> ${b.signatura || '-'}</small>`;

    item.appendChild(header);
    item.appendChild(meta);
    item.appendChild(more);
    item.appendChild(footer);

    resultsList.appendChild(item);
  }
}

/* Eventos UI */
searchBtn.addEventListener('click', () => {
  const q = searchInput.value.trim();
  const faculty = facultySelect.value;
  const results = buscarLibros(q, faculty === 'all' ? 'all' : faculty);
  renderResults(results);
});

showAllBtn.addEventListener('click', () => {
  const faculty = facultySelect.value;
  const results = buscarLibros('', faculty === 'all' ? 'all' : faculty);
  renderResults(results);
});

// Buscar al pulsar Enter en input
searchInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { searchBtn.click(); }
});

/* Inicialización */
(async function init() {
  try {
    await cargarTodasBases();
    // Mostrar todos por defecto al cargar
    const allBooks = buscarLibros('', 'all');
    renderResults(allBooks);
  } catch (err) {
    formatsInfo.textContent = 'Error al cargar bases: ' + String(err);
    console.error(err);
  }
})();
