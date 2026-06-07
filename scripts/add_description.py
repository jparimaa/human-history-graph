import json
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")

DESCRIPTIONS_PATH = Path(__file__).resolve().parent.parent / "data" / "descriptions.json"

REQUIRED = {"id", "short_description", "long_description", "why_they_matter"}

if len(sys.argv) != 2:
    print("Usage: python add_description.py <description.json>")
    sys.exit(1)

with open(sys.argv[1], encoding="utf-8") as f:
    desc = json.load(f)

missing = REQUIRED - desc.keys()
if missing:
    print(f"Missing fields: {', '.join(sorted(missing))}")
    sys.exit(1)

person_id = desc["id"]

data = json.loads(DESCRIPTIONS_PATH.read_text(encoding="utf-8"))

for entry in data:
    if person_id in entry:
        entry[person_id] = {
            "short_description": desc["short_description"],
            "long_description": desc["long_description"],
            "why_they_matter": desc["why_they_matter"],
            "personality": desc.get("personality", ""),
        }
        break
else:
    print(f"{person_id} not found in descriptions.json")
    sys.exit(1)

# Preserve the file's exact formatting (the leading "[  " and lack of a trailing
# newline) so the diff only ever shows the entry that actually changed.
dumped = json.dumps(data, indent=2, ensure_ascii=False)
dumped = "[  \n" + dumped.split("\n", 1)[1]
DESCRIPTIONS_PATH.write_text(dumped, encoding="utf-8")

print(f"Added description for {person_id}")
