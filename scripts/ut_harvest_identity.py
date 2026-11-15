"""Choose the adult general-season observation when DWR prints shared youth codes.

Youth any-weapon hunters may hunt additional seasons, so their separate
observations do not describe the same hunt population as the adult row.
"""
from collections import defaultdict


def index_harvest_records(records):
    grouped = defaultdict(list)
    for row in records:
        grouped[row['code']].append(row)
    selected, ambiguous = {}, []
    for code, rows in grouped.items():
        if len(rows) == 1:
            selected[code] = rows[0]
            continue
        adults = [r for r in rows if 'youth' not in (r.get('type') or '').lower()]
        if len(adults) == 1 and len(adults) < len(rows):
            selected[code] = adults[0]
        else:
            ambiguous.append(code)
    return selected, sorted(ambiguous)
