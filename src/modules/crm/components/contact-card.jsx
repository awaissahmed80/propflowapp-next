"use client"

import { IconButton } from "@/components/ui/icon-button"
import { ContactCardPopover } from "@/modules/contacts/components/contact-card"

// The small info icon in the lead header: the shared contact card for the person behind the lead
//   <ContactCardButton code="LD-00012" onOpenLead={(code) => …} onEmail={…} />
export function ContactCardButton({ code, onOpenLead, onEmail }) {
  return <ContactCardPopover from={{ lead: code }} onOpenLead={onOpenLead} onEmail={onEmail} trigger={<IconButton icon="information-line" size="sm" aria-label="Contact card" tooltip={false} />} />
}
