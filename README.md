# Cifrador

Editor de cifras que roda direto no navegador, sem servidor. Você digita a linha de acordes em cima da letra e o Cifrador monta a folha A4 pronta para imprimir, com o acorde preso à letra exata sobre a qual foi digitado.

## Como usar

Abra o `index.html` no navegador, ou publique a pasta pelo GitHub Pages (Settings → Pages → Deploy from a branch → `main` / raiz).

- **Acordes sobre a letra**: a linha de acordes vai em cima da linha da letra.
- **Seções**: `[Intro]`, `[Verso 1]`, `[Refrão]`, `[Ponte]`. Repita `[Refrão]` sem nada embaixo para indicar a repetição. Uma linha só com `[]` encerra a seção anterior sem abrir outra com nome.
- **Frases com notas** (solo, melodia): comece a linha com `Notas:`, por exemplo `Notas: mi sol lá si` ou `Notas: E G A B`.
- **Anotações para os músicos**: comece a linha com `>`, por exemplo `> Bumbo em colcheia, cresce`. Também vale na linha do nome da seção (`[Final] > Somente guitarra`) e no fim de uma linha de acordes (`Bm  G  A > vem crescendo`). Vários `>` na mesma linha viram anotações separadas, lado a lado (`> Banda suave > Teclado 1 - Pad`). Uma seção repetida pode trazer só o nome e as anotações daquela vez.
- **Modo palco**: a cifra limpa para tocar pelo celular, com cada seção numa faixa azul de ponta a ponta, anotações em destaque logo abaixo e cores claras ou escuras. No celular, tocar em uma música na lista abre esse modo; no computador, use o botão "Modo palco".
- **Repertórios**: na lista, a aba "Repertórios" monta a sequência de músicas de um culto ou ensaio (nome, data e ordem). "Tocar" abre o modo palco com os botões de música anterior e próxima; pedais de virar página que enviam as setas ← → também funcionam. No grupo, todos veem os mesmos repertórios.
- **Paleta de acordes**: escolhido o tom, a folha mostra o campo harmônico (tríades ou tétrades), os empréstimos do tom homônimo e os dominantes secundários. Arraste o acorde até a letra, ou clique na letra e depois no acorde. Acordes já colocados podem ser arrastados, trocados, movidos com as setas e apagados com `Delete`.
- **Transposição**: no editor, os botões −½ tom e +½ tom alteram a música para todos. No modo palco, a transposição vale só naquele aparelho e volta ao tom original ao recarregar a página.
- **Ajuste fino**: com o cursor sobre um acorde, `Alt` + `←` / `→` move o acorde uma casa.
- **Folha**: A4 em 1 ou 2 colunas, tamanho da letra, margem, cor dos acordes e o botão "Caber em 1 página".
- **Importar**: letra em `.txt`, cifra em ChordPro (`.cho`) ou backup (`.json`).
- **Grupo online**: com o código do grupo (botão "Grupo"), as músicas ficam no Firebase e todos que usam o mesmo código veem e editam as mesmas músicas. Sem conexão, as alterações ficam no aparelho e são enviadas quando a internet volta.
- **Perfis no grupo**: todo aparelho entra no grupo como **músico**, que vê as músicas e os repertórios, usa o modo palco e imprime, sem poder alterar nada. Com a **senha de editor** do grupo, o aparelho passa a **editor**, com acesso total. A primeira pessoa a entrar como editor cria a senha; editores podem trocá-la pelo botão do grupo. A proteção é contra alterações por engano: quem tem o código do grupo e conhecimento técnico ainda consegue gravar no banco.
- **Sem internet**: depois da primeira visita, o Cifrador abre mesmo sem conexão, com a última cópia das músicas. Ao sair do grupo, ele oferece guardar uma cópia das músicas do grupo no aparelho.
- **Salvar**: as músicas ficam guardadas no navegador. "Salvar arquivo" gera um `.cho` (ChordPro) da música aberta e "Backup" gera um `.json` com todas.


## Configurar o grupo online (Firebase, plano Spark gratuito)

1. Em console.firebase.google.com, crie um projeto. Não cadastre cartão nem mude para o plano Blaze.
2. Em Realtime Database, crie o banco no modo bloqueado.
3. Na aba **Regras**, cole o conteúdo de `database.rules.json` e publique.
4. Na aba **Dados**, crie `codigos` → `<código-do-grupo>` com o valor `true`. O código usa de 6 a 60 letras minúsculas, números, `-` ou `_`. Para desativar um código, mude o valor para `false`.
5. Em Configurações do projeto → Seus apps, registre um app da Web e copie o `firebaseConfig` para `js/config.js`.

Quem tem o código pode ver, editar e excluir as músicas do grupo; faça um "Backup" de vez em quando.

## Estrutura

- `index.html` — a tela
- `css/style.css` — aparência, folha A4 e regras de impressão
- `js/music.js` — acordes, notas, transposição e ChordPro
- `js/app.js` — lista, editor, paginação, arquivos e grupo
- `js/cloud.js` — conexão com o Firebase Realtime Database
- `js/config.js` — configuração pública do projeto Firebase
- `sw.js` — guarda o app no aparelho para abrir sem internet
- `database.rules.json` — regras de acesso do banco
- `tests/music.test.js` — testes do motor musical (`node tests/music.test.js`)
