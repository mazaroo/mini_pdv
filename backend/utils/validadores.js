// utils/validadores.js
// Validações reutilizadas nas rotas que recebem CPF, telefone e email

// Confere os dois dígitos verificadores do CPF (não é só formato, é o cálculo de verdade)
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

module.exports = { validarCPF, validarTelefone, validarEmail };
