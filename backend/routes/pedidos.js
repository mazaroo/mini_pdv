// routes/pedidos.js
// Pedidos de delivery. A criação (POST /) é a ÚNICA rota pública de escrita do
// sistema inteiro — o cliente final preenche pelo link, sem fazer login.
// Por isso aqui a gente NUNCA confia em preço/nome de produto vindo do corpo da
// requisição: tudo é conferido de novo contra o banco antes de gravar.

const express = require('express');
const router = express.Router();
const db = require('../db');
const { exigirPermissao } = require('../utils/permissoes');

const TAXA_ENTREGA_PADRAO = 5.0; // valor fixo por enquanto; dá pra evoluir pra taxa por bairro depois
const STATUS_VALIDOS = ['novo', 'preparando', 'saiu_entrega', 'entregue', 'cancelado'];

// POST /pedidos -> rota PÚBLICA: cliente final monta o pedido pelo link, sem login
router.post('/', async (req, res) => {
  const { nome_cliente, telefone_cliente, tipo_entrega, endereco, forma_pagamento, observacoes, itens } = req.body;

  if (!nome_cliente || !telefone_cliente || !forma_pagamento || !itens || itens.length === 0) {
    return res.status(400).json({ erro: 'Preencha nome, telefone, forma de pagamento e adicione itens ao pedido' });
  }
  if (tipo_entrega !== 'retirada' && tipo_entrega !== 'entrega') {
    return res.status(400).json({ erro: 'Escolha retirada ou entrega' });
  }
  if (tipo_entrega === 'entrega' && (!endereco || !endereco.trim())) {
    return res.status(400).json({ erro: 'Informe o endereço de entrega' });
  }

  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    // Busca os produtos de verdade no banco — o preço nunca vem do que o cliente mandou
    const idsProdutos = [...new Set(itens.map(i => i.produto_id))];
    const [produtosReais] = await connection.query(
      'SELECT produto_id, preco FROM produtos WHERE produto_id IN (?)',
      [idsProdutos]
    );

    if (produtosReais.length !== idsProdutos.length) {
      await connection.rollback();
      return res.status(400).json({ erro: 'Um ou mais produtos do pedido não existem mais' });
    }

    const itensValidados = itens.map(item => {
      const produto = produtosReais.find(p => p.produto_id === item.produto_id);
      return {
        produto_id: produto.produto_id,
        quantidade: parseInt(item.quantidade),
        preco_unitario: Number(produto.preco),
      };
    });

    if (itensValidados.some(i => !i.quantidade || i.quantidade < 1)) {
      await connection.rollback();
      return res.status(400).json({ erro: 'Quantidade inválida em algum item do pedido' });
    }

    // Acha o cliente pelo telefone; se for a primeira compra dele, cadastra na hora
    const [clienteExistente] = await connection.query(
      'SELECT cliente_id FROM clientes WHERE telefone = ?',
      [telefone_cliente]
    );

    let cliente_id;
    if (clienteExistente.length > 0) {
      cliente_id = clienteExistente[0].cliente_id;
    } else {
      const [novoCliente] = await connection.query(
        'INSERT INTO clientes (nome, telefone, data_cadastro) VALUES (?, ?, CURDATE())',
        [nome_cliente, telefone_cliente]
      );
      cliente_id = novoCliente.insertId;
    }

    const taxaEntrega = tipo_entrega === 'entrega' ? TAXA_ENTREGA_PADRAO : 0;

    const [resultadoPedido] = await connection.query(
      `INSERT INTO pedidos (cliente_id, nome_cliente, telefone_cliente, tipo_entrega, endereco, taxa_entrega, forma_pagamento, observacoes, status, data_pedido)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'novo', NOW())`,
      [cliente_id, nome_cliente, telefone_cliente, tipo_entrega, endereco || null, taxaEntrega, forma_pagamento, observacoes || null]
    );
    const pedido_id = resultadoPedido.insertId;

    for (const item of itensValidados) {
      await connection.query(
        'INSERT INTO pedido_itens (pedido_id, produto_id, quantidade, preco_unitario) VALUES (?, ?, ?, ?)',
        [pedido_id, item.produto_id, item.quantidade, item.preco_unitario]
      );
    }

    await connection.commit();

    const subtotal = itensValidados.reduce((soma, i) => soma + i.quantidade * i.preco_unitario, 0);
    res.json({ mensagem: 'Pedido recebido com sucesso', pedido_id, total: subtotal + taxaEntrega });
  } catch (err) {
    await connection.rollback();
    console.error(err);
    res.status(500).json({ erro: 'Erro ao registrar pedido' });
  } finally {
    connection.release();
  }
});

// GET /pedidos -> lista pedidos pro painel interno (só quem tem pode_delivery)
router.get('/', exigirPermissao('pode_delivery'), async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT p.pedido_id, p.nome_cliente, p.telefone_cliente, p.tipo_entrega, p.endereco,
             p.taxa_entrega, p.forma_pagamento, p.observacoes, p.status, p.motoboy, p.venda_id, p.data_pedido,
             COALESCE(SUM(pi.quantidade * pi.preco_unitario), 0) AS subtotal,
             COALESCE(SUM(pi.quantidade * pi.preco_unitario), 0) + p.taxa_entrega AS total
      FROM pedidos p
      LEFT JOIN pedido_itens pi ON pi.pedido_id = p.pedido_id
      GROUP BY p.pedido_id, p.nome_cliente, p.telefone_cliente, p.tipo_entrega, p.endereco,
               p.taxa_entrega, p.forma_pagamento, p.observacoes, p.status, p.motoboy, p.venda_id, p.data_pedido
      ORDER BY p.pedido_id DESC
    `);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao buscar pedidos' });
  }
});

// GET /pedidos/:id/itens -> itens de um pedido específico
router.get('/:id/itens', exigirPermissao('pode_delivery'), async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT pi.item_id, pr.nome AS produto, pi.quantidade, pi.preco_unitario,
             (pi.quantidade * pi.preco_unitario) AS valor_total
      FROM pedido_itens pi
      INNER JOIN produtos pr ON pr.produto_id = pi.produto_id
      WHERE pi.pedido_id = ?
    `, [req.params.id]);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao buscar itens do pedido' });
  }
});

// PUT /pedidos/:id/status -> avança o status (novo → preparando → saiu_entrega → entregue) ou cancela, e opcionalmente define o motoboy
router.put('/:id/status', exigirPermissao('pode_delivery'), async (req, res) => {
  const { status, motoboy } = req.body;

  if (!STATUS_VALIDOS.includes(status)) {
    return res.status(400).json({ erro: 'Status inválido' });
  }

  try {
    if (motoboy !== undefined) {
      await db.query('UPDATE pedidos SET status = ?, motoboy = ? WHERE pedido_id = ?', [status, motoboy || null, req.params.id]);
    } else {
      await db.query('UPDATE pedidos SET status = ? WHERE pedido_id = ?', [status, req.params.id]);
    }
    res.json({ mensagem: 'Status atualizado com sucesso' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao atualizar status' });
  }
});

// PUT /pedidos/:id/confirmar -> transforma o pedido numa Venda de verdade
// (origem = 'delivery'): desconta estoque, entra no histórico e no faturamento,
// só que marcada pra dar pra diferenciar do balcão nos relatórios.
router.put('/:id/confirmar', exigirPermissao('pode_delivery'), async (req, res) => {
  const pedido_id = req.params.id;
  const funcionario_id = req.headers['x-funcionario-id'];

  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const [[pedido]] = await connection.query('SELECT * FROM pedidos WHERE pedido_id = ? FOR UPDATE', [pedido_id]);

    if (!pedido) {
      await connection.rollback();
      return res.status(404).json({ erro: 'Pedido não encontrado' });
    }
    if (pedido.venda_id) {
      await connection.rollback();
      return res.status(400).json({ erro: 'Esse pedido já foi confirmado' });
    }
    if (pedido.status === 'cancelado') {
      await connection.rollback();
      return res.status(400).json({ erro: 'Não é possível confirmar um pedido cancelado' });
    }

    const [itens] = await connection.query(
      'SELECT produto_id, quantidade, preco_unitario FROM pedido_itens WHERE pedido_id = ?',
      [pedido_id]
    );

    const [resultadoVenda] = await connection.query(
      `INSERT INTO vendas (cliente_id, funcionario_id, data_venda, forma_pagamento, desconto, origem, taxa_entrega)
       VALUES (?, ?, NOW(), ?, 0, 'delivery', ?)`,
      [pedido.cliente_id, funcionario_id, pedido.forma_pagamento, pedido.taxa_entrega]
    );
    const venda_id = resultadoVenda.insertId;

    for (const item of itens) {
      await connection.query(
        'INSERT INTO venda_itens (venda_id, produto_id, quantidade, preco_unitario) VALUES (?, ?, ?, ?)',
        [venda_id, item.produto_id, item.quantidade, item.preco_unitario]
      );
      await connection.query('UPDATE produtos SET estoque = estoque - ? WHERE produto_id = ?', [item.quantidade, item.produto_id]);
    }

    await connection.query(
      "UPDATE pedidos SET venda_id = ?, status = IF(status = 'novo', 'preparando', status) WHERE pedido_id = ?",
      [venda_id, pedido_id]
    );

    await connection.commit();
    res.json({ mensagem: 'Pedido confirmado e venda registrada', venda_id });
  } catch (err) {
    await connection.rollback();
    console.error(err);
    res.status(500).json({ erro: 'Erro ao confirmar pedido' });
  } finally {
    connection.release();
  }
});

module.exports = router;
