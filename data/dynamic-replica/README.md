# Dynamic Replica display export

Source dataset: https://dynamic-stereo.github.io/ and https://github.com/facebookresearch/dynamic_stereo . ARROW checklist membership: https://arxiv.org/html/2610.01314v1#Sx2.SS2 (Table 7).

Two delivered samples: `06dcf6-3_obj`, `216ba3-3_obj`; each original replay is 300 frames, 30 FPS, left/right cameras at 640×360 with 8,000 persistent points. Three source observations (0,149,299) from both cameras are exported here without pixel subsampling. These display files are not full H5 downloads and are not model predictions.

`manifest.json` gives per-source point counts, source image paths and SHA256 of the uncompressed `.bin.gz` payloads. `poses.f32.gz` contains row-major float32 `[300,B,3,4]` affine matrices. The cloud payload has a 16-byte header (`DRC1`, uint32 count, uint16 source frame, uint16 camera, uint32 body count), followed by 20 bytes per point: canonical xyz float32[3], RGB uint8[3], padding uint8, body ID uint16, and normalized source-depth display code uint16. Canonical coordinates are obtained by inverting the source-frame body transform. Multiplication by the chosen target transform gives the displayed world point. The depth display code maps each source's 99th percentile to 65535 and is only a color scale; no production depth is modified.

Body0 denotes the static background. Invalid depth/body pixels are excluded. Dynamic transport remains the local affine approximation supplied by v7. Browser float32 round-trip checks sample 1,000 pixels per source with sub-micrometre maximum error; the production H5 arrays are unchanged. ARROW dataset completion checkboxes describe delivered visualization samples, not completion of the original dataset.
