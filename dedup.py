import json
import sys

with open(sys.argv[1], encoding='utf-8') as f:
    data = json.load(f)

seen = set()
result = []
for item in data:
    if item['id'] not in seen:
        seen.add(item['id'])
        result.append(item)

with open(sys.argv[1], 'w', encoding='utf-8') as f:
    json.dump(result, f, ensure_ascii=False, indent=2)

print(f"Removed {len(data) - len(result)} duplicates, {len(result)} records left.")
