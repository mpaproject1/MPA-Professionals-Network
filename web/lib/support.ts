export function openSupport(): void {
  if (typeof window === "undefined") return;
  // Defer by one task so the globally mounted SupportBot has attached its
  // listener, including when /contact is the first page opened in a session.
  window.setTimeout(() => {
    window.dispatchEvent(new Event("mpa:open-support-contact"));
  }, 0);
}
