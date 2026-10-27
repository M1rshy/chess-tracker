# Bundled piece classifier

`bundled-pieces.onnx.gz` is a genuine ONNX nearest-template model, decompressed locally using DecompressionStream. No server inference or API is used.

- Input `image`: float32 [1,3,64,64], RGB CHW, normalized to [0,1].
- Output `logits`: float32 [1,13].
- Class order: `. P N B R Q K p n b r q k`.
- Domain: react-chessboard 4.7.3 default SVG pieces, the forest/slate/walnut themes in this app, straight-on screenshots. Captures must not contain move arrows or selection highlights over pieces.
- Worker rejects softmax scores below 0.7 and large absolute template distances. The scores are similarity-based and are not calibrated probabilities. Always confirm every square before applying FEN.
- Other websites, piece sets, board colors, photographic boards and perspective images are outside this model's tested domain. Import a separately trained compatible ONNX classifier for them, or use the manual editor.
- Low-resolution screenshots can contain unknown squares even with the supported style. A 331-pixel board was tested: recognized pieces were correct, but several needed manual confirmation. Prefer screenshots at least 512 pixels wide.

Reproduce with the development server running:

```sh
node scripts/generate-templates.mjs
python -m pip install onnx==1.17.0 numpy pillow
python scripts/build-model.py
```

Template generation uses the installed Chrome. Edit its Playwright channel if using Chromium on Linux. Synthetic examples are obtained from the real SVG renderer, independently from recognition test screenshots. See THIRD_PARTY_NOTICES.md for artwork attribution.
