// utils/permissoes.js
// Middlewares que conferem se o funcionário logado pode fazer a ação.
//
// O frontend manda quem está logado no cabeçalho "x-funcionario-id" a cada
// requisição (ver apiPost/apiPut/apiDelete em app.js). Isso não é uma sessão
// segura de verdade (dá pra falsificar o cabeçalho no DevTools) — pra virar
// seguro de verdade precisaria de token/sessão no servidor. Por enquanto isso
// já impede que a tela "esconda" um botão mas a API continue aceitando
// qualquer requisição de qualquer um, que era o problema antes disso existir.

const db = require('../db');

async function buscarFuncionario(req) {
  const funcionarioId = req.headers['x-funcionario-id'];
  if (!funcionarioId) return null;

  const [rows] = await db.query(
    'SELECT funcionario_id, is_admin, pode_produtos, pode_clientes, pode_vendas, pode_historico FROM funcionarios WHERE funcionario_id = ?',
    [funcionarioId]
  );
  return rows[0] || null;
}

// Libera se o funcionário for admin OU tiver a permissão específica (ex.: 'pode_produtos')
function exigirPermissao(nomePermissao) {
  return async (req, res, next) => {
    try {
      const funcionario = await buscarFuncionario(req);
      if (!funcionario) {
        return res.status(401).json({ erro: 'Faça login para continuar' });
      }
      if (!funcionario.is_admin && !funcionario[nomePermissao]) {
        return res.status(403).json({ erro: 'Você não tem permissão para fazer isso' });
      }
      next();
    } catch (err) {
      console.error(err);
      res.status(500).json({ erro: 'Erro ao conferir permissão' });
    }
  };
}

// Libera só para admin
async function exigirAdmin(req, res, next) {
  try {
    const funcionario = await buscarFuncionario(req);
    if (!funcionario) {
      return res.status(401).json({ erro: 'Faça login para continuar' });
    }
    if (!funcionario.is_admin) {
      return res.status(403).json({ erro: 'Só o administrador pode fazer isso' });
    }
    next();
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao conferir permissão' });
  }
}

module.exports = { exigirPermissao, exigirAdmin };
