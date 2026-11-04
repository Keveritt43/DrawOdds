import pdfplumber, glob, os, json
import os
root=os.environ.get('MIG_SRC','/mnt/user-data/uploads/Screenshots')
out={}
for pdf in sorted(glob.glob(root+'/*/*/*.pdf')):
    sp, st = pdf.split('/')[-3], pdf.split('/')[-2]
    with pdfplumber.open(pdf) as p:
        pages=[pg.extract_text() or '' for pg in p.pages]
    out[f'{sp}/{st}']={'file':os.path.basename(pdf),'pages':pages}
    open(f'txt/{sp}__{st}.txt','w').write('\n=====PAGE=====\n'.join(pages))
json.dump(out,open('pdftext.json','w'))
for k,v in out.items(): print(k, len(v['pages']), sum(len(x) for x in v['pages']))
