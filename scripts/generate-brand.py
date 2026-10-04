"""Regenerate the original vector mark and PNG sizes (optional tooling: cairosvg)."""
from pathlib import Path
import cairosvg
ROOT=Path(__file__).resolve().parents[1]
# A ring and stem are fixed; the right arm becomes the outgoing branch.
path='<circle cx="64" cy="36" r="8"/><path d="M64 44v48M47 56h34M34 70c0 16 13 22 30 22 17 0 30-8 30-28M84 64h10v10M34 70v11h10"/>'
mark=f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><rect x="16" y="16" width="96" height="96" rx="24" fill="#17372c"/><g fill="none" stroke="#d3f39c" stroke-width="6" stroke-linecap="round" stroke-linejoin="round">{path}</g></svg>'
(ROOT/'public/icons').mkdir(parents=True,exist_ok=True)
(ROOT/'brand').mkdir(parents=True,exist_ok=True)
(ROOT/'public/icons/mark.svg').write_text(mark)
(ROOT/'brand/anchor-mark.svg').write_text(mark)
for n in [16,32,48,128,256,512,1024]:
    out=ROOT/'public/icons'/f'{n}.png' if n<=128 else ROOT/'brand'/f'anchor-{n}.png'
    # Tiny toolbar icons use larger relative artwork, while 128px follows store padding.
    svg=mark if n>=128 else mark.replace('viewBox="0 0 128 128"','viewBox="10 10 108 108"')
    cairosvg.svg2png(bytestring=svg.encode(),write_to=str(out),output_width=n,output_height=n)
for label,ink in [('dark','#17372c'),('light','#f6f5ef')]:
    mono=f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><g fill="none" stroke="{ink}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round">{path}</g></svg>'
    (ROOT/'brand'/f'anchor-symbol-{label}.svg').write_text(mono)
    word=f'<svg xmlns="http://www.w3.org/2000/svg" width="580" height="150" viewBox="0 0 580 150"><g transform="translate(0 10)">{mark[mark.index(">")+1:-6]}</g><text x="137" y="104" font-family="Arial,Helvetica,sans-serif" font-size="86" font-weight="700" letter-spacing="-5" fill="{ink}">Anchor.</text></svg>'
    (ROOT/'brand'/f'anchor-wordmark-{label}.svg').write_text(word)
    cairosvg.svg2png(bytestring=word.encode(),write_to=str(ROOT/'brand'/f'anchor-wordmark-{label}.png'),output_width=1160,output_height=300)
print('Original SVG brand and PNG icons generated.')
