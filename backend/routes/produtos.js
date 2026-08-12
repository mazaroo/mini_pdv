// routes/produtos.js
// Rotas relacionadas a produtos: listar, cadastrar e upload de foto

const express = require('express');
const router = express.Router();
const path = require('path');
const multer = require('multer');
const db = require('../db');
const { exigirPermissao } = require('../utils/permissoes');

// GET /produtos -> lista todos os produtos, já com o nome da categoria (INNER JOIN)
router.get('/', async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT p.produto_id, p.nome, p.preco, p.estoque, p.imagem, c.nome AS categoria
      FROM produtos p
      INNER JOIN categorias c ON p.categoria_id = c.categoria_id
      ORDER BY p.produto_id ASC
    `);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao buscar produtos' });
  }
});

// POST /produtos -> cadastra um novo produto
router.post('/', exigirPermissao('pode_produtos'), async (req, res) => {
  const { nome, categoria_id, preco, estoque } = req.body;

  if (!nome || !categoria_id || !preco) {
    return res.status(400).json({ erro: 'Nome, categoria e preço são obrigatórios' });
  }

  try {
    const [resultado] = await db.query(
      'INSERT INTO produtos (nome, categoria_id, preco, estoque) VALUES (?, ?, ?, ?)',
      [nome, categoria_id, preco, estoque || 0]
    );
    res.json({ mensagem: 'Produto cadastrado com sucesso', id: resultado.insertId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao cadastrar produto' });
  }
});

// PUT /produtos/:id -> atualiza um produto existente
router.put('/:id', exigirPermissao('pode_produtos'), async (req, res) => {
  const { nome, categoria_id, preco, estoque } = req.body;

  if (!nome || !categoria_id || !preco) {
    return res.status(400).json({ erro: 'Nome, categoria e preço são obrigatórios' });
  }

  try {
    await db.query(
      'UPDATE produtos SET nome = ?, categoria_id = ?, preco = ?, estoque = ? WHERE produto_id = ?',
      [nome, categoria_id, preco, estoque || 0, req.params.id]
    );
    res.json({ mensagem: 'Produto atualizado com sucesso' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao atualizar produto' });
  }
});

// ---------- upload de foto do produto ----------

const armazenamento = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, '..', '..', 'frontend', 'uploads', 'produtos'));
  },
  filename: (req, file, cb) => {
    const extensao = path.extname(file.originalname).toLowerCase();
    cb(null, `produto-${req.params.id}-${Date.now()}${extensao}`);
  },
});

const upload = multer({
  storage: armazenamento,
  limits: { fileSize: 3 * 1024 * 1024 }, // 3MB
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      return cb(new Error('O arquivo precisa ser uma imagem'));
    }
    cb(null, true);
  },
});

// Envolve o multer pra transformar os erros dele (arquivo grande demais, tipo errado)
// numa resposta JSON normal, em vez de travar a requisição
function receberImagem(req, res, next) {
  upload.single('imagem')(req, res, (err) => {
    if (err) {
      return res.status(400).json({ erro: err.message || 'Erro ao enviar imagem' });
    }
    next();
  });
}

// POST /produtos/:id/imagem -> envia/substitui a foto de um produto já cadastrado
router.post('/:id/imagem', exigirPermissao('pode_produtos'), receberImagem, async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ erro: 'Nenhuma imagem enviada' });
  }

  const caminhoRelativo = `uploads/produtos/${req.file.filename}`;

  try {
    await db.query('UPDATE produtos SET imagem = ? WHERE produto_id = ?', [caminhoRelativo, req.params.id]);
    res.json({ mensagem: 'Imagem enviada com sucesso', imagem: caminhoRelativo });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao salvar imagem' });
  }
});

// DELETE /produtos/:id -> remove um produto
router.delete('/:id', exigirPermissao('pode_produtos'), async (req, res) => {
  try {
    await db.query('DELETE FROM produtos WHERE produto_id = ?', [req.params.id]);
    res.json({ mensagem: 'Produto removido com sucesso' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao remover produto. Verifique se ele não possui vendas registradas.' });
  }
});

module.exports = router;
