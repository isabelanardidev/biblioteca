let dataSalud = [];
let dataTecno = [];

function normalizarTexto(texto) {
  return texto
    ? texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    : "";
}

async function leerCSV(ruta) {
  const resp = await fetch(ruta);
  if (!resp.ok) throw new Error(`No se pudo cargar ${ruta}`);
  const texto = await resp.text();

  const filas = texto.trim().split(/\r?\n/);
  const headers = filas[1].split(",").map(h => h.trim());
  const datos = [];

  for (let i = 2; i < filas.length; i++) {
    const valores = filas[i].split(",").map(v => v.trim());
    const fila = {};
    headers.forEach((h, idx) => (fila[h] = valores[idx] || ""));
    datos.push(fila);
  }
  return datos;
}

async function cargarDatos() {
  try {
    [dataSalud, dataTecno] = await Promise.all([
      leerCSV("salud.csv"),
      leerCSV("tecnologias.csv")
    ]);
    mostrarResultados([...dataSalud, ...dataTecno]);
  } catch (err) {
    console.error("Error cargando datos:", err);
    const noResults = document.getElementById("noResults");
    noResults.hidden = false;
    noResults.textContent =
      "Error al cargar los catálogos. Revisa los ficheros CSV.";
  }
}

function mostrarResultados(libros) {
  const cont = document.getElementById("resultsList");
  cont.innerHTML = "";
  const noResults = document.getElementById("noResults");

  if (!libros || libros.length === 0) {
    noResults.hidden = false;
    cont.innerHTML = "";
    return;
  }
  noResults.hidden = true;

  libros.forEach(libro => {
    const div = document.createElement("div");
    div.className = "book";
    div.innerHTML = `
      <h3>${libro["Título"] || "Sin título"}</h3>
      <small><strong>Autor:</strong> ${libro["Autor"] || "Desconocido"}</small><br>
      <small><strong>Editorial:</strong> ${libro["Editorial"] || ""}</small><br>
      <small><strong>Año:</strong> ${libro["Año"] || ""}</small><br>
      <small><strong>ISBN:</strong> ${libro["ISBN"] || ""}</small><br>
      <small><strong>Signatura:</strong> ${libro["Signatura Topográfica"] || ""}</small><br>
      <p>${libro["Resumen"] || ""}</p>
    `;
    cont.appendChild(div);
  });
}

function buscarLibros() {
  const texto = normalizarTexto(document.getElementById("searchInput").value);
  const facultad = document.getElementById("facultySelect").value;
  let base = [];

  if (facultad === "salud") base = dataSalud;
  else if (facultad === "tecnologias") base = dataTecno;
  else base = [...dataSalud, ...dataTecno];

  // búsqueda parcial por palabra
  const resultados = base.filter(l =>
    normalizarTexto(l["Título"]).includes(texto)
  );

  mostrarResultados(resultados);
}

function mostrarTodos() {
  const facultad = document.getElementById("facultySelect").value;
  if (facultad === "salud") mostrarResultados(dataSalud);
  else if (facultad === "tecnologias") mostrarResultados(dataTecno);
  else mostrarResultados([...dataSalud, ...dataTecno]);
}

// Eventos
document.getElementById("searchBtn").addEventListener("click", buscarLibros);
document.getElementById("showAllBtn").addEventListener("click", mostrarTodos);

// Permite buscar con "Enter"
document.getElementById("searchInput").addEventListener("keydown", e => {
  if (e.key === "Enter") buscarLibros();
});

// Carga inicial
cargarDatos();
