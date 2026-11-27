"""Run with: python3 -m unittest tools/test_email_sweep.py"""
import sys
import unittest
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from email_sweep import IGNORE, clean_merchant, format_line, parse_email  # noqa: E402


class ParseEmail(unittest.TestCase):
    def test_hdfc_upi_reads_amount_payee_and_the_spend_date(self):
        body = ("Dear Customer,\n\nGreetings from HDFC Bank!\n\nRs.91.00 is debited from your account ending 1234 "
                "towards VPA ******3345@okhdfcbank (RAVI K) on 27-11-26.\n\nUPI transaction reference no.: 123456789012.\n")
        r = parse_email("HDFC Bank InstaAlerts <alerts@hdfcbank.bank.in>",
                        "\u2757  You have done a UPI txn. Check details!", body)
        self.assertEqual((r["amount"], r["merchant"], r["via"]), (91.0, "Ravi K", "hdfc-upi"))
        self.assertEqual(r["date"], datetime(2026, 11, 27))

    def test_hdfc_account_update_credit_is_not_a_spend(self):
        body = ("We're writing to inform you that Rs.1.00 has been successfully credited to your HDFC Bank "
                "account ending in 1234.\nSender: SOME SHOP PVT LTD (VPA: *****@axisbank)")
        self.assertIs(parse_email("alerts@hdfcbank.bank.in", "View: Account update for your HDFC Bank A/c", body), IGNORE)

    def test_uber_receipt_reads_total_date_and_how_it_was_paid(self):
        body = ("\ufffc\nNov 25, 2026\n7:32 PM\n\nThanks for riding, Priya\n\nTotal\n\u20b9105.26\n \n"
                "Suggested fare\n\u20b9105.26\n \nPayments\n\ufffc\nCash\n\u20b9105.26\n11/25/26 7:47 PM\n")
        r = parse_email("Uber Receipts <noreply@uber.com>", "Your Wednesday evening trip with Uber", body)
        self.assertEqual((r["amount"], r["merchant"], r["via"]), (105.26, "Uber", "uber-cash"))
        self.assertEqual(r["date"], datetime(2026, 11, 25))

    def test_uber_trip_paid_by_card_or_upi(self):
        base = "Nov 25, 2026\nTotal\n\u20b9200.00\nPayments\n\ufffc\n%s\n\u20b9200.00\n"
        for mode, via in [("UPI", "uber-upi"), ("Visa \u2022\u2022\u2022\u20221234", "uber-card"), ("Wallet", "uber")]:
            r = parse_email("noreply@uber.com", "Your Wednesday evening trip with Uber", base % mode)
            self.assertEqual(r["via"], via, mode)

    def test_hdfc_card(self):
        r = parse_email("alerts@hdfcbank.net", "Card spend",
                        "Rs 1,299.00 is debited from your HDFC Bank Credit Card ending 9027 towards AMAZON PAY INDIA on 27-11-26")
        self.assertEqual((r["amount"], r["via"]), (1299.0, "hdfc-card"))
        self.assertEqual(r["merchant"], "Amazon")

    def test_generic_receipt_uses_the_sender(self):
        r = parse_email("Zomato <noreply@zomato.com>", "Your order",
                        "Thanks!\nGrand total: ₹ 612.50\n")
        self.assertEqual((r["amount"], r["merchant"], r["via"]), (612.5, "Zomato", "generic"))

    def test_skips_refunds_otps_and_offers(self):
        for subject in ["Refund processed", "Your OTP is 123456", "Big offer today", "Statement ready"]:
            self.assertIs(parse_email("a@hdfcbank.net", subject, "Rs. 100 has been debited"), IGNORE)

    def test_amazon_pay_puts_the_payment_in_the_subject(self):
        r = parse_email("Amazon Pay India <no-reply@amazonpay.in>",
                        "Your payment of \u20b9\u00a01191.42 to BOOKMYSHOW was successful",
                        "Thank you for using Amazon Pay.")
        self.assertEqual((r["amount"], r["merchant"], r["via"]), (1191.42, "Bookmyshow", "amazonpay"))

    def test_skips_what_is_not_a_spend(self):
        for sender, subject in [
            ("Amazon Pay India <no-reply@amazonpay.in>", "\u20b9150.00 added to your Amazon Pay Balance."),
            ("TradeQualityUnit <x@hdfcbank.bank.in>",
             "Swift Copy for Cross-Border Remittance \u2013 Ref: 201126BTT10303 \u2013 USD 532,66"),
            ("Google Payments <payments-noreply@google.com>", "Your Chrome Web Store order has been canceled"),
        ]:
            self.assertIs(parse_email(sender, subject, "Total: Rs. 150.00"), IGNORE, subject)

    def test_hdfc_debit_card_amount_comes_from_the_subject(self):
        r = parse_email("HDFC Bank InstaAlerts <alerts@hdfcbank.bank.in>",
                        "Rs.3220.46 debited via Debit Card **2663",
                        "Dear Customer, Rs.3220.46 has been debited from your account via Debit Card **2663 at AMAZON PAY on 22-11-26.")
        self.assertEqual((r["amount"], r["via"]), (3220.46, "hdfc-debit"))
        self.assertEqual(r["merchant"], "Amazon")  # the alias list tidies the name

    def test_hdfc_debit_card_without_a_readable_merchant_still_has_the_amount(self):
        r = parse_email("alerts@hdfcbank.bank.in", "Rs.467.65 debited via Debit Card **2663", "No details.")
        self.assertEqual((r["amount"], r["merchant"]), (467.65, "Debit card"))

    def test_skips_marketing_and_failed_payments(self):
        for subject in ["Payment Unsuccessful - HDFC Bank Debit Card ending with 2663",
                        "Important: Forex Conversion Markup Fee on cross border transaction using Debit Card Transaction",
                        "Share your Uber experience", "We'd like to hear from you!",
                        "Get 20% off 2 Uber Black airport rides for the holidays",
                        "Help make Amazon Pay better. Your feedback matters to us."]:
            self.assertIs(parse_email("noreply@uber.com", subject, "Total \u20b9150"), IGNORE, subject)

    def test_the_masking_hides_long_numbers_only(self):
        from email_sweep import mask
        self.assertEqual(mask("Ref 1234567890123 Rs 450.00 A/c **1234"), "Ref <digits> Rs 450.00 A/c **1234")

    def test_a_lone_comma_is_not_an_amount(self):
        # Used to raise ValueError: could not convert string to float: ','
        self.assertIsNone(parse_email("x@amazon.in", "Your order", "Total: ,"))

    def test_nothing_found(self):
        self.assertIsNone(parse_email("x@amazon.in", "Hello", "No money here"))


class Format(unittest.TestCase):
    def test_line_matches_what_pocketlog_reads(self):
        line = format_line({"date": datetime(2026, 11, 27, 9, 30), "amount": 450.0,
                            "merchant": "Swiggy", "via": "hdfc-upi", "mid": "<a1@mail.example>"})
        self.assertEqual(line, "2026-11-27 | 450.00 | Swiggy | src=email via=hdfc-upi mid=<a1@mail.example>")

    def test_a_pipe_in_the_merchant_cannot_break_the_line(self):
        self.assertNotIn("|", clean_merchant("A | B Store", "x@y.com"))


if __name__ == "__main__":
    unittest.main()
