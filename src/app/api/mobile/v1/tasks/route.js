import { json, mobileRoute } from "@/modules/mobile/server/api"
import { deskContext } from "@/modules/desk/server/context"
import { myTasks } from "@/modules/desk/server/tasks"

// GET /api/mobile/v1/tasks: everything that needs this person, from every app
// → { tasks: [{ id, app, icon, title, detail, href, critical }] }. docs/mobile-api.md
export const GET = mobileRoute(async () => json({ tasks: await myTasks(await deskContext("/")) }))
