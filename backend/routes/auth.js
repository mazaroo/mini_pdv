// routes/auth.js
// Login simples: funcionário informa nome + senha, comparamos com o hash salvo no banco

const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const db = require('../db');

// POST /auth/login -> confere nome + senha e devolve os dados do funcionário (sem a senha)
router.post('/login', async (req, res) => {
  const { funcionario_id, senha } = req.body;

  if (!funcionario_id || !senha) {
    return res.status(400).json({ erro: 'Selecione o funcionário e digite a senha' });
  }

  try {
    const [rows] = await db.query(
      `SELECT funcionario_id, nome, cargo, senha, is_admin, pode_produtos, pode_clientes, pode_vendas, pode_historico, pode_delivery, pode_financeiro
       FROM funcionarios WHERE funcionario_id = ?`,
      [funcionario_id]
    );

    if (rows.length === 0) {
      return res.status(401).json({ erro: 'Funcionário ou senha inválidos' });
    }

    const funcionario = rows[0];
    const senhaCorreta = await bcrypt.compare(senha, funcionario.senha || '');

    if (!senhaCorreta) {
      return res.status(401).json({ erro: 'Funcionário ou senha inválidos' });
    }

    res.json({
      funcionario_id: funcionario.funcionario_id,
      nome: funcionario.nome,
      cargo: funcionario.cargo,
      is_admin: !!funcionario.is_admin,
      pode_produtos: !!funcionario.pode_produtos,
      pode_clientes: !!funcionario.pode_clientes,
      pode_vendas: !!funcionario.pode_vendas,
      pode_historico: !!funcionario.pode_historico,
      pode_delivery: !!funcionario.pode_delivery,
      pode_financeiro: !!funcionario.pode_financeiro,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao fazer login' });
  }
});

// PUT /auth/senha -> funcionário troca a própria senha (precisa confirmar a senha atual)
router.put('/senha', async (req, res) => {
  const { funcionario_id, senhaAtual, novaSenha } = req.body;

  if (!funcionario_id || !senhaAtual || !novaSenha) {
    return res.status(400).json({ erro: 'Preencha a senha atual e a nova senha' });
  }
  if (novaSenha.length < 4) {
    return res.status(400).json({ erro: 'A nova senha precisa ter pelo menos 4 caracteres' });
  }

  try {
    const [rows] = await db.query('SELECT senha FROM funcionarios WHERE funcionario_id = ?', [funcionario_id]);
    if (rows.length === 0) {
      return res.status(404).json({ erro: 'Funcionário não encontrado' });
    }

    const senhaCorreta = await bcrypt.compare(senhaAtual, rows[0].senha || '');
    if (!senhaCorreta) {
      return res.status(401).json({ erro: 'Senha atual incorreta' });
    }

    const novoHash = await bcrypt.hash(novaSenha, 10);
    await db.query('UPDATE funcionarios SET senha = ? WHERE funcionario_id = ?', [novoHash, funcionario_id]);

    res.json({ mensagem: 'Senha alterada com sucesso' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao trocar senha' });
  }
});

module.exports = router;
