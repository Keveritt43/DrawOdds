#!/usr/bin/env python3
"""Prepare the display-only unit reference. Usage: python script.py input.csv output.json."""
import csv
import hashlib
import json
import sys
from pathlib import Path

source, output = map(Path, sys.argv[1:])
if source.resolve() == output.resolve():
    raise SystemExit('Input and output must be different files')
with source.open(encoding='utf-8-sig', newline='') as f:
    rows = list(csv.DictReader(f))
records = {r['record_id']: {'tier':r['trophy_tier'], 'subspecies':r['subspecies'], 'status':r['active_status']} for r in rows}
if len(records) != len(rows) or not records:
    raise SystemExit('Missing or duplicate record IDs')
output.write_text(json.dumps({'sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'records':records},separators=(',',':'))+'\n',encoding='utf8')
