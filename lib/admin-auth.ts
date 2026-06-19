import "server-only";

import { cookies } from "next/headers";
import { sessionCookie, verifySessionToken } from "./auth";

export async function isAdminRequest() {
  const cookieStore = await cookies();
  return verifySessionToken(cookieStore.get(sessionCookie.name)?.value)?.role === "admin";
}
