import json
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
COMPLETED_PATH = DATA_DIR / "completed_relations.json"
PEOPLE_PATH = DATA_DIR / "people.json"


def main():
    if len(sys.argv) != 2:
        print("Usage: python append_completed.py <person_id>")
        sys.exit(1)

    person_id = sys.argv[1]

    people = json.loads(PEOPLE_PATH.read_text(encoding="utf-8"))
    if person_id not in {p["id"] for p in people}:
        print(f"Unknown id: {person_id}")
        sys.exit(1)

    if COMPLETED_PATH.exists():
        data = json.loads(COMPLETED_PATH.read_text(encoding="utf-8"))
    else:
        data = []

    if person_id in data:
        print(f"Already recorded: {person_id}")
        return

    data.append(person_id)
    COMPLETED_PATH.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"Recorded: {person_id}")


if __name__ == "__main__":
    main()
