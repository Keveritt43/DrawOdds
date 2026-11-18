#!/usr/bin/env python3
"""Parse NMDOW deer and elk harvest reports (2023-24 to 2025-26, the seasons that share today's hunt codes).

Usage: python3 -I scripts/nm_parse_harvest.py data/nm/source/harvest data/nm/harvest.json

Inputs: `pdftotext -layout` of NMDOW's "<season> Deer Harvest Report" and "<season> Elk Harvest Report" PDFs
(wildlife.dgf.nm.gov > Hunting > Harvest Reporting Information, fetched Nov 17, 2026).

Deer rows print licenses sold, hunters reporting, % reporting, estimated hunters, success %, estimated bucks and does,
satisfaction and days hunted. Elk rows print the same except estimated hunters. NMDOW's success rate is harvest per
hunter, so elk hunters afield = estimated harvest / success (rounded); when nothing was taken (0%) the hunter count is
not printed and is left null, so a 0-harvest elk season adds to neither side of a pooled rate.
Elk reports also list private-land (EPLUS) authorizations without hunt codes; those rows are skipped.
"""
import json, os, re, sys, glob

CODE = re.compile(r'\b((?:DER|ELK)-\d-\d{3})\b')
BAG = re.compile(r'^(?:A|MB|ES|FAD|FAMD|FAWTD|ESWTD|APRE/6|APRE/6/A|MB/A|SPIKE|APRE|ES-1|ES-3)$')
NUM = re.compile(r'^-?[\d,]+(?:\.\d+)?%?$|^-$|^NA$')

def val(t):
    if t in ('-', 'NA'): return None
    t = t.replace(',', '')
    return float(t[:-1]) / 100 if t.endswith('%') else float(t)

def parse(path, species):
    rows, problems = {}, []
    for ln, line in enumerate(open(path, encoding='utf-8'), 1):
        m = CODE.search(line)
        if not m: continue
        toks = line[m.end():].split()
        try:
            b = next(i for i, t in enumerate(toks) if BAG.match(t))
        except StopIteration:
            problems.append(f'{os.path.basename(path)}:{ln} {m.group(1)}: no bag limit'); continue
        nums = []
        for t in toks[b + 1:]:
            if NUM.match(t): nums.append(t)
            else: break
        need = 9 if species == 'DEER' else 8
        if len(nums) < need:
            problems.append(f'{os.path.basename(path)}:{ln} {m.group(1)}: {len(nums)} numbers'); continue
        v = [val(t) for t in nums[:need]]
        if species == 'DEER':
            sold, rep, prep, hunters, succ, male, female, sat, days = v
        else:
            sold, rep, prep, succ, male, female, sat, days = v
            hv = (male or 0) + (female or 0)
            hunters = round(hv / succ) if succ else None
        hv = None if male is None and female is None else (male or 0) + (female or 0)
        dates = ' '.join(t for t in toks[:b] if t.lower() not in ('archery', 'rifle', 'muzzleloader', 'bow', 'any', 'legal'))
        rec = {'code': m.group(1), 'bag': toks[b], 'dates': dates, 'licensesSold': sold, 'reporting': rep, 'hunters': hunters, 'success': succ,
               'harvest': hv, 'male': male, 'female': female, 'daysHunted': days}
        if species == 'DEER' and hunters and hv is not None and succ is not None and abs(hv / hunters - succ) > 0.03 and hunters >= 40:
            problems.append(f'{os.path.basename(path)}:{ln} {m.group(1)}: success {succ} vs harvest/hunters {hv}/{hunters}')
        if m.group(1) in rows:
            # a deer code printed again lower in its GMU block is the over-the-counter private-land licence that
            # reuses the draw hunt's code (booklet p. 52); the first row is the public draw hunt
            if species == 'DEER': rows[m.group(1)].setdefault('privateOtc', rec); continue
            problems.append(f'{os.path.basename(path)}:{ln} {m.group(1)}: listed twice')
        rows[m.group(1)] = rec
    return rows, problems

def main(src, dst):
    seasons, problems = {}, []
    for path in sorted(glob.glob(os.path.join(src, '*-harvest-report.txt'))):
        season = int(os.path.basename(path)[:4])
        species = 'DEER' if '-deer-' in path else 'ELK'
        rows, pr = parse(path, species)
        seasons.setdefault(str(season), {}).update(rows)
        problems += pr
        print(season, species, len(rows))
    json.dump({'source': 'NMDOW deer and elk harvest reports 2023-24 to 2025-26 (pdftotext -layout), fetched Nov 17, 2026',
               'note': 'season = the year the season opens; elk hunters = harvest / success', 'problems': problems, 'seasons': seasons},
              open(dst, 'w'), indent=None, separators=(',', ':'))
    print('problems', len(problems)); print('\n'.join(problems[:25]))

if __name__ == '__main__':
    main(*sys.argv[1:3])
