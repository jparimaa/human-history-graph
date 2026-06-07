import json
import sys

if len(sys.argv) != 3:
    print("Usage: python check_relation.py <source_id> <target_id>")
    sys.exit(1)

source_id = sys.argv[1]
target_id = sys.argv[2]

with open("data/relations.json", encoding="utf-8") as f:
    relations = json.load(f)

for r in relations:
    if not isinstance(r, dict) or "target_id" not in r:
        continue
    if (r["source_id"] == source_id and r["target_id"] == target_id) or \
       (r["source_id"] == target_id and r["target_id"] == source_id):
        print(json.dumps(r, indent=2))
        sys.exit(0)

print("Not found.")
sys.exit(1)
