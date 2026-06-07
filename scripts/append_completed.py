import json
import sys
from pathlib import Path

def main():
    if len(sys.argv) != 2:
        print("Usage: python append_completed.py <string>")
        sys.exit(1)

    value = sys.argv[1]
    path = Path("data/completed_relations.json")

    if path.exists():
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
    else:
        data = []

    data.append(value)

    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

if __name__ == "__main__":
    main()
