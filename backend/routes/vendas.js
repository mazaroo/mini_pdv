// routes/vendas.js
// Rota mais importante: registra uma venda completa (venda + itens) de uma vez só.
// Também cuida do cancelamento (estorna estoque, marca como cancelada — não apaga o histórico).

const express = require('express');
const router = express.Router();
const db = require('../db');
const { exigirPermissao } = require('../utils/permissoes');

const DIAS_VENCIMENTO_PADRAO = 30;

// GET /vendas -> lista o histórico de vendas com nome do cliente e funcionário.
// cliente é opcional (venda "consumidor final"), por isso o LEFT JOIN + COALESCE.
// total já vem líquido (soma dos itens, menos o desconto, mais a taxa de entrega se for delivery)
router.get('/', exigirPermissao('pode_historico'), async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT v.venda_id, COALESCE(c.nome, 'Consumidor Final') AS cliente, v.cliente_id,
             f.nome AS funcionario, v.data_venda, v.forma_pagamento,
             v.desconto, v.cancelada, v.origem, v.taxa_entrega,
             v.status_pagamento, v.data_vencimento, v.data_pagamento,
             COALESCE(SUM(vi.quantidade * vi.preco_unitario), 0) AS subtotal,
             COALESCE(SUM(vi.quantidade * vi.preco_unitario), 0) - v.desconto + v.taxa_entrega AS total
      FROM vendas v
      LEFT JOIN clientes c ON v.cliente_id = c.cliente_id
      INNER JOIN funcionarios f ON v.funcionario_id = f.funcionario_id
      LEFT JOIN venda_itens vi ON vi.venda_id = v.venda_id
      GROUP BY v.venda_id, c.nome, v.cliente_id, f.nome, v.data_venda, v.forma_pagamento,
               v.desconto, v.cancelada, v.origem, v.taxa_entrega, v.status_pagamento,
               v.data_vencimento, v.data_pagamento
      ORDER BY v.venda_id ASC
    `);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao buscar vendas' });
  }
});

// GET /vendas/:id/itens -> lista os itens de uma venda específica, com nome do produto e valor total
router.get('/:id/itens', exigirPermissao('pode_historico'), async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT vi.item_id, p.nome AS produto, vi.quantidade, vi.preco_unitario,
             (vi.quantidade * vi.preco_unitario) AS valor_total
      FROM venda_itens vi
      INNER JOIN produtos p ON vi.produto_id = p.produto_id
      WHERE vi.venda_id = ?
    `, [req.params.id]);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao buscar itens da venda' });
  }
});

// POST /vendas -> registra uma venda nova, com vários itens de uma vez, desconto opcional,
// cliente opcional ("Consumidor Final") e forma de pagamento "Fiado" (exige cliente cadastrado).
// Formato esperado no corpo da requisição:
// {
//   "cliente_id": 1,               // opcional — sem isso, vira "Consumidor Final"
//   "funcionario_id": 2,
//   "forma_pagamento": "Pix",      // ou "Cartão", "Dinheiro", "Fiado"
//   "desconto": 5.00,              // opcional, valor em R$ já calculado pelo frontend
//   "data_vencimento": "2026-09-11", // só relevante (e obrigatório) se forma_pagamento = "Fiado"
//   "itens": [
//     { "produto_id": 1, "quantidade": 2, "preco_unitario": 8.50 },
//     { "produto_id": 3, "quantidade": 1, "preco_unitario": 22.90 }
//   ]
// }
router.post('/', exigirPermissao('pode_vendas'), async (req, res) => {
  const { cliente_id, funcionario_id, forma_pagamento, itens, desconto, data_vencimento } = req.body;

  if (!funcionario_id || !forma_pagamento || !itens || itens.length === 0) {
    return res.status(400).json({ erro: 'Dados incompletos para registrar a venda' });
  }

  const ehFiado = forma_pagamento === 'Fiado';
  if (ehFiado && !cliente_id) {
    return res.status(400).json({ erro: 'Venda fiado precisa de um cliente cadastrado' });
  }

  // O desconto nunca pode ser negativo nem maior que o subtotal da venda
  const subtotal = itens.reduce((soma, item) => soma + item.quantidade * item.preco_unitario, 0);
  let descontoFinal = Number(desconto) || 0;
  if (descontoFinal < 0) descontoFinal = 0;
  if (descontoFinal > subtotal) descontoFinal = subtotal;

  const statusPagamento = ehFiado ? 'pendente' : 'pago';
  let vencimentoFinal = null;
  if (ehFiado) {
    vencimentoFinal = data_vencimento || null;
    if (!vencimentoFinal) {
      const data = new Date();
      data.setDate(data.getDate() + DIAS_VENCIMENTO_PADRAO);
      vencimentoFinal = data.toISOString().slice(0, 10);
    }
  }

  // Usamos uma "transação": ou tudo é salvo com sucesso, ou nada é salvo
  // (evita salvar a venda mas os itens não, por exemplo, se der erro no meio)
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    // 1) Insere a venda principal
    const [resultadoVenda] = await connection.query(
      `INSERT INTO vendas (cliente_id, funcionario_id, data_venda, forma_pagamento, desconto, status_pagamento, data_vencimento)
       VALUES (?, ?, NOW(), ?, ?, ?, ?)`,
      [cliente_id || null, funcionario_id, forma_pagamento, descontoFinal, statusPagamento, vencimentoFinal]
    );
    const venda_id = resultadoVenda.insertId;

    // 2) Insere cada item da venda e desconta do estoque
    for (const item of itens) {
      await connection.query(
        'INSERT INTO venda_itens (venda_id, produto_id, quantidade, preco_unitario) VALUES (?, ?, ?, ?)',
        [venda_id, item.produto_id, item.quantidade, item.preco_unitario]
      );

      await connection.query(
        'UPDATE produtos SET estoque = estoque - ? WHERE produto_id = ?',
        [item.quantidade, item.produto_id]
      );
    }

    await connection.commit();
    res.json({ mensagem: 'Venda registrada com sucesso', venda_id, desconto: descontoFinal });
  } catch (err) {
    await connection.rollback();
    console.error(err);
    res.status(500).json({ erro: 'Erro ao registrar venda' });
  } finally {
    connection.release();
  }
});

// PUT /vendas/:id/cancelar -> cancela uma venda: devolve a quantidade de cada item pro
// estoque e marca a venda como cancelada. Não apaga nada — a venda continua no histórico.
// Quem cuida de contas a receber também pode cancelar uma venda fiado que não vai mais ser paga.
router.put('/:id/cancelar', exigirPermissao(['pode_vendas', 'pode_financeiro']), async (req, res) => {
  const venda_id = req.params.id;
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const [[venda]] = await connection.query(
      'SELECT cancelada FROM vendas WHERE venda_id = ? FOR UPDATE',
      [venda_id]
    );

    if (!venda) {
      await connection.rollback();
      return res.status(404).json({ erro: 'Venda não encontrada' });
    }
    if (venda.cancelada) {
      await connection.rollback();
      return res.status(400).json({ erro: 'Essa venda já está cancelada' });
    }

    const [itens] = await connection.query(
      'SELECT produto_id, quantidade FROM venda_itens WHERE venda_id = ?',
      [venda_id]
    );

    for (const item of itens) {
      await connection.query(
        'UPDATE produtos SET estoque = estoque + ? WHERE produto_id = ?',
        [item.quantidade, item.produto_id]
      );
    }

    await connection.query('UPDATE vendas SET cancelada = 1 WHERE venda_id = ?', [venda_id]);

    await connection.commit();
    res.json({ mensagem: 'Venda cancelada e estoque estornado com sucesso' });
  } catch (err) {
    await connection.rollback();
    console.error(err);
    res.status(500).json({ erro: 'Erro ao cancelar venda' });
  } finally {
    connection.release();
  }
});

module.exports = router;
