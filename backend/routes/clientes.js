// routes/clientes.js
// Rotas relacionadas a clientes: listar e cadastrar

const express = require('express');
const router = express.Router();
const db = require('../db');
const { validarCPF, validarTelefone, validarEmail } = require('../utils/validadores');
const { exigirPermissao } = require('../utils/permissoes');

// Confere CPF/telefone/email só quando preenchidos (são campos opcionais)
function validarDadosCliente(cpf, telefone, email) {
  if (cpf && !validarCPF(cpf)) return 'CPF inválido';
  if (telefone && !validarTelefone(telefone)) return 'Telefone inválido. Use o formato (00) 00000-0000';
  if (email && !validarEmail(email)) return 'Email inválido';
  return null;
}

// GET /clientes -> lista todos os clientes
router.get('/', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM clientes ORDER BY cliente_id ASC');
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao buscar clientes' });
  }
});

// POST /clientes -> cadastra um novo cliente
router.post('/', exigirPermissao('pode_clientes'), async (req, res) => {
  const { nome, cpf, telefone, email } = req.body;

  if (!nome) {
    return res.status(400).json({ erro: 'Nome é obrigatório' });
  }

  const erroValidacao = validarDadosCliente(cpf, telefone, email);
  if (erroValidacao) {
    return res.status(400).json({ erro: erroValidacao });
  }

  try {
    const [resultado] = await db.query(
      'INSERT INTO clientes (nome, cpf, telefone, email, data_cadastro) VALUES (?, ?, ?, ?, CURDATE())',
      [nome, cpf, telefone, email]
    );
    res.json({ mensagem: 'Cliente cadastrado com sucesso', id: resultado.insertId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao cadastrar cliente' });
  }
});

// PUT /clientes/:id -> atualiza um cliente existente
router.put('/:id', exigirPermissao('pode_clientes'), async (req, res) => {
  const { nome, cpf, telefone, email } = req.body;

  if (!nome) {
    return res.status(400).json({ erro: 'Nome é obrigatório' });
  }

  const erroValidacao = validarDadosCliente(cpf, telefone, email);
  if (erroValidacao) {
    return res.status(400).json({ erro: erroValidacao });
  }

  try {
    await db.query(
      'UPDATE clientes SET nome = ?, cpf = ?, telefone = ?, email = ? WHERE cliente_id = ?',
      [nome, cpf, telefone, email, req.params.id]
    );
    res.json({ mensagem: 'Cliente atualizado com sucesso' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao atualizar cliente' });
  }
});

// GET /clientes/:id/vendas -> histórico de compras de um cliente específico (ficha do cliente)
router.get('/:id/vendas', exigirPermissao('pode_clientes'), async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT v.venda_id, v.data_venda, v.forma_pagamento, v.cancelada, v.origem,
             COALESCE(SUM(vi.quantidade * vi.preco_unitario), 0) - v.desconto + v.taxa_entrega AS total
      FROM vendas v
      LEFT JOIN venda_itens vi ON vi.venda_id = v.venda_id
      WHERE v.cliente_id = ?
      GROUP BY v.venda_id, v.data_venda, v.forma_pagamento, v.cancelada, v.origem, v.desconto, v.taxa_entrega
      ORDER BY v.venda_id DESC
    `, [req.params.id]);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao buscar histórico do cliente' });
  }
});

// DELETE /clientes/:id -> remove um cliente
router.delete('/:id', exigirPermissao('pode_clientes'), async (req, res) => {
  try {
    await db.query('DELETE FROM clientes WHERE cliente_id = ?', [req.params.id]);
    res.json({ mensagem: 'Cliente removido com sucesso' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao remover cliente. Verifique se ele não possui vendas registradas.' });
  }
});

module.exports = router;
