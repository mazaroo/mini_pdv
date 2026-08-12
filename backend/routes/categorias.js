// routes/categorias.js
// CRUD de categorias de produto. Usa a mesma permissão de produtos (pode_produtos),
// já que categoria é só um detalhe de como produtos são organizados.

const express = require('express');
const router = express.Router();
const db = require('../db');
const { exigirPermissao } = require('../utils/permissoes');

// GET /categorias -> lista todas
router.get('/', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM categorias ORDER BY nome ASC');
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao buscar categorias' });
  }
});

// POST /categorias -> cadastra uma nova categoria
router.post('/', exigirPermissao('pode_produtos'), async (req, res) => {
  const { nome, descricao } = req.body;

  if (!nome || !nome.trim()) {
    return res.status(400).json({ erro: 'Nome da categoria é obrigatório' });
  }

  try {
    const [resultado] = await db.query(
      'INSERT INTO categorias (nome, descricao) VALUES (?, ?)',
      [nome.trim(), descricao || null]
    );
    res.json({ mensagem: 'Categoria cadastrada com sucesso', id: resultado.insertId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao cadastrar categoria' });
  }
});

// PUT /categorias/:id -> edita uma categoria existente
router.put('/:id', exigirPermissao('pode_produtos'), async (req, res) => {
  const { nome, descricao } = req.body;

  if (!nome || !nome.trim()) {
    return res.status(400).json({ erro: 'Nome da categoria é obrigatório' });
  }

  try {
    await db.query(
      'UPDATE categorias SET nome = ?, descricao = ? WHERE categoria_id = ?',
      [nome.trim(), descricao || null, req.params.id]
    );
    res.json({ mensagem: 'Categoria atualizada com sucesso' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao atualizar categoria' });
  }
});

// DELETE /categorias/:id -> remove uma categoria (falha se algum produto ainda usa ela)
router.delete('/:id', exigirPermissao('pode_produtos'), async (req, res) => {
  try {
    const [[{ total }]] = await db.query(
      'SELECT COUNT(*) AS total FROM produtos WHERE categoria_id = ?',
      [req.params.id]
    );
    if (total > 0) {
      return res.status(400).json({
        erro: `Não é possível excluir: ${total} produto(s) ainda usa(m) essa categoria`,
      });
    }

    await db.query('DELETE FROM categorias WHERE categoria_id = ?', [req.params.id]);
    res.json({ mensagem: 'Categoria removida com sucesso' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao remover categoria' });
  }
});

module.exports = router;
