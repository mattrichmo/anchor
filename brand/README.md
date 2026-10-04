# Anchor identity

## Concept

A simple fixed stem and curved anchor base suggest a stable place; the raised right arm points into a branch. Original vector geometry, not a third-party stock icon. Wordmark: **Anchor.** Use the mark at small sizes and the wordmark where space allows.

## Files

- `anchor-mark.svg`: full-color icon, vector source.
- `anchor-symbol-dark.svg` / `anchor-symbol-light.svg`: single-color marks.
- `anchor-wordmark-dark.svg` / `anchor-wordmark-light.svg`: editable vector wordmarks using system font fallbacks.
- Matching wordmark PNGs, and icon PNGs at 256/512/1024.
- Runtime icons at 16/32/48/128 in `public/icons/` and `extension/icons/`.

The 128px store icon contains 96px artwork with 16px transparent padding. Tiny toolbar exports use a tighter crop for readability. No font files are included.

## Palette

| Token | Hex | Use |
| --- | --- | --- |
| Deep green | `#17372C` | Identity, primary text and primary controls |
| Soft lime | `#D3F39C` | Brand mark, restrained emphasis |
| Warm paper | `#F6F5EF` | Main UI background |
| Card white | `#FFFEFA` | Surfaces |
| Quiet green | `#64736B` | Supporting copy |
| Hairline | `#DCE1D5` | Borders/dividers |

Use real negative space; no glossy lock/security motifs. This is a calm navigation utility, not a threat-protection product. System UI typography, 10–12px tracked monospace labels, restrained 18px corner radii, visible focus rings. Never rely on green alone: active states also carry text.

## Writing

Primary line: **Keep your place. Explore somewhere else.**
Short product explanation: **Keep working pages in place and route exploration elsewhere.**
Use “protected,” “same origin,” “home URL,” “pause,” “browsing window” and “workspace.” Explain that layouts use real Chrome windows. Avoid “unbreakable,” “guaranteed,” “never loses state,” or claims of preserving all navigation.

## Rebuild optional assets

```sh
python -m pip install cairosvg pillow
python scripts/generate-brand.py
# After UI fixture screenshots exist (python tests/ui/run.py):
python scripts/generate-store-art.py
```

The existing vector and PNG files are ready to use. You do not need these tools for development builds or runtime. The name and mark have not been trademark-cleared; check before a public commercial launch.
