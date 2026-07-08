// Frontend mirror of the database's is_admin() function
// (supabase/migrations/20260708010000_admin_email_function.sql).
// Keep the two lists in sync.
export const ADMIN_EMAILS = ['kev.cornelio@gmail.com', 'admin@wasp-mlr.com'];

export const isAdminEmail = (email?: string | null): boolean =>
  !!email && ADMIN_EMAILS.includes(email);
