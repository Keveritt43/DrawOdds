import json, re, sys
T=json.load(open('pdftext.json'))
MON={m:i+1 for i,m in enumerate(['january','february','march','april','may','june','july','august','september','october','november','december'])}
DATE=r'(January|February|March|April|May|June|July|August|September|October|November|December)\s*(\d{1,2})?(?:st|nd|rd|th)?'
def md(m,d): return f'{MON[m.lower()]:02d}-{int(d):02d}' if d else f'{MON[m.lower()]:02d}'
def num(s): return float(s.replace(',',''))
def parse(key):
    pages=[p for p in T[key]['pages'] if p.strip()]; txt='\n'.join(pages); lines=[l.strip() for l in txt.split('\n') if l.strip()]
    r={'_warn':[]}
    r['title']=lines[0]
    m=re.search(r'Analyzed/Prepared by:\s*(.+)',txt); r['preparedBy']=m.group(1).strip() if m else None
    m=re.search(r'Prepared by:.*\n\s*(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+(\d{4})',txt)
    r['preparedDate']=f'{m.group(2)}-{[x[:3] for x in MON].index(m.group(1).lower())+1:02d}' if m else None
    if not m: r['_warn'].append('no prepared date')
    # summary: between date line and "Spatial Metrics"
    i0=next((i for i,l in enumerate(lines) if re.match(r'^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{4}$',l)),2)
    i1=next(i for i,l in enumerate(lines) if l.startswith('Spatial Metrics'))
    body=lines[i0+1:i1]
    caveat=[]; summ=[]
    tgt=summ
    for l in body:
        if l.startswith('***'): tgt=caveat
        tgt.append(l)
    def join(ls):
        s=''
        for l in ls:
            if not s: s=l
            elif s.endswith('-') and not s.endswith(' -'): s=s+l
            else: s+=' '+l
        return re.sub(r'\s+',' ',s).strip()
    r['summary']=join(summ)
    r['caveat']=join(caveat).lstrip('* ').strip() or None
    g=lambda pat: (lambda m: num(m.group(1)) if m else None)(re.search(pat,txt))
    st={'avgMiles':g(r'(?:Average|Median) (?:length of )?Migration(?: Length)?:\s*([\d.,]+)'),'maxMiles':g(r'Maximum Migration(?: Length)?:\s*([\d.,]+)'),'minMiles':g(r'Minimum Migration(?: Length)?:\s*([\d.,]+)'),
        'migrations':g(r'Total Migrations Analyzed:?\s*([\d,]+)'),'individuals':g(r'Total Number of Individuals:\s*([\d,]+)'),
        'springMigrations':g(r'Total Number Spring Migrations:\s*([\d,]+)'),'fallMigrations':g(r'Total Number Fall Migrations:\s*([\d,]+)')}
    if re.search(r'Median (length of )?Migration',txt): st['median']=True
    for k in ['avgMiles','maxMiles','minMiles']:
        if st[k] is not None: st[k]=round(st[k],1)
    for k in ['migrations','individuals','springMigrations','fallMigrations']:
        if st[k] is not None: st[k]=int(st[k])
    for k,v in st.items():
        if v is None: r['_warn'].append('missing '+k)
    r['stats']=st
    m=re.search(r'(Of \d+ individual seasonal migrations.*?)(?:\n\s*\n|Temporal Data|=====PAGE)',txt,re.S)
    r['methods']=join([x.strip() for x in m.group(1).split('\n')]) if m else None
    m=re.search(r'Extent of Study:\s*'+DATE+r',?\s*(\d{4})\s*(?:–|-|to)\s*'+DATE+r',?\s*(\d{4})',txt)
    if m: r['studyStart']=f'{m.group(3)}-{md(m.group(1),m.group(2))}'; r['studyEnd']=f'{m.group(6)}-{md(m.group(4),m.group(5))}'
    else: r['studyStart']=r['studyEnd']=None; r['_warn'].append('no extent')
    # temporal table
    try:
        h=next(i for i,l in enumerate(lines) if l.startswith('Spring Migration Fall Migration'))
        r['winterColumn']='Winter Movement' in lines[h]
        rows=[]
        for l in lines[h+1:h+20]:
            if l.startswith('Migration Use Class'): break
            ds=re.findall(DATE,l)
            if ds: rows.append([md(*d) for d in ds[:2]]); continue
            ns=re.findall(r'(?<![\w.])(\d+(?:\.\d+)?)(?:\s*days?)?',re.sub(r'^(Duration\s+)?(Average|Median|Minimum|Maximum)','',l))
            if ns and re.match(r'^(Duration\s+)?(Average|Median|Minimum|Maximum)',l): rows.append([float(n) for n in ns[:2]])
        assert len(rows)==9, rows
        names=['startAvg','startMin','startMax','endAvg','endMin','endMax','durationAvgDays','durationMinDays','durationMaxDays']
        r['timing']={s:{n:rows[i][j] for i,n in enumerate(names)} for j,s in enumerate(['spring','fall'])}
    except Exception as e:
        r['timing']=None; r['_warn'].append(f'timing: {e}')
    # use classes
    ac={k:None for k in ['ONE','LOW','MEDIUM','HIGH','STOPOVER']}
    h=max(i for i,l in enumerate(lines) if l.startswith('Migration Use Class Statistics'))
    for l in lines[h+1:h+9]:
        for k,pat in [('ONE',r'^1 individual'),('LOW',r'^(Low|2 individuals|>2 indv)'),('MEDIUM',r'^(Medium|10 to 20%)'),('HIGH',r'^(High|Greater than 20%)'),('STOPOVER',r'^Stopover')]:
            if re.match(pat,l):
                m=re.search(r'([\d,]{2,}|--|NA)\s*$',l)
                if not m: r['_warn'].append('acres? '+l)
                elif m.group(1) not in ('--','NA'): ac[k]=int(num(m.group(1)))
    r['acres']=ac
    r['gmus']=sorted(set(u for grp in re.findall(r'(?:GMUs?|Units?)\s*((?:\d+[A-Z]?(?:,\s*|\s+and\s+|\s*&\s*)?)+)',txt) for u in re.findall(r'\d+[A-Z]?',grp)))
    return r
if __name__=='__main__':
    out={k:parse(k) for k in T}
    json.dump(out,open('parsed.json','w'),indent=1)
    for k,v in out.items():
        print(k,'|',v['title'],'|',v['preparedDate'],v['studyStart'],v['studyEnd'],'| ac',[a for a in v['acres'].values()],'| gmu',v['gmus'],v['_warn'] or '', 'CAVEAT' if v['caveat'] else '')
