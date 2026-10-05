import "server-only"

// What can go in the recycle bin (Settings › Recycle bin), one entry per kind of record:
//   app        the app whose "delete" permission lets someone move it to the bin
//   table      its table (camelCase); rows are found by code (or id where there's no code)
//   title      the name shown in the bin, from the selected columns
//   together   child rows that leave and come back with it (soft-deleted with the same timestamp,
//              so a restore brings back exactly those)
//   inUse      why it can't be deleted yet (live records still point at it), or null
//   keeps      why it can't be removed for good (any record still points at it), or null
//   purge      removes its children and clears references before the row itself goes
//   files      storage keys deleted after a permanent removal
// Money records (bookings, receipts, vouchers, payroll, loans, payouts) are never deleted: they're
// canceled, refunded or voided so the books stay whole.

const count = async (q) => Number((await q.count({ n: "*" }).first())?.n ?? 0)
const anyLive = (db, table, where) => count(db(table).where(where).whereNull("deletedAt"))
const anyAt = (db, table, where) => count(db(table).where(where))
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

// Storage keys of files attached to records (assets owner_type / owner_id)
async function ownedFiles(db, ownerType, ownerIds) {
  if (!ownerIds.length) return []
  return (await db("assets").where({ ownerType }).whereIn("ownerId", ownerIds).select("fileKey")).map((a) => a.fileKey).filter(Boolean)
}
async function dropOwned(trx, ownerType, ownerIds) {
  if (!ownerIds.length) return
  const ids = (await trx("assets").where({ ownerType }).whereIn("ownerId", ownerIds).select("id")).map((a) => a.id)
  if (ids.length) {
    await trx("shareLinkViews").whereIn("linkId", trx("shareLinks").whereIn("assetId", ids).select("id")).delete()
    await trx("shareLinks").whereIn("assetId", ids).delete()
    await trx("assets").whereIn("id", ids).delete()
  }
}
const ids = async (q) => (await q.select("id")).map((r) => r.id)

export const KINDS = {
  lead: {
    app: "crm",
    label: "Lead",
    group: "CRM",
    icon: "user-star-line",
    table: "leads",
    columns: ["code", "name", "phone"],
    title: (r) => r.name,
    sub: (r) => r.phone,
    together: (r) => [
      ["leadActivities", { leadId: r.id }],
      ["leadTags", { leadId: r.id }],
      ["contactLinks", { linkableType: "lead", linkableId: r.id }],
    ],
    inUse: async (db, r) => ((await anyLive(db, "bookings", { leadId: r.id })) ? "It has a booking. Cancel the booking first, or archive the lead instead." : null),
    keeps: async (db, r) => ((await anyAt(db, "bookings", { leadId: r.id })) ? "A booking was made from it, so it stays on record." : null),
    files: async (db, r) => ownedFiles(db, "lead-activity", await ids(db("leadActivities").where({ leadId: r.id }))),
    purge: async (trx, r) => {
      await dropOwned(trx, "lead-activity", await ids(trx("leadActivities").where({ leadId: r.id })))
      await trx("leadActivities").where({ leadId: r.id }).delete()
      await trx("leadTags").where({ leadId: r.id }).delete()
      await trx("contactLinks").where({ linkableType: "lead", linkableId: r.id }).delete()
      await trx("externalLeads").where({ leadId: r.id }).update({ leadId: null })
      await trx("metaLeads").where({ leadId: r.id }).update({ leadId: null })
    },
  },

  contact: {
    app: "contacts",
    label: "Contact",
    group: "Contacts",
    icon: "contacts-book-line",
    table: "contacts",
    columns: ["code", "name", "phone"],
    title: (r) => r.name,
    sub: (r) => r.phone,
    together: (r) => [["contactLinks", { contactId: r.id }]],
    keeps: async (db, r) => {
      for (const t of ["bookings", "employees", "paymentRequests", "serviceRequests"]) if (await anyAt(db, t, { contactId: r.id })) return "Bookings, employees or requests still name this contact."
      return null
    },
    purge: async (trx, r) => {
      await trx("contactLinks").where({ contactId: r.id }).delete()
    },
  },

  project: {
    app: "portfolio",
    label: "Project",
    group: "Project Portfolio",
    icon: "building-line",
    table: "projects",
    columns: ["code", "name"],
    title: (r) => r.name,
    together: (r) => ["units", "projectPhases", "projectBlocks", "projectProgress", "projectUpdates", "projectEvents", "priceLists"].map((t) => [t, { projectId: r.id }]),
    inUse: async (db, r) => {
      const n = await anyLive(db, "bookings", { projectId: r.id })
      return n ? `It has ${plural(n, "booking")}. Projects with sales can't be deleted.` : null
    },
    keeps: async (db, r) => {
      if (await anyAt(db, "bookings", { projectId: r.id })) return "Bookings were made in it, so it stays on record."
      if (await anyAt(db, "vouchers", { projectId: r.id })) return "Finance vouchers are posted against it, so it stays on record."
      return null
    },
    files: async (db, r) => [...(await ownedFiles(db, "project", [r.id])), ...(await ownedFiles(db, "project_update", await ids(db("projectUpdates").where({ projectId: r.id }))))],
    purge: async (trx, r) => {
      await dropOwned(trx, "project_update", await ids(trx("projectUpdates").where({ projectId: r.id })))
      await dropOwned(trx, "project", [r.id])
      for (const t of ["units", "projectProgress", "projectUpdates", "projectEvents", "priceLists", "projectBlocks", "projectPhases"]) await trx(t).where({ projectId: r.id }).delete()
      for (const t of ["leads", "leadActivities", "leadForms", "landingPages", "campaigns", "employees", "dutyPosts"]) await trx(t).where({ projectId: r.id }).update({ projectId: null })
      await trx("assets").where({ projectId: r.id }).update({ projectId: null })
    },
  },

  unit: {
    app: "portfolio",
    label: "Unit",
    group: "Project Portfolio",
    icon: "layout-grid-line",
    table: "units",
    columns: ["code", "number", "projectId"],
    title: (r) => r.number || r.code,
    sub: (r) => r.projectName,
    extra: (q) => q.leftJoin("projects as p", "p.id", "units.projectId").select("p.name as projectName"),
    inUse: async (db, r) => ((await anyLive(db, "bookings", { unitId: r.id })) ? "It's booked. Cancel the booking first." : null),
    canRestore: async (db, r) => ((await db("projects").where({ id: r.projectId }).whereNotNull("deletedAt").first("id")) ? "Its project is in the bin. Restore the project first." : null),
    keeps: async (db, r) =>
      (await anyAt(db, "bookings", { unitId: r.id })) || (await anyAt(db, "serviceRequests", { unitId: r.id })) ? "Bookings or Estate Management requests were made on it, so it stays on record." : null,
  },

  employee: {
    app: "hr",
    label: "Employee",
    group: "HRM",
    icon: "id-card-line",
    table: "employees",
    columns: ["code", "name", "designation"],
    title: (r) => r.name,
    sub: (r) => r.designation,
    together: (r) => [["contactLinks", { linkableType: "employee", linkableId: r.id }]],
    inUse: async (db, r) =>
      (await anyAt(db, "payrollLines", { employeeId: r.id })) || (await anyAt(db, "loans", { employeeId: r.id })) ? "They've been paid through payroll or have a loan. End their employment instead." : null,
    keeps: async (db, r) => ((await anyAt(db, "payrollLines", { employeeId: r.id })) || (await anyAt(db, "loans", { employeeId: r.id })) ? "They've been paid through payroll or have a loan, so the record stays." : null),
    purge: async (trx, r) => {
      for (const t of ["attendance", "dutyOverrides", "dutyPatterns", "leaveRequests"]) await trx(t).where({ employeeId: r.id }).delete()
      await trx("contactLinks").where({ linkableType: "employee", linkableId: r.id }).delete()
    },
  },

  form: {
    app: "campaigns",
    label: "Lead form",
    group: "Campaigns",
    icon: "survey-line",
    table: "leadForms",
    columns: ["code", "name"],
    title: (r) => r.name,
    purge: async (trx, r) => {
      await trx("leads").where({ formId: r.id }).update({ formId: null })
      await trx("landingPages").where({ formId: r.id }).update({ formId: null })
      await trx("metaForms").where({ leadFormId: r.id }).update({ leadFormId: null })
      await trx("externalForms").where({ leadFormId: r.id }).update({ leadFormId: null })
    },
  },

  campaign: {
    app: "campaigns",
    label: "Campaign",
    group: "Campaigns",
    icon: "megaphone-line",
    table: "campaigns",
    columns: ["code", "name"],
    title: (r) => r.name,
    purge: async (trx, r) => {
      for (const t of ["leads", "leadForms", "landingPages"]) await trx(t).where({ campaignId: r.id }).update({ campaignId: null })
    },
  },

  page: {
    app: "campaigns",
    label: "Landing page",
    group: "Campaigns",
    icon: "pages-line",
    table: "landingPages",
    columns: ["code", "name", "slug"],
    title: (r) => r.name,
    sub: (r) => r.slug && `/${r.slug}`,
    files: async (db, r) => ownedFiles(db, "landing-page", [r.id]),
    purge: async (trx, r) => {
      await dropOwned(trx, "landing-page", [r.id])
      await trx("leads").where({ landingPageId: r.id }).update({ landingPageId: null })
    },
  },

  "price-list": {
    app: "portfolio",
    label: "Price list",
    group: "Project Portfolio",
    icon: "price-tag-3-line",
    table: "priceLists",
    columns: ["code", "name", "version"],
    title: (r) => r.name || `Version ${r.version}`,
    keeps: async (db, r) => ((await anyAt(db, "bookings", { priceListId: r.id })) ? "Bookings were priced from it, so it stays on record." : null),
  },

  update: {
    app: "portfolio",
    label: "Project update",
    group: "Project Portfolio",
    icon: "newspaper-line",
    table: "projectUpdates",
    columns: ["code", "title"],
    title: (r) => r.title,
    files: async (db, r) => ownedFiles(db, "project_update", [r.id]),
    purge: async (trx, r) => dropOwned(trx, "project_update", [r.id]),
  },

  event: {
    app: "portfolio",
    label: "Project event",
    group: "Project Portfolio",
    icon: "calendar-event-line",
    table: "projectEvents",
    columns: ["code", "title"],
    title: (r) => r.title,
  },

  document: {
    app: "documents",
    label: "Document",
    group: "Documents",
    icon: "file-text-line",
    table: "assets",
    // Asset codes are internal tokens, not something people read
    codeHidden: true,
    // Company documents only (the Documents app); earlier versions come and go with the latest
    scope: (q) => q.where("assets.app", "documents").whereNull("assets.supersededAt"),
    columns: ["code", "title", "fileName", "replacesId"],
    title: (r) => r.title || r.fileName,
    sub: (r) => r.fileName,
    together: (r) => [["assets", (q) => q.whereIn("id", r.chain ?? [])]],
    load: async (db, r) => {
      // The versions it replaced, newest to oldest
      const chain = []
      let at = r.replacesId
      while (at && chain.length < 100) {
        chain.push(at)
        at = (await db("assets").where({ id: at }).first("replacesId"))?.replacesId
      }
      return { ...r, chain }
    },
    files: async (db, r) =>
      (
        await db("assets")
          .whereIn("id", [r.id, ...(r.chain ?? [])])
          .select("fileKey")
      )
        .map((a) => a.fileKey)
        .filter(Boolean),
    purge: async (trx, r) => {
      const all = [r.id, ...(r.chain ?? [])]
      await trx("shareLinkViews").whereIn("linkId", trx("shareLinks").whereIn("assetId", all).select("id")).delete()
      await trx("shareLinks").whereIn("assetId", all).delete()
      await trx("assets")
        .whereIn("id", r.chain ?? [])
        .delete()
    },
  },

  vendor: {
    app: "finance",
    label: "Vendor",
    group: "Finance",
    icon: "store-2-line",
    table: "vendors",
    columns: ["code", "name"],
    title: (r) => r.name,
    inUse: async (db, r) => ((await anyAt(db, "vouchers", { vendorId: r.id })) ? "Vouchers are posted against it. Deactivate it instead." : null),
    keeps: async (db, r) => ((await anyAt(db, "vouchers", { vendorId: r.id })) ? "Vouchers are posted against it, so it stays on record." : null),
  },

  dealer: {
    app: "users",
    label: "Dealer",
    group: "Users & Teams",
    icon: "handshake-line",
    table: "dealers",
    columns: ["code", "name", "city"],
    title: (r) => r.name,
    sub: (r) => r.city,
    keeps: async (db, r) => {
      for (const t of ["bookings", "commissionPayouts", "members"]) if (await anyAt(db, t, { dealerId: r.id })) return "Bookings, payouts or logins still name this dealer, so it stays on record."
      return null
    },
    purge: async (trx, r) => {
      await trx("units").where({ dealerId: r.id }).update({ dealerId: null })
    },
  },

  team: {
    app: "users",
    label: "Team",
    group: "Users & Teams",
    icon: "team-line",
    table: "teams",
    byId: true,
    columns: ["id", "name"],
    title: (r) => r.name,
    purge: async (trx, r) => {
      for (const t of ["employees", "leads", "members", "leadAssignmentRules", "salesAssignmentRules"]) await trx(t).where({ teamId: r.id }).update({ teamId: null })
    },
  },

  role: {
    app: "users",
    label: "Role",
    group: "Users & Teams",
    icon: "shield-user-line",
    table: "roles",
    columns: ["code", "name"],
    title: (r) => r.name,
    // Memberships live in the sign-in database, so the check is done there (see server/actions.js)
    membershipsCheck: true,
  },
}

export const KIND_LIST = Object.entries(KINDS).map(([kind, k]) => ({ kind, ...k }))
