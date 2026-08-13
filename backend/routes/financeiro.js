// routes/financeiro.js
// Contas a receber: visão de todas as vendas com foco na situação de pagamento
// (quem deve, quanto, desde quando). Por padrão o frontend filtra pra mostrar só
// pendente/vencida, mas a rota devolve tudo — dá pra ver "Consumidor Final" e
// vendas já pagas também, se quiser o histórico financeiro completo.

const express = require('express');
const router = express.Router();
const db = require('../db');
const { exigirPermissao } = require('../utils/permissoes');

// GET /financeiro -> todas as vendas, com situação de pagamento
router.get('/', exigirPermissao('pode_financeiro'), async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT v.venda_id, COALESCE(c.nome, 'Consumidor Final') AS cliente, v.cliente_id,
             f.nome AS funcionario, v.data_venda, v.forma_pagamento,
             v.desconto, v.cancelada, v.origem, v.taxa_entrega,
             v.status_pagamento, v.data_vencimento, v.data_pagamento,
             COALESCE(SUM(vi.quantidade * vi.preco_unitario), 0) - v.desconto + v.taxa_entrega AS total
      FROM vendas v
      LEFT JOIN clientes c ON v.cliente_id = c.cliente_id
      INNER JOIN funcionarios f ON v.funcionario_id = f.funcionario_id
      LEFT JOIN venda_itens vi ON vi.venda_id = v.venda_id
      GROUP BY v.venda_id, c.nome, v.cliente_id, f.nome, v.data_venda, v.forma_pagamento,
               v.desconto, v.cancelada, v.origem, v.taxa_entrega, v.status_pagamento,
               v.data_vencimento, v.data_pagamento
      ORDER BY v.venda_id DESC
    `);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao buscar contas a receber' });
  }
});

// PUT /financeiro/:id/pagar -> dá baixa numa venda fiado (marca como paga)
router.put('/:id/pagar', exigirPermissao('pode_financeiro'), async (req, res) => {
  try {
    const [[venda]] = await db.query('SELECT cancelada, status_pagamento FROM vendas WHERE venda_id = ?', [req.params.id]);

    if (!venda) {
      return res.status(404).json({ erro: 'Venda não encontrada' });
    }
    if (venda.cancelada) {
      return res.status(400).json({ erro: 'Essa venda está cancelada' });
    }
    if (venda.status_pagamento === 'pago') {
      return res.status(400).json({ erro: 'Essa venda já está paga' });
    }

    await db.query(
      "UPDATE vendas SET status_pagamento = 'pago', data_pagamento = NOW() WHERE venda_id = ?",
      [req.params.id]
    );
    res.json({ mensagem: 'Pagamento registrado com sucesso' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao registrar pagamento' });
  }
});

module.exports = router;
