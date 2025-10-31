/* app.js
   Soporta cabeceras diferentes para salud.csv y tecnologias.csv
   Búsqueda parcial, sin acentos, diseño limpio y parser robusto.
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

/* Detecta delimitador (coma o punto y coma) */
function detectarDelimitador(texto) {
  const sample = texto.slice(0, 2000);
  let inQuotes = false, commas = 0, semis = 0;
  for (let i = 0; i < sample.length; i++) {
    const ch = sample[i];
    if (ch === '"') {
      if (inQuotes && sample[i + 1] === '"') { i++; continue; }
      inQuotes = !inQuotes;
    } else if (!inQuotes) {
      if (ch === ',') commas++;
      else if (ch === ';') semis++;
    }
  }
  return semis > commas ? ';' : ',';
}

/* Parser CSV robusto */
function parseCSVRobusto(texto, delim) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < texto.length; i++) {
    const ch = texto[i];

    if (ch === '"') {
      if (inQuotes && texto[i + 1] === '"') { cell += '"'; i++; continue; }
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
  if (cell !== "" || row.length > 0) { row.push(cell); rows.push(row); }
  return rows.map(r => r.map(c => (c ?? "").trim()));
}

/* ---------- Mapeos personalizados ---------- */
const mapeosCabeceras = {
  salud: {
    "título": "titulo",
    "titulo": "titulo",
    "autor/a": "autor",
    "autor": "autor",
    "editorial": "editorial",
    "edición": "edicion",
    "edicion": "edicion",
    "año": "ano",
    "ano": "ano",
    "isbn": "isbn",
    "titulación": "titulacion",
    "materias/temáticas": "tematicas",
    "materias": "tematicas",
    "signatura topográfica": "signatura",
    "signatura": "signatura",
    "resumen": "resumen"
  },
  tecnologias: {
    "título": "titulo",
    "titulo": "titulo",
    "autor/a": "autor",
    "autor": "autor",
    "editorial": "editorial",
    "edición": "edicion",
    "edicion": "edicion",
    "año": "ano",
    "ano": "ano",
    "isbn": "isbn",
    "materias": "tematicas",
    "signatura topográfica": "signatura",
    "signatura": "signatura",
    "resumen": "resumen"
  }
};

/* Convierte filas en objetos según cabeceras específicas */
function filasAObjetos(rows, tipo) {
  if (!rows.length) return [];
  const headers = rows[0].map(h => normalizarTexto(h));
  const map = mapeosCabeceras[tipo];

  const objetos = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (r.every(c => !c)) continue;
    const obj = {};
    for (let j = 0; j < headers.length; j++) {
      const h = headers[j];
      const key = map[h] || h || `col${j}`;
      obj[key] = (r[j] ?? "").trim();
    }
    objetos.push(obj);
  }
  return objetos;
}

/* Leer CSV y convertir a objetos */
async function leerCSV(ruta, tipo) {
  const resp = await fetch(ruta);
  if (!resp.ok) throw new Error(`No se pudo cargar ${ruta}`);
  const texto = (await resp.text()).replace(/^\uFEFF/, "");
  const delim = detectarDelimitador(texto);
  const rows = parseCSVRobusto(texto, delim);
  return filasAObjetos(rows, tipo);
}

/* ---------- Carga de datos ---------- */
async function cargarDatos() {
  try {
    const [salud, tec] = await Promise.all([
      leerCSV("salud.csv", "salud"),
      leerCSV("tecnologias.csv", "tecnologias")
    ]);
    dataSalud = salud.map(b => ({ ...b, _tipo: "salud" }));
    dataTecno = tec.map(b => ({ ...b, _tipo: "tecnologias" }));
    mostrarResultados([...dataSalud, ...dataTecno]);
  } catch (e) {
    console.error("Error al cargar datos:", e);
    document.getElementById("noResults").hidden = false;
  }
}

/* ---------- Render y búsqueda ---------- */
function escapeHtml(str) {
  if (!str && str !== 0) return "";
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function mostrarResultados(libros) {
  const cont = document.getElementById("resultsList");
  const noResults = document.getElementById("noResults");
  cont.innerHTML = "";
  if (!libros.length) { noResults.hidden = false; return; }
  noResults.hidden = true;

  libros.sort((a, b) =>
    normalizarTexto(a.titulo).localeCompare(normalizarTexto(b.titulo))
  );

  for (const libro of libros) {
    const html = `
      <div class="book">
        <h3>${escapeHtml(libro.titulo || "Sin título")}</h3>
        <small><strong>Autor:</strong> ${escapeHtml(libro.autor || "Desconocido")}</small><br>
        <small><strong>Editorial:</strong> ${escapeHtml(libro.editorial || "")}</small><br>
        <small><strong>Edición:</strong> ${escapeHtml(libro.edicion || "")}</small><br>
        <small><strong>Año:</strong> ${escapeHtml(libro.ano || "")}</small><br>
        <small><strong>ISBN:</strong> ${escapeHtml(libro.isbn || "")}</small><br>
        ${
          libro.titulacion
            ? `<small><strong>Titulación:</strong> ${escapeHtml(libro.titulacion)}</small><br>`
            : ""
        }
        <small><strong>Materias/Temáticas:</strong> ${escapeHtml(libro.tematicas || "")}</small><br>
        <small><strong>Signatura:</strong> ${escapeHtml(libro.signatura || "")}</small>
        ${
          libro.resumen
            ? `<p class="resumen">${escapeHtml(libro.resumen)}</p>`
            : ""
        }
      </div>`;
    cont.insertAdjacentHTML("beforeend", html);
  }
}

/* ---------- Búsqueda ---------- */
function buscarLibros() {
  const q = normalizarTexto(document.getElementById("searchInput").value);
  const facultad = document.getElementById("facultySelect").value;
  let base = facultad === "salud" ? dataSalud :
              facultad === "tecnologias" ? dataTecno :
              [...dataSalud, ...dataTecno];

  if (!q) { mostrarResultados(base); return; }
  const resultados = base.filter(b =>
    normalizarTexto(b.titulo).includes(q)
  );
  mostrarResultados(resultados);
}

function mostrarTodos() {
  const facultad = document.getElementById("facultySelect").value;
  if (facultad === "salud") mostrarResultados(dataSalud);
  else if (facultad === "tecnologias") mostrarResultados(dataTecno);
  else mostrarResultados([...dataSalud, ...dataTecno]);
}

/* Eventos UI */
document.getElementById("searchBtn").addEventListener("click", buscarLibros);
document.getElementById("showAllBtn").addEventListener("click", mostrarTodos);
document.getElementById("searchInput").addEventListener("keydown", e => {
  if (e.key === "Enter") buscarLibros();
});

/* Inicialización */
cargarDatos();
