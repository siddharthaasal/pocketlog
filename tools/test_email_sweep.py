"""Run with: python3 -m unittest tools/test_email_sweep.py"""
import sys
import unittest
from datetime import datetime, timedelta
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

    def test_hdfc_upi_older_wording_has_no_payee(self):
        body = ("Dear Customer,\n\nRs.10.00 has been debited from account 1234 to account ******* on 23-11-26."
                "Your UPI transaction reference number is 123456789012.\n")
        r = parse_email("HDFC Bank InstaAlerts <alerts@hdfcbank.bank.in>",
                        "\u2757  You have done a UPI txn. Check details!", body)
        self.assertEqual((r["amount"], r["merchant"], r["via"]), (10.0, "UPI payment", "hdfc-upi"))
        self.assertEqual(r["date"], datetime(2026, 11, 23))

    def test_forex_remittance_conversion_is_not_a_spend(self):
        body = ("Rs. INR 49,859.64 is deducted from your account ending XX1234 and added to RFX "
                "201126BTT10303 USD532.66@93.605 account on 23-NOV-2026.\nThe available balance is Rs. INR 30,083.20.")
        self.assertIs(parse_email("alerts@hdfcbank.bank.in", "View: Account update for your HDFC Bank A/c", body), IGNORE)

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


class WholeYearEmails(unittest.TestCase):
    def test_amazon_pay_balance_payment_in_the_subject(self):
        r = parse_email("Amazon Pay India <no-reply@amazonpay.in>", "Rs 4798.00 was paid on Amazon.in", "")
        self.assertEqual((r["amount"], r["merchant"], r["via"]), (4798.0, "Amazon", "amazonpay"))

    def test_razorpay_receipt_reads_merchant_method_and_date(self):
        body = ("Hostinger\n\u20b91,633.64\nPaid Successfully\nPayment Id\npay_X\nMethod\ncard\nXXXX-XXXX-XXXX-1234\n"
                "Paid On\n24 Sep, 2026 08:56:36 PM IST\n")
        r = parse_email("Payments <no-reply@razorpay.com>", "Payment successful for Hostinger", body)
        self.assertEqual((r["amount"], r["merchant"], r["via"]), (1633.64, "Hostinger", "razorpay-card"))
        self.assertEqual(r["date"], datetime(2026, 9, 24))

    def test_electricity_bill_payment(self):
        body = "Your electricity bill payment of \u20b9647.00 for K02B304 has been processed successfully."
        r = parse_email("info@qube.eco", "Electricity Bill Payment Successful", body)
        self.assertEqual((r["amount"], r["merchant"]), (647.0, "Electricity"))

    def test_apple_invoice_takes_the_item_price_not_the_tax(self):
        body = ("Tax Invoice\n6 September 2026\nOrder ID:X\niCloud+ with 50 GB (Monthly)\nRenews 7 October 2026\n"
                "\u20b975.00\nSubtotal\n\u20b963.56\nIGST charged at 18%\n\u20b911.44\n")
        r = parse_email("Apple <no_reply@email.apple.com>", "Your invoice from Apple.", body)
        self.assertEqual((r["amount"], r["date"]), (75.0, datetime(2026, 9, 6)))

    def test_rent_receipt(self):
        body = "Payment Received\nDear X,\nPayment Received \n\u20b924,549.00 \nInvoice No\nA/1\nPayment Date\n31/07/2026 \n"
        r = parse_email("Hello@kots.world", "Payment Received by Kots Renting Private Limited", body)
        self.assertEqual((r["amount"], r["merchant"], r["date"]), (24549.0, "Rent", datetime(2026, 7, 31)))

    def test_order_stages_and_notices_are_not_spends(self):
        for subject in ('Shipped: "Pack of 4..."', 'Delivered: "Tote"', "Reservation confirmed for Sunday, 23 August",
                        "Bill for your Airtel Wi-Fi - June'26", "Payslip for the month of October 2026",
                        "Meet your new Safety Hub", "TaxInvoice - KA1262711"):
            self.assertIs(parse_email("x@amazon.in", subject, "Total \u20b9100"), IGNORE, subject)

    def test_biometric_notice_is_not_a_spend(self):
        self.assertIs(parse_email("alerts@hdfcbank.bank.in", "View: Account update",
                                  "Biometric authentication has been enabled for UPI payments"), IGNORE)

    def test_a_receipt_is_dropped_when_the_bank_alert_for_it_exists(self):
        from email_sweep import drop_duplicate_receipts
        day = datetime(2026, 9, 24)
        items = [{"amount": 75.0, "date": day, "via": "hdfc-upi"},
                 {"amount": 75.0, "date": day + timedelta(days=1), "via": "apple"},
                 {"amount": 80.0, "date": day, "via": "apple"}]
        self.assertEqual([i["via"] + str(i["amount"]) for i in drop_duplicate_receipts(items)],
                         ["hdfc-upi75.0", "apple80.0"])


class Format(unittest.TestCase):
    def test_line_matches_what_pocketlog_reads(self):
        line = format_line({"date": datetime(2026, 11, 27, 9, 30), "amount": 450.0,
                            "merchant": "Swiggy", "via": "hdfc-upi", "mid": "<a1@mail.example>"})
        self.assertEqual(line, "2026-11-27 | 450.00 | Swiggy | src=email via=hdfc-upi mid=<a1@mail.example>")

    def test_a_pipe_in_the_merchant_cannot_break_the_line(self):
        self.assertNotIn("|", clean_merchant("A | B Store", "x@y.com"))


if __name__ == "__main__":
    unittest.main()
