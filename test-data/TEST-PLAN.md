# Test plan — big data for every feature

Run `npm run dev`, then import each file into its tab and hit the heavy actions.
Everything is auto-timed into `perf.log`. When done, tell Claude "check the log".

Regenerate anytime: `node test-data/generate.mjs`

| File | Tab | What to do |
|---|---|---|
| `subdomains_100k.jsonl` | **Subdomains** | Paste/import (httpx JSONL). Then sort, filter pills, search, save/reload a session, Clear All. (some rows have takeover CNAMEs) |
| `urls_100k.txt` | **URL Parser** | Paste & parse, then export CSV/TXT |
| `ports_50k.json` | **Port Scan** | Import. Then save a snapshot + reload it, export |
| `nmap-rich.xml` | **Port Scan** | Import (nmap XML, richer service/CVE data) |
| `diff-1-baseline.txt` + `diff-2-later.txt` | **Port Scan** | Import one, snapshot, import the other, run **port diff** |
| `assets_mixed_60k.txt` | **Assets** | Smart import (auto-routes hosts/urls/js). Open **IPs** view, dead-endpoint detect, export/import vault |
| `bigscript.js` | **JS Recon** | Load the file (raw JS). Watch secrets/endpoints/keys extraction, risk score, export report |
| `nuclei_5k.jsonl` | **Attack Surface** | Paste into the nuclei box → Import. Then toggle worklist filters/weights |
| `http_sample.txt` | **HTTP Analyzer** | Paste the whole thing (request+response with weak headers + secrets) |
| `wordlist_100k.txt` | **Wordlists** | Import (drag/paste), then export all as JSON |
| — | **Tech Stack** | Just open it after importing subdomains (aggregates all 100k hosts) |
| — | **Dashboard** | Open after import (charts + worklist over everything) |
| — | **Settings → Backup** | Export all, then Restore |
| `sample-scope-hackerone.txt` | **Scope** | Load scope rules; check other tabs go scope-aware |

## Order that builds up cross-linked data
1. Subdomains (`subdomains_100k.jsonl`) → 2. Ports (`ports_50k.json`) →
3. URL Parser (`urls_100k.txt`) → 4. Nuclei into Surface (`nuclei_5k.jsonl`) →
5. open Dashboard / Attack Surface / Tech Stack to see it all combined →
6. Backup export/restore last.
