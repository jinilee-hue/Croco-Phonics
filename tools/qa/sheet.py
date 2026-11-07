"""Contact sheet of QA stills: sheet.py <dir> <out.png> name1 name2 ... (cols=3, half size)"""
import sys
from PIL import Image, ImageDraw
d, out, names = sys.argv[1], sys.argv[2], sys.argv[3:]
ims = [Image.open(f'{d}/{n}.png').convert('RGB') for n in names]
w, h = ims[0].size
s = 0.5
tw, th = int(w * s), int(h * s)
cols = 3 if len(ims) > 4 else 2
rows = (len(ims) + cols - 1) // cols
sheet = Image.new('RGB', (cols * tw + (cols + 1) * 6, rows * (th + 22) + 6), 'white')
dr = ImageDraw.Draw(sheet)
for k, (im, n) in enumerate(zip(ims, names)):
    x = 6 + (k % cols) * (tw + 6); y = 6 + (k // cols) * (th + 22)
    sheet.paste(im.resize((tw, th), Image.LANCZOS), (x, y + 16))
    dr.text((x, y), n, fill='black')
sheet.save(out)
print(out, sheet.size)
