import csv
import json
import sys


def csv_to_json(input_path: str, output_path: str) -> None:
    records = []
    with open(input_path, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            birth_year = int(row["birthyear"]) if row["birthyear"] else None
            hpi_score = float(row["hpi"]) if row["hpi"] else None

            if birth_year is None or birth_year >= 1900:
                continue
            if hpi_score is None or hpi_score < 80.0:
                continue

            records.append({
                "id": row["slug"].lower(),
                "name": row["name"],
                "display_name": row["name"],
                "birth_year": birth_year,
                "death_year": int(row["deathyear"]) if row["deathyear"] else None,
                "occupation": row["occupation"],
                "birth_country": row["bplace_country"],
                "hpi_score": hpi_score,
            })

    records.sort(key=lambda r: r["birth_year"])

    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(records, f, indent=2, ensure_ascii=False)

    print(f"Wrote {len(records)} records to {output_path}")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("Usage: python csv_to_json.py <input.csv> <output.json>")
        sys.exit(1)
    csv_to_json(sys.argv[1], sys.argv[2])
