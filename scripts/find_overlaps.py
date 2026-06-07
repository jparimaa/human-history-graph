import json
import sys
sys.stdout.reconfigure(encoding="utf-8")

if len(sys.argv) != 2:
    print("Usage: python find_overlaps.py <person_id>")
    sys.exit(1)

target_id = sys.argv[1]

with open("data/people.json", encoding="utf-8") as f:
    people = json.load(f)

with open("data/relations.json", encoding="utf-8") as f:
    relations = json.load(f)

by_id = {p["id"]: p for p in people}

if target_id not in by_id:
    print(f"Unknown id: {target_id}")
    sys.exit(1)

target = by_id[target_id]
t_birth = target["birth_year"]
t_death = target["death_year"]

already_related = {
    r["target_id"] for r in relations if r.get("source_id") == target_id and r.get("target_id")
} | {
    r["source_id"] for r in relations if r.get("target_id") == target_id and r.get("source_id")
}

def death(p):
    return p["death_year"] if p["death_year"] is not None else 9999

for p in people:
    if p["id"] == target_id or p["id"] in already_related:
        continue
    if p["birth_year"] <= death(target) and death(p) >= t_birth:
        print(f"{p['id']}  ({p['birth_year']}-{p['death_year']})")
