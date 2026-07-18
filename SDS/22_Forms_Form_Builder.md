# Axivo Software Design Specification

# Document 22 – Forms & Form Builder

## Purpose
Create and manage public request forms without code changes. Each published form is linked to exactly one workflow.

## Features
- Draft, Published and Archived forms
- Versioning
- Public request links
- Custom confirmation message
- One workflow per form
- Unlimited fields
- Conditional visibility
- Secure file uploads

## Field Types
- Text
- Paragraph
- Number
- Email
- Phone
- Date
- Time
- Date & Time
- Dropdown
- Multi-select
- Radio
- Checkbox
- Yes/No
- File Upload

## Field Properties
- Label
- Placeholder
- Help Text
- Required
- Default Value
- Validation
- Display Order
- Visibility Rules

## Conditional Logic
Supports AND/OR logic with:
- Equals
- Not Equals
- Contains
- Greater Than
- Less Than

## Builder
Administrators can:
- Create
- Edit Draft
- Duplicate
- Reorder fields
- Preview
- Publish
- Archive

Published versions are immutable.

## Submission Flow
Public User → Submit → Validation → Workflow Starts → Confirmation Email

## Validation
Server-side validation:
- Required fields
- Email format
- Number ranges
- Dates
- File size
- File type

## Permissions
System Admin: Full
IT Admin: Manage
Read Only: View
Public: Submit only

## Business Rules
- One workflow per form.
- Version changes do not affect previous submissions.
- Every submission generates an audit record.

## End of Document 22.
