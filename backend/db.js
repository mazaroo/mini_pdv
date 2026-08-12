// db.js
// Responsável por criar a conexão com o banco de dados MySQL
//
// As credenciais vêm de variáveis de ambiente (process.env), com o valor local
// de desenvolvimento como padrão — assim o projeto continua funcionando igual
// no seu PC sem precisar configurar nada, mas em produção (Railway, Render etc.)
// basta definir essas variáveis no painel do serviço, sem tocar no código.

const mysql = require('mysql2');

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'masterkey',
  database: process.env.DB_NAME || 'pdv',
  port: process.env.DB_PORT || 3306,
  waitForConnections: true,
  connectionLimit: 10,
});

// Exporta a versão "promise" do pool, que permite usar async/await
module.exports = pool.promise();
