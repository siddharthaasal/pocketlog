"""Run with: python3 -m unittest tools/test_email_sweep.py"""
import sys
import unittest
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from email_sweep import clean_merchant, format_line, parse_email  # noqa: E402


class ParseEmail(unittest.TestCase):
    def test_hdfc_upi(self):
        r = parse_email("HDFC Bank <alerts@hdfcbank.net>", "UPI debit",
                        "Rs. 450.00 has been debited from account **1234 to VPA swiggy@icici on 27-11-26")
        self.assertEqual((r["amount"], r["merchant"], r["via"]), (450.0, "Swiggy", "hdfc-upi"))

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
            self.assertIsNone(parse_email("a@hdfcbank.net", subject, "Rs. 100 has been debited"))

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
            self.assertIsNone(parse_email(sender, subject, "Total: Rs. 150.00"), subject)

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
