// routes/dashboard.js
// Estatísticas rápidas para a tela inicial (usa agregação: COUNT e SUM).
// Tudo aqui ignora vendas canceladas e já considera desconto e taxa de entrega de cada venda.

const express = require('express');
const router = express.Router();
const db = require('../db');

router.get('/', async (req, res) => {
  try {
    const [[{ total_clientes }]] = await db.query('SELECT COUNT(*) AS total_clientes FROM clientes');
    const [[{ total_produtos }]] = await db.query('SELECT COUNT(*) AS total_produtos FROM produtos');
    const [[{ total_vendas }]] = await db.query('SELECT COUNT(*) AS total_vendas FROM vendas WHERE cancelada = 0');

    const [[{ faturamento }]] = await db.query(`
      SELECT
        (SELECT COALESCE(SUM(vi.quantidade * vi.preco_unitario), 0)
         FROM venda_itens vi
         INNER JOIN vendas v ON v.venda_id = vi.venda_id
         WHERE v.cancelada = 0)
        -
        (SELECT COALESCE(SUM(desconto), 0) FROM vendas WHERE cancelada = 0)
        +
        (SELECT COALESCE(SUM(taxa_entrega), 0) FROM vendas WHERE cancelada = 0)
        AS faturamento
    `);

    const [[produtoBaixoEstoque]] = await db.query(`
      SELECT COUNT(*) AS total FROM produtos WHERE estoque < 10
    `);

    res.json({
      total_clientes,
      total_produtos,
      total_vendas,
      faturamento,
      produtos_baixo_estoque: produtoBaixoEstoque.total,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao buscar estatísticas' });
  }
});

// GET /dashboard/vendas-por-dia -> faturamento líquido por dia nos últimos 14 dias (para o gráfico)
router.get('/vendas-por-dia', async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT dia, SUM(total_liquido) AS total
      FROM (
        SELECT v.venda_id, DATE(v.data_venda) AS dia,
               COALESCE(SUM(vi.quantidade * vi.preco_unitario), 0) - v.desconto + v.taxa_entrega AS total_liquido
        FROM vendas v
        LEFT JOIN venda_itens vi ON vi.venda_id = v.venda_id
        WHERE v.cancelada = 0 AND v.data_venda >= DATE_SUB(CURDATE(), INTERVAL 13 DAY)
        GROUP BY v.venda_id, dia, v.desconto, v.taxa_entrega
      ) por_venda
      GROUP BY dia
      ORDER BY dia ASC
    `);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao buscar vendas por dia' });
  }
});

// GET /dashboard/mais-vendidos -> top 5 produtos por quantidade vendida (ignora vendas canceladas)
router.get('/mais-vendidos', async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT p.produto_id, p.nome, SUM(vi.quantidade) AS quantidade_vendida
      FROM venda_itens vi
      INNER JOIN vendas v ON v.venda_id = vi.venda_id
      INNER JOIN produtos p ON p.produto_id = vi.produto_id
      WHERE v.cancelada = 0
      GROUP BY p.produto_id, p.nome
      ORDER BY quantidade_vendida DESC
      LIMIT 5
    `);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao buscar produtos mais vendidos' });
  }
});

// GET /dashboard/delivery -> métricas exclusivas do delivery (pro painel interno)
router.get('/delivery', async (req, res) => {
  try {
    const [[{ pedidos_hoje }]] = await db.query(`
      SELECT COUNT(*) AS pedidos_hoje FROM pedidos WHERE DATE(data_pedido) = CURDATE()
    `);

    const [[{ em_andamento }]] = await db.query(`
      SELECT COUNT(*) AS em_andamento FROM pedidos WHERE status IN ('novo', 'preparando', 'saiu_entrega')
    `);

    const [[{ faturamento_hoje }]] = await db.query(`
      SELECT
        COALESCE((SELECT SUM(vi.quantidade * vi.preco_unitario)
                  FROM venda_itens vi
                  INNER JOIN vendas v ON v.venda_id = vi.venda_id
                  WHERE v.origem = 'delivery' AND v.cancelada = 0 AND DATE(v.data_venda) = CURDATE()), 0)
        -
        COALESCE((SELECT SUM(desconto) FROM vendas WHERE origem = 'delivery' AND cancelada = 0 AND DATE(data_venda) = CURDATE()), 0)
        +
        COALESCE((SELECT SUM(taxa_entrega) FROM vendas WHERE origem = 'delivery' AND cancelada = 0 AND DATE(data_venda) = CURDATE()), 0)
        AS faturamento_hoje
    `);

    res.json({ pedidos_hoje, em_andamento, faturamento_hoje });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao buscar estatísticas do delivery' });
  }
});

module.exports = router;
