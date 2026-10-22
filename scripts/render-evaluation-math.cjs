const fs = require('node:fs');
const path = require('node:path');
const katex = require('../assets/vendor/katex/katex.min.js');
const root = path.join(__dirname, '..');
const formulas = [
  ['α = mean |GT<sub>z</sub>| / mean |pred<sub>z</sub>|<br>E<sub>XYZ</sub> = mean ‖world(α · pred) − GT<sub>world</sub>‖₂', String.raw`\begin{aligned}\alpha&=\frac{\operatorname{mean}|\mathrm{GT}_z|}{\operatorname{mean}|\mathrm{pred}_z|}\\[6pt]E_{\mathrm{XYZ}}&=\operatorname{mean}\left\|\operatorname{world}(\alpha\,\mathrm{pred})-\mathrm{GT}_{\mathrm{world}}\right\|_2\end{aligned}`],
  ['L = mean[c · e − 0.2 log c + 0.1 BCE]', String.raw`L=\operatorname{mean}\!\left[c\,e-0.2\log c+0.1\,\mathrm{BCE}\right]`],
  ['L<sub>s→v</sub> = mean<sub>s→v</sub>[c · e − 0.2 log c + 0.1 BCE]', String.raw`L_{s\to v}=\operatorname{mean}_{s\to v}\!\left[c\,e-0.2\log c+0.1\,\mathrm{BCE}\right]`],
  ['E<sub>pixel</sub> = mean ‖π(K · pred) − π(K · GT)‖₂', String.raw`E_{\mathrm{pixel}}=\operatorname{mean}\left\|\pi(K\,\mathrm{pred})-\pi(K\,\mathrm{GT})\right\|_2`],
  ['α = mean |GT<sub>z</sub>| / mean |pred<sub>z</sub>|', String.raw`\alpha=\frac{\operatorname{mean}|\mathrm{GT}_z|}{\operatorname{mean}|\mathrm{pred}_z|}`],
  ['α<sub>v,t</sub> = mean<sub>q ∈ (v,t)</sub> |GT<sub>z,q</sub>| / mean<sub>q ∈ (v,t)</sub> |pred<sub>z,q</sub>|', String.raw`\alpha_{v,t}=\frac{\operatorname{mean}_{q\in(v,t)}|\mathrm{GT}_{z,q}|}{\operatorname{mean}_{q\in(v,t)}|\mathrm{pred}_{z,q}|}`],
  ['E = mean ‖world(α · pred) − GT<sub>world</sub>‖₂', String.raw`E=\operatorname{mean}\left\|\operatorname{world}(\alpha\,\mathrm{pred})-\mathrm{GT}_{\mathrm{world}}\right\|_2`],
];
for (const name of ['experiment-evaluation.html', 'evaluation.html', 'baseline-evaluation.html', 'scale-comparison.html']) {
  const file = path.join(root, name);
  let html = fs.readFileSync(file, 'utf8');
  for (const [original, tex] of formulas) {
    const old = `<div class="formula">${original}</div>`;
    if (!html.includes(old)) continue;
    const rendered = katex.renderToString(tex, {displayMode:true, throwOnError:true, output:'htmlAndMathml', strict:'error', trust:false});
    html = html.replace(old, `<div class="formula math-formula">${rendered}</div>`);
  }
  if (!html.includes('assets/vendor/katex/katex.min.css')) html=html.replace('</head>', '<link rel="stylesheet" href="assets/vendor/katex/katex.min.css?v=0.19.0"></head>');
  html=html.replace('local-refinement.css?v=local1','local-refinement.css?v=latex1');
  fs.writeFileSync(file,html);
  console.log(name, (html.match(/class="katex"/g)||[]).length, 'formulas');
}
