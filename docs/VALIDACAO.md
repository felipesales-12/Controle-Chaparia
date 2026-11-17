# Verificação da entrega

Verificações realizadas em 17/11/2026.

**36 testes aprovados:** 17 de lógica, 6 no emulador oficial e 13 de interface. Build aprovado. [Execução de verificação no GitHub Actions](https://github.com/felipesales-12/Controle-Chaparia/actions/runs/44069243580), código `ae7c7c18738dc710957970a10c24530d4ae00c5e`.

| Verificação | Resultado |
| --- | --- |
| Catálogo, estoque, retalhos, revisões, atividades e backups | 17 testes de lógica aprovados |
| Interface no Chromium | 13 testes aprovados localmente e no GitHub Actions |
| Duas sessões autenticadas e saldo simultâneo | Aprovado usando serviço de testes simulado |
| Cópia de lista de compras | Aprovada |
| Preservação de rascunho em falha e edição concorrente | Aprovada |
| Restauração com identificadores/datas e conflito concorrente | Aprovada |
| Caminhos /Codex/, /Controle_Chaparia/ e /Controle-Chaparia/ | Aprovados no preview |
| Layout móvel 390 × 844 | Sem transbordamento horizontal da página; tabelas têm rolagem própria |
| Build de produção | Gerado com SDK oficial Firebase e configuração pública externa |
| Tela de produção sem configuração | Login bloqueado e orientação exibida; sem erros JavaScript |
| Regras no emulador oficial | 6 testes aprovados no emulador oficial pelo GitHub Actions (execução 44069243580) |
| Login/sincronização no Firebase real | Dependem do preenchimento de firebase-config.js e ativação no console; não verificados |
| Publicação do GitHub Pages | Build aprovado; publicação parou em configure-pages com 404 porque Pages ainda não está habilitado |

Os testes de interface substituem o adaptador Firebase apenas no bundle de testes em `work/e2e/`. O backend simulado usa o mesmo redutor de operações e publica atualizações para as sessões de navegador. Esse teste verifica a interface e os fluxos de concorrência, mas não valida conectividade ou regras do Firebase real.

Para executar a integração oficial em uma máquina com Java 21 e acesso aos downloads do Firebase:

```bash
npm ci
npm run test:rules
```

São seis casos no emulador, incluindo leitura/escrita sem autenticação, catálogo inicial, validação de saldo/dimensões e concorrência. O workflow `verify.yml` executa esses casos no GitHub Actions. O teste de concorrência usa o mesmo adaptador de atualização das transações de produção, incluindo aborto seguro quando o saldo se torna insuficiente durante uma repetição.

O teste final com duas contas reais, dois aparelhos e as regras publicadas está descrito em `CONFIGURACAO.md`. Os campos ausentes do Firebase não foram inventados e nenhum banco de produção foi alterado durante a implementação.

## Aba Pesos

Verificação adicional em 17/11/2026: **22 testes de lógica e 15 testes de interface aprovados localmente**, com build de produção concluído. As regras e o esquema do banco permanecem iguais aos da verificação acima.

Os novos casos conferem conversão de mm³ para kg, densidades diferentes por aço, agrupamento por espessura, retalhos de dimensões variadas, saldo zero, corte com sub-retalho, atualização automática da tela e navegação em celular. Exemplo de referência: uma chapa de aço carbono de 3000 × 1500 × 2 mm corresponde a 70,65 kg.


## Peso por peça e exportação Excel

Verificação adicional em 17/11/2026: **27 testes de lógica/exportação e 18 testes de interface aprovados localmente**, com build de produção concluído.

A nova cobertura verifica a separação entre peso unitário e peso do saldo, os metadados completos dos cadastros, retalhos consumidos, fórmulas e resultados numéricos no XLSX, filtros, estilos, cabeçalhos fixos, impressão, estoque vazio, exportação sem conexão, download real no Chromium, cancelamento da exportação ao sair da conta e carregamento da biblioteca somente ao exportar. A leitura independente com openpyxl também confirmou a integridade do arquivo, as fórmulas e seus valores salvos. Não foi feita validação visual no aplicativo Microsoft Excel neste ambiente.


## Catálogo dinâmico, reposição por chapa e ordenação

Em 17/11/2026, a suíte local de lógica passou com **35 testes**. Os novos fluxos de interface verificam ordenação numérica e combinada, criação de Chapa piso com duas espessuras, alterações de reposição, cadastro de retalho em novo material, integração com pesos/Excel, remoção sem saldo e reativação com histórico preservado. O workflow executa a suíte completa de 21 testes de interface e 10 testes no emulador, incluindo as regras dos novos campos.

A publicação do frontend não publica as regras do Firebase. Não há conta administrativa Firebase autenticada neste ambiente; a ativação dos novos campos requer publicar `database.rules.json` no console, como descrito em `ATUALIZAR-CATALOGO.md`.
