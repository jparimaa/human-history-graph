import json
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
DESCRIPTIONS_PATH = DATA_DIR / "descriptions.json"


def update_description(person_id, short_description, long_description, why_they_matter, personality=""):
    text = DESCRIPTIONS_PATH.read_text(encoding="utf-8")
    data = json.loads(text)

    for entry in data:
        if person_id in entry:
            entry[person_id] = {
                "short_description": short_description,
                "long_description": long_description,
                "why_they_matter": why_they_matter,
                "personality": personality,
            }
            break
    else:
        raise SystemExit(f"{person_id} not found in descriptions.json")

    dumped = json.dumps(data, indent=2, ensure_ascii=False)
    dumped = "[  \n" + dumped.split("\n", 1)[1]
    DESCRIPTIONS_PATH.write_text(dumped, encoding="utf-8")
    print(f"wrote description for {person_id}")
