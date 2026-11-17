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
| Reposição | Banner automático pelo ponto de reposição de cada chapa (padrão inicial: 2), relação completa de itens críticos e lista para copiar |
| Retalhos | Material, espessura, medidas, quantidade, identificação/prateleira e observações |
| Aproveitamento | Dimensões mínimas, material/espessura, rotação opcional de 90° e compatíveis em destaque |
| Corte de retalho | Baixa total ou registro da sobra de uma peça, preservando as outras peças do lote |
| Pesos | Chapas e retalhos em kg, separados por tipo de aço e espessura, com subtotais e total geral |
| Atividades | Todas as operações descritas acima, integradas ao mesmo banco compartilhado |
| Movimentações | Usuário, horário do servidor, motivo/OP, dados anteriores/posteriores e exportação JSON |

Catálogo inicial com **14 itens e saldo zero**, dimensões iniciais **3000 × 1500 mm**:

- Aço Carbono: **2, 3, 4.76, 6.35, 7.94, 9.35, 12.7, 19.05 mm**.
- Aço Inox: **1.5, 2, 3, 4, 5, 6 mm**.

O sistema cria o catálogo somente se `/chaparia` estiver vazio (`null`), usando uma transação. Ele preserva um catálogo existente e os demais nós da raiz. Um banco com estrutura incompatível gera orientação de erro, sem ser substituído automaticamente.

## Catálogo, reposição e ordenação

**Atualização necessária no Firebase:** publique a versão atual de `database.rules.json` para permitir materiais adicionais, pontos de reposição e arquivamento. As regras anteriores podem recusar esses novos campos. Consulte [docs/ATUALIZAR-CATALOGO.md](docs/ATUALIZAR-CATALOGO.md). Não é necessário apagar ou importar novamente o estoque.

Em **Chapas inteiras**:

- **Novo material** cria tipos como Chapa piso, com nome e densidade para o cálculo de peso.
- **Adicionar espessura** permite escolher o material, informar uma espessura positiva (até 1.000 mm), dimensões, localização e ponto de reposição. Exemplo: Chapa piso 3 mm e Chapa piso 4,76 mm. O saldo inicial é zero; use Entrada para adicionar chapas.
- O botão de edição da linha permite alterar o **ponto de reposição** de cada chapa. O alerta é acionado quando o saldo fica **menor ou igual** ao valor configurado. O valor padrão para registros antigos continua 2; zero também é permitido.
- **Remover espessura** retira a combinação do catálogo ativo depois de confirmar que chapas e retalhos daquela combinação estão sem saldo. O registro e o histórico ficam preservados. Para reativar, use Adicionar espessura com o mesmo material e medida.
- **Ordenar chapas** oferece material/espessura, espessura crescente e espessura decrescente.

Em **Retalhos**, a ordenação inclui área, espessura, comprimento e combinações **Espessura + comprimento** ou **Comprimento + espessura**, em ordem crescente ou decrescente. O primeiro critério tem prioridade; o segundo desempata. Na busca de aproveitamento, compatíveis permanecem em destaque e no início, com a ordenação escolhida dentro de cada grupo.

A visualização **Pesos → Peso por peça** oferece as mesmas ordenações de chapas e retalhos. Materiais e espessuras adicionais aparecem também nos filtros de retalhos, no dashboard, nos alertas de compra, nos pesos e no Excel. O relatório mantém as espessuras arquivadas no detalhamento com sua situação, saldo zero, ponto de reposição e data de arquivamento.

Os novos cadastros, alterações de reposição e remoções usam as mesmas transações e o mesmo histórico das movimentações, identificando o usuário e o horário do servidor. As alterações são compartilhadas em tempo real.

## Aba Pesos

A aba **Pesos** calcula o peso estimado em kg do estoque sincronizado. Cada tipo de aço tem uma tabela com as espessuras do catálogo, quantidade e peso das chapas inteiras, quantidade e peso dos retalhos, subtotais e total geral. Entradas, baixas e novas dimensões atualizam os pesos automaticamente; peças com saldo zero não acrescentam peso.

O cálculo usa as dimensões individuais de cada registro e suas quantidades, sem arredondar antes da soma:

```text
Peso (kg) = largura (mm) × comprimento (mm) × espessura (mm)
            × quantidade × densidade (kg/m³) ÷ 1.000.000.000
```

Densidades de referência: **Aço Carbono 7.850 kg/m³** e **Aço Inox 8.000 kg/m³**. Por exemplo, uma chapa de aço carbono de 3000 × 1500 × 2 mm pesa aproximadamente **70,65 kg**. A liga específica pode alterar o peso real. Retalhos em L ou com furos são estimados pelo retângulo cadastrado, sem descontar recortes. Essas premissas aparecem na própria tela. Os pesos são derivados do estoque, sem gravar um saldo paralelo no banco.

### Peso de uma peça e planilha Excel

Em **Pesos → Peso por peça**, consulte o peso unitário de cada cadastro, sua quantidade disponível e o peso total correspondente. Chapas inteiras e retalhos aparecem em tabelas separadas com identificação, aço, espessura, medidas, localização, observações e situação. Uma linha representa um cadastro de peças iguais; não são inventados identificadores individuais para as unidades do lote.

O botão **Exportar Excel (.xlsx)** gera um arquivo com quatro abas:

| Aba | Conteúdo |
| --- | --- |
| Resumo | Indicadores de peso e tabela por aço/espessura, com chapas e retalhos separados |
| Chapas inteiras | Todo o catálogo, peso de uma chapa, quantidade e peso em estoque, medidas e localização |
| Retalhos | Todos os cadastros, inclusive consumidos, peso unitário e do saldo, observações, ID de origem, data e revisão |
| Critérios | Fórmula, densidades, unidades, premissas, uso dos filtros e instruções de leitura |

A planilha tem cabeçalhos em azul escuro, destaque verde para retalhos e peso unitário, linhas alternadas, filtros por coluna, cabeçalhos/identificação fixos ao rolar, formatos numéricos com duas casas e configuração de impressão. As fórmulas de peso e os totais possuem resultados salvos para leitores que não recalculam automaticamente. O Excel recalcula ao abrir. Nos detalhes, **TOTAL VISÍVEL** acompanha os filtros; o resumo por aço/espessura considera todos os cadastros.

O relatório inclui todos os dados cadastrais de estoque dessas categorias, independentemente da visualização aberta na tela. Atividades e histórico de movimentações continuam nas exportações próprias do sistema. Registros sem saldo mantêm seu peso unitário como referência, mas contribuem com **zero** para o peso em estoque.

A exportação captura o estoque uma única vez para manter o arquivo consistente. Ela informa o usuário, o horário de emissão em Brasília e se a conexão estava disponível; sem conexão, usa o último estoque recebido e destaca essa condição. O arquivo é um retrato independente: exporte novamente para obter alterações posteriores. O exportador ExcelJS é incluído no mesmo arquivo JavaScript do aplicativo, sem carregamento dinâmico ou serviço externo ao clicar para exportar. O build gera um nome de arquivo por versão para evitar reutilização de código antigo pelo cache.

## Importar retalhos de uma planilha

Em **Retalhos → Importar planilha**, selecione um `.xlsx` que contenha a aba **Cadastro de retalhos**, com as colunas Código, Material, Espessura (mm), Formato, Comprimento (mm), Largura (mm) e Qtd. O leitor identifica os cabeçalhos, aceita os modelos de carbono (`CAR-`) e inox (`INOX-`) e reconhece a coluna adicional Diâmetro (mm) do inox. Origem, ordem, anotação, situação e observações são preservadas quando presentes. O leitor aceita os namespaces XML do arquivo original e lê somente valores; não executa fórmulas ou instruções de outras abas.

Confira a prévia e preencha os registros pendentes de medida. Circulares com anotação `Ø290`, por exemplo, entram como **290 × 290 mm**, com o formato circular nas observações. O peso continua sendo uma estimativa pelo envelope retangular. Não é atribuída uma prateleira fictícia: o código original serve de identificação. As marcações de conferência permanecem nas observações, inclusive para peças circulares. A quantidade é lida da coluna Qtd., sem confusão com o diâmetro. Cada material usa um lote separado, e reenviar a planilha de inox não altera os retalhos de carbono já importados.

Ao clicar em **Importar para a nuvem**, o sistema grava o lote inteiro e o histórico individual de cada retalho em uma transação autenticada. Espessuras numéricas ausentes, como 9,53 mm, entram separadamente no catálogo, com saldo de chapas zero; 9,35 mm permanece distinto. Materiais desconhecidos e espessuras arquivadas precisam ser cadastrados/reativados antes. Uma falha de validação impede a gravação de todo o lote.

O mesmo código no mesmo lote nunca aumenta o estoque novamente, inclusive depois de baixa ou corte. Uma versão corrigida pode acrescentar códigos novos, mas não substitui cadastros já importados. Arquivos JSON no formato `chaparia-retalhos`, versão 1, também são aceitos. Limites: 5 MB por arquivo e 1.000 registros por lote.

Links preparados podem carregar um lote completo ou correções de medidas e quantidades. No segundo caso, selecione a planilha original para aplicar as correções automaticamente. A prévia abre após o login, e o fragmento da URL é removido após a leitura. O link sozinho não grava estoque: a gravação ocorre pelo botão de importação. Os dados da planilha não são incluídos no repositório ou no build público.

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

- **47 testes de lógica e exportação:** catálogo, quantidades, concorrência, revisões, retalhos, transições de atividades, backups e CSV.
- **29 testes de interface e transporte:** navegação, operações, sincronização simulada entre navegadores, cópia de compras, formulários, restauração e conflitos de edição.
- **14 testes de regras/integração:** acessos autenticados/não autenticados, validação, inicialização e transações concorrentes no emulador oficial do Realtime Database.

Os testes de interface usam um serviço simulado em memória; dois testes adicionais usam o SDK real para verificar o transporte HTTP alternativo, a política de conteúdo e o cancelamento da espera. Eles utilizam um bundle isolado em `work/e2e/`. Esse serviço **não entra no build de produção**. A produção usa somente o SDK oficial do Firebase. Os testes de interface não equivalem a um teste no Firebase real.

A suíte `.github/workflows/verify.yml` executa lógica, emulador e interface no GitHub Actions. O relatório de verificações desta entrega está em [docs/VALIDACAO.md](docs/VALIDACAO.md).

## Dados, sincronização e recuperação

- `onAuthStateChanged` inicia as assinaturas `onValue` após o login e as remove ao sair ou trocar de usuário.
- O nó compartilhado é **`/chaparia`**. Ele contém `schemaVersion`, `sheets`, `remnants`, `tasks`, `movements` e os materiais adicionais em `materials`.
- Cada movimentação usa `runTransaction` no nó compartilhado, gravando saldo e histórico na mesma operação. Se outro aparelho altera o saldo durante uma baixa, o Firebase repete o cálculo sobre o saldo mais recente. Não há saldo negativo confirmado pelo aplicativo.
- Edições de metadados, retalhos e atividades usam revisões. Se outro operador editar um registro com um formulário já aberto, a operação é rejeitada, preservando o rascunho para revisão.
- O aplicativo só informa sucesso após a confirmação da transação pelo servidor. Sem conexão, novas operações são bloqueadas. Se a conexão cair durante uma gravação enviada, a tela continua aguardando confirmação; mantenha a aba aberta até concluir.
- Estoque, atividades e histórico não são gravados em `localStorage` ou IndexedDB. Somente preferências visuais e a data da última exportação ficam em `localStorage`. A sessão de autenticação usa a persistência de sessão do SDK; senhas não são armazenadas pelo aplicativo.
- **Backup de Atividades:** formato compatível com o Compasso (`atividades-local`, versão 1). Inclui todas as atividades e conclusões. Restaurar substitui somente as atividades; o estoque e as movimentações continuam preservados. A restauração gera um registro e rejeita alterações concorrentes durante a confirmação.
- **Exportar estoque e histórico:** em Movimentações, baixa um JSON contendo todo o nó `/chaparia`. Para uma recuperação administrativa completa, valide a exportação e restaure seu campo `data` no nó `/chaparia` pelo console Firebase. Evite restaurar a raiz inteira e não faça isso com operadores trabalhando.
- Para migrar atividades do aplicativo anterior, exporte o JSON antigo e importe em Backup de Atividades. A restauração substitui a lista atual, com confirmação. Nenhum banco local antigo é apagado ou migrado silenciosamente.

A abertura assina separadamente chapas, retalhos, materiais, atividades e versão do esquema. O dashboard acompanha apenas as últimas 100 movimentações, consultadas com o índice timestamp. O histórico completo é carregado ao abrir Movimentações; a exportação dessa seção aguarda sua carga completa. As gravações ainda leem temporariamente o nó compartilhado completo e executam a transação de estoque + histórico de forma atômica. Portanto, o custo de uma gravação ainda cresce com o histórico; para alto volume de movimentações, planeje transações por entidade com backend para auditoria. Não há limite de retenção ou limpeza automática.

Se o estoque não responder em 15 segundos, a tela de acesso informa o problema e oferece **Tentar novamente**, preservando a sessão. As assinaturas continuam aguardando uma resposta e a entrada ocorre automaticamente se a conexão voltar. A política de conteúdo permite os scripts e frames do transporte HTTP alternativo do Firebase, usado quando o WebSocket não está disponível. As regras do banco continuam exigindo autenticação.

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
│   ├── shared-data.js
│   ├── cloud.js
│   ├── database.js
│   ├── catalog.js
│   ├── domain.js
│   ├── icons.js
│   ├── inventory.js
│   ├── tasks.js
│   ├── weights.js
│   ├── weights-excel.js
│   ├── weights-page.js
│   └── ui.js
├── scripts/
│   ├── build.mjs
│   └── preview.mjs
├── tests/
│   ├── catalog.test.js
│   ├── domain.test.js
│   ├── ooxml-structure.js
│   ├── weights-excel.test.js
│   ├── weights.test.js
│   ├── rules.test.js
│   ├── ui.spec.js
│   ├── serve.mjs
│   └── fixtures/cloud.js
└── docs/
    ├── ATUALIZAR-CATALOGO.md
    ├── CONFIGURACAO.md
    └── VALIDACAO.md
```

`dist/`, `work/`, dependências e relatórios de testes são gerados e ignorados pelo Git. `sw.js` apenas encerra uma instalação antiga do cache offline do Compasso; os dados críticos não usam cache offline.
