# Ativar materiais, espessuras e reposição configurável

Esta atualização adiciona materiais e espessuras ao catálogo, permite configurar o ponto de reposição por chapa e remove espessuras do catálogo ativo sem apagar o histórico. Os novos campos precisam ser permitidos pelas regras do Realtime Database.

## Publicar as regras atualizadas

1. Abra o [Console Firebase](https://console.firebase.google.com/) e selecione o projeto do banco `https://controle-chaparia-default-rtdb.firebaseio.com/`.
2. Vá em **Realtime Database → Regras / Rules**.
3. Copie **todo o conteúdo** do [arquivo database.rules.json](https://github.com/felipesales-12/Controle-Chaparia/blob/main/database.rules.json) atualizado no repositório. Você pode usar **Raw** para abrir somente o JSON.
4. Substitua as regras pelo arquivo e clique em **Publicar**.
5. Reabra ou atualize o sistema e teste o cadastro de um material ou a alteração de um ponto de reposição.

Não altere a aba **Dados** para executar essa atualização. Não apague o banco nem importe um novo catálogo. Os registros antigos continuam válidos: pontos de reposição não definidos assumem 2 e espessuras sem campo de arquivamento continuam ativas.

As regras continuam exigindo `auth != null` e passam a validar materiais cadastrados, densidade positiva, espessura numérica, ponto de reposição inteiro não negativo e metadados de arquivamento. Se o Firebase negar o salvamento de um novo campo, confira se as regras foram publicadas no banco correto. O sistema só informa sucesso depois de receber a confirmação da nuvem.

Como alternativa, se você já estiver autenticado na CLI Firebase com acesso ao projeto, execute no checkout atualizado:

```bash
npx firebase login
npx firebase deploy --only database --project SEU_PROJECT_ID
```

Substitua `SEU_PROJECT_ID` pelo valor do seu console Firebase. Não use o projeto de testes `demo-chaparia` para a publicação real.

## Exemplo: criar Chapa piso 3 mm e 4,76 mm

1. Em **Chapas inteiras**, clique em **Novo material**.
2. Informe **Chapa piso** e a densidade de referência adequada. O formulário sugere **7.850 kg/m³**, referência de aço carbono. Confirme o cadastro.
3. Clique em **Adicionar espessura**, selecione **Chapa piso** e informe **3 mm**, dimensões, localização e ponto de reposição.
4. Repita para **4,76 mm**. Nos campos numéricos, o navegador pode exibir vírgula ou ponto conforme sua configuração.
5. Use **Entrada** para registrar o saldo. Cada combinação começa com quantidade zero.
6. No botão de edição da linha, ajuste o ponto de reposição quando precisar. Um ponto 5 gera alerta quando o saldo chegar a 5 ou menos.

## Remover e reativar

O botão da lixeira **Remover espessura** retira a combinação do catálogo ativo. Primeiro é necessário dar baixa em todas as chapas e retalhos disponíveis daquela combinação. A transação confere o saldo novamente para proteger contra movimentações simultâneas.

A remoção preserva o registro, os retalhos consumidos e o histórico. A espessura removida deixa de gerar compras e de ser oferecida em novos cadastros. Para reativar, use **Adicionar espessura** com o mesmo material e espessura; o saldo volta a zero e a revisão continua a partir do registro anterior.

O Excel inclui as espessuras arquivadas no detalhamento, identificadas como **Arquivada**, com ponto de reposição e data de arquivamento. Seus pesos em estoque são zero.
