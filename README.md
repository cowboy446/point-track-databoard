# QuARC · Point Track Databoard

Robot manipulation data catalogue. Open `index.html` or visit:
https://cowboy446.github.io/point-track-databoard/

- InternData: 29,459 episodes, merged on B300; Franka and Split Aloha.
- LIBERO: 6,500 episodes, Franka Panda.
- robotwin-random: 11,500 episodes, five dual-arm embodiments.
- RoboCasa365: 10,000 episodes, PandaOmron.
- Total: 57,459 episodes, 237.18 hours, 10.18 TB.
- Nine dataset–embodiment groups, each with ten synchronized RGB-D and interactive 3D point-stream previews (all 8,000 native points).
- H5 structures, field shapes, dtypes, attributes and reading examples.

## Design & editing

Layout and sample controls reference https://pantheon.inc/research/argus .
Copy editing uses https://github.com/renky1025/agent-skills/tree/main/de-ai-writing .
Geist, Geist Mono and DM Sans are self-hosted from Google Fonts under the SIL Open Font License; license files are in `assets/fonts/`.

## GitHub Pages

Settings → Pages → Source: **GitHub Actions**.
The `.github/workflows/pages.yml` workflow deploys the repository root.

`data/` contains statistics, sample selections, video checks and inspected H5 metadata.
`assets/` contains styles, scripts, fonts, MP4 previews, posters and contact sheets.

## D4D presentation

Open [D4D presentation](d4d.html) for the 16-slide paper discussion. Use arrow keys to navigate, N for speaker notes, and F for fullscreen. Figures, LaTeX rendering, and fonts are embedded for offline use.

## Model architecture

[Model architecture](model.html) compares the archived B300 A0 / R00 baseline with the InternData branch at c182664. It includes an editable SVG, module parameter counts, training differences, and the old multiview evaluation protocol and migration requirements. Evidence excerpts and count reports are in `data/model/`.

### Model evaluation

`evaluation.html` reports A0 / R00 at step 2,048 on twenty frozen development clips. All three source views query all three target cameras. The page includes nine-pair loss matrices, labelled videos, synchronized 3D point streams, metrics, the frozen protocol and evaluator source. Original 64-clip campaign scores are shown separately because their calibration and aggregation differ.

## Scale comparison

`scale-comparison.html` compares clip-wide and target-view/time scale alignment on four frozen A0 clips. The original predictions and query IDs are reused. CPU rescoring, per-pair metrics, 192 scale values, validation records and paired 3D streams are in `data/scale-comparison/`.

## Train and validation comparison

`experiment-evaluation.html` compares the A0–A6 step-2048 checkpoints on fixed, task-disjoint training and validation cohorts (20 episodes each). A7 has no checkpoint. Metrics use the shared per-clip scale; 3D replays display 512 matched IDs per source. `archive.html` contains presentations and supplementary diagnostics.

The canonical Model Evaluation page is `evaluation.html`. It combines training/validation result tabs, a model-selectable video/3D replay, and an arbitrary left/right checkpoint comparison. `experiment-evaluation.html` redirects to it; the original A0 report is archived as `baseline-evaluation.html`. All navigation uses Model → Architecture / Evaluation. The video overlay uses 24 fixed point IDs drawn from the same 512-point display subset; full metrics are unchanged. RGB videos and per-model image projections are under `data/experiments/video/`, with file hashes in its manifest. No inference was rerun for this layout update.

## Dynamic scene data

`scene-data.html` adds the ARROW Table 7 training-dataset checklist (19 datasets) and two validated Dynamic Replica sample replays. Dynamic Replica alone is checked as sample delivery complete; this does not claim full-dataset conversion. Dataset descriptions link to primary sources and distinguish static multiview photos, synchronized camera rigs, and derived supervision.

The replay reconstructs all valid pixels from source frames 0, 149, and 299 of each 640×360 stereo H5. Sources can be toggled individually; display modes include RGB, body ID, depth, source frame, and dynamic/static. The user can inspect original source geometry or transport it to any target frame using the existing v7 affine matrices. Browser display coordinates and matrices are float32; H5 files are unchanged. Assets are self-contained under `data/dynamic-replica/`; no localhost API or external rendering service is required.
