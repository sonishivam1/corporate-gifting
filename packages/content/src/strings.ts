/**
 * Every user-facing string in the platform, keyed by id. This is the first
 * content adapter: a headless CMS adapter later returns the same keys, and no
 * screen or email changes. `{placeholders}` are filled when the text is used.
 * Add a string here before using it; code never contains literal text.
 */
export const STRINGS = {
  // Gift email, sent on the campaign's send date. The page layout is code; every word is here.
  "email.gift.subject": "{senderName} sent you a gift",
  "email.gift.greeting": "Hi {recipientName},",
  "email.gift.intro": "{senderName} has a gift for you.",
  "email.gift.cta": "Open your gift",
  "email.gift.linkHint": "Or paste this link into your browser:",
  "email.gift.expires": "You can choose until {closesOn}.",
  "email.gift.footer": "You received this because {senderName} chose to send you a gift. The link is private to you, so please do not forward this email. If you were not expecting it, you can ignore it.",
  // Confirmation sent to the recipient when their gift is chosen. It doubles as a safety net.
  "email.claimed.subject": "Your gift is on its way",
  "email.claimed.greeting": "Hi {recipientName},",
  "email.claimed.body": "You chose {itemName} from {senderName}. It is shipping to {city}, {state}. Order {orderNumber}.",
  "email.claimed.notYou": "Was this not you? Please tell {senderName} right away, so they can stop it.",
  // Reminder email, for gifts nobody has claimed yet.
  "email.reminder.subject": "Your gift from {senderName} is waiting",
  "email.reminder.intro": "{senderName}'s gift is still waiting for you.",

  // Redemption pages: the private link a recipient opens from the email.
  "redeem.privacy": "You do not need an account. Your address is only used to ship this gift.",
  "redeem.unwrap.from": "A gift from {senderName}",
  "redeem.unwrap.closes": "Choose by {closesOn}",
  "redeem.choose.title": "Pick one",
  "redeem.choose.subtitle": "Everything here is yours to choose from.",
  "redeem.item.choose": "Choose this gift",
  "redeem.item.back": "All gifts",
  "redeem.item.shipping": "Ships free within the United States.",
  "redeem.address.title": "Where should we send it?",
  "redeem.address.yourGift": "Your gift",
  "redeem.address.name": "Full name",
  "redeem.address.line1": "Street address",
  "redeem.address.line2": "Apartment or suite (optional)",
  "redeem.address.city": "City",
  "redeem.address.state": "State",
  "redeem.address.stateChoose": "Choose",
  "redeem.address.zip": "ZIP code",
  "redeem.address.usOnly": "We ship within the United States.",
  "redeem.address.submit": "Confirm my gift",
  "redeem.address.submitting": "Placing your order\u2026",
  "redeem.address.errorField": "This is needed to ship your gift.",
  "redeem.address.errorZip": "Enter a 5-digit ZIP code.",
  "redeem.address.errorState": "Choose a state.",
  "redeem.confirmation.title": "It's on its way",
  "redeem.confirmation.body": "{itemName} is headed to {city}, {state}.",
  "redeem.confirmation.order": "Order {orderNumber}",
  "redeem.track.ordered": "Ordered",
  "redeem.track.orderedDetail": "Just now",
  "redeem.track.shipped": "Packed and shipped",
  "redeem.track.shippedDetail": "Usually within 3 business days",
  "redeem.track.delivered": "Delivered",
  "redeem.track.deliveredDetail": "We will email you when it arrives",

  // Redemption pages: what a recipient sees when the link cannot be used.
  "redeem.error.invalid": "We can't find this gift",
  "redeem.error.invalidHint": "The link may be incomplete. Try opening it again from your email.",
  "redeem.error.used": "This gift has already been chosen",
  "redeem.error.usedHint": "If that was you, your order is on its way.",
  "redeem.error.expired": "This gift has expired",
  "redeem.error.expiredHint": "The time to choose has passed. Please contact the person who sent it.",
  "redeem.error.notOpen": "Not quite yet",
  "redeem.error.notOpenHint": "You can choose your gift from {opensOn}. Come back then.",
  "redeem.error.unavailable": "We can't open gifts right now",
  "redeem.error.unavailableHint": "Please try again in a moment.",
  "redeem.error.itemGone": "That gift is no longer available",
  "redeem.error.itemGoneHint": "Please choose another.",
  "redeem.error.tryAgain": "We could not finish that. Please try again in a moment.",

  // Buyer portal.
  "portal.dashboard.title": "Your campaigns",
  "portal.campaign.new": "New campaign",
  "portal.review.maxCharge": "You'll be charged up to {maxAmount}, only for gifts that are claimed.",
  "portal.review.saveCard": "Save card and start campaign",
} as const;

export type ContentKey = keyof typeof STRINGS;
