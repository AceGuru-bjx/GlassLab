#!/bin/bash
# Set project item status for an issue number.
set -e
TOKEN="${GITHUB_TOKEN:?}"
PROJECT_ID="PVT_kwHOFBkHJ84BmIGA"
ISSUE_NUM="${1:-1}"
STATUS="${2:-Done}"

gql() { curl -s -m 25 -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" https://api.github.com/graphql -d "$1"; }

ITEM=$(gql '{"query":"{repository(owner:\"AceGuru-bjx\",name:\"GlassLab\"){issue(number:'"$ISSUE_NUM"'){projectItems(first:5){nodes{id}}}}}"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['repository']['issue']['projectItems']['nodes'][0]['id'])")

FIELDINFO=$(gql '{"query":"{node(id:\"'"$PROJECT_ID"'\"){... on ProjectV2{fields(first:20){nodes{... on ProjectV2SingleSelectField{id name options{id name}}}}}}}"}' | python3 -c "
import sys,json
d=json.load(sys.stdin)
if 'errors' in d or 'data' not in d:
    raise SystemExit('GraphQL error: ' + json.dumps(d)[:300])
for f in d['data']['node']['fields']['nodes']:
    if f and f.get('name')=='Status':
        print(f['id'], [o['id'] for o in f['options'] if o['name'].lower()==('$STATUS').lower()][0])")

FID=$(echo "$FIELDINFO" | cut -d' ' -f1)
OID=$(echo "$FIELDINFO" | cut -d' ' -f2)

gql '{"query":"mutation{updateProjectV2ItemFieldValue(input:{projectId:\"'"$PROJECT_ID"'\",itemId:\"'"$ITEM"'\",fieldId:\"'"$FID"'\",value:{singleSelectOptionId:\"'"$OID"'\"}}){projectV2Item{id}}}"}' | grep -o '"id":"PVTI[^"]*"' && echo "issue #$ISSUE_NUM -> $STATUS"
