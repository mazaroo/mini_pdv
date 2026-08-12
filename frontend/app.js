// app.js
// Funções auxiliares usadas em todas as páginas

// Vazio = "mesma origem de onde a página foi carregada". Funciona tanto em
// localhost:3000 quanto no domínio de produção, sem precisar trocar nada aqui.
const API_URL = '';

// Manda junto quem está logado, pra o backend conferir permissão.
// (não é uma sessão segura de verdade — dá pra falsificar no DevTools — mas já
// impede que a API aceite ações de quem a tela não deixaria fazer)
function headerFuncionario() {
  const usuario = getUsuarioLogado();
  return usuario ? { 'x-funcionario-id': usuario.funcionario_id } : {};
}

async function apiGet(caminho) {
  const resposta = await fetch(API_URL + caminho, { headers: headerFuncionario() });
  return resposta.json();
}

async function apiPost(caminho, dados) {
  const resposta = await fetch(API_URL + caminho, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headerFuncionario() },
    body: JSON.stringify(dados),
  });
  return resposta.json();
}

async function apiPut(caminho, dados) {
  const resposta = await fetch(API_URL + caminho, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...headerFuncionario() },
    body: JSON.stringify(dados),
  });
  return resposta.json();
}

// Envio de arquivo (multipart/form-data) — não usa apiPost porque esse aqui
// não pode forçar Content-Type: application/json, o navegador define sozinho
async function apiUpload(caminho, formData) {
  const resposta = await fetch(API_URL + caminho, {
    method: 'POST',
    headers: headerFuncionario(),
    body: formData,
  });
  return resposta.json();
}

async function apiDelete(caminho) {
  const resposta = await fetch(API_URL + caminho, { method: 'DELETE', headers: headerFuncionario() });
  return resposta.json();
}

// ---------- máscaras e validações (CPF, telefone, email) ----------

// Aplica a máscara 000.000.000-00 enquanto o usuário digita
function mascararCPF(valor) {
  return valor
    .replace(/\D/g, '')
    .slice(0, 11)
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
}

// Aplica a máscara (00) 00000-0000 enquanto o usuário digita
function mascararTelefone(valor) {
  return valor
    .replace(/\D/g, '')
    .slice(0, 11)
    .replace(/(\d{2})(\d)/, '($1) $2')
    .replace(/(\d{4,5})(\d{4})$/, '$1-$2');
}

// Valida CPF de verdade, conferindo os dois dígitos verificadores
function validarCPF(cpf) {
  cpf = (cpf || '').replace(/\D/g, '');
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;

  let soma = 0;
  for (let i = 0; i < 9; i++) soma += parseInt(cpf[i]) * (10 - i);
  let resto = (soma * 10) % 11;
  if (resto === 10 || resto === 11) resto = 0;
  if (resto !== parseInt(cpf[9])) return false;

  soma = 0;
  for (let i = 0; i < 10; i++) soma += parseInt(cpf[i]) * (11 - i);
  resto = (soma * 10) % 11;
  if (resto === 10 || resto === 11) resto = 0;
  if (resto !== parseInt(cpf[10])) return false;

  return true;
}

// Aceita (00) 0000-0000 ou (00) 00000-0000
function validarTelefone(telefone) {
  return /^\(\d{2}\)\s\d{4,5}-\d{4}$/.test((telefone || '').trim());
}

function validarEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((email || '').trim());
}

// ---------- tema claro/escuro ----------

// Chamada bem cedo (no <head>) pra aplicar o tema salvo antes da página desenhar na tela
function aplicarTemaSalvo() {
  const tema = localStorage.getItem('tema') || 'escuro';
  document.documentElement.setAttribute('data-tema', tema);
}

function alternarTema() {
  const atual = document.documentElement.getAttribute('data-tema') === 'claro' ? 'claro' : 'escuro';
  const novo = atual === 'claro' ? 'escuro' : 'claro';

  localStorage.setItem('tema', novo);
  document.documentElement.setAttribute('data-tema', novo);
  document.querySelectorAll('.icone-tema').forEach(el => { el.textContent = novo === 'claro' ? '🌙' : '☀️'; });
  document.dispatchEvent(new CustomEvent('temaAlterado', { detail: novo }));
}

// ---------- sessão do funcionário logado ----------

function getUsuarioLogado() {
  try {
    return JSON.parse(localStorage.getItem('usuarioLogado'));
  } catch {
    return null;
  }
}

// Chame no topo de toda página que exige login: manda pro login se ninguém estiver logado
function exigirLogin() {
  if (!getUsuarioLogado()) {
    window.location.href = 'login.html';
  }
}

function logout() {
  localStorage.removeItem('usuarioLogado');
  window.location.href = 'login.html';
}

// Chame depois de exigirLogin() nas páginas que exigem uma permissão específica
// (ex.: 'pode_produtos'). Admin sempre passa. Quem não tem permissão volta pro início.
function exigirPermissao(nomePermissao) {
  const usuario = getUsuarioLogado();
  if (!usuario) return;

  if (!usuario.is_admin && !usuario[nomePermissao]) {
    mostrarToast('Você não tem permissão para acessar essa página', 'erro');
    window.location.href = 'index.html';
  }
}

// Chame nas páginas exclusivas do administrador (ex.: admin.html)
function exigirAdmin() {
  const usuario = getUsuarioLogado();
  if (!usuario) return;

  if (!usuario.is_admin) {
    mostrarToast('Essa página é só para administradores', 'erro');
    window.location.href = 'index.html';
  }
}

// ---------- marca / avatar / animações ----------

// Monta o logotipo (badge com gradiente + ícone) — usar em vez do emoji genérico.
// tamanho: 'normal' (navbar) ou 'grande' (telas de login/início)
function logoHTML(tamanho = 'normal') {
  return `
    <span class="logo ${tamanho === 'grande' ? 'logo-grande' : ''}">
      <span class="logo-mark">
        <svg viewBox="0 0 24 24"><path d="M6 2L3 7v13a2 2 0 002 2h14a2 2 0 002-2V7l-3-5H6zm0 2h12l1.5 3h-15L6 4zM5 9h14v11H5V9zm3 2v2a4 4 0 008 0v-2h-2v2a2 2 0 01-4 0v-2H8z"/></svg>
      </span>
      <span class="logo-texto">Mini <b>PDV</b></span>
    </span>
  `;
}

// Círculo colorido com a inicial do nome, cor derivada do próprio nome (sempre a mesma pra cada pessoa)
function avatarHTML(nome) {
  const inicial = (nome || '?').trim().charAt(0).toUpperCase();
  let hash = 0;
  for (let i = 0; i < nome.length; i++) hash = nome.charCodeAt(i) + ((hash << 5) - hash);
  const matiz = Math.abs(hash) % 360;
  return `<span class="avatar" style="background: hsl(${matiz}, 55%, 42%)">${inicial}</span>`;
}

// Aplica uma animação leve de entrada (fade + slide) nas linhas de uma tabela,
// com um pequeno atraso em cascata entre elas. Chame depois de preencher o tbody.
function animarLinhas(tbody) {
  [...tbody.children].forEach((linha, i) => {
    linha.classList.add('linha-animada');
    linha.style.animationDelay = `${Math.min(i * 30, 300)}ms`;
  });
}

function formatarMoeda(valor) {
  return Number(valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatarData(dataString) {
  if (!dataString) return '';
  const data = new Date(dataString);
  return data.toLocaleString('pt-BR');
}

// Monta a barra de navegação fixa no topo, destacando a página atual.
// Esconde da navegação as páginas que o funcionário logado não tem permissão de usar.
function renderizarNavbar(paginaAtual) {
  const usuario = getUsuarioLogado();

  const todasPaginas = [
    { id: 'inicio', href: 'index.html', label: '🏠 Início' },
    { id: 'clientes', href: 'clientes.html', label: '👤 Clientes', permissao: 'pode_clientes' },
    { id: 'produtos', href: 'produtos.html', label: '📦 Produtos', permissao: 'pode_produtos' },
    { id: 'vendas', href: 'vendas.html', label: '💰 Nova Venda', permissao: 'pode_vendas' },
    { id: 'historico', href: 'historico.html', label: '📋 Histórico', permissao: 'pode_historico' },
    { id: 'delivery', href: 'delivery.html', label: '🛵 Delivery', permissao: 'pode_delivery' },
  ];

  const paginas = todasPaginas.filter(p => {
    if (!p.permissao || !usuario) return true;
    return usuario.is_admin || usuario[p.permissao];
  });

  if (usuario && usuario.is_admin) {
    paginas.push({ id: 'admin', href: 'admin.html', label: '⚙️ Admin' });
  }

  const links = paginas
    .map(p => `<a href="${p.href}" class="${p.id === paginaAtual ? 'ativo' : ''}">${p.label}</a>`)
    .join('');

  const temaAtual = document.documentElement.getAttribute('data-tema') === 'claro' ? 'claro' : 'escuro';

  const nav = document.createElement('nav');
  nav.className = 'navbar';
  nav.innerHTML = `
    <a href="index.html" class="navbar-brand">${logoHTML()}</a>
    <div class="navbar-links">${links}</div>
    <div class="navbar-usuario">
      <button type="button" id="btn-tema" title="Alternar tema claro/escuro">
        <span class="icone-tema">${temaAtual === 'claro' ? '🌙' : '☀️'}</span>
      </button>
      ${usuario ? `<a href="perfil.html" class="navbar-perfil ${paginaAtual === 'perfil' ? 'ativo' : ''}">${avatarHTML(usuario.nome)} ${usuario.nome}</a><button type="button" id="btn-sair">Sair</button>` : ''}
    </div>
  `;

  document.body.insertBefore(nav, document.body.firstChild);

  document.getElementById('btn-tema').addEventListener('click', alternarTema);

  if (usuario) {
    document.getElementById('btn-sair').addEventListener('click', logout);
  }
}

// Gera e baixa um CSV (abre certinho no Excel) a partir de um array de objetos
function exportarCSV(nomeArquivo, cabecalhos, linhas) {
  const escapar = (valor) => `"${String(valor ?? '').replace(/"/g, '""')}"`;

  const conteudo = [
    cabecalhos.map(escapar).join(';'),
    ...linhas.map(linha => linha.map(escapar).join(';')),
  ].join('\r\n');

  // BOM no início ajuda o Excel a reconhecer acentuação em UTF-8
  const blob = new Blob(['﻿' + conteudo], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = nomeArquivo;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

// Mostra um aviso flutuante no canto da tela (sucesso ou erro)
function mostrarToast(texto, tipo = 'sucesso') {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast toast-${tipo}`;
  toast.textContent = texto;
  container.appendChild(toast);

  setTimeout(() => toast.classList.add('toast-sair'), 3000);
  setTimeout(() => toast.remove(), 3400);
}
