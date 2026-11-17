# Controle de Chaparia

Sistema web de PCP e almoxarifado para chapas inteiras, retalhos e atividades. Frontend estático em português, Firebase Authentication por e-mail/senha e Firebase Realtime Database compartilhado pela equipe. Hospedagem pelo GitHub Pages, sem servidor próprio.

**A URL do banco já está configurada:** `https://controle-chaparia-default-rtdb.firebaseio.com/`.

**Antes de usar:** preencha `firebase-config.js`, ative E-mail/senha, cadastre os operadores e publique as regras do banco. Até isso acontecer, o site apresenta a tela de login com a orientação de configuração e bloqueia o estoque. Não há senha padrão nem modo de demonstração no build de produção.

## Origem das Atividades

Em 17/11/2026, o GitHub informou que `felipesales-12/Controle-Chaparia` estava vazio. O código de Atividades disponível no ambiente era o repositório `felipesales-12/Codex`, commit `d332db7b8c8397414a7a764ec8293368b6813488`. Esta entrega preserva e integra esse módulo. O checkout original foi mantido intacto.

Foram preservados:

- Cadastro, edição, duplicação, detalhes e exclusão com confirmação.
- Solicitante, urgência, local, prazo, descrição, observações e datas de cadastro/alteração/conclusão.
- Pendentes, em andamento, conclusão e restauração ao estado pendente.
- Painel com indicadores, prioridades, atrasos e atividades recentes.
- Pesquisa sem distinção de acentos, filtros de solicitante/urgência/status/período, ordenação e paginação.
- Exportações CSV de ativas e concluídas, proteção contra fórmulas de planilha, backup JSON e restauração dos backups anteriores.
- Tema claro, escuro e automático, navegação móvel, formulários e confirmações acessíveis.

A persistência de atividades passa a ser obrigatoriamente na nuvem, com revisões para rejeitar edições desatualizadas. O painel de Atividades continua disponível no menu, separado da visão geral de estoque.

## O que o sistema faz

| Módulo | Funcionalidades |
| --- | --- |
| Login | Firebase Authentication, recuperação de senha, alteração de senha e encerramento da sessão |
| Chapas | Entrada, baixa por corte, dimensões padrão e localização/prateleira |
| Reposição | Banner automático para quantidade ≤ 2, relação completa de itens críticos e lista para copiar |
| Retalhos | Material, espessura, medidas, quantidade, identificação/prateleira e observações |
| Aproveitamento | Dimensões mínimas, material/espessura, rotação opcional de 90° e compatíveis em destaque |
| Corte de retalho | Baixa total ou registro da sobra de uma peça, preservando as outras peças do lote |
| Atividades | Todas as operações descritas acima, integradas ao mesmo banco compartilhado |
| Movimentações | Usuário, horário do servidor, motivo/OP, dados anteriores/posteriores e exportação JSON |

Catálogo inicial com **14 itens e saldo zero**, dimensões iniciais **3000 × 1500 mm**:

- Aço Carbono: **2, 3, 4.76, 6.35, 7.94, 9.35, 12.7, 19.05 mm**.
- Aço Inox: **1.5, 2, 3, 4, 5, 6 mm**.

O sistema cria o catálogo somente se `/chaparia` estiver vazio (`null`), usando uma transação. Ele preserva um catálogo existente e os demais nós da raiz. Um banco com estrutura incompatível gera orientação de erro, sem ser substituído automaticamente.

## Ativar o Firebase

O passo a passo ilustrado por telas e comandos está em [docs/CONFIGURACAO.md](docs/CONFIGURACAO.md). Resumo:

1. No Console Firebase, abra o projeto que contém o banco informado. Em **Configurações do projeto → Geral → Seus aplicativos**, registre um aplicativo Web, se necessário.
2. Copie os sete valores públicos para o arquivo **`firebase-config.js` na raiz**. A `databaseURL` já está preenchida. Não use as credenciais de outro projeto. Nunca coloque uma chave privada ou JSON de conta de serviço no frontend.
3. Em **Authentication → Sign-in method**, habilite **E-mail/senha**. Em **Users**, crie um usuário para cada operador. Não existe cadastro público na interface do sistema.
4. Em **Authentication → Settings → Authorized domains**, adicione **`felipesales-12.github.io`**. Para testar localmente, adicione `localhost` e, se usar esse endereço, `127.0.0.1`.
5. Em **Realtime Database → Rules**, cole **todo o conteúdo de `database.rules.json`** e clique em **Publicar**. As regras exigem `auth != null` e também validam saldos, dimensões e campos principais.
6. Faça commit da configuração e envie para `main`. Abra o site e entre. O primeiro login inicializa os 14 itens sem saldo e exibe o alerta de reposição.
7. Entre em outro aparelho, faça uma entrada de teste e confira se o saldo e a movimentação chegam automaticamente aos dois aparelhos.

A regra mínima solicitada é esta; o arquivo entregue acrescenta validação de dados:

```json
{
  "rules": {
    ".read": "auth != null",
    ".write": "auth != null"
  }
}
```

Todos os usuários autenticados do projeto têm acesso ao mesmo estoque e às mesmas atividades. Essas regras não implementam papéis por setor nem um histórico inviolável contra alterações diretas feitas por usuários autenticados. A trilha de movimentações é mantida atomicamente pelas operações do aplicativo.

## Ativar o GitHub Pages

1. Abra **Settings → Pages** do repositório.
2. Em **Build and deployment → Source**, selecione **GitHub Actions**.
3. Confirme que a branch é **`main`** e que o GitHub Actions está habilitado.
4. Faça um push em `main`, ou execute manualmente **Actions → Publicar Controle de Chaparia → Run workflow**.
5. Aguarde o job `deploy`. Use o endereço mostrado no resultado do deploy.

O workflow está em **`.github/workflows/deploy.yml`**. Ele usa Node 24, instala as versões do lockfile, executa os testes de lógica, gera `dist/` e publica o artefato com as ações oficiais do GitHub Pages.

**Atenção ao nome do repositório:** `Controle-Chaparia` gera normalmente **`https://felipesales-12.github.io/Controle-Chaparia/`**. Para ter o endereço solicitado **`https://felipesales-12.github.io/Controle_Chaparia/`**, renomeie o repositório para **`Controle_Chaparia`** em Settings → General. O caminho `/Codex/` corresponde ao repositório `Codex`. Não é necessário alterar imports ou recompilar por causa do nome: todos os arquivos usam caminhos relativos e a navegação usa `#`.

## Executar e testar localmente

Requisitos: Node.js 24 e npm. Para o emulador de regras, Java 21.

```bash
npm ci
npm test
npm run build
npm run preview
```

Abra `http://localhost:4173/Controle-Chaparia/`. O preview também atende `/Codex/`, `/Controle_Chaparia/` e `/`. `npm start` executa build e preview em sequência. Não abra `index.html` por `file://`; a fonte importa o SDK via npm e precisa do build.

O build mantém a configuração pública externa em `dist/firebase-config.js`. Ao editar a configuração da fonte, faça um novo build ou push. O diretório `dist/` não é versionado: é gerado automaticamente pelo workflow.

Testes adicionais:

```bash
npx playwright install chromium
npm run test:e2e
npm run test:rules
```

- **17 testes de lógica:** catálogo, quantidades, concorrência, revisões, retalhos, transições de atividades, backups e CSV.
- **13 testes de interface:** navegação, operações, sincronização simulada entre navegadores, cópia de compras, formulários, restauração e conflitos de edição.
- **6 testes de regras/integração:** acessos autenticados/não autenticados, validação, inicialização e transações concorrentes no emulador oficial do Realtime Database.

Os testes de interface usam um serviço simulado em memória e um bundle isolado em `work/e2e/`. Esse serviço **não entra no build de produção**. A produção usa somente o SDK oficial do Firebase. Os testes de interface não equivalem a um teste no Firebase real.

A suíte `.github/workflows/verify.yml` executa lógica, emulador e interface no GitHub Actions. O relatório de verificações desta entrega está em [docs/VALIDACAO.md](docs/VALIDACAO.md).

## Dados, sincronização e recuperação

- `onAuthStateChanged` inicia as assinaturas `onValue` após o login e as remove ao sair ou trocar de usuário.
- O nó compartilhado é **`/chaparia`**. Ele contém `schemaVersion`, `sheets`, `remnants`, `tasks` e `movements`.
- Cada movimentação usa `runTransaction` no nó compartilhado, gravando saldo e histórico na mesma operação. Se outro aparelho altera o saldo durante uma baixa, o Firebase repete o cálculo sobre o saldo mais recente. Não há saldo negativo confirmado pelo aplicativo.
- Edições de metadados, retalhos e atividades usam revisões. Se outro operador editar um registro com um formulário já aberto, a operação é rejeitada, preservando o rascunho para revisão.
- O aplicativo só informa sucesso após a confirmação da transação pelo servidor. Sem conexão, novas operações são bloqueadas. Se a conexão cair durante uma gravação enviada, a tela continua aguardando confirmação; mantenha a aba aberta até concluir.
- Estoque, atividades e histórico não são gravados em `localStorage` ou IndexedDB. Somente preferências visuais e a data da última exportação ficam em `localStorage`. A sessão de autenticação usa a persistência de sessão do SDK; senhas não são armazenadas pelo aplicativo.
- **Backup de Atividades:** formato compatível com o Compasso (`atividades-local`, versão 1). Inclui todas as atividades e conclusões. Restaurar substitui somente as atividades; o estoque e as movimentações continuam preservados. A restauração gera um registro e rejeita alterações concorrentes durante a confirmação.
- **Exportar estoque e histórico:** em Movimentações, baixa um JSON contendo todo o nó `/chaparia`. Para uma recuperação administrativa completa, valide a exportação e restaure seu campo `data` no nó `/chaparia` pelo console Firebase. Evite restaurar a raiz inteira e não faça isso com operadores trabalhando.
- Para migrar atividades do aplicativo anterior, exporte o JSON antigo e importe em Backup de Atividades. A restauração substitui a lista atual, com confirmação. Nenhum banco local antigo é apagado ou migrado silenciosamente.

A transação e a assinatura abrangem o nó compartilhado completo para garantir consistência sem um backend próprio. O volume transferido cresce com o histórico. A paginação da tela é local; para alto volume de movimentações, planeje particionar os dados e adotar transações por entidade com backend para auditoria. Não há limite de retenção ou limpeza automática.

A busca de retalhos considera o envelope retangular e rotação opcional; furos, formatos em L, direção de laminação, folga e espessura de corte precisam ser avaliados pelo operador.

## Estrutura de arquivos

```text
Controle-Chaparia/
├── .github/workflows/
│   ├── deploy.yml
│   └── verify.yml
├── .gitignore
├── .nojekyll
├── README.md
├── index.html
├── favicon.svg
├── firebase-config.js
├── firebase.json
├── database.rules.json
├── package.json
├── package-lock.json
├── playwright.config.js
├── sw.js
├── css/
│   ├── legacy.css
│   └── style.css
├── js/
│   ├── app.js
│   ├── account.js
│   ├── backup.js
│   ├── cloud.js
│   ├── database.js
│   ├── domain.js
│   ├── icons.js
│   ├── inventory.js
│   ├── tasks.js
│   └── ui.js
├── scripts/
│   ├── build.mjs
│   └── preview.mjs
├── tests/
│   ├── domain.test.js
│   ├── rules.test.js
│   ├── ui.spec.js
│   ├── serve.mjs
│   └── fixtures/cloud.js
└── docs/
    ├── CONFIGURACAO.md
    └── VALIDACAO.md
```

`dist/`, `work/`, dependências e relatórios de testes são gerados e ignorados pelo Git. `sw.js` apenas encerra uma instalação antiga do cache offline do Compasso; os dados críticos não usam cache offline.
