"""Original store artwork; composite the actual UI capture using explicit demo state.
Requires Pillow and CairoSVG only for development. Never copies font files.
Override ANCHOR_FONT_REGULAR/ANCHOR_FONT_BOLD with locally installed TTF fonts.
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import os, json
ROOT=Path(__file__).resolve().parents[1]
S=2
COL={'ink':'#17372C','lime':'#D3F39C','paper':'#F6F5EF','card':'#FFFEFA','muted':'#64736B','line':'#DCE1D5'}
regular=os.getenv('ANCHOR_FONT_REGULAR','/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf')
bold=os.getenv('ANCHOR_FONT_BOLD','/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf')
if not Path(regular).is_file() or not Path(bold).is_file():
    raise SystemExit('Set ANCHOR_FONT_REGULAR and ANCHOR_FONT_BOLD to local TTF files; do not bundle font files.')
def canvas(w,h,bg):return Image.new('RGB',(w*S,h*S),bg)
def font(size,weight=False):return ImageFont.truetype(bold if weight else regular,round(size*S))
def text(im,xy,words,size=20,color=None,weight=False,spacing=1.12):
    d=ImageDraw.Draw(im)
    for idx,line in enumerate(words.split('\n')):d.text((round(xy[0]*S),round((xy[1]+idx*size*spacing)*S)),line,font=font(size,weight),fill=color or COL['ink'],stroke_width=0)
def rect(im,box,fill,r=16,outline=None,width=1):ImageDraw.Draw(im).rounded_rectangle(tuple(round(v*S) for v in box),radius=round(r*S),fill=fill,outline=outline,width=round(width*S))
def line(im,pts,fill,width=2):ImageDraw.Draw(im).line([(round(x*S),round(y*S))for x,y in pts],fill=fill,width=round(width*S),joint='curve')
def icon(im,x,y,size):
    mark=Image.open(ROOT/'brand/anchor-512.png').convert('RGBA');mark=mark.crop((64,64,448,448)).resize((round(size*S),round(size*S)),Image.Resampling.LANCZOS);im.paste(mark,(round(x*S),round(y*S)),mark)
def finish(im,p):p.parent.mkdir(parents=True,exist_ok=True);im.resize((im.width//S,im.height//S),Image.Resampling.LANCZOS).save(p,optimize=True)
# Store image 01: actual popup rendered with explicit Chrome-API fixture state.
im=canvas(1280,800,COL['paper']);icon(im,76,55,46);text(im,(140,53),'Anchor.',34,weight=True)
text(im,(77,157),'PROTECT. ROUTE. ARRANGE.',13,COL['muted'],True)
text(im,(72,214),'Your pages.\nTheir place.',66,weight=True,spacing=1.16)
text(im,(77,409),'Protected dashboards.\nSeparate browsing.\nA workspace that stays yours.',23,spacing=1.55)
rect(im,(77,574,326,624),COL['ink'],12);text(im,(95,588),'Dashboards · kept',16,COL['lime'],True)
rect(im,(340,574,581,624),COL['card'],12,COL['line']);text(im,(361,588),'Exploration  ↗',17)
text(im,(78,690),'Local only. No account. No tracking.',17,COL['muted'])
pop=Image.open(ROOT/'store/screenshots/source-popup.png').convert('RGB');w=360;h=round(pop.height*w/pop.width);x=835;y=78
shadow=Image.new('RGBA',im.size);sd=ImageDraw.Draw(shadow);sd.rounded_rectangle((x*S,(y+12)*S,(x+w)*S,(y+h+12)*S),radius=22*S,fill=(23,55,44,40));shadow=shadow.filter(ImageFilter.GaussianBlur(20*S));im=Image.alpha_composite(im.convert('RGBA'),shadow).convert('RGB')
mask=Image.new('L',(w*S,h*S));ImageDraw.Draw(mask).rounded_rectangle((0,0,w*S-1,h*S-1),radius=20*S,fill=255)
im.paste(pop.resize((w*S,h*S),Image.Resampling.LANCZOS),(x*S,y*S),mask)
text(im,(x+2,y+h+19),'Actual popup UI · demo tab',12,COL['muted'])
finish(im,ROOT/'store/screenshots/01-protection-1280x800.png')
# Required small promotional tile: brand-led rather than fake browser chrome.
im=canvas(440,280,COL['ink']);icon(im,25,24,42);text(im,(81,25),'Anchor.',27,COL['paper'],True)
text(im,(25,94),'Keep your\nplace.',48,COL['paper'],True,1.08);icon(im,312,110,94)
text(im,(28,244),'Protected workspaces.',15,COL['lime'])
finish(im,ROOT/'store/promotional/anchor-440x280.png')
# Conceptual arrangement: clearly four separate Chrome windows, not one four-pane view.
im=canvas(1400,560,COL['ink']);icon(im,60,47,42);text(im,(121,46),'Anchor.',32,COL['paper'],True)
text(im,(60,155),'Keep your place.\nExplore elsewhere.',51,COL['paper'],True,1.18)
text(im,(64,316),'Protected pages. A browsing window of your own.',19,COL['lime'])
text(im,(64,472),'LOCAL ONLY  /  PROTECT · ROUTE · ARRANGE',12,COL['lime'],True)
for i,label in enumerate(['Deployment','Monitoring','Triage queue','App preview']):
    x=825+(i%2)*249;y=108+(i//2)*143
    rect(im,(x,y,x+229,y+124),COL['paper'],12)
    rect(im,(x,y,x+229,y+26),'#48654B',10)
    text(im,(x+10,y+7),'●  ●  ●    CHROME WINDOW '+str(i+1),8,COL['paper'])
    text(im,(x+14,y+48),label,17,weight=True)
    rect(im,(x+14,y+86,x+199,y+92),'#D4E2C9',3)
rect(im,(825,415,1303,479),'#35583F',12);text(im,(845,434),'↗  New links → separate browsing',17,COL['lime'],True)
text(im,(826,497),'Conceptual layout · four real windows, not embedded panes',10,'#B9CCAE')
finish(im,ROOT/'store/promotional/anchor-1400x560.png')
assets=[]
for directory in ['store/screenshots','store/promotional','brand','public/icons']:
    for p in sorted((ROOT/directory).glob('*.png')):
        image=Image.open(p);assets.append({'file':str(p.relative_to(ROOT)),'width':image.width,'height':image.height,'format':'PNG','purpose':'raw supporting capture' if p.name.startswith('source-') else 'brand or store asset'})
(ROOT/'store/asset-manifest.json').write_text(json.dumps({'version':'2.0.0','date':'2026-10-03','capture_method':'Screenshots render shipped UI with explicit Chrome-API fixture state; they are not evidence of installed-extension tests. Dashboard and navigation drawings use fictional demonstration data. Promotions are original compositions. No font binaries or third-party stock images included.','assets':assets},indent=2)+'\n')
print('Created 1280×800 store composition, 440×280 small promo, 1400×560 marquee, and asset manifest.')
