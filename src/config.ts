/**
 * Site-wide settings. Empty values switch the related feature off entirely; nothing renders for it.
 * These are filled in by the owner once the corresponding account exists (see OPERATIONS.md).
 */
export const site = {
  /** Working name. Final branding is the owner's decision. */
  name: 'Trackmend',
  tagline: 'Repair, join and convert activity files in your browser',
  /** Cloudflare Web Analytics beacon token (cookieless). Empty = no analytics script. */
  cfAnalyticsToken: import.meta.env.PUBLIC_CF_ANALYTICS_TOKEN ?? '',
  /** Optional "support this site" link (payment page). Empty = no link shown. */
  supportUrl: import.meta.env.PUBLIC_SUPPORT_URL ?? '',
  /** Contact address shown on the About page. Empty = not shown. */
  contactEmail: import.meta.env.PUBLIC_CONTACT_EMAIL ?? '',
};
