import "server-only";

import { cookies } from "next/headers";
import { sessionCookie, verifySessionToken } from "./auth";

export async function currentUser() {
  const cookieStore = await cookies();
  return verifySessionToken(cookieStore.get(sessionCookie.name)?.value);
}
