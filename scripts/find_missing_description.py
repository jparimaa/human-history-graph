import json
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
REQUIRED_FIELDS = ["short_description", "long_description", "why_they_matter"]


def find_missing_description() -> None:
    people = json.loads((DATA_DIR / "people.json").read_text(encoding="utf-8"))
    descriptions = json.loads((DATA_DIR / "descriptions.json").read_text(encoding="utf-8"))

    desc_by_id = {}
    for entry in descriptions:
        person_id, fields = next(iter(entry.items()))
        desc_by_id[person_id] = fields

    missing = []
    for person in people:
        fields = desc_by_id.get(person["id"])
        if fields is None or any(not fields.get(key, "").strip() for key in REQUIRED_FIELDS):
            missing.append(person)

    if not missing:
        print("All people have descriptions.")
        return

    person = max(missing, key=lambda p: p["hpi_score"])
    print(f"{person['id']} | {person['name']} | {person['birth_year']}-{person['death_year']} | {person['occupation']} | hpi={person['hpi_score']}")


if __name__ == "__main__":
    find_missing_description()
