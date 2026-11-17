# Ativação do Firebase e do GitHub Pages

## 1. Obter os valores do aplicativo Web

Abra https://console.firebase.google.com/ e escolha o projeto que contém este banco:

`https://controle-chaparia-default-rtdb.firebaseio.com/`

Abra a engrenagem → Configurações do projeto → Geral → Seus aplicativos. Se não houver aplicativo Web, clique no símbolo `</>`, dê um nome ao app e conclua o registro. Não é necessário habilitar Firebase Hosting: a hospedagem será feita pelo GitHub Pages.

Copie os valores públicos mostrados em `firebaseConfig` para **firebase-config.js**, na raiz do repositório. Substitua cada texto `COLE_AQUI_...` pelo valor correspondente:

| Campo | Valor a usar |
| --- | --- |
| apiKey | apiKey do aplicativo Web |
| authDomain | authDomain do mesmo aplicativo |
| projectId | projectId do mesmo projeto |
| storageBucket | storageBucket exibido na configuração |
| messagingSenderId | messagingSenderId do mesmo aplicativo |
| appId | appId do mesmo aplicativo |
| databaseURL | Já preenchida com a URL exata solicitada |

Esses valores identificam o app público. O controle de acesso depende de Authentication e das regras do banco, que devem ser ativados abaixo. Não envie chave de conta de serviço, senha pessoal nem credenciais administrativas para este arquivo.

## 2. Ativar o login e criar os operadores

No menu Build → Authentication, clique em Get started se necessário. Em Sign-in method, habilite **Email/Password**. Não é necessário ativar link de login por e-mail.

Em Users → Add user, crie um usuário para cada pessoa da equipe. Prefira contas individuais: o histórico mostra o e-mail de quem movimentou o estoque. O site oferece login e recuperação de senha, sem formulário de cadastro público.

Em Settings → Authorized domains, adicione:

```text
felipesales-12.github.io
localhost
127.0.0.1
```

Os dois últimos são para testes locais. Cadastre somente o domínio, sem `https://` e sem o nome do repositório. Para usar um domínio próprio, adicione-o também.

## 3. Publicar as regras do Realtime Database

Em Build → Realtime Database, confirme a URL do banco. Abra a aba Rules. Copie **todo o arquivo database.rules.json**, substitua as regras atuais e clique em Publicar.

O arquivo já exige usuário autenticado para ler e escrever e valida os principais campos. Não deixe regras públicas nem use o modo de teste com expiração como configuração definitiva.

Alternativa por CLI, caso já tenha acesso autorizado ao projeto:

```bash
npx firebase login
npx firebase deploy --only database --project SEU_PROJECT_ID
```

Substitua `SEU_PROJECT_ID` pelo valor obtido no console. `firebase.json` já aponta para o arquivo de regras. Os testes locais usam somente o projeto fictício `demo-chaparia`.

## 4. Configurar o GitHub Pages

Abra o repositório no GitHub → Settings → Pages. Em Build and deployment, selecione **GitHub Actions**.

Se Actions estiver desabilitado, habilite em Settings → Actions → General. O workflow já pede as permissões necessárias de `pages: write` e `id-token: write` no job de publicação. Uma regra de proteção do ambiente `github-pages`, caso exista na conta, pode exigir aprovação do proprietário antes de publicar.

Faça commit da configuração do Firebase e envie para `main`:

```bash
git add firebase-config.js
git commit -m "Configura aplicativo Firebase da chaparia"
git push origin main
```

Abra Actions → Publicar Controle de Chaparia. Aguarde `build` e `deploy` ficarem verdes. Se o push inicial aconteceu antes de ativar Pages, execute Run workflow novamente depois de ativar.

Não selecione a publicação direta da pasta raiz: o código-fonte usa dependências npm. O workflow publica o conteúdo compilado de `dist/`.

## 5. Escolher o endereço correto

GitHub Pages usa o nome do repositório:

| Nome do repositório | Endereço padrão |
| --- | --- |
| Controle-Chaparia | https://felipesales-12.github.io/Controle-Chaparia/ |
| Controle_Chaparia | https://felipesales-12.github.io/Controle_Chaparia/ |
| Codex | https://felipesales-12.github.io/Codex/ |

Para obter exatamente o endereço com sublinhado pedido na especificação, renomeie o repositório para `Controle_Chaparia` em Settings → General → Repository name. Depois, atualize a URL de seu clone local, se já existir:

```bash
git remote set-url origin https://github.com/felipesales-12/Controle_Chaparia.git
```

Não há `base` fixa para corrigir: imports, scripts, estilos e ícones usam caminhos relativos. A navegação por hash evita rotas que dependam de um servidor de aplicação.

## 6. Conferência inicial

1. Abra a URL publicada e faça login com uma conta criada no Firebase.
2. Em um banco vazio, confira 14 itens com quantidade zero. O alerta de reposição de todos eles é esperado nesse momento.
3. Em Chapas, registre entrada de 3 chapas de uma espessura. Esse item deve sair da relação de reposição.
4. Faça baixa de 1. O item volta ao alerta com saldo 2.
5. Abra o site em outro aparelho e entre com outra conta autorizada. Ambos devem ver o mesmo saldo, sem recarregar manualmente.
6. Cadastre um retalho com 3 peças de 800 × 1200 mm. Busque por 1000 × 700 mm com rotação habilitada. Ele deve ser compatível.
7. Use Cortar / Sub-retalho e informe sobra de 400 × 600 mm. Deve haver 2 peças originais e 1 sobra menor.
8. Cadastre, inicie e conclua uma atividade. Confira Concluídas e Movimentações.
9. Exporte um backup de atividades e o estoque/histórico. Guarde as cópias fora do aparelho.
10. Saia da conta. Estoque, histórico e atividades devem ficar ocultos.

## Resolução de problemas

| Sintoma | Conferência |
| --- | --- |
| Login desabilitado | Todos os campos `COLE_AQUI_...` foram preenchidos? O último push foi publicado? |
| E-mail/senha inválidos | Usuário existe no Authentication do mesmo projeto? A senha está correta? |
| Provedor não permitido | E-mail/senha está habilitado em Sign-in method? |
| Acesso negado ao banco | Regras foram publicadas no banco da URL exata? Usuário está autenticado no mesmo projeto? |
| Fica carregando / sem conexão | Confira a internet e permita conexões HTTPS/WebSocket do Firebase na rede da fábrica. |
| Página 404 | Use o endereço mostrado pelo deploy e confira hífen versus sublinhado no nome do repositório. |
| Assets 404 | Publique o artefato `dist/` pelo workflow, não o código-fonte sem build. |
| configure-pages falhou | Selecione GitHub Actions em Settings → Pages e execute o workflow novamente. |
| Edição desatualizada | Outro operador alterou o registro. Copie seu rascunho, feche o formulário, revise a lista e reabra. |
| Esqueci minha senha | Use a opção da tela de login e confira o e-mail; o envio depende da configuração de Authentication. |

Ao perder conexão durante uma gravação, aguarde a confirmação antes de fechar a aba. Se o navegador for encerrado antes disso, confira saldo e histórico ao retornar antes de repetir a operação.
