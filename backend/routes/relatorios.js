// routes/relatorios.js
// Relatórios gerenciais: faturamento por período, ranking por vendedor
// (reaproveita funcionario_id já existente em vendas — não é uma entidade
// nova) e produtos mais vendidos. Tudo somado a partir de vendas/venda_itens
// já existentes, com os mesmos filtros opcionais em todas as rotas.

const express = require('express');
const router = express.Router();
const db = require('../db');
const { exigirPermissao } = require('../utils/permissoes');

// Monta o WHERE dinâmico (sempre com placeholders, nunca concatenando valor
// direto na string) a partir dos filtros opcionais da query string:
// de / ate (intervalo de data_venda), funcionario_id, forma_pagamento, origem.
function montarFiltros(query) {
  const condicoes = ['v.cancelada = 0'];
  const params = [];

  if (query.de) {
    condicoes.push('v.data_venda >= ?');
    params.push(query.de);
  }
  if (query.ate) {
    condicoes.push('v.data_venda < DATE_ADD(?, INTERVAL 1 DAY)');
    params.push(query.ate);
  }
  if (query.funcionario_id) {
    condicoes.push('v.funcionario_id = ?');
    params.push(query.funcionario_id);
  }
  if (query.forma_pagamento && query.forma_pagamento !== 'todas') {
    condicoes.push('v.forma_pagamento = ?');
    params.push(query.forma_pagamento);
  }
  if (query.origem && query.origem !== 'todas') {
    condicoes.push('v.origem = ?');
    params.push(query.origem);
  }

  return { where: condicoes.join(' AND '), params };
}

// GET /relatorios/resumo -> totais do período/filtro selecionado (cards de resumo)
router.get('/resumo', exigirPermissao('pode_relatorios'), async (req, res) => {
  try {
    const { where, params } = montarFiltros(req.query);
    const [[resumo]] = await db.query(`
      SELECT
        COUNT(*) AS total_vendas,
        COALESCE(SUM(total_liquido), 0) AS faturamento,
        COALESCE(AVG(total_liquido), 0) AS ticket_medio
      FROM (
        SELECT v.venda_id,
               COALESCE(SUM(vi.quantidade * vi.preco_unitario), 0) - v.desconto + v.taxa_entrega AS total_liquido
        FROM vendas v
        LEFT JOIN venda_itens vi ON vi.venda_id = v.venda_id
        WHERE ${where}
        GROUP BY v.venda_id, v.desconto, v.taxa_entrega
      ) por_venda
    `, params);
    res.json(resumo);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao buscar resumo do relatório' });
  }
});

// GET /relatorios/por-periodo -> faturamento por dia dentro do período/filtro selecionado
router.get('/por-periodo', exigirPermissao('pode_relatorios'), async (req, res) => {
  try {
    const { where, params } = montarFiltros(req.query);
    const [rows] = await db.query(`
      SELECT dia, COUNT(*) AS total_vendas, SUM(total_liquido) AS faturamento
      FROM (
        SELECT v.venda_id, DATE(v.data_venda) AS dia,
               COALESCE(SUM(vi.quantidade * vi.preco_unitario), 0) - v.desconto + v.taxa_entrega AS total_liquido
        FROM vendas v
        LEFT JOIN venda_itens vi ON vi.venda_id = v.venda_id
        WHERE ${where}
        GROUP BY v.venda_id, dia, v.desconto, v.taxa_entrega
      ) por_venda
      GROUP BY dia
      ORDER BY dia ASC
    `, params);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao buscar faturamento por período' });
  }
});

// GET /relatorios/por-funcionario -> ranking de vendas por vendedor (funcionario_id de vendas)
router.get('/por-funcionario', exigirPermissao('pode_relatorios'), async (req, res) => {
  try {
    const { where, params } = montarFiltros(req.query);
    const [rows] = await db.query(`
      SELECT f.funcionario_id, f.nome AS funcionario,
             COUNT(DISTINCT v.venda_id) AS total_vendas,
             COALESCE(SUM(total_liquido.valor), 0) AS faturamento
      FROM vendas v
      INNER JOIN funcionarios f ON f.funcionario_id = v.funcionario_id
      INNER JOIN (
        SELECT v2.venda_id,
               COALESCE(SUM(vi.quantidade * vi.preco_unitario), 0) - v2.desconto + v2.taxa_entrega AS valor
        FROM vendas v2
        LEFT JOIN venda_itens vi ON vi.venda_id = v2.venda_id
        GROUP BY v2.venda_id, v2.desconto, v2.taxa_entrega
      ) total_liquido ON total_liquido.venda_id = v.venda_id
      WHERE ${where}
      GROUP BY f.funcionario_id, f.nome
      ORDER BY faturamento DESC
    `, params);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao buscar ranking por funcionário' });
  }
});

// GET /relatorios/por-produto -> top produtos por faturamento no período/filtro selecionado.
// Faturamento aqui é bruto por item (quantidade * preco_unitario) — desconto e taxa de
// entrega são por-venda, não por-item, então não dá pra ratear com precisão por produto
// (mesma limitação implícita que dashboard.js /mais-vendidos já tem).
router.get('/por-produto', exigirPermissao('pode_relatorios'), async (req, res) => {
  try {
    const { where, params } = montarFiltros(req.query);
    const [rows] = await db.query(`
      SELECT p.produto_id, p.nome,
             SUM(vi.quantidade) AS quantidade_vendida,
             SUM(vi.quantidade * vi.preco_unitario) AS faturamento_bruto
      FROM venda_itens vi
      INNER JOIN vendas v ON v.venda_id = vi.venda_id
      INNER JOIN produtos p ON p.produto_id = vi.produto_id
      WHERE ${where}
      GROUP BY p.produto_id, p.nome
      ORDER BY faturamento_bruto DESC
      LIMIT 20
    `, params);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao buscar produtos mais vendidos' });
  }
});

// GET /relatorios/vendas/analitico -> 1 linha por venda, com produtos resumidos e desconto.
// GROUP_CONCAT monta "3x Coca-Cola, 1x Pão de forma" — não é uma linha por item,
// é o resumo dos produtos daquela venda numa coluna só.
router.get('/vendas/analitico', exigirPermissao('pode_relatorios'), async (req, res) => {
  try {
    const { where, params } = montarFiltros(req.query);
    const [rows] = await db.query(`
      SELECT v.venda_id, v.data_venda, COALESCE(c.nome, 'Consumidor Final') AS cliente,
             f.nome AS vendedor, v.forma_pagamento, v.desconto,
             GROUP_CONCAT(CONCAT(vi.quantidade, 'x ', p.nome) SEPARATOR ', ') AS produtos,
             COALESCE(SUM(vi.quantidade * vi.preco_unitario), 0) - v.desconto + v.taxa_entrega AS total
      FROM vendas v
      LEFT JOIN clientes c ON v.cliente_id = c.cliente_id
      INNER JOIN funcionarios f ON f.funcionario_id = v.funcionario_id
      LEFT JOIN venda_itens vi ON vi.venda_id = v.venda_id
      LEFT JOIN produtos p ON p.produto_id = vi.produto_id
      WHERE ${where}
      GROUP BY v.venda_id, v.data_venda, c.nome, f.nome, v.forma_pagamento, v.desconto, v.taxa_entrega
      ORDER BY v.venda_id DESC
    `, params);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao buscar relatório analítico de vendas' });
  }
});

// GET /relatorios/vendas/sintetico -> 1 linha por venda, versão enxuta (sem produtos/forma de
// pagamento/desconto como coluna — mas esses filtros continuam funcionando via WHERE).
router.get('/vendas/sintetico', exigirPermissao('pode_relatorios'), async (req, res) => {
  try {
    const { where, params } = montarFiltros(req.query);
    const [rows] = await db.query(`
      SELECT v.venda_id, v.data_venda, COALESCE(c.nome, 'Consumidor Final') AS cliente,
             f.nome AS vendedor,
             COALESCE(SUM(vi.quantidade * vi.preco_unitario), 0) - v.desconto + v.taxa_entrega AS total
      FROM vendas v
      LEFT JOIN clientes c ON v.cliente_id = c.cliente_id
      INNER JOIN funcionarios f ON f.funcionario_id = v.funcionario_id
      LEFT JOIN venda_itens vi ON vi.venda_id = v.venda_id
      WHERE ${where}
      GROUP BY v.venda_id, v.data_venda, c.nome, f.nome, v.desconto, v.taxa_entrega
      ORDER BY v.venda_id DESC
    `, params);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao buscar relatório sintético de vendas' });
  }
});

module.exports = router;
