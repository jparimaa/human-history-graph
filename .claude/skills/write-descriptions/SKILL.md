---
name: write-descriptions
description: Write missing person descriptions into data/descriptions.json for the human-history-graph dataset, a fixed number at a time. Use when the user asks to write, add, fill in, continue, or keep going on descriptions/bios for people in the dataset.
argument-hint: <count>
---

# Write descriptions

Write descriptions for the next `$1` people who are missing them in `data/descriptions.json`. If `$1` is missing or not a positive number, ask the user how many to write before starting anything.

First, read @rules/descriptions.md for the style rules each field must follow.

`data/descriptions.json` and `data/people.json` are both large (1000+ people) -- don't load either one in full. Work through the python helper scripts in `scripts/` instead so context stays manageable.

## Loop, `$1` times

Repeat the following exactly `$1` times, stopping early if the dataset turns out to already be complete:

1. Run `python scripts/find_missing_description.py`. It prints the next person needing a description as `id | name | birth-death | occupation | hpi=...`, picking the highest-HPI person that's still missing one.
   - If it instead prints `All people have descriptions.`, the dataset is complete: tell the user that and stop, even if you haven't reached `$1` people yet.
2. If the name, dates, and occupation aren't enough to recognize the person, look them up by id in `data/people.json` (search/filter for that single entry rather than loading the whole file).
3. Write the four description fields for that person, following `rules/descriptions.md`:
   - `short_description`
   - `long_description`
   - `why_they_matter`
   - `personality` -- always pass `""`. It's intentionally being left out of the dataset for now, regardless of how strong a personality blurb you could write.
4. Write the four fields to a temp file `scripts/new_description_<id>.json`:
   ```json
   {
     "id": "...",
     "short_description": "...",
     "long_description": "...",
     "why_they_matter": "...",
     "personality": ""
   }
   ```
   Then run `python scripts/add_description.py scripts/new_description_<id>.json`. It rewrites `descriptions.json` in place for that one person, preserving the file's exact formatting (the leading `[  ` and lack of trailing newline) so the diff only ever shows the entry that actually changed. If it succeeds, delete the temp file; if it fails, report the error and skip that person.
5. Tell the user in the console that you finished writing the description for that person (name and id), then move on to the next iteration.

## Notes

- Always write and save one person at a time -- never batch multiple people into a single `update_description` call or script run.
- Keep the running total in mind: stop after `$1` people (or sooner, if the dataset completes first), and report the final count to the user.
