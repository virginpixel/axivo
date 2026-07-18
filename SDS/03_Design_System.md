# Axivo Software Design Specification

# Document 03 - Design System

## Chapter 1 - Design Philosophy

### Purpose

This document defines the complete visual language, interaction standards and UI rules used throughout Axivo.

---

### Design Goals

- Clean and modern
- Fast to navigate
- Mobile-first
- Consistent across all modules
- Accessible
- Minimal learning curve
- Professional enterprise appearance

---

### Design Principles

- Consistency over creativity
- Function before decoration
- Clear visual hierarchy
- Responsive layouts
- Reusable components
- Predictable interactions

---

### Layout Philosophy

Desktop:
- Left navigation
- Top header
- Responsive content area
- Card-based pages

Mobile:
- Collapsible navigation
- Optimized forms
- Touch-friendly controls

---

### User Experience

The interface shall:
- Minimize clicks
- Support keyboard navigation
- Provide inline validation
- Display clear success and error messages
- Avoid modal dialogs unless necessary

---

### Accessibility

The design shall support:
- Keyboard navigation
- Visible focus indicators
- Sufficient color contrast
- Responsive scaling
- Screen reader friendly labels

End of Chapter 1.


---

## Chapter 2 - Color, Typography & Spacing Standards

### Color System

Primary colors shall be configurable from Settings after installation.

System colors:
- Primary
- Secondary
- Success
- Warning
- Error
- Info
- Neutral

Brand colors must automatically propagate across the application.

---

### Typography

Primary Font:
- Inter

Fallback:
- System UI fonts

Weights:
- Regular
- Medium
- Semibold
- Bold

Use consistent heading hierarchy:
- H1
- H2
- H3
- Body
- Caption

---

### Spacing

Base spacing unit:
- 4px

Common spacing:
- 4
- 8
- 12
- 16
- 24
- 32
- 48

---

### Border Radius

Standard radius:
- Small
- Medium
- Large

Apply consistently to:
- Cards
- Inputs
- Buttons
- Dialogs

---

### Shadows

Use subtle elevation only.

Levels:
- None
- Small
- Medium
- Large

---

### Visual Consistency

Do not allow modules to define their own colors, spacing or typography outside the design system.

End of Chapter 2.

---

## Chapter 3 - Layout Standards

### Desktop Layout

Standard layout:
- Left sidebar navigation
- Top header
- Scrollable content area
- Optional right panel for contextual actions

---

### Navigation

Sidebar contains:
- Product logo
- Primary navigation
- Collapse button
- User menu

Active page must be clearly highlighted.

---

### Page Structure

Every page follows:

1. Page title
2. Breadcrumb (optional)
3. Action buttons
4. Filters
5. Content
6. Pagination

---

### Cards

Use cards for:
- Statistics
- Forms
- Details
- Dashboards
- Reports

Cards shall have consistent padding and spacing.

---

### Responsive Breakpoints

Layouts must adapt for:
- Mobile
- Tablet
- Desktop
- Large Desktop

No horizontal scrolling except data tables.

---

### Forms

Public and portal forms use:
- Single-column layout on mobile
- Two-column layout on desktop where appropriate
- Inline validation
- Required field indicators
- Clear helper text

---

### Tables

Tables shall support:
- Sticky headers
- Sorting
- Filtering
- Pagination
- Responsive overflow

End of Chapter 3.

---

## Chapter 4 - UI Components

### Component Philosophy

All UI components shall be reusable, accessible and consistent across every module.

---

### Standard Components

- Buttons
- Text Inputs
- Password Inputs
- Email Inputs
- Selects
- Multi-selects
- Checkboxes
- Radio Buttons
- Toggles
- Date Pickers
- Time Pickers
- Tables
- Cards
- Badges
- Tabs
- Dialogs
- Drawers
- Toast Notifications
- Tooltips
- Progress Indicators
- Empty States

---

### Buttons

Types:
- Primary
- Secondary
- Outline
- Ghost
- Destructive

States:
- Default
- Hover
- Focus
- Disabled
- Loading

---

### Form Controls

All controls must support:
- Labels
- Required indicators
- Helper text
- Inline validation
- Disabled state
- Read-only state

---

### Notifications

Toast notifications:
- Success
- Warning
- Error
- Information

They shall disappear automatically unless user action is required.

---

### Empty States

Every module shall provide meaningful empty-state screens with clear guidance and primary actions.

End of Chapter 4.

---

## Chapter 5 - Form Design Standards

### Form Philosophy

Forms shall prioritize speed, clarity and accuracy.

---

### Layout

- Single-page public request forms
- Logical grouping of fields
- Responsive layout
- Consistent spacing

---

### Validation

Every form shall provide:

- Inline validation
- Required field indicators
- Email format validation
- Numeric validation
- Server-side validation
- Clear error messages

Submission is blocked until validation passes.

---

### Input Behaviour

- Trim leading/trailing spaces
- Preserve valid user input
- Autofocus first invalid field after submission
- Do not clear completed fields after validation errors

---

### Buttons

Primary:
- Submit
- Save
- Confirm

Secondary:
- Cancel
- Back
- Reset (where applicable)

Loading indicators must be shown while processing.

---

### Feedback

Successful actions display:
- Toast notification
- Success message
- Reference number when applicable

Errors display:
- Inline field errors
- Business rule messages
- Generic system error without exposing technical details

---

### Accessibility

Forms shall support:
- Keyboard navigation
- Visible focus states
- Screen reader labels
- Mobile-friendly touch targets

End of Chapter 5.

---

## Chapter 6 - Data Tables & Lists

### Table Principles

Tables shall present large datasets efficiently while remaining readable.

---

### Standard Features

Every primary table shall support:

- Sorting
- Filtering
- Search
- Pagination
- Column resizing (future)
- Export where permitted

---

### Column Standards

- Sticky header
- Consistent alignment
- Truncated long values with tooltip
- Status badges
- Action column as final column

---

### Row Actions

Primary actions:
- View
- Edit
- Assign
- Download
- Delete (where permitted)

Destructive actions require confirmation.

---

### Search

Global search:
- Instant filtering
- Debounced input
- Clear button

---

### Empty Tables

Display:
- Friendly illustration
- Explanation
- Primary action button

---

### Selection

Support:
- Single selection
- Multi-selection
- Select all on current page

Bulk actions appear only when rows are selected.

End of Chapter 6.

---

## Chapter 7 - Navigation & Interaction Standards

### Navigation Principles

Navigation shall remain consistent across every module.

---

### Primary Navigation

The left sidebar contains:
- Logo
- Module navigation
- Collapse control
- User menu

Only modules the user can access are displayed.

---

### Secondary Navigation

Use:
- Tabs
- Breadcrumbs
- Context menus

Avoid nested navigation deeper than two levels.

---

### Interaction Standards

Users shall receive immediate feedback for every action.

Examples:
- Loading indicators
- Success toasts
- Inline validation
- Confirmation dialogs for destructive actions

---

### Keyboard Support

Support:
- Tab navigation
- Enter to submit forms
- Escape to close dialogs
- Arrow keys where appropriate

---

### Responsive Behaviour

Desktop:
- Persistent sidebar

Tablet:
- Collapsible sidebar

Mobile:
- Drawer navigation

---

### Consistency

The same action shall always appear in the same location throughout the application.

End of Chapter 7.

---

## Chapter 8 - Feedback & Status Indicators

### Feedback Philosophy

Every user action shall produce immediate and understandable feedback.

---

### Status Indicators

Use standardized status badges for:
- New
- Pending
- Approved
- Rejected
- Cancelled
- Implemented
- Active
- Inactive
- Expired
- Archived

Status colors must follow the global design system.

---

### Loading States

Display loading indicators for:
- Page loading
- Form submission
- Searches
- Table refresh
- File uploads
- Report generation

Prevent duplicate submissions while processing.

---

### Toast Notifications

Types:
- Success
- Information
- Warning
- Error

Toasts shall be concise and automatically dismiss unless user action is required.

---

### Confirmation Dialogs

Require confirmation for:
- Delete
- Discard
- Restore
- Cancel Request
- Backup Restore
- System Updates

Dialogs must clearly explain the consequence.

---

### Error Presentation

Errors shall be:
- Human-readable
- Actionable
- Non-technical

Internal exception details must never be displayed.

End of Chapter 8.

---

## Chapter 9 - Icons, Branding & Visual Identity

### Branding

Branding is configurable after first installation.

Configurable items:
- Company name
- Primary logo
- Secondary logos
- Brand colors
- Login background
- PDF logos
- Email header logo

---

### Logo Usage

Support:
- Single logo
- Multiple logos for generated documents
- Company-specific branding

Generated documents such as handover forms and access forms may display multiple logos.

---

### Icons

Use a single icon library consistently throughout the application.

Icons shall:
- Represent actions clearly
- Maintain consistent sizing
- Include accessible labels where appropriate

---

### Visual Identity

Every generated PDF, email and printable document shall inherit the configured branding.

Branding changes affect future generated documents only.

---

### Theme Consistency

Custom branding must never affect:
- Layout
- Component spacing
- Typography
- Accessibility
- Validation styling

End of Chapter 9.

---

## Chapter 10 - Accessibility & Internationalization

### Accessibility

Axivo shall comply with modern accessibility practices.

Requirements:
- Keyboard navigation
- Visible focus indicators
- ARIA labels where appropriate
- Screen reader compatibility
- Sufficient color contrast
- Scalable text without layout breakage

---

### Form Accessibility

Every input shall include:
- Associated label
- Required indicator
- Error association
- Helper text where needed

---

### Internationalization

The application shall be designed for future multilingual support.

Requirements:
- Externalized UI strings
- UTF-8 throughout
- Locale-aware date, time and number formatting
- Configurable timezone

---

### Responsive Accessibility

All interactive controls shall remain usable on:
- Desktop
- Tablet
- Mobile

Touch targets shall be appropriately sized.

---

### Acceptance Criteria

- No keyboard traps
- All forms operable without a mouse
- Error messages announced to assistive technologies where applicable

End of Chapter 10.

---

## Chapter 11 - UI Quality Standards & Acceptance Criteria

### UI Quality Principles

Every screen in Axivo shall follow the Design System without exception.

---

### Consistency Requirements

All modules shall use:
- Shared components
- Shared spacing
- Shared typography
- Shared colors
- Shared icons
- Shared validation patterns

---

### Performance

The UI shall:
- Render efficiently
- Avoid unnecessary re-renders
- Lazy load large datasets
- Display loading states consistently

---

### User Experience

Users shall always understand:
- Where they are
- What action is required
- Whether an action succeeded
- How to recover from errors

---

### Acceptance Criteria

The Design System is accepted when:

- Every module follows the same visual language.
- Forms use inline validation.
- Responsive layouts work across supported devices.
- Accessibility requirements are met.
- Branding updates apply consistently.
- Navigation remains predictable.
- Component reuse is enforced.

## End of Document 03.

---

## Chapter 12 - Design Governance

### Governance

The Design System is the single source of truth for all user interfaces.

No module may introduce custom components, spacing, colors, typography or interaction patterns that conflict with this document without an approved design revision.

---

### Change Management

Design changes must document:
- Reason
- Impacted components
- Impacted modules
- Migration requirements
- Version

---

### Component Lifecycle

Every shared component shall have:
- Owner
- Documentation
- Examples
- Accessibility review
- Version history

Deprecated components shall remain supported until replaced across all modules.

---

### Review Process

Every new screen shall be reviewed for:
- Consistency
- Accessibility
- Responsiveness
- Performance
- Security-related UI behaviour
- Reuse of existing components

---

### Completion Criteria

Document 03 is complete when:
- All UI standards are defined.
- Branding behaviour is finalized.
- Accessibility requirements are documented.
- Component reuse rules are established.
- Governance process is defined.

## End of Document 03.