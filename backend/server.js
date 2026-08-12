// server.js
// Arquivo principal: sobe o servidor Express e liga as rotas

const express = require('express');
const cors = require('cors');
const path = require('path');

const clientesRouter = require('./routes/clientes');
const produtosRouter = require('./routes/produtos');
const funcionariosRouter = require('./routes/funcionarios');
const vendasRouter = require('./routes/vendas');
const dashboardRouter = require('./routes/dashboard');
const authRouter = require('./routes/auth');
const categoriasRouter = require('./routes/categorias');
const pedidosRouter = require('./routes/pedidos');

const app = express();
// Hospedagens (Railway, Render, etc.) definem a porta certa sozinhas pela
// variável PORT — em produção. No seu PC, sem essa variável, cai no 3000 de sempre.
const PORTA = process.env.PORT || 3000;

app.use(cors());
app.use(express.json()); // permite ler JSON enviado pelo frontend

// Serve os arquivos do frontend (HTML/CSS/JS) diretamente pelo mesmo servidor
app.use(express.static(path.join(__dirname, '..', 'frontend')));

// Rotas da API
app.use('/api/clientes', clientesRouter);
app.use('/api/produtos', produtosRouter);
app.use('/api/funcionarios', funcionariosRouter);
app.use('/api/vendas', vendasRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/auth', authRouter);
app.use('/api/categorias', categoriasRouter);
app.use('/api/pedidos', pedidosRouter);

app.listen(PORTA, () => {
  console.log(`Servidor rodando em http://localhost:${PORTA}`);
});
