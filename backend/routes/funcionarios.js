// routes/funcionarios.js
// Listagem (usada até no <select> de login) e, pra quem é admin,
// cadastro/edição/permissões/exclusão de funcionários.

const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const db = require('../db');
const { exigirAdmin } = require('../utils/permissoes');

router.get('/', async (req, res) => {
  try {
    // nunca devolve a coluna "senha" pro frontend
    const [rows] = await db.query(`
      SELECT funcionario_id, nome, cargo, salario, data_contratacao,
             is_admin, pode_produtos, pode_clientes, pode_vendas, pode_historico, pode_delivery, pode_financeiro, pode_relatorios
      FROM funcionarios
    `);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao buscar funcionários' });
  }
});

// POST /funcionarios -> cadastra um novo funcionário (só admin)
router.post('/', exigirAdmin, async (req, res) => {
  const { nome, cargo, salario, senha, pode_produtos, pode_clientes, pode_vendas, pode_historico, pode_delivery, pode_financeiro, pode_relatorios } = req.body;

  if (!nome || !senha) {
    return res.status(400).json({ erro: 'Nome e senha são obrigatórios' });
  }
  if (senha.length < 4) {
    return res.status(400).json({ erro: 'A senha precisa ter pelo menos 4 caracteres' });
  }

  try {
    const hash = await bcrypt.hash(senha, 10);
    const [resultado] = await db.query(
      `INSERT INTO funcionarios (nome, cargo, salario, senha, data_contratacao, pode_produtos, pode_clientes, pode_vendas, pode_historico, pode_delivery, pode_financeiro, pode_relatorios)
       VALUES (?, ?, ?, ?, CURDATE(), ?, ?, ?, ?, ?, ?, ?)`,
      [nome, cargo || null, salario || null, hash, !!pode_produtos, !!pode_clientes, !!pode_vendas, !!pode_historico, !!pode_delivery, !!pode_financeiro, !!pode_relatorios]
    );
    res.json({ mensagem: 'Funcionário cadastrado com sucesso', id: resultado.insertId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao cadastrar funcionário' });
  }
});

// PUT /funcionarios/:id -> edita dados + permissões (só admin)
router.put('/:id', exigirAdmin, async (req, res) => {
  const { nome, cargo, salario, pode_produtos, pode_clientes, pode_vendas, pode_historico, pode_delivery, pode_financeiro, pode_relatorios } = req.body;

  if (!nome) {
    return res.status(400).json({ erro: 'Nome é obrigatório' });
  }

  try {
    await db.query(
      `UPDATE funcionarios
       SET nome = ?, cargo = ?, salario = ?, pode_produtos = ?, pode_clientes = ?, pode_vendas = ?, pode_historico = ?, pode_delivery = ?, pode_financeiro = ?, pode_relatorios = ?
       WHERE funcionario_id = ?`,
      [nome, cargo || null, salario || null, !!pode_produtos, !!pode_clientes, !!pode_vendas, !!pode_historico, !!pode_delivery, !!pode_financeiro, !!pode_relatorios, req.params.id]
    );
    res.json({ mensagem: 'Funcionário atualizado com sucesso' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao atualizar funcionário' });
  }
});

// PUT /funcionarios/:id/senha -> admin reseta a senha de alguém, sem precisar da senha antiga
router.put('/:id/senha', exigirAdmin, async (req, res) => {
  const { novaSenha } = req.body;

  if (!novaSenha || novaSenha.length < 4) {
    return res.status(400).json({ erro: 'A nova senha precisa ter pelo menos 4 caracteres' });
  }

  try {
    const hash = await bcrypt.hash(novaSenha, 10);
    await db.query('UPDATE funcionarios SET senha = ? WHERE funcionario_id = ?', [hash, req.params.id]);
    res.json({ mensagem: 'Senha redefinida com sucesso' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao redefinir senha' });
  }
});

// DELETE /funcionarios/:id -> remove um funcionário (só admin, e nunca o último admin)
router.delete('/:id', exigirAdmin, async (req, res) => {
  try {
    const [alvo] = await db.query('SELECT is_admin FROM funcionarios WHERE funcionario_id = ?', [req.params.id]);
    if (alvo.length === 0) {
      return res.status(404).json({ erro: 'Funcionário não encontrado' });
    }

    if (alvo[0].is_admin) {
      const [[{ totalAdmins }]] = await db.query('SELECT COUNT(*) AS totalAdmins FROM funcionarios WHERE is_admin = 1');
      if (totalAdmins <= 1) {
        return res.status(400).json({ erro: 'Não é possível remover o único administrador' });
      }
    }

    await db.query('DELETE FROM funcionarios WHERE funcionario_id = ?', [req.params.id]);
    res.json({ mensagem: 'Funcionário removido com sucesso' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao remover funcionário. Verifique se ele não possui vendas registradas.' });
  }
});

module.exports = router;
