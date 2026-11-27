#!/usr/bin/env python3
"""
email_sweep.py - daily local sweep of transaction emails from Mail.app (macOS).

Reads recent mail via AppleScript, finds spends with bank templates and a generic receipt
pattern, and appends one line per spend to a text file. Nothing leaves your Mac, and there is
no AI step: every rule is a pattern you can read and change below.

Load the file on PocketLog's Reconcile screen. It compares the emails with what you've logged,
flags amounts that differ, and lets you add what's missing.

Line format (read by PocketLog, see src/parser/emailSweep.ts):
  2026-11-27 | 450.00 | Swiggy | src=email via=hdfc-upi mid=<abc@mail.example>

Usage:
  python3 tools/email_sweep.py --dry-run          # print what it would write
  python3 tools/email_sweep.py                    # write entries
  python3 tools/email_sweep.py --since 2026-11-20 # override the start date

First run: macOS will ask to let Terminal control Mail. Allow it.
Safe to rerun: a message is never written twice (deduped on Message-ID).
"""
import argparse
import json
import re
import subprocess
import sys
from datetime import datetime, timedelta
from pathlib import Path

# ---------------------------------------------------------------- CONFIG ---
ICLOUD = Path.home() / "Library/Mobile Documents/com~apple~CloudDocs"
LOG_FILE = ICLOUD / "finance/entries.txt"            # the file you load in PocketLog
REVIEW_FILE = LOG_FILE.with_name("email_needs_review.txt")
STATE_FILE = Path.home() / ".email_sweep_state.json"
FIRST_RUN_LOOKBACK_DAYS = 7
OVERLAP_DAYS = 1                                      # re-scan a day for safety

# Only emails whose sender contains one of these (case-insensitive) are read.
SENDERS = ["hdfcbank", "icicibank", "axisbank", "swiggy", "zomato",
           "uber", "amazon", "phonepe", "google pay", "gpay"]

# Cleans up ugly merchant names. Add to this as you see them.
ALIASES = {
    "amzn": "Amazon", "amazon pay": "Amazon", "swiggy": "Swiggy",
    "zomato": "Zomato", "uber": "Uber",
}


def format_line(e):
    """One line per spend, in the format PocketLog reads."""
    return (f"{e['date']:%Y-%m-%d} | {e['amount']:.2f} | {e['merchant']} | "
            f"src=email via={e['via']} mid={e['mid']}")


# ------------------------------------------------------------- PARSING -----
# A digit first, so a lone comma can never be read as an amount.
NUM = r"(?P<amount>\d[\d,]*(?:\.\d{1,2})?)"

# Bank templates: starting points. Check them against your real emails and tweak.
BANK_TEMPLATES = [
    ("hdfc-upi", "hdfcbank",
     rf"Rs\.?\s?{NUM}\s+has been debited from account\s+\**\d+\s+to VPA\s+(?P<merchant>\S+)"),
    ("hdfc-card", "hdfcbank",
     rf"Rs\.?\s?{NUM}\s+(?:is|has been)\s+debited from your HDFC Bank Credit Card.*?towards\s+(?P<merchant>.+?)\s+on"),
    ("icici", "icicibank",
     rf"debited with INR\s?{NUM}.*?Info:\s*(?P<merchant>\S+)"),
    ("axis", "axisbank",
     rf"(?:INR|Rs\.?)\s?{NUM}\s+(?:debited|spent).*?(?:at|to)\s+(?P<merchant>.+?)(?:\s+on|\.|\n)"),
]

# Generic merchant receipts: look for a total near a label.
GENERIC_TOTAL = re.compile(
    r"(?:grand total|total paid|amount paid|order total|total amount|total)"
    r"[^\d\n]{0,25}(?:Rs\.?|INR|₹)?\s?(?P<amount>\d[\d,]*(?:\.\d{1,2})?)", re.I)

SKIP_SUBJECT = re.compile(
    r"\b(otp|one[- ]time|refund|credited|failed|declined|statement|offer|reward|"
    r"cashback|reminder|newsletter)\b", re.I)


def to_float(s):
    return float(s.replace(",", ""))


def clean_merchant(raw, sender):
    m = (raw or "").strip().strip(".,;:")
    if "@" in m:                       # UPI VPA like swiggy@icici -> swiggy
        m = m.split("@")[0]
    # The merchant is written between " | " separators, so it must not contain one.
    m = m.replace("|", " ")
    m = m or re.sub(r'["<].*', "", sender).strip() or "Unknown"
    for key, nice in ALIASES.items():
        if key in m.lower():
            return nice
    return m.title() if m.islower() or m.isupper() else m


def parse_email(sender, subject, body):
    """Return dict(amount, merchant, via) or None."""
    if SKIP_SUBJECT.search(subject):
        return None
    s = sender.lower()
    for name, sender_key, pattern in BANK_TEMPLATES:
        if sender_key in s:
            m = re.search(pattern, body, re.I | re.S)
            if m:
                return {"amount": to_float(m["amount"]),
                        "merchant": clean_merchant(m["merchant"], sender),
                        "via": name}
    m = GENERIC_TOTAL.search(body)
    if m:
        return {"amount": to_float(m["amount"]),
                "merchant": clean_merchant("", sender), "via": "generic"}
    return None


# ------------------------------------------------------------ MAIL.APP -----
LIST_SCRIPT = '''
on run argv
  set cutoff to current date
  set day of cutoff to 1
  set year of cutoff to (item 1 of argv as integer)
  set month of cutoff to (item 2 of argv as integer)
  set day of cutoff to (item 3 of argv as integer)
  set time of cutoff to 0
  set out to {}
  tell application "Mail"
    set msgs to (messages of inbox whose date received is greater than or equal to cutoff)
    repeat with m in msgs
      set d to date received of m
      set rec to (message id of m) & tab & (sender of m) & tab & (subject of m) & tab & (year of d as string) & "-" & ((month of d as integer) as string) & "-" & (day of d as string) & " " & (time of d as string)
      set end of out to rec
    end repeat
  end tell
  set AppleScript's text item delimiters to linefeed
  return out as string
end run
'''

BODY_SCRIPT = '''
on run argv
  tell application "Mail"
    set m to first message of inbox whose message id is (item 1 of argv)
    return content of m
  end tell
end run
'''


def osa(script, *args, timeout=300):
    r = subprocess.run(["osascript", "-e", script, *args],
                       capture_output=True, text=True, timeout=timeout)
    if r.returncode != 0:
        raise RuntimeError(r.stderr.strip() or "osascript failed")
    return r.stdout


def list_messages(since):
    out = osa(LIST_SCRIPT, str(since.year), str(since.month), str(since.day))
    msgs = []
    for line in out.splitlines():
        parts = line.split("\t")
        if len(parts) < 4:
            continue
        mid, sender, subject, stamp = parts[0], parts[1], parts[2], parts[3]
        ymd, secs = stamp.rsplit(" ", 1)
        y, mo, d = map(int, ymd.split("-"))
        when = datetime(y, mo, d) + timedelta(seconds=int(float(secs)))
        msgs.append({"mid": mid.strip(), "sender": sender,
                     "subject": subject, "date": when})
    return msgs


def get_body(mid):
    return osa(BODY_SCRIPT, mid)[:20000]


# ---------------------------------------------------------------- MAIN -----
def seen_ids():
    ids = set()
    for f in (LOG_FILE, REVIEW_FILE):
        if f.exists():
            ids.update(re.findall(r"mid=(\S+)", f.read_text(errors="ignore")))
    return ids


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--since", help="YYYY-MM-DD, overrides saved last-run date")
    args = ap.parse_args()

    now = datetime.now()
    if args.since:
        since = datetime.strptime(args.since, "%Y-%m-%d")
    elif STATE_FILE.exists():
        last = datetime.fromisoformat(json.loads(STATE_FILE.read_text())["last_run"])
        since = last - timedelta(days=OVERLAP_DAYS)
    else:
        since = now - timedelta(days=FIRST_RUN_LOOKBACK_DAYS)

    try:
        messages = list_messages(since)
    except RuntimeError as e:
        sys.exit(f"Could not read Mail: {e}")

    done = seen_ids()
    candidates = [m for m in messages
                  if any(k in m["sender"].lower() for k in SENDERS)
                  and m["mid"] not in done]
    print(f"{len(candidates)} new candidate emails since {since:%Y-%m-%d}")

    entries, review, failed = [], [], 0
    for m in candidates:
        if SKIP_SUBJECT.search(m["subject"]):
            continue
        try:
            body = get_body(m["mid"])
        except Exception as e:                  # one bad message must not stop the sweep
            failed += 1
            print(f"SKIP   could not read {m['mid']}: {e}")
            continue
        res = parse_email(m["sender"], m["subject"], body)
        if res:
            entries.append(format_line({**m, **res}))
        else:
            review.append(f"{m['date']:%Y-%m-%d} | {m['sender']} | {m['subject']} | mid={m['mid']}")

    for line in entries:
        print("ENTRY ", line)
    for line in review:
        print("REVIEW", line)

    if not args.dry_run:
        LOG_FILE.parent.mkdir(parents=True, exist_ok=True)
        if entries:
            with LOG_FILE.open("a") as f:
                f.write("\n".join(entries) + "\n")
        if review:
            with REVIEW_FILE.open("a") as f:
                f.write("\n".join(review) + "\n")
        # Only move the start date forward when every message was read, so a failure is retried.
        if not failed:
            STATE_FILE.write_text(json.dumps({"last_run": now.isoformat()}))
    print(f"{len(entries)} entries, {len(review)} need review"
          + (f", {failed} could not be read" if failed else "")
          + (" (dry run, nothing written)" if args.dry_run else ""))


if __name__ == "__main__":
    main()
