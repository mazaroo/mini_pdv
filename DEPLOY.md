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
git branch -M main
git push -u origin main
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
3. Railway vai tentar rodar o projeto a partir da raiz do repositório — como o
   backend fica em `backend/`, entre nas configurações desse serviço
   (**Settings → Root Directory**) e defina: `backend`
4. Em **Settings → Deploy**, confirme que o start command é `npm start` (já é o
   padrão, não precisa mexer)

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
DB_NAME=${{MySQL.MYSQLDATABASE}}
```

### 4.4. Criar as tabelas (uma vez só)

O banco novo nasce **vazio**. No serviço MySQL do Railway, abra a aba **Data** (ou
conecte por fora com um cliente MySQL usando as credenciais que aparecem em
**Connect**) e rode, nessa ordem:

1. O conteúdo de [`schema.sql`](schema.sql) (cria todas as tabelas)
2. O conteúdo de [`seed.sql`](seed.sql) (cria o login `admin` / `12345`)

### 4.5. Pronto

Railway vai te dar uma URL pública (tipo `mini-pdv-production.up.railway.app`) —
esse é o site ao vivo. A partir de agora, **todo `git push` na branch `main` dispara
um redeploy automático** — é exatamente o "atualiza sozinho" que você pediu.

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
