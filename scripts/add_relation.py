import json
import sys

VALID_TYPES = {
    "teacher", "mentor", "collaborator", "rival", "ally", "enemy",
    "patron", "family", "spouse", "romantic", "friend", "predecessor"
}

if len(sys.argv) != 2:
    print("Usage: python add_relation.py <relation.json>")
    sys.exit(1)

with open(sys.argv[1], encoding="utf-8") as f:
    rel = json.load(f)

if "source_id" not in rel:
    print("Missing required field: source_id")
    sys.exit(1)

sentinel = not rel.get("target_id")

if not sentinel:
    required = {"source_id", "target_id", "type", "strength", "confidence", "reason"}
    missing = required - rel.keys()
    if missing:
        print(f"Missing fields: {', '.join(missing)}")
        sys.exit(1)

    if rel["type"] not in VALID_TYPES:
        print(f"Invalid type '{rel['type']}'. Valid types: {', '.join(sorted(VALID_TYPES))}")
        sys.exit(1)

with open("data/relations.json", encoding="utf-8") as f:
    relations = json.load(f)

for r in relations:
    if sentinel:
        if r.get("source_id") == rel["source_id"] and not r.get("target_id"):
            print(f"Sentinel for {rel['source_id']} already exists.")
            sys.exit(1)
    else:
        if (r.get("source_id") == rel["source_id"] and r.get("target_id") == rel["target_id"]) or \
           (r.get("source_id") == rel["target_id"] and r.get("target_id") == rel["source_id"]):
            print(f"Relation between {rel['source_id']} and {rel['target_id']} already exists.")
            sys.exit(1)

relations.append(rel)

with open("data/relations.json", "w", encoding="utf-8") as f:
    json.dump(relations, f, indent=2, ensure_ascii=False)

if sentinel:
    print(f"Marked as processed (no relations): {rel['source_id']}")
else:
    print(f"Added: {rel['source_id']} -> {rel['target_id']} ({rel['type']})")
