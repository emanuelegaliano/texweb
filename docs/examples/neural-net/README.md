# Example: a neural network

The forward pass of a network with 2 inputs, one hidden layer and one output, computed one neuron at a time. Sliders change the inputs and the whole network is recomputed. The [widget guide](../../widget-guide.md#tutorial-a-neural-network) walks through the code.

## Install it in your notes

Copy this folder into `widgets/` next to your notes, then restart `texweb dev`:

```bash
cp -r /path/to/texweb/docs/examples/neural-net /path/to/notes/widgets/
```

## Parameters

| parameter | type | default | meaning |
|---|---|---|---|
| `x` | list | `{1, 0.5}` | the two inputs |
| `hidden` | integer, 1 to 6 | `3` | neurons in the hidden layer |
| `activation` | `relu`, `sigmoid` or `tanh` | `relu` | activation of the hidden layer |
| `seed` | integer | `7` | seed of the random weights |
| `interval` | number, at least 300 | `1600` | milliseconds per step at 1× |

## Usage, with the PDF figure

The PDF figure is the final state of the animation: values in the neurons, weights on the edges, and the computation of every neuron below the network. The numbers are those the widget produces with `seed=7`.

```latex
% in the preamble
\usetikzlibrary{positioning}

\begin{figure}[htbp]
\centering
\begin{widget}{neural-net}[x={1, 0.5}, hidden=3, activation=relu]
\begin{tikzpicture}[
    >=latex,
    neur/.style={draw=black!60, circle, minimum size=9mm, inner sep=0pt, font=\small},
    wpos/.style={draw=Accent, ->},
    wneg/.style={draw=red!70!black, ->},
    wzero/.style={draw=black!35, dotted, ->},
    weight/.style={font=\scriptsize, fill=white, inner sep=1pt},
  ]
  % neurons: the fill follows the value (h_2 is the only active one)
  \node[neur] (x1) at (0, 1.2) {$1$};
  \node[neur] (x2) at (0,-1.2) {$0.5$};
  \node[neur] (h1) at (4.2, 2.1) {$0$};
  \node[neur, fill=Accent!70, text=white] (h2) at (4.2, 0) {$0.7$};
  \node[neur] (h3) at (4.2,-2.1) {$0$};
  \node[neur, fill=Accent!20] (y) at (8.4, 0) {$0.15$};

  % names and pre-activations, placed where no edge passes
  \node[left=1mm of x1] {$x_1$};
  \node[left=1mm of x2] {$x_2$};
  \node[right=1mm of y] {$\hat y$};
  \node[above left=0mm and -1mm of h1] {$h_1$};
  \node[above=0.5mm of h2] {$h_2$};
  \node[below left=0mm and -1mm of h3] {$h_3$};
  \node[above right=0mm and -1mm of h1, font=\scriptsize, black!60] {$z_1 = -1.55$};
  \node[below right=0mm and -1mm of h2, font=\scriptsize, black!60] {$z_2 = 0.7$};
  \node[below right=0mm and -1mm of h3, font=\scriptsize, black!60] {$z_3 = 0$};

  % edges: color = sign of the weight, thickness = magnitude;
  % labels sit near the target neuron, away from the crossings
  \draw[wneg, line width=1.6pt] (x1) -- node[weight, pos=0.8] {$-1$} (h1);
  \draw[wneg, line width=1.4pt] (x2) -- node[weight, pos=0.8] {$-0.9$} (h1);
  \draw[wpos, line width=1.6pt] (x1) -- node[weight, pos=0.8] {$1$} (h2);
  \draw[wpos, line width=0.9pt] (x2) -- node[weight, pos=0.8] {$0.4$} (h2);
  \draw[wzero]                  (x1) -- node[weight, pos=0.8] {$0$} (h3);
  \draw[wneg, line width=0.6pt] (x2) -- node[weight, pos=0.8] {$-0.2$} (h3);
  \draw[wpos, line width=1.1pt] (h1) -- node[weight, pos=0.45] {$0.5$} (y);
  \draw[wneg, line width=1.1pt] (h2) -- node[weight, pos=0.45] {$-0.5$} (y);
  \draw[wneg, line width=1.3pt] (h3) -- node[weight, pos=0.45] {$-0.7$} (y);

  % one computation per neuron: on the website they appear one step at a time
  \node[anchor=north, font=\small] at (4.2,-3.2) {$\begin{aligned}
    h_1 &= \mathrm{ReLU}(-1 \cdot 1 - 0.9 \cdot 0.5 - 0.1) = \mathrm{ReLU}(-1.55) = 0 \\
    h_2 &= \mathrm{ReLU}(1 \cdot 1 + 0.4 \cdot 0.5 - 0.5) = \mathrm{ReLU}(0.7) = 0.7 \\
    h_3 &= \mathrm{ReLU}(0 \cdot 1 - 0.2 \cdot 0.5 + 0.1) = \mathrm{ReLU}(0) = 0 \\
    \hat y &= 0.5 \cdot 0 - 0.5 \cdot 0.7 - 0.7 \cdot 0 + 0.5 = 0.15
  \end{aligned}$};
\end{tikzpicture}
\end{widget}
\caption{The forward pass of a network with two inputs and a hidden layer of three neurons, with $x = (1, 0.5)$ and ReLU. Positive weights are drawn in the accent color, negative ones in red, and the thickness is proportional to the weight. $h_1$ and $h_3$ have $z \le 0$ and ReLU switches them off, so the output only depends on $h_2$.}
\label{fig:net}
\end{figure}
```

Note that a TikZ style cannot be called `pos`: it is already a TikZ key.
