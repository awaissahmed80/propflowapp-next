// The landing page section library: every ready-made section people can add, its layouts
// (variants), the fields its editor shows, and starter content. Shared by the builder, the
// "Add section" library and the public renderer.
//
// A section on a page: { id, type, variant, hidden, style, ...content }
//   style: { background, image, overlay, padding, align, width, show } (see STYLE_DEFAULTS)
// Field types the editor understands: text, textarea, rich (bold/italic/lists/links), image, url,
// select, toggle, number, datetime, icon, list (rows of sub-fields). {project}, {location},
// {city}, {authority}, {noc} and {workspace} in starter text are filled from the page's project.

export const CATEGORIES = [
  { key: "intro", label: "Headers & heroes", icon: "layout-top-line" },
  { key: "content", label: "Content", icon: "article-line" },
  { key: "property", label: "Property & prices", icon: "community-line" },
  { key: "proof", label: "Trust & social proof", icon: "shield-star-line" },
  { key: "convert", label: "Enquiries & calls to action", icon: "cursor-line" },
  { key: "layout", label: "Footer & layout", icon: "layout-bottom-line" },
]

export const STYLE_DEFAULTS = { background: "white", image: "", overlay: 55, padding: "md", align: "left", width: "normal", show: "all" }
export const BACKGROUNDS = [
  { value: "white", label: "White" },
  { value: "muted", label: "Soft gray" },
  { value: "tint", label: "Tint", title: "A light tint of the brand color" },
  { value: "accent", label: "Brand", title: "The brand color" },
  { value: "dark", label: "Dark" },
  { value: "image", label: "Image" },
]
export const PADDINGS = [
  { value: "none", label: "None" },
  { value: "sm", label: "Small" },
  { value: "md", label: "Medium" },
  { value: "lg", label: "Large" },
  { value: "xl", label: "Extra large" },
]
export const WIDTHS = [
  { value: "narrow", label: "Narrow" },
  { value: "normal", label: "Normal" },
  { value: "wide", label: "Wide" },
  { value: "full", label: "Full width" },
]
export const SHOW_ON = [
  { value: "all", label: "Everywhere" },
  { value: "desktop", label: "Desktop only" },
  { value: "mobile", label: "Phone only" },
]
export const CTA_ACTIONS = [
  { value: "form", label: "Scroll to the enquiry form" },
  { value: "whatsapp", label: "Open WhatsApp" },
  { value: "call", label: "Call the phone number" },
  { value: "link", label: "Open a link" },
]

const cta = (label = "Get the payment plan") => [
  { key: "ctaLabel", label: "Button text", type: "text", placeholder: label },
  { key: "ctaAction", label: "Button does", type: "select", options: CTA_ACTIONS },
  { key: "ctaLink", label: "Button link", type: "url", when: (s) => s.ctaAction === "link" },
]
const titled = (title, intro = true) => [{ key: "title", label: "Title", type: "text", placeholder: title }, ...(intro ? [{ key: "intro", label: "Intro", type: "textarea" }] : [])]

export const SECTIONS = {
  navbar: {
    label: "Top bar",
    icon: "layout-top-2-line",
    category: "intro",
    text: "Logo or name, with a button or WhatsApp",
    variants: [
      { key: "cta", label: "Logo + button" },
      { key: "whatsapp", label: "Logo + WhatsApp" },
      { key: "centered", label: "Centered logo" },
    ],
    fields: [
      { key: "logo", label: "Logo", type: "image", hint: "Empty: the logo under Design, or your name" },
      { key: "name", label: "Name shown", type: "text", hint: "Empty: your workspace's name (when there's no logo)" },
      ...cta("Enquire"),
    ],
    defaults: () => ({ logo: "", name: "", ctaLabel: "Enquire", ctaAction: "form" }),
    style: { padding: "none" },
  },
  hero: {
    label: "Hero",
    icon: "layout-top-line",
    category: "intro",
    text: "The big headline at the top, with a button",
    variants: [
      { key: "centered", label: "Centered on color" },
      { key: "split", label: "Text + image", style: { background: "white" } },
      { key: "cover", label: "Full image", style: { background: "image", padding: "xl" } },
      { key: "form", label: "Text + enquiry form" },
    ],
    fields: [
      { key: "badge", label: "Small tag above", type: "text", placeholder: "e.g. Booking open" },
      { key: "headline", label: "Headline", type: "textarea" },
      { key: "subheadline", label: "Text under it", type: "textarea" },
      { key: "image", label: "Image", type: "image", when: (s) => s.variant !== "centered" },
      ...cta(),
      { key: "points", label: "Ticks under the text", type: "list", fields: [{ key: "label", label: "Point", type: "text" }], max: 5 },
    ],
    defaults: () => ({
      badge: "Booking open",
      headline: "{project}: plots on easy installments",
      subheadline: "{authority}-approved project in {location}. Book with 10% down and pay the rest over 3 years.",
      image: "",
      ctaLabel: "Get the payment plan",
      ctaAction: "form",
      points: [{ label: "{authority} approved" }, { label: "Possession on booking" }, { label: "3-year installments" }],
    }),
    style: { padding: "lg", background: "accent" },
  },
  stats: {
    label: "Key numbers",
    icon: "bar-chart-box-line",
    category: "intro",
    text: "Big numbers that sell the project",
    variants: [
      { key: "row", label: "In a row" },
      { key: "cards", label: "Cards" },
    ],
    fields: [
      { key: "title", label: "Title", type: "text" },
      {
        key: "items",
        label: "Numbers",
        type: "list",
        fields: [
          { key: "value", label: "Number", type: "text" },
          { key: "label", label: "Label", type: "text" },
        ],
        max: 6,
      },
    ],
    defaults: () => ({
      title: "",
      items: [
        { value: "500+", label: "Families booked" },
        { value: "3 years", label: "Easy installments" },
        { value: "10%", label: "Down payment" },
        { value: "24/7", label: "Gated security" },
      ],
    }),
    style: { background: "muted", padding: "md", align: "center" },
  },
  features: {
    label: "Highlights",
    icon: "star-line",
    category: "content",
    text: "Why buy here, as icon cards or a numbered list",
    variants: [
      { key: "cards", label: "Icon cards" },
      { key: "numbered", label: "Numbered steps" },
      { key: "image", label: "List + image" },
    ],
    fields: [
      ...titled("Why {project}"),
      { key: "image", label: "Image", type: "image", when: (s) => s.variant === "image" },
      {
        key: "items",
        label: "Points",
        type: "list",
        fields: [
          { key: "icon", label: "Icon", type: "icon" },
          { key: "title", label: "Title", type: "text" },
          { key: "text", label: "Text", type: "textarea" },
        ],
        max: 9,
      },
    ],
    defaults: () => ({
      title: "Why {project}",
      intro: "",
      image: "",
      items: [
        { icon: "shield-check-line", title: "Approved by {authority}", text: "NOC {noc}, so your investment is safe." },
        { icon: "road-map-line", title: "Prime location", text: "Minutes from the main boulevard in {location}." },
        { icon: "calendar-check-line", title: "Easy installments", text: "Book with a small down payment and pay over 3 years." },
      ],
    }),
  },
  text: {
    label: "Text",
    icon: "text-block",
    category: "content",
    text: "A heading and a few paragraphs",
    variants: [
      { key: "plain", label: "Plain" },
      { key: "card", label: "In a card" },
    ],
    fields: [
      { key: "title", label: "Title", type: "text" },
      { key: "body", label: "Text", type: "rich" },
    ],
    defaults: () => ({
      title: "About {project}",
      body: "{project} is a planned community in {location}, built for families who want **space, security and value**.\n\n- Wide roads and green belts\n- Underground electricity\n- Schools and a hospital nearby",
    }),
    style: { width: "narrow" },
  },
  image: {
    label: "Image",
    icon: "image-line",
    category: "content",
    text: "One large picture with a caption",
    variants: [
      { key: "wide", label: "Wide" },
      { key: "framed", label: "Framed" },
    ],
    fields: [
      { key: "image", label: "Image", type: "image" },
      { key: "caption", label: "Caption", type: "text" },
    ],
    defaults: () => ({ image: "", caption: "" }),
  },
  gallery: {
    label: "Gallery",
    icon: "gallery-line",
    category: "content",
    text: "Site photos, renders and progress pictures",
    variants: [
      { key: "grid", label: "Grid" },
      { key: "feature", label: "One big + small" },
    ],
    fields: [
      ...titled("Take a look"),
      {
        key: "images",
        label: "Pictures",
        type: "list",
        fields: [
          { key: "image", label: "Image", type: "image" },
          { key: "caption", label: "Caption", type: "text" },
        ],
        max: 12,
      },
    ],
    defaults: () => ({ title: "Take a look", intro: "", images: [] }),
  },
  video: {
    label: "Video",
    icon: "video-line",
    category: "content",
    text: "A YouTube or Vimeo walkthrough",
    variants: [
      { key: "full", label: "Full width" },
      { key: "split", label: "Text + video" },
    ],
    fields: [
      { key: "title", label: "Title", type: "text" },
      { key: "text", label: "Text", type: "textarea", when: (s) => s.variant === "split" },
      { key: "url", label: "Video link", type: "url", hint: "A YouTube or Vimeo link" },
    ],
    defaults: () => ({ title: "See {project} on video", text: "A two-minute drive through the project.", url: "" }),
  },
  amenities: {
    label: "Amenities",
    icon: "community-line",
    category: "property",
    text: "What residents get, as an icon grid",
    variants: [
      { key: "icons", label: "Icon grid" },
      { key: "chips", label: "Tags" },
    ],
    fields: [
      ...titled("Amenities"),
      {
        key: "items",
        label: "Amenities",
        type: "list",
        fields: [
          { key: "icon", label: "Icon", type: "icon" },
          { key: "label", label: "Amenity", type: "text" },
        ],
        max: 24,
      },
    ],
    defaults: () => ({
      title: "Everything at your doorstep",
      intro: "",
      items: [
        { icon: "moon-clear-line", label: "Grand mosque" },
        { icon: "school-line", label: "School" },
        { icon: "hospital-line", label: "Hospital" },
        { icon: "plant-line", label: "Parks" },
        { icon: "shield-user-line", label: "Gated security" },
        { icon: "flashlight-line", label: "Underground electricity" },
      ],
    }),
    style: { align: "center" },
  },
  pricing: {
    label: "Prices",
    icon: "price-tag-3-line",
    category: "property",
    text: "Prices by size or unit type",
    variants: [
      { key: "cards", label: "Cards" },
      { key: "table", label: "Table" },
    ],
    fields: [
      ...titled("Prices"),
      {
        key: "rows",
        label: "Prices",
        type: "list",
        fields: [
          { key: "label", label: "Size or type", type: "text" },
          { key: "price", label: "Price", type: "text" },
          { key: "detail", label: "Detail", type: "text" },
        ],
        max: 12,
      },
      { key: "note", label: "Small print", type: "text" },
      { key: "ctaLabel", label: "Button on each price", type: "text" },
    ],
    defaults: () => ({
      title: "Prices",
      intro: "",
      rows: [
        { label: "5 Marla", price: "Rs 45 Lac", detail: "Rs 4.5 Lac down, 36 installments" },
        { label: "10 Marla", price: "Rs 85 Lac", detail: "Rs 8.5 Lac down, 36 installments" },
        { label: "1 Kanal", price: "Rs 1.6 Crore", detail: "Rs 16 Lac down, 36 installments" },
      ],
      note: "Prices are subject to change. Corner and park-facing plots carry a premium.",
      ctaLabel: "Get payment plan",
    }),
    style: { background: "muted" },
    inventory: true,
  },
  plan: {
    label: "Payment plan",
    icon: "calendar-todo-line",
    category: "property",
    text: "Down payment, installments and possession",
    variants: [
      { key: "steps", label: "Steps" },
      { key: "table", label: "Table" },
    ],
    fields: [
      ...titled("Easy payment plan"),
      {
        key: "items",
        label: "Payments",
        type: "list",
        fields: [
          { key: "label", label: "Payment", type: "text" },
          { key: "amount", label: "Amount", type: "text" },
          { key: "detail", label: "When", type: "text" },
        ],
        max: 10,
      },
      { key: "note", label: "Small print", type: "text" },
    ],
    defaults: () => ({
      title: "Easy payment plan",
      intro: "",
      items: [
        { label: "Booking", amount: "10%", detail: "On booking" },
        { label: "Confirmation", amount: "10%", detail: "Within 30 days" },
        { label: "Installments", amount: "70%", detail: "36 monthly installments" },
        { label: "Possession", amount: "10%", detail: "On possession" },
      ],
      note: "",
    }),
  },
  location: {
    label: "Location",
    icon: "map-pin-2-line",
    category: "property",
    text: "Address, nearby landmarks and a map",
    variants: [
      { key: "map", label: "With map" },
      { key: "card", label: "Address card" },
    ],
    fields: [
      { key: "title", label: "Title", type: "text" },
      { key: "address", label: "Address", type: "textarea" },
      {
        key: "mapUrl",
        label: "Google Maps link",
        type: "text",
        placeholder: "https://maps.app.goo.gl/…",
        hint: "In Google Maps: Share › Copy link (or Embed a map › Copy HTML). The map shows that exact spot; empty: the address is searched.",
      },
      { key: "landmarks", label: "Nearby", type: "list", fields: [{ key: "label", label: "Landmark", type: "text" }], max: 10 },
    ],
    defaults: () => ({ title: "Location", address: "{location}", mapUrl: "", landmarks: [{ label: "5 minutes from the motorway" }, { label: "Near schools and hospitals" }] }),
  },
  trust: {
    label: "Approvals",
    icon: "shield-check-line",
    category: "proof",
    text: "Authority approval and NOC, to build trust",
    variants: [
      { key: "banner", label: "Banner" },
      { key: "badges", label: "Badges" },
    ],
    fields: [
      { key: "title", label: "Title", type: "text" },
      { key: "text", label: "Text", type: "textarea" },
      {
        key: "items",
        label: "Badges",
        type: "list",
        fields: [
          { key: "icon", label: "Icon", type: "icon" },
          { key: "label", label: "Label", type: "text" },
        ],
        max: 6,
        when: (s) => s.variant === "badges",
      },
    ],
    defaults: () => ({
      title: "Approved by {authority}",
      text: "{project} is approved by {authority} (NOC {noc}). Every booking comes with an allotment letter.",
      items: [
        { icon: "shield-check-line", label: "{authority} approved" },
        { icon: "file-paper-2-line", label: "Allotment letter" },
        { icon: "bank-line", label: "Bank payments only" },
      ],
    }),
  },
  testimonials: {
    label: "Testimonials",
    icon: "chat-quote-line",
    category: "proof",
    text: "What buyers say",
    variants: [
      { key: "cards", label: "Cards" },
      { key: "quote", label: "One big quote" },
    ],
    fields: [
      { key: "title", label: "Title", type: "text" },
      {
        key: "items",
        label: "Quotes",
        type: "list",
        fields: [
          { key: "quote", label: "Quote", type: "textarea" },
          { key: "name", label: "Name", type: "text" },
          { key: "role", label: "Who they are", type: "text" },
        ],
        max: 6,
      },
    ],
    defaults: () => ({
      title: "What our buyers say",
      items: [
        { quote: "The whole process was transparent and the installments are easy on the pocket.", name: "Ahmed R.", role: "10 Marla, Block B" },
        { quote: "We got our allotment letter within a week of booking.", name: "Sana K.", role: "Overseas buyer, Dubai" },
      ],
    }),
    style: { background: "muted" },
  },
  faq: {
    label: "Questions",
    icon: "question-line",
    category: "proof",
    text: "Answers to what buyers ask",
    variants: [
      { key: "accordion", label: "Accordion" },
      { key: "columns", label: "Two columns" },
    ],
    fields: [
      { key: "title", label: "Title", type: "text" },
      {
        key: "items",
        label: "Questions",
        type: "list",
        fields: [
          { key: "q", label: "Question", type: "text" },
          { key: "a", label: "Answer", type: "textarea" },
        ],
        max: 16,
      },
    ],
    defaults: () => ({
      title: "Questions",
      items: [
        { q: "Is {project} approved?", a: "Yes. It's approved by {authority} with NOC {noc}." },
        { q: "Can overseas Pakistanis book?", a: "Yes. You can book online and pay from abroad; we'll send your documents by courier." },
        { q: "When is possession?", a: "Possession is given on booking for developed blocks." },
      ],
    }),
  },
  form: {
    label: "Enquiry form",
    icon: "survey-line",
    category: "convert",
    text: "The page's lead form; entries go to CRM",
    variants: [
      { key: "split", label: "Text + form" },
      { key: "centered", label: "Centered form" },
    ],
    fields: [
      { key: "title", label: "Title", type: "text" },
      { key: "text", label: "Text", type: "textarea" },
      { key: "points", label: "Ticks beside the form", type: "list", fields: [{ key: "label", label: "Point", type: "text" }], max: 6, when: (s) => s.variant === "split" },
    ],
    defaults: () => ({
      title: "Get the payment plan",
      text: "Leave your number and our team will call you within the hour.",
      points: [{ label: "Free site visit with transport" }, { label: "Latest availability and prices" }],
    }),
    style: { background: "muted" },
    single: true,
  },
  cta: {
    label: "Call to action",
    icon: "cursor-line",
    category: "convert",
    text: "A bold banner with a button",
    variants: [
      { key: "banner", label: "Banner" },
      { key: "split", label: "Text + buttons" },
    ],
    fields: [{ key: "title", label: "Title", type: "text" }, { key: "text", label: "Text", type: "textarea" }, ...cta("Book a site visit"), { key: "secondary", label: "Show a WhatsApp button too", type: "toggle" }],
    defaults: () => ({ title: "Limited plots left at launch prices", text: "Book this week and save on the down payment.", ctaLabel: "Book a site visit", ctaAction: "form", secondary: true }),
    style: { background: "accent", align: "center" },
  },
  countdown: {
    label: "Offer countdown",
    icon: "timer-line",
    category: "convert",
    text: "Days, hours and minutes until an offer ends",
    variants: [
      { key: "banner", label: "Banner" },
      { key: "card", label: "Card" },
    ],
    fields: [{ key: "title", label: "Title", type: "text" }, { key: "text", label: "Text", type: "textarea" }, { key: "until", label: "Ends on", type: "datetime" }, ...cta("Book now")],
    defaults: () => ({ title: "Launch offer ends in", text: "", until: "", ctaLabel: "Book now", ctaAction: "form" }),
    style: { background: "dark", align: "center" },
  },
  contact: {
    label: "Contact & footer",
    icon: "phone-line",
    category: "layout",
    text: "Office address, hours, phone and WhatsApp",
    variants: [
      { key: "dark", label: "Dark footer" },
      { key: "light", label: "Light" },
    ],
    fields: [
      { key: "title", label: "Title", type: "text" },
      { key: "address", label: "Office address", type: "textarea" },
      { key: "hours", label: "Hours", type: "text" },
      { key: "email", label: "Email", type: "text" },
    ],
    defaults: () => ({ title: "Visit our office", address: "{location}", hours: "Monday to Saturday, 10 am – 7 pm", email: "" }),
    style: { background: "dark", padding: "md" },
  },
  spacer: {
    label: "Space or line",
    icon: "separator",
    category: "layout",
    text: "Room between sections, or a divider line",
    variants: [
      { key: "space", label: "Space" },
      { key: "line", label: "Line" },
    ],
    fields: [],
    defaults: () => ({}),
    style: { padding: "sm" },
  },
}

const uid = () => `s${Math.random().toString(36).slice(2, 9)}`

// A new section of a type (and layout), with starter content
export function newSection(type, variant) {
  const def = SECTIONS[type]
  const v = def.variants.find((x) => x.key === variant) ?? def.variants[0]
  return { id: uid(), type, variant: v.key, hidden: false, style: { ...STYLE_DEFAULTS, ...(def.style ?? {}), ...(v.style ?? {}) }, ...def.defaults() }
}

// Same section, new id (Duplicate)
export const copySection = (s) => ({ ...structuredClone(s), id: uid() })

// Fill {project}, {location}… in all text of a section from the page's project
export function fillPlaceholders(value, vars) {
  if (typeof value === "string") return value.replace(/\{(project|location|city|authority|noc|workspace)\}/g, (_, k) => vars[k] || "")
  if (Array.isArray(value)) return value.map((v) => fillPlaceholders(v, vars))
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, fillPlaceholders(v, vars)]))
  return value
}

// Starting points for a new page (sections in order)
export const TEMPLATES = [
  {
    key: "launch",
    label: "Project launch",
    icon: "rocket-2-line",
    text: "Hero with the form, numbers, highlights, prices, plan, location, questions",
    sections: [
      ["navbar", "cta"],
      ["hero", "form"],
      ["stats", "row"],
      ["features", "cards"],
      ["pricing", "cards"],
      ["plan", "steps"],
      ["amenities", "icons"],
      ["location", "map"],
      ["trust", "banner"],
      ["faq", "accordion"],
      ["cta", "banner"],
      ["contact", "dark"],
    ],
  },
  {
    key: "pre-launch",
    label: "Pre-launch registrations",
    icon: "file-list-3-line",
    text: "Register interest before launch: hero, countdown, highlights, form",
    sections: [
      ["navbar", "centered"],
      ["hero", "centered"],
      ["countdown", "banner"],
      ["features", "numbered"],
      ["form", "centered"],
      ["contact", "dark"],
    ],
  },
  {
    key: "overseas",
    label: "Overseas Pakistanis",
    icon: "plane-line",
    text: "Trust first: approvals, testimonials, payment plan, WhatsApp",
    sections: [
      ["navbar", "whatsapp"],
      ["hero", "split"],
      ["trust", "badges"],
      ["plan", "table"],
      ["testimonials", "cards"],
      ["faq", "columns"],
      ["form", "split"],
      ["contact", "dark"],
    ],
  },
  {
    key: "payment-plan",
    label: "Payment plan",
    icon: "calendar-todo-line",
    text: "Prices and installments up front, then the form",
    sections: [
      ["navbar", "cta"],
      ["hero", "cover"],
      ["pricing", "table"],
      ["plan", "steps"],
      ["form", "split"],
      ["contact", "light"],
    ],
  },
  { key: "blank", label: "Blank page", icon: "file-line", text: "Start empty and add sections from the library", sections: [] },
]

export const templateSections = (key) => (TEMPLATES.find((t) => t.key === key)?.sections ?? []).map(([type, variant]) => newSection(type, variant))

// Page design (theme) defaults
export const THEME_DEFAULTS = { accent: "blue", font: "inter", radius: "lg", buttons: "solid", logo: "", phone: "", whatsapp: "" }
export const FONTS = [
  { value: "inter", label: "Inter (clean)" },
  { value: "manrope", label: "Manrope (modern)" },
  { value: "poppins", label: "Poppins (friendly)" },
  { value: "playfair", label: "Playfair (luxury)" },
  { value: "lora", label: "Lora (classic)" },
]
export const RADII = [
  { value: "none", label: "Square" },
  { value: "md", label: "Slightly rounded" },
  { value: "lg", label: "Rounded" },
  { value: "xl", label: "Very rounded" },
]
export const BUTTONS = [
  { value: "solid", label: "Solid" },
  { value: "outline", label: "Outline" },
  { value: "pill", label: "Pill" },
]
