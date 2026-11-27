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
  python3 tools/email_sweep.py --list-mailboxes   # see the mailbox names Mail uses
  python3 tools/email_sweep.py --sample "UPI txn" # show one email's body, to write a pattern
  python3 tools/email_sweep.py --mid 6b03e010     # show the one email whose Message-ID has this
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

# Mailboxes to read, by the name Mail shows. "inbox" is every account's Inbox. A Gmail label shows
# up in Mail.app as a mailbox, and a nested label like Reference/Finances/Bank shows only its last
# part ("Bank"). Run with --list-mailboxes to see the names. Skip huge ones like All Mail.
MAILBOXES = ["inbox", "Bank", "Invoices", "Shopping", "Travel & Commute"]

# Everything in these mailboxes is read, whoever sent it: you filed it there on purpose.
# Other mailboxes (the Inbox) are narrowed to the senders below.
READ_ALL_SENDERS_IN = {"Bank", "Invoices", "Shopping", "Travel & Commute"}

# Only emails whose sender contains one of these (case-insensitive) are read from other mailboxes.
SENDERS = ["hdfcbank", "icicibank", "axisbank", "swiggy", "zomato",
           "uber", "amazon", "phonepe", "google pay", "gpay"]

# Cleans up ugly merchant names. Add to this as you see them.
ALIASES = {
    "amzn": "Amazon", "amazon": "Amazon", "swiggy": "Swiggy",
    "zomato": "Zomato", "uber": "Uber",
}


def format_line(e):
    """One line per spend, in the format PocketLog reads."""
    return (f"{e['date']:%Y-%m-%d} | {e['amount']:.2f} | {e['merchant']} | "
            f"src=email via={e['via']} mid={e['mid']}")


# ------------------------------------------------------------- PARSING -----
# A digit first, so a lone comma can never be read as an amount.
NUM = r"(?P<amount>\d[\d,]*(?:\.\d{1,2})?)"

# Generic merchant receipts: look for a total near a label.
GENERIC_TOTAL = re.compile(
    r"(?:grand total|total paid|amount paid|order total|total amount|total)"
    r"[^\d\n]{0,25}(?:Rs\.?|INR|₹)?\s?(?P<amount>\d[\d,]*(?:\.\d{1,2})?)", re.I)

# Subjects that are never a spend: wallet top-ups, cancelled or failed payments, remittance
# paperwork, fee notices, and marketing or feedback requests.
SKIP_SUBJECT = re.compile(
    r"\b(otp|one[- ]time|refund(?:ed)?|credited|failed|declined|unsuccessful|statement|offer|"
    r"reward|cashback|reminder|newsletter|cancell?ed|added to your|swift copy|remittance|"
    r"forex conversion|feedback|share your|hear from you|help make|your experience|research|"
    r"payslip|taxinvoice|invoice copy|sign-in|inactive|safety hub|your input matters)\b"
    r"|\d+% off"
    # Order and delivery stages: the payment itself arrives as its own email.
    r"|^(?:ordered|shipped|out for delivery|delivered):"
    r"|regarding your recent order|prime membership|brand warranty|return of|"
    r"reservation confirmed|previous trip|important notice|bill for your|taking full advantage",
    re.I)

# Each template: (via, sender contains, where to look, pattern). Patterns name their groups:
# amount (required), merchant, and date (the day of the spend, which beats the day the email
# arrived). `via` is written to the line and tells PocketLog which account probably paid.
TEMPLATES = [
    # "Your payment of ₹ 1191.42 to BOOKMYSHOW was successful": all in the subject.
    ("amazonpay", "amazonpay", "subject",
     r"payment of\s*(?:Rs\.?|INR|₹)?\s*" + NUM + r"\s*to\s+(?P<merchant>.+?)\s+was successful"),
    # "Rs.467.65 debited via Debit Card **2663": the amount is in the subject, the merchant in the body.
    ("hdfc-debit", "hdfcbank", "subject",
     r"Rs\.?\s?" + NUM + r"\s+debited via Debit Card"),
    # "Rs.91.00 is debited from your account ending 1234 towards VPA ******3345@okhdfcbank (RAVI K) on 27-11-26."
    ("hdfc-upi", "hdfcbank", "body",
     r"Rs\.?\s?" + NUM + r"\s+is debited from your account ending\s+\d+\s+towards VPA\s+\S+"
     r"\s+\((?P<merchant>[^)]+)\)\s+on\s+(?P<date>\d{2}-\d{2}-\d{2,4})"),
    # The older wording, with no payee: "Rs.10.00 has been debited from account 1234 to account ******* on 23-11-26."
    ("hdfc-upi", "hdfcbank", "body",
     r"Rs\.?\s?" + NUM + r"\s+has been debited from account\s+\d+\s+to account\s+\S+"
     r"\s+on\s+(?P<date>\d{2}-\d{2}-\d{2,4})"),
    # "Rs 4798.00 was paid on Amazon.in": paid from Amazon Pay balance.
    ("amazonpay", "amazonpay", "subject",
     r"Rs\.?\s?" + NUM + r"\s+was paid on\s+(?P<merchant>\S+)"),
    # Razorpay receipt: merchant, "₹1,633.64", "Paid Successfully", "Method card", "Paid On 24 Sep, 2026".
    ("razorpay", "razorpay", "body",
     r"(?P<merchant>[^\n]+?)\s*\n\s*₹\s?" + NUM + r"\s*\n\s*Paid Successfully.*?Method\s+(?P<pay>\w+)"
     r".*?Paid On\s+(?P<date>\d{1,2} [A-Za-z]{3}, \d{4})"),
    # Electricity through Qube: "bill payment of ₹647.00 for K02B304".
    ("qube", "qube.eco", "body", r"bill payment of\s*₹\s?" + NUM),
    # Apple invoice: the date under "Tax Invoice", then the price of the item.
    ("apple", "apple.com", "body",
     r"Tax Invoice\s+(?P<date>\d{1,2} [A-Za-z]+ \d{4}).*?₹\s?" + NUM),
    # Rent receipt: "Payment Received ₹24,549.00 ... Payment Date 31/07/2026".
    ("rent", "kots.world", "body",
     r"Payment Received\s+₹\s?" + NUM + r".*?Payment Date\s+(?P<date>\d{2}/\d{2}/\d{4})"),
    # Guesses: check them against a real email and tweak.
    ("hdfc-card", "hdfcbank", "body",
     r"Rs\.?\s?" + NUM + r"\s+(?:is|has been)\s+debited from your HDFC Bank Credit Card.*?towards\s+"
     r"(?P<merchant>.+?)\s+on"),
    ("icici", "icicibank", "body", r"debited with INR\s?" + NUM + r".*?Info:\s*(?P<merchant>\S+)"),
    ("axis", "axisbank", "body",
     r"(?:INR|Rs\.?)\s?" + NUM + r"\s+(?:debited|spent).*?(?:at|to)\s+(?P<merchant>.+?)(?:\s+on|\.|\n)"),
    # Uber receipt: "Total\n₹105.26", the date at the top ("Nov 25, 2026").
    ("uber", "uber", "body",
     r"(?P<date>[A-Z][a-z]{2} \d{1,2}, \d{4}).*?\bTotal\s+(?:₹|Rs\.?)\s?" + NUM),
]

# Uber lists how the trip was paid, after "Payments" ("Cash", "UPI", a card...).
UBER_PAYMENT = re.compile(r"Payments\s+(?:\ufffc\s*)*(?P<pay>[^\n]+?)\s*\n\s*(?:₹|Rs)")

# Best-effort merchant from a body, for templates that only have the amount in the subject.
BODY_MERCHANT = re.compile(
    r"(?:\bat|towards|\bto|merchant:?)\s+(?P<merchant>[A-Za-z0-9][A-Za-z0-9 .&'*-]{2,40}?)"
    r"\s+(?:on|at|ref|\.)", re.I)

# Mail from your bank that reports money coming in is not a spend. Remembered, so it isn't re-read.
# Also your own forex remittance converting ("deducted from your account and added to RFX ... USD").
SKIP_BODY = re.compile(
    r"successfully credited|has been credited|credited to your|added to RFX|"
    r"biometric authentication|accepted the terms", re.I)

# What to call a payment whose alert names no payee.
DEFAULT_MERCHANT = {"hdfc-upi": "UPI payment", "hdfc-debit": "Debit card",
                    "qube": "Electricity", "apple": "Apple", "rent": "Rent"}
IGNORE = object()


# Receipts that the bank also alerts about (the same spend arrives twice, once from each side).
RECEIPT_VIAS = ("razorpay", "qube", "apple", "amazonpay", "rent")


def drop_duplicate_receipts(items):
    """Keep the bank alert and drop the merchant receipt for the same amount within a day."""
    alerts = [(i["amount"], i["date"]) for i in items if i["via"].startswith(("hdfc", "icici", "axis"))]
    return [i for i in items
            if not i["via"].startswith(RECEIPT_VIAS)
            or not any(a == i["amount"] and abs((d - i["date"]).days) <= 1 for a, d in alerts)]


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


def parse_when(text):
    for fmt in ("%d-%m-%y", "%d-%m-%Y", "%b %d, %Y", "%d %b, %Y", "%d %B %Y", "%d/%m/%Y"):
        try:
            return datetime.strptime(text.strip(), fmt)
        except ValueError:
            pass
    return None


def parse_email(sender, subject, body):
    """Return dict(amount, merchant, via[, date]), IGNORE for mail that is known not to be a
    spend, or None when it can't be read."""
    if SKIP_SUBJECT.search(subject):
        return IGNORE
    s = sender.lower()
    for via, sender_key, where, pattern in TEMPLATES:
        if sender_key not in s:
            continue
        m = re.search(pattern, subject if where == "subject" else body, re.I | re.S)
        if not m:
            continue
        found = m.groupdict().get("merchant")
        if not found and via == "hdfc-debit":
            guess = BODY_MERCHANT.search(body)
            found = guess["merchant"] if guess else None
        found = found or DEFAULT_MERCHANT.get(via)
        out = {"amount": to_float(m["amount"]),
               "merchant": clean_merchant(found, sender), "via": via}
        when = parse_when(m.groupdict().get("date") or "")
        if when:
            out["date"] = when
        if via == "razorpay":
            out["via"] = f"razorpay-{m['pay'].lower()}"
        if via == "uber":
            pay = UBER_PAYMENT.search(body)
            mode = (pay["pay"].strip().lower() if pay else "")
            out["via"] = ("uber-cash" if mode == "cash" else
                          "uber-upi" if "upi" in mode else
                          "uber-card" if any(k in mode for k in ("card", "visa", "master")) else
                          "uber")
        return out
    if SKIP_BODY.search(body):
        return IGNORE
    m = GENERIC_TOTAL.search(body)
    if m:
        return {"amount": to_float(m["amount"]),
                "merchant": clean_merchant("", sender), "via": "generic"}
    return None


# ------------------------------------------------------------ MAIL.APP -----
# Arguments: year, month, day, then the mailbox names to read. For every account that has a
# mailbox of that name (and "inbox" for all Inboxes) it lists messages received since the date.
# Fields are separated by ASCII 31 and records by ASCII 30, because a subject can contain tabs
# and line breaks: Message-ID, sender, subject, date, account, mailbox.
LIST_SCRIPT = '''
on run argv
  set cutoff to current date
  set day of cutoff to 1
  set year of cutoff to (item 1 of argv as integer)
  set month of cutoff to (item 2 of argv as integer)
  set day of cutoff to (item 3 of argv as integer)
  set time of cutoff to 0
  set wanted to items 4 thru -1 of argv
  set out to {}
  tell application "Mail"
    repeat with boxName in wanted
      set found to {}
      if (boxName as string) is "inbox" then
        set end of found to {inbox, "", "inbox"}
      else
        repeat with acc in accounts
          repeat with mb in (mailboxes of acc whose name is (boxName as string))
            set end of found to {mb, name of acc, boxName as string}
          end repeat
        end repeat
      end if
      repeat with f in found
        set mb to item 1 of f
        set msgs to (messages of mb whose date received is greater than or equal to cutoff)
        repeat with m in msgs
          set d to date received of m
          set fs to ASCII character 31
          set rec to (message id of m) & fs & (sender of m) & fs & (subject of m) & fs & (year of d as string) & "-" & ((month of d as integer) as string) & "-" & (day of d as string) & " " & (time of d as string) & fs & (item 2 of f) & fs & (item 3 of f)
          set end of out to rec
        end repeat
      end repeat
    end repeat
  end tell
  set AppleScript's text item delimiters to (ASCII character 30)
  return out as string
end run
'''

# Arguments: Message-ID, account name, mailbox name.
BODY_SCRIPT = '''
on run argv
  tell application "Mail"
    if (item 3 of argv) is "inbox" then
      set mb to inbox
    else
      set mb to first mailbox of account (item 2 of argv) whose name is (item 3 of argv)
    end if
    set m to first message of mb whose message id is (item 1 of argv)
    return content of m
  end tell
end run
'''

BOXES_SCRIPT = '''
on run
  set out to {}
  tell application "Mail"
    repeat with acc in accounts
      repeat with mb in mailboxes of acc
        set end of out to (name of acc) & tab & (name of mb)
      end repeat
    end repeat
  end tell
  set AppleScript's text item delimiters to linefeed
  return out as string
end run
'''


def osa(script, *args, timeout=600):
    r = subprocess.run(["osascript", "-e", script, *args],
                       capture_output=True, text=True, timeout=timeout)
    if r.returncode != 0:
        raise RuntimeError(r.stderr.strip() or "osascript failed")
    return r.stdout


def list_messages(since):
    out = osa(LIST_SCRIPT, str(since.year), str(since.month), str(since.day), *MAILBOXES)
    msgs = []
    for line in out.split("\x1e"):
        parts = line.split("\x1f")
        if len(parts) < 6:
            continue
        mid, sender, subject, stamp, account, box = (p for p in parts[:6])
        ymd, secs = stamp.rsplit(" ", 1)
        y, mo, d = map(int, ymd.split("-"))
        when = datetime(y, mo, d) + timedelta(seconds=int(float(secs)))
        msgs.append({"mid": mid.strip(), "sender": sender, "subject": subject,
                     "date": when, "account": account, "box": box})
    return msgs


def get_body(m):
    return osa(BODY_SCRIPT, m["mid"], m["account"], m["box"])[:20000]


def mask(text):
    """Hide long digit runs (account and reference numbers) before a body is shown."""
    return re.sub(r"\d{9,}", "<digits>", text)


def sample(since, needle, count, mid=None):
    """Print the body of emails whose subject (or Message-ID, with `mid`) contains `needle`."""
    shown = 0
    for m in list_messages(since):
        if mid is not None:
            if mid not in m["mid"]:
                continue
        elif needle.lower() not in m["subject"].lower():
            continue
        print("=" * 70)
        print(f"From:    {m['sender']}\nSubject: {m['subject']}\nMailbox: {m['box']}\n")
        print(mask(get_body(m))[:3000].strip())
        shown += 1
        if shown >= count:
            return
    if not shown:
        what = f"Message-ID containing “{mid}”" if mid is not None else f"“{needle}” in its subject"
        print(f"No email since {since:%Y-%m-%d} has {what}.")


def wanted(m):
    """Read everything in your own filing mailboxes; narrow the rest by sender."""
    return m["box"] in READ_ALL_SENDERS_IN or any(k in m["sender"].lower() for k in SENDERS)


# ---------------------------------------------------------------- MAIN -----
def read_state():
    try:
        return json.loads(STATE_FILE.read_text())
    except (OSError, ValueError):
        return {}


def seen_ids():
    ids = set(read_state().get("ignored", []))
    for f in (LOG_FILE, REVIEW_FILE):
        if f.exists():
            ids.update(re.findall(r"mid=(\S+)", f.read_text(errors="ignore")))
    return ids


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--since", help="YYYY-MM-DD, overrides saved last-run date")
    ap.add_argument("--sample", metavar="TEXT",
                    help="print the body of an email whose subject contains TEXT, then stop")
    ap.add_argument("--mid", metavar="TEXT",
                    help="print the body of the email whose Message-ID contains TEXT, then stop")
    ap.add_argument("--count", type=int, default=1, help="with --sample: how many emails to print")
    ap.add_argument("--list-mailboxes", action="store_true",
                    help="print the mailbox names Mail uses (to fill in MAILBOXES), then stop")
    args = ap.parse_args()

    if args.list_mailboxes:
        try:
            print(osa(BOXES_SCRIPT).rstrip())
        except RuntimeError as e:
            sys.exit(f"Could not read Mail: {e}")
        return

    if args.sample or args.mid:
        since = datetime.strptime(args.since, "%Y-%m-%d") if args.since else datetime.now() - timedelta(days=7)
        try:
            sample(since, args.sample or "", args.count, args.mid)
        except RuntimeError as e:
            sys.exit(f"Could not read Mail: {e}")
        return

    now = datetime.now()
    if args.since:
        since = datetime.strptime(args.since, "%Y-%m-%d")
    elif STATE_FILE.exists():
        last = datetime.fromisoformat(read_state()["last_run"])
        since = last - timedelta(days=OVERLAP_DAYS)
    else:
        since = now - timedelta(days=FIRST_RUN_LOOKBACK_DAYS)

    try:
        messages = list_messages(since)
    except RuntimeError as e:
        sys.exit(f"Could not read Mail: {e}")

    done = seen_ids()
    candidates, seen = [], set(done)
    for m in messages:
        # The same email can appear in two mailboxes (a Gmail label and All Mail): take it once.
        if m["mid"] in seen or not wanted(m):
            continue
        seen.add(m["mid"])
        candidates.append(m)
    print(f"{len(candidates)} new candidate emails since {since:%Y-%m-%d} "
          f"in {', '.join(MAILBOXES)}")

    entries, review, failed, ignored = [], [], 0, []
    for m in candidates:
        if SKIP_SUBJECT.search(m["subject"]):
            ignored.append(m["mid"])
            continue
        try:
            body = get_body(m)
        except Exception as e:                  # one bad message must not stop the sweep
            failed += 1
            print(f"SKIP   could not read {m['mid']}: {e}")
            continue
        res = parse_email(m["sender"], m["subject"], body)
        if res is IGNORE:
            ignored.append(m["mid"])
        elif res:
            entries.append({**m, **res})
        else:
            review.append(f"{m['date']:%Y-%m-%d} | {m['sender']} | {m['subject']} | mid={m['mid']}")

    entries = [format_line(e) for e in drop_duplicate_receipts(entries)]
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
            keep = sorted(set(read_state().get("ignored", [])) | set(ignored))[-5000:]
            STATE_FILE.write_text(json.dumps({"last_run": now.isoformat(), "ignored": keep}))
    print(f"{len(entries)} entries, {len(review)} need review, {len(ignored)} not spends"
          + (f", {failed} could not be read" if failed else "")
          + (" (dry run, nothing written)" if args.dry_run else ""))


if __name__ == "__main__":
    main()
