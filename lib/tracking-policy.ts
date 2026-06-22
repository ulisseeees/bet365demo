export type TrackingProvider = "api-football" | "the-odds-api" | "odds-api-io";

export function providerTrackingInterval(provider: string) {
  if (provider === "api-football") return 180;
  if (provider === "odds-api-io") return 180;
  if (provider === "the-odds-api") return 300;
  return 300;
}
