# Mini PDV — Projeto de Estudo

Projeto simples de Ponto de Venda para praticar SQL na prática: cadastrar clientes,
produtos, e registrar vendas que alimentam o banco `pdv` no MySQL.

## Estrutura

```
mini_pdv/
├── backend/          -> servidor Node.js + Express, conversa com o MySQL
│   ├── server.js
│   ├── db.js
│   ├── package.json
│   └── routes/
│       ├── clientes.js
│       ├── produtos.js
│       ├── funcionarios.js
│       └── vendas.js
└── frontend/          -> páginas HTML/JS que abrem no navegador
    ├── index.html
    ├── clientes.html
    ├── produtos.html
    ├── vendas.html
    ├── historico.html
    ├── app.js
    └── style.css
```

## Pré-requisitos

- Node.js instalado (você já confirmou que tem)
- MySQL rodando localmente, com o banco `pdv` já criado e as tabelas
  (categorias, clientes, funcionarios, produtos, vendas, venda_itens)

## Passo a passo para rodar

### 1. Instalar as dependências do backend

Abra o CMD **dentro da pasta `backend`** e rode:

```
cd mini_pdv/backend
npm install
```

Isso vai instalar `express`, `mysql2` e `cors` (definidos no `package.json`).

### 2. Conferir a senha do banco

O arquivo `backend/db.js` já está configurado com:
- host: `localhost`
- user: `root`
- password: `masterkey`
- database: `pdv`

Se sua senha for diferente no futuro, é só editar esse arquivo.

### 3. Subir o servidor

Ainda dentro da pasta `backend`:

```
node server.js
```

Se der tudo certo, vai aparecer no CMD:

```
Servidor rodando em http://localhost:3000
```

**Deixe esse CMD aberto** — é ele que fica "escutando" as requisições. Se fechar, o site para de funcionar.

### 4. Abrir o site

Abra o navegador e acesse:

```
http://localhost:3000
```

Isso já abre a tela inicial do Mini PDV (o próprio servidor Node também serve o frontend).

## Como usar

1. **Clientes** → cadastre alguns clientes antes de vender.
2. **Produtos** → cadastre produtos vinculados a uma categoria (as categorias já devem existir no banco).
3. **Nova Venda** → escolha cliente, funcionário, forma de pagamento, adicione um ou mais
   produtos com quantidade, e finalize. Isso vai:
   - Inserir uma linha em `vendas`
   - Inserir uma linha em `venda_itens` para cada produto
   - Descontar a quantidade vendida do `estoque` em `produtos`
4. **Histórico** → veja todas as vendas já feitas e clique em "Ver itens" para o detalhe.

## Erros comuns

- **"Não é possível conectar" no navegador** → o backend (`node server.js`) não está rodando, ou parou.
- **Erro de conexão com o MySQL no CMD do backend** → confira se o MySQL está rodando
  (mesmo processo que resolvemos antes com o `ECONNREFUSED`) e se a senha em `db.js` está certa.
- **"Unknown database 'pdv'"** → o banco `pdv` ainda não foi criado no seu MySQL, ou tem outro nome.
