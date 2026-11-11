import { customType } from "drizzle-orm/pg-core";
import {
  boolean,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/**
 * Kolom biner untuk menyimpan isi berkas langsung di database.
 * Dipakai lampiran surat agar tidak bergantung pada penyimpanan sementara
 * (/tmp) yang hilang setiap instance server berganti.
 */
const bytea = customType<{ data: Buffer; notNull: false; default: false }>({
  dataType() {
    return "bytea";
  },
});

/* ============================== MASTER ============================== */

export const roles = pgTable("roles", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  level: integer("level").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const permissions = pgTable("permissions", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  module: text("module").notNull().default("umum"),
});

export const rolePermissions = pgTable(
  "role_permissions",
  {
    id: serial("id").primaryKey(),
    roleId: integer("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    permissionId: integer("permission_id")
      .notNull()
      .references(() => permissions.id, { onDelete: "cascade" }),
  },
  (t) => [uniqueIndex("role_permissions_unique").on(t.roleId, t.permissionId)],
);

export const departments = pgTable("departments", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  headName: text("head_name"),
  address: text("address"),
  phone: text("phone"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  roleId: integer("role_id")
    .notNull()
    .references(() => roles.id),
  departmentId: integer("department_id").references(() => departments.id, {
    onDelete: "set null",
  }),
  position: text("position"),
  phone: text("phone"),
  nip: text("nip"),
  signatureText: text("signature_text"),
  isActive: boolean("is_active").notNull().default(true),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ========================= TEMPLATE & KATEGORI ======================= */

export const letterCategories = pgTable("letter_categories", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  defaultNumberFormat: text("default_number_format"),
  direction: text("direction").notNull().default("keluar"), // keluar | masuk | internal
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const letterTemplates = pgTable("letter_templates", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  // Kategori opsional: template umum (mis. surat dinas bebas) boleh tanpa kategori.
  // onDelete "set null" agar template tidak ikut terhapus saat kategori dihapus.
  categoryId: integer("category_id").references(() => letterCategories.id, {
    onDelete: "set null",
  }),
  departmentId: integer("department_id").references(() => departments.id, {
    onDelete: "set null",
  }),
  description: text("description"),
  bodyTemplate: text("body_template"),
  docxPath: text("docx_path"),
  docxName: text("docx_name"),
  pdfPath: text("pdf_path"),
  pdfName: text("pdf_name"),
  numberingFormat: text("numbering_format"),
  kopText: text("kop_text"),
  signerName: text("signer_name"),
  signerPosition: text("signer_position"),
  isActive: boolean("is_active").notNull().default(true),
  usageCount: integer("usage_count").notNull().default(0),
  createdBy: integer("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const templateFields = pgTable(
  "template_fields",
  {
    id: serial("id").primaryKey(),
    templateId: integer("template_id")
      .notNull()
      .references(() => letterTemplates.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    label: text("label").notNull(),
    type: text("type").notNull().default("text"),
    options: jsonb("options"),
    isRequired: boolean("is_required").notNull().default(false),
    defaultValue: text("default_value"),
    placeholder: text("placeholder"),
    helpText: text("help_text"),
    sortOrder: integer("sort_order").notNull().default(0),
    source: text("source").notNull().default("detected"), // detected | manual
  },
  (t) => [uniqueIndex("template_fields_unique").on(t.templateId, t.key)],
);

export const numberingSequences = pgTable("numbering_sequences", {
  id: serial("id").primaryKey(),
  scopeKey: text("scope_key").notNull().unique(),
  categoryId: integer("category_id").references(() => letterCategories.id, {
    onDelete: "cascade",
  }),
  departmentId: integer("department_id").references(() => departments.id, {
    onDelete: "cascade",
  }),
  year: integer("year").notNull(),
  lastNumber: integer("last_number").notNull().default(0),
  format: text("format"),
  letterCode: text("letter_code"),
  organizationCode: text("organization_code"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ============================== SURAT =============================== */

export const letters = pgTable("letters", {
  id: serial("id").primaryKey(),
  letterNumber: text("letter_number"),
  agendaNumber: text("agenda_number"),
  title: text("title").notNull(), // perihal
  // Mengikuti kategori template; bila template tanpa kategori, surat pun boleh tanpa kategori.
  categoryId: integer("category_id").references(() => letterCategories.id, {
    onDelete: "set null",
  }),
  templateId: integer("template_id").references(() => letterTemplates.id, {
    onDelete: "set null",
  }),
  departmentId: integer("department_id").references(() => departments.id, {
    onDelete: "set null",
  }),
  senderId: integer("sender_id")
    .notNull()
    .references(() => users.id),
  recipientName: text("recipient_name"),
  recipientPosition: text("recipient_position"),
  recipientAddress: text("recipient_address"),
  letterDate: text("letter_date"), // YYYY-MM-DD
  classification: text("classification").notNull().default("biasa"),
  priority: text("priority").notNull().default("normal"),
  data: jsonb("data").notNull().default({}),
  bodyText: text("body_text"),
  status: text("status").notNull().default("draft"),
  currentStep: integer("current_step").notNull().default(0),
  cycle: integer("cycle").notNull().default(1),
  revisionCount: integer("revision_count").notNull().default(0),
  rejectedReason: text("rejected_reason"),
  submittedAt: timestamp("submitted_at", { withTimezone: true }),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  stageEnteredAt: timestamp("stage_entered_at", { withTimezone: true }),
  workflowId: integer("workflow_id"),
  docxPath: text("docx_path"),
  pdfPath: text("pdf_path"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const letterAttachments = pgTable("letter_attachments", {
  id: serial("id").primaryKey(),
  letterId: integer("letter_id")
    .notNull()
    .references(() => letters.id, { onDelete: "cascade" }),
  originalName: text("original_name").notNull(),
  storedName: text("stored_name").notNull(),
  mimeType: text("mime_type"),
  sizeBytes: integer("size_bytes").notNull().default(0),
  storagePath: text("storage_path").notNull(),
  /** Isi berkas (disimpan di database agar lampiran selalu utuh saat dicetak). */
  content: bytea("content"),
  uploadedBy: integer("uploaded_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ========================= WORKFLOW PERSETUJUAN ====================== */

export const approvalWorkflows = pgTable("approval_workflows", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  categoryId: integer("category_id").references(() => letterCategories.id, {
    onDelete: "cascade",
  }),
  departmentId: integer("department_id").references(() => departments.id, {
    onDelete: "set null",
  }),
  isDefault: boolean("is_default").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
  createdBy: integer("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const approvalSteps = pgTable(
  "approval_steps",
  {
    id: serial("id").primaryKey(),
    workflowId: integer("workflow_id")
      .notNull()
      .references(() => approvalWorkflows.id, { onDelete: "cascade" }),
    stepOrder: integer("step_order").notNull(),
    label: text("label").notNull(),
    roleCode: text("role_code").notNull(),
    description: text("description"),
    slaHours: integer("sla_hours").notNull().default(24),
    isRequired: boolean("is_required").notNull().default(true),
  },
  (t) => [uniqueIndex("approval_steps_unique").on(t.workflowId, t.stepOrder)],
);

export const letterApprovals = pgTable("letter_approvals", {
  id: serial("id").primaryKey(),
  letterId: integer("letter_id")
    .notNull()
    .references(() => letters.id, { onDelete: "cascade" }),
  cycle: integer("cycle").notNull().default(1),
  stepOrder: integer("step_order").notNull(),
  label: text("label").notNull(),
  roleCode: text("role_code").notNull(),
  approverId: integer("approver_id").references(() => users.id, { onDelete: "set null" }),
  status: text("status").notNull().default("pending"), // pending | waiting | approved | rejected | revision
  note: text("note"),
  dueAt: timestamp("due_at", { withTimezone: true }),
  actedAt: timestamp("acted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const letterRevisions = pgTable("letter_revisions", {
  id: serial("id").primaryKey(),
  letterId: integer("letter_id")
    .notNull()
    .references(() => letters.id, { onDelete: "cascade" }),
  cycle: integer("cycle").notNull().default(1),
  revisionNumber: integer("revision_number").notNull().default(1),
  requestedBy: integer("requested_by").references(() => users.id, {
    onDelete: "set null",
  }),
  requestedRole: text("requested_role"),
  note: text("note").notNull(),
  dataBefore: jsonb("data_before"),
  dataAfter: jsonb("data_after"),
  status: text("status").notNull().default("open"), // open | resolved
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
});

/* ==================== NOTIFIKASI, AUDIT, ARSIP ====================== */

export const notifications = pgTable("notifications", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  letterId: integer("letter_id").references(() => letters.id, { onDelete: "cascade" }),
  type: text("type").notNull().default("info"),
  title: text("title").notNull(),
  message: text("message").notNull(),
  link: text("link"),
  isRead: boolean("is_read").notNull().default(false),
  readAt: timestamp("read_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const auditLogs = pgTable("audit_logs", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id, { onDelete: "set null" }),
  userName: text("user_name"),
  userEmail: text("user_email"),
  action: text("action").notNull(),
  entity: text("entity"),
  entityId: text("entity_id"),
  description: text("description"),
  metadata: jsonb("metadata"),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const letterArchives = pgTable("letter_archives", {
  id: serial("id").primaryKey(),
  letterId: integer("letter_id")
    .notNull()
    .references(() => letters.id, { onDelete: "cascade" })
    .unique(),
  archiveNumber: text("archive_number"),
  archiveCategory: text("archive_category"),
  year: integer("year").notNull(),
  description: text("description"),
  location: text("location"),
  docxPath: text("docx_path"),
  pdfPath: text("pdf_path"),
  retainedUntil: text("retained_until"),
  archivedBy: integer("archived_by").references(() => users.id, { onDelete: "set null" }),
  archivedAt: timestamp("archived_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ====================== BERITA / PENGUMUMAN ========================= */

/**
 * Berita & pengumuman yang tampil di halaman login (tampilan awal).
 * Dikelola oleh Super Admin melalui menu "Berita & Pengumuman" di dasbor.
 */
export const announcements = pgTable("announcements", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  category: text("category").notNull().default("pengumuman"),
  isPublished: boolean("is_published").notNull().default(true),
  isPinned: boolean("is_pinned").notNull().default(false),
  publishedAt: timestamp("published_at", { withTimezone: true }).notNull().defaultNow(),
  createdBy: integer("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/* =============================== TYPES ============================== */

export type Role = typeof roles.$inferSelect;
export type Permission = typeof permissions.$inferSelect;
export type Department = typeof departments.$inferSelect;
export type User = typeof users.$inferSelect;
export type LetterCategory = typeof letterCategories.$inferSelect;
export type LetterTemplate = typeof letterTemplates.$inferSelect;
export type TemplateField = typeof templateFields.$inferSelect;
export type Letter = typeof letters.$inferSelect;
export type LetterAttachment = typeof letterAttachments.$inferSelect;
export type ApprovalWorkflow = typeof approvalWorkflows.$inferSelect;
export type ApprovalStep = typeof approvalSteps.$inferSelect;
export type LetterApproval = typeof letterApprovals.$inferSelect;
export type LetterRevision = typeof letterRevisions.$inferSelect;
export type Announcement = typeof announcements.$inferSelect;
export type Notification = typeof notifications.$inferSelect;
export type AuditLog = typeof auditLogs.$inferSelect;
export type LetterArchive = typeof letterArchives.$inferSelect;
export type NumberingSequence = typeof numberingSequences.$inferSelect;
