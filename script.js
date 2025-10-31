// app.js — Catálogo Biblioteca Euneiz
let catalogo = {
  salud: [],
  nti: []
};

// Função para normalizar texto (remover acentos e converter para minúsculas)
function normalizarTexto(texto) {
  return texto
    ? texto
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
    : '';
}

// Função para carregar os dois ficheiros Excel
async function carregarCatalogo() {
  try {
    await carregarExcel('salud.xlsx', 'salud');
    await carregarExcel('nti.xlsx', 'nti');
    console.log('Catálogo carregado:', catalogo);
    document.getElementById('status').textContent =
      'Catálogo carregado com sucesso.';
  } catch (error) {
    console.error('Erro ao carregar catálogos:', error);
    document.getElementById('status').textContent =
      'Erro ao carregar os ficheiros.';
  }
}

// Função genérica para ler um Excel e adicionar ao catálogo
async function carregarExcel(nomeFicheiro, faculdade) {
  try {
    const response = await fetch(nomeFicheiro);
    if (!response.ok) throw new Error('Erro ao carregar ' + nomeFicheiro);

    const arrayBuffer = await response.arrayBuffer();
    const workbook = XLSX.read(arrayBuffer, { type: 'array' });

    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

    // As colunas estão na linha 2, então os dados começam em 3
    const headers = jsonData[1].map((h) => normalizarTexto(h));
    for (let i = 2; i < jsonData.length; i++) {
      const row = jsonData[i];
      if (!row.length) continue;

      const livro = {
        titulo: row[headers.indexOf('titulo') || 0],
        autor: row[headers.indexOf('autor') || 1],
        editorial: row[headers.indexOf('editorial') || 2],
        edicion: row[headers.indexOf('edicion') || 3],
        ano: row[headers.indexOf('año')] || row[headers.indexOf('ano')],
        isbn: row[headers.indexOf('isbn')],
        titulacion: row[headers.indexOf('titulacion')],
        tematica: row[headers.indexOf('tematica')],
        signatura: row[headers.indexOf('signatura topografica')],
        resumen: row[headers.indexOf('resumen')],
      };
      catalogo[faculdade].push(livro);
    }
  } catch (e) {
    console.warn('Erro ao ler', nomeFicheiro, e);
  }
}

// Função para buscar livros por título e faculdade
function buscarLivros() {
  const termo = normalizarTexto(document.getElementById('busca').value);
  const faculdade = document.getElementById('faculdade').value;
  let resultados = [];

  if (faculdade === 'todas') {
    resultados = [...catalogo.salud, ...catalogo.nti];
  } else {
    resultados = catalogo[faculdade];
  }

  if (termo) {
    resultados = resultados.filter((livro) =>
      normalizarTexto(livro.titulo).includes(termo)
    );
  }

  mostrarResultados(resultados);
}

// Função para mostrar os resultados na página
function mostrarResultados(lista) {
  const container = document.getElementById('resultados');
  container.innerHTML = '';

  if (!lista.length) {
    container.innerHTML = '<p>Nenhum livro encontrado.</p>';
    return;
  }

  lista.forEach((livro) => {
    const item = document.createElement('div');
    item.classList.add('livro');
    item.innerHTML = `
      <h3>${livro.titulo || 'Título não disponível'}</h3>
      <p><strong>Autor:</strong> ${livro.autor || '—'}</p>
      <p><strong>Editorial:</strong> ${livro.editorial || '—'}</p>
      <p><strong>Año:</strong> ${livro.ano || '—'}</p>
      <p><strong>Signatura:</strong> ${livro.signatura || '—'}</p>
      <p><em>${livro.resumen || ''}</em></p>
    `;
    container.appendChild(item);
  });
}

// Carregar catálogos ao iniciar
window.addEventListener('DOMContentLoaded', carregarCatalogo);

// Evento do botão de busca
document.getElementById('buscarBtn').addEventListener('click', buscarLivros);

// Botão "Mostrar todos"
document.getElementById('mostrarTodos').addEventListener('click', () =>
  mostrarResultados([...catalogo.salud, ...catalogo.nti])
);
