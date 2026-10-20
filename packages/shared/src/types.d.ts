import { z } from 'zod';
export declare const UserRoleSchema: z.ZodEnum<["USER", "ADMIN"]>;
export type UserRole = z.infer<typeof UserRoleSchema>;
export declare const UserSchema: z.ZodObject<{
    id: z.ZodString;
    googleSubject: z.ZodString;
    email: z.ZodString;
    name: z.ZodString;
    avatarUrl: z.ZodNullable<z.ZodString>;
    role: z.ZodEnum<["USER", "ADMIN"]>;
    createdAt: z.ZodString;
    updatedAt: z.ZodString;
    lastLoginAt: z.ZodNullable<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    name: string;
    role: "ADMIN" | "USER";
    email: string;
    createdAt: string;
    updatedAt: string;
    id: string;
    googleSubject: string;
    avatarUrl: string | null;
    lastLoginAt: string | null;
}, {
    name: string;
    role: "ADMIN" | "USER";
    email: string;
    createdAt: string;
    updatedAt: string;
    id: string;
    googleSubject: string;
    avatarUrl: string | null;
    lastLoginAt: string | null;
}>;
export type User = z.infer<typeof UserSchema>;
export declare const PublicUserSchema: z.ZodObject<Omit<{
    id: z.ZodString;
    googleSubject: z.ZodString;
    email: z.ZodString;
    name: z.ZodString;
    avatarUrl: z.ZodNullable<z.ZodString>;
    role: z.ZodEnum<["USER", "ADMIN"]>;
    createdAt: z.ZodString;
    updatedAt: z.ZodString;
    lastLoginAt: z.ZodNullable<z.ZodString>;
}, "googleSubject">, "strip", z.ZodTypeAny, {
    name: string;
    role: "ADMIN" | "USER";
    email: string;
    createdAt: string;
    updatedAt: string;
    id: string;
    avatarUrl: string | null;
    lastLoginAt: string | null;
}, {
    name: string;
    role: "ADMIN" | "USER";
    email: string;
    createdAt: string;
    updatedAt: string;
    id: string;
    avatarUrl: string | null;
    lastLoginAt: string | null;
}>;
export type PublicUser = z.infer<typeof PublicUserSchema>;
export declare const SenderSchema: z.ZodObject<{
    id: z.ZodString;
    userId: z.ZodString;
    displayName: z.ZodString;
    fromEmail: z.ZodString;
    smtpHost: z.ZodString;
    smtpPort: z.ZodNumber;
    smtpUser: z.ZodString;
    smtpPasswordEncrypted: z.ZodString;
    isActive: z.ZodBoolean;
    hourlyLimit: z.ZodNullable<z.ZodNumber>;
    minDelayMs: z.ZodNullable<z.ZodNumber>;
    createdAt: z.ZodString;
    updatedAt: z.ZodString;
}, "strip", z.ZodTypeAny, {
    userId: string;
    createdAt: string;
    updatedAt: string;
    isActive: boolean;
    id: string;
    displayName: string;
    fromEmail: string;
    smtpHost: string;
    smtpPort: number;
    smtpUser: string;
    smtpPasswordEncrypted: string;
    hourlyLimit: number | null;
    minDelayMs: number | null;
}, {
    userId: string;
    createdAt: string;
    updatedAt: string;
    isActive: boolean;
    id: string;
    displayName: string;
    fromEmail: string;
    smtpHost: string;
    smtpPort: number;
    smtpUser: string;
    smtpPasswordEncrypted: string;
    hourlyLimit: number | null;
    minDelayMs: number | null;
}>;
export type Sender = z.infer<typeof SenderSchema>;
export declare const SenderPublicSchema: z.ZodObject<Omit<{
    id: z.ZodString;
    userId: z.ZodString;
    displayName: z.ZodString;
    fromEmail: z.ZodString;
    smtpHost: z.ZodString;
    smtpPort: z.ZodNumber;
    smtpUser: z.ZodString;
    smtpPasswordEncrypted: z.ZodString;
    isActive: z.ZodBoolean;
    hourlyLimit: z.ZodNullable<z.ZodNumber>;
    minDelayMs: z.ZodNullable<z.ZodNumber>;
    createdAt: z.ZodString;
    updatedAt: z.ZodString;
}, "smtpHost" | "smtpPort" | "smtpUser" | "smtpPasswordEncrypted">, "strip", z.ZodTypeAny, {
    userId: string;
    createdAt: string;
    updatedAt: string;
    isActive: boolean;
    id: string;
    displayName: string;
    fromEmail: string;
    hourlyLimit: number | null;
    minDelayMs: number | null;
}, {
    userId: string;
    createdAt: string;
    updatedAt: string;
    isActive: boolean;
    id: string;
    displayName: string;
    fromEmail: string;
    hourlyLimit: number | null;
    minDelayMs: number | null;
}>;
export type SenderPublic = z.infer<typeof SenderPublicSchema>;
export declare const CampaignSchema: z.ZodObject<{
    id: z.ZodString;
    userId: z.ZodString;
    senderId: z.ZodString;
    name: z.ZodNullable<z.ZodString>;
    subject: z.ZodString;
    body: z.ZodString;
    startAt: z.ZodString;
    minDelayBetweenEmailsMs: z.ZodNumber;
    maxEmailsPerHour: z.ZodNumber;
    createdAt: z.ZodString;
    updatedAt: z.ZodString;
}, "strip", z.ZodTypeAny, {
    name: string | null;
    userId: string;
    senderId: string;
    subject: string;
    body: string;
    createdAt: string;
    updatedAt: string;
    id: string;
    startAt: string;
    minDelayBetweenEmailsMs: number;
    maxEmailsPerHour: number;
}, {
    name: string | null;
    userId: string;
    senderId: string;
    subject: string;
    body: string;
    createdAt: string;
    updatedAt: string;
    id: string;
    startAt: string;
    minDelayBetweenEmailsMs: number;
    maxEmailsPerHour: number;
}>;
export type Campaign = z.infer<typeof CampaignSchema>;
export declare const CreateCampaignSchema: z.ZodObject<{
    name: z.ZodOptional<z.ZodString>;
    senderId: z.ZodString;
    subject: z.ZodString;
    body: z.ZodString;
    startAt: z.ZodString;
    minDelayBetweenEmailsMs: z.ZodNumber;
    maxEmailsPerHour: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    senderId: string;
    subject: string;
    body: string;
    startAt: string;
    minDelayBetweenEmailsMs: number;
    maxEmailsPerHour: number;
    name?: string | undefined;
}, {
    senderId: string;
    subject: string;
    body: string;
    startAt: string;
    minDelayBetweenEmailsMs: number;
    maxEmailsPerHour: number;
    name?: string | undefined;
}>;
export type CreateCampaignInput = z.infer<typeof CreateCampaignSchema>;
export declare const EmailStatusSchema: z.ZodEnum<["SCHEDULED", "SENDING", "SENT", "FAILED", "CANCELLED"]>;
export type EmailStatus = z.infer<typeof EmailStatusSchema>;
export declare const ScheduledEmailSchema: z.ZodObject<{
    id: z.ZodString;
    userId: z.ZodString;
    campaignId: z.ZodNullable<z.ZodString>;
    senderId: z.ZodString;
    recipient: z.ZodString;
    subject: z.ZodString;
    body: z.ZodString;
    scheduledAt: z.ZodString;
    status: z.ZodEnum<["SCHEDULED", "SENDING", "SENT", "FAILED", "CANCELLED"]>;
    sentAt: z.ZodNullable<z.ZodString>;
    failedAt: z.ZodNullable<z.ZodString>;
    providerMessageId: z.ZodNullable<z.ZodString>;
    providerResponse: z.ZodNullable<z.ZodUnknown>;
    attemptCount: z.ZodNumber;
    lastErrorCode: z.ZodNullable<z.ZodString>;
    lastErrorMessage: z.ZodNullable<z.ZodString>;
    idempotencyKey: z.ZodString;
    processingLeaseUntil: z.ZodNullable<z.ZodString>;
    createdAt: z.ZodString;
    updatedAt: z.ZodString;
}, "strip", z.ZodTypeAny, {
    status: "FAILED" | "SCHEDULED" | "SENDING" | "SENT" | "CANCELLED";
    userId: string;
    campaignId: string | null;
    senderId: string;
    recipient: string;
    subject: string;
    body: string;
    scheduledAt: string;
    sentAt: string | null;
    failedAt: string | null;
    createdAt: string;
    updatedAt: string;
    id: string;
    providerMessageId: string | null;
    attemptCount: number;
    lastErrorCode: string | null;
    lastErrorMessage: string | null;
    idempotencyKey: string;
    processingLeaseUntil: string | null;
    providerResponse?: unknown;
}, {
    status: "FAILED" | "SCHEDULED" | "SENDING" | "SENT" | "CANCELLED";
    userId: string;
    campaignId: string | null;
    senderId: string;
    recipient: string;
    subject: string;
    body: string;
    scheduledAt: string;
    sentAt: string | null;
    failedAt: string | null;
    createdAt: string;
    updatedAt: string;
    id: string;
    providerMessageId: string | null;
    attemptCount: number;
    lastErrorCode: string | null;
    lastErrorMessage: string | null;
    idempotencyKey: string;
    processingLeaseUntil: string | null;
    providerResponse?: unknown;
}>;
export type ScheduledEmail = z.infer<typeof ScheduledEmailSchema>;
export declare const ScheduleEmailsSchema: z.ZodObject<{
    campaignId: z.ZodOptional<z.ZodString>;
    senderId: z.ZodString;
    subject: z.ZodOptional<z.ZodString>;
    body: z.ZodOptional<z.ZodString>;
    recipients: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    startAt: z.ZodString;
    minDelayBetweenEmailsMs: z.ZodDefault<z.ZodNumber>;
    maxEmailsPerHour: z.ZodDefault<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    senderId: string;
    startAt: string;
    minDelayBetweenEmailsMs: number;
    maxEmailsPerHour: number;
    campaignId?: string | undefined;
    subject?: string | undefined;
    body?: string | undefined;
    recipients?: string[] | undefined;
}, {
    senderId: string;
    startAt: string;
    campaignId?: string | undefined;
    subject?: string | undefined;
    body?: string | undefined;
    minDelayBetweenEmailsMs?: number | undefined;
    maxEmailsPerHour?: number | undefined;
    recipients?: string[] | undefined;
}>;
export type ScheduleEmailsInput = z.infer<typeof ScheduleEmailsSchema>;
export declare const EmailListQuerySchema: z.ZodObject<{
    status: z.ZodOptional<z.ZodEnum<["SCHEDULED", "SENDING", "SENT", "FAILED", "CANCELLED"]>>;
    senderId: z.ZodOptional<z.ZodString>;
    campaignId: z.ZodOptional<z.ZodString>;
    cursor: z.ZodOptional<z.ZodString>;
    limit: z.ZodDefault<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    limit: number;
    status?: "FAILED" | "SCHEDULED" | "SENDING" | "SENT" | "CANCELLED" | undefined;
    campaignId?: string | undefined;
    senderId?: string | undefined;
    cursor?: string | undefined;
}, {
    status?: "FAILED" | "SCHEDULED" | "SENDING" | "SENT" | "CANCELLED" | undefined;
    campaignId?: string | undefined;
    senderId?: string | undefined;
    cursor?: string | undefined;
    limit?: number | undefined;
}>;
export type EmailListQuery = z.infer<typeof EmailListQuerySchema>;
export declare const EmailSearchQuerySchema: z.ZodObject<{
    q: z.ZodOptional<z.ZodString>;
    status: z.ZodOptional<z.ZodArray<z.ZodEnum<["SCHEDULED", "SENDING", "SENT", "FAILED", "CANCELLED"]>, "many">>;
    senderId: z.ZodOptional<z.ZodString>;
    campaignId: z.ZodOptional<z.ZodString>;
    from: z.ZodOptional<z.ZodString>;
    to: z.ZodOptional<z.ZodString>;
    cursor: z.ZodOptional<z.ZodString>;
    limit: z.ZodDefault<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    limit: number;
    status?: ("FAILED" | "SCHEDULED" | "SENDING" | "SENT" | "CANCELLED")[] | undefined;
    campaignId?: string | undefined;
    senderId?: string | undefined;
    cursor?: string | undefined;
    q?: string | undefined;
    from?: string | undefined;
    to?: string | undefined;
}, {
    status?: ("FAILED" | "SCHEDULED" | "SENDING" | "SENT" | "CANCELLED")[] | undefined;
    campaignId?: string | undefined;
    senderId?: string | undefined;
    cursor?: string | undefined;
    limit?: number | undefined;
    q?: string | undefined;
    from?: string | undefined;
    to?: string | undefined;
}>;
export type EmailSearchQuery = z.infer<typeof EmailSearchQuerySchema>;
export declare const PaginatedResponseSchema: <T extends z.ZodTypeAny>(itemSchema: T) => z.ZodObject<{
    items: z.ZodArray<T, "many">;
    nextCursor: z.ZodOptional<z.ZodString>;
    hasMore: z.ZodBoolean;
    totalHits: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    items: T["_output"][];
    hasMore: boolean;
    nextCursor?: string | undefined;
    totalHits?: number | undefined;
}, {
    items: T["_input"][];
    hasMore: boolean;
    nextCursor?: string | undefined;
    totalHits?: number | undefined;
}>;
export declare const SlackConnectionSchema: z.ZodObject<{
    id: z.ZodString;
    userId: z.ZodString;
    teamId: z.ZodString;
    teamName: z.ZodString;
    botUserId: z.ZodString;
    channelId: z.ZodString;
    channelName: z.ZodString;
    botTokenEncrypted: z.ZodString;
    scopes: z.ZodArray<z.ZodString, "many">;
    status: z.ZodEnum<["ACTIVE", "DISCONNECTED", "REVOKED"]>;
    connectedAt: z.ZodString;
    disconnectedAt: z.ZodNullable<z.ZodString>;
    createdAt: z.ZodString;
    updatedAt: z.ZodString;
}, "strip", z.ZodTypeAny, {
    status: "ACTIVE" | "DISCONNECTED" | "REVOKED";
    userId: string;
    createdAt: string;
    updatedAt: string;
    id: string;
    teamId: string;
    teamName: string;
    botUserId: string;
    channelId: string;
    channelName: string;
    botTokenEncrypted: string;
    scopes: string[];
    connectedAt: string;
    disconnectedAt: string | null;
}, {
    status: "ACTIVE" | "DISCONNECTED" | "REVOKED";
    userId: string;
    createdAt: string;
    updatedAt: string;
    id: string;
    teamId: string;
    teamName: string;
    botUserId: string;
    channelId: string;
    channelName: string;
    botTokenEncrypted: string;
    scopes: string[];
    connectedAt: string;
    disconnectedAt: string | null;
}>;
export type SlackConnection = z.infer<typeof SlackConnectionSchema>;
export declare const SlackStatusSchema: z.ZodObject<Omit<{
    id: z.ZodString;
    userId: z.ZodString;
    teamId: z.ZodString;
    teamName: z.ZodString;
    botUserId: z.ZodString;
    channelId: z.ZodString;
    channelName: z.ZodString;
    botTokenEncrypted: z.ZodString;
    scopes: z.ZodArray<z.ZodString, "many">;
    status: z.ZodEnum<["ACTIVE", "DISCONNECTED", "REVOKED"]>;
    connectedAt: z.ZodString;
    disconnectedAt: z.ZodNullable<z.ZodString>;
    createdAt: z.ZodString;
    updatedAt: z.ZodString;
}, "botTokenEncrypted">, "strip", z.ZodTypeAny, {
    status: "ACTIVE" | "DISCONNECTED" | "REVOKED";
    userId: string;
    createdAt: string;
    updatedAt: string;
    id: string;
    teamId: string;
    teamName: string;
    botUserId: string;
    channelId: string;
    channelName: string;
    scopes: string[];
    connectedAt: string;
    disconnectedAt: string | null;
}, {
    status: "ACTIVE" | "DISCONNECTED" | "REVOKED";
    userId: string;
    createdAt: string;
    updatedAt: string;
    id: string;
    teamId: string;
    teamName: string;
    botUserId: string;
    channelId: string;
    channelName: string;
    scopes: string[];
    connectedAt: string;
    disconnectedAt: string | null;
}>;
export type SlackStatus = z.infer<typeof SlackStatusSchema>;
export declare const ApiResponseSchema: <T extends z.ZodTypeAny>(dataSchema: T) => z.ZodObject<{
    success: z.ZodBoolean;
    data: z.ZodOptional<T>;
    error: z.ZodOptional<z.ZodObject<{
        code: z.ZodString;
        message: z.ZodString;
        details: z.ZodOptional<z.ZodArray<z.ZodObject<{
            field: z.ZodString;
            message: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            message: string;
            field: string;
        }, {
            message: string;
            field: string;
        }>, "many">>;
    }, "strip", z.ZodTypeAny, {
        code: string;
        message: string;
        details?: {
            message: string;
            field: string;
        }[] | undefined;
    }, {
        code: string;
        message: string;
        details?: {
            message: string;
            field: string;
        }[] | undefined;
    }>>;
    meta: z.ZodObject<{
        requestId: z.ZodString;
        timestamp: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        timestamp: string;
        requestId: string;
    }, {
        timestamp: string;
        requestId: string;
    }>;
}, "strip", z.ZodTypeAny, z.objectUtil.addQuestionMarks<z.baseObjectOutputType<{
    success: z.ZodBoolean;
    data: z.ZodOptional<T>;
    error: z.ZodOptional<z.ZodObject<{
        code: z.ZodString;
        message: z.ZodString;
        details: z.ZodOptional<z.ZodArray<z.ZodObject<{
            field: z.ZodString;
            message: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            message: string;
            field: string;
        }, {
            message: string;
            field: string;
        }>, "many">>;
    }, "strip", z.ZodTypeAny, {
        code: string;
        message: string;
        details?: {
            message: string;
            field: string;
        }[] | undefined;
    }, {
        code: string;
        message: string;
        details?: {
            message: string;
            field: string;
        }[] | undefined;
    }>>;
    meta: z.ZodObject<{
        requestId: z.ZodString;
        timestamp: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        timestamp: string;
        requestId: string;
    }, {
        timestamp: string;
        requestId: string;
    }>;
}>, any> extends infer T_1 ? { [k in keyof T_1]: T_1[k]; } : never, z.baseObjectInputType<{
    success: z.ZodBoolean;
    data: z.ZodOptional<T>;
    error: z.ZodOptional<z.ZodObject<{
        code: z.ZodString;
        message: z.ZodString;
        details: z.ZodOptional<z.ZodArray<z.ZodObject<{
            field: z.ZodString;
            message: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            message: string;
            field: string;
        }, {
            message: string;
            field: string;
        }>, "many">>;
    }, "strip", z.ZodTypeAny, {
        code: string;
        message: string;
        details?: {
            message: string;
            field: string;
        }[] | undefined;
    }, {
        code: string;
        message: string;
        details?: {
            message: string;
            field: string;
        }[] | undefined;
    }>>;
    meta: z.ZodObject<{
        requestId: z.ZodString;
        timestamp: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        timestamp: string;
        requestId: string;
    }, {
        timestamp: string;
        requestId: string;
    }>;
}> extends infer T_2 ? { [k_1 in keyof T_2]: T_2[k_1]; } : never>;
export type ApiResponse<T> = {
    success: boolean;
    data?: T;
    error?: {
        code: string;
        message: string;
        details?: {
            field: string;
            message: string;
        }[];
    };
    meta: {
        requestId: string;
        timestamp: string;
    };
};
export declare function createSuccessResponse<T>(data: T, requestId: string): ApiResponse<T>;
export declare function createErrorResponse(code: string, message: string, requestId: string, details?: {
    field: string;
    message: string;
}[]): ApiResponse<never>;
//# sourceMappingURL=types.d.ts.map