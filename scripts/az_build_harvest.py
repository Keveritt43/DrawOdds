"""AZGFD draw-hunt harvest summaries -> data/az/harvest.json. Usage: python3 -I scripts/az_build_harvest.py <pdf_dir>
The PDFs (2021-2025 deer; 2021, 2023-2025 elk; the 2022 elk summary is hosted on AZGFD's old Pantheon site and was not
fetched) are kept on the owner's PC in Downloads\\huntapp\\az, not in the repo."""
import sys, json, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from az_parse_harvest import parse, harvest_row
FILES = {('DEER', 2021): '2021-AZ-Deer-Harvest-Summary.pdf', ('DEER', 2022): '2022-AZ-Deer-Harvest-Summary_092223.pdf',
         ('DEER', 2023): '2023-AZ-Deer-Harvest-Summary.pdf', ('DEER', 2024): '2024-AZ-Deer-Harvest-Summary-1.pdf',
         ('DEER', 2025): '2025-AZ-Deer-Harvest-Summary.pdf', ('ELK', 2021): '2021-AZ-Elk-Harvest-Summary.pdf',
         ('ELK', 2023): '2023-AZ-Elk-Harvest-Summary.pdf', ('ELK', 2024): '2024-AZ-Elk-Harvest-Summary.pdf',
         ('ELK', 2025): '2025-AZ-Elk-Harvest-Summary.pdf'}
out = {'source': {f'{sp} {y}': f for (sp, y), f in FILES.items()},
       'note': 'Draw hunts only. harvest = AZGFD total (can exceed the parts by animals whose species or sex was not reported). '
               'Deer parts: mule buck, mule antlerless, whitetail buck, whitetail antlerless. Elk parts: bull, spike, cow, calf (2024: bull, spike, antlerless).'}
for (sp, y), f in FILES.items():
    m, _ = parse(os.path.join(sys.argv[1], f), sp)
    recs, bad = {}, []
    for h, r in m.items():
        x = harvest_row(r, 3 if (sp, y) == ('ELK', 2024) else 4)
        if x == 'bad': bad.append(h); continue
        if x is None: continue
        x.update({'units': r['units'], 'kind': r['kind'], 'sub': r['sub']}); recs[str(h)] = x
    out.setdefault(sp, {})[str(y)] = recs
    print(sp, y, len(recs), 'misread', bad)
json.dump(out, open(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'data', 'az', 'harvest.json'), 'w'), separators=(',', ':'))
