export function openSupport(): void {
  if (typeof window === "undefined") return;
  // Reuse the existing globally mounted SupportBot and its established event.
  // Opening support must not navigate away from the user's current page.
  window.dispatchEvent(new Event("mpa:open-support-contact"));
}
