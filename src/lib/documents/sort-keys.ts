export const SORTS = [
  "created_desc",
  "created_asc",
  "issue_desc",
  "issue_asc",
  "due_asc",
  "total_desc",
  "total_asc",
] as const;
export type SortKey = (typeof SORTS)[number];
