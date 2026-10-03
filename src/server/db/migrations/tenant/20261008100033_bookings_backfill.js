// Bookings made from CRM before Sales: fill in their agent (the lead's), buyer contact and the
// unit's list price, so Sales can show and scope them.
export async function up(knex) {
  await knex.raw("UPDATE bookings b JOIN leads l ON l.id = b.lead_id SET b.agent_id = COALESCE(b.agent_id, l.assigned_to, b.created_by) WHERE b.agent_id IS NULL")
  await knex.raw("UPDATE bookings SET agent_id = created_by WHERE agent_id IS NULL")
  await knex.raw("UPDATE bookings b JOIN contact_links k ON k.linkable_type = 'booking' AND k.linkable_id = b.id AND k.deleted_at IS NULL SET b.contact_id = k.contact_id WHERE b.contact_id IS NULL")
  await knex.raw("UPDATE bookings b JOIN contact_links k ON k.linkable_type = 'lead' AND k.linkable_id = b.lead_id AND k.deleted_at IS NULL SET b.contact_id = k.contact_id WHERE b.contact_id IS NULL")
  await knex.raw("UPDATE bookings b JOIN units u ON u.id = b.unit_id SET b.list_price = u.price WHERE b.list_price IS NULL")
}

export async function down() {
  // Nothing to undo
}
