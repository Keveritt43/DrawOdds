"""Normalize the owner's western trophy leads; never assigns scores or contacts agencies.

The supplied county associations, source claims and unit identities are not validated.
Utah numbers are management-unit identifiers, not DrawOdds hunt-boundary IDs.
"""
import csv
import hashlib
import json
import sys
from decimal import Decimal, InvalidOperation
from pathlib import Path

root = Path(__file__).resolve().parents[1]
source = Path(sys.argv[1]) if len(sys.argv) > 1 else root / 'data' / 'trophy-source-western-v3.csv'
target = Path(sys.argv[2]) if len(sys.argv) > 2 else root / 'data' / 'trophy-source-western-v3.json'
if len(sys.argv) not in (1, 3):
    raise SystemExit('Usage: prepare-trophy-source.py [SOURCE_CSV TARGET_JSON]')
digest = hashlib.sha256(source.read_bytes()).hexdigest()
with source.open(encoding='utf-8-sig', newline='') as f:
    original = list(csv.DictReader(f))

records = []
ids = set()
for row in original:
    ident = row['record_id'].strip()
    if not ident or ident in ids:
        raise ValueError(f'Missing or duplicate source record ID: {ident}')
    ids.add(ident)
    state, species = row['state'].strip().upper(), row['species'].strip().upper()
    if not state or species not in {'DEER', 'ELK', 'PRONGHORN'}:
        raise ValueError(f'Invalid state or species for {ident}')
    def tier(column):
        value = row[column].strip()
        return int(value[5]) if len(value) > 5 and value.startswith('Tier ') and value[5] in '1234' else None
    def count(column):
        value = row[column].strip()
        if not value:
            return None
        try:
            number = Decimal(value)
            if not number.is_finite() or number < 0 or number != number.to_integral_value():
                raise ValueError(f'Invalid count for {ident}: {column}={value}')
            return int(number)
        except InvalidOperation as exc:
            raise ValueError(f'Invalid count for {ident}: {column}={value}') from exc
    records.append({
        'id': ident, 'state': state, 'species': species, 'subspecies': row['subspecies'].strip(),
        'unit': row['unit_id'].strip(),
        'unitSystem': 'UT_MANAGEMENT_UNIT' if state == 'UT' else 'SOURCE_REPORTED',
        'unitName': row['unit_name'].strip(), 'scope': row['hunt_scope'].strip(),
        'weapons': row['weapon_types'].strip(), 'season': row['season_window'].strip(),
        'sourceTags': [x.strip() for x in row['source_tags'].split(';') if x.strip()],
        'county': row['bc_primary_county'].strip(), 'bcPast10Years': count('bc_past_10y_entries'),
        'overallPast10Tier': tier('Overall Past 10Y Tier'), 'statePast10Tier': tier('State Past 10Y Tier'),
        'activeStatus': row['active_status'].strip(), 'constraints': row['constraint_flags'].strip(),
    })

target.write_text(json.dumps({'source': source.name, 'sha256': digest, 'status': 'unverified source leads; not production classifications',
                              'records': records}, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')
print(f'Prepared {len(records)} source records from {digest}')
