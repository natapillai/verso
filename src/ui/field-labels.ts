import type { FieldName } from "@/domain/fields";

/**
 * What a person calls each field.
 *
 * Kept out of any client component so a server component can import it without
 * dragging a whole interactive module along with it.
 */
export const FIELD_LABELS: Record<FieldName, string> = {
  invoice_number: "Invoice number",
  issue_date: "Issue date",
  due_date: "Due date",
  supplier_name: "Supplier name",
  supplier_tax_id: "Supplier tax ID",
  currency: "Currency",
  subtotal: "Subtotal",
  total: "Total",
};
