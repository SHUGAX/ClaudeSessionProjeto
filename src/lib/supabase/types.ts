import type { Database } from "./database.types";

type PublicSchema = Database["public"];
export type Tables<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Row"];
export type TablesInsert<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Insert"];
export type TablesUpdate<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Update"];
export type Enums<T extends keyof PublicSchema["Enums"]> = PublicSchema["Enums"][T];

export type MemberRole = Enums<"member_role">;
export type DocumentStatus = Enums<"document_status">;
export type DocumentType = Enums<"document_type">;
export type ProcessingStatus = Enums<"processing_status">;
export type ReviewStatus = Enums<"review_status">;
export type OrganizationStatus = Enums<"organization_status">;
export type AlertType = Enums<"alert_type">;

export const DOCUMENT_TYPES: readonly DocumentType[] = [
  "invoice",
  "receipt",
  "credit_note",
  "quotation",
  "delivery_note",
  "contract",
  "other",
];

export const DOCUMENT_STATUSES: readonly DocumentStatus[] = [
  "uploading",
  "uploaded",
  "processing",
  "review_required",
  "validated",
  "failed",
  "archived",
];

export const MEMBER_ROLES: readonly MemberRole[] = ["owner", "admin", "manager", "member", "viewer"];
