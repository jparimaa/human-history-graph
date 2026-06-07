import json
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")

DATA_DIR = Path(__file__).resolve().parent.parent / "data"

people = json.loads((DATA_DIR / "people.json").read_text(encoding="utf-8"))

completed_path = DATA_DIR / "completed_relations.json"
if completed_path.exists():
    completed = set(json.loads(completed_path.read_text(encoding="utf-8")))
else:
    completed = set()

sorted_people = sorted(people, key=lambda p: p.get("hpi_score", 0), reverse=True)

for person in sorted_people:
    if person["id"] not in completed:
        print(json.dumps(person, indent=2, ensure_ascii=False))
        break
