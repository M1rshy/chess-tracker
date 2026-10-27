# Licenses and corresponding source

The application code is GPL-3.0-or-later. See LICENSE. Dependencies keep their original licenses; copied runtime notices are in public/licenses and in each build's licenses directory.

| Component | License | Source |
| --- | --- | --- |
| Stockfish.js 17.1.0, Lite single-thread WASM + embedded NNUE | GPL-3.0 | https://github.com/nmrugg/stockfish.js/tree/602fd7e1a571a2be71f242942db90483731f2a1f |
| Upstream Stockfish and networks | GPL-3.0 | https://github.com/official-stockfish/Stockfish; network attribution is retained in the Stockfish JS header |
| chess.js 1.4.0 | BSD-2-Clause | https://github.com/jhlywa/chess.js |
| react-chessboard 4.7.3, including SVG pieces | MIT | https://github.com/Clariity/react-chessboard |
| React / React DOM 18.3.1 | MIT | https://github.com/facebook/react |
| ONNX Runtime Web 1.22.0 | MIT | https://github.com/microsoft/onnxruntime/tree/v1.22.0 |
| OpenCV.js 4.11, distributed by @techstark/opencv-js | Apache-2.0 | https://github.com/TechStark/opencv-js; https://github.com/opencv/opencv/tree/4.11.0 |
| Lucide icons | ISC | https://github.com/lucide-icons/lucide |
| Tailwind CSS | MIT | https://github.com/tailwindlabs/tailwindcss |
| Vite / Vitest / Playwright / TypeScript | MIT / MIT / Apache-2.0 / Apache-2.0 | Their respective package metadata and lockfile record exact versions |

Stockfish npm gitHead is 602fd7e1a571a2be71f242942db90483731f2a1f. Its source archive is https://github.com/nmrugg/stockfish.js/archive/602fd7e1a571a2be71f242942db90483731f2a1f.tar.gz. Build instructions are in that revision's README. The original copyright, network attribution and GPL license are retained. If redistributing binaries, comply with GPLv3 corresponding-source obligations; provide the exact source and required network/build materials along with the distribution, not merely the application's TypeScript. This repository pins the engine and links its corresponding source; it does not claim authorship of Stockfish.

The included model public/models/bundled-pieces.onnx.gz is a nearest-template classifier generated from react-chessboard's MIT-licensed SVG pieces and the three local board palettes. Model generation code is GPL-3.0-or-later; the rendered piece artwork retains the MIT copyright and license in public/licenses/react-chessboard.txt. There is no third-party training dataset. This model has a deliberately limited domain and is not a general-purpose piece recognizer.
