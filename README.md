# texweb

Scrivi gli appunti in LaTeX, come sempre. Dallo stesso sorgente escono:

- il **PDF**, con `pdflatex` o `latexmk`, senza cambiare niente nel flusso di lavoro;
- un **sito**, con numerazione, `\ref`, `\cite`, bibliografia e figure TikZ identiche al PDF, più delle **figure interattive** (animazioni a passi, canvas, 3D) scritte in JavaScript.

```latex
\begin{figure}[htbp]
\centering
\begin{widget}{rete}[x={1, 0.5}, hidden=3, activation=relu]
  \begin{tikzpicture} ... \end{tikzpicture}   % la figura per il PDF
\end{widget}
\caption{Il forward pass di una rete con due input e un hidden layer.}
\label{fig:rete}
\end{figure}
```

Nel PDF compare il `tikzpicture`. Sul sito, al suo posto, la rete che calcola un neurone alla volta, con play, pausa, passi e velocità. Didascalia, numero e `\ref{fig:rete}` sono gli stessi nei due casi.

---

## Indice

- [Requisiti](#requisiti)
- [Installazione](#installazione)
- [Usarlo con i tuoi appunti](#usarlo-con-i-tuoi-appunti)
- [L'ambiente widget](#lambiente-widget)
- [Scrivere un widget](#scrivere-un-widget)
- [Comandi](#comandi)
- [Configurazione](#configurazione)
- [Come funziona](#come-funziona)
- [Il dialetto](#il-dialetto)
- [Struttura della repo](#struttura-della-repo)
- [Limiti noti](#limiti-noti)

## Requisiti

- **Node.js 20** o successivo.
- **TeX Live** (o MacTeX) con `latex` e `dvisvgm`, per compilare le figure TikZ in SVG.
- **Ghostscript** (`gs`), solo se includi immagini PDF con `\includegraphics`: vengono convertite in PNG.

## Installazione

```bash
git clone https://github.com/emanuelegaliano/texweb.git
cd texweb
npm install
```

Per provarlo sull'esempio incluso:

```bash
npm run dev
```

Poi apri http://localhost:5180. L'esempio è in `example/`: due capitoli, una bibliografia, figure TikZ e due widget (`sharpen` e `conv-params`).

Se vuoi il comando `texweb` disponibile ovunque, dalla cartella della repo:

```bash
npm link
```

Altrimenti va benissimo `node /percorso/di/texweb/bin/texweb.js`, come negli esempi qui sotto.

## Usarlo con i tuoi appunti

1. **Copia `texweb.sty` accanto al tuo `.tex` principale.** Serve solo al PDF, per l'ambiente `widget`:
   ```bash
   cp /percorso/di/texweb/latex/texweb.sty /percorso/degli/appunti/
   ```
2. **Aggiungilo al preambolo** con `\usepackage{texweb}`.
3. **Avvia il server di sviluppo** dalla cartella degli appunti:
   ```bash
   node /percorso/di/texweb/bin/texweb.js dev .
   ```
4. **Scrivi.** A ogni salvataggio di un `.tex`, di un `.bib` o di un widget, la pagina si aggiorna da sola. Gli errori (comandi sconosciuti, riferimenti mancanti, parametri dei widget sbagliati) compaiono nel terminale e in cima alla pagina, con file e riga.
5. **Aggiungi `.texweb/` e `dist/` al `.gitignore`** degli appunti: sono la cache e il sito generato.

Il PDF si compila come sempre, con `latexmk -pdf` o con LaTeX Workshop in VS Code. Per vedere il sito accanto all'editor in VS Code: Cmd+Shift+P → **Simple Browser: Show** → `http://localhost:5180`.

Prima di cominciare puoi controllare un progetto esistente, senza scrivere niente:

```bash
node /percorso/di/texweb/bin/texweb.js check .
```

Ti dice quali comandi o ambienti texweb non conosce ancora e quante figure TikZ dovrà compilare. Ti avvisa anche se la copia di `texweb.sty` è vuota o più vecchia di quella della repo.

## L'ambiente widget

```latex
\begin{widget}{nome}[opzioni]
  figura per il PDF
\end{widget}
```

- **`{nome}`** è il nome del componente: la cartella `widgets/nome/` accanto agli appunti.
- **`[opzioni]`** sono i parametri, in stile `key=value` come le opzioni dei pacchetti LaTeX. Una chiave da sola (`autoplay`) vale `true`, i numeri restano numeri, le liste si scrivono come in TikZ: `x={1, 0.5}`, `kernel={{0,-1,0},{-1,5,-1},{0,-1,0}}`.
- **Il contenuto è la figura per il PDF**, ed è **obbligatorio**. Può essere un `tikzpicture`, un `\includegraphics` o qualunque altra cosa. Per un'animazione a passi, una buona figura sostitutiva è l'ultimo passo, con tutti i valori, e sotto i conti di ciascun passo.

| | Nel PDF | Sul sito |
|---|---|---|
| nome e opzioni | ignorati | controllati contro i parametri dichiarati dal widget |
| contenuto | stampato | compilato in SVG e mostrato finché il widget non si carica |
| contenuto vuoto | avviso di LaTeX e riquadro rosso «Figura mancante» | errore con file e riga |

## Scrivere un widget

Un widget è una cartella in `widgets/`, accanto agli appunti, con un `index.js`. Il nome della cartella è quello che usi in `\begin{widget}{...}`.

```js
import { defineWidget, h } from 'texweb/client';

export default defineWidget({
  name: 'contatore',
  params: {
    testo: { type: 'string', default: 'ciao' },
    inizio: { type: 'integer', default: 0, min: 0 },
  },
  mount(el, { testo, inizio }) {
    let n = inizio;
    const btn = h('button', { type: 'button' }, `${testo} × ${n}`);
    btn.addEventListener('click', () => (btn.textContent = `${testo} × ${++n}`));
    el.append(btn);
  },
});
```

```latex
\begin{widget}{contatore}[testo=ReLU, inizio=3]
  Un pulsante che conta i clic.
\end{widget}
```

**Come si collegano LaTeX e JavaScript.** Li collega solo il nome:

1. texweb trova `widgets/contatore/index.js` e controlla le opzioni scritte nel `.tex` contro `params`;
2. nella pagina scrive un `<div data-widget="contatore">` con i parametri già convertiti;
3. nel browser, quando il `div` sta per entrare nello schermo, importa il widget e chiama `mount(el, params)`.

`mount` riceve un `div` vuoto e ci mette dentro quello che vuole: SVG, canvas, Three.js. Non c'è altro da registrare. Se crei un widget nuovo con il server già acceso, riavvialo: i widget si cercano all'avvio. Le modifiche successive ai file vengono prese da sole.

**Tipi dei parametri**

| tipo | esempio nel `.tex` | in JavaScript |
|---|---|---|
| `number`, `integer` (con `min` e `max`) | `interval=1200` | `1200` |
| `boolean` | `autoplay` oppure `autoplay=false` | `true` / `false` |
| `string` | `testo=ReLU` | `'ReLU'` |
| `enum` (con `values`) | `activation=tanh` | `'tanh'` |
| `list` | `x={1, 0.5}` | `[1, 0.5]` |
| `matrix` | `k={{1,2},{3,4}}` | `[[1, 2], [3, 4]]` |
| `json` | `cfg={"a": 1}` | `{ a: 1 }` |

Un parametro può avere `default` oppure `required: true`. Un parametro sconosciuto, di tipo sbagliato o fuori intervallo è un errore, con un suggerimento se sembra un errore di battitura: `parametro sconosciuto "kernal" (forse "kernel"?)`.

**Il kit `texweb/client`**

- `h(tag, attributi, figli)` e `s(tag, attributi, figli)` creano elementi HTML e SVG.
- `svgRoot(larghezza, altezza)` crea un SVG che si adatta alla colonna di testo.
- `grid` e `windowRect` sono gli equivalenti di `\numgrid` e `\cellrect`: griglie di numeri e finestre che si spostano sopra.
- `createPlayer({ steps, onStep, interval })` dà i controlli delle animazioni a passi: play, pausa, passo avanti e indietro, ricomincia, velocità 0,5×, 1× e 2×.
- `shade(v, max)` e `fmt(v)` colorano le celle in base al valore e formattano i numeri.

**Animazioni a passi.** Scrivi una funzione `draw(n)` che disegna il passo `n` da zero, guardando solo `n`, e passala a `createPlayer`. Il movimento tra un passo e l'altro lo fanno le transizioni CSS. Così indietro e ricomincia funzionano da soli, e quando cambiano i dati (ad esempio con un cursore) basta richiamare `draw`.

**Velocità.** La velocità scelta nel player vale per tutta la pagina, il browser la ricorda e finisce nella variabile CSS `--speed`. Per far scalare anche le transizioni del tuo widget, scrivile così:

```css
transition: fill calc(0.5s / var(--speed, 1)) ease;
```

**Due regole**

- Il widget viene importato anche in Node, per leggere `name` e `params`: `document`, `window` e `localStorage` si usano solo dentro `mount`.
- Le dipendenze dei widget (`katex`, `three`, ...) si installano nella repo di texweb: la cartella degli appunti non ha bisogno di un suo `node_modules`.

Esempi completi:

- `example/widgets/sharpen/`: un kernel che scorre su una matrice, con la formula a ogni passo;
- `example/widgets/conv-params/`: padding, stride e dilation con i cursori;
- `docs/soluzioni/rete/`: una rete con 2 input e un hidden layer, con il forward pass animato e gli input modificabili.

## Comandi

```bash
texweb dev   [cartella] [--port 5180]   # server di sviluppo, rigenera a ogni salvataggio
texweb build [cartella] [--force]       # sito statico in dist/
texweb check [cartella]                 # controlla i sorgenti senza scrivere niente
```

Opzioni comuni: `--cache <cartella>` (al posto di `.texweb/`) e `--out <cartella>` (al posto di `dist/`). `build` si ferma se ci sono errori, a meno di `--force`.

Il risultato di `build` è un sito statico, da pubblicare dove vuoi: GitHub Pages, Netlify, una cartella qualunque.

## Configurazione

Facoltativa: un file `texweb.config.js` nella cartella degli appunti.

```js
export default {
  main: 'DeepLearning.tex',      // altrimenti il .tex con \documentclass
  title: 'Appunti di Deep Learning',
  author: 'Emanuele Galiano',
  widgets: 'widgets',            // cartella dei widget
  outDir: 'dist',
  engine: 'pdflatex',            // per le figure TikZ: pdflatex, lualatex o xelatex
  boxes: {                       // ambienti a box, oltre a quelli predefiniti
    esempio: { title: 'Esempio', numbered: true, style: 'plain' },
  },
  theme: { accent: 'Accent' },   // quale \definecolor usare per ciascun colore del tema
  tikzScale: 1.35,               // ingrandimento delle figure TikZ rispetto al PDF
  katexMacros: { '\\E': '\\mathbb{E}' },
};
```

Senza `\title` nel preambolo il sito si chiama «Appunti»: in quel caso conviene impostare `title` qui.

**Box predefiniti:** `definizione`, `lemma`, `teorema`, `corollario`, `esercizio` (numerati per capitolo), `osservazione`, `esempiofig` (con `\tcblower` per le due colonne) e `proof`. Gli stili sono `accent`, `obs`, `lemma`, `ex`, `plain` e `proof`.

**Colori:** la palette del sito viene dai `\definecolor` del preambolo, con i nomi `Accent`, `ObsColor`, `FigColor`, `LemmaColor` ed `ExColor`. In tema scuro si schiariscono da soli.

## Come funziona

1. **Parser.** I `.tex` vengono letti con [unified-latex](https://github.com/siefkenj/unified-latex), che produce un albero del documento senza eseguire TeX. Si seguono `\input` e `\include`.
2. **Preambolo.** Ne vengono letti macro (`\newcommand`, `\DeclareMathOperator`), colori (`\definecolor`), bibliografia (`\addbibresource`) e metadati (`\title`, `\author`).
3. **Numerazione.** Capitoli, sezioni, figure, tabelle, algoritmi, equazioni e box sono numerati per capitolo come nel PDF. `\ref`, `\eqref` e `\cref` vengono risolti alla fine, anche tra pagine diverse.
4. **Bibliografia.** Citazioni numeriche nell'ordine nome-titolo-anno di biblatex: `\cite`, `\citetitle`, `\textcite`, `\citeauthor`, `\printbibliography`.
5. **Formule.** KaTeX, con le macro del preambolo.
6. **TikZ.** Ogni `tikzpicture` viene compilato dal LaTeX vero, con **lo stesso preambolo** del documento (quindi colori, stili e macro come `\numgrid` funzionano), e convertito in SVG con `dvisvgm`. Si passa dal DVI, così non servono né Ghostscript né mutool, e le immagini PNG dentro i TikZ vengono incorporate. Le figure stanno in cache: si ricompila solo quella modificata.
7. **Sito.** Una pagina per capitolo, indice laterale, note a piè di pagina, navigazione tra capitoli, tema chiaro e scuro. Vite fa da server di sviluppo e produce il sito statico.

## Il dialetto

texweb non è un motore TeX: conosce un elenco esplicito di comandi e ambienti, quelli che si usano scrivendo appunti (`src/dialect.js`). Tutto ciò che non conosce è un **errore con file e riga**, mai qualcosa che sparisce in silenzio.

| | Supportato |
|---|---|
| struttura | `\part`, `\chapter`, `\section`, `\subsection`, `\subsubsection`, `\paragraph` (anche con l'asterisco), `\appendix`, `\input`, `\include` |
| testo | `\textbf`, `\emph`, `\textit`, `\texttt`, `\textsf`, `\textsc`, `\underline`, `\textcolor`, `\footnote`, `\url`, `\href`, accenti (`\'e`), virgolette, trattini, `~` |
| riferimenti | `\label`, `\ref`, `\eqref`, `\pageref`, `\autoref`, `\cref`, `\Cref` |
| citazioni | `\cite`, `\parencite`, `\textcite`, `\citetitle`, `\citeauthor`, `\printbibliography` |
| matematica | `$...$`, `\(...\)`, `\[...\]`, `equation`, `align`, `gather`, `multline` (con e senza asterisco), `\nonumber` |
| elenchi | `itemize`, `enumerate` (anche con `\alph`, `\roman`), `description`, `\item[...]` |
| figure | `figure`, `table`, `\caption`, `\includegraphics` (con `width`, `height`, `scale`), `tikzpicture`, `widget` |
| tabelle | `tabular` con `booktabs`, `\multicolumn`, allineamento delle colonne |
| altro | box `tcolorbox` configurabili, `algorithm` + `algorithmic` (algpseudocode), `lstlisting`, `verbatim`, `\verb`, `quote`, `center`, `minipage` |
| ignorati | comandi di impaginazione del PDF: `\centering`, `\vspace`, `\small`, `\clearpage`, `\setlength`, `\maketitle`, `\tableofcontents`, ... |

Anche le macro definite nel preambolo con `\newcommand` vengono espanse nel testo, con i loro argomenti.

## Struttura della repo

```
bin/texweb.js        il comando: dev, build, check
src/                 parser e dialetto, renderer, preambolo, bibliografia, TikZ, sito, server
client/              runtime delle pagine, stile del sito, kit per i widget (texweb/client)
latex/texweb.sty     l'ambiente widget per il PDF
example/             un progetto di appunti d'esempio, con due widget
docs/soluzioni/      widget completi da usare come riferimento
test/                test (npm test)
```

## Limiti noti

- Il dialetto copre i comandi usati negli appunti, non tutto LaTeX. Per aggiungerne uno servono la firma degli argomenti in `src/dialect.js` e il modo di renderlo in `src/render.js`.
- Le macro definite con `\def` o con `xparse` (`\NewDocumentCommand`) non vengono espanse né nel testo né nelle formule: per le formule si possono aggiungere a mano in `katexMacros`. Nei TikZ invece funzionano tutte, perché li compila LaTeX.
- Sul sito le figure TikZ sono immagini SVG: in tema scuro vengono invertite con un filtro, che va bene per figure in bianco e nero o con colori tenui.
- I widget non hanno ancora un modo per generare da soli la figura per il PDF: va scritta a mano dentro l'ambiente.

## Licenza

[MIT](LICENSE) © 2026 Emanuele Galiano
