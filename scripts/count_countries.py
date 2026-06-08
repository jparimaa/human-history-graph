import json
from collections import Counter

with open("data/people.json", encoding="utf-8") as f:
    people = json.load(f)

counts = Counter(p["birth_country"] for p in people)
for country, count in counts.most_common():
    print(f"{country} {count}")
