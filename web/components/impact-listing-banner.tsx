type ImpactListingBannerProps = {
  title: string;
  eyebrow: string;
  description?: string | null;
  imageUrl?: string | null;
  imageAlt?: string;
  variant?: "service" | "mentorship";
};

function approvedImageUrl(value?: string | null): string | null {
  if (!value || /[\s"'()\\]/.test(value)) return null;
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

/**
 * Shared editorial listing visual. imageUrl must be supplied only from a
 * server-approved media record; arbitrary user-entered URLs must never be
 * passed here. A branded, accessible fallback is always rendered.
 */
export function ImpactListingBanner({
  title,
  eyebrow,
  description,
  imageUrl,
  imageAlt,
  variant = "service",
}: ImpactListingBannerProps) {
  const safeImage = approvedImageUrl(imageUrl);
  return (
    <div className={`impact-listing-banner impact-listing-banner--${variant}${safeImage ? " has-approved-image" : ""}`}>
      {safeImage ? <img className="impact-listing-banner__image" src={safeImage} alt={imageAlt || title} loading="lazy" /> : null}
      <div className="impact-listing-banner__art" aria-hidden="true">
        <span className="impact-listing-banner__orb" />
        <span className="impact-listing-banner__arc impact-listing-banner__arc--one" />
        <span className="impact-listing-banner__arc impact-listing-banner__arc--two" />
      </div>
      <div className="impact-listing-banner__copy">
        <span className="impact-listing-banner__eyebrow">{eyebrow}</span>
        <span className="impact-listing-banner__title">{title}</span>
        {description ? <span className="impact-listing-banner__description">{description}</span> : null}
      </div>
    </div>
  );
}
