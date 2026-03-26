import type { FoodOption } from './api'

function formatReviewCount(n: number): string {
  if (n >= 1000) {
    return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k`
  }
  return String(n)
}

export function PlaceOptionMeta({ option }: { option: FoodOption }) {
  const menuHref = option.websiteUri ?? option.googleMapsUri ?? null
  const menuLabel =
    option.websiteUri != null && option.websiteUri !== ''
      ? 'Menu'
      : option.googleMapsUri != null && option.googleMapsUri !== ''
        ? 'Menu on Google'
        : null
  const showMapsLink =
    option.googleMapsUri != null &&
    option.googleMapsUri !== '' &&
    option.websiteUri != null &&
    option.websiteUri !== ''

  const hasDetails =
    option.address ||
    option.rating != null ||
    option.priceLevel ||
    option.openNow != null ||
    option.phone ||
    option.googleMapsUri ||
    option.websiteUri

  if (!hasDetails) {
    return null
  }

  const metaParts: string[] = []
  if (option.rating != null) {
    const rc =
      option.userRatingCount != null ? ` (${formatReviewCount(option.userRatingCount)})` : ''
    metaParts.push(`★ ${option.rating.toFixed(1)}${rc}`)
  }
  if (option.priceLevel) {
    metaParts.push(option.priceLevel)
  }
  if (option.openNow === true) {
    metaParts.push('Open now')
  } else if (option.openNow === false) {
    metaParts.push('Closed')
  }

  const telHref = option.phone ? `tel:${option.phone.replace(/\s/g, '')}` : ''

  return (
    <div className="mt-2 space-y-1 text-sm text-on-surface-variant">
      {option.address ? <p className="flex items-start gap-1.5">
        <span className="material-symbols-outlined mt-0.5 shrink-0 text-base text-secondary">location_on</span>
        <span>{option.address}</span>
      </p> : null}
      {option.phone ? (
        <p>
          <a className="text-primary hover:underline" href={telHref} rel="noopener noreferrer">
            {option.phone}
          </a>
        </p>
      ) : null}
      {metaParts.length > 0 ? <p>{metaParts.join(' · ')}</p> : null}
      {menuHref && menuLabel ? (
        <p className="flex flex-wrap gap-2">
          <a
            className="text-secondary font-medium hover:text-primary"
            href={menuHref}
            rel="noopener noreferrer"
            target="_blank"
          >
            {menuLabel}
          </a>
          {showMapsLink ? (
            <a
              className="text-secondary font-medium hover:text-primary"
              href={option.googleMapsUri!}
              rel="noopener noreferrer"
              target="_blank"
            >
              Maps
            </a>
          ) : null}
        </p>
      ) : null}
    </div>
  )
}
