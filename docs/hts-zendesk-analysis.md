# HourTimesheet Zendesk Ticket Pattern Analysis
## Comprehensive Support Issue & Automation Strategy Document

**Document Version:** 1.0
**Date Created:** 2026-03-19
**Product:** HourTimesheet (DCAA-Compliant Timekeeping)
**Analysis Scope:** Support patterns, automation candidates, escalation triggers
**Reference Issue:** GitHub #93

---

## Executive Summary

This document provides a comprehensive analysis of expected support ticket patterns for HourTimesheet, a DCAA-compliant timekeeping solution serving government contractors. Analysis is based on:

- Product domain knowledge (DCAA compliance, $8/user/month SaaS model)
- Integration ecosystem (QuickBooks Desktop, QuickBooks Online, ADP)
- User research from Capterra, G2, and industry documentation
- Government contractor timekeeping compliance requirements
- Common DCAA audit findings and failure patterns

The analysis identifies 20 primary issue categories ranked by estimated frequency, provides resolution playbooks for each, and indicates which issues can be fully automated versus those requiring human intervention.

---

## Part 1: Top 20 Estimated Issue Categories
### Ranked by Likely Frequency

| Rank | Category | Est. % of Tickets | Severity | Human Req'd |
|------|----------|------------------|----------|------------|
| 1 | QuickBooks Sync/Integration Failures | 12-15% | High | Yes |
| 2 | Timesheet Approval Workflow Confusion | 10-12% | High | Yes |
| 3 | Incorrect Charge Code/Project Assignment | 8-10% | High | Yes |
| 4 | Login/Authentication Issues | 6-8% | Medium | Partial |
| 5 | Mobile App Time Entry Problems | 5-7% | Medium | Partial |
| 6 | ADP Payroll Export Errors | 5-6% | High | Yes |
| 7 | User Role/Permission Configuration | 5-6% | Medium | Partial |
| 8 | Data Import/Setup Issues | 4-5% | Medium | Partial |
| 9 | Audit Trail/Compliance Reporting Questions | 4-5% | High | Yes |
| 10 | Timesheet Lock/Freeze Date Issues | 3-4% | Medium | Partial |
| 11 | Historical Timesheet Edits/Corrections | 3-4% | High | Yes |
| 12 | Supervisor Bulk Approval Workflows | 3-4% | Medium | Yes |
| 13 | Report Generation/Performance Issues | 3-4% | Low | Partial |
| 14 | Leave/PTO Tracking Configuration | 3-4% | Medium | Partial |
| 15 | Multi-level Signature/Approval Chains | 2-3% | Medium | Yes |
| 16 | Billable Hours/Service Item Mapping | 2-3% | High | Yes |
| 17 | Browser Compatibility/Cache Issues | 2-3% | Low | Automated |
| 18 | API/Webhook Configuration Problems | 2-3% | Medium | Yes |
| 19 | Compliance Documentation/Certification | 2-3% | High | Yes |
| 20 | Feature Enhancement Requests/Feedback | 2-3% | Low | Automated |

**Notes on Ranking:**
- Percentages reflect expected distribution based on integration complexity, regulatory requirements, and user feedback
- "Human Req'd" column indicates whether issue requires human judgment vs. automated resolution
- Top 5 categories account for ~40-45% of expected ticket volume
- Integration-related issues (ranks 1, 6, 16) form ~19-24% of total tickets

---

## Part 2: Resolution Playbooks

### Category 1: QuickBooks Sync/Integration Failures
**Estimated Frequency:** 12-15% of tickets
**Severity:** High
**Automation Level:** Partial

#### Symptoms
- Timesheets in HourTimesheet not appearing in QuickBooks
- Time data exported from HTS but not importing to QB
- Error messages related to Web Connector
- Duplicate entries appearing in QuickBooks
- Sync stopping mid-process without completion

#### Root Cause Categories
1. **Web Connector Configuration Issues** (35% of cases)
   - "Allow this application to read and modify this company file" unchecked
   - "Allow this application to log in automatically" unchecked
   - Incorrect admin password in Web Connector

2. **QuickBooks Company Settings** (30% of cases)
   - "Track Time?" preference not enabled in QB File
   - Time & Expense tracking disabled
   - Multi-user mode conflicts

3. **Employee Configuration** (20% of cases)
   - Employee not set to "Use Time Data to Create Paychecks" in QB
   - Employee username mismatches between systems
   - Duplicate employee records in QB

4. **Data Integrity Issues** (15% of cases)
   - Billable hours marked without Service Item selected
   - Project/Customer missing in QB master data
   - Invalid charge codes in HTS not defined in QB

#### Resolution Playbook

**Step 1: Triage & Information Gathering** (Automated prompt)
- Ask user to provide: Error message (exact text), when sync last worked, which records affected
- Get screenshot of error if available
- Determine QB version (Desktop vs. Online vs. Cloud)

**Step 2: Quick Fix Checklist** (Guided automation with verification)
- [ ] User confirms QB company file is open in single-user mode (if Desktop)
- [ ] User confirms they have admin access to both QB and HTS
- [ ] User verifies "Track Time?" is checked: QB Edit > Preferences > Time & Expense
- [ ] User confirms Web Connector service is running (if Desktop)
- [ ] User verifies Web Connector password matches QB admin password

**Step 3: Deep Diagnostics** (Requires human tech support)
- Log into user's HTS account (with permission) to check sync settings
- Verify QB Web Connector configuration on user's machine
- Check HTS audit trail for failed sync attempts with error codes
- Review user's employee master records for inconsistencies

**Step 4: Resolution Implementation**
- For config issues: Provide step-by-step screenshots showing correct settings
- For password issues: Guide password reset process
- For data issues: Identify specific problematic records and advise correction method
- For employee setup: Create template showing correct configuration for bulk employee setup

**Step 5: Verification & Prevention**
- Have user run sync test with small sample (single employee, single day)
- Review sync logs in HTS to confirm success
- Document any workarounds applied
- Schedule follow-up in 48 hours to confirm ongoing stability

#### Automated Response Template
```
Thank you for reporting your QuickBooks sync issue. I'm here to help you
get this resolved quickly.

To get started, please provide:
1. The exact error message you're seeing
2. When the sync last worked successfully
3. Your QuickBooks version (Desktop, Online, or Cloud)
4. How many records are affected

While you gather that info, please also verify:
- QB "Track Time?" is enabled (Edit > Preferences > Time & Expense)
- Web Connector password matches your QB admin password
- QB file is in single-user mode

Reply with the above and I'll identify the root cause!
```

---

### Category 2: Timesheet Approval Workflow Confusion
**Estimated Frequency:** 10-12% of tickets
**Severity:** High
**Automation Level:** Partial

#### Symptoms
- Supervisor claims timesheet doesn't need approval but it does
- Employee doesn't understand why timesheet is "stuck" in submitted state
- Manager trying to approve timesheets but action not working
- Confusion about what "Submitted" vs. "Approved" status means
- Questions about multi-level approval process

#### Root Cause Categories
1. **Workflow Status Misunderstanding** (40% of cases)
   - User doesn't understand DCAA requires employee signature + supervisor approval
   - Confusion between "Submitted" (signed by employee) and "Approved" (reviewed + signed by supervisor)
   - Not realizing approval is mandatory, not optional

2. **Configuration Errors** (35% of cases)
   - Approval requirement not properly configured during setup
   - Supervisor role not assigned to manager accounts
   - Multi-level signature chain set up incorrectly

3. **Workflow Bottlenecks** (15% of cases)
   - Supervisor out on leave or not checking timesheets
   - Bulk approval workflow bypassing individual review (DCAA risk)
   - Multiple approval chains causing delays

4. **System Glitches** (10% of cases)
   - Approve button not appearing for user
   - After clicking approve, status doesn't update
   - Signature row not saving

#### Resolution Playbook

**Step 1: Clarify User Role & Responsibility**
- Confirm whether user is employee, supervisor, or admin
- Explain DCAA requirement: Employee signature required daily, supervisor review/approval required per pay period
- State clearly: Submission ≠ Approval. Both are required for DCAA compliance.

**Step 2: Verify Workflow Configuration** (Admin check)
- Confirm approval workflow is enabled for organization
- Verify supervisors have correct role assignment
- Check if multi-level signatures are configured and required
- Review who has authority to approve which timesheets

**Step 3: Guide User Through Approval Process**
- For supervisors: Navigate to Timesheets > [Employee Name] > [Period]
- Verify timesheet is in "Submitted" status
- Review key fields: hours by charge code, total hours, employee signature date
- Click "Approve" button and select/enter supervisor signature
- Confirm status changes to "Approved"

**Step 4: Address Compliance Concerns** (If bulk approval observed)
- Alert: Bulk "Approve All" button must not bypass individual review
- DCAA requires supervisor to verify each timesheet's accuracy, charge codes, and hours
- Provide guidance: Review → Approve process, not auto-approve
- Document as coaching/training issue, not support ticket

**Step 5: Prevention & Training**
- Provide link to "Timesheet Approval" knowledge base article
- Recommend admin schedule brief training for all supervisors on approval process
- Send supervisor checklist: What to verify before approving each timesheet

#### Automated Response Template
```
Thank you for your question about timesheet approvals.

Let me clarify the process:

**For Employees:**
Your timesheet becomes "Submitted" when you sign it at the end of the pay period.
Your supervisor then reviews and approves it (required for DCAA compliance).
Both steps must be completed before payroll can process your hours.

**For Supervisors:**
Navigate to Reports > Timesheet Approval to see pending timesheets.
For each employee's timesheet, review:
  - Hours charged to correct projects/codes
  - Total hours match expected work schedule
  - Any corrections properly noted
Then click "Approve" and provide your signature.

**For Admins:**
Approval workflow status: [Enabled/Disabled]
Your supervisors have approval authority: [Yes/No]

Need more details? I'm here to help clarify the process.
```

---

### Category 3: Incorrect Charge Code/Project Assignment
**Estimated Frequency:** 8-10% of tickets
**Severity:** High
**Automation Level:** Partial

#### Symptoms
- Employee charges time to wrong project/contract
- Hours assigned to wrong labor category (direct vs. indirect)
- Mixed charges on single timesheet across multiple projects
- Supervisor realizes error after approval
- DCAA audit identifies charge code compliance failures

#### Root Cause Categories
1. **Employee Confusion** (40% of cases)
   - Too many similar project codes to choose from
   - Unclear which projects they're authorized to work on
   - Don't understand direct vs. indirect cost categories
   - Limited visibility into project details (scope, code, labor category rules)

2. **System Access Issues** (30% of cases)
   - Employee can see ALL projects instead of only assigned ones
   - No permission restrictions on charge code selection
   - Project master data incomplete/unclear
   - Charge code descriptions too cryptic or vague

3. **Workflow/Review Gaps** (20% of cases)
   - Supervisor doesn't catch the error during approval
   - No validation that hours match employee's project assignments
   - Historical corrections not properly tracked

4. **Configuration Problems** (10% of cases)
   - Project/charge codes not properly set up in system
   - Labor category rules not defined
   - Project assignments not properly linked to employees

#### Resolution Playbook

**Step 1: Identify the Error**
- Ask: Which project/code was used incorrectly?
- Get: Affected date range, hours involved, correct code that should have been used
- Determine: How many employees affected? Single incident or widespread issue?

**Step 2: Assess Impact** (Requires judgment)
- Is this a billing/invoice issue? (affects customer/government)
- Is this a compliance issue? (affects DCAA audit trail)
- Single employee error vs. training/system design issue
- Is timesheet already approved/submitted to payroll?

**Step 3: Correct the Records**
- For unapproved timesheets: Employee or supervisor edits directly
- For approved timesheets: May require admin correction with audit trail documentation
- Ensure change reason is captured: "Correction: wrong charge code selected"
- Maintain full audit trail per DCAA requirements

**Step 4: Root Cause Diagnosis** (Requires human analysis)
- Review this employee's other timesheets: is this a pattern?
- Interview employee: Did they understand which projects to work on?
- Check supervisor notes: Did they catch the error? Why not?
- Examine system configuration: Are permission restrictions working?

**Step 5: Prevention Implementation**
- **If employee training issue:** Schedule 1:1 walkthrough of correct project assignments
- **If system access issue:** Restrict employee's project dropdown to only assigned projects (config change)
- **If supervisor oversight:** Provide supervisor with checklist of items to verify before approval
- **If data quality issue:** Audit and correct project master data (codes, descriptions, labor categories)

**Step 6: Forward Prevention**
- For widespread issues: Send org-wide guidance on charge code usage
- For systemic problems: Escalate to product team for feature improvement (e.g., project restriction settings)

#### Automated Response Template
```
I can help you correct the charge code issue.

To get started, please tell me:
1. Which employee's timesheet has the error?
2. What code was used (incorrect)?
3. What code should have been used (correct)?
4. What dates are affected?
5. Has this timesheet been approved and sent to payroll?

Once I have these details, I'll help you:
- Correct the affected hours
- Document the change for DCAA audit trail
- Identify why the error occurred
- Prevent similar errors in the future
```

---

### Category 4: Login/Authentication Issues
**Estimated Frequency:** 6-8% of tickets
**Severity:** Medium
**Automation Level:** Mostly Automated

#### Symptoms
- "Invalid username or password" message
- "Your account has been locked"
- Password reset link not arriving
- "You do not have permission to access this organization"
- MFA/Two-factor authentication not working
- Browser not accepting credentials

#### Root Cause Categories
1. **Password Issues** (45% of cases)
   - Incorrect password (user forgot, mistyped, caps lock on)
   - Password expired (not renewed)
   - Account locked after multiple failed attempts
   - User trying old password after reset

2. **Account/Org Configuration** (25% of cases)
   - User account disabled or deactivated
   - User removed from organization
   - User assigned to wrong organization
   - Account never properly provisioned

3. **Technical Issues** (20% of cases)
   - Browser cookies/cache preventing login
   - Outdated browser version
   - JavaScript disabled
   - Corporate network/firewall blocking authentication server
   - MFA not properly set up or device lost

4. **Email/Reset Issues** (10% of cases)
   - Password reset email going to spam
   - User email address changed but not updated in system
   - Password reset link expired

#### Resolution Playbook

**Step 1: Immediate Verification** (Automated)
- Confirm user email address is correct
- Verify account is active in system
- Check: Is user assigned to correct organization?
- Confirm: User role and permissions

**Step 2: Try Simple Fixes** (Guided self-service)
- Verify Caps Lock is OFF
- Clear browser cookies and cache (provide instructions by browser)
- Try private/incognito browser window
- Try different browser
- Try different device/computer
- Verify account hasn't been locked (show unlock option if needed)

**Step 3: Password Reset** (Automated with human fallback)
- Offer password reset link
- Send to verified email address
- Provide link validity time window (usually 24 hours)
- If user can't access email, require identity verification

**Step 4: MFA Troubleshooting** (Requires human)
- Verify MFA is enabled on account
- If user has new phone: provide recovery codes or account unlock process
- Re-send MFA setup instructions
- If needed: admin can temporarily disable MFA with verification

**Step 5: Account Access Verification** (Human judgment)
- If multiple failed attempts: confirm user identity before unlocking
- Security questions or verified phone number
- Admin review of account changes/recent activity
- Escalate if suspicious activity detected

#### Automated Response Template (Tier 1)
```
I can help you regain access to your HourTimesheet account.

Let's start with the basics:

1. **Browser:** Try these steps first:
   - Press Ctrl+Shift+Delete (Windows) or Cmd+Shift+Delete (Mac)
   - Clear "Cookies and cached files" for "All time"
   - Close browser completely and reopen
   - Try logging in again

2. **Password:** If you don't remember your password:
   - Go to login page
   - Click "Forgot Password?"
   - Check your email for reset link
   - Click link and create new password

3. **Still blocked?** Let me know:
   - What error message do you see?
   - Which organization are you trying to access?

I'm ready to help with the next step!
```

---

### Category 5: Mobile App Time Entry Problems
**Estimated Frequency:** 5-7% of tickets
**Severity:** Medium
**Automation Level:** Partial

#### Symptoms
- Mobile app crashes when entering hours
- Time entries saved in app but not syncing to web
- GPS/location tracking not working
- App saying "offline" when user has internet
- Entries disappearing after submission
- "Insufficient permissions" error on mobile

#### Root Cause Categories
1. **Sync/Network Issues** (40% of cases)
   - App in offline mode, not automatically reconnecting
   - Poor network connection during sync attempt
   - App cached data conflicting with server
   - User didn't wait for sync to complete before closing app

2. **App Version/Platform Issues** (30% of cases)
   - Outdated mobile app version
   - iOS vs. Android discrepancies
   - OS version incompatibility (too old OS)
   - App not updated despite available updates

3. **Permissions/Configuration** (20% of cases)
   - Location services disabled in OS settings
   - App permissions not granted in OS (location, camera, etc.)
   - Employee not assigned to be mobile app user
   - Mobile device not registered/enrolled

4. **Data Conflicts** (10% of cases)
   - Duplicate entries from multiple sync attempts
   - Mobile entry conflicts with web entry for same period
   - Corruption in local device cache

#### Resolution Playbook

**Step 1: Verify Mobile Setup** (Automated)
- Confirm user has official HourTimesheet mobile app installed (Apple App Store/Google Play)
- Check app version number (provide current version)
- Verify user's OS version meets minimum requirements

**Step 2: Basic Troubleshooting** (Guided self-service)
- Force close app: Settings > Apps > HourTimesheet > Force Stop
- Clear app cache: Settings > Apps > HourTimesheet > Storage > Clear Cache
- Verify network connection: WiFi or cellular, test other apps
- Reopen app and attempt time entry
- Wait 30-60 seconds for sync indicator to complete

**Step 3: Device & Permissions Check** (Guided)
- Verify location services enabled (if app uses GPS): Settings > Location > ON
- Check app permissions: Settings > Apps > HourTimesheet > Permissions > Review all
- Grant necessary permissions: Location (if required), Camera (for photo), Contacts, etc.
- Restart device if permissions were changed

**Step 4: App Update** (Guided)
- Open app store (Apple App Store or Google Play)
- Search for "HourTimesheet"
- If "Update" button appears, tap it
- Wait for update to complete
- Reopen app and retry

**Step 5: Sync Verification** (Requires human)
- Ask user to check: web version of HTS shows entry?
- If yes: Problem is just mobile display lag, no action needed
- If no: Entry wasn't sent to server, may need to re-enter
- Check user's permissions: Can this user submit time entries?

**Step 6: Advanced Troubleshooting** (Requires tech support)
- Log into HTS admin to verify this employee can use mobile
- Check device registration/enrollment status
- Review app logs for sync errors
- If persistent: may need to reinstall app entirely
- Last resort: Have user enter time via web browser instead

#### Automated Response Template
```
Let me help you troubleshoot your HourTimesheet mobile app.

**Quick Fix (takes 2 minutes):**
1. Go to Settings > Apps > HourTimesheet
2. Tap "Force Stop"
3. Tap "Storage" > "Clear Cache"
4. Reopen the app
5. Try entering your time again

**Check These Too:**
- Is your app up to date? Check app store for "Update" button
- Do you have WiFi or cellular connection?
- Is location services enabled if you're using GPS check-in?

**Verify Your Entry Saved:**
- Open the web version of HourTimesheet on your computer
- Do you see the hours you entered on mobile?

Let me know what happens after you try these steps, and I'll
help with the next level of troubleshooting if needed!
```

---

### Category 6: ADP Payroll Export Errors
**Estimated Frequency:** 5-6% of tickets
**Severity:** High
**Automation Level:** Partial

#### Symptoms
- ADP export file created but won't import into ADP
- Error message during ADP payroll import process
- Hours missing from ADP after HTS export
- ADP says "Rate Code" or "Employee ID" error
- "Once export to QB is run, ADP export no longer available" message
- Hours exported to QB but need to go to ADP instead

#### Root Cause Categories
1. **Export Configuration Issues** (35% of cases)
   - Wrong payroll system selected in HTS export settings
   - Employee not configured for ADP export
   - CSV file format incorrect for ADP import
   - Export template mismatched to ADP version

2. **Employee Setup Mismatches** (30% of cases)
   - Employee ID in HTS doesn't match ADP employee ID
   - Rate code in HTS not recognized in ADP
   - Employee missing "Use time data for payroll" setting in HTS
   - Labor category doesn't have ADP rate code mapped

3. **Data Quality Issues** (20% of cases)
   - Negative hours or rounding errors
   - Billable vs. non-billable hours misconfigured
   - PTO/Leave codes not mapped correctly to ADP
   - Hours exceed maximum allowable (over 168/week)

4. **Workflow/Sequencing Issues** (15% of cases)
   - Exported to QB first, now can't export to ADP
   - Multiple exports in same pay period creating duplicates
   - Missing approval before export attempt
   - Export file lost or not downloaded properly

#### Resolution Playbook

**Step 1: Confirm Export Configuration** (Automated)
- Which payroll system does user need to export to: ADP or QB?
- Has user already exported to QB this period? (If yes, ADP may be locked)
- Are there multiple pay periods being exported? (Export must be single period)
- Confirm user has admin role to perform export

**Step 2: Verify Employee Configuration** (Requires human)
- Check user's HTS employee master records
- Verify each employee has:
  - Correct Employee ID that matches ADP
  - "Use Time Data for Payroll" checkbox enabled
  - Correct ADP labor category/cost code assigned
  - Rate codes mapped correctly

**Step 3: Review Export Settings** (Requires human)
- Login to HTS as admin
- Navigate to Export/Payroll Settings
- Confirm "ADP" is selected from dropdown (not QB)
- Verify CSV template format matches ADP version/requirements
- Check date range: single pay period only, all timesheets approved

**Step 4: Generate Test Export** (Requires human)
- Export with single employee first to test
- Review CSV file contents:
  - Employee IDs match ADP system
  - Hours populated correctly
  - Rate codes match ADP's expected values
  - No negative or invalid data
- If test exports cleanly, proceed with full export

**Step 5: Verify ADP Import** (Requires human or user with ADP access)
- User logs into ADP RUN interface
- Navigate to Home > Time Sheet > Time Sheet Import
- Upload the CSV file from HTS
- Check for error messages from ADP validation
- Review warnings: Note any fields flagged as mismatches
- Resolve errors (usually employee ID or rate code issues)

**Step 6: Fix & Re-export** (Requires human analysis)
- Identify which employees/hours caused errors
- Return to HTS and correct data (employee IDs, rate codes, etc.)
- Mark affected timesheets for re-export
- Export again and re-attempt ADP import
- Once successful, remove from re-export queue

#### Automated Response Template
```
I can help you export your timesheet hours to ADP correctly.

**First, let me confirm your setup:**
1. Which payroll system: ADP or QuickBooks?
   (Note: You can only export to ONE per pay period)
2. Have you already exported to QB this period? Yes/No
3. Are all employee timesheets approved and ready?

**Once confirmed, I'll help you:**
1. Verify employee IDs match between HTS and ADP
2. Check ADP rate codes are set up correctly
3. Generate your export file
4. Walk you through ADP import process
5. Troubleshoot any ADP import errors

Please reply with answers to the questions above!
```

---

### Category 7: User Role/Permission Configuration
**Estimated Frequency:** 5-6% of tickets
**Severity:** Medium
**Automation Level:** Partial

#### Symptoms
- User says "I can't see timesheets for my team"
- New employee can't log hours after being added
- Supervisor can't approve timesheets for assigned staff
- "You do not have permission to access..." error
- Admin trying to edit timesheet but getting "insufficient permissions"
- Manager sees all employees instead of only their assigned team

#### Root Cause Categories
1. **Role Assignment Errors** (40% of cases)
   - User assigned wrong role (employee vs. supervisor vs. admin)
   - Role created but not assigned to user
   - Multiple conflicting roles assigned
   - Role name similar but different from intended (Supervisor vs. Team Lead)

2. **Approval Chain Configuration** (25% of cases)
   - Supervisor not marked as approver for employees
   - Manager-to-employee relationship not established in system
   - Hierarchical chain of command not configured correctly
   - Multiple supervisors assigned but approval routing unclear

3. **Project/Team Assignment** (20% of cases)
   - Employee not assigned to any project/team
   - Supervisor assigned but employees under them not linked
   - Team membership not synchronized with org chart
   - Department or business unit boundaries misconfigured

4. **System Glitches** (15% of cases)
   - Permission cache not cleared after change
   - Role change not applied to existing sessions
   - API/sync error prevented permission update
   - Session token expired requiring re-login

#### Resolution Playbook

**Step 1: Identify User & Problem** (Automated)
- Which user is experiencing the permission issue?
- What action are they trying to do?
- What error message do they see?
- When was user added/role changed?

**Step 2: Verify Role Assignment** (Requires human - admin level)
- Login to HTS as admin
- Navigate to Users or Organization > User Management
- Find the affected user
- Confirm current role: Employee / Supervisor / Admin / etc.
- Is this the correct role for their job function?

**Step 3: Check Approval Chain** (Requires human - admin level)
- For supervisors: Verify they're assigned as approvers
- Check which employees are mapped under them for approval
- Confirm organizational hierarchy is correct
- If using multi-level approvals: verify chain is configured

**Step 4: Verify Project/Team Assignment** (Requires human)
- Confirm employee is assigned to required projects/teams
- Check supervisor is assigned as team lead/manager for the group
- Verify project visibility matches business needs
- For time entry: confirm employee can see projects they work on

**Step 5: Clear Cache & Re-test** (Guided self-service)
- Ask user to log out completely
- Clear browser cookies for hourtimesheet.com domain
- Close browser completely
- Reopen browser and log back in
- Attempt the action again

**Step 6: Provision Correctly** (Requires human implementation)
- If brand new user: walk through complete provisioning checklist
  - [ ] Account created with correct email
  - [ ] Role assigned: Employee/Supervisor/Admin
  - [ ] Projects assigned (which ones can they see/access)
  - [ ] If supervisor: assign employees under them
  - [ ] If mobile user: enable mobile app access
  - [ ] Password set or reset link sent
- Document any permission changes in ticket for audit trail

#### Automated Response Template
```
I'll help you resolve your permission issue.

To get started, please tell me:
1. What are you trying to do? (view timesheets, approve timesheets, edit data, etc.)
2. What error message do you see?
3. When was your account created or last changed?
4. What is your job title/role?

I may also need to:
- Verify your user account settings in our system
- Check your assigned projects and team memberships
- Confirm your approval authority

An admin will reach out if we need to make configuration changes
to give you the right access level.
```

---

### Category 8: Data Import/Setup Issues
**Estimated Frequency:** 4-5% of tickets
**Severity:** Medium
**Automation Level:** Partial

#### Symptoms
- Customer trying to import employee data but getting errors
- QuickBooks data not importing to HTS
- CSV import fails with validation errors
- Bulk employee upload rejected
- Historical timesheet data lost in migration
- Initial setup taking longer than expected

#### Root Cause Categories
1. **File Format Issues** (35% of cases)
   - CSV file has incorrect column headers
   - Data types wrong (text instead of number, etc.)
   - Special characters causing encoding problems
   - BOM (Byte Order Mark) issues with UTF-8 files
   - Excel formulas not converting to values

2. **Data Validation Failures** (30% of cases)
   - Employee IDs don't match required format
   - Email addresses invalid or duplicated
   - Department/labor category not in system yet
   - Required fields left blank
   - Data exceeds field length limits

3. **QuickBooks Sync Issues** (20% of cases)
   - QB data export format incompatible
   - QB Web Connector not configured for import
   - Company preferences not set in QB before import
   - Version mismatch between QB and HTS

4. **Process/Setup Confusion** (15% of cases)
   - User attempting to import wrong file type
   - Multiple imports creating duplicates
   - Data precedence unclear (which import overwrites which)
   - Historical data recovery not supported after import

#### Resolution Playbook

**Step 1: Identify File & Import Type** (Automated)
- What are you trying to import: Employees, Projects, QB data, Timesheets?
- What format is the file: CSV, Excel, QB export, other?
- How many records: single, dozens, hundreds, thousands?
- Is this first-time setup or updating existing data?

**Step 2: Validate File Format** (Guided + human review)
- If CSV: Provide template showing correct column headers
- If Excel: User should export as CSV with UTF-8 encoding
- If QB: Confirm Web Connector is set up and QB file is open
- Have user describe the file structure they're using

**Step 3: Review Sample Data** (Requires human)
- Ask user to share first 2-3 rows of their file (anonymized if needed)
- Check: column names, data types, special characters, blank fields
- Identify any format mismatches
- Provide corrected template if needed

**Step 4: Check System Prerequisites** (Requires human)
- For employee import: Are required fields defined in HTS? (department, labor category)
- For QB import: Is QB file set up and Web Connector configured?
- For project import: Do labor categories exist in system already?
- For legacy data: Is there enough context to map historical records?

**Step 5: Guided Import Process** (Requires human supervision)
- Walk user step-by-step through import interface
- Confirm file is attached/selected
- Show preview of what will be imported
- Highlight any warnings or data issues
- Get user to confirm before executing import
- Monitor import for errors

**Step 6: Post-Import Validation** (Requires human review)
- Check record count: does HTS show all expected records imported?
- Spot-check data: random sample of 5-10 records to verify accuracy
- Verify links: employees linked to correct projects/departments
- Confirm no duplicates created
- Identify any records that failed/were skipped

**Step 7: Issue Resolution** (Varies by error type)
- For duplicates: Advise which to delete and how
- For partial failures: Identify failed records and why
- For format issues: Provide corrected file or manual re-entry
- For QB issues: Diagnose Web Connector or company settings problems

#### Automated Response Template
```
I can help you import your data into HourTimesheet.

**Tell me about your import:**
1. What are you importing: Employees / Projects / QB Data / Timesheets?
2. What file format: CSV / Excel / QB Export / Other?
3. How many records: (approximately)
4. Is this first-time setup or updating existing data?

**While you prepare to answer:**
- Download our [Import Template for Your Data Type]
- Use this template to format your file
- Export as CSV (if using Excel)
- Save with UTF-8 encoding

**Next Steps:**
Once you've formatted your file and shared it with me, I'll:
1. Review for any data format issues
2. Perform a test import with sample data
3. Walk you through the full import process
4. Verify all records imported correctly

Ready to get started? Share your file details!
```

---

### Category 9: Audit Trail/Compliance Reporting Questions
**Estimated Frequency:** 4-5% of tickets
**Severity:** High
**Automation Level:** Partial

#### Symptoms
- User asks "How do I show the audit trail to our auditor?"
- Questions about what changes are tracked/logged
- Request for compliance reports for government audits
- Uncertainty about DCAA audit preparation
- Questions about timesheet change documentation
- Need to export audit data for regulatory review

#### Root Cause Categories
1. **Audit Trail Visibility Issues** (40% of cases)
   - User doesn't know where to find audit trail in system
   - Audit reports not being generated/exported
   - Incomplete change history showing
   - Confusion about what constitutes the "audit trail"

2. **DCAA Compliance Uncertainty** (35% of cases)
   - Organization preparing for DCAA audit and needs guidance
   - Questions about what HTS tracks per DCAA requirements
   - Concerns about whether audit trail is sufficient
   - Need documentation to show auditors

3. **Export/Reporting Gaps** (15% of cases)
   - Audit trail can be viewed but not easily exported
   - Reports don't show required fields for government audits
   - Time period filtering not working in audit reports
   - Difficulty generating reports for specific projects/employees

4. **Change Documentation** (10% of cases)
   - Questions about how changes to timesheets are logged
   - Concern that changes might not be properly documented
   - Need to show WHO changed WHAT and WHEN
   - Uncertainty about change reason capture

#### Resolution Playbook

**Step 1: Understand Audit Need** (Automated)
- Are you preparing for: Internal audit, DCAA audit, customer audit, or other?
- What time period needs to be covered?
- What specific information do you need to show auditors?
- Who is your audit audience (government agency, internal team, external auditor)?

**Step 2: Explain HTS Audit Trail Capabilities** (Guided education)
- HourTimesheet captures per DCAA requirements:
  - Every timesheet entry (hours, project code, labor category)
  - Employee daily recording and signature
  - Supervisor review and approval
  - ALL changes to timesheets with: username, timestamp, reason, old value, new value
  - IP address and user ID for each action
- Audit trail is permanent and cannot be deleted
- Changes require documented reason (DCAA requirement)

**Step 3: Generate Audit Reports** (Guided + human support)
- Guide user to Reports > Audit Trail (or similar menu)
- Show filtering options: date range, user, employee, project, change type
- Generate sample report to show what information is available
- Explain each column: what it represents, how auditors use it
- Show how to export to Excel/PDF for auditor review

**Step 4: Prepare Audit Documentation** (Requires human consultation)
- Ask: What specific areas is your auditor questioning?
- Identify which HTS features/reports will address each concern
- Create audit response packet:
  - System configuration summary (approval workflows, role structure)
  - Sample audit trail reports covering key areas
  - Policy documentation (who approves, how changes are handled)
  - Screenshots showing controls/restrictions in place
- Address specific DCAA areas if applicable

**Step 5: Preempt Audit Findings** (Requires expert analysis)
- Review organization's typical timesheet patterns
- Look for: timesheets submitted days after work, bulk approvals, excessive changes
- Identify any compliance risk areas
- Recommend corrective actions before audit
- Document that issues were identified and corrected

**Step 6: Provide Auditor-Ready Documentation** (Requires professional support)
- Generate comprehensive audit response:
  - System overview document
  - Control summary (who can do what, limits/restrictions)
  - Sample audit trail data for representative period
  - Compliance checklist showing how HTS meets DCAA requirements
  - Contact info for auditor technical questions
- Offer direct auditor support call if needed

#### Automated Response Template
```
I can help you prepare your HourTimesheet records for audit review.

**First, let me understand your audit:**
1. Which audit: DCAA / Internal / Customer / Other?
2. What time period: (specific dates needed?)
3. What is the auditor focusing on? (compliance, specific projects, etc.)

**HourTimesheet's Audit Trail includes:**
✓ Every timesheet entry with user, date, time
✓ All changes with WHO made it, WHEN, and WHY
✓ Employee signatures and supervisor approvals
✓ IP addresses and user IDs for every action
✓ Complete history that cannot be deleted

**I can provide you with:**
1. Audit trail reports for your requested date range
2. System control documentation
3. Compliance checklist showing DCAA alignment
4. Training for you or your auditor

What specific areas is your auditor questioning?
That will help me prepare the most relevant documentation.
```

---

### Category 10: Timesheet Lock/Freeze Date Issues
**Estimated Frequency:** 3-4% of tickets
**Severity:** Medium
**Automation Level:** Partial

#### Symptoms
- Employee trying to enter time but timesheet is "locked"
- Pay period frozen but manager needs to make corrections
- Question: "When does the timesheet lock?"
- Unable to edit historical timesheet after cutoff
- Supervisor needs to reopen a closed timesheet period
- Uncertainty about when timesheets can no longer be modified

#### Root Cause Categories
1. **Lock Date Misunderstanding** (45% of cases)
   - User doesn't understand when/why timesheet locks
   - Expecting to edit timesheet but it's past cutoff
   - Not knowing that locks exist or can be configured
   - Unclear communication about freeze dates

2. **Configuration Issues** (30% of cases)
   - Lock date not configured correctly in system setup
   - Different lock dates for different departments/projects
   - Automatic lock triggered but should be manual
   - Lock settings changed without communication

3. **Exception Processing** (15% of cases)
   - Manager needs to make corrections after lock date
   - Late time entry for previous pay period
   - Correction requires unlocking period
   - No exception/override process defined

4. **System Behavior** (10% of cases)
   - Lock behavior not working as expected
   - Timesheet appearing locked when it shouldn't be
   - Unlock not working after admin action
   - Lock persisting despite re-opening request

#### Resolution Playbook

**Step 1: Clarify Situation** (Automated)
- Which pay period/timesheet is locked?
- Is this expected or unexpected?
- What is user trying to do: enter new time, edit existing, approve?
- When was the timesheet last modified?

**Step 2: Explain Lock Policy** (Guided education)
- Describe organization's timesheet lock schedule:
  - When does each pay period lock? (e.g., 2 business days after pay period ends)
  - Can supervisors override the lock for exceptions?
  - What's the process for late/corrected time entries?
- DCAA requirement: Timesheets should lock to preserve audit trail
- Once locked: timesheet can be viewed but not edited without override

**Step 3: Check Lock Status** (Requires human)
- Login to HTS as admin
- Navigate to timesheet in question
- Verify lock status: Is it actually locked?
- Check lock date: When did it lock? Was it intentional?
- Review lock policy configuration for this organization

**Step 4: Access Decision** (Requires human judgment)
- **If lock is expected:** Explain policy to user, suggest waiting for next pay period
- **If correction needed:** Evaluate if exception is justified
  - Is this a legitimate correction? (vs. late time entry)
  - Does supervisor approve the correction?
  - Is this recurring (indicates lock policy issue)?

**Step 5: Exception Processing** (If needed)
- If supervisor/admin override is approved:
  - Document the reason for exception
  - Unlock the timesheet for correction
  - Allow user to make change
  - Require supervisor review of change
  - Re-lock after correction (with new audit trail entry)

**Step 6: Prevention** (For recurring issues)
- **If lock policy unclear:** Communicate schedule to entire team
- **If too many exceptions:** May indicate lock date is too early, consider adjusting
- **If pattern of late entries:** Provide training on timely entry expectations

#### Automated Response Template
```
I can help with your locked timesheet.

**Let me confirm your situation:**
1. Which pay period is locked? (dates)
2. What are you trying to do: enter new time / edit existing time / approve?
3. Is this your first time working with locked timesheets in HTS?

**How Timesheet Locks Work:**
- Each pay period has a lock date (usually 2 business days after period ends)
- After lock date: timesheets can be viewed but not edited
- This protects the audit trail for DCAA compliance
- For corrections after lock: supervisor must approve exception

**If you need to make a correction after the lock date:**
- Your supervisor can request that the period be temporarily unlocked
- Changes will be documented in the audit trail
- Supervisor must review and re-approve the corrected timesheet

Is this for a legitimate correction or late time entry?
That will determine next steps.
```

---

### Category 11: Historical Timesheet Edits/Corrections
**Estimated Frequency:** 3-4% of tickets
**Severity:** High
**Automation Level:** Partial

#### Symptoms
- User tries to edit timesheet from previous pay period
- Question about how to fix errors discovered later
- Supervisor realizing timesheet needs changes after approval
- Employee made error in earlier week, needs correction
- Concern that audit trail might show too many changes
- Correction process unclear or difficult

#### Root Cause Categories
1. **Change Policy Uncertainty** (40% of cases)
   - User doesn't know if they can correct historical entries
   - Unclear who can make changes (employee vs. supervisor vs. admin)
   - Not knowing that changes are fully tracked/audited
   - Worry that corrections will "look bad" or be risky

2. **Process Access Issues** (30% of cases)
   - Historical timesheet is locked and user can't open it
   - Edit button not appearing for historical entries
   - User doesn't know where to go to make corrections
   - Permission error preventing access to previous period

3. **Audit Trail Concerns** (20% of cases)
   - Organization nervous about showing multiple changes to same entry
   - Misconception that changes need to be hidden or minimized
   - Confusion about what change documentation is required
   - Audit trail showing too many changes causing concern

4. **Data Integrity Issues** (10% of cases)
   - Multiple conflicting edits to same timesheet
   - Change reason not properly documented
   - Who made the change unclear from audit trail
   - Original vs. corrected values not clearly distinguishable

#### Resolution Playbook

**Step 1: Assess the Situation** (Automated)
- Which timesheet needs correction?
- What was the error: wrong hours, wrong project, wrong labor category, other?
- Who discovered the error?
- How long ago was the timesheet completed/approved?
- How many hours affected?

**Step 2: Explain Correction Philosophy** (Guided education)
- **DCAA Principle:** Corrections are expected and normal, not concerning
- Auditors EXPECT to see corrections - shows management oversight
- What matters: DOCUMENTING why change was made
- Every change is logged with: who, when, what changed, why
- Multiple changes to same entry are fine if all documented
- **Key Rule:** Document the reason for each correction for DCAA compliance

**Step 3: Determine Who Should Make the Change** (Requires human judgment)
- **Employee correction:** If employee notices their own error, they should correct immediately
- **Supervisor correction:** If supervisor finds error during review, they can request correction
- **Admin correction:** Only if normal process unavailable or data quality issue
- **Preference:** Have employee correct it with supervisor awareness (maintains audit trail integrity)

**Step 4: Execute the Correction** (Guided + human oversight)
- Unlock timesheet if necessary (may be locked post-pay-period)
- Employee or authorized user edits the incorrect field(s)
- **CRITICAL:** User must enter reason for change in audit trail field
  - Example reasons: "Corrected project code - should have been ABC-123, not ABC-124"
  - "Adjusted hours from 8 to 7 - missed break time"
- Save change - audit trail automatically captures all details
- If locked: admin re-locks after correction

**Step 5: Supervisor Review of Correction** (Requires human)
- Supervisor reviews the change
- Supervisor confirms reason documented
- Supervisor approves or requests further changes
- Supervisor re-approves timesheet if necessary

**Step 6: Document for Audit** (If it's an important correction)
- For significant corrections: note in employee file or ticket
- For regulatory corrections: create summary document
- For pattern issues: communicate with team about prevention
- For DCAA prep: this shows good internal controls

#### Automated Response Template
```
I can help you correct the historical timesheet error.

**Let me understand the correction:**
1. Which timesheet period? (dates)
2. What was wrong: (incorrect hours, wrong project, wrong code, etc.)
3. What should it be corrected to?
4. Who should make the correction: employee, supervisor, or admin?

**About Corrections:**
✓ Corrections are normal and expected - auditors see them all the time
✓ Every change is automatically logged with who, when, what, and why
✓ Multiple corrections to same entry are fine if properly documented
✓ You just need to document the REASON for the change

**Next Steps:**
1. Identify who will make the change
2. That person edits the timesheet and enters the reason
3. If supervisor: review and approve the corrected entry
4. Audit trail automatically captures everything

What's the correction needed, and who should make it?
```

---

### Category 12: Supervisor Bulk Approval Workflows
**Estimated Frequency:** 3-4% of tickets
**Severity:** Medium
**Automation Level:** Yes (with guardrails)

#### Symptoms
- Supervisor asking about "approve all" feature
- Multiple timesheets need approval each period
- Supervisor workflow for approving 50+ employee timesheets
- Question: "Can I approve all at once?"
- Desire to streamline approval process
- Risk: Supervisor bulk-approving without individual review (DCAA violation)

#### Root Cause Categories
1. **Workflow Efficiency Request** (50% of cases)
   - Legitimate need to speed up approval process
   - Manual review of 100+ timesheets per pay period very time-consuming
   - Supervisor wants bulk action feature
   - Desire to auto-approve if no changes detected

2. **DCAA Risk/Misconception** (30% of cases)
   - Supervisor doesn't understand DCAA "meaningful review" requirement
   - Thinks bulk approval is acceptable as long as system is configured
   - Not realizing that bulk approve without individual review fails audit
   - Misunderstanding what "system-enforced controls" means

3. **Process Design Issues** (15% of cases)
   - Organization wants to enable bulk approve but needs guardrails
   - Need way to speed process while maintaining DCAA compliance
   - Want to trust system to flag anomalies vs. manual review
   - Seeking middle ground between efficiency and compliance

4. **Implementation Questions** (5% of cases)
   - Supervisor trying to use bulk features but unclear how
   - Workflow not optimized for supervisor's use case
   - UI/UX could be improved for approval efficiency

#### Resolution Playbook

**Step 1: Clarify the Request** (Automated)
- Does supervisor want: bulk approve feature, faster workflow, or process advice?
- How many timesheets per period need approval?
- Are they currently reviewing each individually or in groups?
- What's the primary pain point: time, complexity, other?

**Step 2: DCAA Compliance Education** (Required)
- **Critical Point:** Bulk "Approve All" button without individual review = DCAA violation
- DCAA requirement: "Meaningful review" = supervisor must actually examine each timesheet
- Auditors specifically look for evidence supervisor reviewed details, not just auto-approved
- Bulk approval is audit risk, not efficiency feature
- **Permitted workflow:** Supervisor can GROUP-REVIEW (multiple on screen) but must examine each

**Step 3: Recommend Compliant Efficiency Approach** (Guided)
Option A: Grouped Review Workflow
- HTS can show multiple employees' timesheets in one view
- Supervisor quickly scans for anomalies: unusual hours, missing charge codes, etc.
- If flagged: dig deeper before approving
- If normal: approve quickly
- Still individual approval actions, but faster visual review

Option B: Flagged-Item Review
- System highlights timesheets with: negative hours, over 60 hours, unusual patterns
- Supervisor reviews flagged items only in detail
- Auto-approves routine/normal timesheets (with audit evidence of review criteria)
- Still "meaningful review," but more efficient

Option C: Approval Delegation
- Supervisor designates trusted approver (e.g., assistant) for initial review
- Second-level supervisor does final spot-check review
- Both signatures required = layered review process
- Each layer does meaningful review within their scope

**Step 4: Configure Compliant Solution** (Requires human setup)
- Work with supervisor to define "normal" vs. "flagged" criteria
- Configure system alerts for timesheet anomalies
- Create review checklist for supervisor:
  - Do all hours add up correctly?
  - Are all charge codes valid for these projects?
  - Are labor categories assigned correctly?
  - Any unusual patterns or corrections noted?
- Document the review process as part of internal controls

**Step 5: Implement & Train** (Requires human execution)
- Walk supervisor through new approval workflow
- Show how to use grouped view for faster review
- Demonstrate how system flags anomalies
- Practice with 5-10 actual timesheets
- Confirm supervisor comfortable with new process

**Step 6: Monitor & Audit** (Ongoing oversight)
- Periodically audit supervisor's approval patterns
- Confirm they're actually reviewing, not auto-approving
- Look for: Do they ever reject or request changes?
- Provide corrective coaching if approval rate suspiciously high (100% approval unusual)

#### Automated Response Template
```
I can help with your timesheet approval workflow.

**Before we talk about "bulk approve" - important DCAA note:**
Bulk "Approve All" without individual review = audit failure
DCAA requires supervisors to do "meaningful review" of each timesheet
Auditors specifically look for evidence you actually examined entries

**What we CAN do to speed approval:**
1. Grouped View: See multiple employee timesheets on one screen for faster review
2. Flagged Reviews: System highlights unusual timesheets (overtime, missing codes, etc.)
   - You review flagged ones in detail
   - Routine ones approved after quick scan
3. Approval Checklist: Standardized questions to review in 30 seconds per timesheet

**How many timesheets per period are you approving?**
That will help me recommend the best efficiency approach for your team.

We can make it faster AND keep DCAA compliance - let's talk through options!
```

---

### Category 13: Report Generation/Performance Issues
**Estimated Frequency:** 3-4% of tickets
**Severity:** Low
**Automation Level:** Partially Automated

#### Symptoms
- Report taking too long to generate
- Report fails to complete or times out
- "Slow refresh" issue mentioned in reviews
- Pagination or data loading issues
- Export to Excel fails
- Difficulty filtering/customizing reports
- Monthly roll-up reports performance degradation

#### Root Cause Categories
1. **Large Dataset Queries** (40% of cases)
   - Organization has 1000+ employees or 5+ years of data
   - Report pulling huge date range without filtering
   - Querying multiple projects/departments at once
   - Complex calculations (project profitability, allocations)

2. **Browser/Client Issues** (30% of cases)
   - Older browser version causing slow rendering
   - JavaScript performance issues
   - Too many other tabs/apps running
   - Not enough browser cache/memory
   - Browser not fully loaded/cached

3. **Configuration Issues** (20% of cases)
   - Overly complex report with too many variables
   - Report not using indexes/optimized queries
   - Unoptimized date range selection
   - Too many projects/departments selected

4. **System Performance** (10% of cases)
   - Server load high (peak time)
   - Database queries not optimized
   - Actual system performance issue (engineering matter)

#### Resolution Playbook

**Step 1: Gather Information** (Automated)
- Which report: Timesheet Summary, Audit Trail, Project Hours, Payroll, Other?
- What date range?
- How many employees/projects included?
- What's slow: generating, loading, exporting?
- Error message or just slow?

**Step 2: Try Quick Fixes** (Guided self-service)
- Browser optimization:
  - Close all other browser tabs
  - Ctrl+Shift+Delete (clear cache)
  - Close and reopen browser
  - Try different browser (Chrome, Firefox, Safari, etc.)
- Reduce report scope:
  - Try shorter date range (one month instead of year)
  - Filter to specific department/project
  - Limit to key employees instead of all

**Step 3: Monitor Performance** (Guided)
- Run same report again with reduced scope
- Time it: How long does it take?
- If fast with reduced scope: scope is the issue
- If still slow: might be system issue

**Step 4: Report Optimization** (Guided + human analysis)
- For large organizations (500+ employees):
  - Recommend running reports by department, not all at once
  - Use date filtering (one quarter at a time vs. annual)
  - Suggest exporting to Excel for local analysis vs. live reports
- For complex calculations:
  - Break into multiple simpler reports
  - Pre-calculate common metrics
- For export to Excel:
  - Limit row count if possible
  - Ask if all columns needed

**Step 5: System-Level Options** (Requires human consultation)
- For very large organizations: may need scheduled report generation
- Option to run reports off-hours for complex queries
- Consider data warehouse/BI tool if reports very intensive
- Document as feature request if ongoing issue

#### Automated Response Template
```
I can help optimize your report performance.

**Let me understand the issue:**
1. Which report: Timesheet Summary / Audit Trail / Project Hours / Payroll / Other?
2. What date range?
3. How many employees are included?
4. Is it slow to generate or slow to load/display?

**Quick fixes to try first:**
- Close all other browser tabs
- Clear browser cache: Ctrl+Shift+Delete
- Try a different browser
- Try shorter date range (1 month vs. 1 year)

**After you try those, let me know:**
- Did performance improve?
- Which combination worked best?

For ongoing slow reports, I can recommend:
- Running by department instead of all at once
- Scheduling reports for off-hours
- Exporting to Excel for local analysis
```

---

### Category 14: Leave/PTO Tracking Configuration
**Estimated Frequency:** 3-4% of tickets
**Severity:** Medium
**Automation Level:** Partial

#### Symptoms
- Organization setting up leave/PTO for first time
- Employee question about how to request leave
- Supervisor unsure about approving time off
- Questions about accrual rates and policies
- Confusion about how leave ties to timesheets
- Tracking sick leave vs. vacation vs. other leave types

#### Root Cause Categories
1. **Configuration Incomplete** (40% of cases)
   - Leave types not set up (vacation, sick, personal, etc.)
   - Accrual rules not configured
   - Leave policies not established in system
   - Role permissions for leave approvals not set

2. **User Education Gap** (35% of cases)
   - Employee doesn't know how to request leave
   - Supervisor doesn't know how to approve leave
   - Confusion about whether leave shows in timesheet
   - Not knowing leave request vs. timesheet entry difference

3. **Integration/Tracking Issues** (15% of cases)
   - Leave time not properly deducted from accrual balance
   - Questions about whether leave entries affect DCAA compliant hours
   - Reporting on leave usage unclear
   - Leave data not syncing to payroll (QB/ADP)

4. **Policy Alignment** (10% of cases)
   - HTS configuration doesn't match company policy
   - Government contract rules about leave tracking (comp time, etc.)
   - Questions about DCAA implications of leave tracking

#### Resolution Playbook

**Step 1: Clarify Current Needs** (Automated)
- Is this first-time setup or fixing configuration?
- What types of leave to track: vacation, sick, personal, comp time, other?
- How should leave be tracked: accrual, unlimited, fixed allocation?
- How does company policy define each leave type?

**Step 2: Advise Configuration Approach** (Requires human setup)
- Recommend defining each leave type:
  - Name (Vacation, Sick Leave, etc.)
  - Accrual method (hours per period, annual allocation, etc.)
  - Carryover rules (how many hours can roll over)
  - Approval required: Yes/No, supervisor/admin
- Set up accrual schedule if applicable
- Configure integrations: leave data to payroll export

**Step 3: Guide User Workflows** (Guided education)
- **For employees requesting leave:**
  - Navigate to Leave/PTO section
  - Click "Request Leave"
  - Select leave type and dates
  - Submit for approval
  - Supervisor notified
  - Once approved: employee can log that leave on timesheet

- **For supervisors approving leave:**
  - Navigate to Leave Requests
  - Review pending requests
  - Approve or request information/changes
  - Once approved: leave is deducted from balance

- **For payroll integration:**
  - Leave codes available in timesheet entry
  - When employee enters leave, it deducts from accrual balance
  - Leave data exports to payroll (QB/ADP) with other hours
  - Payroll processes leave as paid time off

**Step 4: Document Leave Policies in HTS** (Requires human creation)
- Create leave type definitions for organization
- Document accrual rules and carryover policies
- Clarify whether leave goes through approval workflow
- Provide examples of correct leave requests
- Train supervisors on leave approval process

**Step 5: Verify Setup** (Requires human validation)
- Test: Create sample leave request as employee
- Verify: Can supervisor approve it
- Check: Balance deducted correctly
- Confirm: Leave available in timesheet entry
- Validate: Exports correctly to payroll

#### Automated Response Template
```
I can help you set up leave and PTO tracking in HourTimesheet.

**First, let's define your leave types:**
What types of time off do you need to track?
- Vacation / Sick Leave / Personal Days / Comp Time / Other?
- Are they limited (e.g., 20 vacation days/year) or unlimited?
- Do employees need to request approval or just notify?

**I'll help you:**
1. Configure each leave type in the system
2. Set up accrual or allocation rules
3. Train employees how to request leave
4. Train supervisors how to approve leave
5. Verify leave exports correctly to payroll

Once configured, here's how it works:
- Employee requests leave → Supervisor approves → Leave deducted from balance
- Employee logs leave on timesheet → Includes in payroll export
- Full audit trail of all leave requests and changes

What leave types should we set up?
```

---

### Category 15: Multi-level Signature/Approval Chains
**Estimated Frequency:** 2-3% of tickets
**Severity:** Medium
**Automation Level:** Requires Human

#### Symptoms
- Large organizations needing multiple approval levels
- Question: "Can we require department manager AND director approval?"
- Confusion about approval routing/sequencing
- Signature not appearing after expected approver level
- Multiple people trying to approve same timesheet
- Complex approval workflows not executing correctly

#### Root Cause Categories
1. **Configuration Errors** (45% of cases)
   - Approval chain not properly sequenced
   - Multiple approvers configured but routing unclear
   - Signature authority not correctly assigned
   - Role hierarchy not reflecting reporting structure

2. **Understanding Gaps** (30% of cases)
   - User doesn't understand how multi-level approvals work
   - Unclear what "level 1 approver" vs. "level 2 approver" means
   - Questions about what each level should review
   - Not knowing approval must happen sequentially

3. **System Limitations** (15% of cases)
   - Approval workflow doesn't support custom sequencing
   - Cannot define conditional approval paths
   - Limited support for matrix organizational structures
   - Complex requirements exceed system capabilities

4. **Change Management** (10% of cases)
   - Organization restructured, approval chains outdated
   - New business requirement for additional approval level
   - Approval authority needs to change seasonally/by project

#### Resolution Playbook

**Step 1: Understand Organizational Structure** (Automated)
- How many approval levels needed?
- Who approves at each level (titles/departments)?
- Must approvals happen in sequence or can they be parallel?
- For government contracts: are there specific DCAA approval requirements?
- Are approval needs same for all employees or vary by department/project?

**Step 2: Map Current vs. Desired State** (Requires human analysis)
- Document current approval configuration
- Diagram desired approval flow
- Identify any gaps or conflicts
- Determine if system can support required workflow

**Step 3: Configure Approval Levels** (Requires human setup - admin level)
- Set up signature levels:
  - Level 1: Direct supervisor (standard)
  - Level 2: Department manager or director (if needed)
  - Level 3: Finance/Compliance (for audit or control)
- For each level: define role and who holds that role
- Create approval role assignments by employee (who approves whom)

**Step 4: Define Review Responsibilities** (Requires human consultation)
- For each approval level: document what they should verify
- Example:
  - **Level 1 (Direct Supervisor):** Verify hours match work schedule, charge codes correct
  - **Level 2 (Manager):** Verify all charge codes are appropriate, totals reasonable
  - **Level 3 (Finance):** Verify DCAA compliance, audit trail completeness
- Provide checklist for each level to ensure meaningful review

**Step 5: Test Approval Flow** (Requires human execution)
- Create test timesheet with sample data
- Route through approval chain
- Verify each level receives notification
- Confirm each level can add signature
- Verify status shows completed once all levels approved
- Test rejection/return at intermediate level

**Step 6: Document & Train** (Requires human creation)
- Document the approval workflow:
  - Who approves at each level
  - What each level is responsible for verifying
  - Timeline/deadline for each approval level
  - What happens if timesheet rejected or needs changes
- Train all approvers on their responsibilities
- Provide quick reference card for approval workflow
- Set up auto-reminders for pending approvals

#### Automated Response Template
```
I can help you set up multi-level timesheet approvals.

**Let me understand your approval structure:**
1. How many approval levels do you need?
2. Who approves at each level (titles/departments)?
3. Must they approve in sequence (step by step) or in parallel?
4. Are approval requirements the same for all employees?

**Example structures:**
- Small org: Employee → Direct Supervisor only
- Medium: Employee → Supervisor → Department Manager
- Large: Employee → Supervisor → Manager → Finance/Compliance
- Matrix: Employee → Multiple project managers (parallel approval)

**We'll need to:**
1. Configure your approval levels in HourTimesheet
2. Assign people to each approval role
3. Define what each level should verify
4. Test the workflow
5. Train all approvers

What's your desired approval structure?
```

---

### Category 16: Billable Hours/Service Item Mapping
**Estimated Frequency:** 2-3% of tickets
**Severity:** High
**Automation Level:** Partial

#### Symptoms
- "Cannot export to QB" error during payroll/billing
- Billable hours marked but service item missing
- Questions about which hours to mark as billable
- Confusion about service items in QuickBooks
- Hours not appearing in QB invoice preparation
- Billing rate not being applied correctly

#### Root Cause Categories
1. **Billable Hour Misunderstanding** (40% of cases)
   - Employee marks hours as billable but doesn't understand requirement
   - Confusion about which projects/clients are billable vs. internal
   - Not realizing billable requires corresponding QB service item
   - Thinking "billable" = "we'll charge the customer"

2. **QuickBooks Configuration** (35% of cases)
   - Service item not set up in QB master data
   - Service item not properly linked to project/customer
   - QB service items not synced to HTS
   - Wrong service item selected for hours

3. **Validation Failures** (15% of cases)
   - HTS prevents marking as billable without service item
   - Export fails due to billable hours without items
   - Discrepancy between HTS billable and QB items
   - Invalid service item selection

4. **Billing Process Questions** (10% of cases)
   - Questions about how billing works end-to-end
   - Confusion about hours → invoices → customer billing
   - Not understanding QB integration with billing workflow

#### Resolution Playbook

**Step 1: Clarify Billable Hour Intent** (Automated)
- Is user trying to: track billable hours for billing, mark project type, or something else?
- Which project/customer are these hours billable to?
- Is this a standard QB service item or custom?
- How does organization define "billable" vs. "non-billable"?

**Step 2: Explain Billable Hours System** (Guided education)
- **Billable Hours = hours you'll invoice to customer**
- Must have corresponding QB Service Item (what to charge for)
- QB Service Item includes rate/price
- Billing workflow: hours marked billable → QB → invoice preparation
- If no service item: QB won't know what rate to charge → export fails

**Step 3: QB Service Item Setup** (Requires QB knowledge)
- Ask: What are your service items/billing rates?
  - Example: "Development at $150/hr", "QA Testing at $100/hr"
- Verify service items exist in QB:
  - QB Lists > Service Items
  - Each should have: name, description, rate
- Sync QB service items to HTS (if HTS has sync feature)
- Or: manually add service items to HTS

**Step 4: Configure Billable Rules** (Requires human setup)
- For each project: define what service item to use for billable hours
- Set default service item for project if most hours are same type
- Train employees: when marking billable, select the correct service item
- Provide examples:
  - "When working on Client A development: mark billable with 'Dev Services' item"
  - "When doing QA: mark billable with 'QA Testing' item"

**Step 5: Verify Hours-to-Billing Flow** (Requires human validation)
- Test: Mark sample hours as billable with service item
- Export to QB: verify hours appear
- In QB: verify service item correctly applied
- In QB billing: create invoice with hours → check rate is correct
- Confirm customer-facing invoice looks correct

**Step 6: Training & Prevention** (Requires human execution)
- Document for employees: which hours are billable, which service item for each project
- Provide step-by-step: how to mark hours billable in HTS
- For supervisors: check billable hours have service item selected
- For billing team: how to pull billable hours from HTS for invoicing

#### Automated Response Template
```
I can help fix your billable hours issue.

**First, let me understand your situation:**
1. You're marking hours as billable but getting an error?
2. What error message do you see?
3. Which project/customer are these hours for?
4. Do you know the Service Item name in QuickBooks?

**Here's what "billable" means:**
- You're marking hours that will be invoiced to the customer
- Must select a Service Item from QuickBooks (the thing you're charging for)
- Service Item includes the rate (e.g., $150/hour for development)
- Without service item: QuickBooks doesn't know what rate to charge

**To fix this:**
1. Identify your Service Items in QuickBooks (Lists > Service Items)
2. In HourTimesheet, when marking hours billable, select the correct service item
3. Example: "Mark as billable → Select service item 'Development Services'"

What's the service item name for this project, or do we need to set that up first?
```

---

### Category 17: Browser Compatibility/Cache Issues
**Estimated Frequency:** 2-3% of tickets
**Severity:** Low
**Automation Level:** Fully Automated

#### Symptoms
- Features not working in older browser
- Timesheet data not displaying correctly
- "Page not fully loaded" appearance
- Buttons not responding
- Dropdown menus not appearing
- Performance slower in certain browser
- Layout broken or misaligned

#### Root Cause Categories
1. **Outdated Browser** (50% of cases)
   - Using Internet Explorer instead of modern browsers
   - Browser version 3+ years old
   - Not updated despite available patches
   - Browser missing JavaScript/CSS support

2. **Browser Cache Issues** (30% of cases)
   - Old cached version of page loading
   - CSS/JavaScript cache not cleared after update
   - Cookie conflicts
   - Local storage issues

3. **Browser Extensions** (12% of cases)
   - Ad blocker interfering with page rendering
   - Security extension blocking necessary requests
   - VPN extension causing issues
   - Password manager creating conflicts

4. **Browser Settings** (8% of cases)
   - JavaScript disabled
   - Cookies disabled
   - Pop-ups blocked
   - Compatibility mode enabled

#### Resolution Playbook

**Step 1: Identify Browser & Issue** (Automated)
- Which browser: Chrome, Firefox, Safari, Edge, Internet Explorer?
- Browser version (Help > About)
- What's not working specifically?

**Step 2: Recommend Modern Browser** (Guided)
- HourTimesheet works best with: Chrome, Firefox, Safari, Edge (current versions)
- If using Internet Explorer: strongly recommend switching
- Update to latest version of current browser

**Step 3: Clear Cache** (Guided self-service - detailed)
**Chrome:**
- Ctrl+Shift+Delete
- "Cookies and other site data" + "Cached images and files"
- Select "All time"
- Click "Clear data"

**Firefox:**
- Ctrl+Shift+Delete
- Check "Cookies" and "Cache"
- Select "Everything"
- Click "Clear Now"

**Safari:**
- Menu > Develop > Empty Web Cache
- Menu > Safari > Preferences > Privacy > "Remove all website data"

**Edge:**
- Ctrl+Shift+Delete
- Select "Cookies and other site data" + "Cached images and files"
- Click "Clear now"

**Step 4: Try Incognito/Private Mode** (Guided)
- Open new private/incognito window
- Navigate to HourTimesheet
- Log in and test feature
- If works in private mode: browser cache/extensions are issue

**Step 5: Disable Extensions** (Guided)
- If private mode works, extensions are likely culprit
- Disable extensions one by one to identify problem
- Common problem extensions: ad blockers, VPNs, password managers
- Whitelist HourTimesheet in security extensions if needed

**Step 6: Update/Reinstall Browser** (Guided)
- If cache clear and extension disable don't fix: update browser
- Help > About > Check for updates
- If multiple versions behind: consider reinstalling
- Restart computer after update

**Step 7: Try Different Browser** (As final test)
- If issue persists: try different browser (Chrome if using Firefox, etc.)
- If works in different browser: original browser has issue
- Contact browser support or continue with different browser

#### Automated Response Template
```
I can help fix your HourTimesheet display issue.

**Let's start with quick fixes:**

1. **Update your browser:**
   - Which browser: Chrome / Firefox / Safari / Edge?
   - Help > About - check if updates available
   - Install updates if needed, then restart browser

2. **Clear your browser cache:**
   - Ctrl+Shift+Delete (Windows) or Cmd+Shift+Delete (Mac)
   - Select "Cookies and site data" + "Cached images"
   - Select "All time"
   - Click "Clear data"
   - Close browser completely and reopen

3. **Try private/incognito mode:**
   - Open private window (Ctrl+Shift+N for Chrome, etc.)
   - Log into HourTimesheet
   - Does the issue appear in private mode?

**If these don't fix it:**
- Disable browser extensions (ad blockers, VPNs, etc.)
- Try a different browser
- Let me know what happens!

Which of these steps should I help you with first?
```

---

### Category 18: API/Webhook Configuration Problems
**Estimated Frequency:** 2-3% of tickets
**Severity:** Medium
**Automation Level:** Requires Human

#### Symptoms
- Third-party integrations not receiving webhook data
- API authentication failing
- Custom integrations not syncing data
- Webhook delivery showing as failed
- Questions about API documentation or rate limits
- Token expiration causing integration breaks

#### Root Cause Categories
1. **Authentication Issues** (40% of cases)
   - API key not generated or expired
   - Token missing from request header
   - Incorrect authentication method for integration
   - Credentials not properly stored/configured

2. **Webhook Configuration** (30% of cases)
   - Webhook URL incorrect or not responding
   - Endpoint not accessible from HTS servers
   - Firewall/network blocking webhook delivery
   - Webhook events not subscribed to

3. **Data Format/Mapping** (20% of cases)
   - Webhook payload format unexpected by receiver
   - Required fields missing or incorrectly named
   - Data type mismatches (string vs. number, etc.)
   - JSON structure not matching documentation

4. **Rate Limits/Throttling** (10% of cases)
   - Too many API calls exceeding rate limits
   - Webhook retry logic not working
   - Request timeout before response
   - Large payloads causing delivery failure

#### Resolution Playbook

**Step 1: Identify Integration & Issue** (Automated)
- Which third-party system: custom API, Zapier, Integromat, other?
- What type: webhook delivery, API pull, scheduled sync?
- When did it last work? When did it break?
- What error messages in integration logs?

**Step 2: Verify HTS Configuration** (Requires human - admin level)
- Login to HTS as admin
- Navigate to API/Webhook settings (if available)
- Verify webhook URL is correct and accessible
- Confirm API key/token is generated and not expired
- Check which events are subscribed to

**Step 3: Verify Receiver Endpoint** (Requires human consultation)
- Ask user: Is your endpoint online and responding?
- Test endpoint: ping or HTTP request to confirm accessibility
- Verify endpoint accepts POST requests to correct URL
- Check server logs on receiver side for incoming requests
- Confirm firewall allows traffic from HTS servers

**Step 4: Test Webhook Delivery** (Requires human execution)
- In HTS: trigger test webhook event
- Monitor receiver endpoint for incoming request
- If received: check payload format and contents
- If not received: issue is network/firewall, not data
- If received but error: issue is data format/mapping

**Step 5: Validate Data Format** (Requires technical review)
- Review webhook payload documentation
- Compare actual payload to expected format
- Identify any missing or unexpected fields
- Check data types: are numbers strings or integers?
- Verify JSON structure matches receiver's expectations

**Step 6: Debug & Resolve** (Requires technical expertise)
- **If authentication issue:** regenerate API key, update receiver configuration
- **If endpoint issue:** fix URL, enable endpoint, adjust firewall
- **If data format issue:** map fields correctly, transform data if needed
- **If rate limit issue:** implement exponential backoff, increase retry delays

**Step 7: Document & Monitor** (For ongoing reliability)
- Document final configuration for future reference
- Set up monitoring/alerting for webhook failures
- Document any data transformations needed
- Create runbook for common issues (token expiration, etc.)

#### Automated Response Template
```
I can help debug your API/webhook integration issue.

**Tell me about your integration:**
1. Which system are you integrating: [Third-party name]?
2. Type: API pull / Webhook push / Scheduled sync?
3. When did it last work?
4. What error are you seeing?

**I'll help you check:**
1. Is your endpoint accessible and responding?
2. Is the API key/token valid and not expired?
3. Is the webhook payload format correct?
4. Are there firewall or network issues?

**You might also need to provide:**
- Your endpoint URL (so I can help test it)
- The API documentation for the receiver system
- Recent webhook delivery logs/errors
- Sample of the data being sent

Let me start by understanding the integration, then we'll diagnose the issue!
```

---

### Category 19: Compliance Documentation/Certification
**Estimated Frequency:** 2-3% of tickets
**Severity:** High
**Automation Level:** Partial

#### Symptoms
- Organization asking "Is HourTimesheet DCAA-compliant?"
- Request for compliance certification or white papers
- Questions about government contract audit readiness
- Need documentation for government customer
- Compliance audit coming, need to prove system capability
- Questions about NSF requirements vs. DCAA

#### Root Cause Categories
1. **Certification Questions** (40% of cases)
   - Asking if HTS is "certified" DCAA-compliant
   - Confusion that DCAA doesn't certify software (only enforces compliance)
   - Need documentation for government audit

2. **Specific Requirement Questions** (30% of cases)
   - "Does HTS meet requirement X?"
   - "How does HTS handle requirement Y?"
   - Questions about audit trails, change logging, approval workflows
   - NSF vs. DCAA requirement differences

3. **Regulatory Alignment** (20% of cases)
   - Need to confirm HTS meets contract requirements
   - Customer/government auditor asking specific questions
   - Preparing audit response package
   - Documentation for compliance committee

4. **Feature Validation** (10% of cases)
   - "Can HTS do X for compliance?"
   - "Does HTS support requirement Y?"
   - Need product roadmap or feature status

#### Resolution Playbook

**Step 1: Clarify Compliance Need** (Automated)
- Are you: implementing HTS, preparing for audit, responding to customer audit?
- What regulations: DCAA, NSF, FAR, other?
- Who is asking (internal compliance, government customer, auditor)?
- What specific questions or concerns?

**Step 2: Explain DCAA Philosophy** (Guided education)
- **Important:** DCAA does not "certify" software as compliant
- Software vendors claim "DCAA-compliant" but DCAA doesn't endorse
- DCAA auditors judge whether ORGANIZATION'S USE of software is compliant
- Same software can be compliant in one org, non-compliant in another
- Compliance depends on: implementation, training, controls, supervision

**Step 3: Validate HTS Capabilities** (Requires human analysis)
- Does HourTimesheet support key DCAA requirements?
  - Daily time recording by employees ✓
  - Supervisor review and approval ✓
  - Audit trail with all changes logged ✓
  - Change reason documentation ✓
  - Electronic signatures ✓
  - Integration with payroll ✓
- Any gaps identified = noted for org's audit risk management

**Step 4: Assess Organization's Compliance** (Requires human consultation)
- Beyond software: how is HTS USED?
  - Do employees actually record time daily? Or reconstruct later? (RISK)
  - Do supervisors actually review timesheets? Or bulk-approve? (RISK)
  - Are change reasons documented? Or left blank? (RISK)
  - Is training provided to staff? Or assumed to figure out? (RISK)
- Controls assessment: organization's policies and execution

**Step 5: Prepare Audit Documentation** (Requires professional support)
- Create compliance response packet:
  - System capabilities document (feature list)
  - Configuration summary (how HTS is set up in org)
  - Workflow diagram (how timesheet flows through approval)
  - Control evidence (screenshots, reports showing controls work)
  - Sample audit trail data (showing change logging)
  - DCAA requirements checklist (how each is addressed)
- Address specific regulatory requirements

**Step 6: Support Audit Interview** (If needed)
- Offer direct support for government auditor questions
- Prepare HTS expert for technical audit interview
- Provide demo/walk-through of compliance features
- Answer auditor technical questions about audit trails, changes, etc.

#### Automated Response Template
```
I can help with your DCAA compliance documentation.

**First, important context:**
DCAA does not "certify" software as compliant.
HourTimesheet is designed to SUPPORT DCAA compliance, but the auditor
judges whether YOUR ORGANIZATION'S USE is compliant.

**Tell me about your situation:**
1. Are you: Implementing HTS / Preparing for audit / Responding to auditor?
2. Who is asking for compliance info: Internal / Customer / Government auditor?
3. What specific requirements are they asking about?

**I can provide:**
1. Documentation showing HTS supports DCAA requirements
2. Your system configuration summary
3. Sample audit trail data showing controls work
4. DCAA requirements checklist mapped to HTS features
5. Direct support for auditor technical questions

What's your specific need?
```

---

### Category 20: Feature Enhancement Requests/Feedback
**Estimated Frequency:** 2-3% of tickets
**Severity:** Low
**Automation Level:** Fully Automated

#### Symptoms
- "Would be nice if..." feature requests
- Feedback about UI/UX improvements
- Comparison to competitor features
- Requests for additional reporting
- Suggestions for streamlining workflows
- Questions about product roadmap

#### Root Cause Categories
1. **Workflow Optimization** (40% of cases)
   - "Can we have bulk approve with guardrails?"
   - "Can timesheets auto-populate from calendar?"
   - "Can we preset charge codes by day?"
   - "Streamline weekly approval notifications?"

2. **Reporting Enhancements** (30% of cases)
   - "More project profitability reporting"
   - "Better drill-down analytics"
   - "Custom report builder"
   - "Real-time dashboard"

3. **Integration Requests** (15% of cases)
   - "Support for [new payroll system]?"
   - "Can we sync with [project management tool]?"
   - "Zapier integration?"
   - "API for custom integrations?"

4. **Competitive Comparisons** (15% of cases)
   - "Competitor X has feature Y, why don't you?"
   - "Can we get this from your competitor?"
   - Consideration of switching products
   - Feature parity concerns

#### Resolution Playbook

**Step 1: Acknowledge & Document** (Automated)
- Thank user for feedback
- Confirm understanding of request
- Explain that all feedback is reviewed by product team
- Provide feedback tracking number for reference

**Step 2: Provide Context** (Automated response)
- Explain roadmap process (if appropriate)
- Share any existing related features that might help
- Explain why feature might/might not be feasible
- Suggest workarounds if available

**Step 3: Categorize Request** (Automated tagging)
- Feature type: UX/UI, Reporting, Integration, Compliance, Other
- Priority: Low/Medium/High (based on demand and effort)
- Impact: Single user, Department, Organization-wide
- Effort estimate: Quick win, Medium, Significant effort

**Step 4: Submit to Product Team** (Automated routing)
- Submit to feature request system
- Link to any related existing requests (vote consolidation)
- Include user context (company size, use case, urgency)
- Track for future product roadmap consideration

**Step 5: Inform User** (Automated follow-up)
- Provide feature request ID
- Explain how they'll hear about updates
- Suggest interim workarounds if available
- Invite them to provide more details if helpful

**Step 6: Periodic Updates** (Automated if implemented)
- If feature is considered: notify requester
- If feature is approved: provide ETA when available
- If feature is released: notify and provide documentation
- Thank them for feedback that shaped product

#### Automated Response Template
```
Thank you for the feedback! We appreciate your suggestion.

**Your Request:** [Echo back their feature request]

**Next Steps:**
Your feedback has been submitted to our product team with ID: HTS-[ID]

We review all feedback to understand what matters most to our customers.
While we can't commit to timelines, we use feedback like yours to shape
our product roadmap.

**In the meantime:**
[Suggest existing features that might help]
[Suggest workarounds if available]

**You'll hear from us if:**
- We're considering this feature
- We've added it to our roadmap
- The feature is ready for release

Thanks again for using HourTimesheet and for helping us improve!
```

---

## Part 3: Resolution Automation Candidates

### Fully Automatable (Low-Touch Resolution)
**These can be resolved entirely by automated responses with no human intervention:**

1. **Browser Compatibility/Cache Issues** (Category 17)
   - Clear cache, update browser, try incognito mode
   - Automated step-by-step guides
   - Self-service resolution rate: 70-80%

2. **Login/Authentication - Password Resets** (Category 4)
   - Automated password reset email
   - Self-service unlock for locked accounts
   - Automated verification before granting access
   - Self-service resolution rate: 80-90%

3. **Feature Enhancement Requests** (Category 20)
   - Automated acknowledgment
   - Automated categorization and routing
   - Automated tracking number generation
   - 100% automatable (no resolution needed, just tracking)

### Mostly Automatable with Human Fallback
**These can start with automation, escalate if not resolved:**

1. **Mobile App Issues** (Category 5) - 60% automatable
   - Automated troubleshooting steps
   - Clear cache, update app, try different network
   - Escalate if still failing

2. **Data Import/Setup** (Category 8) - 50% automatable
   - Automated template provision
   - Automated file validation and error identification
   - Escalate for complex data mapping or QB-specific issues

3. **Leave/PTO Configuration** (Category 14) - 40% automatable
   - Automated education about leave types
   - Guided configuration wizard
   - Escalate if policy conflicts or accrual issues

4. **Timesheet Lock/Freeze Dates** (Category 10) - 50% automatable
   - Automated explanation of lock policy
   - Automated check of lock status
   - Escalate if exception/override needed

5. **Report Performance Issues** (Category 13) - 70% automatable
   - Automated browser optimization steps
   - Automated scope-reduction recommendations
   - Escalate for system-level performance issues

### Requires Human Judgment/Expertise
**These need human review, decision-making, or specialized knowledge:**

1. **QuickBooks Sync Issues** (Category 1) - 20% automatable
   - Automated triage questions
   - Automated quick-fix checklist
   - **Requires human:** Deep diagnosis, QB-specific knowledge, account access

2. **Timesheet Approval Workflows** (Category 2) - 30% automatable
   - Automated education on DCAA requirements
   - **Requires human:** Workflow design, process change coaching

3. **Charge Code Errors** (Category 3) - 25% automatable
   - Automated triage and error identification
   - **Requires human:** Root cause analysis, pattern detection, system design review

4. **User Roles/Permissions** (Category 7) - 30% automatable
   - Automated permission checking tools
   - **Requires human:** Admin-level changes, organizational structure review

5. **ADP Export Issues** (Category 6) - 20% automatable
   - Automated configuration verification
   - **Requires human:** Employee record mapping, QB/ADP integration debugging

6. **Historical Timesheet Corrections** (Category 11) - 25% automatable
   - Automated education on correction process
   - **Requires human:** Approval decision, pattern analysis, audit documentation

7. **Supervisor Bulk Approval** (Category 12) - 40% automatable
   - Automated DCAA compliance education
   - **Requires human:** Workflow design, compliance guardrail implementation

8. **Multi-level Approvals** (Category 15) - 10% automatable
   - **Requires human:** Organizational structure mapping, workflow configuration

9. **Billable Hours/Service Items** (Category 16) - 30% automatable
   - Automated education on billable hours concept
   - **Requires human:** QB integration setup, rate/item mapping

10. **API/Webhook Configuration** (Category 18) - 15% automatable
    - **Requires human:** Technical debugging, network troubleshooting

11. **Compliance Documentation** (Category 19) - 20% automatable
    - Automated education on DCAA principles
    - **Requires human:** Documentation preparation, audit support

---

## Part 4: Escalation Triggers

### Immediate Escalation to Tier 2/Human Agent

**ESCALATE IMMEDIATELY if:**

1. **DCAA Compliance Risk Identified**
   - Supervisor bulk-approving without individual review (audit failure)
   - Timesheet corrections not properly documented
   - Audit trail gaps or incomplete change logging
   - Organization unprepared for DCAA audit
   - → Route to: Compliance Expert

2. **Data Integrity/Audit Trail Concern**
   - Historical timesheet changes raise questions
   - Missing audit trail entries
   - Changes lacking documented reason
   - Multiple conflicting edits to same entry
   - → Route to: Data Integrity Specialist

3. **Government Contract Jeopardy**
   - Customer/government auditor questions
   - Audit finding related to timekeeping
   - Invoice rejection due to timesheet issues
   - Payment delay potentially related to compliance
   - → Route to: Compliance Expert + Account Manager

4. **Complex Multi-System Integration**
   - QB sync + ADP export in same flow
   - Third-party integration failures affecting multiple systems
   - Data loss or corruption across integrations
   - → Route to: Integration Specialist

5. **Permission/Access Abuse Suspected**
   - Unauthorized timesheet edits detected
   - Employee accessing other's timesheets
   - Permission escalation attempt
   - Potential fraud indicators
   - → Route to: Security Team + Admin

6. **System Error/Bug Suspected**
   - Functionality not working despite correct setup
   - Error messages repeating despite troubleshooting
   - Data loss or corruption
   - Performance degradation affecting multiple users
   - → Route to: Engineering Team

7. **Large-Scale Operational Impact**
   - Multiple departments affected
   - Payroll deadline at risk
   - All timesheets locked/inaccessible
   - Bulk data migration issues
   - → Route to: Senior Support + Product Team

### Secondary Escalation Triggers (After Initial Diagnosis)

**ESCALATE IF automation/troubleshooting doesn't resolve:**

1. **QB Sync Issues** - escalate if not resolved after 3 troubleshooting steps
2. **Approval Workflow Problems** - escalate if workflow requires reconfiguration
3. **Import/Setup Failures** - escalate if data validation fails or QB integration needed
4. **API/Webhook Issues** - escalate if network/connectivity troubleshooting fails
5. **Performance Issues** - escalate if scope reduction doesn't improve speed

---

## Part 5: Average Resolution Complexity by Category

| Category | Complexity | Avg Resolution Time | Resolution Type |
|----------|-----------|-------------------|-----------------|
| Browser Cache Issues | **Simple** (1-step) | 5-10 min | Automated self-service |
| Login Issues | **Simple** (1-step) | 10-15 min | Mostly automated |
| Mobile App Basic | **Simple** (2-3 steps) | 15-20 min | Guided self-service |
| Leave Config | **Moderate** (3-5 steps) | 30-45 min | Guided + partial human |
| Report Performance | **Moderate** (3-4 steps) | 20-30 min | Mostly automated |
| Timesheet Locks | **Moderate** (3-5 steps) | 15-30 min | Guided + human decision |
| Data Import | **Moderate** (5-7 steps) | 45-60 min | Guided + human validation |
| Permission Config | **Moderate** (4-6 steps) | 30-45 min | Human-led setup |
| Charge Codes | **Moderate-Complex** (5-8 steps) | 45-90 min | Human analysis + coaching |
| Historical Corrections | **Complex** (6-10 steps) | 60-120 min | Human review + approval |
| QB Sync Issues | **Complex** (7-12 steps) | 90-180 min | Expert diagnosis + remediation |
| ADP Export Issues | **Complex** (7-10 steps) | 60-120 min | Expert setup + validation |
| Approval Workflows | **Complex** (8-15 steps) | 120-180 min | Design + implementation |
| Multi-level Approvals | **Complex** (10-20 steps) | 180-300 min | Architecture + training |
| Compliance Audit | **Complex** (12-20 steps) | 240-480 min | Expert consultation |
| API Configuration | **Complex** (8-15 steps) | 120-240 min | Technical expertise |
| Bulk Approval Issues | **Complex** (8-12 steps) | 90-150 min | Process design + compliance |
| Feature Requests | **Simple** (1 step) | 5-10 min | Automated submission |
| Billable Hour Setup | **Moderate-Complex** (6-10 steps) | 60-120 min | QB mapping expertise |

---

## Part 6: Recommended Zendesk Tags for AI-Handled Tickets

### Severity Tags
- `severity:critical` - DCAA/compliance risk, payment impact, data loss
- `severity:high` - Integration failures, approval issues, audit concerns
- `severity:medium` - Configuration, workflow questions, moderately impactful
- `severity:low` - Feature requests, UX feedback, minor issues

### Category Tags (Map to Issue Categories)
- `qb-integration` - QuickBooks sync/integration
- `approval-workflow` - Timesheet approval processes
- `charge-codes` - Project/charge code assignment
- `auth-login` - Authentication and login issues
- `mobile-app` - Mobile app problems
- `adp-export` - ADP payroll export
- `permissions` - User roles and access control
- `data-import` - Initial setup and data import
- `audit-trail` - Compliance reporting and audit documentation
- `timesheet-lock` - Pay period freezing
- `corrections` - Timesheet edits and corrections
- `bulk-approval` - Multiple timesheet approval
- `reports` - Report generation and performance
- `leave-pto` - Leave and PTO tracking
- `multi-approval` - Multi-level signature workflows
- `billable-hours` - Billable hours and service items
- `browser-cache` - Browser compatibility issues
- `api-webhooks` - API and webhook integrations
- `compliance-doc` - Compliance certification/audit documentation
- `feature-request` - Enhancement requests

### Automation Readiness Tags
- `automate:full` - Can be fully automated
- `automate:partial` - Can start automated, may escalate
- `automate:none` - Requires human expertise
- `escalate:immediately` - Should not be automated
- `escalate:if-unresolved` - Escalate if not resolved in X time

### User Type Tags
- `user:employee` - Issued by employee/timekeeper
- `user:supervisor` - Issued by supervisor/approver
- `user:admin` - Issued by administrator
- `user:finance` - Issued by finance/payroll staff
- `user:audit` - Related to audit or compliance review

### Resolution Tags
- `resolved:self-service` - User resolved with self-service guides
- `resolved:automated` - Resolved by automated response
- `resolved:human` - Resolved by human agent
- `resolved:escalated` - Escalated to specialist
- `pending:customer-action` - Waiting for customer to provide info
- `pending:product-fix` - Waiting for engineering fix

### Business Impact Tags
- `impact:payroll` - Affects payroll processing
- `impact:audit` - Audit or compliance related
- `impact:billing` - Affects customer billing
- `impact:DCAA` - DCAA compliance concern
- `impact:single-user` - Affects one user only
- `impact:department` - Affects entire department
- `impact:organization` - Affects entire organization

### Time-Sensitivity Tags
- `time-sensitive:deadline` - Payroll/audit deadline approaching
- `time-sensitive:urgent` - User reports urgent need
- `time-sensitive:routine` - Standard support request

---

## Part 7: Canned Response Templates

### Template A: Initial Triage Response (All Categories)
```
Thank you for contacting HourTimesheet support!

I'm here to help you with your issue. To get you the fastest resolution,
please provide:

1. What are you trying to do?
2. What error message do you see (if any)?
3. When did this start happening?
4. What have you already tried?

Based on your situation, I'll either:
- Guide you through a self-service fix (5-15 min)
- Connect you with a specialist (if needed)

Please reply with those details so I can assist you!
```

### Template B: DCAA Compliance Education (Categories 2, 9, 11, 12, 19)
```
Great question about DCAA compliance! Let me clarify:

**DCAA Requirement:** Timesheets must have:
✓ Employee recording time DAILY as work is performed
✓ Employee signature certifying accuracy each pay period
✓ Supervisor MEANINGFUL REVIEW and approval
✓ EVERY change documented (who, when, what, why)
✓ Audit trail showing complete change history
✓ Regular management oversight and training

**What HourTimesheet provides:**
✓ Daily time entry tracking
✓ Electronic signatures by employees
✓ Supervisor approval workflow with audit trail
✓ Automatic logging of all changes
✓ Complete change documentation (user, timestamp, reason)
✓ Reports to demonstrate audit trail for inspectors

**Your organization's responsibility:**
✓ Use the system correctly (daily entry, not retroactive)
✓ Have supervisors actually review, not bulk-approve
✓ Document reasons for all corrections
✓ Provide staff training on timekeeping requirements
✓ Maintain records for auditor review

Is there a specific DCAA requirement you'd like me to address?
```

### Template C: Integration Setup Guidance (Categories 1, 6, 8)
```
Let me help you get your [QB/ADP/Integration] working correctly.

**Before we start, I need to know:**
1. Which payroll system: QuickBooks Desktop / QuickBooks Online / ADP?
2. Is this first-time setup or fixing an existing issue?
3. How many employees are you syncing?

**Here's the general process:**
1. **Verify your system setup** - I'll check your QB/ADP configuration
2. **Verify HTS integration settings** - Check export settings in HTS
3. **Test with sample data** - Export for one employee, one period
4. **Validate the export** - Check file contents match expectations
5. **Import and verify** - Complete full import with validation

**Common issues I can help with:**
- QuickBooks Web Connector configuration
- Employee ID/rate code mapping
- File format validation
- Sync troubleshooting

Ready to get started? Let me know your system and current status!
```

### Template D: Permission Issue Resolution (Category 7)
```
I can help you regain access!

**Let me confirm your setup:**
1. Your job title/role?
2. What are you trying to do that you can't?
3. When was your account created or last changed?

**What I'll check:**
- Your assigned role (Employee/Supervisor/Admin)
- Your project/team assignments
- Your approval authority (if supervisor)
- Browser cache/session issues

**Common fixes:**
- Browser cache clear (usually fixes it)
- Role assignment verification (admin level)
- Project membership confirmation
- Session re-login after changes

Let me start by confirming your role and what you're trying to access.
```

### Template E: Charge Code Error Correction (Category 3)
```
I can help correct that charge code issue and prevent it happening again.

**Tell me about the error:**
1. Which employee's timesheet?
2. Wrong code used vs. correct code should be?
3. How many hours affected?
4. Date range affected?
5. Has this already been sent to payroll?

**I'll help with:**
✓ Identifying why the error occurred
✓ Correcting the affected hours
✓ Documenting the change (DCAA audit trail)
✓ Preventing similar errors in future

**If this is a pattern issue:**
- Check if employee training is needed
- Verify project access restrictions are configured
- Review supervisor's approval process
- Possible system configuration improvement

What's the charge code issue we need to fix?
```

### Template F: Approval Workflow Coaching (Categories 2, 12)
```
Let me explain timesheet approvals and help you streamline the process.

**DCAA Requirement - Meaningful Review:**
Supervisors must actually examine each timesheet:
- Are hours reasonable for the employee/project?
- Are charge codes correct and valid?
- Are there any unusual patterns or corrections?
- Is the signature and audit trail complete?

**Then click Approve** - This adds supervisor signature and completes approval.

**Key Point:** Supervisors cannot "bulk approve all" without reviewing each one.
Auditors specifically look for evidence of individual review, not just one-click approval.

**To make approvals faster while staying DCAA-compliant:**
Option 1: Use grouped view - see multiple timesheets at once, review quickly
Option 2: Flag anomalies - system highlights unusual ones for detailed review
Option 3: Approval checklist - standardized questions to verify in 30 seconds per sheet

**How many timesheets do you approve per pay period?**
That will help me recommend the best efficiency approach for your team.
```

### Template G: Escalation to Human (Severity/Complexity)
```
Thank you for the details. Your issue requires specialized expertise,
and I'm connecting you with a specialist who can help.

**Your issue:** [Summary]
**Ticket ID:** [HTS-XXXXX]
**Priority:** [High/Medium/Low]
**Expected Response:** [24 hours / 4 hours / URGENT]

**While you wait:**
- Our specialist will review your full situation
- They may need to access your account to diagnose (we'll ask permission)
- For [Category] issues, typical resolution takes [timeframe]

**In the meantime:**
[Suggest any interim workarounds or preparations]

You'll hear from us shortly!
```

### Template H: Feature Request Submission (Category 20)
```
Thank you for the suggestion! We appreciate your feedback.

**Your Request:** [Echo back request]

**What happens next:**
1. Your feedback is submitted to our product team (Request ID: HTS-XXXXX)
2. Product team reviews all feedback to prioritize improvements
3. We look for patterns (multiple customers requesting same feature = higher priority)
4. Roadmap decisions are made quarterly

**You'll hear from us if:**
- We add this to our development roadmap
- We have an update on similar requests
- We release a feature that addresses your need

**Timeline:** Product decisions typically happen quarterly, releases every month.

**In the meantime:**
[If workarounds exist, suggest them]

Thanks again for helping us improve HourTimesheet!
```

### Template I: Self-Service Knowledge Base Link (By Category)
```
[Category-specific knowledge base link]

**Quick Guide:** [Specific article link]
**Video Tutorial:** [If available]
**Related Articles:**
- [Link 1]
- [Link 2]
- [Link 3]

**If this guide doesn't solve your issue:**
Reply with what you've tried, and I'll help you further!
```

### Template J: Training/Coaching Recommendation (For Patterns)
```
I'm noticing a pattern in your support tickets that suggests your team
could benefit from targeted training.

**Pattern identified:** [Description of repeated issue]
**Impact:** [Effect on payroll, compliance, operations]
**Recommended action:** [Brief training or documentation]

**We can help:**
- Schedule a team training session
- Provide training materials/documentation
- Create a quick reference guide for [specific process]
- Conduct a process review to identify root causes

**Options:**
1. **Self-guided** - I can send materials; your team learns independently
2. **Live training** - Group call with our support team (best for complex topics)
3. **Documentation** - Written guide you can share with staff

Would you like me to arrange training for your team?
```

---

## Appendix A: Knowledge Base Article Recommendations

Priority knowledge base articles to create (linked in canned responses):

1. **"How DCAA Compliance Works in HourTimesheet"** (Category 19, 9)
2. **"Timesheet Approval Process: Step-by-Step Guide"** (Category 2)
3. **"How to Correct a Timesheet Error"** (Category 11)
4. **"QuickBooks Integration Troubleshooting Guide"** (Category 1)
5. **"Setting Up User Roles and Permissions"** (Category 7)
6. **"ADP Payroll Export: Complete Guide"** (Category 6)
7. **"Mobile App: Sync Troubleshooting"** (Category 5)
8. **"Browser Compatibility and Cache Clearing"** (Category 17)
9. **"Project & Charge Code Selection Guide"** (Category 3)
10. **"Multi-Level Timesheet Approvals Setup"** (Category 15)

---

## Appendix B: Support Workflow Recommendations

**Recommended Zendesk Settings:**

- **Auto-response:** Immediate acknowledgment with ticket ID
- **SLA - Critical:** 1 hour first response, 4 hour resolution target
- **SLA - High:** 4 hour first response, 24 hour resolution target
- **SLA - Medium:** 24 hour first response, 48 hour resolution target
- **SLA - Low:** 48 hour first response, 7 day resolution target

**Recommended routing:**
- **Tier 1 (Automated/Self-Service):** Login, browser, feature requests (50% of tickets)
- **Tier 2 (Junior Support):** Guided troubleshooting, approval workflows (30%)
- **Tier 3 (Senior/Specialist):** Integration, DCAA, complex setup (15%)
- **Escalation (Product/Engineering):** Bugs, performance, API issues (5%)

---

## Document Completion

**This analysis document provides:**
- ✓ 20 issue categories ranked by frequency
- ✓ Detailed resolution playbooks for each category
- ✓ Automation readiness assessment
- ✓ Escalation triggers and routing
- ✓ Resolution complexity ratings
- ✓ Zendesk tag recommendations
- ✓ Canned response templates
- ✓ Knowledge base recommendations
- ✓ Support workflow guidance

**Next Steps for Implementation:**
1. Import Zendesk tags into instance
2. Create knowledge base articles (Appendix A)
3. Configure automation rules (Tier 1 categories)
4. Train support team on playbooks (Categories 1-20)
5. Set up escalation workflows
6. Monitor and adjust based on ticket patterns

---

**Document Version:** 1.0
**Last Updated:** 2026-03-19
**For:** minute7.zendesk.com / HourTimesheet Product Support
**Reference:** GitHub Issue #93
