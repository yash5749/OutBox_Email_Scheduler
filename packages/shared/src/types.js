import { z } from 'zod';
// ============================================================================
// Auth
// ============================================================================
export const UserRoleSchema = z.enum(['USER', 'ADMIN']);
export const UserSchema = z.object({
    id: z.string().uuid(),
    googleSubject: z.string(),
    email: z.string().email(),
    name: z.string(),
    avatarUrl: z.string().url().nullable(),
    role: UserRoleSchema,
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    lastLoginAt: z.string().datetime().nullable(),
});
export const PublicUserSchema = UserSchema.omit({ googleSubject: true });
// ============================================================================
// Senders
// ============================================================================
export const SenderSchema = z.object({
    id: z.string().uuid(),
    userId: z.string().uuid(),
    displayName: z.string(),
    fromEmail: z.string().email(),
    smtpHost: z.string(),
    smtpPort: z.number().int().positive(),
    smtpUser: z.string(),
    smtpPasswordEncrypted: z.string(),
    isActive: z.boolean(),
    hourlyLimit: z.number().int().positive().nullable(),
    minDelayMs: z.number().int().positive().nullable(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
});
export const SenderPublicSchema = SenderSchema.omit({
    smtpPasswordEncrypted: true,
    smtpUser: true,
    smtpHost: true,
    smtpPort: true,
});
// ============================================================================
// Campaigns
// ============================================================================
export const CampaignSchema = z.object({
    id: z.string().uuid(),
    userId: z.string().uuid(),
    senderId: z.string().uuid(),
    name: z.string().nullable(),
    subject: z.string(),
    body: z.string(),
    startAt: z.string().datetime(),
    minDelayBetweenEmailsMs: z.number().int().positive(),
    maxEmailsPerHour: z.number().int().positive(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
});
export const CreateCampaignSchema = z.object({
    name: z.string().max(255).optional(),
    senderId: z.string().uuid(),
    subject: z.string().min(1).max(500),
    body: z.string().min(1),
    startAt: z.string().datetime(),
    minDelayBetweenEmailsMs: z.number().int().positive().min(100).max(3600000),
    maxEmailsPerHour: z.number().int().positive().min(1).max(10000),
});
// ============================================================================
// Scheduled Emails
// ============================================================================
export const EmailStatusSchema = z.enum(['SCHEDULED', 'SENDING', 'SENT', 'FAILED', 'CANCELLED']);
export const ScheduledEmailSchema = z.object({
    id: z.string().uuid(),
    userId: z.string().uuid(),
    campaignId: z.string().uuid().nullable(),
    senderId: z.string().uuid(),
    recipient: z.string().email(),
    subject: z.string(),
    body: z.string(),
    scheduledAt: z.string().datetime(),
    status: EmailStatusSchema,
    sentAt: z.string().datetime().nullable(),
    failedAt: z.string().datetime().nullable(),
    providerMessageId: z.string().nullable(),
    providerResponse: z.unknown().nullable(),
    attemptCount: z.number().int(),
    lastErrorCode: z.string().nullable(),
    lastErrorMessage: z.string().nullable(),
    idempotencyKey: z.string(),
    processingLeaseUntil: z.string().datetime().nullable(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
});
export const ScheduleEmailsSchema = z.object({
    campaignId: z.string().uuid().optional(),
    senderId: z.string().uuid(),
    subject: z.string().min(1).max(500).optional(),
    body: z.string().min(1).optional(),
    recipients: z.array(z.string().email()).optional(),
    startAt: z.string().datetime(),
    minDelayBetweenEmailsMs: z.number().int().positive().min(100).max(3600000).default(2000),
    maxEmailsPerHour: z.number().int().positive().min(1).max(10000).default(200),
});
export const EmailListQuerySchema = z.object({
    status: EmailStatusSchema.optional(),
    senderId: z.string().uuid().optional(),
    campaignId: z.string().uuid().optional(),
    cursor: z.string().optional(),
    limit: z.coerce.number().int().positive().max(200).default(50),
});
export const EmailSearchQuerySchema = z.object({
    q: z.string().optional(),
    status: z.array(EmailStatusSchema).optional(),
    senderId: z.string().uuid().optional(),
    campaignId: z.string().uuid().optional(),
    from: z.string().datetime().optional(),
    to: z.string().datetime().optional(),
    cursor: z.string().optional(),
    limit: z.coerce.number().int().positive().max(200).default(50),
});
export const PaginatedResponseSchema = (itemSchema) => z.object({
    items: z.array(itemSchema),
    nextCursor: z.string().optional(),
    hasMore: z.boolean(),
    totalHits: z.number().int().optional(),
});
// ============================================================================
// Slack
// ============================================================================
export const SlackConnectionSchema = z.object({
    id: z.string().uuid(),
    userId: z.string().uuid(),
    teamId: z.string(),
    teamName: z.string(),
    botUserId: z.string(),
    channelId: z.string(),
    channelName: z.string(),
    botTokenEncrypted: z.string(),
    scopes: z.array(z.string()),
    status: z.enum(['ACTIVE', 'DISCONNECTED', 'REVOKED']),
    connectedAt: z.string().datetime(),
    disconnectedAt: z.string().datetime().nullable(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
});
export const SlackStatusSchema = SlackConnectionSchema.omit({ botTokenEncrypted: true });
// ============================================================================
// Common
// ============================================================================
export const ApiResponseSchema = (dataSchema) => z.object({
    success: z.boolean(),
    data: dataSchema.optional(),
    error: z.object({
        code: z.string(),
        message: z.string(),
        details: z.array(z.object({ field: z.string(), message: z.string() })).optional(),
    }).optional(),
    meta: z.object({
        requestId: z.string().uuid(),
        timestamp: z.string().datetime(),
    }),
});
export function createSuccessResponse(data, requestId) {
    return {
        success: true,
        data,
        meta: { requestId, timestamp: new Date().toISOString() },
    };
}
export function createErrorResponse(code, message, requestId, details) {
    return {
        success: false,
        error: { code, message, details },
        meta: { requestId, timestamp: new Date().toISOString() },
    };
}
//# sourceMappingURL=types.js.map