/**
 * Audit Logging Helper
 *
 * Logs all tool invocations to CloudWatch for security and debugging.
 * Includes caller ID, action, timestamp, and sanitized parameters.
 */

interface AuditLogEntry {
  timestamp: string;
  callerId: string;
  action: string;
  status: 'success' | 'error';
  message?: string;
  error?: string;
}

/**
 * Log an audit entry to CloudWatch.
 *
 * @param entry The audit log entry
 */
export function logAudit(entry: AuditLogEntry): void {
  const logEntry = {
    timestamp: entry.timestamp || new Date().toISOString(),
    callerId: entry.callerId,
    action: entry.action,
    status: entry.status,
    ...(entry.message && { message: entry.message }),
    ...(entry.error && { error: entry.error }),
  };

  console.log(JSON.stringify(logEntry));
}

/**
 * Log a successful action.
 *
 * @param callerId The caller's phone number
 * @param action The action performed (e.g., "send_sms", "create_ticket")
 * @param message Optional message (e.g., "SMS sent to +12025551234")
 */
export function logSuccess(callerId: string, action: string, message?: string): void {
  logAudit({
    timestamp: new Date().toISOString(),
    callerId,
    action,
    status: 'success',
    message,
  });
}

/**
 * Log a failed action.
 *
 * @param callerId The caller's phone number
 * @param action The action that failed
 * @param error The error message or Error object
 */
export function logError(callerId: string, action: string, error: string | Error): void {
  const errorMessage = error instanceof Error ? error.message : error;

  logAudit({
    timestamp: new Date().toISOString(),
    callerId,
    action,
    status: 'error',
    error: errorMessage,
  });
}
