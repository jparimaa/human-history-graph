import json
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")

RELATIONS_PATH = Path(__file__).resolve().parent.parent / "data" / "relations.json"

VALID_TYPES = {
    "teacher", "mentor", "collaborator", "rival", "ally", "enemy",
    "patron", "family", "spouse", "romantic", "friend", "predecessor"
}

if len(sys.argv) != 2:
    print("Usage: python add_relation.py <relation.json>")
    sys.exit(1)

with open(sys.argv[1], encoding="utf-8") as f:
    rel = json.load(f)

# Completion (including people with zero qualifying relations) is tracked in
# data/completed_relations.json via append_completed.py, so every entry written
# here must be a real edge with a target.
required = {"source_id", "target_id", "type", "strength", "confidence", "reason"}
missing = required - rel.keys()
if missing:
    print(f"Missing fields: {', '.join(missing)}")
    sys.exit(1)

if rel["type"] not in VALID_TYPES:
    print(f"Invalid type '{rel['type']}'. Valid types: {', '.join(sorted(VALID_TYPES))}")
    sys.exit(1)

with open(RELATIONS_PATH, encoding="utf-8") as f:
    relations = json.load(f)

for r in relations:
    if (r.get("source_id") == rel["source_id"] and r.get("target_id") == rel["target_id"]) or \
       (r.get("source_id") == rel["target_id"] and r.get("target_id") == rel["source_id"]):
        print(f"Relation between {rel['source_id']} and {rel['target_id']} already exists.")
        sys.exit(1)

relations.append(rel)

with open(RELATIONS_PATH, "w", encoding="utf-8") as f:
    json.dump(relations, f, indent=2, ensure_ascii=False)

print(f"Added: {rel['source_id']} -> {rel['target_id']} ({rel['type']})")
