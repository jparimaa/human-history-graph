import json
from pathlib import Path

with open("data/people.json", encoding="utf-8") as f:
    people = json.load(f)

completed_path = Path("data/completed_relations.json")
if completed_path.exists():
    with open(completed_path, encoding="utf-8") as f:
        completed = set(json.load(f))
else:
    completed = set()

sorted_people = sorted(people, key=lambda p: p.get("hpi_score", 0), reverse=True)

for person in sorted_people:
    if person["id"] not in completed:
        print(json.dumps(person, indent=2))
        break
