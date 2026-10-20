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
