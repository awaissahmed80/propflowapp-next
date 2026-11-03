import { json, minAppVersion, mobileRoute } from "@/modules/mobile/server/api"
import { userProfile, workspaceProfile } from "@/modules/mobile/server/profile"

// GET /api/mobile/v1/me: who is signed in, the workspace (role and the apps the phone may open)
// and this session. The app asks at start and when it comes back to the foreground.
// docs/mobile-api.md
export const GET = mobileRoute(async (request, access) => {
  const { session } = access
  return json({
    user: userProfile(access.user),
    workspace: await workspaceProfile(access),
    session: { id: session.id, deviceName: session.deviceName, platform: session.platform, appVersion: session.appVersion, expiresAt: new Date(session.expiresAt).toISOString() },
    minAppVersion: minAppVersion(),
  })
})
