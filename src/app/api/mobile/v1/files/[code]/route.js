import { mobileRoute } from "@/modules/mobile/server/api"
import { serveAsset } from "@/server/assets/serve"

// GET /api/mobile/v1/files/<asset code> → the file itself (a lead activity's voice note…), with
// the same rules as the portal's /api/workspace/files (server/assets/serve.js). Byte ranges work,
// so audio can stream and seek. docs/mobile-api.md
export const GET = mobileRoute((request, access, { code }) => serveAsset(request, { userId: access.user.id, tenantId: access.tenant.id }, code))
