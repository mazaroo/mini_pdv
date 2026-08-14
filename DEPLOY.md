# Deploy — Mini PDV

Guia pra colocar o projeto no GitHub (privado) e deixar um site ao vivo que atualiza
sozinho a cada `git push`.

## 1. Criar o repositório no GitHub

1. Acesse https://github.com/new
2. Nome: `mini-pdv`
3. Marque **Private**
4. **Não** marque "Add a README" (o projeto já tem um) — deixe tudo desmarcado
5. Clique em "Create repository"
6. Copie a URL que aparece (algo como `https://github.com/SEU_USUARIO/mini-pdv.git`)

## 2. Subir o código

No terminal, dentro da pasta do projeto:

```bash
git remote add origin https://github.com/SEU_USUARIO/mini-pdv.git
git push -u origin master
```

Se pedir login, use seu usuário do GitHub — se pedir senha, o GitHub não aceita mais
senha normal por linha de comando: ou ele abre uma janela do navegador pra você
autorizar (mais comum hoje em dia), ou você usa um **token de acesso pessoal** no
lugar da senha (criado em github.com → Settings → Developer settings → Personal
access tokens).

## 3. Convidar seu colega

No repositório no GitHub: **Settings → Collaborators → Add people** → digite o
usuário dele (`@Jrzk`) → envia o convite. Ele recebe um e-mail/notificação e precisa
aceitar.

A partir daqui, os dois têm acesso de leitura/escrita — `git push` normalmente depois
de `git pull` pra pegar as mudanças um do outro.

## 4. Deploy automático (site ao vivo) — Railway

[Railway](https://railway.app) hospeda o backend Node **e** o banco MySQL no mesmo
lugar, e faz redeploy sozinho toda vez que alguém dá push no GitHub.

### 4.1. Criar o projeto

1. Crie uma conta em https://railway.app (dá pra entrar direto com GitHub)
2. **New Project → Deploy from GitHub repo** → escolha `mini-pdv`
3. **Deixe o "Root Directory" vazio (raiz do repositório)** — **não** aponte pra
   `backend`. O `package.json` que existe na raiz do projeto já sabe entrar em
   `backend/` sozinho pra instalar e rodar (`postinstall` + `start`); ele existe
   exatamente pra isso. Se você apontar o Root Directory pra `backend`, o Railway
   passa a enxergar **só** aquela pasta — a pasta `frontend/`, que é irmã dela,
   fica de fora do build, e o site carrega a API mas não a interface (dá erro
   "Cannot GET /"). Foi exatamente esse o problema que tivemos e corrigimos.
4. Em **Settings → Networking → Public Networking**, clique em **Generate Domain**
   — isso cria a URL pública do site (tipo `algumacoisa.up.railway.app`)

### 4.2. Adicionar o banco MySQL

1. No mesmo projeto Railway: **New → Database → Add MySQL**
2. Railway cria o banco e gera variáveis próprias (`MYSQLHOST`, `MYSQLPORT`,
   `MYSQLUSER`, `MYSQLPASSWORD`, `MYSQLDATABASE`)

### 4.3. Ligar o backend ao banco

No serviço do backend (não no MySQL) → aba **Variables** → adicione, uma por uma,
**referenciando** o serviço do MySQL (o Railway autocompleta ao digitar `${{`):

```
DB_HOST=${{MySQL.MYSQLHOST}}
DB_PORT=${{MySQL.MYSQLPORT}}
DB_USER=${{MySQL.MYSQLUSER}}
DB_PASSWORD=${{MySQL.MYSQLPASSWORD}}
DB_NAME=pdv
```

⚠️ **`DB_NAME` é o texto fixo `pdv`, não uma referência.** O MySQL do Railway já
nasce com um banco padrão chamado `railway` — mas o nosso projeto usa um banco
chamado `pdv` (é o que o `schema.sql` cria). Se você deixar `DB_NAME` referenciando
`${{MySQL.MYSQLDATABASE}}`, ele aponta pro banco `railway` (errado, vazio) em vez
do `pdv` de verdade.

### 4.4. Criar as tabelas (uma vez só)

O banco `pdv` não existe até você rodar o `schema.sql` — o Railway não cria isso
sozinho. Duas formas de fazer:

**Opção A — cliente MySQL (Workbench, extensão do VS Code, etc.):**
1. No serviço MySQL → **Settings → Networking → Public Networking**, clique em
   "Add Public Access" se ainda não tiver um endereço público gerado. Isso dá um
   host tipo `algumacoisa.proxy.rlwy.net` com uma porta própria (não é a 3306)
2. Conecta usando esse host/porta públicos + usuário `root` + a senha (em
   **Variables**, campo `MYSQL_ROOT_PASSWORD`)
3. Roda o conteúdo de [`schema.sql`](schema.sql) (cria o banco `pdv` e as tabelas)
4. Roda o conteúdo de [`seed.sql`](seed.sql) (cria o login `admin` / `12345`)

**Opção B — Node direto do terminal**, já que o projeto usa `mysql2`:
```bash
cd backend
node -e "
const mysql = require('mysql2/promise');
const fs = require('fs');
(async () => {
  const conn = await mysql.createConnection({
    host: 'SEU_HOST_PUBLICO', port: SUA_PORTA_PUBLICA,
    user: 'root', password: 'SUA_SENHA', multipleStatements: true,
  });
  await conn.query(fs.readFileSync('../schema.sql', 'utf8'));
  await conn.query(fs.readFileSync('../seed.sql', 'utf8'));
  console.log('Pronto.');
  await conn.end();
})();
"
```

### 4.5. Pronto

A URL que você gerou no passo 4.1 é o site ao vivo. A partir de agora, **todo
`git push` na branch `master` dispara um redeploy automático** — é exatamente o
"atualiza sozinho" que você pediu.

## ⚠️ Limitações que vale saber

- **Fotos de produto**: hoje ficam salvas em disco (`frontend/uploads/produtos`).
  Em hospedagens como Railway, esse disco é apagado a cada novo deploy — ou seja,
  fotos enviadas em produção **não são permanentes**. Pra resolver de verdade
  precisaria guardar as imagens em outro lugar (ex: Cloudinary, S3) — posso montar
  isso depois se quiser.
- **Primeiro login em produção**: `admin` / `12345` (via `seed.sql`) — troque a
  senha depois de entrar (tela "Meu Perfil").
- **Trocar a senha do admin local não afeta a de produção** (são bancos
  diferentes) e vice-versa.
