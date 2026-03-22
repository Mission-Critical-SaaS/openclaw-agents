#!/usr/bin/env python3
"""
Google Sheets Creation Script with Service Account
Creates the Sales Prospecting Dashboard with 9 tabs.
"""
import json
import boto3
import sys

from google.oauth2 import service_account
from googleapiclient.discovery import build
from typing import Dict, List, Any


class GoogleSheetCreator:
    SCOPES = [
        'https://www.googleapis.com/auth/spreadsheets',
        'https://www.googleapis.com/auth/drive'
    ]

    TABS_CONFIG = {
        'Streams': {
            'headers': ['stream_id', 'stream_name', 'product', 'target_industry', 'active', 'created_date'],
            'sample_data': [['HTS-FED', 'Hour Timesheet Federal Contracts', 'Hour Timesheet', 'Federal Government', 'TRUE', '2026-03-17']]
        },
        'Policies': {
            'headers': ['policy_id', 'stream_id', 'min_employees', 'max_employees', 'min_contract_value', 'max_contract_value', 'target_roles', 'excluded_industries', 'active'],
            'sample_data': [['POL-001', 'HTS-FED', '50', '5000', '100000', '999999999', 'CEO;CFO;VP Finance;Director of Finance;Controller', '', 'TRUE']]
        },
        'Templates': {
            'headers': ['template_id', 'stream_id', 'template_name', 'subject_line', 'body_template', 'personalization_fields'],
            'sample_data': [['TPL-001', 'HTS-FED', 'Initial Outreach - Federal Contract Win', 'Congratulations on the {{contract_name}} award', 'Hi {{first_name}} - Congratulations to {{company_name}} on the recent {{contract_name}} contract award. We help federal contractors like you streamline timekeeping and labor compliance with Hour Timesheet. Would you be open to a quick conversation?', 'first_name;company_name;contract_name;contract_value']]
        },
        'Cadence': {
            'headers': ['cadence_id', 'stream_id', 'step_number', 'days_after_previous', 'action_type', 'template_id', 'notes'],
            'sample_data': [
                ['CAD-001', 'HTS-FED', '1', '0', 'email', 'TPL-001', 'Initial outreach'],
                ['CAD-002', 'HTS-FED', '2', '3', 'email', 'TPL-001', 'Follow-up'],
                ['CAD-003', 'HTS-FED', '3', '5', 'email', 'TPL-001', 'Final follow-up']
            ]
        },
        'Incoming': {
            'headers': ['incoming_id', 'source_feed', 'title', 'url', 'published_date', 'raw_content', 'processed', 'stream_id', 'created_date'],
            'sample_data': [['INC-001', 'SAM.gov', 'Federal Contract Opportunity', 'https://example.com/contract', '2026-03-17', 'Raw content here...', 'FALSE', 'HTS-FED', '2026-03-17']]
        },
        'Companies': {
            'headers': ['company_id', 'company_name', 'website', 'industry', 'employee_count', 'annual_revenue', 'hq_city', 'hq_state', 'contract_name', 'contract_value', 'contract_agency', 'source_url', 'enrichment_status', 'stream_id', 'created_date'],
            'sample_data': [['COMP-001', 'Acme Corporation', 'https://acme.com', 'Government Contracting', '500', '50000000', 'Washington', 'DC', 'Federal Timesheet System', '5000000', 'GSA', 'https://sam.gov/contract', 'complete', 'HTS-FED', '2026-03-17']]
        },
        'Contacts': {
            'headers': ['contact_id', 'company_id', 'first_name', 'last_name', 'title', 'email', 'linkedin_url', 'phone', 'source', 'verified', 'stream_id', 'created_date'],
            'sample_data': [['CONT-001', 'COMP-001', 'John', 'Smith', 'VP of Sales', 'john.smith@acme.com', 'https://linkedin.com/in/johnsmith', '202-555-0100', 'LinkedIn', 'TRUE', 'HTS-FED', '2026-03-17']]
        },
        'Outreach': {
            'headers': ['outreach_id', 'contact_id', 'company_id', 'template_id', 'cadence_step', 'status', 'sent_date', 'opened_date', 'replied_date', 'gmail_draft_id', 'stream_id', 'created_date'],
            'sample_data': [['OUT-001', 'CONT-001', 'COMP-001', 'TPL-001', '1', 'sent', '2026-03-17', '', '', 'draft_123', 'HTS-FED', '2026-03-17']]
        },
        'Audit Log': {
            'headers': ['audit_id', 'timestamp', 'agent', 'task_type', 'user_id', 'tier', 'action', 'target', 'result', 'details', 'duration_ms', 'budget_remaining'],
            'sample_data': [['AUD-001', '2026-03-17T09:30:00Z', 'harvest', 'proactive', 'system', 'system', 'rss_poll', 'google-alerts-fed-contracts', 'success', 'Polled 4 feeds, found 3 new articles', '2450', '23/24']]
        }
    }

    def __init__(self, aws_profile='openclaw', aws_region='us-east-1'):
        self.aws_profile = aws_profile
        self.aws_region = aws_region
        self.service_account_key = None
        self.sheets_service = None
        self.drive_service = None

    def retrieve_service_account_key(self):
        session = boto3.Session(profile_name=self.aws_profile)
        secrets_client = session.client('secretsmanager', region_name=self.aws_region)
        response = secrets_client.get_secret_value(SecretId='sales-prospecting/google-sheets-sa-key')
        if 'SecretString' in response:
            secret_value = response['SecretString']
        else:
            secret_value = response['SecretBinary'].decode('utf-8')
        self.service_account_key = json.loads(secret_value)
        print(f"[OK] Retrieved service account key for: {self.service_account_key.get('client_email', 'unknown')}")
        return self.service_account_key

    def authenticate(self):
        if not self.service_account_key:
            self.retrieve_service_account_key()
        credentials = service_account.Credentials.from_service_account_info(
            self.service_account_key, scopes=self.SCOPES
        )
        self.sheets_service = build('sheets', 'v4', credentials=credentials)
        self.drive_service = build('drive', 'v3', credentials=credentials)
        print("[OK] Authenticated with Google Sheets and Drive APIs")

    def create_spreadsheet(self, title="Sales Prospecting Dashboard"):
        spreadsheet = {'properties': {'title': title}}
        result = self.sheets_service.spreadsheets().create(
            body=spreadsheet, fields='spreadsheetId'
        ).execute()
        spreadsheet_id = result.get('spreadsheetId')
        print(f"[OK] Created spreadsheet: {spreadsheet_id}")
        return spreadsheet_id

    def add_sheets_and_headers(self, spreadsheet_id):
        # First, add all tabs then delete the default Sheet1
        requests = []
        sheet_id = 1
        for tab_name, config in self.TABS_CONFIG.items():
            requests.append({
                'addSheet': {
                    'properties': {
                        'sheetId': sheet_id,
                        'title': tab_name,
                        'gridProperties': {
                            'rowCount': 1000,
                            'columnCount': len(config['headers'])
                        }
                    }
                }
            })
            sheet_id += 1

        # Delete default Sheet1 (sheetId 0)
        requests.append({'deleteSheet': {'sheetId': 0}})

        self.sheets_service.spreadsheets().batchUpdate(
            spreadsheetId=spreadsheet_id,
            body={'requests': requests}
        ).execute()
        print(f"[OK] Created {len(self.TABS_CONFIG)} tabs")

        # Populate headers and sample data
        self._populate_sheet_data(spreadsheet_id)

        # Format headers (bold, frozen)
        self._format_headers(spreadsheet_id)

    def _populate_sheet_data(self, spreadsheet_id):
        data = []
        for tab_name, config in self.TABS_CONFIG.items():
            data.append({
                'range': f"'{tab_name}'!A1",
                'values': [config['headers']]
            })
            if config['sample_data']:
                data.append({
                    'range': f"'{tab_name}'!A2",
                    'values': config['sample_data']
                })

        self.sheets_service.spreadsheets().values().batchUpdate(
            spreadsheetId=spreadsheet_id,
            body={'data': data, 'valueInputOption': 'RAW'}
        ).execute()
        print("[OK] Populated headers and sample data")

    def _format_headers(self, spreadsheet_id):
        requests = []
        sheet_id = 1
        for tab_name in self.TABS_CONFIG:
            # Bold header row
            requests.append({
                'repeatCell': {
                    'range': {
                        'sheetId': sheet_id,
                        'startRowIndex': 0,
                        'endRowIndex': 1
                    },
                    'cell': {
                        'userEnteredFormat': {
                            'textFormat': {'bold': True},
                            'backgroundColor': {
                                'red': 0.9,
                                'green': 0.9,
                                'blue': 0.95
                            }
                        }
                    },
                    'fields': 'userEnteredFormat(textFormat,backgroundColor)'
                }
            })
            # Freeze header row
            requests.append({
                'updateSheetProperties': {
                    'properties': {
                        'sheetId': sheet_id,
                        'gridProperties': {'frozenRowCount': 1}
                    },
                    'fields': 'gridProperties.frozenRowCount'
                }
            })
            sheet_id += 1

        self.sheets_service.spreadsheets().batchUpdate(
            spreadsheetId=spreadsheet_id,
            body={'requests': requests}
        ).execute()
        print("[OK] Formatted headers (bold, frozen)")

    def share_with_user(self, spreadsheet_id, email, role='writer'):
        permission = {
            'type': 'user',
            'role': role,
            'emailAddress': email
        }
        self.drive_service.permissions().create(
            fileId=spreadsheet_id,
            body=permission,
            fields='id'
        ).execute()
        print(f"[OK] Shared with {email} as {role}")

    def get_spreadsheet_url(self, spreadsheet_id):
        return f"https://docs.google.com/spreadsheets/d/{spreadsheet_id}/edit"

    def create_complete_dashboard(self, title="Sales Prospecting Dashboard", share_emails=None):
        if share_emails is None:
            share_emails = ["david@lmntl.ai"]

        print("=" * 60)
        print("Sales Prospecting Dashboard - Google Sheet Creation")
        print("=" * 60)

        self.authenticate()
        spreadsheet_id = self.create_spreadsheet(title)
        self.add_sheets_and_headers(spreadsheet_id)

        for email in share_emails:
            self.share_with_user(spreadsheet_id, email, role='writer')

        url = self.get_spreadsheet_url(spreadsheet_id)

        print("=" * 60)
        print(f"SPREADSHEET URL: {url}")
        print(f"SPREADSHEET ID:  {spreadsheet_id}")
        print(f"SHARED WITH:     {', '.join(share_emails)}")
        print("=" * 60)

        return {
            'spreadsheet_id': spreadsheet_id,
            'url': url,
            'shared_with': share_emails
        }


def main():
    creator = GoogleSheetCreator(aws_profile='openclaw', aws_region='us-east-1')
    result = creator.create_complete_dashboard(
        title="Sales Prospecting Dashboard",
        share_emails=["david@lmntl.ai"]
    )
    # Write result to file for downstream use
    with open('/sessions/kind-peaceful-darwin/sheet_result.json', 'w') as f:
        json.dump(result, f, indent=2)
    print(f"\nResult saved to sheet_result.json")
    return result


if __name__ == "__main__":
    main()
