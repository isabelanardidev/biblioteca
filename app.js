/* app.js - Catálogo Biblioteca Euneiz
   Permite buscar libros por título en dos bases de datos locales (.csv/.xlsx/.ods)
*/

const FACULTIES = {
  salud: { key: 'salud', label: 'Ciencias de la Salud', tagClass: 'tag-salud' },
  tecnologias: { key: 'tecnologias', label: 'Nuevas Tecnologías Interactivas', tagClass: 'tag-tec' }
};

const FILE_BASES = { salud: 'salud', tecnologias: 'tecnologias' };
const TRY_EXTS = ['.csv', '.xlsx', '.xls', '.ods'];

const facultySelect = document.getElementById('facultySelect');
const searchInput = document.getElementById('searchInput');
const searchBtn = document.getElementById('searchBtn');
const showAllBtn = document.getElementById('showAllBtn');
const resultsList = document.getElementById('resultsList');
const noResults = document.getElementById('noResults');
const formatsInfo = document.getElementById('formatsInfo');

let DATABASE = { salud: [], tecnologias: [] };
let detectedFormats = {};

function normalizarTexto(texto) {
  if (!texto) return '';
  return String(texto)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

async function tryFetchWithExts(baseName) {
  const errors = [];
  for (const ext of TRY_EXTS) {
    const url = `${baseName}${ext}`;
    try {
      const resp = await fetch(url);
      if (!resp.ok) {
        errors.push({ url, status: resp.status });
        continue;
      }
      const arrayBuffer = await resp.arrayBuffer();
      return { ok: true, url, ext, arrayBuffer };
    } catch (err) {
      errors.push({ url, err: String(err) });
      continue;
    }
  }
  return { ok: false, errors };
}

function parseArrayBufferToRows(arrayBuffer, ext) {
  if (ext === '.csv') {
    const decoder = new TextDecoder('utf-8');
    const text = decoder.decode(arrayBuffer);
    const workbook = XLSX.read(text, { type: 'string', raw: false });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
    return rows;
  } else {
    const wb = XLSX.read(arrayBuffer, { type: 'array' });
    const sheetName = wb.SheetNames[0];
    const ws = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
    return rows;
  }
}

function rowsToBooks(rows, facultyKey) {
  if (!rows || rows.length < 2) return [];
  const headerRow = rows[1].map(h => String(h || '').trim());
  const headerIndex = {};
  headerRow.forEach((h, idx) => { headerIndex[normalizarTexto(h)] = idx; });

  const books = [];
  for (let i = 2; i < rows.length; i++) {
    const row = rows[i];
    const allEmpty = row.every(cell => !cell || cell === '');
    if (allEmpty) continue;

    const getBy = (names) => {
      for (const n of names) {
        const key = normalizarTexto(n);
        if (key in headerIndex) return String(row[headerIndex[key]] ?? '').trim();
      }
      return '';
    };

    books.push({
      titulo: getBy(['Título', 'Titulo', 'title']),
      autor: getBy(['Autor', 'Autores', 'Author']),
      editorial: getBy(['Editorial', 'Publisher']),
      edicion: getBy(['Edición', 'Edition']),
      ano: getBy(['Año', 'Year']),
      isbn: getBy(['ISBN']),
      titulacion: getBy(['Titulación', 'Titulacion']),
      tematica: getBy(['Temática', 'Tematica', 'Tema']),
      signatura: getBy(['Signatura Topográfica', 'Signatura']),
      resumen: getBy(['Resumen', 'Sinopsis']),
      faculty: facultyKey
    });
  }
  return books;
}

async function cargarTodasBases() {
  formatsInfo.textContent = 'Cargando archivos...';
  const promises = Object.entries(FILE_BASES).map(async ([key, base]) => {
    const res = await tryFetchWithExts(base);
    if (!res.ok) {
      detectedFormats[key] = null;
      return { key, ok: false };
    }
    const { ext, arrayBuffer } = res;
    detectedFormats[key] = ext;
    const rows = parseArrayBufferToRows(arrayBuffer, ext);
    const books = rowsToBooks(rows, key);
    DATABASE[key] = books;
    return { key, ok: true, ext, count: books.length };
  });

  const results = await Promise.all(promises);
  formatsInfo.textContent = results
    .map(r => r.ok
      ? `${r.key}: ${r.ext} (${r.count} libros)`
      : `${r.key}: no encontrado`
    )
    .join(' | ');
}

function buscarLibros(query, facultyFilter = 'all') {
  const qnorm = normalizarTexto(query);
  const results = [];
  const searchIn = (list) => {
    for (const b of list) {
      if (!qnorm || normalizarTexto(b.titulo).includes(qnorm)) results.push(b);
    }
  };
  if (facultyFilter === 'all') {
    searchIn(DATABASE.salud);
    searchIn(DATABASE.tecnologias);
  } else {
    searchIn(DATABASE[facultyFilter]);
  }
  return results;
}

function renderResults(books) {
  resultsList.innerHTML = '';
  if (!books || books.length === 0) {
    noResults.hidden = false;
    return;
  }
  noResults.hidden = true;
  books.sort((a,b) => a.titulo.localeCompare(b.titulo, 'es', { sensitivity:'base' }));

  for (const b of books) {
    const item = document.createElement('div');
    item.className = 'item';

    const header = document.createElement('div');
    header.className = 'rowmeta';

    const title = document.createElement('div');
    title.className = 'title';
    title.textContent = b.titulo || '(Título no disponible)';

    const tag = document.createElement('div');
    tag.className = `faculty-tag ${b.faculty === 'salud' ? 'tag-salud' : 'tag-tec'}`;
    tag.textContent = FACULTIES[b.faculty].label;

    header.appendChild(title);
    header.appendChild(tag);

    const meta = document.createElement('div');
    meta.className = 'meta';
    meta.innerHTML = `<strong>Autor:</strong> ${b.autor || '-'} — <strong>Año:</strong> ${b.ano || '-'} — <strong>ISBN:</strong> ${b.isbn || '-'}`;

    const summary = document.createElement('div');
    summary.className = 'summary';
    const shortText = (b.resumen && b.resumen.length > 350)
      ? b.resumen.slice(0,350) + '…' : (b.resumen || 'Sin resumen.');
    summary.innerHTML = `<strong>Titulación/Temática:</strong> ${b.titulacion || '-'} / ${b.tematica || '-'}<br><br>${shortText}`;

    const footer = document.createElement('div');
    footer.className = 'rowmeta';
    footer.innerHTML = `<small><strong>Editorial:</strong> ${b.editorial || '-'} — <strong>Edición:</strong> ${b.edicion || '-'} — <strong>Signatura:</strong> ${b.signatura || '-'}</small>`;

    item.append(header, meta, summary, footer);
    resultsList.appendChild(item);
  }
}

/* Eventos */
searchBtn.addEventListener('click', () => {
  const q = searchInput.value.trim();
  const faculty = facultySelect.value;
  const results = buscarLibros(q, faculty);
  renderResults(results);
});

showAllBtn.addEventListener('click', () => {
  const faculty = facultySelect.value;
  const results = buscarLibros('', faculty);
  renderResults(results);
});

searchInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') searchBtn.click();
});

/* Inicializar */
(async function init() {
  try {
    await cargarTodasBases();
    const allBooks = buscarLibros('', 'all');
    renderResults(allBooks);
  } catch (err) {
    console.error('Error al iniciar:', err);
    formatsInfo.textContent = 'Error al cargar los datos.';
  }
})();
