-- Seed mínimo: só a conta admin, pra você conseguir logar assim que o banco existir.
-- Rode isso UMA VEZ, depois do schema.sql, no banco novo (Railway, etc.)
-- Login: admin / 12345

USE pdv;

INSERT INTO funcionarios (nome, cargo, senha, is_admin, pode_produtos, pode_clientes, pode_vendas, pode_historico, pode_delivery)
VALUES ('admin', 'Administrador', '$2b$10$vETNN2QumUnkHTjyOo1XSefRZsHq1d9TZJatdV7jq78ahMo7zLlbO', 1, 1, 1, 1, 1, 1);
