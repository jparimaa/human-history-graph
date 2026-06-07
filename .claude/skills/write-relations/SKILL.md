---
name: write-relations
description: Write missing historical relations into data/relations.json for the human-history-graph dataset, one person at a time. Use when the user asks to write, add, fill in, continue, or keep going on relations/connections between people in the dataset.
argument-hint: <count>
---

# Write relations

Write relations for the next `$1` people who are missing them in `data/relations.json`. If `$1` is missing or not a positive number, ask the user how many to write before starting anything.

First, read @rules/relations.md for the rules each relation must follow. These rules are mandatory.

## Setup

Execute: chcp 65001

So that there is proper UTF-8 support.

## Loop, `$1` times

Repeat the following exactly `$1` times, stopping early if the dataset turns out to already be complete:

1. Run `python scripts/find_missing_relations.py`. It prints the next person who needs relations checked, as a JSON object with `id`, `name`, `birth_year`, `death_year`, `occupation`.
   - If it prints nothing or says the dataset is complete, tell the user and stop.

2. Run `python scripts/find_overlaps.py <id>` using that person's id. It prints a list of candidate IDs: people whose lifespan overlaps this person's AND who don't already have a relation to/from this person in the dataset. It also prints their birth and death year so you know the order of relation.

3. Run `python scripts/check_relation.py id1 id2` to check if the relation already exists. 
   If it return "Not found", you can continue. If it returns a json object showing a relation, don't rewrite it
   but choose the next person in the list.

4. For each candidate ID, decide whether a relation should be written. The rules are in @rules/relations.md   

5. For each relation that passes the check:
   - Determine direction: the **older person** is `source_id`, the **younger person** is `target_id`. Use birth years from `data/people.json` to confirm when uncertain.
   - Choose exactly one type from: `teacher`, `mentor`, `collaborator`, `rival`, `ally`, `enemy`, `patron`, `family`, `spouse`, `romantic`, `friend`, `predecessor`.
   - Write the relation to `scripts/new_relation_<source_id>_<target_id>.json`:
     ```json
     {
       "source_id": "...",
       "target_id": "...",
       "type": "...",
       "strength": 0.0,
       "confidence": 0.0,
       "reason": "One sentence explaining the specific historical relationship."
     }
     ```
   - Run `python scripts/add_relation.py scripts/new_relation_<source_id>_<target_id>.json`.
   - If it succeeds, delete the temp file. If it fails, report the error and skip that relation.

6. After processing all candidates:
   - If at least one relation was added, the person is already recorded as a source in `data/relations.json`.   
   - Tell the user which person was completed and how many relations were added. Then move on to the next iteration.
   - run script `python scripts/append_completed.py completed_id` which writes the newly added id to another json file to keep track of added people.

## Notes

- Write one relation file at a time, add it immediately, then delete the temp file before moving to the next relation.
- A person is considered "done" even if zero relations were added (it may genuinely have no qualifying connections among contemporaries in the dataset).
- Keep the running total in mind: stop after `$1` people, and report the final count to the user.
