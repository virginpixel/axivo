# Axivo Software Design Specification

# Document 23 – Contracts & Agreements

## Purpose
Manage contracts, subscriptions, warranties and service agreements.

## Features
- Contract repository
- Renewal tracking
- Vendor linking
- Cost tracking
- Attachments
- Notifications
- Audit history

## Contract Fields
- Contract Number
- Contract Name
- Vendor
- Company
- Category
- Status
- Start Date
- End Date
- Renewal Date
- Renewal Type
- Cost
- Currency
- Owner
- Notes

## Categories
- Software
- Hardware Support
- Cloud Services
- Internet
- Telecom
- Maintenance
- Warranty
- Other

## Status
- Draft
- Active
- Expiring
- Expired
- Renewed
- Terminated

## Attachments
- Signed Contracts
- Amendments
- Quotes
- Invoices
- Renewal Documents

## Renewal
Supports:
- Manual
- Monthly
- Quarterly
- Annual
- Custom

Reminder periods are configurable.

## Reporting
- Expiring Contracts
- Active Contracts
- Cost Summary
- Vendor Summary

## Notifications
Automatic renewal reminders based on configured reminder periods.

## Permissions
System Admin: Full
IT Admin: Manage
Read Only: View

## Business Rules
- Contract numbers are unique.
- Renewals preserve history.
- Expired contracts are archived.
- Every change is audited.

## End of Document 23.
